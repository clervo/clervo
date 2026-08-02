import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryRpcBroadcastStore, RpcBroadcastCoordinator } from '../../dist/services/rpc/src/broadcast.js';
import { RpcHealthRouter } from '../../dist/services/rpc/src/health.js';
import { RpcMethodPolicy } from '../../dist/services/rpc/src/policy.js';

const chain = { chainId: 'eip155:1', protocol: 'evm', enabled: true, finalityDepth: 10, maximumReorgDepth: 5, staleAfterMs: 1000, maximumBatchSize: 20, maximumResponseBytes: 1048576, archiveQualified: false, broadcastQualified: true };
const blockHash = `0x${'a'.repeat(64)}`;
const transactionHash = `0x${'b'.repeat(64)}`;
const call = { method: 'eth_sendRawTransaction', params: ['0x01'] };
const idempotencyKey = 'idem_0123456789ABCDEFGHIJ';

function route(behavior = 'success') {
  const broadcastCalls = [];
  return {
    routeId: 'rpc.route.primary',
    chainId: chain.chainId,
    broadcastCalls,
    async execute(calls) {
      if (calls[0]?.method === 'eth_sendRawTransaction') {
        broadcastCalls.push(calls);
        if (behavior === 'unknown') throw new Error('recorded connection reset');
        if (behavior === 'rejected') return [{ id: 1, ok: false, error: { code: -32003, message: 'Transaction rejected' } }];
        return [{ id: 1, ok: true, result: transactionHash }];
      }
      return calls.map(({ method }, index) => ({ id: index + 1, ok: true, result: method === 'eth_chainId' ? '0x1' : method === 'eth_blockNumber' ? '0x64' : { number: '0x5a', hash: blockHash } }));
    },
  };
}

async function coordinator(provider, reconcile = async () => ({ state: 'unavailable' })) {
  const health = new RpcHealthRouter({ chains: [chain], routes: [provider] });
  await health.refresh(chain.chainId, 1000);
  return new RpcBroadcastCoordinator({ policy: new RpcMethodPolicy([chain]), health, routes: [provider], store: new InMemoryRpcBroadcastStore(), reconciler: { reconcile } });
}

test('broadcast submission is reserved before one provider call and terminal replay never rebroadcasts', async () => {
  const provider = route();
  const value = await coordinator(provider);
  const first = await value.broadcast({ chainId: chain.chainId, call, idempotencyKey, nowMs: 1000 });
  assert.equal(first.state, 'submitted');
  assert.equal(first.transactionId, transactionHash);
  assert.equal(first.replayed, false);
  const replay = await value.broadcast({ chainId: chain.chainId, call, idempotencyKey, nowMs: 1100 });
  assert.equal(replay.state, 'submitted');
  assert.equal(replay.replayed, true);
  assert.equal(provider.broadcastCalls.length, 1);
  await assert.rejects(value.broadcast({ chainId: chain.chainId, call: { ...call, params: ['0x02'] }, idempotencyKey, nowMs: 1200 }), /idempotency_conflict/u);
});

test('unknown broadcast outcomes reconcile on replay and never fail over or resubmit', async () => {
  const provider = route('unknown');
  let reconciliations = 0;
  const value = await coordinator(provider, async () => { reconciliations += 1; return { state: 'confirmed', transactionId: transactionHash }; });
  const first = await value.broadcast({ chainId: chain.chainId, call, idempotencyKey, nowMs: 1000 });
  assert.equal(first.state, 'unknown');
  const replay = await value.broadcast({ chainId: chain.chainId, call, idempotencyKey, nowMs: 1100 });
  assert.equal(replay.state, 'confirmed');
  assert.equal(replay.replayed, true);
  assert.equal(provider.broadcastCalls.length, 1);
  assert.equal(reconciliations, 1);
});

test('explicit provider rejection is terminal and invalid transaction identity becomes unknown', async () => {
  const rejectedProvider = route('rejected');
  const rejected = await coordinator(rejectedProvider);
  assert.equal((await rejected.broadcast({ chainId: chain.chainId, call, idempotencyKey, nowMs: 1000 })).state, 'rejected');
  const invalidProvider = route();
  invalidProvider.execute = async (calls) => calls[0]?.method === 'eth_sendRawTransaction'
    ? (invalidProvider.broadcastCalls.push(calls), [{ id: 1, ok: true, result: 'not-a-transaction-hash' }])
    : calls.map(({ method }, index) => ({ id: index + 1, ok: true, result: method === 'eth_chainId' ? '0x1' : method === 'eth_blockNumber' ? '0x64' : { number: '0x5a', hash: blockHash } }));
  const invalid = await coordinator(invalidProvider);
  assert.equal((await invalid.broadcast({ chainId: chain.chainId, call, idempotencyKey, nowMs: 1000 })).state, 'unknown');
});
