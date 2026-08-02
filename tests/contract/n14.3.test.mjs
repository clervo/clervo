import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryFreeSearchQuota,
  SEARCH_FREE_PATH,
  createSearchResponse,
} from '../../dist/packages/contracts/src/index.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import { InMemorySearchStateStore } from '../../apps/api/src/search-state-store.mjs';

const now = '2026-08-02T08:00:00.000Z';

function resultFor(input) {
  const evidenceText = 'The bounded execution pool preserved useful work.';
  return {
    searchResponse: createSearchResponse({
      operationId: input.operationId,
      query: input.query,
      now,
      maxResults: input.maxResults,
      evidence: [{
        resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
        sourceId: 'adapter_mock.search',
        url: 'https://example.com/overload',
        title: 'Overload evidence',
        snippet: evidenceText,
        evidenceText,
        retrievedAt: now,
        publishedAt: '2026-08-02T07:00:00.000Z',
        authorityScore: 90,
        relevanceScore: 95,
      }],
      citations: [{
        citationId: 'cite_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
        resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
        canonicalUrl: 'https://example.com/overload',
        quote: evidenceText,
        startOffset: 0,
        endOffset: evidenceText.length,
      }],
    }),
  };
}

function post(origin, sequence) {
  return fetch(`${origin}${SEARCH_FREE_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `idem_n143_load_${String(sequence).padStart(4, '0')}`,
    },
    body: JSON.stringify({ query: `bounded load ${sequence}`, maxResults: 1, synthesize: false }),
  });
}

test('bounded execution sheds overload, preserves admitted work, and recovers without duplicate execution', async () => {
  let release;
  let startedResolve;
  const gate = new Promise((resolve) => { release = resolve; });
  const twoStarted = new Promise((resolve) => { startedResolve = resolve; });
  let calls = 0;
  const executor = {
    async execute(input) {
      calls += 1;
      if (calls === 2) startedResolve();
      await gate;
      return resultFor(input);
    },
  };
  const stateStore = new InMemorySearchStateStore({
    environmentNamespace: 'load-test',
    freeQuota: new InMemoryFreeSearchQuota(100, 60_000),
  });
  const server = createSearchServer({
    executor,
    stateStore,
    now: () => now,
    maxConcurrentExecutions: 2,
  });
  assert.equal(server.requestTimeout, 15_000);
  assert.equal(server.headersTimeout, 5_000);
  assert.equal(server.keepAliveTimeout, 5_000);
  assert.equal(server.maxRequestsPerSocket, 100);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const admitted = [post(origin, 1), post(origin, 2)];
    await Promise.race([
      twoStarted,
      new Promise((_, reject) => setTimeout(() => reject(new Error('load_test_start_timeout')), 2_000)),
    ]);
    const overflow = await Promise.all(Array.from({ length: 8 }, (_, index) => post(origin, index + 3)));
    assert.deepEqual(overflow.map(({ status }) => status), Array(8).fill(503));
    for (const response of overflow) {
      assert.equal(response.headers.get('retry-after'), '1');
      assert.equal((await response.json()).code, 'search_overloaded');
    }
    assert.equal(calls, 2);
    release();
    const completed = await Promise.all(admitted);
    assert.deepEqual(completed.map(({ status }) => status), [200, 200]);

    const replay = await post(origin, 1);
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get('idempotency-replayed'), 'true');
    assert.equal(calls, 2);
  } finally {
    release();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('invalid execution ceilings fail before a listener is created', () => {
  const executor = { execute() { throw new Error('must_not_execute'); } };
  assert.throws(() => createSearchServer({ executor, maxConcurrentExecutions: 0 }), /invalid max concurrent executions/u);
  assert.throws(() => createSearchServer({ executor, maxConcurrentExecutions: 257 }), /invalid max concurrent executions/u);
});
