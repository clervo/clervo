#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';

const mode = process.argv[2] ?? 'canary';
if (!['canary','final'].includes(mode)) throw new Error('usage: evaluate-staging.mjs canary|final');
const baseUrl = process.env.CLERVO_N427S_BASE_URL ?? 'http://127.0.0.1:18080';
const corpus = JSON.parse(await readFile(new URL('../../../benchmarks/n4.27s/staging-corpus.v1.json', import.meta.url)));
const labelSet = JSON.parse(await readFile(new URL('../../../benchmarks/n4.27s/staging-labels.v1.json', import.meta.url)));
const labels = new Map(labelSet.labels.map((label) => [label.taskId, label]));
const markerUrl = new URL('../../../benchmarks/n4.27s/final-staging-run.v1.json', import.meta.url);
const outputRoot = new URL('../../../docs/evidence/n4.27s/final-quality/', import.meta.url);
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const round = (value, digits = 4) => Number(value.toFixed(digits));
const quantile = (values, fraction) => values.length === 0 ? 0 : [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];

if (mode === 'final') {
  try { await stat(markerUrl); throw new Error('n427s_final_staging_run_already_consumed'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(markerUrl, `${JSON.stringify({ schemaVersion: 'clervo.n4.27s.final-run.v1', runCount: 1, status: 'in_progress', startedAt: new Date().toISOString(), corpusSha256: hash(await readFile(new URL('../../../benchmarks/n4.27s/staging-corpus.v1.json', import.meta.url))), labelsSha256: hash(await readFile(new URL('../../../benchmarks/n4.27s/staging-labels.v1.json', import.meta.url))) }, null, 2)}\n`);
}

const tasks = mode === 'final' ? corpus.tasks : Object.values(Object.groupBy(corpus.tasks.filter((task) => task.answerable), (task) => task.family)).map((items) => items[0]);
const routes = mode === 'final' ? ['focused','live','simple','combined'] : ['combined'];
async function request(path, input) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  const payload = await response.json();
  return { status: response.status, durationMs: performance.now() - started, payload };
}
function resultUrl(result) { return result.canonicalUrl ?? result.url ?? ''; }
function isRelevant(result, label) {
  const text = `${result.title ?? ''} ${result.evidenceText ?? ''}`.toLocaleLowerCase('en-US');
  return label.expectedUrlPrefixes.some((prefix) => resultUrl(result).startsWith(prefix)) || label.expectedTerms.length > 0 && label.expectedTerms.every((term) => text.includes(term.toLocaleLowerCase('en-US')));
}
function measure(task, route, execution) {
  const label = labels.get(task.id); const results = Array.isArray(execution.payload?.results) ? execution.payload.results : [];
  const relevant = results.map((result, index) => ({ result, index })).filter(({ result }) => isRelevant(result, label));
  const answerable = !label.noResult;
  const recall = answerable ? Math.min(1, relevant.length) : results.length === 0 ? 1 : 0;
  const precision = answerable ? (results.length === 0 ? 0 : relevant.length / results.length) : results.length === 0 ? 1 : 0;
  const firstRank = relevant.length === 0 ? 0 : relevant[0].index + 1;
  const ndcg = answerable ? firstRank === 0 ? 0 : 1 / Math.log2(firstRank + 1) : results.length === 0 ? 1 : 0;
  const mrr = answerable ? firstRank === 0 ? 0 : 1 / firstRank : results.length === 0 ? 1 : 0;
  const citations = Array.isArray(execution.payload?.citations) ? execution.payload.citations : [];
  const validCitations = citations.filter((citation) => {
    const result = results.find((item) => item.resultId === citation.resultId);
    return result !== undefined && citation.canonicalUrl === result.canonicalUrl && citation.extractionId === result.extraction?.extractionId && citation.startOffset >= 0 && citation.endOffset <= result.evidenceText.length && result.evidenceText.slice(citation.startOffset, citation.endOffset) === citation.quote;
  });
  const citationValidity = route === 'combined' ? (citations.length === 0 ? (results.length === 0 ? 1 : 0) : validCitations.length / citations.length) : 0;
  const extraction = results.length === 0 ? (label.noResult ? 1 : 0) : results.filter((result) => typeof result.evidenceText === 'string' && result.evidenceText.length > 0 && /^sha256:[a-f0-9]{64}$/u.test(result.extraction?.sourceBodySha256 ?? '')).length / results.length;
  return { succeeded: execution.status === 200, answerable, resultCount: results.length, relevantCount: relevant.length, recall, precision, citationValidity, nDCG10: ndcg, MRR10: mrr, success3: answerable ? (firstRank > 0 && firstRank <= 3 ? 1 : 0) : results.length === 0 ? 1 : 0, successfulExtraction: extraction, honestLifecycle: execution.status === 200 && (answerable || results.length === 0) ? 1 : execution.payload?.lifecycle === 'unavailable' ? 1 : 0, durationMs: execution.durationMs, providerCostUsd: execution.payload?.operationCost?.providerGeneralWebSearchUsd ?? 0 };
}

const raw = [];
for (const task of tasks) for (const route of routes) {
  let execution;
  try { execution = await request('/v1/search', { query: task.query, route, maximumResults: 5, language: task.locale.language, region: task.locale.region, verticalProfile: task.verticalProfile, operatingProfile: 'balanced' }); }
  catch (error) { execution = { status: 0, durationMs: 0, payload: { lifecycle: 'unavailable', code: error instanceof Error ? error.message : 'transport_failed' } }; }
  raw.push({ taskId: task.id, family: task.family, route, execution, metrics: measure(task, route, execution) });
}

function aggregate(rows, route) {
  const selected = rows.filter((row) => row.route === route); const answerable = selected.filter((row) => row.metrics.answerable);
  const mean = (key, source = selected) => source.length === 0 ? 0 : source.reduce((sum, row) => sum + row.metrics[key], 0) / source.length;
  const recall = mean('recall', answerable); const precision = mean('precision', answerable); const citationValidity = route === 'combined' ? mean('citationValidity') : 0; const nDCG10 = mean('nDCG10'); const MRR10 = mean('MRR10'); const success3 = mean('success3');
  return { tasks: selected.length, answerableTasks: answerable.length, recall: round(recall), precision: round(precision), citationValidity: round(citationValidity), nDCG10: round(nDCG10), MRR10: round(MRR10), success3: round(success3), successfulExtraction: round(mean('successfulExtraction')), honestLifecycle: round(mean('honestLifecycle')), retrievalQuality: round((recall + precision + citationValidity + nDCG10 + MRR10 + success3) / 6), latencyMs: { p50: round(quantile(selected.map((row) => row.metrics.durationMs), 0.5), 3), p95: round(quantile(selected.map((row) => row.metrics.durationMs), 0.95), 3), p99: round(quantile(selected.map((row) => row.metrics.durationMs), 0.99), 3) }, providerGeneralWebCostUsd: round(selected.reduce((sum, row) => sum + row.metrics.providerCostUsd, 0), 8) };
}
const scorecard = { schemaVersion: `clervo.n4.27s.${mode}-scorecard.v1`, evaluatedAt: new Date().toISOString(), mode, tasks: tasks.length, routes: Object.fromEntries(routes.map((route) => [route, aggregate(raw, route)])) };
if (mode === 'final') {
  scorecard.families = Object.fromEntries([...new Set(tasks.map((task) => task.family))].map((family) => [family, aggregate(raw.filter((row) => row.family === family), 'combined')]));
  const combined = scorecard.routes.combined; const simple = scorecard.routes.simple; const focused = scorecard.routes.focused;
  scorecard.gates = { recall: combined.recall >= 0.90, precision: combined.precision >= 0.86, citationValidity: combined.citationValidity >= 0.98, nDCG10: combined.nDCG10 >= 0.86, MRR10: combined.MRR10 >= 0.83, success3: combined.success3 >= 0.88, successfulExtraction: combined.successfulExtraction >= 0.95, familyFloors: Object.values(scorecard.families).every((family) => family.recall >= 0.82 && family.precision >= 0.82), beatsSimple: combined.retrievalQuality >= simple.retrievalQuality + 0.03, beatsFocused: combined.retrievalQuality > focused.retrievalQuality, nonBrowserBalancedP95: combined.latencyMs.p95 <= 2000, honestLifecycle: combined.honestLifecycle === 1, providerCostZero: combined.providerGeneralWebCostUsd === 0 };
  scorecard.mandatoryQualityGatePass = Object.values(scorecard.gates).every(Boolean);
  const rawText = `${JSON.stringify({ schemaVersion: 'clervo.n4.27s.final-raw.v1', generatedAt: scorecard.evaluatedAt, rows: raw }, null, 2)}\n`;
  const scoreText = `${JSON.stringify(scorecard, null, 2)}\n`;
  await mkdir(outputRoot, { recursive: true });
  await writeFile(new URL('raw-results.v1.json.gz', outputRoot), gzipSync(rawText, { level: 9, mtime: 0 }));
  await writeFile(new URL('scorecard.v1.json', outputRoot), scoreText);
  const marker = { schemaVersion: 'clervo.n4.27s.final-run.v1', runCount: 1, status: 'completed', completedAt: new Date().toISOString(), corpusSha256: hash(await readFile(new URL('../../../benchmarks/n4.27s/staging-corpus.v1.json', import.meta.url))), labelsSha256: hash(await readFile(new URL('../../../benchmarks/n4.27s/staging-labels.v1.json', import.meta.url))), rawSha256: hash(gzipSync(rawText, { level: 9, mtime: 0 })), scorecardSha256: hash(scoreText), postRunTuningAllowed: false };
  await writeFile(markerUrl, `${JSON.stringify(marker, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify(scorecard)}\n`);
