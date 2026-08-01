#!/usr/bin/env node

import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import {
  FOCUSED_INDEX_ADAPTER_ID, FOCUSED_INDEX_FAILURE_DOMAIN, FOCUSED_INDEX_HEALTH_IDENTITY,
  FOCUSED_INDEX_PROVIDER_ID, MEILISEARCH_VERSION, createFocusedIndexDocument,
  focusedIndexRuntimeIdentity,
} from '../../../dist/packages/contracts/src/index.js';
import { createMeilisearchFocusedIndexAdapter } from '../../../dist/adapters/search/src/meilisearch-focused-index.js';
import { FileDurableRetrievalCacheStore } from '../../../dist/adapters/search/src/file-retrieval-cache.js';
import { FocusedIndexRoute } from '../../../dist/services/search/src/focused-index.js';
import { ConnectedRetrievalPipeline, createFocusedConnectedRoute, createLiveConnectedRoute } from '../../../dist/services/search/src/connected-retrieval.js';
import { createDirectCurrentPageFetch, LiveFederationCircuit, LiveFederationRoute } from '../../../dist/services/search/src/live-federation.js';
import { DurableRetrievalCache, retrievalCacheKey, retrievalCachePolicySha256 } from '../../../dist/services/search/src/retrieval-cache.js';
import { createN427tSourceAdapters, sourceQualifications } from '../../../infra/n4.27t/source-adapters.mjs';

const PORT = Number(process.env.PORT ?? '8080');
const DATA_ROOT = process.env.CLERVO_N427T_DATA_ROOT ?? '/var/lib/clervo-n427t/cache';
const MEILI_ENDPOINT = process.env.CLERVO_N427T_MEILI_ENDPOINT ?? 'http://clervo-n427t-meilisearch:7700/';
const MEILI_MASTER_KEY_FILE = process.env.CLERVO_N427T_MEILI_MASTER_KEY_FILE ?? '/var/run/clervo-n427t-meili/masterKey';
const MAXIMUM_OPERATIONS = Number(process.env.CLERVO_N427T_MAXIMUM_OPERATIONS ?? '900');
const MAXIMUM_CONCURRENT_ROUTES = Number(process.env.CLERVO_N427T_MAXIMUM_CONCURRENT_ROUTES ?? '2');
const OPERATION_COST_CEILING_USD = Number(process.env.CLERVO_N427T_OPERATION_COST_CEILING_USD ?? '0.002');
const USER_AGENT = 'Clervo-N4.27T-Staging/1.0 (mo@clervo.dev)';
const seedUrls = Object.freeze([
  'https://developer.woocommerce.com/docs/category/store-api',
  'https://www.sec.gov/about/developer-resources',
  'https://dev.socrata.com/docs/other/catalog/',
  'https://www.crossref.org/documentation/retrieve-metadata/rest-api/',
  'https://docs.github.com/en/rest/search/search',
  'https://www.mediawiki.org/wiki/API:Etiquette',
]);
const approvedDomains = Object.freeze(['developer.woocommerce.com','woocommerce.com','www.sec.gov','dev.socrata.com','api.us.socrata.com','www.crossref.org','doi.org','docs.github.com','github.com','www.npmjs.com','www.mediawiki.org','en.wikipedia.org']);
const seedProbes = Object.freeze([
  ['public_catalog', 'WooCommerce extension offer'],
  ['government_open_data', 'building permits open data'],
  ['corporate_disclosure', 'Reddit annual report 10-K'],
  ['research_registry', 'Attention Is All You Need DOI'],
  ['developer_registry', 'npm package ajv current version'],
  ['wikimedia', 'Open data'],
]);
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const percentile = (values, fraction) => values.length === 0 ? 0 : [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(`${JSON.stringify(value)}\n`);
}
async function body(request) {
  const chunks = []; let bytes = 0;
  for await (const chunk of request) { bytes += chunk.length; if (bytes > 32_768) throw new Error('request_too_large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function meiliTransport(request) {
  const response = await fetch(new URL(request.path, MEILI_ENDPOINT), { method: request.method, headers: request.headers, ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }) });
  const text = await response.text();
  return { status: response.status, body: text === '' ? {} : JSON.parse(text) };
}
async function waitForMeili(key) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try { const response = await fetch(new URL('/health', MEILI_ENDPOINT), { headers: { authorization: `Bearer ${key}` } }); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('focused_index_startup_unavailable');
}

const state = {
  startedAt: new Date().toISOString(), trafficStopped: false, routeStopped: { focused: false, live: false }, citationVerifierAvailable: true,
  cacheAvailable: true, costBounded: true, operationCount: 0, activeRoutes: 0, maximumObservedRoutes: 0,
  browserMinutesUsed: 0, events: [], durations: [], cacheDisclosures: [], grossOperationCostUsd: 0,
};
function record(event) {
  const safe = Object.freeze({ timestamp: new Date().toISOString(), event: event.event, severity: event.severity ?? 'INFO', routeId: event.routeId, state: event.state, code: event.code, durationMs: event.durationMs, resultCount: event.resultCount, estimatedCostUsd: event.estimatedCostUsd });
  state.events.push(safe); if (state.events.length > 1_000) state.events.shift();
  process.stdout.write(`${JSON.stringify({ schemaVersion: 'clervo.n4.27t.monitoring-event.v1', ...safe })}\n`);
}

async function createRuntime() {
  await mkdir(DATA_ROOT, { recursive: true });
  const masterKey = (await readFile(MEILI_MASTER_KEY_FILE, 'utf8')).trim();
  if (masterKey.length < 16) throw new Error('meilisearch_master_key_unavailable');
  await waitForMeili(masterKey);
  const index = createMeilisearchFocusedIndexAdapter({ endpoint: MEILI_ENDPOINT, masterKey, indexUid: 'clervo_n427t_focused', analyticsDisabled: true, expectedVersion: MEILISEARCH_VERSION, communityFeaturesOnly: true, providerId: FOCUSED_INDEX_PROVIDER_ID, adapterId: FOCUSED_INDEX_ADAPTER_ID, healthIdentity: FOCUSED_INDEX_HEALTH_IDENTITY, failureDomain: FOCUSED_INDEX_FAILURE_DOMAIN }, meiliTransport, focusedIndexRuntimeIdentity);
  const directFetch = createDirectCurrentPageFetch({ maximumBytes: 1_500_000, maximumCompressedBytes: 750_000, deadlineMs: 8_000, userAgent: USER_AGENT });
  const cacheStore = new FileDurableRetrievalCacheStore(`${DATA_ROOT}/retrieval-cache`);
  const cache = new DurableRetrievalCache(cacheStore, 'n427t_staging', 1_500_000, 3_600_000);
  async function cachedTransport(request) {
    if (!state.cacheAvailable) throw new Error('connected_cache_unavailable');
    const identity = { routeId: 'clervo.live-federation.v1', url: request.url.href, requestPolicySha256: retrievalCachePolicySha256() };
    const observedAt = new Date().toISOString();
    const upstreamDegraded = request.headers['x-clervo-upstream-degraded'] === 'true';
    const read = await cache.read({ ...identity, observedAt, upstreamDegraded });
    state.cacheDisclosures.push(read.disclosure); if (state.cacheDisclosures.length > 1_000) state.cacheDisclosures.shift();
    if (read.body !== undefined) return { status: 200, headers: { 'content-type': read.contentType }, body: Buffer.from(read.body).toString('utf8') };
    const remaining = Math.max(1, Date.parse(request.deadlineAt) - Date.now());
    const controller = new AbortController(); const cancel = () => controller.abort(); request.signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const response = await fetch(request.url, { headers: request.headers, redirect: 'error', signal: controller.signal });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 2_000_000) throw new Error('source_response_too_large');
      if (response.status === 200 && bytes.byteLength > 0) await cache.write({ ...identity, fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 120_000).toISOString(), contentType: 'application/json', body: bytes, safety: { containsSecret: false, containsWallet: false, containsCustomerPayload: false, containsUnsafeBrowserState: false } });
      return { status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(bytes).toString('utf8') };
    } finally { clearTimeout(timer); request.signal.removeEventListener('abort', cancel); }
  }
  const sourceAdapters = createN427tSourceAdapters({ transport: cachedTransport, userAgent: USER_AGENT, mailto: 'mo@clervo.dev' });
  if ((await index.listDocuments().catch(() => [])).length === 0) {
    await meiliTransport({ method: 'POST', path: '/indexes', headers: { authorization: `Bearer ${masterKey}`, 'content-type': 'application/json' }, body: { uid: 'clervo_n427t_focused', primaryKey: 'documentId' } }).catch(() => undefined);
    const documents = [];
    for (const [sourceClass, query] of seedProbes) {
      try {
        const adapter = sourceAdapters.find((item) => item.sourceClass === sourceClass); const fetchedAt = new Date().toISOString();
        const candidates = await adapter.search({ query, language: 'en', region: 'US', maximumResults: 2, retrievedAt: fetchedAt, deadlineAt: new Date(Date.now() + 8_000).toISOString(), signal: new AbortController().signal });
        for (const item of candidates) documents.push(createFocusedIndexDocument({ title: item.title, content: `${item.title}\n${item.snippet}`, sourceUrl: item.currentUrl, canonicalUrl: item.currentUrl, mime: 'text/plain', language: 'en', fetchedAt, staleAt: new Date(Date.parse(fetchedAt) + 3_600_000).toISOString(), recrawlAt: new Date(Date.parse(fetchedAt) + 3_600_000).toISOString(), expiresAt: new Date(Date.parse(fetchedAt) + 86_400_000).toISOString() }));
      } catch (error) { record({ event: 'focused_seed_rejected', severity: 'WARNING', routeId: 'clervo.focused-index.v1', state: 'degraded', code: error instanceof Error ? error.message : 'seed_failed' }); }
    }
    if (documents.length < 3) throw new Error('focused_index_seed_floor_failed');
    await index.rebuild(documents);
  }
  const focused = new FocusedIndexRoute({ approvedDomains, explicitSeeds: seedUrls, policies: approvedDomains.map((domain) => ({ domain, contentUse: 'approved', language: 'en' })), denylist: [], maximumPages: 100, maximumPagesPerDomain: 20, maximumConcurrencyPerDomain: 1, minimumDelayMsPerDomain: 1_000, maximumFrontierItems: 150, staleAfterMs: 3_600_000, expireAfterMs: 86_400_000, recrawlAfterMs: 3_600_000, nearDuplicateThresholdBasisPoints: 8_500 }, { fetch: async () => { throw new Error('staging_frontier_not_exposed'); }, worker: { workerId: 'worker_scrapling_0_4_12', version: '0.4.12', extract: async () => { throw new Error('staging_frontier_not_exposed'); } }, index });

  const circuit = new LiveFederationCircuit(3, 750);
  const live = new LiveFederationRoute({ adapters: sourceAdapters, fetch: directFetch, circuit, perSourceDeadlineMs: 1_200, perPageDeadlineMs: 600 });
  return Object.freeze({ index, focused, live, sourceAdapters, directFetch, cache, cacheStore });
}

const runtime = await createRuntime();

function freshness(result, cacheState) {
  const observedAt = new Date().toISOString();
  const fetchedAt = result.retrievedAt;
  const expiresAt = new Date(Date.parse(fetchedAt) + 120_000).toISOString();
  const freshnessState = Date.parse(observedAt) < Date.parse(expiresAt) ? 'fresh' : 'stale';
  return { ...result, observedAt, fetchedAt, expiresAt, freshnessState, cacheState, route: result.routeId, freshRetrievalFailure: freshnessState === 'stale' ? 'revalidation_not_completed' : null };
}
async function executeSearch(input) {
  if (state.trafficStopped) throw new Error('global_search_traffic_stopped');
  if (state.operationCount >= MAXIMUM_OPERATIONS) throw new Error('daily_operation_budget_exhausted');
  if (!state.costBounded || !(OPERATION_COST_CEILING_USD > 0 && OPERATION_COST_CEILING_USD <= 0.002)) throw new Error('operation_cost_not_bounded');
  if (state.activeRoutes >= MAXIMUM_CONCURRENT_ROUTES) throw new Error('route_concurrency_exhausted');
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const route = input.route ?? 'combined';
  if (query === '' || query.length > 500 || !['combined','focused','live','simple'].includes(route)) throw new Error('invalid_search_request');
  if (route !== 'focused' && !state.cacheAvailable) throw new Error('connected_cache_unavailable');
  const maximumResults = Math.max(1, Math.min(10, Number(input.maximumResults ?? 5)));
  const verticalProfile = ['commerce','property','companies','research','developer_documentation','generic_fallback'].includes(input.verticalProfile) ? input.verticalProfile : 'generic_fallback';
  const operatingProfile = ['fast','balanced','thorough'].includes(input.operatingProfile) ? input.operatingProfile : 'balanced';
  state.operationCount += 1; state.activeRoutes += 1; state.maximumObservedRoutes = Math.max(state.maximumObservedRoutes, state.activeRoutes);
  const started = performance.now(); const cacheStart = state.cacheDisclosures.length;
  try {
    const generatedAt = new Date().toISOString(); let result;
    const focusedStopped = state.routeStopped.focused; const liveStopped = state.routeStopped.live;
    if (route === 'focused') {
      if (focusedStopped) throw new Error('focused_route_stopped');
      const documents = await runtime.focused.query(query, generatedAt, maximumResults);
      result = { status: 'ready', route, results: documents.map((document) => ({ title: document.title, url: document.provenance.canonicalUrl, canonicalUrl: document.provenance.canonicalUrl, evidenceText: document.content, retrievedAt: document.fetchedAt, providerId: document.providerId, adapterId: document.adapterId, routeId: document.routeId, extraction: { extractionId: `extract_${document.contentSha256.slice(7, 39)}`, sourceBodySha256: document.contentSha256, normalizedTextSha256: document.contentSha256 } })) };
    } else if (route === 'live') {
      if (liveStopped) throw new Error('live_route_stopped');
      const results = await runtime.live.search({ query, language: input.language ?? 'en', region: input.region ?? 'US', maximumResults, generatedAt, deadlineAt: new Date(Date.now() + 1_700).toISOString(), signal: new AbortController().signal });
      result = { status: 'ready', route, results };
    } else if (route === 'simple') {
      const [focusedResults, liveResults] = await Promise.all([focusedStopped ? [] : runtime.focused.query(query, generatedAt, maximumResults), liveStopped ? [] : runtime.live.search({ query, language: input.language ?? 'en', region: input.region ?? 'US', maximumResults, generatedAt, deadlineAt: new Date(Date.now() + 1_700).toISOString(), signal: new AbortController().signal }).catch(() => [])]);
      result = { status: focusedStopped || liveStopped ? 'degraded' : 'ready', route, results: [...focusedResults.map((document) => ({ title: document.title, url: document.provenance.canonicalUrl, canonicalUrl: document.provenance.canonicalUrl, evidenceText: document.content, retrievedAt: document.fetchedAt, providerId: document.providerId, adapterId: document.adapterId, routeId: document.routeId })), ...liveResults].slice(0, maximumResults), citations: [] };
    } else {
      if (focusedStopped && liveStopped) throw new Error('connected_retrieval_both_routes_unavailable');
      const focusedAdapter = focusedStopped ? { identity: createFocusedConnectedRoute(runtime.focused).identity, search: async () => { throw new Error('focused_route_stopped'); } } : createFocusedConnectedRoute(runtime.focused);
      const liveAdapter = liveStopped ? { identity: createLiveConnectedRoute(runtime.live).identity, search: async () => { throw new Error('live_route_stopped'); } } : createLiveConnectedRoute(runtime.live);
      result = await new ConnectedRetrievalPipeline({ focused: focusedAdapter, live: liveAdapter, directFetch: runtime.directFetch }).searchWeb({ operationId: `op_${randomBytes(20).toString('hex')}`, query, language: input.language ?? 'en', region: input.region ?? 'US', maximumResults, generatedAt, deadlineMs: 2_000, verticalProfile, operatingProfile });
      if (!state.citationVerifierAvailable) throw new Error('citation_verifier_unavailable');
    }
    const durationMs = performance.now() - started;
    const cacheEvents = state.cacheDisclosures.slice(cacheStart);
    const cacheState = cacheEvents.some((item) => item.state === 'fresh') ? 'fresh_hit' : 'miss';
    const estimatedCostUsd = Math.min(OPERATION_COST_CEILING_USD, 0.00002 + durationMs * 0.00000002);
    state.durations.push(durationMs); state.grossOperationCostUsd += estimatedCostUsd;
    const sourceTelemetry = runtime.sourceAdapters.map((adapter) => adapter.telemetry());
    const latestSourceMs = Math.max(0, ...sourceTelemetry.flatMap((source) => source.observations.slice(-1).map((item) => item.durationMs)));
    const response = { ...result, results: result.results.map((item) => freshness(item, cacheState)), sourceLocale: sourceQualifications.map(({ sourceClass, localeMode }) => ({ sourceClass, requestedLanguage: input.language ?? 'en', requestedRegion: input.region ?? 'US', localeMode, upstreamHonoring: localeMode.includes('honored') ? 'honored' : 'unsupported_disclosed' })), timing: { totalMs: Number(durationMs.toFixed(3)), sourceMs: latestSourceMs, rankingCitationSchemaMs: Number(Math.max(0, durationMs - latestSourceMs).toFixed(3)), extractionMs: 0, cacheMs: Number(cacheEvents.reduce((sum, item) => sum + (item.state === 'fresh' ? 0.1 : 0.2), 0).toFixed(3)), browserMs: 0 }, operationCost: { estimatedUsd: estimatedCostUsd, hardCeilingUsd: OPERATION_COST_CEILING_USD, providerGeneralWebSearchUsd: 0 } };
    record({ event: 'search_completed', routeId: route, state: response.status, durationMs, resultCount: response.results.length, estimatedCostUsd });
    return response;
  } catch (error) {
    const durationMs = performance.now() - started; state.durations.push(durationMs);
    record({ event: 'search_failed', severity: 'ERROR', routeId: route, state: 'unavailable', code: error instanceof Error ? error.message : 'search_failed', durationMs, estimatedCostUsd: 0 });
    throw error;
  } finally { state.activeRoutes -= 1; }
}

async function control(action, input) {
  const valid = new Set(['traffic_stop','traffic_restore','focused_stop','focused_restore','live_stop','live_restore','citation_fail','citation_restore','cache_fail','cache_restore','cost_unbounded','cost_restore','quota_exhaust','quota_reset','source_suspend','source_restore']);
  if (!valid.has(action)) throw new Error('invalid_control_action');
  if (action === 'traffic_stop') state.trafficStopped = true;
  if (action === 'traffic_restore') state.trafficStopped = false;
  if (action === 'focused_stop') state.routeStopped.focused = true;
  if (action === 'focused_restore') state.routeStopped.focused = false;
  if (action === 'live_stop') state.routeStopped.live = true;
  if (action === 'live_restore') state.routeStopped.live = false;
  if (action === 'citation_fail') state.citationVerifierAvailable = false;
  if (action === 'citation_restore') state.citationVerifierAvailable = true;
  if (action === 'cache_fail') state.cacheAvailable = false;
  if (action === 'cache_restore') state.cacheAvailable = true;
  if (action === 'cost_unbounded') state.costBounded = false;
  if (action === 'cost_restore') state.costBounded = true;
  if (action === 'quota_exhaust') state.operationCount = MAXIMUM_OPERATIONS;
  if (action === 'quota_reset') { state.operationCount = 0; runtime.sourceAdapters.forEach((adapter) => adapter.resetQuota()); }
  if (action === 'source_suspend' || action === 'source_restore') {
    const adapter = runtime.sourceAdapters.find((item) => item.sourceClass === input.sourceClass);
    if (adapter === undefined) throw new Error('unknown_source_class');
    if (action === 'source_suspend') adapter.suspend(); else adapter.restore();
  }
  record({ event: `control_${action}`, severity: /stop|fail|unbounded|exhaust|suspend/u.test(action) ? 'ERROR' : 'INFO', state: state.trafficStopped ? 'unavailable' : 'ready' });
  return { action, state: { trafficStopped: state.trafficStopped, routeStopped: state.routeStopped, citationVerifierAvailable: state.citationVerifierAvailable, cacheAvailable: state.cacheAvailable, costBounded: state.costBounded, operationCount: state.operationCount } };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://clervo-n427t.invalid');
  try {
    if (request.method === 'GET' && url.pathname === '/healthz') {
      json(response, 200, { schemaVersion: 'clervo.n4.27t.health.v1', lifecycle: state.trafficStopped ? 'unavailable' : 'ready', publicIngress: false, payment: 'disabled', routes: { focused: await runtime.index.health(new Date().toISOString()), live: { ...runtime.live.health(new Date().toISOString()), circuit: runtime.live.circuit.state } }, sources: runtime.sourceAdapters.map((adapter) => adapter.telemetry()), providerGeneralWebSearchCostUsd: 0 }); return;
    }
    if (request.method === 'GET' && url.pathname === '/metrics') {
      json(response, 200, { schemaVersion: 'clervo.n4.27t.metrics.v1', requestCount: state.events.filter((event) => event.event.startsWith('search_')).length, latencyMs: { p50: percentile(state.durations, 0.5), p95: percentile(state.durations, 0.95), p99: percentile(state.durations, 0.99) }, cache: { miss: state.cacheDisclosures.filter((item) => item.state === 'miss').length, fresh: state.cacheDisclosures.filter((item) => item.state === 'fresh').length, stale: state.cacheDisclosures.filter((item) => item.state === 'stale_while_degraded').length }, quota: { used: state.operationCount, limit: MAXIMUM_OPERATIONS }, concurrency: { currentRoutes: state.activeRoutes, maximumObservedRoutes: state.maximumObservedRoutes, perRouteLimit: MAXIMUM_CONCURRENT_ROUTES, perDomainLimit: 2 }, browserMinutesUsed: state.browserMinutesUsed, costs: { grossOperationCostUsd: state.grossOperationCostUsd, providerGeneralWebSearchUsd: 0, operationCeilingUsd: OPERATION_COST_CEILING_USD }, sources: runtime.sourceAdapters.map((adapter) => adapter.telemetry()), recentEvents: state.events.slice(-100) }); return;
    }
    if (request.method === 'POST' && url.pathname === '/v1/search') { json(response, 200, await executeSearch(await body(request))); return; }
    if (request.method === 'POST' && url.pathname === '/control') { const input = await body(request); json(response, 200, await control(input.action, input)); return; }
    if (request.method === 'POST' && url.pathname === '/v1/cache/probe') {
      const input = await body(request); const identity = { routeId: input.routeId ?? 'clervo.live-federation.v1', url: input.url, requestPolicySha256: retrievalCachePolicySha256() };
      if (input.action === 'evict') await runtime.cache.evict(identity);
      if (input.action === 'invalidate_url') await runtime.cache.invalidateUrl(input.url);
      if (input.action === 'deny_domain') await runtime.cache.denyDomain(new URL(input.url).hostname);
      if (input.action === 'poison_integrity') {
        const fetchedAt = new Date().toISOString();
        const record = await runtime.cache.write({ ...identity, fetchedAt, expiresAt: new Date(Date.parse(fetchedAt) + 120_000).toISOString(), contentType: 'application/json', body: Buffer.from('{"fixture":true}'), safety: { containsSecret: false, containsWallet: false, containsCustomerPayload: false, containsUnsafeBrowserState: false } });
        await runtime.cacheStore.put({ ...record, cacheKey: retrievalCacheKey(identity), bodySha256: sha256('controlled-integrity-corruption') });
      }
      const disclosure = await runtime.cache.read({ ...identity, observedAt: input.observedAt ?? new Date().toISOString(), forceRefresh: input.forceRefresh === true, upstreamDegraded: input.upstreamDegraded === true });
      json(response, 200, disclosure); return;
    }
    json(response, 404, { code: 'not_found' });
  } catch (error) { json(response, 503, { code: error instanceof Error ? error.message : 'n427t_staging_failure', lifecycle: 'unavailable', retryable: true }); }
});
server.listen(PORT, '0.0.0.0', () => record({ event: 'n427t_staging_started', state: 'ready', code: sha256(`${state.startedAt}:${PORT}`).slice(0, 24) }));
