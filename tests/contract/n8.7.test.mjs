import assert from 'node:assert/strict';
import test from 'node:test';

import { assertRpcOperationRequest, createRpcOperationResult, verifyRpcOperationResult } from '../../dist/packages/contracts/src/rpc.js';

const request = {
  contractVersion: '2026-07-29.1',
  schemaVersion: 'rpc-operation-request.v1',
  operationId: 'op_0123456789ABCDEFGHIJ',
  productId: 'rpc.call',
  input: { kind: 'call', chainId: 'eip155:1', call: { method: 'eth_getBalance', params: ['0x0000000000000000000000000000000000000000', 'latest'] }, quorum: 2 },
  maximumCharge: { asset: 'USD', amountAtomic: '10', decimals: 6 },
  deadlineAt: '2026-08-02T13:00:00.000Z',
};

test('RPC operation contract binds product, chain, bounded calls, charge, and broadcast idempotency', () => {
  assert.doesNotThrow(() => assertRpcOperationRequest(request));
  assert.throws(() => assertRpcOperationRequest({ ...request, productId: 'rpc.health' }), /product_mismatch/u);
  assert.throws(() => assertRpcOperationRequest({ ...request, input: { ...request.input, chainId: 'eip155:0' } }), /chain_invalid/u);
  assert.throws(() => assertRpcOperationRequest({ ...request, input: { kind: 'batch', chainId: 'eip155:1', calls: [] }, productId: 'rpc.batch' }), /batch_invalid/u);
  assert.throws(() => assertRpcOperationRequest({ ...request, productId: 'rpc.broadcast', input: { kind: 'broadcast', chainId: 'eip155:1', call: { method: 'eth_sendRawTransaction', params: ['0x01'] }, idempotencyKey: 'short' } }), /broadcast_invalid/u);
  assert.throws(() => assertRpcOperationRequest({ ...request, productId: 'rpc.health', input: { kind: 'health', chainId: 'eip155:1' } }), /health_charge_invalid/u);
});

test('RPC result hides internal routes and is hash-bound to request identity and charge ceiling', () => {
  const output = {
    kind: 'rpc',
    chainId: 'eip155:1',
    outcomes: [{ id: 1, ok: true, result: '0x2a' }],
    cache: 'miss',
    quorum: 2,
    observedAt: '2026-08-02T11:59:59.000Z',
    requestHash: `sha256:${'a'.repeat(64)}`,
  };
  const result = createRpcOperationResult({ request, completedAt: '2026-08-02T12:00:00.000Z', meteredCharge: { asset: 'USD', amountAtomic: '1', decimals: 6 }, output });
  assert.equal(verifyRpcOperationResult(result, request), true);
  assert.equal(JSON.stringify(result).match(/routeId|provider|serviceId/gu), null);
  assert.equal(verifyRpcOperationResult({ ...result, output: { ...result.output, quorum: 1 } }, request), false);
  assert.throws(() => createRpcOperationResult({ request, completedAt: '2026-08-02T12:00:00.000Z', meteredCharge: { asset: 'USD', amountAtomic: '11', decimals: 6 }, output }), /charge_exceeded/u);
  assert.throws(() => createRpcOperationResult({ request, completedAt: '2026-08-02T12:00:00.000Z', meteredCharge: { asset: 'USD', amountAtomic: '1', decimals: 6 }, output: { ...output, chainId: 'eip155:10' } }), /chain_mismatch/u);
});
