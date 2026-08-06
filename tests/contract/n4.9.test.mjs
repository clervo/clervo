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

// A first-time caller sends no idempotency-key. This is the naive request the
// free sample must accept.
async function postWithoutKey(origin, path, body, headers = {}) {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
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

test('free route accepts a naive request with no idempotency-key, reports the generated key, and keeps unkeyed requests distinct', async () => {
  const executor = recordedExecutor();
  await withServer({ executor, now: () => now, freeQuota: new InMemoryFreeSearchQuota(3, 60_000) }, async (origin) => {
    const naive = await postWithoutKey(origin, SEARCH_FREE_PATH, { query: 'naive first call', maxResults: 1, synthesize: false });
    assert.equal(naive.status, 200);
    const generatedKey = naive.headers.get('idempotency-key');
    assert.ok(generatedKey, 'the server must report the key it generated');
    assert.equal(naive.headers.get('idempotency-replayed'), null);
    const result = await naive.json();
    assert.equal(result.fundingMode, 'free');
    assert.equal(result.replayed, false);
    assert.equal(executor.calls, 1);

    // Two unkeyed callers asking the same question are two operations, not one
    // replayed operation. A key derived from the request body would serve the
    // second caller the first caller's result.
    const second = await postWithoutKey(origin, SEARCH_FREE_PATH, { query: 'naive first call', maxResults: 1, synthesize: false });
    assert.equal(second.status, 200);
    assert.notEqual(second.headers.get('idempotency-key'), generatedKey);
    assert.equal((await second.json()).replayed, false);
    assert.equal(executor.calls, 2);

    // The reported key is a real key: replaying it returns the same operation
    // without re-executing.
    const replay = await post(origin, SEARCH_FREE_PATH, generatedKey, { query: 'naive first call', maxResults: 1, synthesize: false });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replayed, true);
    assert.equal(executor.calls, 2);
  });
});

test('a caller-supplied key keeps its exact replay and conflict behaviour, and the paid route still requires one', async () => {
  const executor = recordedExecutor();
  await withServer({ executor, now: () => now, freeQuota: new InMemoryFreeSearchQuota(3, 60_000) }, async (origin) => {
    const first = await post(origin, SEARCH_FREE_PATH, 'idem_n49_supplied_001', { query: 'supplied key', maxResults: 1, synthesize: false });
    assert.equal(first.status, 200);
    // The server reports a generated key only when it generated one.
    assert.equal(first.headers.get('idempotency-key'), null);
    const replay = await post(origin, SEARCH_FREE_PATH, 'idem_n49_supplied_001', { query: 'supplied key', maxResults: 1, synthesize: false });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replayed, true);
    assert.equal(replay.headers.get('idempotency-replayed'), 'true');
    const conflict = await post(origin, SEARCH_FREE_PATH, 'idem_n49_supplied_001', { query: 'different question', maxResults: 1, synthesize: false });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).code, 'idempotency_conflict');
    assert.equal(executor.calls, 1);

    // The paid route never mints a key on the caller's behalf: an unknown
    // settlement state must leave the caller something to retry with. A payment
    // header without a key is refused before any execution.
    const paidNaive = await postWithoutKey(origin, SEARCH_PAID_PATH, { query: 'paid without key', maxResults: 1, synthesize: false }, {
      'payment-signature': 'mock-signature-value',
    });
    assert.equal(paidNaive.status, 400);
    assert.equal(paidNaive.headers.get('idempotency-key'), null);
    assert.equal((await paidNaive.json()).code, 'idempotency_key_required');
    assert.equal(executor.calls, 1);
  });
});

test('the free route reads a JSON body from the content types a naive client sends, and the paid route still requires application/json', async () => {
  const executor = recordedExecutor();
  await withServer({ executor, now: () => now, freeQuota: new InMemoryFreeSearchQuota(5, 60_000) }, async (origin) => {
    const body = JSON.stringify({ query: 'shortest possible command', maxResults: 1, synthesize: false });
    // `curl -d` sends application/x-www-form-urlencoded, and a fetch() with a
    // string body and no headers sends text/plain. Both are what the published
    // one-line example actually produces, so both must reach the free route.
    for (const contentType of ['application/x-www-form-urlencoded', 'text/plain;charset=UTF-8', 'multipart/form-data', 'application/json']) {
      const response = await fetch(`${origin}${SEARCH_FREE_PATH}`, { method: 'POST', headers: { 'content-type': contentType }, body });
      assert.equal(response.status, 200, `free route must accept a JSON body declared as ${contentType}`);
      assert.equal((await response.json()).fundingMode, 'free');
    }
    // An absent content-type is accepted for the same reason.
    const undeclared = await fetch(`${origin}${SEARCH_FREE_PATH}`, { method: 'POST', headers: { 'content-type': '' }, body });
    assert.equal(undeclared.status, 200);

    // The body itself is still required to be JSON. Nothing is ever parsed as a
    // form, so a real form submission is refused rather than reinterpreted.
    const form = await fetch(`${origin}${SEARCH_FREE_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'query=form+encoded',
    });
    assert.equal(form.status, 400);

    // A payable request must be explicit about what it is sending: the
    // relaxation is scoped to the unauthenticated free sample.
    const paid = await fetch(`${origin}${SEARCH_PAID_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': 'idem_n49_media_paid1' },
      body,
    });
    assert.equal(paid.status, 415);
    assert.equal(executor.calls, 5);
  });
});

test('the free-tier quota still refuses a naive caller rather than executing past the cap', async () => {
  const executor = recordedExecutor();
  await withServer({ executor, now: () => now, freeQuota: new InMemoryFreeSearchQuota(1, 60_000) }, async (origin) => {
    assert.equal((await postWithoutKey(origin, SEARCH_FREE_PATH, { query: 'first naive', maxResults: 1, synthesize: false })).status, 200);
    const limited = await postWithoutKey(origin, SEARCH_FREE_PATH, { query: 'second naive', maxResults: 1, synthesize: false });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, 'free_quota_exceeded');
    // Refused at the cap, never silently executed and billed to us.
    assert.equal(executor.calls, 1);
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

test('an edge-bound release rejects direct product calls before quota or execution', async () => {
  const executor = recordedExecutor();
  const edgeAuthorization = 'edge-authorization-value-at-least-32-characters';
  await withServer({ executor, now: () => now, edgeAuthorization }, async (origin) => {
    const refused = await post(origin, SEARCH_FREE_PATH, 'idem_n49_edge_refused', { query: 'live raw', synthesize: false });
    assert.equal(refused.status, 401);
    assert.equal((await refused.json()).code, 'edge_unauthorized');
    assert.equal(executor.calls, 0);
    const accepted = await post(origin, SEARCH_FREE_PATH, 'idem_n49_edge_accepted', { query: 'live raw', synthesize: false }, {
      'x-clervo-edge-authorization': `Bearer ${edgeAuthorization}`,
      'x-clervo-quota-subject': `sha256:${'a'.repeat(64)}`,
    });
    assert.equal(accepted.status, 200);
    assert.equal(executor.calls, 1);
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
