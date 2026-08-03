import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';

const base = {
  idempotencyKey: 'idem_stage15_durable_001',
  requestHash: `sha256:${'a'.repeat(64)}`,
  operationId: `op_${'b'.repeat(32)}`,
  quote: { quoteId: 'quote_safe', maximumCharge: { asset: 'USDC', amountAtomic: '6000', decimals: 6 } },
  challenge: { x402Version: 2, accepts: [{ amount: '6000' }] },
  now: '2026-08-03T12:00:00.000Z',
};
const fingerprint = `sha256:${'c'.repeat(64)}`;

test('durable x402 state allows one execution and one settlement then replays', async () => {
  const store = new InMemoryX402OperationStore({ environmentNamespace: 'stage15' });
  assert.equal((await store.lookup(base)).kind, 'missing');
  assert.equal((await store.challenge(base)).kind, 'challenged');
  const execution = await store.claimExecution({ ...base, paymentFingerprint: fingerprint });
  assert.equal(execution.kind, 'claimed');
  assert.equal((await store.claimExecution({ ...base, paymentFingerprint: fingerprint })).kind, 'executing');
  await store.recordExecution({ idempotencyKey: base.idempotencyKey, leaseId: execution.leaseId, execution: { outputHash: `sha256:${'d'.repeat(64)}` }, now: base.now });
  const settlement = await store.claimSettlement({ ...base, paymentFingerprint: fingerprint });
  assert.equal(settlement.kind, 'claimed');
  await store.complete({ idempotencyKey: base.idempotencyKey, leaseId: settlement.leaseId, settlement: { referenceHash: `sha256:${'e'.repeat(64)}` }, response: { operationId: base.operationId }, now: base.now });
  const replay = await store.lookup(base);
  assert.equal(replay.kind, 'replay');
  assert.equal(replay.response.operationId, base.operationId);
});

test('unknown settlement stays quarantined and one payment fingerprint cannot bind to two operations', async () => {
  const store = new InMemoryX402OperationStore({ environmentNamespace: 'stage15' });
  await store.challenge(base);
  const execution = await store.claimExecution({ ...base, paymentFingerprint: fingerprint });
  await store.recordExecution({ idempotencyKey: base.idempotencyKey, leaseId: execution.leaseId, execution: { outputHash: `sha256:${'d'.repeat(64)}` }, now: base.now });
  const settlement = await store.claimSettlement({ ...base, paymentFingerprint: fingerprint });
  await store.markSettlementUnknown({ idempotencyKey: base.idempotencyKey, leaseId: settlement.leaseId, settlement: { kind: 'unknown' }, now: base.now });
  assert.equal((await store.lookup(base)).kind, 'unknown');

  const second = { ...base, idempotencyKey: 'idem_stage15_durable_002', operationId: `op_${'f'.repeat(32)}` };
  await store.challenge(second);
  assert.equal((await store.claimExecution({ ...second, paymentFingerprint: fingerprint })).kind, 'payment_conflict');
});

test('an expired execution lease becomes unknown instead of executing again', async () => {
  const store = new InMemoryX402OperationStore({ environmentNamespace: 'stage15' });
  await store.challenge(base);
  await store.claimExecution({ ...base, paymentFingerprint: fingerprint });
  const afterLease = { ...base, now: '2026-08-03T12:00:31.000Z' };
  const unknown = await store.lookup(afterLease);
  assert.equal(unknown.kind, 'unknown');
  assert.equal(unknown.state, 'execution_unknown');
  assert.equal((await store.claimExecution({ ...afterLease, paymentFingerprint: fingerprint })).kind, 'unknown');
});

test('PostgreSQL x402 migration stores no payment payload or signature and fails closed on process loss', async () => {
  const migration = await readFile('infra/storage/postgres/0005-x402-operation-state.sql', 'utf8');
  const source = await readFile('apps/api/src/x402-operation-store.mjs', 'utf8');
  assert.match(migration, /settlement_unknown/u);
  assert.match(migration, /execution_unknown/u);
  assert.match(migration, /UNIQUE \(environment_namespace, payment_fingerprint\)/u);
  assert.doesNotMatch(migration, /payment_(?:payload|signature)/u);
  assert.doesNotMatch(source, /paymentPayload|PAYMENT-SIGNATURE/u);
});
