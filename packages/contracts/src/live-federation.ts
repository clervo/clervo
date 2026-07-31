import { createHash } from 'node:crypto';
import { CONTRACT_VERSION } from './types.js';
import { contentSimilarityBasisPoints } from './extraction.js';
import { canonicalizeSearchUrl } from './search.js';

export const LIVE_FEDERATION_ROUTE_ID = 'clervo.live-federation.v1' as const;
export const LIVE_FEDERATION_PROVIDER_ID = 'provider_clervo_live_federation_v1' as const;
export const LIVE_FEDERATION_ADAPTER_ID = 'adapter_clervo_live_federation_v1' as const;
export const LIVE_FEDERATION_HEALTH_IDENTITY = 'clervo.health.live_federation' as const;
export const LIVE_FEDERATION_CIRCUIT_IDENTITY = 'clervo.circuit.live_federation' as const;
export const LIVE_FEDERATION_FAILURE_DOMAIN = 'clervo.live_federation' as const;
export const LIVE_FEDERATION_RESPONSE_SCHEMA = 'clervo.connected-retrieval.response.v1' as const;
export const WIKIMEDIA_ADAPTER_ID = 'adapter_wikimedia_action_api_v1' as const;
export const WIKIMEDIA_PROVIDER_ID = 'provider_wikimedia_action_api_v1' as const;
export const CROSSREF_ADAPTER_ID = 'adapter_crossref_rest_api_v1' as const;
export const CROSSREF_PROVIDER_ID = 'provider_crossref_rest_api_v1' as const;
export const COMMON_CRAWL_ADAPTER_ID = 'adapter_common_crawl_cdxj_v1' as const;
export const COMMON_CRAWL_PROVIDER_ID = 'provider_common_crawl_index_v1' as const;
export const CRAWL4AI_WORKER_ID = 'worker_crawl4ai_0_9_2_playwright_1_61_0' as const;
export const CRAWL4AI_VERSION = '0.9.2' as const;
export const PLAYWRIGHT_VERSION = '1.61.0' as const;

export type RetrievalRouteId = 'clervo.focused-index.v1' | typeof LIVE_FEDERATION_ROUTE_ID;

export interface LiveFederationRuntimeIdentity {
  routeId: typeof LIVE_FEDERATION_ROUTE_ID;
  providerId: typeof LIVE_FEDERATION_PROVIDER_ID;
  adapterId: typeof LIVE_FEDERATION_ADAPTER_ID;
  healthIdentity: typeof LIVE_FEDERATION_HEALTH_IDENTITY;
  circuitIdentity: typeof LIVE_FEDERATION_CIRCUIT_IDENTITY;
  failureDomain: typeof LIVE_FEDERATION_FAILURE_DOMAIN;
  providerApiCostUsdMicros: 0;
}

export const liveFederationRuntimeIdentity: Readonly<LiveFederationRuntimeIdentity> = Object.freeze({
  routeId: LIVE_FEDERATION_ROUTE_ID,
  providerId: LIVE_FEDERATION_PROVIDER_ID,
  adapterId: LIVE_FEDERATION_ADAPTER_ID,
  healthIdentity: LIVE_FEDERATION_HEALTH_IDENTITY,
  circuitIdentity: LIVE_FEDERATION_CIRCUIT_IDENTITY,
  failureDomain: LIVE_FEDERATION_FAILURE_DOMAIN,
  providerApiCostUsdMicros: 0,
});

export interface ReviewedOpenDataSource {
  sourceId: 'wikimedia' | 'crossref' | 'common_crawl';
  providerId: string;
  adapterId: string;
  useStatus: 'qualified_metadata' | 'metadata_only_provisional';
  officialTermsUrl: string;
  officialDocumentationUrl: string;
  attribution: string;
  allowedOutput: readonly ('discovery_metadata' | 'current_page_evidence')[];
  prohibitedOutput: readonly string[];
  requirements: readonly string[];
}

export const reviewedOpenDataSources: readonly Readonly<ReviewedOpenDataSource>[] = Object.freeze([
  Object.freeze({
    sourceId: 'wikimedia', providerId: WIKIMEDIA_PROVIDER_ID, adapterId: WIKIMEDIA_ADAPTER_ID,
    useStatus: 'qualified_metadata',
    officialTermsUrl: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
    officialDocumentationUrl: 'https://www.mediawiki.org/wiki/API:Etiquette',
    attribution: 'Wikimedia contributors; page URL and applicable page license must be retained.',
    allowedOutput: Object.freeze(['discovery_metadata', 'current_page_evidence'] as const),
    prohibitedOutput: Object.freeze(['media_without_item_license_review', 'content_without_attribution']),
    requirements: Object.freeze(['meaningful_contact_user_agent', 'respect_api_limits_and_maxlag', 'page_url_attribution', 'page_level_license_and_sharealike_compliance']),
  }),
  Object.freeze({
    sourceId: 'crossref', providerId: CROSSREF_PROVIDER_ID, adapterId: CROSSREF_ADAPTER_ID,
    useStatus: 'qualified_metadata',
    officialTermsUrl: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/',
    officialDocumentationUrl: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/',
    attribution: 'Crossref REST API metadata; DOI and publisher landing URL retained.',
    allowedOutput: Object.freeze(['discovery_metadata', 'current_page_evidence'] as const),
    prohibitedOutput: Object.freeze(['abstract', 'publisher_full_text', 'metadata_field_with_unresolved_rights']),
    requirements: Object.freeze(['mailto_polite_pool', 'identify_client', 'honor_rate_limit_headers', 'exclude_abstracts']),
  }),
  Object.freeze({
    sourceId: 'common_crawl', providerId: COMMON_CRAWL_PROVIDER_ID, adapterId: COMMON_CRAWL_ADAPTER_ID,
    useStatus: 'metadata_only_provisional',
    officialTermsUrl: 'https://commoncrawl.org/terms-of-use',
    officialDocumentationUrl: 'https://index.commoncrawl.org/',
    attribution: 'Common Crawl URL Index; capture identity retained as metadata only.',
    allowedOutput: Object.freeze(['discovery_metadata'] as const),
    prohibitedOutput: Object.freeze(['archived_warc_body', 'archived_wat_body', 'archived_wet_body', 'paid_or_production_archived_content']),
    requirements: Object.freeze(['bounded_cdxj_queries', 'do_not_overload_index', 'current_page_must_be_refetched_through_clervo_boundary', 'archived_body_development_only']),
  }),
]);

export interface OpenDataAttribution {
  sourceId: ReviewedOpenDataSource['sourceId'] | 'focused_index';
  sourceName: string;
  sourceUrl: string;
  license: string;
  notice: string;
}

export interface LiveDiscoveryCandidate {
  routeId: typeof LIVE_FEDERATION_ROUTE_ID;
  providerId: string;
  adapterId: string;
  currentUrl: string;
  title: string;
  snippet: string;
  retrievedAt: string;
  publishedAt?: string;
  language: string;
  region: string;
  attribution: Readonly<OpenDataAttribution>;
  discoveryKind: 'open_data' | 'common_crawl_metadata';
  captureTimestamp?: string;
}

export interface ConnectedExtractionProvenance {
  fetchId: string;
  extractionId: string;
  sourceBodySha256: string;
  normalizedTextSha256: string;
  instructionHandling: 'untrusted_data_only';
  renderMode: 'static' | 'crawl4ai_javascript';
  crawl4aiStatus: 'not_used' | 'provisional_n4_25' | 'runtime_attested';
}

export interface ConnectedRouteEvidence {
  routeId: RetrievalRouteId;
  providerId: string;
  adapterId: string;
  url: string;
  title: string;
  evidenceText: string;
  retrievedAt: string;
  publishedAt?: string;
  authorityScore: number;
  relevanceScore: number;
  language: string;
  region: string;
  attribution: Readonly<OpenDataAttribution>;
  extraction: Readonly<ConnectedExtractionProvenance>;
}

export interface ConnectedSearchScore {
  freshness: number;
  authority: number;
  relevance: number;
  diversity: number;
  totalBasisPoints: number;
}

export interface ConnectedSearchResult extends ConnectedRouteEvidence {
  resultId: string;
  canonicalUrl: string;
  hostname: string;
  rank: number;
  score: Readonly<ConnectedSearchScore>;
}

export interface ConnectedCitation {
  citationId: string;
  resultId: string;
  routeId: RetrievalRouteId;
  canonicalUrl: string;
  quote: string;
  startOffset: number;
  endOffset: number;
  extractionId: string;
}

export interface ConnectedRouteAttempt {
  routeId: RetrievalRouteId;
  providerId: string;
  healthIdentity: string;
  circuitIdentity: string;
  failureDomain: string;
  startedAt: string;
  completedAt: string;
  outcome: 'succeeded' | 'failed' | 'deadline_exceeded' | 'cancelled';
  resultCount: number;
  failureCode?: string;
}

export interface ConnectedRetrievalResponse {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof LIVE_FEDERATION_RESPONSE_SCHEMA;
  operationId: string;
  productId: 'search.web';
  query: string;
  rewriteQueries: readonly [string, string];
  language: string;
  region: string;
  generatedAt: string;
  status: 'ready' | 'degraded';
  degradedRoutes: readonly RetrievalRouteId[];
  attempts: readonly Readonly<ConnectedRouteAttempt>[];
  exactDuplicateCount: number;
  nearDuplicateCount: number;
  results: readonly Readonly<ConnectedSearchResult>[];
  citations: readonly Readonly<ConnectedCitation>[];
}

export function assertLiveFederationRuntimeIdentity(value: LiveFederationRuntimeIdentity): void {
  if (JSON.stringify(value) !== JSON.stringify(liveFederationRuntimeIdentity)) throw new Error('live_federation_runtime_identity_substitution');
}

export function verifyConnectedCitation(citation: ConnectedCitation, results: readonly ConnectedSearchResult[]): boolean {
  const result = results.find((candidate) => candidate.resultId === citation.resultId);
  return result !== undefined && result.routeId === citation.routeId && result.canonicalUrl === citation.canonicalUrl
    && result.extraction.extractionId === citation.extractionId && Number.isInteger(citation.startOffset)
    && Number.isInteger(citation.endOffset) && citation.startOffset >= 0 && citation.endOffset > citation.startOffset
    && citation.endOffset <= result.evidenceText.length
    && result.evidenceText.slice(citation.startOffset, citation.endOffset) === citation.quote;
}

function scoreFreshness(at: string, now: string): number {
  const age = Date.parse(now) - Date.parse(at);
  if (!Number.isFinite(age) || age < 0) throw new Error('invalid_connected_evidence_time');
  const day = 86_400_000;
  return age <= day ? 100 : age <= day * 7 ? 85 : age <= day * 30 ? 65 : age <= day * 180 ? 45 : age <= day * 365 ? 25 : 10;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function rankConnectedEvidence(input: {
  evidence: readonly ConnectedRouteEvidence[];
  now: string;
  maximumResults: number;
  nearDuplicateThresholdBasisPoints: number;
}): Readonly<{ results: readonly Readonly<ConnectedSearchResult>[]; exactDuplicateCount: number; nearDuplicateCount: number }> {
  if (!Number.isInteger(input.maximumResults) || input.maximumResults < 1 || input.maximumResults > 100
    || !Number.isInteger(input.nearDuplicateThresholdBasisPoints) || input.nearDuplicateThresholdBasisPoints < 5_000 || input.nearDuplicateThresholdBasisPoints > 10_000) throw new Error('invalid_connected_ranking_limits');
  const ordered = [...input.evidence].map((item) => ({ ...item, canonicalUrl: canonicalizeSearchUrl(item.url) }))
    .sort((left, right) => left.canonicalUrl.localeCompare(right.canonicalUrl) || left.routeId.localeCompare(right.routeId) || left.extraction.extractionId.localeCompare(right.extraction.extractionId));
  const retained: typeof ordered = [];
  let exactDuplicateCount = 0;
  let nearDuplicateCount = 0;
  for (const candidate of ordered) {
    if (candidate.extraction.instructionHandling !== 'untrusted_data_only') throw new Error('prompt_injection_boundary_substitution');
    const exact = retained.find((item) => item.canonicalUrl === candidate.canonicalUrl || item.extraction.normalizedTextSha256 === candidate.extraction.normalizedTextSha256);
    if (exact !== undefined) { exactDuplicateCount += 1; continue; }
    const near = retained.find((item) => contentSimilarityBasisPoints(item.evidenceText, candidate.evidenceText) >= input.nearDuplicateThresholdBasisPoints);
    if (near !== undefined) { nearDuplicateCount += 1; continue; }
    retained.push(candidate);
  }
  const preliminary = retained.map((item) => ({
    ...item,
    resultId: `csr_${digest(`${item.routeId}\n${item.canonicalUrl}\n${item.extraction.normalizedTextSha256}`).slice(0, 40)}`,
    hostname: new URL(item.canonicalUrl).hostname,
    freshness: scoreFreshness(item.publishedAt ?? item.retrievedAt, input.now),
  })).sort((left, right) => right.relevanceScore - left.relevanceScore || right.authorityScore - left.authorityScore || right.freshness - left.freshness || left.canonicalUrl.localeCompare(right.canonicalUrl) || left.routeId.localeCompare(right.routeId));
  const domains = new Map<string, number>();
  const scored = preliminary.map((item) => {
    const count = domains.get(item.hostname) ?? 0;
    domains.set(item.hostname, count + 1);
    const diversity = count === 0 ? 100 : 35;
    const score = Object.freeze({ freshness: item.freshness, authority: item.authorityScore, relevance: item.relevanceScore, diversity, totalBasisPoints: item.freshness * 30 + item.authorityScore * 25 + item.relevanceScore * 35 + diversity * 10 });
    const { freshness: _freshness, ...result } = item;
    return { ...result, score, rank: 0 };
  });
  scored.sort((left, right) => right.score.totalBasisPoints - left.score.totalBasisPoints || right.score.relevance - left.score.relevance || right.score.authority - left.score.authority || left.canonicalUrl.localeCompare(right.canonicalUrl) || left.routeId.localeCompare(right.routeId));
  return Object.freeze({ results: Object.freeze(scored.slice(0, input.maximumResults).map((result, index) => Object.freeze({ ...result, rank: index + 1 }))), exactDuplicateCount, nearDuplicateCount });
}

export function assertConnectedRetrievalResponse(response: ConnectedRetrievalResponse): void {
  if (response.contractVersion !== CONTRACT_VERSION || response.schemaVersion !== LIVE_FEDERATION_RESPONSE_SCHEMA || response.productId !== 'search.web') throw new Error('connected_response_identity_invalid');
  if (response.attempts.length !== 2 || new Set(response.attempts.map((attempt) => attempt.routeId)).size !== 2) throw new Error('connected_response_route_accounting_invalid');
  const failed = response.attempts.filter((attempt) => attempt.outcome !== 'succeeded').map((attempt) => attempt.routeId).sort();
  const expectedStatus = failed.length === 0 ? 'ready' : failed.length === 1 ? 'degraded' : 'unavailable';
  if (expectedStatus === 'unavailable' || response.status !== expectedStatus || JSON.stringify([...response.degradedRoutes].sort()) !== JSON.stringify(failed)) throw new Error('dishonest_connected_response_status');
  if (response.results.some((result) => !['clervo.focused-index.v1', LIVE_FEDERATION_ROUTE_ID].includes(result.routeId))) throw new Error('connected_result_route_identity_invalid');
  if (!response.citations.every((citation) => verifyConnectedCitation(citation, response.results))) throw new Error('connected_citation_invalid');
}
