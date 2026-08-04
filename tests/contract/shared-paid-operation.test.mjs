import assert from 'node:assert/strict';
import test from 'node:test';

import { createX402PaidOperationProcessor } from '../../apps/api/src/x402-paid-operation.mjs';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';

const now = '2026-08-04T03:00:00.000Z';
const operationId = `op_${'d'.repeat(32)}`;
const requestHash = `sha256:${'e'.repeat(64)}`;
const fingerprint = `sha256:${'f'.repeat(64)}`;
const pricing = Object.freeze({
  priceVersion: 'ai-chat-public-1',
  maximumCharge: Object.freeze({ asset: 'USDC', amountAtomic: '5000', decimals: 6 }),
  supplierCost: Object.freeze({ asset: 'usd', amountAtomic: '1000', decimals: 6 }),
});

function service() {
  const calls = { challenge: 0, authorize: 0, settle: 0 };
  return {
    calls,
    mode: 'settlement_enabled',
    async challenge({ quote }) {
      calls.challenge += 1;
      return { status: 402, headers: { 'PAYMENT-REQUIRED': 'ai-terms' }, body: { x402Version: 2, accepts: [{ amount: quote.maximumCharge.amountAtomic }] } };
    },
    async authorize() { calls.authorize += 1; return { fingerprint }; },
    async settle() {
      calls.settle += 1;
      return { kind: 'settled', headers: { 'PAYMENT-RESPONSE': 'ai-settlement' }, settlement: { success: true, network: 'eip155:8453', transaction: `0x${'a'.repeat(64)}` } };
    },
  };
}

test('shared paid operation kernel is product-neutral, durable-shaped, and replay-safe', async () => {
  const upstream = service();
  let executions = 0;
  const processor = createX402PaidOperationProcessor({
    service: upstream,
    stateStore: new InMemoryX402OperationStore({ environmentNamespace: 'shared_paid' }),
  });
  const input = {
    idempotencyKey: 'idem_shared_ai_chat_001',
    requestHash,
    operationId,
    productId: 'ai.chat',
    executionInput: { prompt: 'bounded test' },
    now,
    pricing,
    async execute(value) {
      executions += 1;
      return {
        output: { kind: 'chat', content: `result:${value.prompt}` },
        provenance: [{
          adapterId: 'adapter_ai.qualified_test',
          qualificationId: `qual_${'b'.repeat(32)}`,
          providerReferenceHash: requestHash,
        }],
      };
    },
    createResponse({ output, receipt }) {
      return { operationId, productId: 'ai.chat', state: 'RECEIPTED', replayed: false, output, receipt };
    },
  };

  const challenge = await processor.process(input);
  assert.equal(challenge.status, 402);
  assert.equal(challenge.body.quote.productId, 'ai.chat');
  assert.equal(challenge.body.quote.maximumCharge.amountAtomic, '5000');
  assert.deepEqual({ ...upstream.calls, executions }, { challenge: 1, authorize: 0, settle: 0, executions: 0 });

  const paid = await processor.process({ ...input, paymentHeader: 'opaque-payment' });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.output.content, 'result:bounded test');
  assert.equal(paid.body.receipt.productId, 'ai.chat');
  assert.equal(paid.body.receipt.customerCharge.amountAtomic, '5000');
  assert.equal(paid.body.receipt.settlement.status, 'settled');
  assert.deepEqual({ ...upstream.calls, executions }, { challenge: 1, authorize: 1, settle: 1, executions: 1 });

  const replay = await processor.process(input);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.receipt.receiptId, paid.body.receipt.receiptId);
  assert.deepEqual({ ...upstream.calls, executions }, { challenge: 1, authorize: 1, settle: 1, executions: 1 });
});

test('shared paid operation kernel rejects unbounded or asset-confused pricing before challenge', async () => {
  const upstream = service();
  const processor = createX402PaidOperationProcessor({
    service: upstream,
    stateStore: new InMemoryX402OperationStore({ environmentNamespace: 'shared_price' }),
  });
  const base = {
    idempotencyKey: 'idem_shared_price_001', requestHash, operationId, productId: 'ai.chat', executionInput: {}, now,
    execute: async () => ({ output: {}, provenance: [] }), createResponse: () => ({}),
  };
  await assert.rejects(processor.process({ ...base, pricing: { ...pricing, maximumCharge: { ...pricing.maximumCharge, asset: 'usd' } } }), /invalid_x402_operation_maximum_charge/u);
  await assert.rejects(processor.process({ ...base, pricing: { ...pricing, supplierCost: { ...pricing.supplierCost, amountAtomic: 'unknown' } } }), /invalid_x402_operation_supplier_cost/u);
  assert.equal(upstream.calls.challenge, 0);
});

test('capacity rejection does not poison the durable operation lease', async () => {
  const upstream = service();
  const stateStore = new InMemoryX402OperationStore({ environmentNamespace: 'shared_capacity' });
  let available = false;
  let executions = 0;
  const processor = createX402PaidOperationProcessor({
    service: upstream,
    stateStore,
    acquireExecution() {
      return available ? () => {} : undefined;
    },
  });
  const input = {
    idempotencyKey: 'idem_shared_capacity_001', requestHash, operationId, productId: 'ai.chat', executionInput: {}, now, pricing,
    paymentHeader: 'opaque-payment',
    async execute() {
      executions += 1;
      return { output: { content: 'recovered' }, provenance: [{ adapterId: 'adapter_ai.qualified_test', qualificationId: `qual_${'b'.repeat(32)}`, providerReferenceHash: requestHash }] };
    },
    createResponse({ output, receipt }) { return { operationId, productId: 'ai.chat', state: 'RECEIPTED', replayed: false, output, receipt }; },
  };

  await assert.rejects(processor.process(input), (error) => error?.message === 'operation_overloaded' && error?.status === 503);
  assert.equal((await stateStore.lookup(input)).kind, 'challenged');
  available = true;
  const recovered = await processor.process(input);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.output.content, 'recovered');
  assert.equal(executions, 1);
  assert.equal(upstream.calls.settle, 1);
});
