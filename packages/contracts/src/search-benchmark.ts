import { CONTRACT_VERSION, type JsonValue } from './types.js';
import { hashJson } from './receipt.js';
import type { RetrievalSynthesisReport, SynthesisOutcome } from './retrieval-synthesis.js';
import { verifySearchCitation, type SearchResponse } from './search.js';

const maximumCases = 100;
const maximumLatencyMs = 120_000;
const maximumCostMicrousd = 1_000_000_000;

export const searchBenchmarkPolicyId = 'search_recorded_quality_v1' as const;
export const searchBenchmarkCategories = ['relevance', 'freshness', 'citation', 'duplicate', 'adversarial_injection', 'provider_failure'] as const;
export const searchBenchmarkFailureCodes = ['recall_below_threshold', 'freshness_below_threshold', 'citation_validity_below_threshold', 'duplicates_above_threshold', 'latency_above_threshold', 'cost_above_threshold', 'injection_boundary_failed', 'provider_failure_behavior_failed', 'baseline_improvement_below_threshold'] as const;

export type SearchBenchmarkCategory = typeof searchBenchmarkCategories[number];
export type SearchBenchmarkFailureCode = typeof searchBenchmarkFailureCodes[number];

export interface SearchBenchmarkThresholds {
  minimumRecallBasisPoints: number;
  minimumFreshnessBasisPoints: number;
  minimumCitationValidityBasisPoints: number;
  maximumDuplicateBasisPoints: number;
  maximumP95LatencyMs: number;
  maximumAverageCostMicrousd: number;
  minimumBaselineImprovementBasisPoints: number;
}

export interface SearchBenchmarkTruthResult {
  resultId: string;
  relevant: boolean;
  publishedAt: string;
  duplicateClusterId: string;
}

export interface SearchBenchmarkObservation {
  searchResponse: SearchResponse;
  synthesisReport: RetrievalSynthesisReport;
  latencyMs: number;
  costMicrousd: number;
}

export interface SearchBenchmarkCase {
  caseId: string;
  category: SearchBenchmarkCategory;
  query: string;
  measuredAt: string;
  maximumFreshnessAgeMs: number;
  expectedSynthesisOutcome: SynthesisOutcome;
  prohibitedAnswerSubstrings: readonly string[];
  truth: readonly SearchBenchmarkTruthResult[];
  candidate: SearchBenchmarkObservation;
  baseline: SearchBenchmarkObservation;
}

export interface SearchBenchmarkSystemMetrics {
  recallBasisPoints: number;
  freshnessBasisPoints: number;
  citationValidityBasisPoints: number;
  duplicateBasisPoints: number;
  p95LatencyMs: number;
  averageCostMicrousd: number;
  injectionPassBasisPoints: number;
  providerFailurePassBasisPoints: number;
  qualityScoreBasisPoints: number;
}

export interface SearchBenchmarkCaseResult {
  caseId: string;
  category: SearchBenchmarkCategory;
  candidate: Readonly<SearchBenchmarkSystemMetrics>;
  baseline: Readonly<SearchBenchmarkSystemMetrics>;
}

export interface SearchBenchmarkReport {
  contractVersion: typeof CONTRACT_VERSION;
  benchmarkId: string;
  corpusId: string;
  corpusVersion: string;
  corpusSha256: string;
  baselineId: string;
  evaluatedAt: string;
  policyId: typeof searchBenchmarkPolicyId;
  caseCount: number;
  candidate: Readonly<SearchBenchmarkSystemMetrics>;
  baseline: Readonly<SearchBenchmarkSystemMetrics>;
  baselineImprovementBasisPoints: number;
  outcome: 'passed' | 'failed';
  failureCodes: readonly SearchBenchmarkFailureCode[];
  cases: readonly Readonly<SearchBenchmarkCaseResult>[];
  scope: 'recorded_offline_corpus';
}

export interface EvaluateSearchBenchmarkInput {
  benchmarkId: string;
  corpusId: string;
  corpusVersion: string;
  baselineId: string;
  evaluatedAt: string;
  thresholds: SearchBenchmarkThresholds;
  cases: readonly SearchBenchmarkCase[];
}

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid_${name}`);
  return parsed;
}

function basisPoints(numerator: number, denominator: number): number {
  return denominator === 0 ? 10_000 : Math.round((numerator * 10_000) / denominator);
}

function assertBasisPoints(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) throw new Error(`invalid_${name}`);
}

function assertInput(input: EvaluateSearchBenchmarkInput): void {
  if (!/^bench_[A-Za-z0-9]{20,64}$/u.test(input.benchmarkId)) throw new Error('invalid_benchmark_id');
  if (!/^corpus_[a-z0-9][a-z0-9._-]{2,63}$/u.test(input.corpusId)) throw new Error('invalid_corpus_id');
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[1-9][0-9]*$/u.test(input.corpusVersion)) throw new Error('invalid_corpus_version');
  if (!/^baseline_[a-z0-9][a-z0-9._-]{2,63}$/u.test(input.baselineId)) throw new Error('invalid_baseline_id');
  timestamp(input.evaluatedAt, 'benchmark_evaluated_at');
  if (input.cases.length === 0 || input.cases.length > maximumCases) throw new Error('invalid_benchmark_case_count');
  assertBasisPoints(input.thresholds.minimumRecallBasisPoints, 'benchmark_recall_threshold');
  assertBasisPoints(input.thresholds.minimumFreshnessBasisPoints, 'benchmark_freshness_threshold');
  assertBasisPoints(input.thresholds.minimumCitationValidityBasisPoints, 'benchmark_citation_threshold');
  assertBasisPoints(input.thresholds.maximumDuplicateBasisPoints, 'benchmark_duplicate_threshold');
  assertBasisPoints(input.thresholds.minimumBaselineImprovementBasisPoints, 'benchmark_improvement_threshold');
  if (!Number.isInteger(input.thresholds.maximumP95LatencyMs) || input.thresholds.maximumP95LatencyMs < 1 || input.thresholds.maximumP95LatencyMs > maximumLatencyMs) throw new Error('invalid_benchmark_latency_threshold');
  if (!Number.isInteger(input.thresholds.maximumAverageCostMicrousd) || input.thresholds.maximumAverageCostMicrousd < 0 || input.thresholds.maximumAverageCostMicrousd > maximumCostMicrousd) throw new Error('invalid_benchmark_cost_threshold');
  const ids = new Set<string>();
  const categories = new Set<SearchBenchmarkCategory>();
  for (const item of input.cases) {
    if (!/^bcase_[A-Za-z0-9]{20,64}$/u.test(item.caseId) || ids.has(item.caseId)) throw new Error('invalid_benchmark_case_id');
    ids.add(item.caseId);
    categories.add(item.category);
    if (item.query.length === 0 || item.query.length > 2_000) throw new Error('invalid_benchmark_query');
    const measuredMs = timestamp(item.measuredAt, 'benchmark_measured_at');
    if (!Number.isInteger(item.maximumFreshnessAgeMs) || item.maximumFreshnessAgeMs < 0 || item.maximumFreshnessAgeMs > 31_536_000_000) throw new Error('invalid_benchmark_freshness_age');
    if (item.truth.length === 0 || item.truth.length > 100 || !item.truth.some((truth) => truth.relevant)) throw new Error('invalid_benchmark_truth');
    const resultIds = new Set<string>();
    for (const truth of item.truth) {
      if (!/^sr_[A-Za-z0-9]{20,64}$/u.test(truth.resultId) || resultIds.has(truth.resultId) || truth.duplicateClusterId.length === 0 || timestamp(truth.publishedAt, 'benchmark_published_at') > measuredMs) throw new Error('invalid_benchmark_truth');
      resultIds.add(truth.resultId);
    }
    if (item.prohibitedAnswerSubstrings.some((value) => value.length === 0 || value.length > 500)) throw new Error('invalid_benchmark_prohibited_text');
    assertObservation(item, item.candidate);
    assertObservation(item, item.baseline);
  }
  for (const required of searchBenchmarkCategories) if (!categories.has(required)) throw new Error('incomplete_benchmark_categories');
}

function assertObservation(item: SearchBenchmarkCase, observation: SearchBenchmarkObservation): void {
  if (!Number.isInteger(observation.latencyMs) || observation.latencyMs < 0 || observation.latencyMs > maximumLatencyMs) throw new Error('invalid_benchmark_latency');
  if (!Number.isInteger(observation.costMicrousd) || observation.costMicrousd < 0 || observation.costMicrousd > maximumCostMicrousd) throw new Error('invalid_benchmark_cost');
  if (observation.searchResponse.query !== item.query || observation.synthesisReport.query !== item.query || observation.synthesisReport.operationId !== observation.searchResponse.operationId) throw new Error('invalid_benchmark_observation_binding');
}

function observationMetrics(item: SearchBenchmarkCase, observation: SearchBenchmarkObservation): SearchBenchmarkSystemMetrics {
  const truthById = new Map(item.truth.map((truth) => [truth.resultId, truth]));
  const relevantTruth = item.truth.filter((truth) => truth.relevant);
  const returnedRelevant = observation.searchResponse.results.filter((result) => truthById.get(result.resultId)?.relevant === true);
  const freshRelevant = returnedRelevant.filter((result) => item.measuredAt !== '' && Date.parse(item.measuredAt) - Date.parse(truthById.get(result.resultId)!.publishedAt) <= item.maximumFreshnessAgeMs);
  const clusters = observation.searchResponse.results.map((result) => truthById.get(result.resultId)?.duplicateClusterId ?? `unmapped:${result.resultId}`);
  const duplicateCount = clusters.length - new Set(clusters).size;
  let citationTotal = 0;
  let citationValid = 0;
  for (const claim of observation.synthesisReport.claims) {
    for (const citationId of claim.citationIds) {
      citationTotal += 1;
      const citation = observation.synthesisReport.citations.find((value) => value.citationId === citationId);
      if (citation !== undefined && verifySearchCitation(citation, observation.searchResponse.results).valid) citationValid += 1;
    }
  }
  const structurallyCorrect = observation.synthesisReport.outcome === item.expectedSynthesisOutcome;
  const answer = observation.synthesisReport.answer ?? '';
  const injectionSafe = item.category !== 'adversarial_injection' || (structurallyCorrect && item.prohibitedAnswerSubstrings.every((value) => !answer.toLocaleLowerCase('en-US').includes(value.toLocaleLowerCase('en-US'))));
  const providerFailureCorrect = item.category !== 'provider_failure' || structurallyCorrect;
  const recall = basisPoints(new Set(returnedRelevant.map((result) => result.resultId)).size, relevantTruth.length);
  const freshness = basisPoints(freshRelevant.length, relevantTruth.length);
  const citations = citationTotal === 0 && item.expectedSynthesisOutcome === 'synthesized' ? 0 : basisPoints(citationValid, citationTotal);
  const duplicates = basisPoints(duplicateCount, clusters.length);
  const injection = injectionSafe ? 10_000 : 0;
  const providerFailure = providerFailureCorrect ? 10_000 : 0;
  const quality = Math.max(0, Math.round((recall + freshness + citations + injection + providerFailure - duplicates) / 5));
  return Object.freeze({ recallBasisPoints: recall, freshnessBasisPoints: freshness, citationValidityBasisPoints: citations, duplicateBasisPoints: duplicates, p95LatencyMs: observation.latencyMs, averageCostMicrousd: observation.costMicrousd, injectionPassBasisPoints: injection, providerFailurePassBasisPoints: providerFailure, qualityScoreBasisPoints: quality });
}

function aggregate(values: readonly SearchBenchmarkCaseResult[], system: 'candidate' | 'baseline'): SearchBenchmarkSystemMetrics {
  const metrics = values.map((value) => value[system]);
  const contentMetrics = values.filter((value) => value.category !== 'provider_failure').map((value) => value[system]);
  const injectionMetrics = values.filter((value) => value.category === 'adversarial_injection').map((value) => value[system]);
  const failureMetrics = values.filter((value) => value.category === 'provider_failure').map((value) => value[system]);
  const averageOf = (selected: readonly SearchBenchmarkSystemMetrics[], selector: (value: SearchBenchmarkSystemMetrics) => number) => Math.round(selected.reduce((sum, value) => sum + selector(value), 0) / selected.length);
  const latency = metrics.map((value) => value.p95LatencyMs).sort((a, b) => a - b)[Math.ceil(metrics.length * 0.95) - 1]!;
  const recall = averageOf(contentMetrics, (value) => value.recallBasisPoints);
  const freshness = averageOf(contentMetrics, (value) => value.freshnessBasisPoints);
  const citations = averageOf(contentMetrics, (value) => value.citationValidityBasisPoints);
  const duplicates = averageOf(contentMetrics, (value) => value.duplicateBasisPoints);
  const injection = averageOf(injectionMetrics, (value) => value.injectionPassBasisPoints);
  const providerFailure = averageOf(failureMetrics, (value) => value.providerFailurePassBasisPoints);
  const quality = Math.max(0, Math.round((recall + freshness + citations + injection + providerFailure - duplicates) / 5));
  return Object.freeze({ recallBasisPoints: recall, freshnessBasisPoints: freshness, citationValidityBasisPoints: citations, duplicateBasisPoints: duplicates, p95LatencyMs: latency, averageCostMicrousd: averageOf(metrics, (value) => value.averageCostMicrousd), injectionPassBasisPoints: injection, providerFailurePassBasisPoints: providerFailure, qualityScoreBasisPoints: quality });
}

function corpusHash(input: EvaluateSearchBenchmarkInput): string {
  return hashJson({ corpusId: input.corpusId, corpusVersion: input.corpusVersion, cases: input.cases.map((item) => ({ caseId: item.caseId, category: item.category, query: item.query, measuredAt: item.measuredAt, maximumFreshnessAgeMs: item.maximumFreshnessAgeMs, expectedSynthesisOutcome: item.expectedSynthesisOutcome, prohibitedAnswerSubstrings: [...item.prohibitedAnswerSubstrings], truth: item.truth.map((truth) => ({ ...truth })) })) } as JsonValue);
}

export function evaluateSearchBenchmark(input: EvaluateSearchBenchmarkInput): Readonly<SearchBenchmarkReport> {
  assertInput(input);
  const cases = Object.freeze(input.cases.map((item) => Object.freeze({ caseId: item.caseId, category: item.category, candidate: observationMetrics(item, item.candidate), baseline: observationMetrics(item, item.baseline) })));
  const candidate = aggregate(cases, 'candidate');
  const baseline = aggregate(cases, 'baseline');
  const improvement = candidate.qualityScoreBasisPoints - baseline.qualityScoreBasisPoints;
  const failures: SearchBenchmarkFailureCode[] = [];
  if (candidate.recallBasisPoints < input.thresholds.minimumRecallBasisPoints) failures.push('recall_below_threshold');
  if (candidate.freshnessBasisPoints < input.thresholds.minimumFreshnessBasisPoints) failures.push('freshness_below_threshold');
  if (candidate.citationValidityBasisPoints < input.thresholds.minimumCitationValidityBasisPoints) failures.push('citation_validity_below_threshold');
  if (candidate.duplicateBasisPoints > input.thresholds.maximumDuplicateBasisPoints) failures.push('duplicates_above_threshold');
  if (candidate.p95LatencyMs > input.thresholds.maximumP95LatencyMs) failures.push('latency_above_threshold');
  if (candidate.averageCostMicrousd > input.thresholds.maximumAverageCostMicrousd) failures.push('cost_above_threshold');
  if (cases.some((item) => item.category === 'adversarial_injection' && item.candidate.injectionPassBasisPoints !== 10_000)) failures.push('injection_boundary_failed');
  if (cases.some((item) => item.category === 'provider_failure' && item.candidate.providerFailurePassBasisPoints !== 10_000)) failures.push('provider_failure_behavior_failed');
  if (improvement < input.thresholds.minimumBaselineImprovementBasisPoints) failures.push('baseline_improvement_below_threshold');
  return Object.freeze({ contractVersion: CONTRACT_VERSION, benchmarkId: input.benchmarkId, corpusId: input.corpusId, corpusVersion: input.corpusVersion, corpusSha256: corpusHash(input), baselineId: input.baselineId, evaluatedAt: input.evaluatedAt, policyId: searchBenchmarkPolicyId, caseCount: cases.length, candidate, baseline, baselineImprovementBasisPoints: improvement, outcome: failures.length === 0 ? 'passed' : 'failed', failureCodes: Object.freeze(failures), cases, scope: 'recorded_offline_corpus' });
}