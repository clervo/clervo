import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchResponse, SEARCH_PAID_PATH } from '../../dist/packages/contracts/src/index.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';

const observedAt = '2026-08-03T12:00:00.000Z';

function executor() {
  let calls = 0;
  return {
    get calls() { return calls; },
    execute(input) {
      calls += 1;
      const evidenceText = 'The HTTP x402 route returns one useful cited result.';
      return { searchResponse: createSearchResponse({
        operationId: input.operationId,
        query: input.query,
        now: observedAt,
        maxResults: input.maxResults,
        evidence: [{ resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P', sourceId: 'adapter_search.recorded_release_candidate', url: 'https://example.com/http-x402', title: 'HTTP x402', snippet: evidenceText, evidenceText, retrievedAt: observedAt, authorityScore: 90, relevanceScore: 95 }],
        citations: [{ citationId: 'cite_01JZ8Q5Y4QFD48Q24H6M5F4K9P', resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P', canonicalUrl: 'https://example.com/http-x402', quote: evidenceText, startOffset: 0, endOffset: evidenceText.length }],
      }), route: {
        routeId: 'clervo.search.test.recorded.v1',
        qualificationId: 'qual_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
        servingAdapters: ['adapter_search.recorded_release_candidate'],
        degraded: false,
        fallback: false,
        observedAt,
        cost: { semantics: 'documented_cost_basis', basisId: 'search-test-cost-2026-08-09', amount: { asset: 'usd', amountAtomic: '2000', decimals: 6 } },
      } };
    },
  };
}

function x402Service() {
  const calls = { challenge: 0, authorize: 0, settle: 0 };
  return {
    calls,
    mode: 'settlement_enabled',
    async challenge({ quote }) { calls.challenge += 1; return { status: 402, headers: { 'PAYMENT-REQUIRED': 'bounded-public-terms' }, body: { x402Version: 2, accepts: [{ amount: quote.maximumCharge.amountAtomic }] } }; },
    async authorize() { calls.authorize += 1; return { fingerprint: `sha256:${'b'.repeat(64)}` }; },
    async settle() { calls.settle += 1; return { kind: 'settled', headers: { 'PAYMENT-RESPONSE': 'bounded-public-settlement' }, settlement: { success: true, network: 'eip155:8453', transaction: `0x${'c'.repeat(64)}` } }; },
  };
}

async function start(options) {
  const server = createSearchServer(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

function post(origin, headers = {}) {
  return fetch(`${origin}${SEARCH_PAID_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'idem_stage15_http_001', ...headers },
    body: JSON.stringify({ query: 'HTTP payment proof', maxResults: 1, synthesize: false }),
  });
}

test('HTTP route exposes standard x402 headers and no-charge durable replay', async () => {
  const service = x402Service();
  const search = executor();
  const state = new InMemoryX402OperationStore({ environmentNamespace: 'stage15' });
  const app = await start({ executor: search, x402Service: service, x402StateStore: state, environment: 'stage15-private', now: () => observedAt });
  try {
    const challenge = await post(app.origin);
    assert.equal(challenge.status, 402);
    assert.equal(challenge.headers.get('payment-required'), 'bounded-public-terms');
    assert.equal(search.calls, 0);

    const paid = await post(app.origin, { 'payment-signature': 'opaque-test-value' });
    assert.equal(paid.status, 200);
    assert.equal(paid.headers.get('payment-response'), 'bounded-public-settlement');
    const paidBody = await paid.json();
    assert.equal(paidBody.receipt.settlement.status, 'settled');
    assert.equal(paidBody.receipt.provenance[0].routeId, 'clervo.search.test.recorded.v1');
    assert.equal(paidBody.receipt.provenance[0].degraded, false);

    const replay = await post(app.origin);
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get('idempotency-replayed'), 'true');
    assert.equal((await replay.json()).replayed, true);
    assert.deepEqual({ ...service.calls, execute: search.calls }, { challenge: 1, authorize: 1, settle: 1, execute: 1 });

    const health = await (await fetch(`${app.origin}/v1/health`)).json();
    assert.equal(health.paidExecutionEnabled, true);
  } finally {
    await app.close();
  }
});

test('production refuses non-durable real settlement state and mock commerce cannot coexist', () => {
  const service = x402Service();
  const state = new InMemoryX402OperationStore({ environmentNamespace: 'stage15' });
  assert.throws(() => createSearchServer({ executor: executor(), x402Service: service, x402StateStore: state, environment: 'production' }), /production x402 requires durable state/u);
  assert.throws(() => createSearchServer({ executor: executor(), x402Service: service, x402StateStore: state, allowMockPaidExecution: true }), /mock and real commerce cannot be enabled together/u);
});
