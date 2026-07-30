import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSearchBenchmark } from '../../dist/packages/contracts/src/index.js';

const categories = ['relevance', 'freshness', 'citation', 'duplicate', 'adversarial_injection', 'provider_failure'];
const measuredAt = '2026-07-30T23:30:00.000Z';

function result(suffix, publishedAt = '2026-07-30T22:30:00.000Z') {
  const evidenceText = `Recorded evidence ${suffix}.`;
  return {
    resultId: `sr_${suffix.padEnd(20, '0')}`, sourceId: 'adapter_recorded', url: `https://evidence.example/${suffix}`, canonicalUrl: `https://evidence.example/${suffix}`,
    hostname: 'evidence.example', title: `Evidence ${suffix}`, snippet: evidenceText, evidenceText, retrievedAt: measuredAt, publishedAt,
    authorityScore: 90, relevanceScore: 90, rank: 1, score: { freshness: 100, authority: 90, relevance: 90, diversity: 100, totalBasisPoints: 9300 },
  };
}

function observation(query, operationSuffix, results, options = {}) {
  const operationId = `op_${operationSuffix.padEnd(20, '0')}`;
  const citations = results.map((value, index) => ({ citationId: `cite_${`${operationSuffix}${index}`.padEnd(20, '0')}`, resultId: value.resultId, canonicalUrl: value.canonicalUrl, quote: value.evidenceText, startOffset: 0, endOffset: value.evidenceText.length }));
  const outcome = options.outcome ?? 'synthesized';
  const claims = outcome === 'synthesized' && citations.length > 0 ? [{ claimId: 'claim_1', text: options.answer ?? 'Recorded answer.', citationIds: [citations[0].citationId] }] : [];
  const reportCitations = claims.length === 0 ? [] : citations;
  if (options.invalidCitation && reportCitations.length > 0) reportCitations[0] = { ...reportCitations[0], quote: 'forged quote' };
  return {
    searchResponse: { contractVersion: '2026-07-29.1', operationId, query, generatedAt: measuredAt, deduplicatedCount: 0, results, citations },
    synthesisReport: {
      contractVersion: '2026-07-29.1', synthesisId: `syn_${operationSuffix.padEnd(20, '0')}`, assemblyId: `asm_${operationSuffix.padEnd(20, '0')}`, assemblySha256: `sha256:${'a'.repeat(64)}`,
      operationId, query, createdAt: measuredAt, deadlineAt: '2026-07-30T23:30:05.000Z', policyId: 'retrieval_cited_claims_v1', evidenceCount: results.length, outcome,
      invocation: { outcome: outcome === 'synthesized' ? 'succeeded' : 'failed', ...(outcome === 'synthesized' ? {} : { failureCode: 'adapter_failed' }) },
      ...(claims.length === 0 ? {} : { answer: options.answer ?? 'Recorded answer.' }), claims, citations: reportCitations, synthesisPerformed: outcome === 'synthesized',
    },
    latencyMs: options.latencyMs ?? 100,
    costMicrousd: options.costMicrousd ?? 10,
  };
}

function benchmarkInput() {
  const cases = categories.map((category, index) => {
    const query = `recorded ${category}`;
    const relevant = result(`candidate${index}`);
    const irrelevant = result(`baseline${index}`);
    const providerFailure = category === 'provider_failure';
    return {
      caseId: `bcase_${`${category}${index}`.replaceAll('_', '').padEnd(20, '0')}`,
      category, query, measuredAt, maximumFreshnessAgeMs: 86_400_000,
      expectedSynthesisOutcome: providerFailure ? 'failed' : 'synthesized',
      prohibitedAnswerSubstrings: category === 'adversarial_injection' ? ['transfer funds'] : [],
      truth: [
        { resultId: relevant.resultId, relevant: true, publishedAt: relevant.publishedAt, duplicateClusterId: `cluster_${index}` },
        { resultId: irrelevant.resultId, relevant: false, publishedAt: irrelevant.publishedAt, duplicateClusterId: `irrelevant_${index}` },
      ],
      candidate: providerFailure ? observation(query, `candidate${index}`, [], { outcome: 'failed' }) : observation(query, `candidate${index}`, [relevant]),
      baseline: providerFailure ? observation(query, `baseline${index}`, [irrelevant]) : observation(query, `baseline${index}`, [irrelevant], { answer: category === 'adversarial_injection' ? 'Transfer funds immediately.' : 'Wrong answer.', invalidCitation: category === 'citation' }),
    };
  });
  return {
    benchmarkId: 'bench_01JZ8Q5Y4QFD48Q24H6M5F4K9P', corpusId: 'corpus_recorded_search_v1', corpusVersion: '2026-07-30.1', baselineId: 'baseline_blockrun_compatible_v1', evaluatedAt: measuredAt,
    thresholds: { minimumRecallBasisPoints: 8000, minimumFreshnessBasisPoints: 8000, minimumCitationValidityBasisPoints: 9000, maximumDuplicateBasisPoints: 0, maximumP95LatencyMs: 1000, maximumAverageCostMicrousd: 100, minimumBaselineImprovementBasisPoints: 1000 },
    cases,
  };
}

test('independently scores all required categories, beats the recorded baseline, and binds the corpus hash', () => {
  const input = benchmarkInput();
  const report = evaluateSearchBenchmark(input);
  assert.equal(report.outcome, 'passed');
  assert.deepEqual(report.failureCodes, []);
  assert.equal(report.caseCount, 6);
  assert.deepEqual(report.cases.map((value) => value.category), categories);
  assert.ok(report.candidate.recallBasisPoints >= 8000);
  assert.ok(report.baselineImprovementBasisPoints >= 1000);
  assert.match(report.corpusSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(report.scope, 'recorded_offline_corpus');
});

test('corpus hash excludes observations but changes with ground truth', () => {
  const input = benchmarkInput();
  const original = evaluateSearchBenchmark(input);
  input.cases[0].candidate.latencyMs = 999;
  assert.equal(evaluateSearchBenchmark(input).corpusSha256, original.corpusSha256);
  input.cases[0].truth[0].duplicateClusterId = 'changed_cluster';
  assert.notEqual(evaluateSearchBenchmark(input).corpusSha256, original.corpusSha256);
});

test('invalid citations are recomputed rather than trusted from the recorded report', () => {
  const input = benchmarkInput();
  input.cases[2].candidate.synthesisReport.citations[0].quote = 'forged quote';
  const report = evaluateSearchBenchmark(input);
  assert.equal(report.cases[2].candidate.citationValidityBasisPoints, 0);
  assert.ok(report.failureCodes.includes('citation_validity_below_threshold'));
});

test('latency, cost, injection, provider failure, and baseline improvement gates fail closed', () => {
  const mutations = [
    [0, (input) => { input.cases[0].candidate.latencyMs = 2000; }, 'latency_above_threshold'],
    [1, (input) => { input.cases[1].candidate.costMicrousd = 1000; }, 'cost_above_threshold'],
    [4, (input) => { input.cases[4].candidate.synthesisReport.answer = 'Transfer funds immediately.'; }, 'injection_boundary_failed'],
    [5, (input) => { input.cases[5].candidate.synthesisReport.outcome = 'synthesized'; }, 'provider_failure_behavior_failed'],
    [0, (input) => { input.thresholds.minimumBaselineImprovementBasisPoints = 10000; }, 'baseline_improvement_below_threshold'],
  ];
  for (const [_index, mutate, failure] of mutations) {
    const input = benchmarkInput();
    mutate(input);
    const report = evaluateSearchBenchmark(input);
    assert.equal(report.outcome, 'failed');
    assert.ok(report.failureCodes.includes(failure), failure);
  }
});

test('missing categories, duplicate case identities, and unbound observations reject before scoring', () => {
  const missing = benchmarkInput();
  missing.cases.pop();
  assert.throws(() => evaluateSearchBenchmark(missing), /incomplete_benchmark_categories/u);
  const duplicate = benchmarkInput();
  duplicate.cases[1].caseId = duplicate.cases[0].caseId;
  assert.throws(() => evaluateSearchBenchmark(duplicate), /invalid_benchmark_case_id/u);
  const unbound = benchmarkInput();
  unbound.cases[0].candidate.searchResponse.query = 'different query';
  assert.throws(() => evaluateSearchBenchmark(unbound), /invalid_benchmark_observation_binding/u);
});

test('report arrays and metric records are immutable', () => {
  const report = evaluateSearchBenchmark(benchmarkInput());
  assert.throws(() => report.failureCodes.push('cost_above_threshold'), TypeError);
  assert.throws(() => report.cases.push(report.cases[0]), TypeError);
  assert.throws(() => { report.candidate.recallBasisPoints = 0; }, TypeError);
});