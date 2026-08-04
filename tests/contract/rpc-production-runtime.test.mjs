import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTRACT_VERSION, RPC_OPERATION_REQUEST_SCHEMA_VERSION, verifyRpcOperationResult } from '../../dist/packages/contracts/src/index.js';
import { createRpcProductionRuntime } from '../../apps/api/src/rpc-production-runtime.mjs';

const baseMs = Date.parse('2026-08-04T12:00:00.000Z');

function responseFor(body) {
  const calls = Array.isArray(body) ? body : [body];
  const values = calls.map(({ id, method, params }) => {
    if (method === 'eth_chainId') return { jsonrpc: '2.0', id, result: '0x1' };
    if (method === 'eth_blockNumber') return { jsonrpc: '2.0', id, result: '0x64' };
    if (method === 'eth_getBlockByNumber') return { jsonrpc: '2.0', id, result: { number: params[0], hash: `0x${'a'.repeat(64)}` } };
    if (method === 'eth_getBalance') return { jsonrpc: '2.0', id, result: '0x2a' };
    return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
  });
  return Response.json(Array.isArray(body) ? values : values[0]);
}

test('production RPC runtime pins the official endpoint family, semantic health, safe methods, and exact result contract', async () => {
  const calls = [];
  const runtime = createRpcProductionRuntime({
    ethereumEndpoint: 'https://blockchain.googleapis.com/v1/projects/example/ethereum?key=redacted',
    now: () => baseMs,
    async fetcher(_url, init) {
      const body = JSON.parse(new TextDecoder().decode(init.body));
      calls.push(body);
      return responseFor(body);
    },
  });
  const request = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: RPC_OPERATION_REQUEST_SCHEMA_VERSION,
    operationId: `op_${'a'.repeat(32)}`,
    productId: 'rpc.call',
    input: { kind: 'call', chainId: 'eip155:1', call: { method: 'eth_getBalance', params: [`0x${'1'.repeat(40)}`, 'latest'] } },
    maximumCharge: { asset: 'USD', amountAtomic: '1', decimals: 6 },
    deadlineAt: '2026-08-04T12:00:30.000Z',
  };
  const completed = await runtime.execute(request);
  assert.equal(completed.result.output.outcomes[0].result, '0x2a');
  assert.equal(completed.result.meteredCharge.amountAtomic, '0');
  assert.equal(verifyRpcOperationResult(completed.result, request), true);
  assert.equal(calls.length, 3);
  await assert.rejects(() => runtime.execute({ ...request, productId: 'rpc.call', input: { kind: 'call', chainId: 'eip155:1', call: { method: 'eth_sendRawTransaction', params: ['0x12'] } } }), /rpc_method_denied/u);
});

test('production RPC runtime rejects arbitrary or insecure endpoint hosts', () => {
  assert.throws(() => createRpcProductionRuntime({ ethereumEndpoint: 'http://blockchain.googleapis.com/rpc' }), /rpc_production_endpoint_invalid/u);
  assert.throws(() => createRpcProductionRuntime({ ethereumEndpoint: 'https://attacker.invalid/rpc' }), /rpc_production_endpoint_invalid/u);
});
