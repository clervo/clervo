#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createFixtureRuntime } from './fixture-runtime.mjs';

const root = new URL('../../../', import.meta.url);
const mode = process.argv[2];
if (!['development', 'sealed-validation'].includes(mode)) throw new Error('usage: evaluate.mjs development|sealed-validation');
const split = mode === 'development' ? 'development' : 'sealed_validation';
const prefix = mode === 'development' ? 'development' : 'sealed-validation';
const outputRoot = new URL(`docs/evidence/n4.27r/${prefix}/`, root);
const corpusPath = `benchmarks/n4.27r/${prefix}-corpus.v1.json`;
const labelsPath = `benchmarks/n4.27r/${prefix}-labels.v1.json`;
const markerPath = new URL('benchmarks/n4.27r/sealed-validation-run.v1.json', root);
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const [manifestBytes, corpusBytes, labelBytes, catalogBytes] = await Promise.all([
  readFile(new URL('benchmarks/n4.27r/freeze-manifest.v1.json', root)), readFile(new URL(corpusPath, root)),
  readFile(new URL(labelsPath, root)), readFile(new URL('benchmarks/n4.27r/source-catalog.v1.json', root)),
]);
const manifest = JSON.parse(manifestBytes);
const corpus = JSON.parse(corpusBytes);
const labelFile = JSON.parse(labelBytes);
const catalog = JSON.parse(catalogBytes);
const artifactName = mode === 'development' ? ['developmentCorpus','developmentLabels'] : ['sealedValidationCorpus','sealedValidationLabels'];
for (const [name, bytes] of [[artifactName[0], corpusBytes], [artifactName[1], labelBytes], ['sourceCatalog', catalogBytes]]) if (manifest.artifacts[name].sha256 !== sha256(bytes)) throw new Error(`benchmark_freeze_drift:${name}`);
let implementationFreeze;
if (mode === 'sealed-validation') {
  try { await readFile(markerPath); throw new Error('sealed_validation_already_executed'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  implementationFreeze = JSON.parse(await readFile(new URL('benchmarks/n4.27r/implementation-freeze.v1.json', root)));
  for (const file of implementationFreeze.files) if (sha256(await readFile(new URL(file.path, root))) !== file.sha256) throw new Error(`implementation_freeze_drift:${file.path}`);
}
const labels = new Map(labelFile.labels.map((label) => [label.taskId, label]));
const vertical = Object.fromEntries(corpus.tasks.map((task) => [task.id, task.verticalProfile]));
const scenarios = ['focused_index','live_federation','simple_combination','repaired_balanced'];
const normalizeUrl = (value) => value.toLocaleLowerCase('en-US').replace(/^https?:\/\/(?:www\.)?/u, '').replace(/\/$/u, '');
const canonical = (result) => result.canonicalUrl ?? result.url ?? '';
const quantile = (values, fraction) => [...values].sort((left, right) => left - right)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] ?? 0;
const mean = (values) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const round = (value, digits = 4) => Number(value.toFixed(digits));
const dcg = (grades) => grades.reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);

function resultMatch(result, qrel) {
  const text = `${result.title ?? ''}\n${result.evidenceText ?? ''}`.toLocaleLowerCase('en-US');
  return normalizeUrl(canonical(result)).startsWith(normalizeUrl(qrel.url)) && qrel.requiredEvidenceTerms.every((term) => text.includes(term));
}
function citationValid(payload) {
  if ((payload.results ?? []).length === 0) return (payload.citations ?? []).length === 0;
  return (payload.citations ?? []).length === payload.results.length && payload.citations.every((citation) => {
    const result = payload.results.find((candidate) => candidate.resultId === citation.resultId);
    return result !== undefined && citation.canonicalUrl === canonical(result) && citation.extractionId === result.extraction?.extractionId && result.evidenceText.slice(citation.startOffset, citation.endOffset) === citation.quote;
  });
}
function measure(task, payload) {
  const label = labels.get(task.id);
  const results = payload.results ?? [];
  const matches = results.map((result, rank) => ({ result, rank, qrel: label.expected.find((qrel) => resultMatch(result, qrel)) })).filter((item) => item.qrel !== undefined);
  const matchedUrls = new Set(matches.map((item) => item.qrel.url));
  const answerable = !label.noResult;
  const recall = answerable ? matchedUrls.size / label.expected.length : null;
  const precision = answerable ? (results.length === 0 ? 0 : matches.length / results.length) : null;
  const grades = results.slice(0, 10).map((result) => label.expected.find((qrel) => resultMatch(result, qrel))?.grade ?? 0);
  const ideal = [...label.expected].sort((left, right) => right.grade - left.grade).slice(0, 10).map((qrel) => qrel.grade);
  const first = matches[0]?.rank;
  return {
    answerable, recall, precision, citationValidity: citationValid(payload) ? 1 : 0,
    ndcg10: answerable && dcg(ideal) > 0 ? dcg(grades) / dcg(ideal) : null,
    mrr10: answerable ? (first === undefined || first >= 10 ? 0 : 1 / (first + 1)) : null,
    success3: answerable ? (first !== undefined && first < 3 ? 1 : 0) : null,
    honestNoResult: label.noResult ? (results.length === 0 ? 1 : 0) : null,
    localeCorrectness: payload.language === task.locale.language && payload.region === task.locale.region ? 1 : 0,
    relevantResultCount: matches.length,
    resultCount: results.length,
    relevantAdapters: [...new Set(matches.map((item) => item.result.adapterId))],
    relevantUrls: [...matchedUrls],
  };
}

async function execute(runtime, task, scenario, sequence) {
  const request = { query: task.query, language: task.locale.language, region: task.locale.region, maximumResults: 10, generatedAt: '2026-07-31T21:10:00.000Z', deadlineAt: '2026-07-31T21:10:01.500Z', signal: new AbortController().signal };
  const started = performance.now();
  let payload;
  if (scenario === 'focused_index') {
    const results = await runtime.focused.search(request);
    payload = { status: 'ready', language: task.locale.language, region: task.locale.region, results, citations: [] };
  } else if (scenario === 'live_federation') {
    const results = await runtime.live.search(request).catch(() => []);
    payload = { status: 'ready', language: task.locale.language, region: task.locale.region, results, citations: [] };
  } else if (scenario === 'simple_combination') {
    const [focused, live] = await Promise.all([runtime.focused.search(request).catch(() => []), runtime.live.search(request).catch(() => [])]);
    payload = { status: 'ready', language: task.locale.language, region: task.locale.region, results: [...focused, ...live].slice(0, 10), citations: [] };
  } else {
    payload = await runtime.pipeline.searchWeb({ operationId: `op_${createHash('sha256').update(`${mode}:${sequence}:${task.query}`).digest('hex').slice(0, 32)}`, query: task.query, language: task.locale.language, region: task.locale.region, maximumResults: 10, generatedAt: request.generatedAt, deadlineMs: 1_500, verticalProfile: vertical[task.id], operatingProfile: 'balanced' });
  }
  return { durationMs: performance.now() - started, payload };
}

const rows = [];
for (const scenario of scenarios) {
  const runtime = createFixtureRuntime(catalog, split);
  for (const [sequence, task] of corpus.tasks.entries()) {
    const execution = await execute(runtime, task, scenario, sequence);
    rows.push({ scenario, task, execution, metrics: measure(task, execution.payload) });
  }
}
function aggregate(inputRows) {
  const answerable = inputRows.filter((row) => row.metrics.answerable);
  const noResult = inputRows.filter((row) => !row.metrics.answerable);
  const result = {
    tasks: inputRows.length, answerableTasks: answerable.length, noResultTasks: noResult.length,
    recall: round(mean(answerable.map((row) => row.metrics.recall))),
    precision: round(answerable.reduce((sum, row) => sum + row.metrics.resultCount, 0) === 0 ? 0 : answerable.reduce((sum, row) => sum + row.metrics.relevantResultCount, 0) / answerable.reduce((sum, row) => sum + row.metrics.resultCount, 0)),
    citationValidity: round(mean(inputRows.map((row) => row.metrics.citationValidity))),
    nDCG10: round(mean(answerable.map((row) => row.metrics.ndcg10))),
    MRR10: round(mean(answerable.map((row) => row.metrics.mrr10))),
    success3: round(mean(answerable.map((row) => row.metrics.success3))),
    honestNoResult: round(mean(noResult.map((row) => row.metrics.honestNoResult))),
    localeCorrectness: round(mean(inputRows.map((row) => row.metrics.localeCorrectness))),
    latencyMs: { p50: round(quantile(inputRows.map((row) => row.execution.durationMs), 0.5), 3), p95: round(quantile(inputRows.map((row) => row.execution.durationMs), 0.95), 3) },
  };
  result.retrievalQualityScore = round(result.recall * 0.35 + result.precision * 0.25 + result.nDCG10 * 0.20 + result.MRR10 * 0.15 + result.success3 * 0.05);
  return result;
}
const scorecards = Object.fromEntries(scenarios.map((scenario) => [scenario, aggregate(rows.filter((row) => row.scenario === scenario))]));
const familyScorecards = Object.fromEntries([...new Set(corpus.tasks.map((task) => task.family))].map((family) => [family, aggregate(rows.filter((row) => row.scenario === 'repaired_balanced' && row.task.family === family))]));
const focusedRows = new Map(rows.filter((row) => row.scenario === 'focused_index').map((row) => [row.task.id, row]));
const liveRows = rows.filter((row) => row.scenario === 'live_federation');
const focusedMisses = liveRows.filter((row) => row.metrics.answerable && focusedRows.get(row.task.id).metrics.recall === 0);
const contributed = focusedMisses.filter((row) => row.metrics.recall > 0);
const contributionCounts = Object.fromEntries(Object.entries(Object.groupBy(contributed.flatMap((row) => row.metrics.relevantAdapters), (value) => value)).map(([adapter, values]) => [adapter, values.length]).sort());
const totalContributions = Object.values(contributionCounts).reduce((sum, value) => sum + value, 0);
const liveContribution = { focusedMissTasks: focusedMisses.length, tasksWithUniqueRelevantLiveContribution: contributed.length, uniqueContributionRate: round(contributed.length / Math.max(1, focusedMisses.length)), byAdapter: contributionCounts, largestSourceShare: round(Math.max(0, ...Object.values(contributionCounts)) / Math.max(1, totalContributions)) };
const candidateRows = rows.filter((row) => row.scenario === 'repaired_balanced');
const unexplainedLosses = candidateRows.filter((row) => row.metrics.answerable && row.metrics.recall < Math.max(focusedRows.get(row.task.id).metrics.recall, liveRows.find((item) => item.task.id === row.task.id).metrics.recall)).map((row) => row.task.id);
const gates = {
  recall: scorecards.repaired_balanced.recall >= (mode === 'development' ? 0.92 : 0.90),
  precision: scorecards.repaired_balanced.precision >= (mode === 'development' ? 0.88 : 0.86),
  citationValidity: scorecards.repaired_balanced.citationValidity >= 0.98,
  ranking: scorecards.repaired_balanced.nDCG10 >= (mode === 'development' ? 0.88 : 0.86) && scorecards.repaired_balanced.MRR10 >= (mode === 'development' ? 0.85 : 0.83) && scorecards.repaired_balanced.success3 >= (mode === 'development' ? 0.90 : 0.88),
  familyFloors: Object.values(familyScorecards).every((family) => family.recall >= (mode === 'development' ? 0.85 : 0.82) && family.precision >= (mode === 'development' ? 0.85 : 0.82)),
  combinedAddsValue: scorecards.repaired_balanced.retrievalQualityScore >= scorecards.simple_combination.retrievalQualityScore + 0.03,
  noUnexplainedRelevantLoss: unexplainedLosses.length === 0,
  liveQuality: scorecards.live_federation.recall >= 0.35 && scorecards.live_federation.precision >= 0.60 && scorecards.live_federation.latencyMs.p95 <= 4_000,
  liveUniqueContribution: liveContribution.uniqueContributionRate >= 0.30,
  liveSourceDiversity: liveContribution.largestSourceShare <= 0.70,
  balancedP95: scorecards.repaired_balanced.latencyMs.p95 <= 2_000,
  honestNoResult: scorecards.repaired_balanced.honestNoResult === 1,
  localeExplicit: scorecards.repaired_balanced.localeCorrectness === 1,
};
const generatedAt = new Date().toISOString();
const report = { schemaVersion: 'clervo.n4.27r.scorecard.v1', generatedAt, mode, executionCount: corpus.tasks.length, corpus: { path: corpusPath, sha256: sha256(corpusBytes) }, labels: { path: labelsPath, sha256: sha256(labelBytes) }, benchmarkFreezeSha256: sha256(manifestBytes), ...(implementationFreeze === undefined ? {} : { implementationFreezeSha256: sha256(await readFile(new URL('benchmarks/n4.27r/implementation-freeze.v1.json', root))) }), evaluatorCorrections: ['answerable_recall_separate_from_no_result_accuracy','precision_is_relevant_results_divided_by_returned_results','no_result_excluded_from_ndcg_and_mrr','explicit_locale_required','combined_additive_value_uses_retrieval_metrics_only'], scorecards, familyScorecards, liveContribution, unexplainedLosses, gates, mandatoryQualityGatePass: Object.values(gates).every(Boolean), browserAndSecurityGateBoundSeparately: true };
await mkdir(outputRoot, { recursive: true });
const rawBytes = gzipSync(`${JSON.stringify({ schemaVersion: 'clervo.n4.27r.raw-results.v1', generatedAt, mode, rows })}\n`, { level: 9 });
report.rawArtifact = { path: `docs/evidence/n4.27r/${prefix}/raw-results.v1.json.gz`, sha256: sha256(rawBytes), rows: rows.length };
const reportBytes = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(new URL('raw-results.v1.json.gz', outputRoot), rawBytes);
await writeFile(new URL('scorecard.v1.json', outputRoot), reportBytes);
if (mode === 'sealed-validation') await writeFile(markerPath, `${JSON.stringify({ schemaVersion: 'clervo.n4.27r.sealed-validation-run.v1', executedAt: generatedAt, runCount: 1, scorecardSha256: sha256(reportBytes), rawSha256: sha256(rawBytes), mandatoryQualityGatePass: report.mandatoryQualityGatePass }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ mode, mandatoryQualityGatePass: report.mandatoryQualityGatePass, gates, scorecards, liveContribution })}\n`);
