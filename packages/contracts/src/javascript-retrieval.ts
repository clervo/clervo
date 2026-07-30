import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { CONTRACT_VERSION } from './types.js';
import { isForbiddenRetrievalAddress, validateRetrievalUrl } from './retrieval.js';
import type { RetrievalFetchReceipt } from './retrieval-fetch.js';

const maximumRenderWindowMs = 30_000;
const maximumRenderedBytesLimit = 2 * 1024 * 1024;
const maximumNetworkBytesLimit = 16 * 1024 * 1024;
const maximumRequestCountLimit = 64;
const maximumPreflightAgeMs = 60_000;
const allowedContentTypes = new Set(['text/html', 'application/xhtml+xml']);
const allowedResourceTypes = new Set(['document', 'stylesheet', 'script', 'image', 'font', 'xhr', 'fetch', 'other']);

export const javascriptRetrievalPolicyId = 'isolated_same_origin_browser_v1' as const;

export interface JavaScriptNetworkAuthorizationInput {
  url: string;
  resourceType: 'document' | 'stylesheet' | 'script' | 'image' | 'font' | 'xhr' | 'fetch' | 'other';
}

export interface JavaScriptNetworkAuthorization {
  url: string;
  resourceType: JavaScriptNetworkAuthorizationInput['resourceType'];
  resolvedAddresses: readonly string[];
}

export interface JavaScriptNetworkReceipt extends JavaScriptNetworkAuthorization {
  connectedAddress: string;
  status: number;
  transferredBytes: number;
}

export interface JavaScriptIsolationAttestation {
  runtime: 'browser_process';
  lifecycle: 'disposable_per_render';
  sandboxed: true;
  storage: 'ephemeral';
  serviceWorkers: 'blocked';
  downloads: 'blocked';
  permissions: 'denied';
  networkInterception: 'core_authorized_same_origin';
}

export interface JavaScriptRetrievalAdapterRequest {
  renderId: string;
  url: string;
  deadlineAt: string;
  userAgent: string;
  signal: AbortSignal;
  policy: {
    policyId: typeof javascriptRetrievalPolicyId;
    javaScriptEnabled: true;
    sameOriginRequestsOnly: true;
    maximumRequestCount: number;
    maximumNetworkBytes: number;
    maximumRenderedBytes: number;
  };
  authorizeRequest(input: Readonly<JavaScriptNetworkAuthorizationInput>): Promise<Readonly<JavaScriptNetworkAuthorization>>;
}

export interface JavaScriptRetrievalAdapterResponse {
  finalUrl: string;
  status: number;
  contentType: 'text/html' | 'application/xhtml+xml';
  body: Uint8Array;
  requests: readonly Readonly<JavaScriptNetworkReceipt>[];
  isolation: Readonly<JavaScriptIsolationAttestation>;
}

export interface JavaScriptRetrievalAdapter {
  render(request: Readonly<JavaScriptRetrievalAdapterRequest>): Promise<JavaScriptRetrievalAdapterResponse>;
}

export interface JavaScriptRetrievalRequest {
  renderId: string;
  preflightReceipt: RetrievalFetchReceipt;
  createdAt: string;
  deadlineAt: string;
  userAgent: string;
  maximumRequestCount: number;
  maximumNetworkBytes: number;
  maximumRenderedBytes: number;
  signal?: AbortSignal;
}

export interface JavaScriptRetrievalReceipt {
  contractVersion: typeof CONTRACT_VERSION;
  renderId: string;
  preflightFetchId: string;
  preflightBodySha256: string;
  requestedUrl: string;
  startedAt: string;
  completedAt: string;
  deadlineAt: string;
  policyId: typeof javascriptRetrievalPolicyId;
  outcome: 'succeeded' | 'rejected';
  invocation: 'succeeded' | 'failed' | 'deadline_exceeded' | 'cancelled' | 'output_rejected';
  failureCode?: 'adapter_failed' | 'deadline_exceeded' | 'caller_cancelled' | 'invalid_renderer_output';
  finalUrl?: string;
  contentType?: 'text/html' | 'application/xhtml+xml';
  contentLengthBytes?: number;
  bodySha256?: string;
  requestCount?: number;
  networkBytes?: number;
  requests: readonly Readonly<JavaScriptNetworkReceipt>[];
  isolation?: Readonly<JavaScriptIsolationAttestation>;
}

export interface JavaScriptRetrievalResult {
  receipt: Readonly<JavaScriptRetrievalReceipt>;
  body?: Uint8Array;
}

export interface JavaScriptRetrievalDependencies {
  adapter: JavaScriptRetrievalAdapter;
  resolve?: (hostname: string) => Promise<readonly string[]>;
  now?: () => string;
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

function normalizeUrl(value: string, name: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`invalid_${name}`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') throw new Error(`invalid_${name}`);
  return url;
}

function sha256(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function validatePreflight(request: JavaScriptRetrievalRequest): { url: URL; bodySha256: string } {
  const receipt = request.preflightReceipt;
  if (receipt.contractVersion !== CONTRACT_VERSION || receipt.outcome !== 'succeeded' || receipt.finalUrl === undefined
    || receipt.bodySha256 === undefined || receipt.contentType === undefined || receipt.contentLengthBytes === undefined) throw new Error('javascript_retrieval_requires_successful_preflight');
  if (!/^fetch_[A-Za-z0-9]{20,64}$/u.test(receipt.fetchId) || !/^sha256:[a-f0-9]{64}$/u.test(receipt.bodySha256)) throw new Error('invalid_javascript_retrieval_preflight');
  if (!allowedContentTypes.has(receipt.contentType) || receipt.contentLengthBytes < 1) throw new Error('javascript_retrieval_preflight_content_not_renderable');
  if (!receipt.hops.some((hop) => hop.kind === 'content' && hop.url === receipt.finalUrl && hop.status >= 200 && hop.status < 300)) throw new Error('invalid_javascript_retrieval_preflight');
  if (receipt.robots.at(-1)?.status !== 'allowed') throw new Error('javascript_retrieval_requires_robots_allowance');
  const createdMs = timestamp(request.createdAt, 'javascript_retrieval_created_at');
  const completedMs = timestamp(receipt.completedAt, 'javascript_retrieval_preflight_completed_at');
  if (completedMs > createdMs || createdMs - completedMs > maximumPreflightAgeMs) throw new Error('javascript_retrieval_preflight_stale');
  return { url: normalizeUrl(receipt.finalUrl, 'javascript_retrieval_preflight_url'), bodySha256: receipt.bodySha256 };
}

function validateRequest(request: JavaScriptRetrievalRequest): void {
  if (!/^render_[A-Za-z0-9]{20,64}$/u.test(request.renderId)) throw new Error('invalid_javascript_retrieval_id');
  if (!/^[\x20-\x7e]{1,256}$/u.test(request.userAgent) || request.userAgent.trim() === '') throw new Error('invalid_javascript_retrieval_user_agent');
  const createdMs = timestamp(request.createdAt, 'javascript_retrieval_created_at');
  const deadlineMs = timestamp(request.deadlineAt, 'javascript_retrieval_deadline_at');
  if (deadlineMs <= createdMs || deadlineMs - createdMs > maximumRenderWindowMs) throw new Error('invalid_javascript_retrieval_deadline');
  if (!Number.isSafeInteger(request.maximumRequestCount) || request.maximumRequestCount < 1 || request.maximumRequestCount > maximumRequestCountLimit) throw new Error('invalid_javascript_retrieval_request_limit');
  if (!Number.isSafeInteger(request.maximumNetworkBytes) || request.maximumNetworkBytes < 1 || request.maximumNetworkBytes > maximumNetworkBytesLimit) throw new Error('invalid_javascript_retrieval_network_limit');
  if (!Number.isSafeInteger(request.maximumRenderedBytes) || request.maximumRenderedBytes < 1 || request.maximumRenderedBytes > maximumRenderedBytesLimit) throw new Error('invalid_javascript_retrieval_output_limit');
}

function freezeIsolation(value: JavaScriptIsolationAttestation): Readonly<JavaScriptIsolationAttestation> {
  return Object.freeze({ ...value });
}

function freezeRequests(values: readonly JavaScriptNetworkReceipt[]): readonly Readonly<JavaScriptNetworkReceipt>[] {
  return Object.freeze(values.map((value) => Object.freeze({ ...value, resolvedAddresses: Object.freeze([...value.resolvedAddresses]) })));
}

function freezeReceipt(receipt: JavaScriptRetrievalReceipt): Readonly<JavaScriptRetrievalReceipt> {
  return Object.freeze({ ...receipt, requests: freezeRequests(receipt.requests), ...(receipt.isolation === undefined ? {} : { isolation: freezeIsolation(receipt.isolation) }) });
}

function failureReceipt(request: JavaScriptRetrievalRequest, preflightBodySha256: string, startedAt: string, completedAt: string, invocation: JavaScriptRetrievalReceipt['invocation'], failureCode: NonNullable<JavaScriptRetrievalReceipt['failureCode']>): Readonly<JavaScriptRetrievalReceipt> {
  return freezeReceipt({ contractVersion: CONTRACT_VERSION, renderId: request.renderId, preflightFetchId: request.preflightReceipt.fetchId, preflightBodySha256, requestedUrl: request.preflightReceipt.finalUrl!, startedAt, completedAt, deadlineAt: request.deadlineAt, policyId: javascriptRetrievalPolicyId, outcome: 'rejected', invocation, failureCode, requests: [] });
}

function validateIsolation(value: JavaScriptIsolationAttestation): void {
  if (value.runtime !== 'browser_process' || value.lifecycle !== 'disposable_per_render' || value.sandboxed !== true
    || value.storage !== 'ephemeral' || value.serviceWorkers !== 'blocked' || value.downloads !== 'blocked'
    || value.permissions !== 'denied' || value.networkInterception !== 'core_authorized_same_origin') throw new Error('invalid_isolation_attestation');
}

function validateResponse(response: JavaScriptRetrievalAdapterResponse, request: JavaScriptRetrievalRequest, origin: string, authorizations: readonly JavaScriptNetworkAuthorization[]): { body: Uint8Array; receiptValues: Pick<JavaScriptRetrievalReceipt, 'finalUrl' | 'contentType' | 'contentLengthBytes' | 'bodySha256' | 'requestCount' | 'networkBytes' | 'requests' | 'isolation'> } {
  const finalUrl = normalizeUrl(response.finalUrl, 'javascript_retrieval_final_url');
  if (finalUrl.origin !== origin || response.status < 200 || response.status >= 300 || !allowedContentTypes.has(response.contentType)) throw new Error('invalid_renderer_output');
  if (!(response.body instanceof Uint8Array) || response.body.byteLength < 1 || response.body.byteLength > request.maximumRenderedBytes) throw new Error('invalid_renderer_output');
  if (!Array.isArray(response.requests) || response.requests.length < 1 || response.requests.length > request.maximumRequestCount || response.requests.length !== authorizations.length) throw new Error('invalid_renderer_output');
  let networkBytes = 0;
  const requests = response.requests.map((entry, index): JavaScriptNetworkReceipt => {
    const authorized = authorizations[index];
    if (authorized === undefined || entry.url !== authorized.url || entry.resourceType !== authorized.resourceType
      || !allowedResourceTypes.has(entry.resourceType) || entry.resolvedAddresses.length !== authorized.resolvedAddresses.length
      || entry.resolvedAddresses.some((address: string, addressIndex: number) => normalizeAddress(address) !== normalizeAddress(authorized.resolvedAddresses[addressIndex]!))) throw new Error('invalid_renderer_output');
    const connectedAddress = normalizeAddress(entry.connectedAddress);
    if (!authorized.resolvedAddresses.some((address) => normalizeAddress(address) === connectedAddress) || isForbiddenRetrievalAddress(connectedAddress)) throw new Error('invalid_renderer_output');
    if (!Number.isInteger(entry.status) || entry.status < 100 || entry.status > 599 || !Number.isSafeInteger(entry.transferredBytes) || entry.transferredBytes < 0) throw new Error('invalid_renderer_output');
    networkBytes += entry.transferredBytes;
    return { ...entry, connectedAddress, resolvedAddresses: [...authorized.resolvedAddresses] };
  });
  if (networkBytes > request.maximumNetworkBytes) throw new Error('invalid_renderer_output');
  validateIsolation(response.isolation);
  const body = Uint8Array.from(response.body);
  return { body, receiptValues: { finalUrl: finalUrl.href, contentType: response.contentType, contentLengthBytes: body.byteLength, bodySha256: sha256(body), requestCount: requests.length, networkBytes, requests, isolation: response.isolation } };
}

export async function retrieveJavaScriptRendered(request: JavaScriptRetrievalRequest, dependencies: JavaScriptRetrievalDependencies): Promise<JavaScriptRetrievalResult> {
  validateRequest(request);
  const preflight = validatePreflight(request);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  if (timestamp(startedAt, 'javascript_retrieval_now') >= Date.parse(request.deadlineAt)) return { receipt: failureReceipt(request, preflight.bodySha256, startedAt, startedAt, 'deadline_exceeded', 'deadline_exceeded') };
  if (request.signal?.aborted === true) return { receipt: failureReceipt(request, preflight.bodySha256, startedAt, startedAt, 'cancelled', 'caller_cancelled') };
  const resolve = dependencies.resolve ?? (async (hostname: string) => (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address));
  const authorizations: JavaScriptNetworkAuthorization[] = [];
  let authorizationAttempts = 0;
  const controller = new AbortController();
  let rejectCancellation: ((reason: Error) => void) | undefined;
  const cancellationPromise = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
  const cancel = () => { controller.abort(); rejectCancellation?.(new Error('caller_cancelled')); };
  request.signal?.addEventListener('abort', cancel, { once: true });
  let timeout: NodeJS.Timeout | undefined;
  try {
    const authorizeRequest = async (input: Readonly<JavaScriptNetworkAuthorizationInput>): Promise<Readonly<JavaScriptNetworkAuthorization>> => {
      if (controller.signal.aborted) throw new Error('request_cancelled');
      authorizationAttempts += 1;
      if (authorizationAttempts > request.maximumRequestCount || !allowedResourceTypes.has(input.resourceType)) throw new Error('request_not_authorized');
      const url = normalizeUrl(input.url, 'javascript_retrieval_request_url');
      if (url.origin !== preflight.url.origin) throw new Error('request_not_authorized');
      if (validateRetrievalUrl(url.href) === undefined) throw new Error('request_not_authorized');
      const addresses = [...new Set((await resolve(url.hostname)).map(normalizeAddress))].sort();
      if (addresses.length < 1 || addresses.some(isForbiddenRetrievalAddress)) throw new Error('request_not_authorized');
      const authorization = Object.freeze({ url: url.href, resourceType: input.resourceType, resolvedAddresses: Object.freeze(addresses) });
      authorizations.push(authorization);
      return authorization;
    };
    const remaining = Math.max(0, Date.parse(request.deadlineAt) - Date.parse(now()));
    const timeoutPromise = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('deadline_exceeded')); }, remaining); });
    const adapterRequest = Object.freeze({ renderId: request.renderId, url: preflight.url.href, deadlineAt: request.deadlineAt, userAgent: request.userAgent, signal: controller.signal, policy: Object.freeze({ policyId: javascriptRetrievalPolicyId, javaScriptEnabled: true as const, sameOriginRequestsOnly: true as const, maximumRequestCount: request.maximumRequestCount, maximumNetworkBytes: request.maximumNetworkBytes, maximumRenderedBytes: request.maximumRenderedBytes }), authorizeRequest });
    const response = await Promise.race([dependencies.adapter.render(adapterRequest), timeoutPromise, cancellationPromise]);
    const completedAt = now();
    if (controller.signal.aborted && Date.parse(completedAt) < Date.parse(request.deadlineAt)) return { receipt: failureReceipt(request, preflight.bodySha256, startedAt, completedAt, 'cancelled', 'caller_cancelled') };
    let validated;
    try { validated = validateResponse(response, request, preflight.url.origin, authorizations); } catch { return { receipt: failureReceipt(request, preflight.bodySha256, startedAt, completedAt, 'output_rejected', 'invalid_renderer_output') }; }
    return {
      receipt: freezeReceipt({ contractVersion: CONTRACT_VERSION, renderId: request.renderId, preflightFetchId: request.preflightReceipt.fetchId, preflightBodySha256: preflight.bodySha256, requestedUrl: preflight.url.href, startedAt, completedAt, deadlineAt: request.deadlineAt, policyId: javascriptRetrievalPolicyId, outcome: 'succeeded', invocation: 'succeeded', ...validated.receiptValues }),
      body: validated.body,
    };
  } catch (error) {
    const completedAt = now();
    if (error instanceof Error && error.message === 'caller_cancelled') return { receipt: failureReceipt(request, preflight.bodySha256, startedAt, completedAt, 'cancelled', 'caller_cancelled') };
    if (error instanceof Error && error.message === 'deadline_exceeded') return { receipt: failureReceipt(request, preflight.bodySha256, startedAt, completedAt, 'deadline_exceeded', 'deadline_exceeded') };
    return { receipt: failureReceipt(request, preflight.bodySha256, startedAt, completedAt, 'failed', 'adapter_failed') };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    request.signal?.removeEventListener('abort', cancel);
  }
}