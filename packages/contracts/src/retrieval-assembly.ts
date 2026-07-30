import { CONTRACT_VERSION } from './types.js';
import { deduplicateExtractedContent, extractRetrieval, type ExtractionRecord } from './extraction.js';
import { fetchRetrieval, type RetrievalFetchDependencies, type RetrievalFetchRequest } from './retrieval-fetch.js';
import type { RetrievalFederationCandidate, RetrievalFederationReport } from './retrieval-federation.js';
import { createRetrievalQualificationSnapshot, type RetrievalPathDecision, type RetrievalQualificationSnapshot } from './retrieval.js';
import { hashJson } from './receipt.js';
import { createSearchResponse, type SearchResponse } from './search.js';
import { normalizeSearchLocaleOptions } from './search-locale.js';

const maximumAssemblyCandidates = 20;
const maximumAssemblyWindowMs = 30_000;

export const assemblyCandidateOutcomes = ['ranked', 'retained_unranked', 'exact_duplicate', 'near_duplicate', 'fetch_rejected', 'extraction_failed', 'candidate_limit'] as const;
export type AssemblyCandidateOutcome = typeof assemblyCandidateOutcomes[number];

export interface RetrievalAssemblyCandidateRecord {
  observationId: string;
  pathId: string;
  providerId: string;
  sourceOrdinal: number;
  rawResponseSha256: string;
  requestedUrl: string;
  outcome: AssemblyCandidateOutcome;
  fetchId?: string;
  extractionId?: string;
  finalUrl?: string;
  bodySha256?: string;
  normalizedTextSha256?: string;
  duplicateOfExtractionId?: string;
  similarityBasisPoints?: number;
  resultId?: string;
  citationId?: string;
  failureCode?: 'fetch_rejected' | 'extraction_failed' | 'candidate_limit';
}

export interface RetrievalAssemblyProvenance {
  resultId: string;
  citationId: string;
  observationId: string;
  pathId: string;
  providerId: string;
  sourceOrdinal: number;
  rawResponseSha256: string;
  fetchId: string;
  extractionId: string;
  sourceBodySha256: string;
  normalizedTextSha256: string;
}

export interface RetrievalAssemblyReport {
  contractVersion: typeof CONTRACT_VERSION;
  assemblyId: string;
  federationId: string;
  operationId: string;
  query: string;
  language: string;
  region: string;
  createdAt: string;
  deadlineAt: string;
  qualificationId: string;
  qualificationSha256: string;
  selectedCandidateCount: number;
  omittedCandidateCount: number;
  fetchedCount: number;
  extractedCount: number;
  retainedCount: number;
  rankedCount: number;
  candidateRecords: readonly Readonly<RetrievalAssemblyCandidateRecord>[];
  searchResponse: Readonly<SearchResponse>;
  provenance: readonly Readonly<RetrievalAssemblyProvenance>[];
  synthesisPerformed: false;
}

export interface RetrievalAssemblyDependencies {
  fetch?: (request: RetrievalFetchRequest, dependencies?: RetrievalFetchDependencies) => ReturnType<typeof fetchRetrieval>;
  extract?: typeof extractRetrieval;
  fetchByPath?: Readonly<Record<string, RetrievalFetchDependencies>>;
}

export interface AssembleRetrievalCandidatesInput {
  assemblyId: string;
  federation: RetrievalFederationReport;
  qualification: RetrievalQualificationSnapshot;
  createdAt: string;
  deadlineAt: string;
  maximumCandidates: number;
  maximumResults: number;
  maximumBytesPerCandidate: number;
  maximumOutputCharacters: number;
  workerTimeoutMs: number;
  nearDuplicateThresholdBasisPoints: number;
  userAgent: string;
  dependencies?: RetrievalAssemblyDependencies;
}

interface SuccessfulCandidate {
  candidate: Readonly<RetrievalFederationCandidate>;
  path: Readonly<RetrievalPathDecision>;
  fetchId: string;
  extractionId: string;
  extraction: Readonly<ExtractionRecord>;
}

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid_${name}`);
  return parsed;
}

function tokenCoverage(query: string, text: string): number {
  const queryTokens = [...new Set(query.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? [])];
  if (queryTokens.length === 0) return 0;
  const evidenceTokens = new Set(text.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? []);
  return Math.round(queryTokens.filter((token) => evidenceTokens.has(token)).length * 100 / queryTokens.length);
}

function deterministicId(prefix: string, assemblyId: string, index: number): string {
  return `${prefix}_${assemblyId.slice(4)}${String(index + 1).padStart(3, '0')}`;
}

function qualificationHash(snapshot: RetrievalQualificationSnapshot): string {
  return hashJson(JSON.parse(JSON.stringify({
    contractVersion: snapshot.contractVersion,
    qualificationId: snapshot.qualificationId,
    evaluatedAt: snapshot.evaluatedAt,
    paths: snapshot.paths,
    independentFailureDomains: snapshot.independentFailureDomains,
    twoPathGatePassed: snapshot.twoPathGatePassed,
  })));
}

function validateQualification(input: AssembleRetrievalCandidatesInput): Readonly<RetrievalQualificationSnapshot> {
  const qualification = createRetrievalQualificationSnapshot(input.qualification.qualificationId, input.qualification.evaluatedAt, input.qualification.paths);
  if (!qualification.twoPathGatePassed || qualification.paths.length !== 2) throw new Error('assembly_qualification_closed');
  if (qualification.qualificationId !== input.federation.qualificationId || qualificationHash(qualification) !== input.federation.qualificationSha256) throw new Error('assembly_qualification_mismatch');
  const createdMs = timestamp(input.createdAt, 'assembly_created_at');
  if (qualification.paths.some((path) => Date.parse(path.expiresAt) <= createdMs || !path.allowedContentUse.includes('transient_extraction'))) throw new Error('assembly_content_use_not_allowed');
  return qualification;
}

function validateFederation(report: RetrievalFederationReport, createdMs: number): void {
  if (report.contractVersion !== CONTRACT_VERSION || !/^fed_[A-Za-z0-9]{20,64}$/u.test(report.federationId)) throw new Error('invalid_assembly_federation');
  if (!/^op_[A-Za-z0-9]{20,64}$/u.test(report.operationId) || report.query.length < 1 || report.query.length > 2_000) throw new Error('invalid_assembly_federation');
  const locale = normalizeSearchLocaleOptions(report);
  if (locale.language !== report.language || locale.region !== report.region) throw new Error('invalid_assembly_federation');
  if (report.attempts.length !== 2 || report.attempts[0]?.role !== 'primary' || report.attempts[1]?.role !== 'fallback') throw new Error('invalid_assembly_federation');
  if (report.attempts.some((attempt) => timestamp(attempt.completedAt, 'assembly_attempt_completed_at') > createdMs)) throw new Error('invalid_assembly_federation');
  const observations = new Set<string>();
  for (const candidate of report.candidates) {
    if (observations.has(candidate.observationId)) throw new Error('invalid_assembly_federation');
    observations.add(candidate.observationId);
    const attempt = report.attempts.find((item) => item.pathId === candidate.pathId && item.providerId === candidate.providerId);
    if (attempt?.outcome !== 'succeeded' || attempt.rawResponseSha256 !== candidate.rawResponseSha256 || candidate.sourceOrdinal > attempt.candidateCount) throw new Error('invalid_assembly_federation');
    if (!/^obs_[A-Za-z0-9_]{20,90}$/u.test(candidate.observationId) || !/^sha256:[a-f0-9]{64}$/u.test(candidate.rawResponseSha256)) throw new Error('invalid_assembly_federation');
    if (candidate.title.length < 1 || candidate.title.length > 500 || candidate.snippet.length < 1 || candidate.snippet.length > 5_000) throw new Error('invalid_assembly_federation');
    if (timestamp(candidate.retrievedAt, 'assembly_candidate_retrieved_at') > createdMs) throw new Error('invalid_assembly_federation');
    try {
      const url = new URL(candidate.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') throw new Error('invalid');
    } catch {
      throw new Error('invalid_assembly_federation');
    }
  }
  for (const attempt of report.attempts) {
    if (report.candidates.filter((candidate) => candidate.pathId === attempt.pathId).length !== attempt.candidateCount) throw new Error('invalid_assembly_federation');
  }
}

async function beforeDeadline<T>(promise: Promise<T>, deadlineMs: number): Promise<T> {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) throw new Error('assembly_deadline_exceeded');
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('assembly_deadline_exceeded')), remaining); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function freezeRecord(record: RetrievalAssemblyCandidateRecord): Readonly<RetrievalAssemblyCandidateRecord> {
  return Object.freeze({ ...record });
}

export async function assembleRetrievalCandidates(input: AssembleRetrievalCandidatesInput): Promise<Readonly<RetrievalAssemblyReport>> {
  if (!/^asm_[A-Za-z0-9]{20,55}$/u.test(input.assemblyId)) throw new Error('invalid_assembly_id');
  const createdMs = timestamp(input.createdAt, 'assembly_created_at');
  validateFederation(input.federation, createdMs);
  const qualification = validateQualification(input);
  const deadlineMs = timestamp(input.deadlineAt, 'assembly_deadline_at');
  if (deadlineMs <= createdMs || deadlineMs - createdMs > maximumAssemblyWindowMs) throw new Error('invalid_assembly_deadline');
  if (!Number.isInteger(input.maximumCandidates) || input.maximumCandidates < 1 || input.maximumCandidates > maximumAssemblyCandidates) throw new Error('invalid_assembly_candidate_limit');
  if (!Number.isInteger(input.maximumResults) || input.maximumResults < 1 || input.maximumResults > input.maximumCandidates) throw new Error('invalid_assembly_result_limit');
  if (!Number.isSafeInteger(input.maximumBytesPerCandidate) || input.maximumBytesPerCandidate < 1 || input.maximumBytesPerCandidate > 2 * 1024 * 1024) throw new Error('invalid_assembly_byte_limit');
  if (!Number.isSafeInteger(input.maximumOutputCharacters) || input.maximumOutputCharacters < 1 || input.maximumOutputCharacters > 100_000) throw new Error('invalid_assembly_output_limit');
  if (!Number.isSafeInteger(input.workerTimeoutMs) || input.workerTimeoutMs < 1 || input.workerTimeoutMs > 5_000) throw new Error('invalid_assembly_worker_timeout');
  if (!Number.isInteger(input.nearDuplicateThresholdBasisPoints) || input.nearDuplicateThresholdBasisPoints < 5_000 || input.nearDuplicateThresholdBasisPoints > 10_000) throw new Error('invalid_assembly_duplicate_threshold');
  if (!/^[\x20-\x7e]{1,256}$/u.test(input.userAgent) || input.userAgent.trim() === '') throw new Error('invalid_assembly_user_agent');

  const paths = new Map(qualification.paths.map((path) => [path.pathId, path]));
  for (const candidate of input.federation.candidates) {
    const path = paths.get(candidate.pathId);
    if (path === undefined || path.providerId !== candidate.providerId) throw new Error('assembly_candidate_path_mismatch');
  }
  const selected = input.federation.candidates.slice(0, input.maximumCandidates);
  const omitted = input.federation.candidates.slice(input.maximumCandidates);
  const fetcher = input.dependencies?.fetch ?? fetchRetrieval;
  const extractor = input.dependencies?.extract ?? extractRetrieval;
  const processed = await Promise.all(selected.map(async (candidate, index): Promise<{ success?: SuccessfulCandidate; record: Readonly<RetrievalAssemblyCandidateRecord> }> => {
    const path = paths.get(candidate.pathId)!;
    const fetchId = deterministicId('fetch', input.assemblyId, index);
    const extractionId = deterministicId('extract', input.assemblyId, index);
    const base = { observationId: candidate.observationId, pathId: candidate.pathId, providerId: candidate.providerId, sourceOrdinal: candidate.sourceOrdinal, rawResponseSha256: candidate.rawResponseSha256, requestedUrl: candidate.url, fetchId };
    let fetched;
    try {
      fetched = await beforeDeadline(fetcher({ fetchId, url: candidate.url, mode: 'transient_extraction', providerAllowedContentUse: path.allowedContentUse, maximumBytes: input.maximumBytesPerCandidate, deadlineAt: input.deadlineAt, userAgent: input.userAgent }, input.dependencies?.fetchByPath?.[candidate.pathId]), deadlineMs);
    } catch {
      return { record: freezeRecord({ ...base, outcome: 'fetch_rejected', failureCode: 'fetch_rejected' }) };
    }
    if (fetched.receipt.outcome !== 'succeeded' || fetched.body === undefined) return { record: freezeRecord({ ...base, outcome: 'fetch_rejected', failureCode: 'fetch_rejected' }) };
    try {
      const extraction = await beforeDeadline(extractor({ extractionId, receipt: fetched.receipt, body: fetched.body, maximumOutputCharacters: input.maximumOutputCharacters, workerTimeoutMs: input.workerTimeoutMs }), deadlineMs);
      return {
        success: { candidate, path, fetchId, extractionId, extraction },
        record: freezeRecord({ ...base, extractionId, finalUrl: extraction.finalUrl, bodySha256: extraction.sourceBodySha256, normalizedTextSha256: extraction.normalizedTextSha256, outcome: 'retained_unranked' }),
      };
    } catch {
      return { record: freezeRecord({ ...base, extractionId, outcome: 'extraction_failed', failureCode: 'extraction_failed' }) };
    }
  }));

  const successes = processed.flatMap((item) => item.success === undefined ? [] : [item.success]);
  const deduplication = deduplicateExtractedContent({ batchId: deterministicId('batch', input.assemblyId, 0), records: successes.map((item) => item.extraction), nearDuplicateThresholdBasisPoints: input.nearDuplicateThresholdBasisPoints });
  const successByExtraction = new Map(successes.map((item) => [item.extractionId, item]));
  const evidence = deduplication.results.filter((item) => item.disposition === 'retained').map((item) => {
    const success = successByExtraction.get(item.extraction.extractionId)!;
    return {
      resultId: deterministicId('sr', input.assemblyId, selected.indexOf(success.candidate)),
      sourceId: `adapter_${success.path.providerId.slice('provider_'.length)}`,
      url: item.extraction.finalUrl,
      title: success.candidate.title,
      snippet: success.candidate.snippet.slice(0, 2_000),
      evidenceText: item.extraction.normalizedText,
      retrievedAt: success.candidate.retrievedAt,
      authorityScore: 60,
      relevanceScore: tokenCoverage(input.federation.query, `${success.candidate.title}\n${success.candidate.snippet}\n${item.extraction.normalizedText}`),
    };
  });
  const ranked = createSearchResponse({ operationId: input.federation.operationId, query: input.federation.query, language: input.federation.language, region: input.federation.region, now: input.createdAt, maxResults: input.maximumResults, evidence });
  const citations = ranked.results.map((result) => ({ citationId: deterministicId('cite', input.assemblyId, selected.findIndex((candidate) => deterministicId('sr', input.assemblyId, selected.indexOf(candidate)) === result.resultId)), resultId: result.resultId, canonicalUrl: result.canonicalUrl, quote: result.evidenceText.slice(0, Math.min(1_000, result.evidenceText.length)), startOffset: 0, endOffset: Math.min(1_000, result.evidenceText.length) }));
  const searchResponse = createSearchResponse({ operationId: input.federation.operationId, query: input.federation.query, language: input.federation.language, region: input.federation.region, now: input.createdAt, maxResults: input.maximumResults, evidence, citations });
  const rankedByExtraction = new Map<string, { resultId: string; citationId: string }>();
  for (const result of searchResponse.results) {
    const success = successes.find((item) => deterministicId('sr', input.assemblyId, selected.indexOf(item.candidate)) === result.resultId)!;
    rankedByExtraction.set(success.extractionId, { resultId: result.resultId, citationId: searchResponse.citations.find((citation) => citation.resultId === result.resultId)!.citationId });
  }
  const dispositionByExtraction = new Map(deduplication.results.map((item) => [item.extraction.extractionId, item]));
  const candidateRecords = processed.map((item) => {
    if (item.success === undefined) return item.record;
    const disposition = dispositionByExtraction.get(item.success.extractionId)!;
    const rankedIdentity = rankedByExtraction.get(item.success.extractionId);
    return freezeRecord({ ...item.record, outcome: disposition.disposition === 'retained' ? (rankedIdentity === undefined ? 'retained_unranked' : 'ranked') : disposition.disposition, ...(disposition.duplicateOfExtractionId === undefined ? {} : { duplicateOfExtractionId: disposition.duplicateOfExtractionId }), similarityBasisPoints: disposition.similarityBasisPoints, ...(rankedIdentity ?? {}) });
  });
  candidateRecords.push(...omitted.map((candidate) => freezeRecord({ observationId: candidate.observationId, pathId: candidate.pathId, providerId: candidate.providerId, sourceOrdinal: candidate.sourceOrdinal, rawResponseSha256: candidate.rawResponseSha256, requestedUrl: candidate.url, outcome: 'candidate_limit', failureCode: 'candidate_limit' })));
  const provenance = searchResponse.results.map((result) => {
    const success = successes.find((item) => deterministicId('sr', input.assemblyId, selected.indexOf(item.candidate)) === result.resultId)!;
    const citationId = searchResponse.citations.find((citation) => citation.resultId === result.resultId)!.citationId;
    return Object.freeze({ resultId: result.resultId, citationId, observationId: success.candidate.observationId, pathId: success.candidate.pathId, providerId: success.candidate.providerId, sourceOrdinal: success.candidate.sourceOrdinal, rawResponseSha256: success.candidate.rawResponseSha256, fetchId: success.fetchId, extractionId: success.extractionId, sourceBodySha256: success.extraction.sourceBodySha256, normalizedTextSha256: success.extraction.normalizedTextSha256 });
  });
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    assemblyId: input.assemblyId,
    federationId: input.federation.federationId,
    operationId: input.federation.operationId,
    query: input.federation.query,
    language: input.federation.language,
    region: input.federation.region,
    createdAt: input.createdAt,
    deadlineAt: input.deadlineAt,
    qualificationId: qualification.qualificationId,
    qualificationSha256: input.federation.qualificationSha256,
    selectedCandidateCount: selected.length,
    omittedCandidateCount: omitted.length,
    fetchedCount: successes.length + processed.filter((item) => item.record.outcome === 'extraction_failed').length,
    extractedCount: successes.length,
    retainedCount: deduplication.retainedCount,
    rankedCount: searchResponse.results.length,
    candidateRecords: Object.freeze(candidateRecords),
    searchResponse,
    provenance: Object.freeze(provenance),
    synthesisPerformed: false,
  });
}