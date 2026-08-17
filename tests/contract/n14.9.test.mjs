import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SEARCH_FREE_PATH,
  createSearchResponse,
} from '../../dist/packages/contracts/src/index.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import { createTrafficControl } from '../../apps/api/src/traffic-control.mjs';
import { readFile } from 'node:fs/promises';

const now = '2026-08-02T13:00:00.000Z';

function executor() {
  let calls = 0;
  return {
    get calls() { return calls; },
    execute(input) {
      calls += 1;
      const evidenceText = 'Traffic recovered after the bounded safety probe.';
      return {
        searchResponse: createSearchResponse({
          operationId: input.operationId,
          query: input.query,
          now,
          maxResults: input.maxResults,
          evidence: [{
            resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
            sourceId: 'adapter_mock.search',
            url: 'https://example.com/traffic',
            title: 'Traffic evidence',
            snippet: evidenceText,
            evidenceText,
            retrievedAt: now,
            publishedAt: '2026-08-02T12:00:00.000Z',
            authorityScore: 90,
            relevanceScore: 95,
          }],
          citations: [{
            citationId: 'cite_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
            resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
            canonicalUrl: 'https://example.com/traffic',
            quote: evidenceText,
            startOffset: 0,
            endOffset: evidenceText.length,
          }],
        }),
      };
    },
  };
}

test('independent traffic control stops new work and requires a successful probe to restore', async () => {
  const trafficControl = createTrafficControl('open');
  const value = executor();
  const server = createSearchServer({ executor: value, trafficControl, now: () => now });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const post = () => fetch(`${origin}${SEARCH_FREE_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'idem_n149_traffic_001' },
    body: JSON.stringify({ query: 'traffic recovery', maxResults: 1, synthesize: false }),
  });
  try {
    trafficControl.stop('incident_containment');
    const stopped = await post();
    assert.equal(stopped.status, 503);
    assert.equal(stopped.headers.get('retry-after'), '30');
    assert.equal((await stopped.json()).code, 'traffic_stopped');
    assert.equal(value.calls, 0);
    assert.equal((await fetch(`${origin}/v1/health`)).status, 200);
    assert.equal((await fetch(`${origin}/readyz`)).status, 503);
    assert.throws(() => trafficControl.restore({ probeSucceeded: false }), /traffic_restore_probe_required/u);

    trafficControl.restore({ probeSucceeded: true });
    const restored = await post();
    assert.equal(restored.status, 200);
    assert.equal(value.calls, 1);
    assert.equal((await fetch(`${origin}/readyz`)).status, 200);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('rollback policy requires an immutable target and current health before traffic restore', async () => {
  const policy = JSON.parse(await readFile('infra/production/rollback-policy.v1.json', 'utf8'));
  assert.equal(policy.trafficStopEnvironment, 'CLERVO_TRAFFIC_MODE=stopped');
  assert.equal(policy.rollbackTarget, 'previous_verified_immutable_registry_digest');
  assert.equal(policy.rollbackFailsClosedWithoutTarget, true);
  assert.equal(policy.productionMutationRequiresOwnerApproval, true);
  assert.deepEqual(policy.trafficRestoreRequires, [
    'database_readiness',
    'monitoring_delivery',
    'current_live_health',
  ]);
});
