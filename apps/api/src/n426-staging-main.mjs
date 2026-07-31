#!/usr/bin/env node

import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import {
  FOCUSED_INDEX_ADAPTER_ID,
  FOCUSED_INDEX_FAILURE_DOMAIN,
  FOCUSED_INDEX_HEALTH_IDENTITY,
  FOCUSED_INDEX_PROVIDER_ID,
  MEILISEARCH_VERSION,
  createFocusedIndexDocument,
  focusedIndexRuntimeIdentity,
} from '../../../dist/packages/contracts/src/index.js';
import { createMeilisearchFocusedIndexAdapter } from '../../../dist/adapters/search/src/meilisearch-focused-index.js';
import { FileDurableRetrievalCacheStore } from '../../../dist/adapters/search/src/file-retrieval-cache.js';
import { createCrossrefOpenDataAdapter, createWikimediaOpenDataAdapter } from '../../../dist/adapters/search/src/open-data.js';
import { FocusedIndexRoute } from '../../../dist/services/search/src/focused-index.js';
import { ConnectedRetrievalPipeline, createFocusedConnectedRoute, createLiveConnectedRoute } from '../../../dist/services/search/src/connected-retrieval.js';
import { createDirectCurrentPageFetch, extractCurrentPage, LiveFederationRoute } from '../../../dist/services/search/src/live-federation.js';
import { DurableRetrievalCache, retrievalCachePolicySha256 } from '../../../dist/services/search/src/retrieval-cache.js';

const PORT = Number(process.env.PORT ?? '8080');
const DATA_ROOT = process.env.CLERVO_N426_DATA_ROOT ?? '/var/lib/clervo-n426';
const MEILI_ENDPOINT = process.env.CLERVO_N426_MEILI_ENDPOINT ?? 'http://clervo-n426-meilisearch:7700/';
const MAXIMUM_OPERATIONS = Number(process.env.CLERVO_N426_MAXIMUM_OPERATIONS ?? '600');
const OPERATION_COST_CEILING_USD = Number(process.env.CLERVO_N426_OPERATION_COST_CEILING_USD ?? '0.002');
const USER_AGENT = 'Clervo-N4.26-Staging/1.0 (mo@clervo.dev)';
const seeds = Object.freeze([
  'https://www.wikipedia.org/',
  'https://en.wikipedia.org/wiki/E-commerce',
  'https://en.wikipedia.org/wiki/Online_marketplace',
  'https://en.wikipedia.org/wiki/Real_estate',
  'https://en.wikipedia.org/wiki/House_price_index',
  'https://en.wikipedia.org/wiki/Competitive_intelligence',
  'https://en.wikipedia.org/wiki/Market_research',
  'https://en.wikipedia.org/wiki/Crossref',
  'https://en.wikipedia.org/wiki/Scientific_literature',
  'https://en.wikipedia.org/wiki/Node.js',
  'https://en.wikipedia.org/wiki/Representational_state_transfer',
  'https://en.wikipedia.org/wiki/OpenAPI_Specification',
  'https://en.wikipedia.org/wiki/Model_Context_Protocol',
  'https://www.census.gov/programs-surveys/acs',
  'https://www.sec.gov/edgar/search/',
]);

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(`${JSON.stringify(body)}\n`);
}

async function body(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 32_768) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}

function privateRecord(value) {
  return Object.freeze({
    timestamp: new Date().toISOString(),
    event: value.event,
    severity: value.severity ?? 'INFO',
    routeId: value.routeId,
    state: value.state,
    code: value.code,
    durationMs: value.durationMs,
    resultCount: value.resultCount,
    estimatedCostUsd: value.estimatedCostUsd,
  });
}

const state = {
  startedAt: new Date().toISOString(),
  trafficStopped: false,
  routeStopped: { focused: false, live: false },
  citationVerifierAvailable: true,
  cacheAvailable: true,
  operationCount: 0,
  browserMinutesUsed: 0,
  events: [],
  durations: [],
  cache: { hit: 0, stale: 0, miss: 0 },
  costs: { grossUsd: 0, providerSearchUsd: 0 },
};

function record(value) {
  const event = privateRecord(value);
  state.events.push(event);
  if (state.events.length > 1_000) state.events.shift();
  process.stdout.write(`${JSON.stringify({ schemaVersion: 'clervo.n4.26.monitoring-event.v1', ...event })}\n`);
}

async function fetchTransport(request) {
  const remaining = Math.max(1, Date.parse(request.deadlineAt) - Date.now());
  const controller = new AbortController();
  const cancel = () => controller.abort();
  request.signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    const response = await fetch(request.url, { headers: request.headers, redirect: 'manual', signal: controller.signal });
    return Object.freeze({ status: response.status, headers: Object.freeze(Object.fromEntries(response.headers)), body: await response.text() });
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', cancel);
  }
}

async function meiliTransport(request) {
  const response = await fetch(new URL(request.path, MEILI_ENDPOINT), {
    method: request.method,
    headers: request.headers,
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
  });
  const text = await response.text();
  return Object.freeze({ status: response.status, body: text === '' ? {} : JSON.parse(text) });
}

async function waitForMeili(masterKey) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(new URL('/health', MEILI_ENDPOINT), { headers: { authorization: `Bearer ${masterKey}` } });
      if (response.ok) return;
    } catch { /* retry bounded startup */ }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('focused_index_startup_unavailable');
}

async function createRuntime() {
  await mkdir(DATA_ROOT, { recursive: true });
  const masterKey = (await readFile('/var/run/clervo-n426-meili/masterKey', 'utf8')).trim();
  if (masterKey.length < 16) throw new Error('meilisearch_master_key_unavailable');
  await waitForMeili(masterKey);
  const index = createMeilisearchFocusedIndexAdapter({
    endpoint: MEILI_ENDPOINT,
    masterKey,
    indexUid: 'clervo_n426_focused',
    analyticsDisabled: true,
    expectedVersion: MEILISEARCH_VERSION,
    communityFeaturesOnly: true,
    providerId: FOCUSED_INDEX_PROVIDER_ID,
    adapterId: FOCUSED_INDEX_ADAPTER_ID,
    healthIdentity: FOCUSED_INDEX_HEALTH_IDENTITY,
    failureDomain: FOCUSED_INDEX_FAILURE_DOMAIN,
  }, meiliTransport, focusedIndexRuntimeIdentity);
  const directFetch = createDirectCurrentPageFetch({ maximumBytes: 1_500_000, maximumCompressedBytes: 750_000, deadlineMs: 10_000, userAgent: USER_AGENT });
  const cache = new DurableRetrievalCache(new FileDurableRetrievalCacheStore(`${DATA_ROOT}/retrieval-cache`), 'n426_staging', 1_500_000, 3_600_000);
  if ((await index.listDocuments().catch(() => [])).length === 0) {
    await meiliTransport({ method: 'POST', path: '/indexes', headers: { authorization: `Bearer ${masterKey}`, 'content-type': 'application/json' }, body: { uid: 'clervo_n426_focused', primaryKey: 'documentId' } }).catch(() => undefined);
    const documents = [];
    for (const url of seeds) {
      try {
        const fetched = await directFetch(url);
        const extracted = await extractCurrentPage({ fetch: fetched, deadlineAt: new Date(Date.now() + 5_000).toISOString(), signal: new AbortController().signal });
        const fetchedAt = fetched.receipt.completedAt;
        documents.push(createFocusedIndexDocument({
          title: extracted.title,
          content: extracted.text,
          sourceUrl: url,
          canonicalUrl: fetched.receipt.finalUrl,
          mime: fetched.receipt.contentType,
          language: 'en',
          fetchedAt,
          staleAt: new Date(Date.parse(fetchedAt) + 3_600_000).toISOString(),
          recrawlAt: new Date(Date.parse(fetchedAt) + 3_600_000).toISOString(),
          expiresAt: new Date(Date.parse(fetchedAt) + 86_400_000).toISOString(),
        }));
        record({ event: 'focused_seed_indexed', routeId: 'clervo.focused-index.v1', state: 'ready', resultCount: 1 });
      } catch (error) {
        record({ event: 'focused_seed_rejected', severity: 'WARNING', routeId: 'clervo.focused-index.v1', state: 'degraded', code: error instanceof Error ? error.message : 'seed_failed' });
      }
    }
    if (documents.length === 0) throw new Error('focused_index_seed_unavailable');
    let accepted = 0;
    for (const document of documents) {
      try { await index.upsert(document); accepted += 1; }
      catch (error) { record({ event: 'focused_document_rejected', severity: 'WARNING', routeId: 'clervo.focused-index.v1', state: 'degraded', code: error instanceof Error ? error.message : 'index_write_failed' }); }
    }
    if (accepted === 0) throw new Error('focused_index_write_unavailable');
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if ((await index.listDocuments().catch(() => [])).length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  const focused = new FocusedIndexRoute({
    approvedDomains: ['census.gov', 'en.wikipedia.org', 'sec.gov', 'wikipedia.org', 'www.wikipedia.org'],
    explicitSeeds: ['https://www.wikipedia.org/'],
    policies: [
      { domain: 'census.gov', contentUse: 'approved', language: 'en' },
      { domain: 'en.wikipedia.org', contentUse: 'approved', language: 'en' },
      { domain: 'sec.gov', contentUse: 'approved', language: 'en' },
      { domain: 'wikipedia.org', contentUse: 'approved', language: 'en' },
      { domain: 'www.wikipedia.org', contentUse: 'approved', language: 'en' },
    ],
    denylist: [], maximumPages: 100, maximumPagesPerDomain: 50, maximumConcurrencyPerDomain: 1,
    minimumDelayMsPerDomain: 1_000, maximumFrontierItems: 200, staleAfterMs: 3_600_000,
    expireAfterMs: 86_400_000, recrawlAfterMs: 3_600_000, nearDuplicateThresholdBasisPoints: 8_500,
  }, {
    fetch: async () => { throw new Error('staging_crawl_not_exposed'); },
    worker: { workerId: 'worker_scrapling_0_4_12', version: '0.4.12', extract: async () => { throw new Error('staging_crawl_not_exposed'); } },
    index,
  });
  const live = new LiveFederationRoute({
    adapters: [
      createWikimediaOpenDataAdapter({ transport: fetchTransport, userAgent: USER_AGENT, sourceUseStatus: 'qualified' }),
      createCrossrefOpenDataAdapter({ transport: fetchTransport, userAgent: USER_AGENT, mailto: 'mo@clervo.dev', sourceUseStatus: 'qualified' }),
    ],
    fetch: directFetch,
  });
  const pipeline = new ConnectedRetrievalPipeline({ focused: createFocusedConnectedRoute(focused), live: createLiveConnectedRoute(live), directFetch });
  return Object.freeze({ index, focused, live, pipeline, directFetch, cache });
}

const runtime = await createRuntime();

async function cacheProbe(url, routeId, forceRefresh = false, upstreamDegraded = false) {
  const identity = { url, routeId, requestPolicySha256: retrievalCachePolicySha256() };
  if (!state.cacheAvailable) throw new Error('cache_unavailable');
  const observedAt = new Date().toISOString();
  const read = await runtime.cache.read({ ...identity, observedAt, forceRefresh, upstreamDegraded });
  if (read.disclosure.state === 'fresh') state.cache.hit += 1;
  else if (read.disclosure.state === 'stale_while_degraded') state.cache.stale += 1;
  else state.cache.miss += 1;
  if (read.body !== undefined) return read.disclosure;
  const fetched = await runtime.directFetch(url);
  if (fetched.body === undefined || fetched.receipt.finalUrl === undefined || fetched.receipt.contentType === undefined) throw new Error('cache_probe_fetch_failed');
  await runtime.cache.write({ ...identity, fetchedAt: fetched.receipt.completedAt, expiresAt: new Date(Date.parse(fetched.receipt.completedAt) + 60_000).toISOString(), contentType: fetched.receipt.contentType.split(';', 1)[0], body: fetched.body, safety: { containsSecret: false, containsWallet: false, containsCustomerPayload: false, containsUnsafeBrowserState: false } });
  return read.disclosure;
}

async function executeSearch(input) {
  if (state.trafficStopped) throw new Error('global_search_traffic_stopped');
  if (state.operationCount >= MAXIMUM_OPERATIONS) throw new Error('daily_operation_budget_exhausted');
  if (!(OPERATION_COST_CEILING_USD > 0 && OPERATION_COST_CEILING_USD <= 0.002)) throw new Error('operation_cost_not_bounded');
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const route = input.route ?? 'combined';
  if (query === '' || query.length > 500 || !['combined', 'focused', 'live', 'simple'].includes(route)) throw new Error('invalid_benchmark_query');
  const maximumResults = Math.max(1, Math.min(10, Number(input.maximumResults ?? 5)));
  const started = performance.now();
  state.operationCount += 1;
  try {
    let result;
    if (route === 'focused') {
      if (state.routeStopped.focused) throw new Error('focused_route_stopped');
      const documents = await runtime.focused.query(query, new Date().toISOString(), maximumResults);
      result = { status: 'ready', route, results: documents.map((document) => ({ title: document.title, url: document.provenance.canonicalUrl, evidenceText: document.content, retrievedAt: document.fetchedAt, providerId: document.providerId, routeId: document.routeId })) };
    } else if (route === 'live') {
      if (state.routeStopped.live) throw new Error('live_route_stopped');
      const generatedAt = new Date().toISOString();
      const results = await runtime.live.search({ query, language: input.language ?? 'en', region: input.region ?? 'US', maximumResults, generatedAt, deadlineAt: new Date(Date.parse(generatedAt) + 15_000).toISOString(), signal: new AbortController().signal });
      result = { status: 'ready', route, results };
    } else {
      const focusedStopped = state.routeStopped.focused;
      const liveStopped = state.routeStopped.live;
      const generatedAt = new Date().toISOString();
      if (focusedStopped && liveStopped) throw new Error('connected_retrieval_both_routes_unavailable');
      if (route === 'simple') {
        const [focusedResults, liveResults] = await Promise.all([
          focusedStopped ? [] : runtime.focused.query(query, generatedAt, maximumResults),
          liveStopped ? [] : runtime.live.search({ query, language: input.language ?? 'en', region: input.region ?? 'US', maximumResults, generatedAt, deadlineAt: new Date(Date.parse(generatedAt) + 15_000).toISOString(), signal: new AbortController().signal }).catch(() => []),
        ]);
        result = { status: focusedStopped || liveStopped ? 'degraded' : 'ready', route, results: [...focusedResults.map((document) => ({ title: document.title, url: document.provenance.canonicalUrl, evidenceText: document.content, retrievedAt: document.fetchedAt, providerId: document.providerId, routeId: document.routeId })), ...liveResults].slice(0, maximumResults) };
      } else {
        const focusedAdapter = state.routeStopped.focused ? { identity: createFocusedConnectedRoute(runtime.focused).identity, search: async () => { throw new Error('focused_route_stopped'); } } : createFocusedConnectedRoute(runtime.focused);
        const liveAdapter = state.routeStopped.live ? { identity: createLiveConnectedRoute(runtime.live).identity, search: async () => { throw new Error('live_route_stopped'); } } : createLiveConnectedRoute(runtime.live);
        const pipeline = new ConnectedRetrievalPipeline({ focused: focusedAdapter, live: liveAdapter, directFetch: runtime.directFetch });
        result = await pipeline.searchWeb({ operationId: `op_${createHash('sha256').update(`${state.operationCount}:${query}`).digest('hex').slice(0, 32)}`, query, language: input.language ?? 'en', region: input.region ?? 'US', maximumResults, generatedAt, deadlineMs: 15_000 });
      }
    }
    if (!state.citationVerifierAvailable && route === 'combined') throw new Error('citation_verifier_unavailable');
    const durationMs = performance.now() - started;
    const estimatedCostUsd = Math.min(OPERATION_COST_CEILING_USD, 0.00002 + durationMs * 0.00000002);
    state.durations.push(durationMs);
    state.costs.grossUsd += estimatedCostUsd;
    record({ event: 'search_completed', routeId: route, state: result.status, durationMs, resultCount: result.results.length, estimatedCostUsd });
    return { ...result, operationCost: { estimatedUsd: estimatedCostUsd, hardCeilingUsd: OPERATION_COST_CEILING_USD, providerGeneralWebSearchUsd: 0 } };
  } catch (error) {
    const durationMs = performance.now() - started;
    state.durations.push(durationMs);
    record({ event: 'search_failed', severity: 'ERROR', routeId: route, state: 'unavailable', code: error instanceof Error ? error.message : 'search_failed', durationMs, estimatedCostUsd: 0 });
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://clervo-n426.invalid');
  try {
    if (request.method === 'GET' && url.pathname === '/healthz') {
      const indexHealth = await runtime.index.health(new Date().toISOString());
      json(response, 200, { schemaVersion: 'clervo.n4.26.health.v1', lifecycle: state.trafficStopped ? 'unavailable' : 'ready', trafficStopped: state.trafficStopped, routes: { focused: { ...indexHealth, circuit: state.routeStopped.focused ? 'open' : 'closed' }, live: { ...runtime.live.health(new Date().toISOString()), circuit: state.routeStopped.live ? 'open' : runtime.live.circuit.state.status } }, providerGeneralWebSearchCostUsd: 0, payment: 'mock_only' });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/metrics') {
      const successful = state.events.filter((event) => event.event === 'search_completed').length;
      const failed = state.events.filter((event) => event.event === 'search_failed').length;
      json(response, 200, { schemaVersion: 'clervo.n4.26.metrics.v1', requestCount: successful + failed, usefulResultRate: successful + failed === 0 ? 0 : successful / (successful + failed), latencyMs: { p50: percentile(state.durations, 0.5), p95: percentile(state.durations, 0.95), p99: percentile(state.durations, 0.99) }, cache: state.cache, quota: { used: state.operationCount, limit: MAXIMUM_OPERATIONS }, concurrency: { perRoute: 1, perDomain: 2 }, costs: state.costs, operationCostCeilingUsd: OPERATION_COST_CEILING_USD, trafficStopped: state.trafficStopped, routeDegradation: state.routeStopped, citationVerifierAvailable: state.citationVerifierAvailable, cacheAvailable: state.cacheAvailable, recentEvents: state.events.slice(-100) });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/search') {
      json(response, 200, await executeSearch(await body(request)));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/cache/probe') {
      const input = await body(request);
      json(response, 200, { disclosure: await cacheProbe(input.url, input.routeId ?? 'clervo.live-federation.v1', input.forceRefresh === true, input.upstreamDegraded === true) });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/control') {
      const input = await body(request);
      const allowed = new Set(['traffic_stop', 'traffic_restore', 'focused_stop', 'focused_restore', 'live_stop', 'live_restore', 'citation_fail', 'citation_restore', 'cache_fail', 'cache_restore', 'quota_exhaust']);
      if (!allowed.has(input.action)) throw new Error('invalid_control_action');
      if (input.action === 'traffic_stop') state.trafficStopped = true;
      if (input.action === 'traffic_restore') state.trafficStopped = false;
      if (input.action === 'focused_stop') state.routeStopped.focused = true;
      if (input.action === 'focused_restore') state.routeStopped.focused = false;
      if (input.action === 'live_stop') state.routeStopped.live = true;
      if (input.action === 'live_restore') state.routeStopped.live = false;
      if (input.action === 'citation_fail') state.citationVerifierAvailable = false;
      if (input.action === 'citation_restore') state.citationVerifierAvailable = true;
      if (input.action === 'cache_fail') state.cacheAvailable = false;
      if (input.action === 'cache_restore') state.cacheAvailable = true;
      if (input.action === 'quota_exhaust') state.operationCount = MAXIMUM_OPERATIONS;
      record({ event: `control_${input.action}`, severity: input.action.includes('stop') || input.action.includes('fail') || input.action.includes('exhaust') ? 'ERROR' : 'INFO', state: state.trafficStopped ? 'unavailable' : 'ready' });
      json(response, 200, { action: input.action, trafficStopped: state.trafficStopped, routeStopped: state.routeStopped, citationVerifierAvailable: state.citationVerifierAvailable, cacheAvailable: state.cacheAvailable, operationCount: state.operationCount });
      return;
    }
    json(response, 404, { code: 'not_found' });
  } catch (error) {
    json(response, 503, { code: error instanceof Error ? error.message : 'n426_staging_failure', lifecycle: 'unavailable', retryable: true });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  record({ event: 'n426_staging_started', state: 'ready', code: sha256(`${state.startedAt}:${PORT}`).slice(0, 24) });
});
