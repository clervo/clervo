import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryFreeSearchQuota,
  SEARCH_FREE_PATH,
  SEARCH_PAID_PATH,
  createSearchResponse,
} from '../../dist/packages/contracts/src/index.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';

const now = '2026-07-30T23:30:00.000Z';

function recordedExecutor() {
  let calls = 0;
  return {
    get calls() { return calls; },
    execute(input) {
      calls += 1;
      const evidenceText = 'Clervo returns exact recorded citation evidence.';
      return {
        searchResponse: createSearchResponse({
          operationId: input.operationId,
          query: input.query,
          now,
          maxResults: input.maxResults,
          evidence: [{
            resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
            sourceId: 'adapter_mock.search',
            url: 'https://example.com/recorded',
            title: 'Recorded evidence',
            snippet: evidenceText,
            evidenceText,
            retrievedAt: '2026-07-30T23:29:00.000Z',
            publishedAt: '2026-07-30T22:00:00.000Z',
            authorityScore: 90,
            relevanceScore: 95,
          }],
          citations: [{
            citationId: 'cite_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
            resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
            canonicalUrl: 'https://example.com/recorded',
            quote: 'Clervo returns exact recorded citation evidence.',
            startOffset: 0,
            endOffset: 48,
          }],
        }),
      };
    },
  };
}

async function withServer(options, run) {
  const server = createSearchServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function post(origin, path, key, body, headers = {}) {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key, ...headers },
    body: JSON.stringify(body),
  });
}

test('bounded free route executes the existing search contract and replays without re-execution or quota use', async () => {
  const executor = recordedExecutor();
  await withServer({ executor, now: () => now, freeQuota: new InMemoryFreeSearchQuota(1, 60_000) }, async (origin) => {
    const first = await post(origin, SEARCH_FREE_PATH, 'idem_n49_free_001', { query: ' recorded evidence ', maxResults: 1, synthesize: false });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('ratelimit-remaining'), '0');
    const result = await first.json();
    assert.equal(result.operation, 'search.query');
    assert.equal(result.fundingMode, 'free');
    assert.equal(result.output.searchResponse.query, 'recorded evidence');
    assert.equal(result.output.searchResponse.citations[0].quote, 'Clervo returns exact recorded citation evidence.');

    const replay = await post(origin, SEARCH_FREE_PATH, 'idem_n49_free_001', { synthesize: false, maxResults: 1, query: 'recorded evidence' });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replayed, true);
    assert.equal(executor.calls, 1);
  });
});

test('free route rejects idempotency conflicts, excess quota, query parameters, and unbounded input', async () => {
  const executor = recordedExecutor();
  await withServer({ executor, now: () => now, freeQuota: new InMemoryFreeSearchQuota(1, 60_000) }, async (origin) => {
    assert.equal((await post(origin, SEARCH_FREE_PATH, 'idem_n49_conflict', { query: 'first', synthesize: false })).status, 200);
    const conflict = await post(origin, SEARCH_FREE_PATH, 'idem_n49_conflict', { query: 'second', synthesize: false });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).code, 'idempotency_conflict');
    const limited = await post(origin, SEARCH_FREE_PATH, 'idem_n49_limited1', { query: 'third', synthesize: false });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, 'free_quota_exceeded');
    assert.equal((await post(origin, `${SEARCH_FREE_PATH}?query=hidden`, 'idem_n49_query_01', { query: 'body' })).status, 400);
    assert.equal((await post(origin, SEARCH_FREE_PATH, 'idem_n49_extra_01', { query: 'body', unbounded: true })).status, 400);
  });
});

test('paid route is non-payable by default and never executes even if a mock payment header is injected', async () => {
  const executor = recordedExecutor();
  await withServer({ executor, now: () => now }, async (origin) => {
    const response = await post(origin, SEARCH_PAID_PATH, 'idem_n49_paid_001', { query: 'paid evidence' }, { 'x-clervo-mock-payment': Buffer.from(JSON.stringify({ mode: 'mock' })).toString('base64') });
    assert.equal(response.status, 402);
    assert.ok(response.headers.get('payment-required'));
    const challenge = await response.json();
    assert.equal(challenge.extensions.clervo.executionAllowed, false);
    assert.equal(challenge.accepts[0].extra.payable, false);
    assert.equal(executor.calls, 0);
  });
});

test('a raw-only release refuses synthesis before quota, execution, or payment challenge', async () => {
  const executor = recordedExecutor();
  await withServer({ executor, now: () => now, synthesisEnabled: false, retrievalMode: 'live_external' }, async (origin) => {
    const response = await post(origin, SEARCH_PAID_PATH, 'idem_n49_synthesis_off', { query: 'live answer', synthesize: true });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'search_synthesis_unavailable');
    assert.equal(executor.calls, 0);
  });
});

test('explicit test-only mock-paid injection verifies, executes, settles, and returns a paid receipt', async () => {
  const executor = recordedExecutor();
  await withServer({ executor, now: () => now, allowMockPaidExecution: true }, async (origin) => {
    const key = 'idem_n49_paid_002';
    const body = { query: 'paid recorded evidence', maxResults: 1, synthesize: false };
    const challengeResponse = await post(origin, SEARCH_PAID_PATH, key, body);
    assert.equal(challengeResponse.status, 402);
    const challenge = await challengeResponse.json();
    const quote = challenge.quote;
    const payment = {
      mode: 'mock',
      paymentId: 'mock:payment-n49-paid-002',
      quoteId: quote.quoteId,
      quoteHash: quote.quoteHash,
      requestHash: quote.requestHash,
      amount: quote.maximumCharge,
    };
    const completed = await post(origin, SEARCH_PAID_PATH, key, body, { 'x-clervo-mock-payment': Buffer.from(JSON.stringify(payment)).toString('base64') });
    assert.equal(completed.status, 200);
    const result = await completed.json();
    assert.equal(result.fundingMode, 'paid');
    assert.equal(result.receipt.fundingMode, 'paid');
    assert.equal(result.receipt.settlement.status, 'settled');
    assert.equal(result.receipt.requestHash, result.requestHash);
    assert.equal(executor.calls, 1);
  });
});

test('executor output is rejected when operation binding or citation integrity is forged', async () => {
  const executor = { execute(input) { return { searchResponse: { ...recordedExecutor().execute(input).searchResponse, operationId: 'op_01JZ8Q5Y4QFD48Q24H6M5F4K8Q' } }; } };
  await withServer({ executor, now: () => now }, async (origin) => {
    const response = await post(origin, SEARCH_FREE_PATH, 'idem_n49_forged01', { query: 'forged output' });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, 'search_execution_binding_invalid');
  });
});
