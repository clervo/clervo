import { createHash } from 'node:crypto';
import { CONTRACT_VERSION } from './types.js';
import { canonicalizeSearchUrl } from './search.js';

export const FOCUSED_INDEX_ROUTE_ID = 'clervo.focused-index.v1' as const;
export const FOCUSED_INDEX_DOCUMENT_SCHEMA = 'clervo.focused-index.document.v1' as const;
export const FOCUSED_INDEX_PROVIDER_ID = 'provider_meilisearch_1_51_0' as const;
export const FOCUSED_INDEX_ADAPTER_ID = 'adapter_meilisearch_focused_1_51_0' as const;
export const FOCUSED_INDEX_HEALTH_IDENTITY = 'clervo.health.focused_index' as const;
export const FOCUSED_INDEX_CIRCUIT_IDENTITY = 'clervo.circuit.focused_index' as const;
export const FOCUSED_INDEX_FAILURE_DOMAIN = 'clervo.focused_index' as const;
export const SCRAPLING_WORKER_ID = 'worker_scrapling_0_4_12' as const;
export const SCRAPLING_VERSION = '0.4.12' as const;
export const MEILISEARCH_VERSION = '1.51.0' as const;

export type FocusedIndexFreshnessState = 'fresh' | 'stale' | 'expired';

export interface FocusedIndexProvenance {
  sourceUrl: string;
  canonicalUrl: string;
  domain: string;
  fetchedAt: string;
  contentHash: string;
  mime: string;
  language: string;
  freshnessState: FocusedIndexFreshnessState;
}

export interface FocusedIndexDocument {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof FOCUSED_INDEX_DOCUMENT_SCHEMA;
  routeId: typeof FOCUSED_INDEX_ROUTE_ID;
  documentId: string;
  providerId: typeof FOCUSED_INDEX_PROVIDER_ID;
  title: string;
  content: string;
  contentFingerprint: string;
  fetchedAt: string;
  staleAt: string;
  expiresAt: string;
  recrawlAt: string;
  provenance: FocusedIndexProvenance;
}

export interface FocusedIndexRuntimeIdentity {
  routeId: typeof FOCUSED_INDEX_ROUTE_ID;
  providerId: typeof FOCUSED_INDEX_PROVIDER_ID;
  adapterId: typeof FOCUSED_INDEX_ADAPTER_ID;
  healthIdentity: typeof FOCUSED_INDEX_HEALTH_IDENTITY;
  failureDomain: typeof FOCUSED_INDEX_FAILURE_DOMAIN;
  workerId: typeof SCRAPLING_WORKER_ID;
  scraplingVersion: typeof SCRAPLING_VERSION;
  meilisearchVersion: typeof MEILISEARCH_VERSION;
  providerApiCostUsdMicros: 0;
}

export const focusedIndexRuntimeIdentity: Readonly<FocusedIndexRuntimeIdentity> = Object.freeze({
  routeId: FOCUSED_INDEX_ROUTE_ID,
  providerId: FOCUSED_INDEX_PROVIDER_ID,
  adapterId: FOCUSED_INDEX_ADAPTER_ID,
  healthIdentity: FOCUSED_INDEX_HEALTH_IDENTITY,
  failureDomain: FOCUSED_INDEX_FAILURE_DOMAIN,
  workerId: SCRAPLING_WORKER_ID,
  scraplingVersion: SCRAPLING_VERSION,
  meilisearchVersion: MEILISEARCH_VERSION,
  providerApiCostUsdMicros: 0,
});

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid_${name}`);
  return parsed;
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function normalizeLanguage(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/u.test(normalized)) throw new Error('invalid_focused_index_language');
  return normalized;
}

export function freshnessAt(document: Pick<FocusedIndexDocument, 'staleAt' | 'expiresAt'>, now: string): FocusedIndexFreshnessState {
  const nowMs = timestamp(now, 'focused_index_now');
  const staleMs = timestamp(document.staleAt, 'focused_index_stale_at');
  const expiryMs = timestamp(document.expiresAt, 'focused_index_expires_at');
  if (staleMs >= expiryMs) throw new Error('invalid_focused_index_freshness_window');
  return nowMs >= expiryMs ? 'expired' : nowMs >= staleMs ? 'stale' : 'fresh';
}

export function createFocusedIndexDocument(input: Omit<FocusedIndexDocument, 'contractVersion' | 'schemaVersion' | 'routeId' | 'providerId' | 'documentId' | 'contentFingerprint' | 'provenance'> & {
  sourceUrl: string;
  canonicalUrl: string;
  mime: string;
  language: string;
}): Readonly<FocusedIndexDocument> {
  const sourceUrl = canonicalizeSearchUrl(input.sourceUrl);
  const canonicalUrl = canonicalizeSearchUrl(input.canonicalUrl);
  const domain = new URL(canonicalUrl).hostname.toLowerCase();
  const fetchedMs = timestamp(input.fetchedAt, 'focused_index_fetched_at');
  const staleMs = timestamp(input.staleAt, 'focused_index_stale_at');
  const expiryMs = timestamp(input.expiresAt, 'focused_index_expires_at');
  const recrawlMs = timestamp(input.recrawlAt, 'focused_index_recrawl_at');
  if (staleMs <= fetchedMs || expiryMs <= staleMs || recrawlMs <= fetchedMs || recrawlMs > expiryMs) throw new Error('invalid_focused_index_lifecycle_window');
  const title = input.title.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  const content = input.content.normalize('NFKC').replace(/\r\n?/gu, '\n').replace(/[\t\f\v ]+/gu, ' ').replace(/ *\n */gu, '\n').replace(/\n{3,}/gu, '\n\n').trim();
  if (title.length < 1 || title.length > 512 || content.length < 1 || content.length > 500_000) throw new Error('invalid_focused_index_content');
  const mime = input.mime.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!['text/html', 'text/plain', 'application/xhtml+xml'].includes(mime)) throw new Error('invalid_focused_index_mime');
  const language = normalizeLanguage(input.language);
  const contentHash = digest(content);
  const provenance = Object.freeze({
    sourceUrl,
    canonicalUrl,
    domain,
    fetchedAt: input.fetchedAt,
    contentHash,
    mime,
    language,
    freshnessState: 'fresh' as const,
  });
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    schemaVersion: FOCUSED_INDEX_DOCUMENT_SCHEMA,
    routeId: FOCUSED_INDEX_ROUTE_ID,
    documentId: `fid_${createHash('sha256').update(canonicalUrl).digest('hex')}`,
    providerId: FOCUSED_INDEX_PROVIDER_ID,
    title,
    content,
    contentFingerprint: contentHash,
    fetchedAt: input.fetchedAt,
    staleAt: input.staleAt,
    expiresAt: input.expiresAt,
    recrawlAt: input.recrawlAt,
    provenance,
  });
}

export function projectFocusedIndexFreshness(document: FocusedIndexDocument, now: string): Readonly<FocusedIndexDocument> {
  assertFocusedIndexDocument(document);
  return Object.freeze({
    ...document,
    provenance: Object.freeze({ ...document.provenance, freshnessState: freshnessAt(document, now) }),
  });
}

export function assertFocusedIndexDocument(document: FocusedIndexDocument): void {
  if (document.contractVersion !== CONTRACT_VERSION || document.schemaVersion !== FOCUSED_INDEX_DOCUMENT_SCHEMA
    || document.routeId !== FOCUSED_INDEX_ROUTE_ID || document.providerId !== FOCUSED_INDEX_PROVIDER_ID) throw new Error('focused_index_document_identity_substitution');
  const rebuilt = createFocusedIndexDocument({
    title: document.title,
    content: document.content,
    fetchedAt: document.fetchedAt,
    staleAt: document.staleAt,
    expiresAt: document.expiresAt,
    recrawlAt: document.recrawlAt,
    sourceUrl: document.provenance.sourceUrl,
    canonicalUrl: document.provenance.canonicalUrl,
    mime: document.provenance.mime,
    language: document.provenance.language,
  });
  if (document.documentId !== rebuilt.documentId || document.contentFingerprint !== rebuilt.contentFingerprint
    || document.provenance.contentHash !== rebuilt.provenance.contentHash || document.provenance.domain !== rebuilt.provenance.domain
    || document.provenance.fetchedAt !== document.fetchedAt) throw new Error('focused_index_document_integrity_failed');
  const expectedFreshness = freshnessAt(document, document.fetchedAt);
  if (document.provenance.freshnessState !== expectedFreshness && document.provenance.freshnessState !== 'stale' && document.provenance.freshnessState !== 'expired') throw new Error('invalid_focused_index_freshness_state');
}

export function assertFocusedIndexRuntimeIdentity(identity: FocusedIndexRuntimeIdentity): void {
  if (JSON.stringify(identity) !== JSON.stringify(focusedIndexRuntimeIdentity)) throw new Error('focused_index_runtime_identity_substitution');
}
