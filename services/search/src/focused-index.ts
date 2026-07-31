import { createHash } from 'node:crypto';
import {
  FOCUSED_INDEX_ROUTE_ID,
  assertFocusedIndexRuntimeIdentity,
  createFocusedIndexDocument,
  freshnessAt,
  type FocusedIndexDocument,
  type FocusedIndexFreshnessState,
  canonicalizeSearchUrl,
  contentSimilarityBasisPoints,
  type RetrievalFetchResult,
  fetchRetrieval,
  type RetrievalFetchDependencies,
  validateRetrievalUrl,
} from '../../../packages/contracts/src/index.js';
import type { PersistedFocusedIndexAdapter } from '../../../adapters/search/src/meilisearch-focused-index.js';
import type { ScraplingExtraction, ScraplingFocusedWorker } from '../../../adapters/search/src/scrapling-focused-worker.js';

export interface FocusedIndexDomainPolicy {
  domain: string;
  contentUse: 'approved' | 'unresolved' | 'blocked';
  language: string;
}

export interface FocusedIndexRouteConfig {
  approvedDomains: readonly string[];
  explicitSeeds: readonly string[];
  policies: readonly FocusedIndexDomainPolicy[];
  denylist: readonly string[];
  maximumPages: number;
  maximumPagesPerDomain: number;
  maximumConcurrencyPerDomain: number;
  minimumDelayMsPerDomain: number;
  maximumFrontierItems: number;
  staleAfterMs: number;
  expireAfterMs: number;
  recrawlAfterMs: number;
  nearDuplicateThresholdBasisPoints: number;
}

export interface FocusedIndexFrontierItem {
  url: string;
  domain: string;
  source: 'explicit_seed' | 'sitemap' | 'rss' | 'atom' | 'page_link';
  status: 'pending' | 'fetching' | 'completed' | 'rejected' | 'removed';
  attempts: number;
  enqueuedAt: string;
  lastAttemptAt?: string;
  rejectionCode?: string;
}

export interface FocusedIndexFrontierState {
  schemaVersion: 'clervo.focused-index.frontier.v1';
  routeId: typeof FOCUSED_INDEX_ROUTE_ID;
  revision: number;
  status: 'running' | 'paused' | 'complete';
  totalFetched: number;
  domainFetched: Readonly<Record<string, number>>;
  domainActive: Readonly<Record<string, number>>;
  nextAllowedAt: Readonly<Record<string, string>>;
  items: readonly Readonly<FocusedIndexFrontierItem>[];
  checksum: string;
}

export interface FocusedIndexFrontierSnapshot {
  state: FocusedIndexFrontierState;
  serialized: string;
}

export interface FocusedIndexBoundaryFetch {
  (url: string): Promise<Readonly<RetrievalFetchResult>>;
}

export interface FocusedIndexRouteDependencies {
  fetch: FocusedIndexBoundaryFetch;
  worker: ScraplingFocusedWorker;
  index: PersistedFocusedIndexAdapter;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  maximumBytes?: number;
  deadlineMs?: number;
  userAgent?: string;
}

export interface FocusedIndexBoundaryFetchOptions {
  maximumBytes: number;
  deadlineMs: number;
  userAgent: string;
  providerAllowedContentUse?: readonly ('search_metadata' | 'transient_extraction' | 'retained_evidence' | 'archive_replay')[];
  fetchDependencies?: RetrievalFetchDependencies;
}

export function createFocusedIndexBoundaryFetch(options: FocusedIndexBoundaryFetchOptions): FocusedIndexBoundaryFetch {
  if (!Number.isSafeInteger(options.maximumBytes) || options.maximumBytes < 1 || !Number.isSafeInteger(options.deadlineMs) || options.deadlineMs < 1
    || !/^[\x20-\x7e]{1,256}$/u.test(options.userAgent) || options.userAgent.trim() === '') throw new Error('invalid_focused_index_boundary_options');
  const providerAllowedContentUse = options.providerAllowedContentUse ?? ['search_metadata', 'retained_evidence'];
  return async (url) => {
    const now = options.fetchDependencies?.now ?? (() => new Date());
    const createdAt = now();
    const fetchId = `fetch_${createHash('sha256').update(canonicalizeSearchUrl(url)).digest('hex').slice(0, 32)}`;
    return fetchRetrieval({ fetchId, url, mode: 'retained_evidence', providerAllowedContentUse, maximumBytes: options.maximumBytes, deadlineAt: new Date(createdAt.getTime() + options.deadlineMs).toISOString(), userAgent: options.userAgent }, options.fetchDependencies);
  };
}

export interface FocusedIndexCrawlReport {
  outcome: 'complete' | 'paused' | 'unavailable';
  fetched: number;
  indexed: number;
  suppressedDuplicates: number;
  rejected: number;
  discovered: number;
  frontier: FocusedIndexFrontierSnapshot;
}

const frontierSchemaVersion = 'clervo.focused-index.frontier.v1' as const;

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid_${name}`);
  return parsed;
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) return Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)));
    return nested;
  });
}

function checksum(state: Omit<FocusedIndexFrontierState, 'checksum'>): string {
  return `sha256:${createHash('sha256').update(stable(state)).digest('hex')}`;
}

function domainOf(url: string): string {
  const parsed = new URL(url);
  return parsed.hostname.toLowerCase().replace(/\.$/u, '');
}

function freezeState(state: Omit<FocusedIndexFrontierState, 'checksum'>): Readonly<FocusedIndexFrontierState> {
  const items = Object.freeze(state.items.map((item) => Object.freeze({ ...item })));
  const result = Object.freeze({ ...state, items, checksum: checksum({ ...state, items }) });
  return result;
}

function normalizeDomain(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\.$/u, '');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(normalized)) throw new Error('invalid_focused_index_domain');
  return normalized;
}

function validateConfig(config: FocusedIndexRouteConfig): Readonly<FocusedIndexRouteConfig> {
  if (!Number.isSafeInteger(config.maximumPages) || config.maximumPages < 1 || !Number.isSafeInteger(config.maximumPagesPerDomain) || config.maximumPagesPerDomain < 1
    || !Number.isSafeInteger(config.maximumConcurrencyPerDomain) || config.maximumConcurrencyPerDomain < 1 || !Number.isSafeInteger(config.minimumDelayMsPerDomain) || config.minimumDelayMsPerDomain < 0
    || !Number.isSafeInteger(config.maximumFrontierItems) || config.maximumFrontierItems < 1 || !Number.isSafeInteger(config.staleAfterMs) || config.staleAfterMs < 1
    || !Number.isSafeInteger(config.expireAfterMs) || config.expireAfterMs <= config.staleAfterMs || !Number.isSafeInteger(config.recrawlAfterMs) || config.recrawlAfterMs < 1
    || !Number.isInteger(config.nearDuplicateThresholdBasisPoints) || config.nearDuplicateThresholdBasisPoints < 5_000 || config.nearDuplicateThresholdBasisPoints > 10_000) throw new Error('invalid_focused_index_limits');
  const approvedDomains = Object.freeze([...new Set(config.approvedDomains.map(normalizeDomain))].sort());
  const denylist = Object.freeze([...new Set(config.denylist.map(normalizeDomain))].sort());
  const policies = Object.freeze(config.policies.map((policy) => Object.freeze({ ...policy, domain: normalizeDomain(policy.domain), language: policy.language.toLowerCase() })));
  if (new Set(policies.map((policy) => policy.domain)).size !== policies.length || policies.some((policy) => !['approved', 'unresolved', 'blocked'].includes(policy.contentUse))) throw new Error('invalid_focused_index_policy');
  const explicitSeeds = Object.freeze([...new Set(config.explicitSeeds.map((seed) => canonicalizeSearchUrl(seed)))].sort());
  return Object.freeze({ ...config, approvedDomains, denylist, policies, explicitSeeds });
}

function policyFor(config: FocusedIndexRouteConfig, domain: string): FocusedIndexDomainPolicy | undefined {
  return config.policies.find((policy) => policy.domain === domain);
}

function admissible(config: FocusedIndexRouteConfig, url: string, explicit: boolean): string | undefined {
  const parsed = validateRetrievalUrl(url);
  if (parsed === undefined) return 'unsafe_url';
  const canonical = canonicalizeSearchUrl(parsed.href);
  const domain = domainOf(canonical);
  if (config.denylist.includes(domain)) return 'domain_denylisted';
  const policy = policyFor(config, domain);
  if (policy === undefined || policy.contentUse !== 'approved') return 'source_use_policy_unresolved';
  if (!config.approvedDomains.includes(domain) && !(explicit && config.explicitSeeds.includes(canonical))) return 'domain_not_approved';
  return undefined;
}

export function discoverFocusedLinks(body: Uint8Array, contentType: string, baseUrl: string): readonly string[] {
  const mime = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!['application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml'].includes(mime)) return Object.freeze([]);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
  if (text.length > 1_000_000) throw new Error('focused_index_discovery_too_large');
  const found = new Set<string>();
  const locPattern = /<(?:loc|link)\b[^>]*?(?:href\s*=\s*["']([^"']+)|>([^<]+))[^>]*>/giu;
  for (const match of text.matchAll(locPattern)) {
    const value = (match[1] ?? match[2] ?? '').trim();
    if (value === '') continue;
    try {
      const url = validateRetrievalUrl(new URL(value, baseUrl).href);
      if (url !== undefined) found.add(canonicalizeSearchUrl(url.href));
    } catch { /* malformed discovery is ignored deterministically */ }
  }
  return Object.freeze([...found].sort().slice(0, 1_000));
}

export class FocusedIndexFrontier {
  config: Readonly<FocusedIndexRouteConfig>;
  private stateValue: Readonly<FocusedIndexFrontierState>;

  constructor(configInput: FocusedIndexRouteConfig, now: string) {
    this.config = validateConfig(configInput);
    timestamp(now, 'focused_index_frontier_now');
    const items: FocusedIndexFrontierItem[] = [];
    for (const seed of this.config.explicitSeeds) {
      const rejectionCode = admissible(this.config, seed, true);
      if (rejectionCode !== undefined) throw new Error(rejectionCode);
      items.push({ url: seed, domain: domainOf(seed), source: 'explicit_seed', status: 'pending', attempts: 0, enqueuedAt: now });
    }
    this.stateValue = freezeState({ schemaVersion: frontierSchemaVersion, routeId: FOCUSED_INDEX_ROUTE_ID, revision: 0, status: 'running', totalFetched: 0, domainFetched: {}, domainActive: {}, nextAllowedAt: {}, items });
  }

  static restore(configInput: FocusedIndexRouteConfig, snapshot: string): FocusedIndexFrontier {
    const parsed = JSON.parse(snapshot) as FocusedIndexFrontierState;
    const frontier = Object.create(FocusedIndexFrontier.prototype) as FocusedIndexFrontier;
    frontier.config = validateConfig(configInput);
    if (parsed.schemaVersion !== frontierSchemaVersion || parsed.routeId !== FOCUSED_INDEX_ROUTE_ID || parsed.checksum !== checksum({ ...parsed, checksum: undefined } as never)) throw new Error('corrupted_focused_index_frontier');
    frontier.stateValue = Object.freeze({ ...parsed, items: Object.freeze(parsed.items.map((item) => Object.freeze({ ...item }))) });
    return frontier;
  }

  snapshot(): FocusedIndexFrontierSnapshot {
    const state = this.stateValue;
    return Object.freeze({ state, serialized: stable(state) });
  }

  get state(): Readonly<FocusedIndexFrontierState> { return this.stateValue; }
  pause(): void { this.stateValue = freezeState({ ...this.stateValue, status: 'paused', revision: this.stateValue.revision + 1, checksum: undefined } as never); }
  resume(): void { if (this.stateValue.status !== 'paused') throw new Error('focused_index_not_paused'); this.stateValue = freezeState({ ...this.stateValue, status: 'running', revision: this.stateValue.revision + 1, checksum: undefined } as never); }

  nextWakeAt(): string | undefined {
    return this.stateValue.items.filter((item) => item.status === 'pending').map((item) => this.stateValue.nextAllowedAt[item.domain]).filter((value): value is string => value !== undefined).sort()[0];
  }

  claim(now: string): FocusedIndexFrontierItem | undefined {
    const nowMs = timestamp(now, 'focused_index_claim_now');
    if (this.stateValue.status !== 'running' || this.stateValue.totalFetched >= this.config.maximumPages) return undefined;
    const candidate = this.stateValue.items.filter((item) => item.status === 'pending' && item.attempts < 1 && (this.stateValue.domainFetched[item.domain] ?? 0) < this.config.maximumPagesPerDomain && (this.stateValue.domainActive[item.domain] ?? 0) < this.config.maximumConcurrencyPerDomain && (this.stateValue.nextAllowedAt[item.domain] === undefined || timestamp(this.stateValue.nextAllowedAt[item.domain]!, 'focused_index_delay') <= nowMs)).sort((left, right) => left.url.localeCompare(right.url))[0];
    if (candidate === undefined) return undefined;
    const active = { ...this.stateValue.domainActive, [candidate.domain]: (this.stateValue.domainActive[candidate.domain] ?? 0) + 1 };
    const items = this.stateValue.items.map((item) => item.url === candidate.url ? { ...item, status: 'fetching' as const, attempts: item.attempts + 1, lastAttemptAt: now } : item);
    this.stateValue = freezeState({ ...this.stateValue, revision: this.stateValue.revision + 1, items, domainActive: active, checksum: undefined } as never);
    return items.find((item) => item.url === candidate.url) as FocusedIndexFrontierItem;
  }

  complete(url: string, now: string, outcome: 'succeeded' | 'rejected', rejectionCode?: string, discovered: readonly { url: string; source: FocusedIndexFrontierItem['source'] }[] = []): void {
    timestamp(now, 'focused_index_complete_now');
    const current = this.stateValue.items.find((item) => item.url === url && item.status === 'fetching');
    if (current === undefined) throw new Error('focused_index_frontier_item_not_fetching');
    const active = { ...this.stateValue.domainActive, [current.domain]: Math.max(0, (this.stateValue.domainActive[current.domain] ?? 1) - 1) };
    const fetched = outcome === 'succeeded' ? this.stateValue.totalFetched + 1 : this.stateValue.totalFetched;
    const domainFetched = { ...this.stateValue.domainFetched, [current.domain]: (this.stateValue.domainFetched[current.domain] ?? 0) + (outcome === 'succeeded' ? 1 : 0) };
    const nextAllowedAt = { ...this.stateValue.nextAllowedAt, [current.domain]: new Date(Date.parse(now) + this.config.minimumDelayMsPerDomain).toISOString() };
    const existing = new Set(this.stateValue.items.map((item) => item.url));
    const additions: FocusedIndexFrontierItem[] = [];
    for (const entry of [...discovered].sort((left, right) => left.url.localeCompare(right.url))) {
      const rejection = admissible(this.config, entry.url, false);
      const normalized = rejection === undefined ? canonicalizeSearchUrl(entry.url) : undefined;
      if (normalized !== undefined && !existing.has(normalized) && this.stateValue.items.length + additions.length < this.config.maximumFrontierItems) {
        existing.add(normalized);
        additions.push({ url: normalized, domain: domainOf(normalized), source: entry.source, status: 'pending', attempts: 0, enqueuedAt: now });
      }
    }
    const items = this.stateValue.items.map((item) => item.url === url ? { ...item, status: outcome === 'succeeded' ? 'completed' as const : 'rejected' as const, ...(rejectionCode === undefined ? {} : { rejectionCode }) } : item);
    const status = this.stateValue.status === 'paused' ? 'paused' : 'running';
    this.stateValue = freezeState({ ...this.stateValue, revision: this.stateValue.revision + 1, status, totalFetched: fetched, domainFetched, domainActive: active, nextAllowedAt, items: [...items, ...additions], checksum: undefined } as never);
  }

  removeDomain(domainInput: string): number {
    const domain = normalizeDomain(domainInput);
    const removed = this.stateValue.items.filter((item) => item.domain === domain && item.status !== 'removed').length;
    this.stateValue = freezeState({ ...this.stateValue, revision: this.stateValue.revision + 1, items: this.stateValue.items.map((item) => item.domain === domain ? { ...item, status: 'removed' as const } : item), checksum: undefined } as never);
    return removed;
  }

  recrawlDue(now: string): void {
    const nowMs = timestamp(now, 'focused_index_recrawl_now');
    const items = this.stateValue.items.map((item) => item.status === 'completed' && item.lastAttemptAt !== undefined && nowMs - timestamp(item.lastAttemptAt, 'focused_index_last_attempt') >= this.config.recrawlAfterMs ? { ...item, status: 'pending' as const, attempts: 0 } : item);
    this.stateValue = freezeState({ ...this.stateValue, revision: this.stateValue.revision + 1, items, checksum: undefined } as never);
  }
}

export function rankFocusedIndexDocuments(query: string, documents: readonly FocusedIndexDocument[], now: string, maxResults: number): readonly Readonly<FocusedIndexDocument>[] {
  if (query.trim().length < 1 || !Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) throw new Error('invalid_focused_index_query');
  const terms = query.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? [];
  return Object.freeze(documents.map((document) => ({ document, freshness: freshnessAt(document, now), score: terms.reduce((score, term) => score + (document.title.toLocaleLowerCase('en-US').includes(term) ? 2_000 : 0) + (document.content.toLocaleLowerCase('en-US').split(term).length - 1) * 100, 0) }))
    .filter((entry) => entry.freshness !== 'expired')
    .sort((left, right) => right.score - left.score || (left.freshness === 'fresh' ? -1 : 1) - (right.freshness === 'fresh' ? -1 : 1) || left.document.provenance.canonicalUrl.localeCompare(right.document.provenance.canonicalUrl) || left.document.documentId.localeCompare(right.document.documentId))
    .slice(0, maxResults).map((entry) => Object.freeze(entry.document)));
}

export class FocusedIndexRoute {
  readonly frontier: FocusedIndexFrontier;
  readonly config: Readonly<FocusedIndexRouteConfig>;
  readonly dependencies: FocusedIndexRouteDependencies;

  constructor(config: FocusedIndexRouteConfig, dependencies: FocusedIndexRouteDependencies, now = new Date().toISOString()) {
    if (dependencies.worker.workerId !== 'worker_scrapling_0_4_12' || dependencies.worker.version !== '0.4.12') throw new Error('scrapling_worker_identity_substitution');
    assertFocusedIndexRuntimeIdentity(dependencies.index.identity);
    this.config = validateConfig(config);
    this.dependencies = dependencies;
    this.frontier = new FocusedIndexFrontier(this.config, now);
  }

  async crawl(): Promise<Readonly<FocusedIndexCrawlReport>> {
    const now = this.dependencies.now ?? (() => new Date());
    const sleep = this.dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    let fetched = 0;
    let indexed = 0;
    let suppressedDuplicates = 0;
    let rejected = 0;
    let discovered = 0;
    let unavailable = false;
    const active = new Set<Promise<void>>();
    const process = async (item: FocusedIndexFrontierItem): Promise<void> => {
      const result = await this.dependencies.fetch(item.url);
      if (result.receipt.outcome !== 'succeeded' || result.body === undefined || result.receipt.finalUrl === undefined || result.receipt.contentType === undefined) {
        rejected += 1;
        this.frontier.complete(item.url, now().toISOString(), 'rejected', result.receipt.failureCode ?? 'focused_index_fetch_rejected');
        return;
      }
      fetched += 1;
      const mime = result.receipt.contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
      if (['application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml'].includes(mime)) {
        const links = discoverFocusedLinks(result.body, mime, result.receipt.finalUrl);
        discovered += links.length;
        this.frontier.complete(item.url, now().toISOString(), 'succeeded', undefined, links.map((url) => ({ url, source: mime.includes('rss') ? 'rss' as const : mime.includes('atom') ? 'atom' as const : 'sitemap' as const })));
        return;
      }
      let extraction: Readonly<ScraplingExtraction>;
      try { extraction = await this.dependencies.worker.extract(result.receipt, result.body); } catch {
        rejected += 1;
        this.frontier.complete(item.url, now().toISOString(), 'rejected', 'scrapling_worker_unavailable');
        return;
      }
      const canonicalUrl = extraction.canonicalUrl === undefined ? result.receipt.finalUrl : extraction.canonicalUrl;
      const policy = policyFor(this.config, domainOf(canonicalUrl));
      if (policy === undefined || policy.contentUse !== 'approved') {
        rejected += 1;
        this.frontier.complete(item.url, now().toISOString(), 'rejected', 'source_use_policy_unresolved');
        return;
      }
      const fetchedAt = result.receipt.completedAt;
      const document = createFocusedIndexDocument({ title: extraction.title, content: extraction.text, sourceUrl: item.url, canonicalUrl, mime, language: extraction.language, fetchedAt, staleAt: new Date(Date.parse(fetchedAt) + this.config.staleAfterMs).toISOString(), expiresAt: new Date(Date.parse(fetchedAt) + this.config.expireAfterMs).toISOString(), recrawlAt: new Date(Date.parse(fetchedAt) + this.config.recrawlAfterMs).toISOString() });
      let existing: readonly Readonly<FocusedIndexDocument>[];
      try { existing = await this.dependencies.index.listDocuments(); } catch {
        unavailable = true;
        rejected += 1;
        this.frontier.complete(item.url, now().toISOString(), 'rejected', 'focused_index_unavailable');
        return;
      }
      const duplicate = existing.find((candidate) => candidate.contentFingerprint === document.contentFingerprint || contentSimilarityBasisPoints(candidate.content, document.content) >= this.config.nearDuplicateThresholdBasisPoints);
      if (duplicate !== undefined) suppressedDuplicates += 1;
      else {
        try { await this.dependencies.index.upsert(document); indexed += 1; } catch {
          unavailable = true;
          rejected += 1;
          this.frontier.complete(item.url, now().toISOString(), 'rejected', 'focused_index_unavailable');
          return;
        }
      }
      const links = extraction.discoveredLinks.filter((link) => admissible(this.config, link, false) === undefined).map((url) => ({ url, source: 'page_link' as const }));
      discovered += links.length;
      this.frontier.complete(item.url, now().toISOString(), 'succeeded', undefined, links);
    };
    while (true) {
      let launched = false;
      while (active.size < this.config.maximumConcurrencyPerDomain * Math.max(1, this.config.approvedDomains.length)) {
        const item = this.frontier.claim(now().toISOString());
        if (item === undefined) break;
        launched = true;
        const task = process(item).finally(() => active.delete(task));
        active.add(task);
      }
      if (active.size > 0) { await Promise.race(active); continue; }
      if (!launched) {
        const wake = this.frontier.nextWakeAt();
        if (wake !== undefined) {
          const waitMs = Math.max(0, Date.parse(wake) - now().getTime());
          if (waitMs > 0) { await sleep(waitMs); continue; }
        }
        break;
      }
    }
    const status = this.frontier.state.status === 'paused' ? 'paused' : unavailable ? 'unavailable' : 'complete';
    return Object.freeze({ outcome: status, fetched, indexed, suppressedDuplicates, rejected, discovered, frontier: this.frontier.snapshot() });
  }

  async query(query: string, now = new Date().toISOString(), maxResults = 10): Promise<readonly Readonly<FocusedIndexDocument>[]> {
    const candidates = await this.dependencies.index.searchCandidates(query, Math.min(100, Math.max(maxResults, 20)));
    return rankFocusedIndexDocuments(query, candidates.map((candidate) => candidate.document), now, maxResults);
  }

  async deleteDomain(domain: string): Promise<number> {
    this.frontier.removeDomain(domain);
    return this.dependencies.index.deleteDomain(domain);
  }

  async rebuild(): Promise<void> {
    const documents = (await this.dependencies.index.listDocuments()).filter((document) => freshnessAt(document, (this.dependencies.now ?? (() => new Date()))().toISOString()) !== 'expired');
    await this.dependencies.index.rebuild(documents);
  }
}
