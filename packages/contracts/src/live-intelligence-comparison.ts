import { hashJson } from './receipt.js';
import { canonicalizeSearchUrl, verifySearchCitation, type SearchResponse, type SearchResult } from './search.js';
import type { JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export const LIVE_INTELLIGENCE_COMPARISON_SCHEMA_VERSION = 'live-intelligence-comparison.v1' as const;

export const comparisonChangedFields = [
  'presence',
  'title',
  'snippet',
  'evidenceText',
  'publishedAt',
  'sourceId',
  'authorityScore',
  'relevanceScore',
  'rank',
] as const;

export type ComparisonChangedField = (typeof comparisonChangedFields)[number];
export type ComparisonEventType = 'added' | 'modified' | 'removed';

export interface LiveIntelligenceCompareRequest {
  baseline: SearchResponse;
  current: SearchResponse;
}

export interface LiveIntelligenceChangeEvent {
  changeId: string;
  type: ComparisonEventType;
  canonicalUrl: string;
  changedFields: readonly ComparisonChangedField[];
  baselineFingerprint: string | null;
  currentFingerprint: string | null;
  baselineSourceId: string | null;
  currentSourceId: string | null;
  baselineRank: number | null;
  currentRank: number | null;
}

export interface LiveIntelligenceComparisonReport {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof LIVE_INTELLIGENCE_COMPARISON_SCHEMA_VERSION;
  comparisonId: string;
  query: {
    text: string;
    language: string;
    region: string;
    identityHash: string;
  };
  baseline: {
    operationId: string;
    generatedAt: string;
    evidenceSetHash: string;
  };
  current: {
    operationId: string;
    generatedAt: string;
    evidenceSetHash: string;
  };
  summary: {
    baselineEntities: number;
    currentEntities: number;
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  events: readonly Readonly<LiveIntelligenceChangeEvent>[];
  reportHash: string;
}

type UnsignedComparisonReport = Omit<LiveIntelligenceComparisonReport, 'reportHash'>;

const materialFields = comparisonChangedFields.filter((field) => field !== 'presence');

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseTimestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError(`invalid_${name}`);
  return parsed;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    for (const entry of value) freezeDeep(entry);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) freezeDeep(entry);
    return Object.freeze(value);
  }
  return value;
}

function comparableResult(result: SearchResult): JsonValue {
  return {
    authorityScore: result.authorityScore,
    canonicalUrl: result.canonicalUrl,
    evidenceText: result.evidenceText,
    publishedAt: result.publishedAt ?? null,
    rank: result.rank,
    relevanceScore: result.relevanceScore,
    snippet: result.snippet,
    sourceId: result.sourceId,
    title: result.title,
  };
}

function evidenceFingerprint(result: SearchResult): string {
  return hashJson(comparableResult(result));
}

function validateSearchSnapshot(response: SearchResponse, name: string): Map<string, SearchResult> {
  if (response.contractVersion !== CONTRACT_VERSION) throw new TypeError(`${name}_contract_version_invalid`);
  if (!/^op_[A-Za-z0-9]{20,64}$/u.test(response.operationId)) throw new TypeError(`${name}_operation_id_invalid`);
  if (response.query.length === 0 || response.query.length > 2_000) throw new TypeError(`${name}_query_invalid`);
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(response.language) || !/^[A-Z]{2}$/u.test(response.region)) throw new TypeError(`${name}_locale_invalid`);
  const generatedAt = parseTimestamp(response.generatedAt, `${name}_generated_at`);
  if (response.results.length > 100 || response.citations.length > 1_000) throw new TypeError(`${name}_bounds_invalid`);

  const byCanonicalUrl = new Map<string, SearchResult>();
  const resultIds = new Set<string>();
  const ranks = new Set<number>();
  for (const result of response.results) {
    if (resultIds.has(result.resultId)) throw new TypeError(`${name}_result_id_duplicate`);
    resultIds.add(result.resultId);
    if (canonicalizeSearchUrl(result.url) !== result.canonicalUrl || new URL(result.canonicalUrl).hostname !== result.hostname) throw new TypeError(`${name}_canonical_url_invalid`);
    if (byCanonicalUrl.has(result.canonicalUrl)) throw new TypeError(`${name}_canonical_url_duplicate`);
    byCanonicalUrl.set(result.canonicalUrl, result);
    if (!Number.isInteger(result.rank) || result.rank < 1 || result.rank > response.results.length || ranks.has(result.rank)) throw new TypeError(`${name}_rank_invalid`);
    ranks.add(result.rank);
    if (parseTimestamp(result.retrievedAt, `${name}_retrieved_at`) > generatedAt) throw new TypeError(`${name}_result_from_future`);
    if (result.publishedAt !== undefined && parseTimestamp(result.publishedAt, `${name}_published_at`) > generatedAt) throw new TypeError(`${name}_result_from_future`);
  }

  const citationIds = new Set<string>();
  for (const citation of response.citations) {
    if (citationIds.has(citation.citationId)) throw new TypeError(`${name}_citation_id_duplicate`);
    citationIds.add(citation.citationId);
    const verification = verifySearchCitation(citation, response.results);
    if (!verification.valid) throw new TypeError(`${name}_${verification.code}`);
  }
  return byCanonicalUrl;
}

function evidenceSetHash(response: SearchResponse): string {
  return hashJson({
    generatedAt: response.generatedAt,
    results: [...response.results]
      .sort((left, right) => compareCodePoints(left.canonicalUrl, right.canonicalUrl))
      .map(comparableResult),
  });
}

export function liveIntelligenceQueryIdentityHash(response: SearchResponse): string {
  validateSearchSnapshot(response, 'snapshot');
  return hashJson({ language: response.language, region: response.region, text: response.query });
}

export function liveIntelligenceEvidenceSetHash(response: SearchResponse): string {
  validateSearchSnapshot(response, 'snapshot');
  return evidenceSetHash(response);
}

function changedFields(baseline: SearchResult, current: SearchResult): ComparisonChangedField[] {
  const output: ComparisonChangedField[] = [];
  for (const field of materialFields) {
    if ((baseline[field] ?? null) !== (current[field] ?? null)) output.push(field);
  }
  return output;
}

function event(
  comparisonSeed: string,
  type: ComparisonEventType,
  canonicalUrl: string,
  fields: readonly ComparisonChangedField[],
  baseline: SearchResult | undefined,
  current: SearchResult | undefined,
): Readonly<LiveIntelligenceChangeEvent> {
  const changeHash = hashJson({ canonicalUrl, comparisonSeed, fields: [...fields], type });
  return freezeDeep({
    changeId: `chg_${changeHash.slice('sha256:'.length, 'sha256:'.length + 32)}`,
    type,
    canonicalUrl,
    changedFields: [...fields],
    baselineFingerprint: baseline === undefined ? null : evidenceFingerprint(baseline),
    currentFingerprint: current === undefined ? null : evidenceFingerprint(current),
    baselineSourceId: baseline?.sourceId ?? null,
    currentSourceId: current?.sourceId ?? null,
    baselineRank: baseline?.rank ?? null,
    currentRank: current?.rank ?? null,
  });
}

export function comparisonReportHash(report: UnsignedComparisonReport): string {
  return hashJson(report as unknown as JsonValue);
}

export function verifyLiveIntelligenceComparison(report: LiveIntelligenceComparisonReport): boolean {
  const { reportHash, ...unsigned } = report;
  return reportHash === comparisonReportHash(unsigned);
}

export function compareLiveIntelligenceEvidence(
  input: LiveIntelligenceCompareRequest,
): Readonly<LiveIntelligenceComparisonReport> {
  const baselineByUrl = validateSearchSnapshot(input.baseline, 'baseline');
  const currentByUrl = validateSearchSnapshot(input.current, 'current');
  if (input.baseline.query !== input.current.query || input.baseline.language !== input.current.language || input.baseline.region !== input.current.region) throw new TypeError('comparison_query_identity_mismatch');
  if (Date.parse(input.current.generatedAt) <= Date.parse(input.baseline.generatedAt)) throw new TypeError('comparison_time_not_increasing');

  const queryIdentityHash = hashJson({
    language: input.baseline.language,
    region: input.baseline.region,
    text: input.baseline.query,
  });
  const baselineEvidenceSetHash = evidenceSetHash(input.baseline);
  const currentEvidenceSetHash = evidenceSetHash(input.current);
  const comparisonSeed = hashJson({
    baselineEvidenceSetHash,
    currentEvidenceSetHash,
    queryIdentityHash,
    schemaVersion: LIVE_INTELLIGENCE_COMPARISON_SCHEMA_VERSION,
  });

  const events: Readonly<LiveIntelligenceChangeEvent>[] = [];
  let unchanged = 0;
  const urls = [...new Set([...baselineByUrl.keys(), ...currentByUrl.keys()])].sort(compareCodePoints);
  for (const canonicalUrl of urls) {
    const baseline = baselineByUrl.get(canonicalUrl);
    const current = currentByUrl.get(canonicalUrl);
    if (baseline === undefined) {
      events.push(event(comparisonSeed, 'added', canonicalUrl, ['presence'], undefined, current));
      continue;
    }
    if (current === undefined) {
      events.push(event(comparisonSeed, 'removed', canonicalUrl, ['presence'], baseline, undefined));
      continue;
    }
    const fields = changedFields(baseline, current);
    if (fields.length === 0) unchanged += 1;
    else events.push(event(comparisonSeed, 'modified', canonicalUrl, fields, baseline, current));
  }

  const added = events.filter(({ type }) => type === 'added').length;
  const removed = events.filter(({ type }) => type === 'removed').length;
  const modified = events.filter(({ type }) => type === 'modified').length;
  const comparisonHash = hashJson({ comparisonSeed, eventIds: events.map(({ changeId }) => changeId) });
  const unsigned: UnsignedComparisonReport = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: LIVE_INTELLIGENCE_COMPARISON_SCHEMA_VERSION,
    comparisonId: `cmp_${comparisonHash.slice('sha256:'.length, 'sha256:'.length + 32)}`,
    query: {
      text: input.baseline.query,
      language: input.baseline.language,
      region: input.baseline.region,
      identityHash: queryIdentityHash,
    },
    baseline: {
      operationId: input.baseline.operationId,
      generatedAt: input.baseline.generatedAt,
      evidenceSetHash: baselineEvidenceSetHash,
    },
    current: {
      operationId: input.current.operationId,
      generatedAt: input.current.generatedAt,
      evidenceSetHash: currentEvidenceSetHash,
    },
    summary: {
      baselineEntities: baselineByUrl.size,
      currentEntities: currentByUrl.size,
      added,
      removed,
      modified,
      unchanged,
    },
    events,
  };
  return freezeDeep({ ...unsigned, reportHash: comparisonReportHash(unsigned) });
}
