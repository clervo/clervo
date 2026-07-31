import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { CONTRACT_VERSION } from './types.js';
import {
  isForbiddenRetrievalAddress,
  validateRetrievalUrl,
  type RetrievalContentUseMode,
} from './retrieval.js';

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const allowedContentTypes = new Set(['text/html', 'text/plain', 'application/xhtml+xml', 'application/json', 'application/pdf', 'application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml']);
const maximumRedirects = 5;
const maximumRobotsBytes = 256 * 1024;
const maximumResponseBytes = 16 * 1024 * 1024;
const maximumRobotsTtlMs = 24 * 60 * 60 * 1000;

export interface RetrievalFetchRequest {
  fetchId: string;
  url: string;
  mode: RetrievalContentUseMode;
  providerAllowedContentUse: readonly RetrievalContentUseMode[];
  maximumBytes: number;
  deadlineAt: string;
  userAgent: string;
  robotsPolicy?: 'enforce' | 'not_applicable';
}

export interface RetrievalTransportRequest {
  url: URL;
  address: string;
  deadlineAt: string;
  headers: Readonly<Record<string, string>>;
}

export interface RetrievalTransportResponse {
  status: number;
  headers: Readonly<Record<string, string | undefined>>;
  remoteAddress: string;
  body: AsyncIterable<Uint8Array>;
  abort: () => void;
}

export interface RetrievalFetchDependencies {
  resolve?: (hostname: string) => Promise<readonly string[]>;
  request?: (request: RetrievalTransportRequest) => Promise<RetrievalTransportResponse>;
  now?: () => Date;
  robotsCache?: Map<string, RetrievalRobotsCacheEntry>;
  robotsTtlMs?: number;
}

export interface RetrievalFetchHopReceipt {
  kind: 'robots' | 'content';
  url: string;
  resolvedAddresses: readonly string[];
  connectedAddress: string;
  status: number;
}

export interface RetrievalRobotsReceipt {
  status: 'allowed' | 'disallowed' | 'unavailable' | 'not_applicable';
  cacheHit: boolean;
  robotsUrl?: string;
  fetchedAt?: string;
  expiresAt?: string;
}

export interface RetrievalFetchReceipt {
  contractVersion: typeof CONTRACT_VERSION;
  fetchId: string;
  outcome: 'succeeded' | 'rejected';
  requestedUrl: string;
  finalUrl?: string;
  startedAt: string;
  completedAt: string;
  hops: readonly Readonly<RetrievalFetchHopReceipt>[];
  robots: readonly Readonly<RetrievalRobotsReceipt>[];
  contentType?: string;
  contentLengthBytes?: number;
  bodySha256?: string;
  failureCode?: string;
}

export interface RetrievalFetchResult {
  receipt: Readonly<RetrievalFetchReceipt>;
  body?: Uint8Array;
}

export interface RetrievalRobotsCacheEntry {
  body: string;
  fetchedAt: string;
  expiresAt: string;
  robotsUrl: string;
}

class RetrievalBoundaryError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid_${name}`);
  return parsed;
}

function normalizeAddress(address: string): string {
  const lower = address.toLowerCase();
  return lower.startsWith('::ffff:') && isIP(lower.slice(7)) === 4 ? lower.slice(7) : lower;
}

async function defaultResolve(hostname: string): Promise<readonly string[]> {
  return (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
}

function defaultRequest(input: RetrievalTransportRequest): Promise<RetrievalTransportResponse> {
  return new Promise((resolve, reject) => {
    const remaining = timestamp(input.deadlineAt, 'retrieval_deadline') - Date.now();
    if (remaining <= 0) {
      reject(new RetrievalBoundaryError('deadline_exceeded'));
      return;
    }
    const client = input.url.protocol === 'https:' ? https : http;
    const request = client.request(input.url, {
      method: 'GET',
      headers: input.headers,
      lookup: (_hostname, options, callback) => {
        const family = isIP(input.address);
        if (typeof options === 'object' && options.all) callback(null, [{ address: input.address, family }]);
        else callback(null, input.address, family);
      },
    });
    const timer = setTimeout(() => request.destroy(new RetrievalBoundaryError('deadline_exceeded')), remaining);
    request.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.once('response', (response) => {
      const remoteAddress = response.socket.remoteAddress;
      if (remoteAddress === undefined || normalizeAddress(remoteAddress) !== normalizeAddress(input.address)) {
        const error = new RetrievalBoundaryError('connected_address_mismatch');
        response.destroy(error);
        reject(error);
        return;
      }
      response.once('close', () => clearTimeout(timer));
      const headers: Record<string, string | undefined> = {};
      for (const [name, value] of Object.entries(response.headers)) headers[name] = Array.isArray(value) ? value.join(', ') : value;
      resolve({
        status: response.statusCode ?? 0,
        headers,
        remoteAddress,
        body: response,
        abort: () => response.destroy(new RetrievalBoundaryError('response_aborted')),
      });
    });
    request.end();
  });
}

function header(response: RetrievalTransportResponse, name: string): string | undefined {
  return response.headers[name] ?? response.headers[name.toLowerCase()];
}

function validateResolvedAddresses(addresses: readonly string[]): readonly string[] {
  const unique = [...new Set(addresses.map(normalizeAddress))];
  if (unique.length === 0) throw new RetrievalBoundaryError('dns_resolution_missing');
  if (unique.some(isForbiddenRetrievalAddress)) throw new RetrievalBoundaryError('unsafe_resolved_address');
  return unique;
}

function ensureBeforeDeadline(deadlineMs: number, now: () => Date): void {
  if (now().getTime() >= deadlineMs) throw new RetrievalBoundaryError('deadline_exceeded');
}

async function awaitBeforeDeadline<T>(
  operation: Promise<T>,
  deadlineMs: number,
  now: () => Date,
  onLateResult?: (result: T) => void,
): Promise<T> {
  const remaining = deadlineMs - now().getTime();
  if (remaining <= 0) throw new RetrievalBoundaryError('deadline_exceeded');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  operation.then((result) => {
    if (timedOut) onLateResult?.(result);
  }).catch(() => undefined);
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new RetrievalBoundaryError('deadline_exceeded'));
        }, remaining);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readBoundedBody(response: RetrievalTransportResponse, maximumBytes: number, deadlineMs: number, now: () => Date): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const iterator = response.body[Symbol.asyncIterator]();
  try {
    while (true) {
      const remaining = deadlineMs - now().getTime();
      if (remaining <= 0) throw new RetrievalBoundaryError('deadline_exceeded');
      let timer: ReturnType<typeof setTimeout> | undefined;
      const next = await Promise.race([
        iterator.next(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new RetrievalBoundaryError('deadline_exceeded')), remaining);
        }),
      ]).finally(() => {
        if (timer !== undefined) clearTimeout(timer);
      });
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximumBytes) throw new RetrievalBoundaryError('response_too_large');
      chunks.push(next.value);
    }
  } catch (error) {
    response.abort();
    throw error;
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function redirectTarget(current: URL, response: RetrievalTransportResponse): URL | undefined {
  if (!redirectStatuses.has(response.status)) return undefined;
  const location = header(response, 'location');
  if (location === undefined) throw new RetrievalBoundaryError('redirect_location_missing');
  const target = new URL(location, current);
  if (validateRetrievalUrl(target.href) === undefined) throw new RetrievalBoundaryError('unsafe_redirect_url');
  return target;
}

async function requestWithRedirects(
  kind: 'robots' | 'content',
  initialUrl: URL,
  deadlineAt: string,
  headers: Readonly<Record<string, string>>,
  deadlineMs: number,
  now: () => Date,
  resolveHost: (hostname: string) => Promise<readonly string[]>,
  transport: (request: RetrievalTransportRequest) => Promise<RetrievalTransportResponse>,
  hopSink: RetrievalFetchHopReceipt[],
  beforeRequest?: (url: URL) => Promise<void>,
): Promise<{ response: RetrievalTransportResponse; url: URL; hops: RetrievalFetchHopReceipt[] }> {
  const hops: RetrievalFetchHopReceipt[] = [];
  let url = initialUrl;
  for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount += 1) {
    if (beforeRequest !== undefined) await awaitBeforeDeadline(beforeRequest(url), deadlineMs, now);
    const addresses = validateResolvedAddresses(await awaitBeforeDeadline(resolveHost(url.hostname), deadlineMs, now));
    const address = addresses[0]!;
    const response = await awaitBeforeDeadline(
      transport({ url, address, deadlineAt, headers }),
      deadlineMs,
      now,
      (lateResponse) => lateResponse.abort(),
    );
    if (normalizeAddress(response.remoteAddress) !== normalizeAddress(address)) {
      response.abort();
      throw new RetrievalBoundaryError('connected_address_mismatch');
    }
    const hop = { kind, url: url.href, resolvedAddresses: addresses, connectedAddress: normalizeAddress(response.remoteAddress), status: response.status } as const;
    hops.push(hop);
    hopSink.push(hop);
    const target = redirectTarget(url, response);
    if (target === undefined) return { response, url, hops };
    response.abort();
    if (redirectCount === maximumRedirects) throw new RetrievalBoundaryError('redirect_limit_exceeded');
    url = target;
  }
  throw new RetrievalBoundaryError('redirect_limit_exceeded');
}

function robotsPattern(pattern: string): RegExp {
  const endAnchored = pattern.endsWith('$');
  const source = (endAnchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^${}()|[\]\\]/gu, '\\$&')
    .replace(/\*/gu, '.*');
  return new RegExp(`^${source}${endAnchored ? '$' : ''}`, 'u');
}

function normalizeRobotsOctets(value: string): string {
  return value.replace(/%([a-fA-F0-9]{2})/gu, (encoded, hex: string) => {
    const character = String.fromCharCode(Number.parseInt(hex, 16));
    return /^[A-Za-z0-9._~-]$/u.test(character) ? character : encoded.toUpperCase();
  });
}

function robotsAllows(body: string, userAgent: string, target: URL): boolean {
  const agentToken = userAgent.toLowerCase().split(/[\s/]/u, 1)[0] ?? userAgent.toLowerCase();
  const groups: { agents: string[]; rules: { allow: boolean; pattern: string }[] }[] = [];
  let group: { agents: string[]; rules: { allow: boolean; pattern: string }[] } | undefined;
  for (const rawLine of body.split(/\r?\n/u).slice(0, 20_000)) {
    const line = rawLine.replace(/#.*$/u, '').trim();
    if (line === '') continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === 'user-agent') {
      if (group === undefined || group.rules.length > 0) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if ((field === 'allow' || field === 'disallow') && group !== undefined && value !== '') {
      group.rules.push({ allow: field === 'allow', pattern: value });
    }
  }
  const exactMatches = groups.map((candidate) => ({
    candidate,
    specificity: Math.max(0, ...candidate.agents.filter((agent) => agent !== '*' && agentToken.includes(agent)).map((agent) => agent.length)),
  })).filter((match) => match.specificity > 0);
  const maximumSpecificity = Math.max(0, ...exactMatches.map((match) => match.specificity));
  const applicable = maximumSpecificity > 0
    ? exactMatches.filter((match) => match.specificity === maximumSpecificity).map((match) => match.candidate)
    : groups.filter((candidate) => candidate.agents.includes('*'));
  const path = normalizeRobotsOctets(`${target.pathname}${target.search}`);
  const matches = applicable.flatMap((candidate) => candidate.rules).map((rule) => ({
    ...rule,
    normalizedPattern: normalizeRobotsOctets(rule.pattern),
  })).filter((rule) => robotsPattern(rule.normalizedPattern).test(path));
  matches.sort((left, right) => right.normalizedPattern.length - left.normalizedPattern.length || Number(right.allow) - Number(left.allow));
  return matches[0]?.allow ?? true;
}

function freezeReceipt(receipt: RetrievalFetchReceipt): Readonly<RetrievalFetchReceipt> {
  const hops = Object.freeze(receipt.hops.map((hop) => Object.freeze({ ...hop, resolvedAddresses: Object.freeze([...hop.resolvedAddresses]) })));
  const robots = Object.freeze(receipt.robots.map((entry) => Object.freeze({ ...entry })));
  return Object.freeze({ ...receipt, hops, robots });
}

function failureCode(error: unknown): string {
  if (error instanceof RetrievalBoundaryError) return error.code;
  if (error instanceof Error && /^invalid_/u.test(error.message)) return error.message;
  return 'retrieval_transport_failed';
}

export async function fetchRetrieval(request: RetrievalFetchRequest, dependencies: RetrievalFetchDependencies = {}): Promise<RetrievalFetchResult> {
  if (!/^fetch_[A-Za-z0-9]{20,64}$/u.test(request.fetchId)) throw new Error('invalid_retrieval_fetch_id');
  if (!Number.isSafeInteger(request.maximumBytes) || request.maximumBytes < 1 || request.maximumBytes > maximumResponseBytes) throw new Error('invalid_retrieval_maximum_bytes');
  if (!/^[\x20-\x7e]{1,256}$/u.test(request.userAgent) || request.userAgent.trim() === '') throw new Error('invalid_retrieval_user_agent');
  const robotsTtlMs = dependencies.robotsTtlMs ?? 3_600_000;
  if (!Number.isSafeInteger(robotsTtlMs) || robotsTtlMs < 1_000 || robotsTtlMs > maximumRobotsTtlMs) throw new Error('invalid_robots_ttl');
  const deadlineMs = timestamp(request.deadlineAt, 'retrieval_deadline');
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const startedMs = now().getTime();
  if (deadlineMs <= startedMs) throw new Error('invalid_retrieval_deadline');
  const initialUrl = validateRetrievalUrl(request.url);
  const hops: RetrievalFetchHopReceipt[] = [];
  const robotsNotApplicable = request.robotsPolicy === 'not_applicable';
  const robots: RetrievalRobotsReceipt[] = robotsNotApplicable ? [{ status: 'not_applicable', cacheHit: false }] : [];
  let finalUrl: string | undefined;
  let response: RetrievalTransportResponse | undefined;
  try {
    if (initialUrl === undefined) throw new RetrievalBoundaryError('unsafe_url');
    if (!request.providerAllowedContentUse.includes(request.mode)) throw new RetrievalBoundaryError('content_use_not_allowed');
    if (robotsNotApplicable && request.mode !== 'archive_replay') throw new RetrievalBoundaryError('robots_not_applicable_for_mode');
    const resolveHost = dependencies.resolve ?? defaultResolve;
    const transport = dependencies.request ?? defaultRequest;
    const cache = dependencies.robotsCache ?? new Map<string, RetrievalRobotsCacheEntry>();
    const checkRobots = async (target: URL): Promise<void> => {
      if (robotsNotApplicable) return;
      const cacheKey = `${target.origin}|${request.userAgent.toLowerCase()}`;
      let entry = cache.get(cacheKey);
      let cacheHit = entry !== undefined && timestamp(entry.expiresAt, 'robots_expiry') > startedMs;
      if (!cacheHit) {
        const robotsUrl = new URL('/robots.txt', target.origin);
        const robotsFetch = await requestWithRedirects('robots', robotsUrl, request.deadlineAt, { accept: 'text/plain', 'user-agent': request.userAgent }, deadlineMs, now, resolveHost, transport, hops);
        if (robotsFetch.response.status < 200 || robotsFetch.response.status >= 300) {
          robotsFetch.response.abort();
          robots.push({ status: 'unavailable', cacheHit: false, robotsUrl: robotsFetch.url.href });
          throw new RetrievalBoundaryError('robots_unavailable');
        }
        const body = await readBoundedBody(robotsFetch.response, maximumRobotsBytes, deadlineMs, now);
        const fetchedAt = now().toISOString();
        const expiresAt = new Date(now().getTime() + robotsTtlMs).toISOString();
        entry = { body: new TextDecoder('utf-8', { fatal: true }).decode(body), fetchedAt, expiresAt, robotsUrl: robotsFetch.url.href };
        cache.set(cacheKey, entry);
        cacheHit = false;
      }
      const decision: RetrievalRobotsReceipt = {
        status: robotsAllows(entry!.body, request.userAgent, target) ? 'allowed' : 'disallowed',
        cacheHit,
        robotsUrl: entry!.robotsUrl,
        fetchedAt: entry!.fetchedAt,
        expiresAt: entry!.expiresAt,
      };
      robots.push(decision);
      if (decision.status === 'disallowed') throw new RetrievalBoundaryError('robots_disallowed');
    };
    const fetched = await requestWithRedirects('content', initialUrl, request.deadlineAt, { accept: [...allowedContentTypes].join(', '), 'user-agent': request.userAgent }, deadlineMs, now, resolveHost, transport, hops, checkRobots);
    response = fetched.response;
    finalUrl = fetched.url.href;
    if (response.status < 200 || response.status >= 300) throw new RetrievalBoundaryError('upstream_status_rejected');
    const contentType = header(response, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType === undefined || !allowedContentTypes.has(contentType)) throw new RetrievalBoundaryError('content_type_not_allowed');
    const declaredLength = header(response, 'content-length');
    if (declaredLength !== undefined) {
      const parsed = Number(declaredLength);
      if (!Number.isSafeInteger(parsed) || parsed < 0) throw new RetrievalBoundaryError('invalid_content_length');
      if (parsed > request.maximumBytes) throw new RetrievalBoundaryError('response_too_large');
    }
    const body = await readBoundedBody(response, request.maximumBytes, deadlineMs, now);
    ensureBeforeDeadline(deadlineMs, now);
    const bodySha256 = `sha256:${createHash('sha256').update(body).digest('hex')}`;
    ensureBeforeDeadline(deadlineMs, now);
    const completedAt = now().toISOString();
    const receipt = freezeReceipt({
      contractVersion: CONTRACT_VERSION,
      fetchId: request.fetchId,
      outcome: 'succeeded',
      requestedUrl: request.url,
      finalUrl,
      startedAt,
      completedAt,
      hops,
      robots,
      contentType,
      contentLengthBytes: body.byteLength,
      bodySha256,
    });
    return { receipt, body };
  } catch (error) {
    response?.abort();
    const receipt = freezeReceipt({
      contractVersion: CONTRACT_VERSION,
      fetchId: request.fetchId,
      outcome: 'rejected',
      requestedUrl: request.url,
      ...(finalUrl === undefined ? {} : { finalUrl }),
      startedAt,
      completedAt: now().toISOString(),
      hops,
      robots,
      failureCode: failureCode(error),
    });
    return { receipt };
  }
}
