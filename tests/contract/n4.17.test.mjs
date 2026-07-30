import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryFreeSearchQuota, SEARCH_FREE_PATH, SEARCH_PAID_PATH } from '../../dist/packages/contracts/src/index.js';
import { createRecordedSearchExecutor } from '../../dist/services/search/src/recorded-pipeline.js';
import { createSearchMonitor } from '../../dist/services/search/src/monitoring.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';

const now = '2026-07-31T00:10:00.000Z';

async function withServer(options, run) {
  const server = createSearchServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function post(origin, path, key, body) {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify(body),
  });
}

test('search monitoring aggregates fixed lifecycle signals without request or operation cardinality', () => {
  const monitor = createSearchMonitor();
  monitor.record({ timestamp: now, productId: 'search.web', outcome: 'success', durationSeconds: 0.125, operationId: 'op_01JZ8Q5Y4QFD48Q24H6M5F4K9P' });
  monitor.record({ timestamp: now, productId: 'search.answer', outcome: 'quota_rejected', durationSeconds: 0.025 });
  monitor.record({ timestamp: now, productId: 'search.answer', outcome: 'payment_challenge', durationSeconds: 0.01 });
  const snapshot = monitor.snapshot(now);
  assert.deepEqual(snapshot.summary, {
    requestsObserved: 3,
    successfulExecutions: 1,
    failedExecutions: 0,
    quotaRejections: 1,
    paymentChallenges: 1,
    paidCompletions: 0,
    availabilityRatio: 1,
    latencySeconds: { count: 3, total: 0.16, maximum: 0.125, average: 0.16 / 3 },
  });
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes('operationId'), false);
  assert.equal(serialized.includes('requestHash'), false);
  assert.equal(snapshot.metricPoints.every((point) => point.attributes.every((attribute) => ['component', 'outcome', 'product_id'].includes(attribute.name))), true);
});

test('execution failures create a fixed safe alert and availability signal', () => {
  const monitor = createSearchMonitor();
  monitor.record({ timestamp: now, productId: 'search.web', outcome: 'success', durationSeconds: 0.1 });
  monitor.record({ timestamp: now, productId: 'search.web', outcome: 'execution_failure', durationSeconds: 0.2, operationId: 'op_01JZ8Q5Y4QFD48Q24H6M5F4K9P' });
  const snapshot = monitor.snapshot(now);
  assert.equal(snapshot.summary.availabilityRatio, 0.5);
  assert.equal(snapshot.alerts.length, 1);
  assert.equal(snapshot.alerts[0].code, 'search.execution_failure');
  assert.equal(snapshot.alerts[0].summary, 'A bounded search execution failed closed.');
  assert.deepEqual(snapshot.alerts[0].labels, [
    { name: 'component', value: 'search' },
    { name: 'outcome', value: 'execution_failure' },
    { name: 'product_id', value: 'search.web' },
  ]);
});

test('monitoring rejects unbounded dimensions, freezes snapshots, and caps retained evidence', () => {
  const monitor = createSearchMonitor();
  assert.throws(() => monitor.record({ timestamp: now, productId: 'search.web', outcome: 'success', durationSeconds: -1 }), /invalid_search_monitoring_duration/u);
  assert.throws(() => monitor.record({ timestamp: now, productId: 'search.dynamic', outcome: 'success' }), /invalid_search_monitoring_product/u);
  for (let index = 0; index < 140; index += 1) monitor.record({ timestamp: now, productId: 'search.web', outcome: 'success', durationSeconds: index / 1_000 });
  const snapshot = monitor.snapshot(now);
  assert.equal(snapshot.metricPoints.length, 128);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.summary.latencySeconds), true);
  assert.throws(() => snapshot.metricPoints.push({}), TypeError);
});

test('an injected exporter receives bounded snapshots and its failure cannot escape', async () => {
  const exported = [];
  const monitor = createSearchMonitor({ export(snapshot) { exported.push(snapshot); throw new Error('collector unavailable'); } });
  monitor.record({ timestamp: now, productId: 'search.answer', outcome: 'paid_completion' });
  assert.equal(await monitor.exportSnapshot(now), false);
  assert.equal(exported.length, 1);
  const state = monitor.snapshot(now).exportState;
  assert.deepEqual(state, { configured: true, successfulExports: 0, failedExports: 1 });
});

test('search HTTP lifecycle records success, quota, challenge, and execution failure without changing responses', async () => {
  const monitor = createSearchMonitor();
  let elapsed = 0;
  const monotonicNow = () => { elapsed += 25; return elapsed; };
  await withServer({ executor: createRecordedSearchExecutor(), monitor, now: () => now, monotonicNow, freeQuota: new InMemoryFreeSearchQuota(1, 60_000) }, async (origin) => {
    assert.equal((await post(origin, SEARCH_FREE_PATH, 'idem_n417_success', { query: 'monitor success' })).status, 200);
    assert.equal((await post(origin, SEARCH_FREE_PATH, 'idem_n417_quota', { query: 'monitor quota' })).status, 429);
    assert.equal((await post(origin, SEARCH_PAID_PATH, 'idem_n417_challenge', { query: 'monitor challenge' })).status, 402);
  });
  await withServer({ executor: createRecordedSearchExecutor({ failPathId: 'retrieval_recorded_fallback' }), monitor, now: () => now, monotonicNow }, async (origin) => {
    const response = await post(origin, SEARCH_FREE_PATH, 'idem_n417_failure', { query: 'monitor failure' });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, 'search_execution_recorded_federation_incomplete');
  });
  const summary = monitor.snapshot(now).summary;
  assert.deepEqual({
    requestsObserved: summary.requestsObserved,
    successfulExecutions: summary.successfulExecutions,
    failedExecutions: summary.failedExecutions,
    quotaRejections: summary.quotaRejections,
    paymentChallenges: summary.paymentChallenges,
  }, { requestsObserved: 4, successfulExecutions: 1, failedExecutions: 1, quotaRejections: 1, paymentChallenges: 1 });
});

test('monitor exceptions are isolated from customer search behavior', async () => {
  const monitor = { record() { throw new Error('monitor failed'); } };
  await withServer({ executor: createRecordedSearchExecutor(), monitor, now: () => now }, async (origin) => {
    const response = await post(origin, SEARCH_FREE_PATH, 'idem_n417_isolation', { query: 'monitor isolation' });
    assert.equal(response.status, 200);
  });
});