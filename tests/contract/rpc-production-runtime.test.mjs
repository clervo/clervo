import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTRACT_VERSION, RPC_OPERATION_REQUEST_SCHEMA_VERSION, verifyRpcOperationResult } from '../../dist/packages/contracts/src/index.js';
import { createRpcProductionRuntime } from '../../apps/api/src/rpc-production-runtime.mjs';

const baseMs = Date.parse('2026-08-15T12:00:00.000Z');
const solanaChainId = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const chains = new Map([
  ['ethereum', '0x1'], ['optimism', '0xa'], ['bsc', '0x38'], ['polygon', '0x89'],
  ['base', '0x2105'], ['arbitrum', '0xa4b1'], ['avalanche', '0xa86a'],
]);

function evmIdentity(url) {
  const parsed = new URL(url);
  const network = parsed.searchParams.get('network');
  if (network !== null) return chains.get(network);
  const host = parsed.hostname;
  if (host.includes('ethereum') || host.startsWith('eth.')) return '0x1';
  if (host.includes('optimism')) return '0xa';
  if (host.startsWith('bsc.')) return '0x38';
  if (host.includes('polygon')) return '0x89';
  if (host.includes('base-') || host.startsWith('base.')) return '0x2105';
  if (host.includes('arbitrum')) return '0xa4b1';
  if (host.includes('avax') || host.includes('avalanche')) return '0xa86a';
  return undefined;
}

function responseFor(url, body) {
  const calls = Array.isArray(body) ? body : [body];
  const chainId = evmIdentity(url);
  const values = calls.map(({ id, method, params }) => {
    if (method === 'eth_chainId') return { jsonrpc: '2.0', id, result: chainId };
    if (method === 'eth_blockNumber') return { jsonrpc: '2.0', id, result: '0x1000' };
    if (method === 'eth_getBlockByNumber') return { jsonrpc: '2.0', id, result: { number: params[0], hash: `0x${'a'.repeat(64)}` } };
    if (method === 'eth_getBalance') return { jsonrpc: '2.0', id, result: '0x2a' };
    if (method === 'getGenesisHash') return { jsonrpc: '2.0', id, result: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' };
    if (method === 'getSlot') return { jsonrpc: '2.0', id, result: 4096 };
    if (method === 'getBlock') return { jsonrpc: '2.0', id, result: { blockhash: '11111111111111111111111111111111' } };
    return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
  });
  return Response.json(Array.isArray(body) ? values : values[0]);
}

function request(chainId, call, suffix) {
  return {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: RPC_OPERATION_REQUEST_SCHEMA_VERSION,
    operationId: `op_${suffix.repeat(32)}`,
    productId: 'rpc.call',
    input: { kind: 'call', chainId, call },
    maximumCharge: { asset: 'USD', amountAtomic: '0', decimals: 6 },
    deadlineAt: '2026-08-15T12:00:30.000Z',
  };
}

test('production RPC runtime health-checks and executes all eight networks with credentialed primary routes and public failover', async () => {
  const calls = [];
  const runtime = createRpcProductionRuntime({
    drpcApiKey: 'drpc-redacted-credential-value',
    heliusApiKey: 'helius-redacted-credential-value',
    now: () => baseMs,
    async fetcher(url, init) {
      const body = JSON.parse(new TextDecoder().decode(init.body));
      calls.push({ url: new URL(url), headers: new Headers(init.headers), body });
      return responseFor(url, body);
    },
  });

  assert.equal(await runtime.ready(), true);
  const health = await runtime.health();
  assert.equal(health.length, 8);
  assert.equal(health.every(({ status, healthyRoutes }) => status === 'healthy' && healthyRoutes === 3), true);

  const inputs = [
    ['eip155:1', { method: 'eth_getBalance', params: [`0x${'1'.repeat(40)}`, 'latest'] }, 'a'],
    ['eip155:10', { method: 'eth_chainId', params: [] }, 'b'],
    ['eip155:56', { method: 'eth_chainId', params: [] }, 'c'],
    ['eip155:137', { method: 'eth_chainId', params: [] }, 'd'],
    ['eip155:8453', { method: 'eth_chainId', params: [] }, 'e'],
    ['eip155:42161', { method: 'eth_chainId', params: [] }, 'f'],
    ['eip155:43114', { method: 'eth_chainId', params: [] }, '1'],
    [solanaChainId, { method: 'getGenesisHash', params: [] }, '2'],
  ];
  for (const [chainId, call, suffix] of inputs) {
    const operation = request(chainId, call, suffix);
    const completed = await runtime.execute(operation);
    assert.equal(verifyRpcOperationResult(completed.result, operation), true);
    assert.equal(completed.result.output.chainId, chainId);
  }
  assert.equal((await runtime.execute(request('eip155:1', { method: 'eth_getBalance', params: [`0x${'1'.repeat(40)}`, 'latest'] }, '3'))).result.output.outcomes[0].result, '0x2a');
  await assert.rejects(() => runtime.execute(request('eip155:1', { method: 'eth_sendRawTransaction', params: ['0x12'] }, '4')), /rpc_method_denied/u);
  assert.equal(calls.some(({ url, headers }) => url.hostname === 'lb.drpc.org' && headers.get('drpc-key') === 'drpc-redacted-credential-value'), true);
  assert.equal(calls.some(({ url }) => url.hostname === 'mainnet.helius-rpc.com' && url.searchParams.has('api-key')), true);
});

test('production RPC runtime rejects missing credentials and enforces the upstream call ceiling', async () => {
  assert.throws(() => createRpcProductionRuntime({ drpcApiKey: 'short', heliusApiKey: 'helius-redacted-credential-value' }), /rpc_drpc_credential_invalid/u);
  const runtime = createRpcProductionRuntime({
    drpcApiKey: 'drpc-redacted-credential-value', heliusApiKey: 'helius-redacted-credential-value',
    now: () => baseMs, dailyCallCeiling: 1,
    async fetcher(url, init) { return responseFor(url, JSON.parse(new TextDecoder().decode(init.body))); },
  });
  assert.equal(await runtime.ready(), false);
});
