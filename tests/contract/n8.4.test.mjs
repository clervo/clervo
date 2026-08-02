import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryRpcCacheStore, RpcGateway } from '../../dist/services/rpc/src/gateway.js';
import { RpcHealthRouter } from '../../dist/services/rpc/src/health.js';
import { RpcMethodPolicy } from '../../dist/services/rpc/src/policy.js';

const chain = { chainId: 'eip155:1', protocol: 'evm', enabled: true, finalityDepth: 10, maximumReorgDepth: 5, staleAfterMs: 1000, maximumBatchSize: 20, maximumResponseBytes: 1048576, archiveQualified: false, broadcastQualified: false };
const blockHash = `0x${'a'.repeat(64)}`;

function route(routeId, balance = '0x2a') {
  const calls = [];
  return {
    routeId,
    chainId: chain.chainId,
    calls,
    async execute(requests) {
      calls.push(requests.map(({ method }) => method));
      return requests.map(({ method }, index) => ({ id: index + 1, ok: true, result: method === 'eth_chainId' ? '0x1' : method === 'eth_blockNumber' ? '0x64' : method === 'eth_getBlockByNumber' ? { number: '0x5a', hash: blockHash } : balance }));
    },
  };
}

async function gateway(routes) {
  const health = new RpcHealthRouter({ chains: [chain], routes, monotonic: () => 0 });
  await health.refresh(chain.chainId, 1000);
  return new RpcGateway({ policy: new RpcMethodPolicy([chain]), health, routes, cache: new InMemoryRpcCacheStore() });
}

test('RPC gateway executes only through semantically healthy routes and discloses cache state', async () => {
  const primary = route('rpc.route.primary');
  const value = await gateway([primary]);
  const request = { productId: 'rpc.call', chainId: chain.chainId, calls: { method: 'eth_getBalance', params: ['0x0000000000000000000000000000000000000000', 'latest'] }, nowMs: 1000 };
  const first = await value.execute(request);
  assert.equal(first.cache, 'miss');
  assert.deepEqual(first.routeIds, ['rpc.route.primary']);
  const callsAfterFirst = primary.calls.length;
  const replay = await value.execute({ ...request, nowMs: 1100 });
  assert.equal(replay.cache, 'hit');
  assert.deepEqual(replay.routeIds, []);
  assert.equal(primary.calls.length, callsAfterFirst);
  const expired = await value.execute({ ...request, nowMs: 1600 });
  assert.equal(expired.cache, 'miss');
});

test('RPC gateway optional quorum requires equivalent normalized responses', async () => {
  const first = route('rpc.route.first');
  const second = route('rpc.route.second');
  const agreed = await gateway([first, second]);
  const request = { productId: 'rpc.call', chainId: chain.chainId, calls: { method: 'eth_getBalance', params: ['0x0000000000000000000000000000000000000000', 'latest'] }, quorum: 2, nowMs: 1000 };
  assert.equal((await agreed.execute(request)).quorum, 2);
  const disagreement = await gateway([route('rpc.route.first'), route('rpc.route.second', '0x2b')]);
  await assert.rejects(disagreement.execute(request), /quorum_disagreement/u);
});

test('RPC gateway never routes broadcasts through read failover or cache', async () => {
  const broadcastChain = { ...chain, broadcastQualified: true };
  const provider = route('rpc.route.primary');
  const health = new RpcHealthRouter({ chains: [broadcastChain], routes: [provider] });
  await health.refresh(chain.chainId, 1000);
  const value = new RpcGateway({ policy: new RpcMethodPolicy([broadcastChain]), health, routes: [provider], cache: new InMemoryRpcCacheStore() });
  await assert.rejects(value.execute({ productId: 'rpc.broadcast', chainId: chain.chainId, calls: { method: 'eth_sendRawTransaction', params: ['0x01'] }, idempotencyKey: 'idem_0123456789ABCDEFGHIJ', nowMs: 1000 }), /requires_coordinator/u);
});
