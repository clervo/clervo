#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';

const baseUrl = process.env.CLERVO_N426_BASE_URL ?? 'http://127.0.0.1:18080';
const drills = [];

async function post(path, input) {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(25_000) });
    const payload = await response.json();
    return { httpStatus: response.status, durationMs: Number((performance.now() - started).toFixed(2)), lifecycle: payload.lifecycle ?? payload.status, code: payload.code, resultCount: Array.isArray(payload.results) ? payload.results.length : undefined, trafficStopped: payload.trafficStopped, disclosure: payload.disclosure };
  } catch (error) {
    return { httpStatus: 0, durationMs: Number((performance.now() - started).toFixed(2)), lifecycle: 'unavailable', code: error instanceof Error ? error.name : 'transport_failed' };
  }
}

const search = (route = 'combined', query = 'OpenAPI Specification') => post('/v1/search', { query, route, maximumResults: 3, language: 'en', region: 'US' });
const control = (action) => post('/control', { action });
const record = (id, expected, observed) => drills.push({ id, expected, observed, passed: expected(observed) });

await control('focused_stop');
let observed = await search();
record('focused_index_unavailable', (value) => value.httpStatus === 200 ? value.lifecycle === 'degraded' : value.httpStatus === 503 && value.lifecycle === 'unavailable', observed);
await control('focused_restore');

await control('live_stop');
observed = await search();
record('live_federation_unavailable', (value) => value.httpStatus === 200 && value.lifecycle === 'degraded' && value.resultCount > 0, observed);
await control('live_restore');

await control('focused_stop');
await control('live_stop');
observed = await search();
record('both_routes_unavailable', (value) => value.httpStatus === 503 && value.lifecycle === 'unavailable' && value.code === 'connected_retrieval_both_routes_unavailable', observed);
await control('focused_restore');
await control('live_restore');

await control('citation_fail');
observed = await search();
record('citation_verifier_failure', (value) => value.httpStatus === 503 && value.lifecycle === 'unavailable' && value.code === 'citation_verifier_unavailable', observed);
await control('citation_restore');

await control('cache_fail');
observed = await post('/v1/cache/probe', { url: 'https://en.wikipedia.org/wiki/OpenAPI_Specification', routeId: 'clervo.live-federation.v1' });
record('cache_unavailable', (value) => value.httpStatus === 503 && value.lifecycle === 'unavailable' && value.code === 'cache_unavailable', observed);
await control('cache_restore');

const firstCache = await post('/v1/cache/probe', { url: 'https://en.wikipedia.org/wiki/OpenAPI_Specification', routeId: 'clervo.live-federation.v1', forceRefresh: true });
const freshCache = await post('/v1/cache/probe', { url: 'https://en.wikipedia.org/wiki/OpenAPI_Specification', routeId: 'clervo.live-federation.v1' });
await new Promise((resolve) => setTimeout(resolve, 61_000));
const staleCache = await post('/v1/cache/probe', { url: 'https://en.wikipedia.org/wiki/OpenAPI_Specification', routeId: 'clervo.live-federation.v1', upstreamDegraded: true });
record('stale_cache_only_disclosed', (value) => value.first.httpStatus === 200 && value.fresh.disclosure?.state === 'fresh' && value.stale.disclosure?.state === 'stale_while_degraded' && value.stale.disclosure?.staleWhileDegraded === true, { first: firstCache, fresh: freshCache, stale: staleCache });

await control('traffic_stop');
const stopped = await search('focused');
await control('traffic_restore');
const restored = await search('focused');
record('global_kill_switch_and_restore', (value) => value.stopped.httpStatus === 503 && value.stopped.code === 'global_search_traffic_stopped' && value.restored.httpStatus === 200 && value.restored.resultCount > 0, { stopped, restored });

const timeoutAttempts = [];
for (let index = 0; index < 3; index += 1) timeoutAttempts.push(await search('live', 'clervo n426 nonexistent timeout storm target'));
record('timeout_storm_circuit', (value) => value.every((item) => item.httpStatus === 503 && item.lifecycle === 'unavailable'), timeoutAttempts);

await control('quota_exhaust');
observed = await search('focused');
record('quota_exhaustion', (value) => value.httpStatus === 503 && value.code === 'daily_operation_budget_exhausted', observed);

const artifact = {
  schemaVersion: 'clervo.n4.26.traffic-stop-drills.v1',
  generatedAt: new Date().toISOString(),
  environment: 'isolated_gke_staging',
  payment: 'mock_only',
  usdcSpent: 0,
  providerGeneralWebSearchChargeUsd: 0,
  drills,
};
await writeFile(new URL('../../../docs/evidence/n4.26/traffic-stop-drills.v1.json', import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ drills: drills.length, passed: drills.filter((drill) => drill.passed).length, failed: drills.filter((drill) => !drill.passed).map((drill) => drill.id) })}\n`);
