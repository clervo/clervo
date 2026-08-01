#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const baseUrl = process.env.CLERVO_N427S_BASE_URL ?? 'http://127.0.0.1:18080';
async function call(path, payload) { const started = performance.now(); const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); return { status: response.status, durationMs: Number((performance.now() - started).toFixed(3)), body: await response.json() }; }
async function health() { return (await (await fetch(`${baseUrl}/healthz`)).json()); }
const scenarios = [
  { id: 'commerce', request: { query: 'WooCommerce LoginKit current USD offer', route: 'combined', maximumResults: 5, language: 'en', region: 'US', verticalProfile: 'commerce' } },
  { id: 'property', request: { query: 'Chicago building permits open data', route: 'combined', maximumResults: 5, language: 'en', region: 'US', verticalProfile: 'property' } },
  { id: 'company', request: { query: 'Reddit recent annual report 10-K', route: 'combined', maximumResults: 5, language: 'en', region: 'US', verticalProfile: 'companies' } },
  { id: 'research', request: { query: 'Attention Is All You Need DOI', route: 'combined', maximumResults: 5, language: 'en', region: 'US', verticalProfile: 'research' } },
  { id: 'developer', request: { query: 'npm package zod current version schema validation', route: 'combined', maximumResults: 5, language: 'en', region: 'US', verticalProfile: 'developer_documentation' } },
];
const latency = [];
for (const scenario of scenarios) for (let run = 1; run <= 3; run += 1) latency.push({ scenario: scenario.id, run, ...(await call('/v1/search', scenario.request)) });
const drills = [];
async function control(action, extra = {}) { return call('/control', { action, ...extra }); }
await control('focused_stop'); drills.push({ id: 'focused_down', response: await call('/v1/search', scenarios[0].request) }); await control('focused_restore');
await control('live_stop'); drills.push({ id: 'live_down', response: await call('/v1/search', scenarios[0].request) }); await control('focused_stop'); drills.push({ id: 'all_routes_down', response: await call('/v1/search', scenarios[0].request) }); await control('focused_restore'); await control('live_restore');
await control('traffic_stop'); drills.push({ id: 'global_stop', response: await call('/v1/search', scenarios[0].request) }); await control('traffic_restore'); drills.push({ id: 'global_restore', response: await call('/v1/search', scenarios[0].request) });
await control('citation_fail'); drills.push({ id: 'citation_verifier_fail_closed', response: await call('/v1/search', scenarios[0].request) }); await control('citation_restore');
await control('cost_unbounded'); drills.push({ id: 'unbounded_cost_stop', response: await call('/v1/search', scenarios[0].request) }); await control('cost_restore');
await control('cache_fail'); drills.push({ id: 'connected_cache_failure', response: await call('/v1/search', scenarios[0].request) }); await control('cache_restore');

await call('/v1/search', scenarios[0].request);
const cacheUrl = 'https://woocommerce.com/wp-json/wc/store/v1/products?search=LoginKit&per_page=3';
drills.push({ id: 'cache_fresh_hit', response: await call('/v1/cache/probe', { url: cacheUrl, routeId: 'clervo.live-federation.v1' }) });
drills.push({ id: 'cache_stale_disclosed', response: await call('/v1/cache/probe', { url: cacheUrl, routeId: 'clervo.live-federation.v1', observedAt: new Date(Date.now() + 180_000).toISOString(), upstreamDegraded: true }) });
drills.push({ id: 'cache_forced_revalidation', response: await call('/v1/cache/probe', { url: cacheUrl, routeId: 'clervo.live-federation.v1', forceRefresh: true }) });
drills.push({ id: 'cache_cross_route_isolation', response: await call('/v1/cache/probe', { url: cacheUrl, routeId: 'clervo.focused-index.v1' }) });
const poisonUrl = 'https://www.crossref.org/n427s-controlled-integrity-fixture';
drills.push({ id: 'cache_integrity_rejection', response: await call('/v1/cache/probe', { action: 'poison_integrity', url: poisonUrl, routeId: 'clervo.live-federation.v1' }) });
drills.push({ id: 'cache_eviction', response: await call('/v1/cache/probe', { action: 'evict', url: cacheUrl, routeId: 'clervo.live-federation.v1' }) });
await call('/v1/search', scenarios[0].request);
drills.push({ id: 'cache_removal_invalidation', response: await call('/v1/cache/probe', { action: 'invalidate_url', url: cacheUrl, routeId: 'clervo.live-federation.v1' }) });
drills.push({ id: 'cache_denylist_invalidation', response: await call('/v1/cache/probe', { action: 'deny_domain', url: 'https://removed-n427s.example/fixture', routeId: 'clervo.live-federation.v1' }) });

await control('source_suspend', { sourceClass: 'public_catalog' });
const openHealth = await health();
drills.push({ id: 'source_suspension_isolated', response: await call('/v1/search', scenarios[1].request), source: openHealth.sources.find((item) => item.sourceClass === 'public_catalog') });
await control('source_restore', { sourceClass: 'public_catalog' });
const halfOpenHealth = await health();
const halfOpenProbe = await call('/v1/search', scenarios[0].request);
const restoredHealth = await health();
drills.push({ id: 'source_half_open_restoration', response: halfOpenProbe, halfOpen: halfOpenHealth.sources.find((item) => item.sourceClass === 'public_catalog'), restored: restoredHealth.sources.find((item) => item.sourceClass === 'public_catalog') });

const concurrent = await Promise.all(Array.from({ length: 3 }, () => call('/v1/search', scenarios[3].request)));
drills.push({ id: 'route_concurrency_enforced', responses: concurrent });
const stormStarted = performance.now();
const storm = await Promise.all(Array.from({ length: 8 }, () => call('/v1/search', { ...scenarios[1].request, route: 'live' })));
drills.push({ id: 'timeout_storm_bounded', durationMs: Number((performance.now() - stormStarted).toFixed(3)), responses: storm });

await control('quota_exhaust'); drills.push({ id: 'operation_quota_stop', response: await call('/v1/search', scenarios[0].request) }); await control('quota_reset');
const metrics = await (await fetch(`${baseUrl}/metrics`)).json();
const byScenario = Object.fromEntries(scenarios.map((scenario) => { const rows = latency.filter((item) => item.scenario === scenario.id); const values = rows.map((item) => item.durationMs); const mean = values.reduce((sum, value) => sum + value, 0) / values.length; return [scenario.id, { runs: values, medianMs: [...values].sort((a, b) => a - b)[1], varianceMs2: Number((values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length).toFixed(3)), sourceMs: rows.map((item) => item.body.timing?.sourceMs ?? 0), rankingMs: rows.map((item) => item.body.timing?.rankingCitationSchemaMs ?? 0), extractionMs: rows.map((item) => item.body.timing?.extractionMs ?? 0), cacheMs: rows.map((item) => item.body.timing?.cacheMs ?? 0), browserMs: rows.map((item) => item.body.timing?.browserMs ?? 0) }]; }));
const drill = (id) => drills.find((item) => item.id === id);
const gates = {
  repetitions: latency.length === 15 && latency.every((item) => item.status === 200),
  routeFailureLifecycle: drill('all_routes_down').response.status === 503,
  globalStopRestored: drill('global_stop').response.status === 503 && drill('global_restore').response.status === 200,
  citationFailClosed: drill('citation_verifier_fail_closed').response.status === 503,
  unboundedCostStopped: drill('unbounded_cost_stop').response.status === 503,
  cacheFailureHonest: drill('connected_cache_failure').response.status === 503,
  cacheFresh: drill('cache_fresh_hit').response.body.disclosure.state === 'fresh',
  cacheStaleDisclosed: drill('cache_stale_disclosed').response.body.disclosure.state === 'stale_while_degraded',
  cacheRevalidation: drill('cache_forced_revalidation').response.body.disclosure.reason === 'forced_refresh',
  cacheRouteBound: drill('cache_cross_route_isolation').response.body.disclosure.state === 'miss',
  cacheIntegrityRejected: drill('cache_integrity_rejection').response.body.disclosure.reason === 'poisoned',
  cacheInvalidation: drill('cache_eviction').response.body.disclosure.state === 'miss' && drill('cache_removal_invalidation').response.body.disclosure.state === 'miss' && drill('cache_denylist_invalidation').response.body.disclosure.reason === 'denylisted',
  sourceCircuitIsolation: drill('source_suspension_isolated').source.circuitState === 'open' && drill('source_suspension_isolated').response.status === 200 && drill('source_suspension_isolated').response.durationMs <= 4000,
  sourceHalfOpenRestoration: drill('source_half_open_restoration').halfOpen.circuitState === 'half_open' && drill('source_half_open_restoration').restored.circuitState === 'closed',
  routeConcurrency: concurrent.filter((item) => item.status === 503).length >= 1,
  timeoutStormBounded: drill('timeout_storm_bounded').durationMs <= 4000 && metrics.concurrency.currentRoutes === 0,
  operationQuota: drill('operation_quota_stop').response.status === 503,
  costAndPayment: metrics.costs.providerGeneralWebSearchUsd === 0 && metrics.costs.operationCeilingUsd <= 0.002,
};
const artifact = { schemaVersion: 'clervo.n4.27s.latency-operations.v1', generatedAt: new Date().toISOString(), networkInclusive: true, repetitionsPerScenario: 3, latency: byScenario, drills, metrics, gates, mandatoryGatePass: Object.values(gates).every(Boolean), providerGeneralWebCostUsd: 0, paymentExecuted: false, usdcSpent: 0 };
const text = `${JSON.stringify(artifact, null, 2)}\n`; await mkdir(new URL('../../../docs/evidence/n4.27s/', import.meta.url), { recursive: true }); await writeFile(new URL('../../../docs/evidence/n4.27s/latency-and-operations.v1.json', import.meta.url), text);
process.stdout.write(`${JSON.stringify({ scenarios: Object.keys(byScenario).length, drills: drills.length, gates, mandatoryGatePass: artifact.mandatoryGatePass, sha256: `sha256:${createHash('sha256').update(text).digest('hex')}` })}\n`);
