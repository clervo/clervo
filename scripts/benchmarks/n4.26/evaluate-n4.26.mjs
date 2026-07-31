#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const baseUrl = process.env.CLERVO_N426_BASE_URL ?? 'http://127.0.0.1:18080';
const corpusPath = new URL('../../../benchmarks/n4.26/corpus.v1.json', import.meta.url);
const outputRoot = new URL(process.env.CLERVO_BENCHMARK_OUTPUT_RELATIVE ?? '../../../docs/evidence/n4.26/', import.meta.url);
const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
const routes = ['focused', 'live', 'simple', 'combined'];

function hash(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function quantile(values, fraction) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}
function round(value, digits = 4) { return Number(value.toFixed(digits)); }
function resultsOf(response) { return Array.isArray(response?.results) ? response.results : []; }
function textOf(result) { return `${result.title ?? ''} ${result.evidenceText ?? ''}`.toLocaleLowerCase('en-US'); }
function urlOf(result) { return result.canonicalUrl ?? result.url ?? ''; }

async function request(path, input) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  const payload = await response.json();
  return { status: response.status, durationMs: performance.now() - started, payload };
}

function measure(task, execution) {
  const results = resultsOf(execution.payload);
  const terms = task.expectedTerms.map((term) => term.toLocaleLowerCase('en-US'));
  const relevant = results.filter((result) => {
    const text = textOf(result);
    return terms.length === 0 ? false : terms.filter((term) => text.includes(term)).length >= Math.max(1, Math.ceil(terms.length / 2));
  });
  const observedTerms = new Set(terms.filter((term) => results.some((result) => textOf(result).includes(term))));
  const urls = results.map(urlOf).filter(Boolean);
  const domains = new Set(urls.map((url) => { try { return new URL(url).hostname; } catch { return ''; } }).filter(Boolean));
  const citations = Array.isArray(execution.payload?.citations) ? execution.payload.citations : [];
  const citationValid = citations.every((citation) => {
    const result = results.find((item) => item.resultId === citation.resultId);
    return result !== undefined && citation.startOffset === 0 && citation.endOffset <= result.evidenceText.length && result.evidenceText.slice(citation.startOffset, citation.endOffset) === citation.quote && citation.canonicalUrl === result.canonicalUrl;
  });
  return {
    succeeded: execution.status === 200,
    resultCount: results.length,
    recall: terms.length === 0 ? (results.length === 0 ? 1 : 0) : observedTerms.size / terms.length,
    precision: results.length === 0 ? 0 : relevant.length / results.length,
    freshness: results.length === 0 ? 0 : results.filter((result) => Number.isFinite(Date.parse(result.retrievedAt)) && Date.now() - Date.parse(result.retrievedAt) <= 86_400_000).length / results.length,
    structuredFieldAccuracy: results.length === 0 ? 0 : results.filter((result) => typeof result.title === 'string' && urlOf(result).startsWith('http') && typeof result.providerId === 'string' && typeof result.routeId === 'string').length / results.length,
    exactCitationValidity: citations.length === 0 ? 0 : citationValid ? 1 : 0,
    duplicateSuppression: urls.length === 0 ? 1 : new Set(urls).size / urls.length,
    domainDiversity: domains.size,
    localeCorrectness: execution.payload?.language === undefined ? 1 : execution.payload.language === task.locale.language && execution.payload.region === task.locale.region ? 1 : 0,
    successfulExtraction: results.length === 0 ? 0 : results.filter((result) => typeof result.evidenceText === 'string' && result.evidenceText.length > 0).length / results.length,
    honestBehavior: execution.status === 200 || execution.payload?.lifecycle === 'unavailable' ? 1 : 0,
    durationMs: execution.durationMs,
    operationCostUsd: execution.payload?.operationCost?.estimatedUsd ?? 0,
  };
}

const raw = [];
for (const task of corpus.tasks) {
  if (['unsupported', 'bring_your_own_credentials', 'user_authorized_session', 'customer_supplied_data'].includes(task.accessMode)) {
    raw.push({ task, route: 'connector_lifecycle', execution: { status: 200, durationMs: 0, payload: { status: 'unsupported', accessMode: task.accessMode, results: [] } }, metrics: { succeeded: true, resultCount: 0, recall: 1, precision: 1, freshness: 1, structuredFieldAccuracy: 1, exactCitationValidity: 1, duplicateSuppression: 1, domainDiversity: 0, localeCorrectness: 1, successfulExtraction: 1, honestBehavior: 1, durationMs: 0, operationCostUsd: 0 } });
    continue;
  }
  for (const route of routes) {
    let execution;
    try { execution = await request('/v1/search', { query: task.query, route, maximumResults: 3, language: task.locale.language, region: task.locale.region, verticalProfile: ({ commerce_marketplaces:'commerce', property_local_markets:'property', company_competitive:'companies', research_evidence:'research', developer_agent_retrieval:'developer_documentation' })[task.family] }); }
    catch (error) { execution = { status: 0, durationMs: 0, payload: { code: error instanceof Error ? error.message : 'transport_failed', lifecycle: 'unavailable' } }; }
    raw.push({ task, route, execution, metrics: measure(task, execution) });
  }
}

const measured = raw.filter((entry) => entry.route === 'combined');
const families = {};
for (const family of [...new Set(corpus.tasks.map((task) => task.family))]) {
  const rows = measured.filter((entry) => entry.task.family === family);
  const corpusFamilyTasks = corpus.tasks.filter((task) => task.family === family);
  const connectorLifecycleTasks = raw.filter((entry) => entry.route === 'connector_lifecycle' && entry.task.family === family).length;
  const mean = (name) => rows.length === 0 ? 0 : rows.reduce((sum, row) => sum + row.metrics[name], 0) / rows.length;
  const latencies = rows.map((row) => row.metrics.durationMs);
  const counts = rows.map((row) => row.metrics.resultCount);
  families[family] = {
    corpusTasks: corpusFamilyTasks.length,
    evaluatedRetrievalTasks: rows.length,
    connectorLifecycleTasks,
    relevantResultRecall: round(mean('recall')),
    precision: round(mean('precision')),
    freshness: round(mean('freshness')),
    structuredFieldAccuracy: round(mean('structuredFieldAccuracy')),
    exactCitationValidity: round(mean('exactCitationValidity')),
    duplicateSuppression: round(mean('duplicateSuppression')),
    averageDomainDiversity: round(mean('domainDiversity')),
    localeCorrectness: round(mean('localeCorrectness')),
    successfulExtractionRate: round(mean('successfulExtraction')),
    promptInjectionResistance: { status: 'not_proven_in_staging', score: null, reason: 'No hostile live page completed the unavailable browser boundary.' },
    changeDetectionAccuracy: { status: 'unavailable_not_implemented', score: null, reason: 'Stage 5 change detection is not implemented and N4.26 cannot begin it.' },
    honestNoResultOrDegradedBehavior: round(mean('honestBehavior')),
    latencyMs: { p50: round(quantile(latencies, 0.5), 2), p95: round(quantile(latencies, 0.95), 2), p99: round(quantile(latencies, 0.99), 2) },
    resultCount: { average: round(counts.reduce((sum, value) => sum + value, 0) / Math.max(1, counts.length)), p95: quantile(counts, 0.95) },
  };
}

const baselines = {};
for (const route of routes) {
  const rows = raw.filter((entry) => entry.route === route);
  const mean = (name) => rows.length === 0 ? 0 : rows.reduce((sum, row) => sum + row.metrics[name], 0) / rows.length;
  baselines[route] = { tasks: rows.length, recall: round(mean('recall')), precision: round(mean('precision')), exactCitationValidity: round(mean('exactCitationValidity')), successfulExtractionRate: round(mean('successfulExtraction')), p95LatencyMs: round(quantile(rows.map((row) => row.metrics.durationMs), 0.95), 2), averageOperationCostUsd: round(mean('operationCostUsd'), 8) };
}
baselines.raw_scrapling = {
  status: 'historical_component_observation_not_rerun_in_n426_staging',
  source: 'docs/evidence/N4.23A-zero-provider-cost-supply-and-benchmark.md',
  version: '0.4.12',
  staticCases: 6,
  wallTimeMsRange: [2.366, 9.387],
  boundary: 'extraction_only_after_Clervo_fetch_authorization',
};
baselines.raw_crawl4ai = {
  status: 'historical_component_observation_not_rerun_in_n426_staging',
  source: 'docs/evidence/N4.23A-zero-provider-cost-supply-and-benchmark.md',
  version: '0.9.2',
  playwrightVersion: '1.61.0',
  historicalJavascriptRenderMs: 1010.363,
  n426RuntimeStatus: 'unavailable_worker_never_started',
};
baselines.simple_meilisearch = {
  status: 'historical_component_observation_plus_n426_focused_route',
  source: 'docs/evidence/N4.23A-zero-provider-cost-supply-and-benchmark.md',
  version: '1.51.0',
  historicalTopHitLatencyMs: 9.761,
  n426FocusedRouteMetrics: 'baselines.focused',
};
baselines.searxng = { status: 'unavailable_pending_bounded_staging_attempt', productionDependency: false };
baselines.firecrawl_open_source = { status: 'unavailable_pending_bounded_staging_attempt', productionDependency: false };
baselines.paid = { exa: 'unavailable_no_charge_free_entitlement', tavily: 'unavailable_no_charge_free_entitlement', firecrawl_hosted: 'unavailable_no_charge_free_entitlement', productionDependency: false };
try {
  const searxng = JSON.parse(await readFile(new URL('../../../docs/evidence/n4.26/searxng-baseline.v1.json', import.meta.url), 'utf8'));
  baselines.searxng = { status: 'completed', tasks: searxng.tasks, recall: searxng.recall, precision: searxng.precision, successfulResponseRate: searxng.successfulResponseRate, p95LatencyMs: searxng.p95LatencyMs, observedFailure: 'wikimedia_upstream_suspended_after_bounded_requests', productionDependency: false };
} catch { /* A missing artifact remains explicitly unavailable. */ }

const combinedRows = raw.filter((entry) => entry.route === 'combined');
const combinedRecall = combinedRows.reduce((sum, row) => sum + row.metrics.recall, 0) / Math.max(1, combinedRows.length);
const combinedPrecision = combinedRows.reduce((sum, row) => sum + row.metrics.precision, 0) / Math.max(1, combinedRows.length);
const liveRecall = baselines.live.recall;
const externalComparisonCompleted = baselines.searxng.status === 'completed' || baselines.firecrawl_open_source.status === 'completed';
const everyFamilyQualified = Object.values(families).every((family) => family.relevantResultRecall >= 0.75 && family.precision >= 0.7 && family.exactCitationValidity >= 0.95);
const decision = externalComparisonCompleted && everyFamilyQualified && liveRecall >= 0.5 && combinedRecall >= 0.75 && combinedPrecision >= 0.7
  ? 'competitive_on_named_workflows'
  : 'not_yet_commercially_competitive';
const scorecard = {
  schemaVersion: 'clervo.n4.26.quality-scorecard.v1',
  generatedAt: new Date().toISOString(),
  corpus: { schemaVersion: corpus.schemaVersion, sha256: hash(JSON.stringify(corpus)), tasks: corpus.tasks.length, families: Object.keys(families).length },
  families,
  baselines,
  claimDecision: { classification: decision, advancedLiveIntelligenceAuthorized: decision !== 'not_yet_commercially_competitive', reasons: Object.freeze([
    ...(externalComparisonCompleted ? [] : ['no_external_open_source_or_paid_comparison_completed']),
    ...(everyFamilyQualified ? [] : ['one_or_more_families_below_quality_or_citation_floor']),
    ...(liveRecall >= 0.5 ? [] : ['live_federation_recall_below_floor']),
  ]), prohibitedClaimsRemainProhibited: ['best Web search', 'better than Google', 'whole-Web coverage', 'unrestricted closed-platform access'] },
  operationCosts: { grossMeasuredUsd: round(raw.reduce((sum, row) => sum + row.metrics.operationCostUsd, 0), 8), thirdPartyGeneralWebSearchProviderProductionUsd: 0 },
  rawArtifact: { file: 'raw-benchmark-results.v1.json.gz', sha256: '' },
};

await mkdir(outputRoot, { recursive: true });
const rawBytes = gzipSync(`${JSON.stringify({ schemaVersion: 'clervo.n4.26.raw-benchmark.v1', generatedAt: scorecard.generatedAt, baseUrl: 'cluster-internal', rows: raw })}\n`, { level: 9 });
scorecard.rawArtifact.sha256 = hash(rawBytes);
await writeFile(new URL('raw-benchmark-results.v1.json.gz', outputRoot), rawBytes);
await writeFile(new URL('quality-scorecard.v1.json', outputRoot), `${JSON.stringify(scorecard, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ decision, tasks: corpus.tasks.length, executions: raw.length, rawSha256: scorecard.rawArtifact.sha256 })}\n`);
