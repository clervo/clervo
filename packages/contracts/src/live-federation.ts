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

export type SearchVerticalProfile = 'commerce' | 'property' | 'companies' | 'research' | 'developer_documentation' | 'generic_fallback';

export interface ConnectedRankingProfile {
  profile: SearchVerticalProfile;
  relevanceWeight: number;
  authorityWeight: number;
  freshnessWeight: number;
  diversityWeight: number;
  nearDuplicateThresholdBasisPoints: number;
}

export const connectedRankingProfiles: Readonly<Record<SearchVerticalProfile, Readonly<ConnectedRankingProfile>>> = Object.freeze({
  commerce: Object.freeze({ profile: 'commerce', relevanceWeight: 55, authorityWeight: 15, freshnessWeight: 15, diversityWeight: 15, nearDuplicateThresholdBasisPoints: 9_200 }),
  property: Object.freeze({ profile: 'property', relevanceWeight: 52, authorityWeight: 18, freshnessWeight: 15, diversityWeight: 15, nearDuplicateThresholdBasisPoints: 9_200 }),
  companies: Object.freeze({ profile: 'companies', relevanceWeight: 50, authorityWeight: 25, freshnessWeight: 15, diversityWeight: 10, nearDuplicateThresholdBasisPoints: 9_000 }),
  research: Object.freeze({ profile: 'research', relevanceWeight: 45, authorityWeight: 30, freshnessWeight: 15, diversityWeight: 10, nearDuplicateThresholdBasisPoints: 8_800 }),
  developer_documentation: Object.freeze({ profile: 'developer_documentation', relevanceWeight: 55, authorityWeight: 25, freshnessWeight: 10, diversityWeight: 10, nearDuplicateThresholdBasisPoints: 9_000 }),
  generic_fallback: Object.freeze({ profile: 'generic_fallback', relevanceWeight: 50, authorityWeight: 20, freshnessWeight: 15, diversityWeight: 15, nearDuplicateThresholdBasisPoints: 9_000 }),
});

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

const lexicalStopWords = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'is', 'of', 'on', 'or', 'the', 'to', 'with']);

function lexicalTokens(value: string): readonly string[] {
  return Object.freeze((value.normalize('NFKC').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 1 && !lexicalStopWords.has(token)));
}

function lexicalRelevance(query: string, item: ConnectedRouteEvidence): number {
  const tokens = [...new Set(lexicalTokens(query))];
  if (tokens.length === 0) return Math.max(0, Math.min(100, item.relevanceScore));
  const title = item.title.normalize('NFKC').toLocaleLowerCase('en-US');
  const evidence = item.evidenceText.normalize('NFKC').toLocaleLowerCase('en-US');
  const url = canonicalizeSearchUrl(item.url).toLocaleLowerCase('en-US');
  const normalizedQuery = tokens.join(' ');
  const titleHits = tokens.filter((token) => title.includes(token)).length;
  const evidenceHits = tokens.filter((token) => evidence.includes(token)).length;
  const urlHits = tokens.filter((token) => url.includes(token)).length;
  const coverage = evidenceHits / tokens.length;
  const titleCoverage = titleHits / tokens.length;
  const exactTitle = title.includes(normalizedQuery) ? 1 : 0;
  const exactEvidence = evidence.includes(normalizedQuery) ? 1 : 0;
  const urlCoverage = urlHits / tokens.length;
  const raw = coverage * 38 + titleCoverage * 30 + exactTitle * 14 + exactEvidence * 8 + urlCoverage * 5 + Math.max(0, Math.min(100, item.relevanceScore)) * 0.05;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function preferredRepresentative(left: RankedCandidate, right: RankedCandidate): RankedCandidate {
  const comparison = right.relevance - left.relevance || right.item.authorityScore - left.item.authorityScore || right.freshness - left.freshness
    || left.sourceRank - right.sourceRank || left.canonicalUrl.localeCompare(right.canonicalUrl);
  return comparison > 0 ? right : left;
}

interface RankedCandidate {
  item: ConnectedRouteEvidence;
  canonicalUrl: string;
  hostname: string;
  freshness: number;
  relevance: number;
  sourceRank: number;
}

export function rankConnectedEvidence(input: {
  evidence: readonly ConnectedRouteEvidence[];
  now: string;
  maximumResults: number;
  nearDuplicateThresholdBasisPoints: number;
  query?: string;
  verticalProfile?: SearchVerticalProfile;
}): Readonly<{ results: readonly Readonly<ConnectedSearchResult>[]; exactDuplicateCount: number; nearDuplicateCount: number }> {
  if (!Number.isInteger(input.maximumResults) || input.maximumResults < 1 || input.maximumResults > 100
    || !Number.isInteger(input.nearDuplicateThresholdBasisPoints) || input.nearDuplicateThresholdBasisPoints < 5_000 || input.nearDuplicateThresholdBasisPoints > 10_000) throw new Error('invalid_connected_ranking_limits');
  const profile = connectedRankingProfiles[input.verticalProfile ?? 'generic_fallback'];
  const routeRanks = new Map<RetrievalRouteId, number>();
  const ordered: RankedCandidate[] = [...input.evidence].map((item) => {
    const sourceRank = (routeRanks.get(item.routeId) ?? 0) + 1;
    routeRanks.set(item.routeId, sourceRank);
    const canonicalUrl = canonicalizeSearchUrl(item.url);
    return { item, canonicalUrl, hostname: new URL(canonicalUrl).hostname, freshness: scoreFreshness(item.publishedAt ?? item.retrievedAt, input.now), relevance: lexicalRelevance(input.query ?? '', item), sourceRank };
  });
  const retained: RankedCandidate[] = [];
  let exactDuplicateCount = 0;
  let nearDuplicateCount = 0;
  for (const candidate of ordered) {
    if (candidate.item.extraction.instructionHandling !== 'untrusted_data_only') throw new Error('prompt_injection_boundary_substitution');
    const exactIndex = retained.findIndex((item) => item.canonicalUrl === candidate.canonicalUrl || (item.hostname === candidate.hostname && item.item.extraction.normalizedTextSha256 === candidate.item.extraction.normalizedTextSha256));
    if (exactIndex >= 0) { exactDuplicateCount += 1; retained[exactIndex] = preferredRepresentative(retained[exactIndex]!, candidate); continue; }
    const adaptiveThreshold = Math.max(input.nearDuplicateThresholdBasisPoints, profile.nearDuplicateThresholdBasisPoints);
    const nearIndex = retained.findIndex((item) => item.hostname === candidate.hostname && contentSimilarityBasisPoints(item.item.evidenceText, candidate.item.evidenceText) >= adaptiveThreshold);
    if (nearIndex >= 0) { nearDuplicateCount += 1; retained[nearIndex] = preferredRepresentative(retained[nearIndex]!, candidate); continue; }
    retained.push(candidate);
  }
  const preliminary = retained.map((candidate) => ({
    ...candidate.item,
    canonicalUrl: candidate.canonicalUrl,
    resultId: `csr_${digest(`${candidate.item.routeId}\n${candidate.canonicalUrl}\n${candidate.item.extraction.normalizedTextSha256}`).slice(0, 40)}`,
    hostname: candidate.hostname,
    freshness: candidate.freshness,
    calibratedRelevance: Math.min(100, Math.round(candidate.relevance * 0.85 + (100 / (60 + candidate.sourceRank)) * 60 * 0.15)),
    sourceRank: candidate.sourceRank,
  })).sort((left, right) => right.calibratedRelevance - left.calibratedRelevance || right.authorityScore - left.authorityScore || right.freshness - left.freshness || left.sourceRank - right.sourceRank || left.canonicalUrl.localeCompare(right.canonicalUrl));
  const domains = new Map<string, number>();
  const remaining = [...preliminary];
  const scored: Array<ConnectedSearchResult> = [];
  while (remaining.length > 0 && scored.length < input.maximumResults) {
    const choices = remaining.map((item) => {
      const count = domains.get(item.hostname) ?? 0;
      const diversity = count === 0 ? 100 : count === 1 ? 55 : 25;
      const totalBasisPoints = item.calibratedRelevance * profile.relevanceWeight + item.authorityScore * profile.authorityWeight + item.freshness * profile.freshnessWeight + diversity * profile.diversityWeight;
      return { item, diversity, totalBasisPoints };
    }).sort((left, right) => right.totalBasisPoints - left.totalBasisPoints || right.item.calibratedRelevance - left.item.calibratedRelevance || right.item.authorityScore - left.item.authorityScore || left.item.sourceRank - right.item.sourceRank || left.item.canonicalUrl.localeCompare(right.item.canonicalUrl));
    const selected = choices[0]!;
    remaining.splice(remaining.indexOf(selected.item), 1);
    domains.set(selected.item.hostname, (domains.get(selected.item.hostname) ?? 0) + 1);
    const { freshness, calibratedRelevance, sourceRank: _sourceRank, ...result } = selected.item;
    scored.push({ ...result, relevanceScore: calibratedRelevance, score: Object.freeze({ freshness, authority: result.authorityScore, relevance: calibratedRelevance, diversity: selected.diversity, totalBasisPoints: selected.totalBasisPoints }), rank: scored.length + 1 });
  }
  return Object.freeze({ results: Object.freeze(scored.map((result) => Object.freeze(result))), exactDuplicateCount, nearDuplicateCount });
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
