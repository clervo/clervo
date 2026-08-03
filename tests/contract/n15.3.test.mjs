import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchResponse, searchHttpRequestHash } from '../../dist/packages/contracts/src/index.js';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';
import { createX402PaidSearchProcessor } from '../../apps/api/src/x402-paid-search.mjs';

const now = '2026-08-03T12:00:00.000Z';
const normalized = Object.freeze({ query: 'durable payment proof', maxResults: 1, synthesize: false, language: 'en', region: 'US' });
const requestHash = searchHttpRequestHash(normalized, '/v1/search/paid');
const operationId = `op_${'a'.repeat(32)}`;
const fingerprint = `sha256:${'b'.repeat(64)}`;

function executor() {
  let calls = 0;
  return {
    get calls() { return calls; },
    execute(input) {
      calls += 1;
      const evidenceText = 'The bounded payment proof returns a useful cited result.';
      return { searchResponse: createSearchResponse({
        operationId: input.operationId,
        query: input.query,
        now,
        maxResults: 1,
        evidence: [{ resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P', sourceId: 'adapter_search.recorded_release_candidate', url: 'https://example.com/payment-proof', title: 'Payment proof', snippet: evidenceText, evidenceText, retrievedAt: now, authorityScore: 90, relevanceScore: 95 }],
        citations: [{ citationId: 'cite_01JZ8Q5Y4QFD48Q24H6M5F4K9P', resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P', canonicalUrl: 'https://example.com/payment-proof', quote: evidenceText, startOffset: 0, endOffset: evidenceText.length }],
      }) };
    },
  };
}

function service({ unknown = false } = {}) {
  const calls = { challenge: 0, authorize: 0, settle: 0 };
  return {
    calls,
    mode: 'settlement_enabled',
    async challenge({ quote }) {
      calls.challenge += 1;
      return { status: 402, headers: { 'PAYMENT-REQUIRED': 'public-terms' }, body: { x402Version: 2, accepts: [{ amount: quote.maximumCharge.amountAtomic }] } };
    },
    async authorize() { calls.authorize += 1; return { fingerprint }; },
    async settle() {
      calls.settle += 1;
      return unknown ? { kind: 'unknown', reason: 'timeout' } : { kind: 'settled', headers: { 'PAYMENT-RESPONSE': 'public-settlement' }, settlement: { success: true, network: 'eip155:8453', transaction: `0x${'c'.repeat(64)}` } };
    },
  };
}

function input(overrides = {}) {
  return { idempotencyKey: 'idem_stage15_paid_001', requestHash, operationId, productId: 'search.web', normalized, now, ...overrides };
}

test('real paid processor challenges without execution, settles once, and replays without another charge', async () => {
  const upstream = service();
  const search = executor();
  const processor = createX402PaidSearchProcessor({ service: upstream, stateStore: new InMemoryX402OperationStore({ environmentNamespace: 'stage15' }), executor: search });
  const challenge = await processor.process(input());
  assert.equal(challenge.status, 402);
  assert.equal(challenge.body.quote.maximumCharge.amountAtomic, '6000');
  assert.deepEqual({ ...upstream.calls, execute: search.calls }, { challenge: 1, authorize: 0, settle: 0, execute: 0 });

  const paid = await processor.process(input({ paymentHeader: 'opaque-not-inspected-by-processor' }));
  assert.equal(paid.status, 200);
  assert.equal(paid.body.receipt.customerCharge.amountAtomic, '6000');
  assert.equal(paid.body.receipt.settlement.status, 'settled');
  assert.deepEqual({ ...upstream.calls, execute: search.calls }, { challenge: 1, authorize: 1, settle: 1, execute: 1 });

  const replay = await processor.process(input());
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.headers['idempotency-replayed'], 'true');
  assert.deepEqual({ ...upstream.calls, execute: search.calls }, { challenge: 1, authorize: 1, settle: 1, execute: 1 });
});

test('unknown settlement is quarantined and never verified or settled again automatically', async () => {
  const upstream = service({ unknown: true });
  const search = executor();
  const processor = createX402PaidSearchProcessor({ service: upstream, stateStore: new InMemoryX402OperationStore({ environmentNamespace: 'stage15' }), executor: search });
  await processor.process(input());
  await assert.rejects(processor.process(input({ paymentHeader: 'opaque' })), /settlement_unknown/u);
  await assert.rejects(processor.process(input({ paymentHeader: 'opaque' })), /settlement_unknown/u);
  assert.deepEqual({ ...upstream.calls, execute: search.calls }, { challenge: 1, authorize: 1, settle: 1, execute: 1 });
});

test('execution failure becomes unknown and cannot consume the same authorization again', async () => {
  const upstream = service();
  let calls = 0;
  const broken = { async execute() { calls += 1; throw new Error('provider_failed_after_authorization'); } };
  const processor = createX402PaidSearchProcessor({ service: upstream, stateStore: new InMemoryX402OperationStore({ environmentNamespace: 'stage15' }), executor: broken });
  await processor.process(input());
  await assert.rejects(processor.process(input({ paymentHeader: 'opaque' })), /provider_failed_after_authorization/u);
  await assert.rejects(processor.process(input({ paymentHeader: 'opaque' })), /execution_unknown/u);
  assert.deepEqual({ ...upstream.calls, execute: calls }, { challenge: 1, authorize: 1, settle: 0, execute: 1 });
});
