import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryFreeSearchQuota,
  SEARCH_FREE_PATH,
  SEARCH_PAID_PATH,
  verifySearchCitation,
} from '../../dist/packages/contracts/src/index.js';
import { createRecordedSearchExecutor } from '../../dist/services/search/src/recorded-pipeline.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';

const now = '2026-07-30T23:45:00.000Z';

async function withServer(options, run) {
  const server = createSearchServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    assert.equal(typeof address, 'object');
    assert.ok(address);
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

test('recorded N4.1-N4.7 pipeline returns ranked cited synthesis through the free HTTP route', async () => {
  const executor = createRecordedSearchExecutor();
  await withServer({ executor, now: () => now, freeQuota: new InMemoryFreeSearchQuota(3, 60_000) }, async (origin) => {
    const response = await post(origin, SEARCH_FREE_PATH, 'idem_n410_free_pipeline_001', {
      query: 'Clervo recorded pipeline citations',
      maxResults: 3,
      synthesize: true,
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.output.searchResponse.results.length, 3);
    assert.equal(result.output.searchResponse.citations.length, 3);
    assert.equal(result.output.synthesisReport.outcome, 'synthesized');
    assert.match(result.output.synthesisReport.answer, /bounded retrieval and exact citation lineage/u);
    assert.equal(result.output.synthesisReport.answer.includes('transfer funds'), false);
    assert.equal(result.output.searchResponse.citations.every((citation) => verifySearchCitation(citation, result.output.searchResponse.results).valid), true);

    const run = executor.lastRun;
    assert.ok(run);
    assert.equal(run.qualification.twoPathGatePassed, true);
    assert.equal(run.federation.outcome, 'complete');
    assert.deepEqual(run.federation.attempts.map((attempt) => attempt.outcome), ['succeeded', 'succeeded']);
    assert.ok(run.assembly.candidateRecords.some((record) => record.outcome === 'exact_duplicate'));
    assert.equal(run.assembly.provenance.length, result.output.searchResponse.results.length);
    assert.equal(run.assembly.candidateRecords.every((record) => !record.requestedUrl.includes('localhost')), true);
  });
});

test('concurrent and sequential free replays coalesce one asynchronous pipeline execution and one quota use', async () => {
  const executor = createRecordedSearchExecutor();
  await withServer({ executor, now: () => now, freeQuota: new InMemoryFreeSearchQuota(1, 60_000) }, async (origin) => {
    const body = { query: 'recorded replay evidence', maxResults: 2, synthesize: false };
    const [first, concurrent] = await Promise.all([
      post(origin, SEARCH_FREE_PATH, 'idem_n410_replay_001', body),
      post(origin, SEARCH_FREE_PATH, 'idem_n410_replay_001', body),
    ]);
    assert.equal(first.status, 200);
    assert.equal(concurrent.status, 200);
    const firstResult = await first.json();
    const concurrentResult = await concurrent.json();
    assert.deepEqual([firstResult.replayed, concurrentResult.replayed].sort(), [false, true]);
    const replay = await post(origin, SEARCH_FREE_PATH, 'idem_n410_replay_001', body);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replayed, true);
    assert.equal(executor.calls, 1);
  });
});

test('recorded asynchronous pipeline completes through the explicit test-only mock-paid seam', async () => {
  const executor = createRecordedSearchExecutor();
  await withServer({ executor, now: () => now, allowMockPaidExecution: true }, async (origin) => {
    const key = 'idem_n410_paid_pipeline_001';
    const body = { query: 'paid recorded pipeline', maxResults: 2, synthesize: true };
    const challengeResponse = await post(origin, SEARCH_PAID_PATH, key, body);
    assert.equal(challengeResponse.status, 402);
    const challenge = await challengeResponse.json();
    const quote = challenge.quote;
    const payment = {
      mode: 'mock',
      paymentId: 'mock:payment-n410-paid-pipeline-001',
      quoteId: quote.quoteId,
      quoteHash: quote.quoteHash,
      requestHash: quote.requestHash,
      amount: quote.maximumCharge,
    };
    const completed = await post(origin, SEARCH_PAID_PATH, key, body, {
      'x-clervo-mock-payment': Buffer.from(JSON.stringify(payment)).toString('base64'),
    });
    assert.equal(completed.status, 200);
    const result = await completed.json();
    assert.equal(result.fundingMode, 'paid');
    assert.equal(result.receipt.settlement.status, 'settled');
    assert.equal(result.output.synthesisReport.outcome, 'synthesized');
    assert.equal(executor.calls, 1);
  });
});

test('default paid route remains non-payable and does not invoke the recorded pipeline', async () => {
  const executor = createRecordedSearchExecutor();
  await withServer({ executor, now: () => now }, async (origin) => {
    const response = await post(origin, SEARCH_PAID_PATH, 'idem_n410_nonpayable_001', { query: 'must not execute' }, {
      'x-clervo-mock-payment': Buffer.from(JSON.stringify({ mode: 'mock' })).toString('base64'),
    });
    assert.equal(response.status, 402);
    assert.equal((await response.json()).extensions.clervo.executionAllowed, false);
    assert.equal(executor.calls, 0);
  });
});

test('an incomplete recorded federation fails closed through HTTP without exposing adapter details', async () => {
  const executor = createRecordedSearchExecutor({ failPathId: 'retrieval_recorded_fallback' });
  await withServer({ executor, now: () => now }, async (origin) => {
    const response = await post(origin, SEARCH_FREE_PATH, 'idem_n410_failure_001', { query: 'incomplete federation', synthesize: false });
    assert.equal(response.status, 502);
    const failure = await response.json();
    assert.equal(failure.code, 'search_execution_recorded_federation_incomplete');
    assert.equal(JSON.stringify(failure).includes('recorded_path_failure'), false);
    assert.equal(executor.calls, 1);
  });
});