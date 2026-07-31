import { createHash } from 'node:crypto';
import {
  canonicalizeSearchUrl,
  searchRetrievalSecurityPolicy,
  type RetrievalRouteId,
} from '../../../packages/contracts/src/index.js';

export const retrievalCacheSchemaVersion = 'clervo.retrieval-cache.v1' as const;

export interface RetrievalCacheRequestIdentity {
  routeId: RetrievalRouteId;
  url: string;
  requestPolicySha256: string;
}

export interface RetrievalCacheSafetyDeclaration {
  containsSecret: false;
  containsWallet: false;
  containsCustomerPayload: false;
  containsUnsafeBrowserState: false;
}

export interface RetrievalCacheWrite extends RetrievalCacheRequestIdentity {
  fetchedAt: string;
  expiresAt: string;
  contentType: string;
  body: Uint8Array;
  safety: Readonly<RetrievalCacheSafetyDeclaration>;
}

export interface RetrievalCacheRecord {
  schemaVersion: typeof retrievalCacheSchemaVersion;
  environmentNamespace: string;
  cacheKey: string;
  routeId: RetrievalRouteId;
  normalizedUrl: string;
  requestPolicySha256: string;
  fetchedAt: string;
  expiresAt: string;
  contentType: string;
  bodyBase64: string;
  bodySha256: string;
  safety: Readonly<RetrievalCacheSafetyDeclaration>;
  recordSha256: string;
}

export interface DurableRetrievalCacheStore {
  get(cacheKey: string): Promise<RetrievalCacheRecord | undefined>;
  put(record: Readonly<RetrievalCacheRecord>): Promise<void>;
  delete(cacheKey: string): Promise<void>;
  keys(): Promise<readonly string[]>;
}

export interface RetrievalCacheDisclosure {
  state: 'miss' | 'fresh' | 'stale_while_degraded';
  reason: 'not_found' | 'forced_refresh' | 'fresh_hit' | 'stale_disclosed' | 'expired' | 'poisoned' | 'denylisted';
  cacheKey: string;
  routeId: RetrievalRouteId;
  normalizedUrl: string;
  requestPolicySha256: string;
  observedAt: string;
  fetchedAt?: string;
  expiresAt?: string;
  ageSeconds?: number;
  staleWhileDegraded: boolean;
  bodySha256?: string;
}

export interface RetrievalCacheReadResult {
  disclosure: Readonly<RetrievalCacheDisclosure>;
  body?: Uint8Array;
  contentType?: string;
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => nested && typeof nested === 'object' && !Array.isArray(nested)
    ? Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)))
    : nested);
}

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid_${name}`);
  return parsed;
}

function normalizeIdentity(value: RetrievalCacheRequestIdentity): Readonly<RetrievalCacheRequestIdentity & { normalizedUrl: string }> {
  if (!['clervo.focused-index.v1', 'clervo.live-federation.v1'].includes(value.routeId)) throw new Error('invalid_retrieval_cache_route');
  if (!/^sha256:[a-f0-9]{64}$/u.test(value.requestPolicySha256) || value.requestPolicySha256 !== retrievalCachePolicySha256()) throw new Error('invalid_retrieval_cache_policy_hash');
  return Object.freeze({ ...value, normalizedUrl: canonicalizeSearchUrl(value.url) });
}

export function retrievalCachePolicySha256(): string {
  return sha256(stable(searchRetrievalSecurityPolicy));
}

export function retrievalCacheKey(value: RetrievalCacheRequestIdentity): string {
  const identity = normalizeIdentity(value);
  return sha256(stable({ schemaVersion: retrievalCacheSchemaVersion, routeId: identity.routeId, normalizedUrl: identity.normalizedUrl, requestPolicySha256: identity.requestPolicySha256 }));
}

function recordMaterial(record: Omit<RetrievalCacheRecord, 'recordSha256'>): string {
  return stable(record);
}

function verifyRecord(record: RetrievalCacheRecord, expectedNamespace: string, identity: ReturnType<typeof normalizeIdentity>, expectedKey: string): Uint8Array {
  if (record.schemaVersion !== retrievalCacheSchemaVersion || record.environmentNamespace !== expectedNamespace || record.cacheKey !== expectedKey
    || record.routeId !== identity.routeId || record.normalizedUrl !== identity.normalizedUrl || record.requestPolicySha256 !== identity.requestPolicySha256
    || !/^sha256:[a-f0-9]{64}$/u.test(record.bodySha256) || !/^sha256:[a-f0-9]{64}$/u.test(record.recordSha256)
    || record.safety.containsSecret !== false || record.safety.containsWallet !== false || record.safety.containsCustomerPayload !== false
    || record.safety.containsUnsafeBrowserState !== false) throw new Error('retrieval_cache_identity_or_safety_mismatch');
  timestamp(record.fetchedAt, 'retrieval_cache_fetched_at');
  if (timestamp(record.expiresAt, 'retrieval_cache_expires_at') <= Date.parse(record.fetchedAt)) throw new Error('retrieval_cache_invalid_expiry');
  const body = Buffer.from(record.bodyBase64, 'base64');
  if (body.toString('base64') !== record.bodyBase64 || sha256(body) !== record.bodySha256) throw new Error('retrieval_cache_body_poisoned');
  const { recordSha256: _checksum, ...material } = record;
  if (sha256(recordMaterial(material)) !== record.recordSha256) throw new Error('retrieval_cache_record_poisoned');
  return Uint8Array.from(body);
}

export class DurableRetrievalCache {
  private readonly denylist = new Set<string>();

  constructor(
    private readonly store: DurableRetrievalCacheStore,
    readonly environmentNamespace: string,
    readonly maximumBodyBytes = 4_194_304,
    readonly maximumStaleMs = 86_400_000,
  ) {
    if (!/^[a-z0-9][a-z0-9_-]{2,31}$/u.test(environmentNamespace) || !Number.isSafeInteger(maximumBodyBytes) || maximumBodyBytes < 1
      || !Number.isSafeInteger(maximumStaleMs) || maximumStaleMs < 0) throw new Error('invalid_durable_retrieval_cache_configuration');
  }

  async write(input: RetrievalCacheWrite): Promise<Readonly<RetrievalCacheRecord>> {
    const identity = normalizeIdentity(input);
    if (this.denylist.has(new URL(identity.normalizedUrl).hostname)) throw new Error('retrieval_cache_url_denylisted');
    if (!(input.body instanceof Uint8Array) || input.body.byteLength < 1 || input.body.byteLength > this.maximumBodyBytes
      || input.safety.containsSecret !== false || input.safety.containsWallet !== false || input.safety.containsCustomerPayload !== false
      || input.safety.containsUnsafeBrowserState !== false) throw new Error('retrieval_cache_unsafe_material');
    const fetchedMs = timestamp(input.fetchedAt, 'retrieval_cache_fetched_at');
    if (timestamp(input.expiresAt, 'retrieval_cache_expires_at') <= fetchedMs) throw new Error('retrieval_cache_invalid_expiry');
    if (!['text/html', 'text/plain', 'application/xhtml+xml', 'application/json', 'application/xml', 'text/xml'].includes(input.contentType)) throw new Error('retrieval_cache_content_type_not_allowed');
    const body = Uint8Array.from(input.body);
    const key = retrievalCacheKey(input);
    const material = {
      schemaVersion: retrievalCacheSchemaVersion,
      environmentNamespace: this.environmentNamespace,
      cacheKey: key,
      routeId: identity.routeId,
      normalizedUrl: identity.normalizedUrl,
      requestPolicySha256: identity.requestPolicySha256,
      fetchedAt: input.fetchedAt,
      expiresAt: input.expiresAt,
      contentType: input.contentType,
      bodyBase64: Buffer.from(body).toString('base64'),
      bodySha256: sha256(body),
      safety: Object.freeze({ ...input.safety }),
    } as const;
    const record = Object.freeze({ ...material, recordSha256: sha256(recordMaterial(material)) });
    await this.store.put(record);
    return record;
  }

  async read(input: RetrievalCacheRequestIdentity & Readonly<{ observedAt: string; forceRefresh?: boolean; upstreamDegraded?: boolean }>): Promise<Readonly<RetrievalCacheReadResult>> {
    const identity = normalizeIdentity(input);
    const observedMs = timestamp(input.observedAt, 'retrieval_cache_observed_at');
    const key = retrievalCacheKey(input);
    const common = { cacheKey: key, routeId: identity.routeId, normalizedUrl: identity.normalizedUrl, requestPolicySha256: identity.requestPolicySha256, observedAt: input.observedAt };
    if (this.denylist.has(new URL(identity.normalizedUrl).hostname)) return Object.freeze({ disclosure: Object.freeze({ ...common, state: 'miss', reason: 'denylisted', staleWhileDegraded: false }) });
    if (input.forceRefresh === true) return Object.freeze({ disclosure: Object.freeze({ ...common, state: 'miss', reason: 'forced_refresh', staleWhileDegraded: false }) });
    let record: RetrievalCacheRecord | undefined;
    try { record = await this.store.get(key); } catch {
      await this.store.delete(key);
      return Object.freeze({ disclosure: Object.freeze({ ...common, state: 'miss', reason: 'poisoned', staleWhileDegraded: false }) });
    }
    if (record === undefined) return Object.freeze({ disclosure: Object.freeze({ ...common, state: 'miss', reason: 'not_found', staleWhileDegraded: false }) });
    let body: Uint8Array;
    try { body = verifyRecord(record, this.environmentNamespace, identity, key); } catch {
      await this.store.delete(key);
      return Object.freeze({ disclosure: Object.freeze({ ...common, state: 'miss', reason: 'poisoned', staleWhileDegraded: false }) });
    }
    const fetchedMs = Date.parse(record.fetchedAt);
    const expiresMs = Date.parse(record.expiresAt);
    if (fetchedMs > observedMs) {
      await this.store.delete(key);
      return Object.freeze({ disclosure: Object.freeze({ ...common, state: 'miss', reason: 'poisoned', staleWhileDegraded: false }) });
    }
    const ageSeconds = Math.max(0, Math.floor((observedMs - fetchedMs) / 1_000));
    const details = { ...common, fetchedAt: record.fetchedAt, expiresAt: record.expiresAt, ageSeconds, bodySha256: record.bodySha256 };
    if (observedMs < expiresMs) return Object.freeze({ disclosure: Object.freeze({ ...details, state: 'fresh', reason: 'fresh_hit', staleWhileDegraded: false }), body, contentType: record.contentType });
    if (input.upstreamDegraded === true && observedMs - expiresMs <= this.maximumStaleMs) return Object.freeze({ disclosure: Object.freeze({ ...details, state: 'stale_while_degraded', reason: 'stale_disclosed', staleWhileDegraded: true }), body, contentType: record.contentType });
    return Object.freeze({ disclosure: Object.freeze({ ...details, state: 'miss', reason: 'expired', staleWhileDegraded: false }) });
  }

  async evict(input: RetrievalCacheRequestIdentity): Promise<void> {
    await this.store.delete(retrievalCacheKey(input));
  }

  async invalidateUrl(url: string): Promise<number> {
    const normalized = canonicalizeSearchUrl(url);
    let removed = 0;
    for (const key of await this.store.keys()) {
      const record = await this.store.get(key);
      if (record?.normalizedUrl === normalized) { await this.store.delete(key); removed += 1; }
    }
    return removed;
  }

  async denyDomain(domain: string): Promise<number> {
    const normalized = domain.trim().toLowerCase().replace(/\.$/u, '');
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(normalized)) throw new Error('invalid_retrieval_cache_denylist_domain');
    this.denylist.add(normalized);
    let removed = 0;
    for (const key of await this.store.keys()) {
      const record = await this.store.get(key);
      if (record !== undefined && new URL(record.normalizedUrl).hostname === normalized) { await this.store.delete(key); removed += 1; }
    }
    return removed;
  }
}
