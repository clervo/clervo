import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { RpcMethodPolicy } from '../../dist/services/rpc/src/policy.js';

const registry = JSON.parse(await readFile(new URL('../../infra/rpc/chain-registry.v1.json', import.meta.url), 'utf8'));
const policy = new RpcMethodPolicy(registry.chains);

test('RPC registry starts with a bounded read-only multi-chain matrix', () => {
  assert.equal(registry.lifecycle, 'unavailable'); assert.equal(registry.chains.length, 8); assert.ok(registry.chains.every(({ archiveQualified, broadcastQualified }) => !archiveQualified && !broadcastQualified));
  const call = policy.authorize({ productId: 'rpc.call', chainId: 'eip155:1', calls: { method: 'eth_getBalance', params: ['0x0000000000000000000000000000000000000000', 'latest'] } });
  assert.equal(call.sideEffecting, false); assert.equal(call.cachePolicy, 'short'); assert.match(call.requestHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(policy.authorize({ productId: 'rpc.call', chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', calls: { method: 'getGenesisHash', params: [] } }).cachePolicy, 'finalized_immutable');
});

test('RPC policy denies unsafe namespaces, unqualified archive/broadcast, oversized batches, and arbitrary chains', () => {
  for (const method of ['eth_sendTransaction', 'personal_unlockAccount', 'debug_traceTransaction', 'trace_call', 'admin_peers', 'txpool_content']) assert.throws(() => policy.authorize({ productId: 'rpc.call', chainId: 'eip155:1', calls: { method, params: [] } }), /method_denied/u);
  assert.throws(() => policy.authorize({ productId: 'rpc.archive', chainId: 'eip155:1', calls: { method: 'eth_getBalance', params: [] } }), /archive_unavailable/u);
  assert.throws(() => policy.authorize({ productId: 'rpc.broadcast', chainId: 'eip155:1', calls: { method: 'eth_sendRawTransaction', params: ['0x01'] }, idempotencyKey: 'idem_0123456789ABCDEFGHIJ' }), /broadcast_unavailable/u);
  assert.throws(() => policy.authorize({ productId: 'rpc.batch', chainId: 'eip155:1', calls: Array.from({ length: 21 }, () => ({ method: 'eth_chainId', params: [] })) }), /batch_invalid/u);
  assert.throws(() => policy.authorize({ productId: 'rpc.call', chainId: 'eip155:999999', calls: { method: 'eth_chainId', params: [] } }), /chain_unavailable/u);
});

test('broadcast requires qualification and idempotency and binds the raw transaction into the request hash', () => {
  const enabled = new RpcMethodPolicy([{ ...registry.chains[0], broadcastQualified: true }]);
  assert.throws(() => enabled.authorize({ productId: 'rpc.broadcast', chainId: 'eip155:1', calls: { method: 'eth_sendRawTransaction', params: ['0x01'] } }), /idempotency_required/u);
  const decision = enabled.authorize({ productId: 'rpc.broadcast', chainId: 'eip155:1', calls: { method: 'eth_sendRawTransaction', params: ['0x01'] }, idempotencyKey: 'idem_0123456789ABCDEFGHIJ' });
  assert.equal(decision.sideEffecting, true); assert.equal(decision.cachePolicy, 'never'); assert.equal(JSON.stringify(decision).includes('0x01'), true);
});
