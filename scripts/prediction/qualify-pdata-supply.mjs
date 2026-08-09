#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

import { parsePdataMarket, PDATA_VENUE_IDS } from '../../dist/adapters/prediction/src/public-market-data.js';
import { normalizePredictionMarket } from '../../dist/services/prediction/src/normalization.js';
import { createPredictionProductionRuntime } from '../../apps/api/src/prediction-production-runtime.mjs';

const evaluatedAt = new Date().toISOString();
const evaluatedAtMs = Date.parse(evaluatedAt);
const timeoutMs = 12_000;
const repeatedCallsPerVenue = 3;
const expectedAttribution = 'pdata.world — aggregated prediction-market data across 8 platforms';
const productionSellableVenueIds = Object.freeze(['polymarket', 'kalshi', 'manifold', 'limitless']);

async function boundedGet(url, maximumResponseBytes = 10_485_760) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, { method: 'GET', headers: { accept: 'application/json, text/plain;q=0.9, text/html;q=0.8' }, redirect: 'error', signal: controller.signal });
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength < 1 || body.byteLength > maximumResponseBytes) throw new Error('pdata_response_size_invalid');
    return Object.freeze({
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      body,
      latencyMs: Math.round((performance.now() - started) * 10) / 10,
      rateHeaders: Object.freeze(Object.fromEntries([...response.headers].filter(([name]) => /^(?:x-)?rate|retry-after/iu.test(name)))),
    });
  } finally { clearTimeout(timer); }
}

function json(response) {
  if (response.status !== 200 || !response.contentType.toLowerCase().includes('application/json')) throw new Error(`pdata_http_${response.status}`);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body)); }
  catch { throw new Error('pdata_json_invalid'); }
}

function text(response) {
  if (response.status !== 200) throw new Error(`pdata_http_${response.status}`);
  return new TextDecoder('utf-8', { fatal: true }).decode(response.body);
}

async function mapConcurrent(values, concurrency, operation) {
  const results = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next; next += 1;
      try { results[index] = { status: 'fulfilled', value: await operation(values[index], index) }; }
      catch (error) { results[index] = { status: 'rejected', reason: error instanceof Error ? error.message : 'unknown_failure' }; }
    }
  }));
  return results;
}

const legalTargets = [
  { id: 'dataset', url: 'https://pdata.world/data', format: 'text' },
  { id: 'terms', url: 'https://pdata.world/about', format: 'text' },
  { id: 'agent_guide', url: 'https://pdata.world/agents.md', format: 'text' },
  { id: 'openapi', url: 'https://api.pdata.world/openapi.json', format: 'json' },
  { id: 'cc_by_4', url: 'https://creativecommons.org/licenses/by/4.0/', format: 'text' },
];
const legalResponses = await mapConcurrent(legalTargets, 2, async (target) => {
  const response = await boundedGet(target.url);
  return Object.freeze({ ...target, latencyMs: response.latencyMs, content: target.format === 'json' ? json(response) : text(response) });
});
const legalById = new Map(legalResponses.filter(({ status }) => status === 'fulfilled').map(({ value }) => [value.id, value]));
const dataPage = legalById.get('dataset')?.content ?? '';
const aboutPage = legalById.get('terms')?.content ?? '';
const agentGuide = legalById.get('agent_guide')?.content ?? '';
const openapi = legalById.get('openapi')?.content ?? {};
const ccLegalCode = legalById.get('cc_by_4')?.content ?? '';
const ccLicenseText = ccLegalCode.replace(/<[^>]+>/gu, ' ').replace(/&mdash;|&#8212;/gu, '—').replace(/\s+/gu, ' ');
const legal = Object.freeze({
  datasetLicensePublished: /CC BY 4\.0/iu.test(dataPage) && /reuse freely with attribution/iu.test(dataPage),
  apiIncludedOnLicensePage: /api\.pdata\.world\/api\/v1\/events/iu.test(dataPage),
  commercialUseGranted: /even commercially/iu.test(ccLicenseText),
  adaptationGranted: /Adapt.{0,200}build upon the material/isu.test(ccLicenseText),
  redistributionGranted: /Share.{0,200}copy and redistribute/isu.test(ccLicenseText),
  attributionRequired: /Attribution/iu.test(ccLicenseText) && /appropriate credit/iu.test(ccLicenseText),
  noAuthPublished: /No\s+auth/iu.test(agentGuide) && /All endpoints are public; no auth/iu.test(openapi.info?.description ?? ''),
  noRateCardsPublished: /No rate cards/iu.test(agentGuide) && /no rate cards/iu.test(openapi.info?.description ?? ''),
  designatedTermsSurfaceReachable: /about pdata/iu.test(aboutPage),
  openapiLicenseNotice: openapi.info?.license ?? null,
  competingServiceRestriction: 'none_published_on_data_license_openapi_or_designated_terms_surface',
  upstreamProvenanceLimitation: 'pdata identifies each upstream venue and underlying market URL; Clervo must preserve both and does not treat pdata as the venue',
  conservativeLicenseBasis: 'CC BY 4.0 with pdata and per-source attribution; Clervo marks all normalized output as modified',
});

const calls = [];
for (const venueId of PDATA_VENUE_IDS) for (let attempt = 1; attempt <= repeatedCallsPerVenue; attempt += 1) calls.push({ venueId, attempt });
const live = await mapConcurrent(calls, 2, async ({ venueId, attempt }) => {
  const url = `https://api.pdata.world/api/v1/markets?source=${venueId}&status=open&ends_after=${encodeURIComponent(evaluatedAt)}&page=1&page_size=20`;
  const response = await boundedGet(url);
  const payload = json(response);
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload._meta?.attribution !== expectedAttribution || !Number.isSafeInteger(payload.meta?.total_pages)) throw new Error('pdata_list_shape_invalid');
  let market = null; let item = null;
  for (const candidate of payload.items) {
    try {
      const normalized = normalizePredictionMarket(parsePdataMarket(candidate, { apiUrl: url, staleAfterMs: 3_600_000 }), evaluatedAtMs);
      if (normalized.freshness.status !== 'fresh') continue;
      market = normalized; item = candidate; break;
    } catch { /* Qualification scans the bounded page for a fresh usable row. */ }
  }
  if (market === null || item === null) throw new Error('pdata_no_fresh_usable_market');
  if (market.venueId !== venueId || market.supplyAttributions[0]?.license !== 'CC BY 4.0') throw new Error('pdata_normalization_invalid');
  return Object.freeze({ venueId, attempt, latencyMs: response.latencyMs, rateHeaders: response.rateHeaders, market, eventId: item.event_id, totalPages: payload.meta.total_pages });
});

const sourceResults = PDATA_VENUE_IDS.map((venueId) => {
  const sourceCalls = live.filter((result, index) => calls[index].venueId === venueId);
  const successes = sourceCalls.filter(({ status }) => status === 'fulfilled').map(({ value }) => value);
  const failures = sourceCalls.filter(({ status }) => status === 'rejected').map(({ reason }) => reason);
  const latencies = successes.map(({ latencyMs }) => latencyMs).sort((left, right) => left - right);
  const agesMs = successes.map(({ market }) => market.freshness.ageMs);
  return Object.freeze({
    venueId, repeatedCalls: sourceCalls.length, successes: successes.length, failures: failures.length,
    failureCodes: Object.freeze([...new Set(failures)]),
    latencyMs: latencies.length < 1 ? null : Object.freeze({ minimum: latencies[0], median: latencies[Math.floor(latencies.length / 2)], maximum: latencies.at(-1) }),
    freshnessAgeMs: agesMs.length < 1 ? null : Object.freeze({ minimum: Math.min(...agesMs), maximum: Math.max(...agesMs) }),
    normalizationPassed: successes.length > 0,
    sample: successes.length < 1 ? null : Object.freeze({ eventId: String(successes[0].eventId), marketRef: successes[0].market.marketRef, status: successes[0].market.status, outcomeCount: successes[0].market.outcomes.length }),
  });
});

const probeJson = async (url) => {
  try {
    const response = await boundedGet(url);
    return Object.freeze({ status: 'fulfilled', response, payload: json(response) });
  } catch (error) { return Object.freeze({ status: 'rejected', reason: error instanceof Error ? error.message : 'unknown_failure' }); }
};
const [pageOneProbe, pageTwoProbe] = await Promise.all([
  probeJson('https://api.pdata.world/api/v1/markets?status=open&page=1&page_size=5'),
  probeJson('https://api.pdata.world/api/v1/markets?status=open&page=2&page_size=5'),
]);
const pageOneResponse = pageOneProbe.response ?? null;
const pageTwoResponse = pageTwoProbe.response ?? null;
const pageOne = pageOneProbe.payload ?? {}; const pageTwo = pageTwoProbe.payload ?? {};
const pageOneIds = new Set(pageOne.items?.map(({ source, id }) => `${source}:${id}`));
const paginationPassed = pageOneIds.size === 5 && pageTwo.items?.length === 5 && pageTwo.items.every(({ source, id }) => !pageOneIds.has(`${source}:${id}`));

const searchProbe = await probeJson('https://api.pdata.world/api/v1/markets?status=open&search=president&page=1&page_size=5');
const searchResponse = searchProbe.response ?? null;
const search = searchProbe.payload ?? {};
const searchPassed = Array.isArray(search.items) && search.items.length > 0 && search.items.every(({ question, description }) => `${question ?? ''} ${description ?? ''}`.toLowerCase().includes('president'));

const historyInputs = sourceResults.map((source) => ({ venueId: source.venueId, eventId: source.sample?.eventId })).filter(({ eventId }) => typeof eventId === 'string' && eventId.length > 0);
const histories = await mapConcurrent(historyInputs, 2, async ({ venueId, eventId }) => {
  const response = await boundedGet(`https://api.pdata.world/api/v1/events/${encodeURIComponent(venueId)}/${encodeURIComponent(eventId)}/history?range=all&limit=2`);
  const payload = json(response);
  if (payload.source !== venueId || String(payload.event_id) !== eventId || !Array.isArray(payload.series)) throw new Error('pdata_history_shape_invalid');
  return Object.freeze({ venueId, latencyMs: response.latencyMs, seriesCount: payload.series.length, pointCount: payload.series.reduce((sum, { points }) => sum + (Array.isArray(points) ? points.length : 0), 0) });
});

let malformedRejected = false;
try { parsePdataMarket({ source: 'polymarket', id: 'bad' }, { apiUrl: 'https://api.pdata.world/api/v1/markets', staleAfterMs: 3_600_000 }); }
catch { malformedRejected = true; }

const rateHeaderObservations = [...new Set(live.flatMap((result) => result.status === 'fulfilled' ? Object.keys(result.value.rateHeaders) : []))];
const recommendedSellableVenueIds = sourceResults.filter(({ successes, failures, latencyMs, freshnessAgeMs }) => successes === repeatedCallsPerVenue && failures === 0
  && latencyMs !== null && latencyMs.maximum <= 5_000 && freshnessAgeMs !== null && freshnessAgeMs.maximum <= 3_600_000).map(({ venueId }) => venueId);
const historyByVenue = new Map(histories.filter(({ status }) => status === 'fulfilled').map(({ value }) => [value.venueId, value]));
const runtimeMarkets = new Map();
const runtimeStore = {
  durable: true,
  maximumSnapshotsPerMarket: 100,
  async ready() { return true; },
  async put(market) { runtimeMarkets.set(market.marketRef, market); },
  async get(marketRef) { return runtimeMarkets.get(marketRef) ?? null; },
  async append() { return { replayed: false }; },
  async list() { return []; },
};
let runtimeProbe;
try {
  const runtime = createPredictionProductionRuntime({ store: runtimeStore });
  const completed = await runtime.execute({
    operationId: 'op_pdataqualification00000001', productId: 'prediction.markets',
    deadlineAt: new Date(Date.now() + 30_000).toISOString(),
    input: { kind: 'markets', status: 'open', venues: ['polymarket', 'kalshi', 'manifold', 'limitless'], limit: 8 },
  });
  const output = completed.result?.output;
  runtimeProbe = Object.freeze({
    passed: output?.kind === 'markets' && ['available', 'degraded'].includes(output.state) && output.markets?.length > 0
      && output.markets.every(({ supplyAttributions }) => supplyAttributions?.some(({ sourceId, license }) => sourceId === 'pdata' && license === 'CC BY 4.0'))
      && completed.sourceBindings?.length === 1 && completed.sourceBindings[0].adapterId === 'adapter_prediction.pdata_rest',
    state: output?.state ?? null,
    marketCount: output?.markets?.length ?? 0,
    venueStates: output?.venues ?? [],
    sourceBindings: completed.sourceBindings ?? [],
    resultHash: completed.result?.resultHash ?? null,
  });
} catch (error) {
  runtimeProbe = Object.freeze({ passed: false, failureCode: error instanceof Error ? error.message : 'unknown_failure' });
}
const qualified = Object.values(legal).every((value) => value !== false)
  && productionSellableVenueIds.every((venueId) => recommendedSellableVenueIds.includes(venueId))
  && paginationPassed && searchPassed && malformedRejected
  && productionSellableVenueIds.every((venueId) => historyByVenue.has(venueId))
  && runtimeProbe.passed;

const result = Object.freeze({
  schemaVersion: 'clervo.pdata-live-conformance.v1', evaluatedAt, qualified,
  externalCalls: legalResponses.length + calls.length + 2 + 1 + histories.length + 1,
  ownerCashSpentUsd: 0, mutationCount: 0, authenticationRequired: false,
  legal,
  legalEndpointResults: legalResponses.map((entry, index) => entry.status === 'fulfilled'
    ? { id: legalTargets[index].id, status: 'fulfilled', latencyMs: entry.value.latencyMs }
    : { id: legalTargets[index].id, status: 'rejected', failureCode: entry.reason }),
  apiVersion: openapi.info?.version ?? null, venueCoverage: PDATA_VENUE_IDS,
  recommendedSellableVenueIds,
  productionSellableVenueIds,
  excludedVenueIds: sourceResults.filter(({ venueId }) => !recommendedSellableVenueIds.includes(venueId)).map(({ venueId, failureCodes, latencyMs, freshnessAgeMs }) => ({ venueId, failureCodes, latencyMs, freshnessAgeMs })),
  sources: sourceResults, pagination: Object.freeze({ passed: paginationPassed, pageOneLatencyMs: pageOneResponse?.latencyMs ?? null, pageTwoLatencyMs: pageTwoResponse?.latencyMs ?? null, failureCodes: [pageOneProbe, pageTwoProbe].filter(({ status }) => status === 'rejected').map(({ reason }) => reason) }),
  search: Object.freeze({ passed: searchPassed, resultCount: search.items?.length ?? 0, latencyMs: searchResponse?.latencyMs ?? null, failureCode: searchProbe.status === 'rejected' ? searchProbe.reason : null }),
  history: Object.freeze({ publishedRetention: 'approximately 30 days of snapshots', results: histories }),
  runtimeProbe,
  resilience: Object.freeze({ malformedResponseRejected: malformedRejected, boundedTimeoutMs: timeoutMs, maximumResponseBytes: 10_485_760, redirectsRejected: true, partialMalformedItemsDegradePerVenue: true }),
  ratePosture: Object.freeze({ publishedNumericLimit: null, publishedRateCards: false, observedRateHeaders: rateHeaderObservations, clientConcurrency: 2, runtimeMaximumPagesPerSearch: 5 }),
});

console.log(JSON.stringify(result, null, 2));
if (!qualified) process.exitCode = 1;
