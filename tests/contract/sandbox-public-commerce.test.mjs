import assert from 'node:assert/strict';
import test from 'node:test';

import { hashJson } from '../../dist/packages/contracts/src/index.js';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';
import {
  SANDBOX_PAID_PATH,
  SANDBOX_RUN_PRICING,
  createX402PaidSandboxProcessor,
  normalizeSandboxHttpRequest,
  sandboxHttpRequestHash,
} from '../../apps/api/src/x402-paid-sandbox.mjs';

const now = '2026-08-04T12:00:00.000Z';
const operationId = `op_${'1'.repeat(32)}`;
const runnerDigest = `sha256:${'2'.repeat(64)}`;
const payer = `0x${'3'.repeat(40)}`;
const fingerprint = `sha256:${'4'.repeat(64)}`;

test('public Sandbox normalizes bounded one-shot input and rejects expansion', () => {
  const normalized = normalizeSandboxHttpRequest({ command: ['node', '-e', "process.stdout.write('ready')"], limits: { wallTimeMs: 5_000, memoryBytes: 67_108_864 } });
  assert.equal(normalized.limits.wallTimeMs, 5_000);
  assert.equal(normalized.limits.memoryBytes, 67_108_864);
  assert.equal(normalized.limits.processes, 64);
  assert.match(sandboxHttpRequestHash(normalized), /^sha256:[a-f0-9]{64}$/u);
  assert.throws(() => normalizeSandboxHttpRequest({ command: ['true'], network: true }), /additional_property/u);
  assert.throws(() => normalizeSandboxHttpRequest({ command: ['true'], limits: { memoryBytes: 8_589_934_592 } }), /memoryBytes/u);
});

test('public Sandbox uses the shared paid state machine, payer-derived tenant, and no-charge replay', async () => {
  const calls = { challenge: 0, authorize: 0, settle: 0, execute: 0 };
  const service = {
    mode: 'settlement_enabled',
    async challenge(input) {
      calls.challenge += 1;
      assert.equal(input.resourcePath, SANDBOX_PAID_PATH);
      assert.equal(input.discovery.input.command[0], 'node');
      return { status: 402, headers: { 'PAYMENT-REQUIRED': 'sandbox-challenge' }, body: { accepts: [{}] } };
    },
    async authorize() { calls.authorize += 1; return { fingerprint, verification: { payer } }; },
    async settle() { calls.settle += 1; return { kind: 'settled', headers: { 'PAYMENT-RESPONSE': 'settled' }, settlement: { network: 'eip155:8453', transaction: `0x${'5'.repeat(64)}` } }; },
  };
  const gateway = {
    durable: true,
    async run({ tenantId, request }) {
      calls.execute += 1;
      assert.match(tenantId, /^tenant_[a-f0-9]{32}$/u);
      assert.equal(request.input.imageDigest, runnerDigest);
      assert.equal(request.maximumCharge.amountAtomic, SANDBOX_RUN_PRICING.supplierCost.amountAtomic);
      const result = { operationId, productId: 'sandbox.run', output: { kind: 'execution', exitCode: 0, stdoutBase64: 'cmVhZHk=' } };
      return { replayed: false, result: { ...result, resultHash: hashJson(result) } };
    },
  };
  const normalized = normalizeSandboxHttpRequest({ command: ['node', '-e', "process.stdout.write('ready')"], limits: { wallTimeMs: 5_000 } });
  const input = {
    idempotencyKey: 'idem_sandbox_public_001', requestHash: sandboxHttpRequestHash(normalized), operationId, normalized, now,
  };
  const processor = createX402PaidSandboxProcessor({ service, stateStore: new InMemoryX402OperationStore({ environmentNamespace: 'sandbox_public' }), gateway, runnerDigest });
  const challenge = await processor.process(input);
  assert.equal(challenge.status, 402);
  assert.equal(challenge.body.quote.maximumCharge.amountAtomic, '60000');
  const paid = await processor.process({ ...input, paymentHeader: 'opaque-payment' });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.result.output.stdoutBase64, 'cmVhZHk=');
  assert.equal(paid.body.requestHash, input.requestHash);
  assert.equal(paid.body.receipt.customerCharge.amountAtomic, '60000');
  assert.equal(paid.body.receipt.supplierCost.amountAtomic, '45000');
  const replay = await processor.process(input);
  assert.equal(replay.body.replayed, true);
  assert.deepEqual(calls, { challenge: 1, authorize: 1, settle: 1, execute: 1 });
});

test('public Sandbox refuses a gateway without durable execution state', () => {
  assert.throws(() => createX402PaidSandboxProcessor({ service: { mode: 'challenge_only' }, stateStore: {}, gateway: { durable: false, run() {} }, runnerDigest }), /invalid_public_sandbox_gateway/u);
});
