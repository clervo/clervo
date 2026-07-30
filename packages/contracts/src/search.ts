import { CONTRACT_VERSION } from './types.js';

const TRACKING_PARAMETERS = new Set([
  'dclid',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'ref',
  'ref_src',
]);

export interface SearchEvidence {
  resultId: string;
  sourceId: string;
  url: string;
  title: string;
  snippet: string;
  evidenceText: string;
  retrievedAt: string;
  publishedAt?: string;
  authorityScore: number;
  relevanceScore: number;
}

export interface SearchScore {
  freshness: number;
  authority: number;
  relevance: number;
  diversity: number;
  totalBasisPoints: number;
}

export interface SearchResult extends SearchEvidence {
  canonicalUrl: string;
  hostname: string;
  rank: number;
  score: Readonly<SearchScore>;
}

export interface SearchCitation {
  citationId: string;
  resultId: string;
  canonicalUrl: string;
  quote: string;
  startOffset: number;
  endOffset: number;
}

export interface SearchCitationVerification {
  valid: boolean;
  code?: 'citation_result_missing' | 'citation_url_mismatch' | 'citation_range_invalid' | 'citation_quote_mismatch';
}

export interface SearchResponse {
  contractVersion: typeof CONTRACT_VERSION;
  operationId: string;
  query: string;
  generatedAt: string;
  deduplicatedCount: number;
  results: readonly Readonly<SearchResult>[];
  citations: readonly Readonly<SearchCitation>[];
}

export interface RankSearchInput {
  now: string;
  evidence: readonly SearchEvidence[];
  maxResults: number;
}

export interface CreateSearchResponseInput extends RankSearchInput {
  operationId: string;
  query: string;
  citations?: readonly SearchCitation[];
}

function assertText(value: string, name: string, maximum: number): void {
  if (value.length === 0 || value.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    throw new Error(`invalid_${name}`);
  }
}

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid_${name}`);
  return parsed;
}

function boundedScore(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error(`invalid_${name}`);
  return value;
}

function freshnessScore(ageMs: number): number {
  const day = 86_400_000;
  if (ageMs <= day) return 100;
  if (ageMs <= 7 * day) return 85;
  if (ageMs <= 30 * day) return 65;
  if (ageMs <= 180 * day) return 45;
  if (ageMs <= 365 * day) return 25;
  return 10;
}

function isTrackingParameter(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMETERS.has(lower);
}

export function canonicalizeSearchUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('invalid_search_url');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') throw new Error('invalid_search_url');
  url.hash = '';
  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) url.port = '';
  const parameters = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParameter(name))
    .sort(([leftName, leftValue], [rightName, rightValue]) => leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue));
  url.search = '';
  for (const [name, parameterValue] of parameters) url.searchParams.append(name, parameterValue);
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.replace(/\/+$/u, '');
  return url.toString();
}

function validateEvidence(value: SearchEvidence, nowMs: number): { evidence: SearchEvidence; canonicalUrl: string; hostname: string; freshness: number; evidenceTime: number } {
  if (!/^sr_[A-Za-z0-9]{20,64}$/u.test(value.resultId)) throw new Error('invalid_search_result_id');
  if (!/^adapter_[a-z0-9][a-z0-9._-]{2,63}$/u.test(value.sourceId)) throw new Error('invalid_search_source_id');
  assertText(value.title, 'search_title', 512);
  assertText(value.snippet, 'search_snippet', 2_000);
  assertText(value.evidenceText, 'search_evidence_text', 100_000);
  const retrievedAt = timestamp(value.retrievedAt, 'search_retrieved_at');
  const publishedAt = value.publishedAt === undefined ? undefined : timestamp(value.publishedAt, 'search_published_at');
  if (retrievedAt > nowMs || (publishedAt !== undefined && publishedAt > nowMs)) throw new Error('search_evidence_from_future');
  const authority = boundedScore(value.authorityScore, 'search_authority_score');
  const relevance = boundedScore(value.relevanceScore, 'search_relevance_score');
  const canonicalUrl = canonicalizeSearchUrl(value.url);
  return {
    evidence: { ...value, authorityScore: authority, relevanceScore: relevance },
    canonicalUrl,
    hostname: new URL(canonicalUrl).hostname,
    freshness: freshnessScore(nowMs - (publishedAt ?? retrievedAt)),
    evidenceTime: publishedAt ?? retrievedAt,
  };
}

type Candidate = ReturnType<typeof validateEvidence>;

function comparePreferred(left: Candidate, right: Candidate): number {
  return right.evidence.relevanceScore - left.evidence.relevanceScore
    || right.evidence.authorityScore - left.evidence.authorityScore
    || right.freshness - left.freshness
    || right.evidenceTime - left.evidenceTime
    || left.evidence.resultId.localeCompare(right.evidence.resultId);
}

export function rankSearchEvidence(input: RankSearchInput): readonly Readonly<SearchResult>[] {
  const nowMs = timestamp(input.now, 'search_now');
  if (!Number.isInteger(input.maxResults) || input.maxResults < 1 || input.maxResults > 100) throw new Error('invalid_search_max_results');
  const identifiers = new Set<string>();
  const candidates = input.evidence.map((evidence) => {
    if (identifiers.has(evidence.resultId)) throw new Error('duplicate_search_result_id');
    identifiers.add(evidence.resultId);
    return validateEvidence(evidence, nowMs);
  });
  const byUrl = new Map<string, Candidate[]>();
  for (const candidate of candidates) byUrl.set(candidate.canonicalUrl, [...(byUrl.get(candidate.canonicalUrl) ?? []), candidate]);
  const unique = [...byUrl.values()].map((matches) => [...matches].sort(comparePreferred)[0] as Candidate).sort(comparePreferred);
  const hostnameCounts = new Map<string, number>();
  const scored = unique.map((candidate) => {
    const occurrence = hostnameCounts.get(candidate.hostname) ?? 0;
    hostnameCounts.set(candidate.hostname, occurrence + 1);
    const diversity = occurrence === 0 ? 100 : 40;
    const totalBasisPoints = candidate.freshness * 30
      + candidate.evidence.authorityScore * 25
      + candidate.evidence.relevanceScore * 35
      + diversity * 10;
    return {
      ...candidate.evidence,
      canonicalUrl: candidate.canonicalUrl,
      hostname: candidate.hostname,
      rank: 0,
      score: Object.freeze({ freshness: candidate.freshness, authority: candidate.evidence.authorityScore, relevance: candidate.evidence.relevanceScore, diversity, totalBasisPoints }),
    };
  });
  scored.sort((left, right) => right.score.totalBasisPoints - left.score.totalBasisPoints
    || right.score.relevance - left.score.relevance
    || right.score.authority - left.score.authority
    || left.canonicalUrl.localeCompare(right.canonicalUrl)
    || left.resultId.localeCompare(right.resultId));
  return Object.freeze(scored.slice(0, input.maxResults).map((result, index) => Object.freeze({ ...result, rank: index + 1 })));
}

export function verifySearchCitation(citation: SearchCitation, results: readonly SearchResult[]): Readonly<SearchCitationVerification> {
  const result = results.find((candidate) => candidate.resultId === citation.resultId);
  if (result === undefined) return Object.freeze({ valid: false, code: 'citation_result_missing' });
  if (citation.canonicalUrl !== result.canonicalUrl) return Object.freeze({ valid: false, code: 'citation_url_mismatch' });
  if (!Number.isInteger(citation.startOffset) || !Number.isInteger(citation.endOffset) || citation.startOffset < 0 || citation.endOffset <= citation.startOffset || citation.endOffset > result.evidenceText.length) {
    return Object.freeze({ valid: false, code: 'citation_range_invalid' });
  }
  if (result.evidenceText.slice(citation.startOffset, citation.endOffset) !== citation.quote) return Object.freeze({ valid: false, code: 'citation_quote_mismatch' });
  return Object.freeze({ valid: true });
}

export function createSearchResponse(input: CreateSearchResponseInput): Readonly<SearchResponse> {
  if (!/^op_[A-Za-z0-9]{20,64}$/u.test(input.operationId)) throw new Error('invalid_search_operation_id');
  assertText(input.query, 'search_query', 2_000);
  timestamp(input.now, 'search_now');
  const results = rankSearchEvidence(input);
  const uniqueCanonicalUrls = new Set(input.evidence.map((evidence) => canonicalizeSearchUrl(evidence.url)));
  const citations = input.citations ?? [];
  const citationIds = new Set<string>();
  for (const citation of citations) {
    if (!/^cite_[A-Za-z0-9]{20,64}$/u.test(citation.citationId)) throw new Error('invalid_search_citation_id');
    if (citationIds.has(citation.citationId)) throw new Error('duplicate_search_citation_id');
    citationIds.add(citation.citationId);
    const verification = verifySearchCitation(citation, results);
    if (!verification.valid) throw new Error(verification.code);
  }
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    operationId: input.operationId,
    query: input.query,
    generatedAt: input.now,
    deduplicatedCount: input.evidence.length - uniqueCanonicalUrls.size,
    results,
    citations: Object.freeze(citations.map((citation) => Object.freeze({ ...citation }))),
  });
}