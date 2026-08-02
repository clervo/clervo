import assert from 'node:assert/strict';
import test from 'node:test';

import { RpcHealthRouter } from '../../dist/services/rpc/src/health.js';

const chain = { chainId: 'eip155:1', protocol: 'evm', enabled: true, finalityDepth: 10, maximumReorgDepth: 5, staleAfterMs: 1000, maximumBatchSize: 20, maximumResponseBytes: 1048576, archiveQualified: false, broadcastQualified: false };
const hashA = `0x${'a'.repeat(64)}`;
const hashB = `0x${'b'.repeat(64)}`;

function route(routeId, { identity = '0x1', height = 100, hash = hashA, fail = false } = {}) {
  return {
    routeId,
    chainId: chain.chainId,
    async execute(calls) {
      if (fail) throw new Error('recorded outage');
      return calls.map(({ method }, index) => ({ id: index + 1, ok: true, result: method === 'eth_chainId' ? identity : method === 'eth_blockNumber' ? `0x${height.toString(16)}` : { number: '0x5a', hash } }));
    },
  };
}

test('semantic health removes stale, wrong-chain, and unavailable routes before latency selection', async () => {
  let monotonic = 0;
  const routes = [
    route('rpc.route.fast_primary'),
    route('rpc.route.slow_secondary', { height: 99 }),
    route('rpc.route.stale', { height: 80 }),
    route('rpc.route.wrong_chain', { identity: '0xa' }),
    route('rpc.route.down', { fail: true }),
  ];
  routes[0].execute = async (calls) => { monotonic += 1; return route('rpc.route.fast_primary').execute(calls); };
  routes[1].execute = async (calls) => { monotonic += 10; return route('rpc.route.slow_secondary', { height: 99 }).execute(calls); };
  const router = new RpcHealthRouter({ chains: [chain], routes, monotonic: () => monotonic });
  const health = await router.refresh(chain.chainId, 1000);
  assert.equal(health.quorumAvailable, true);
  assert.equal(health.routes.find(({ routeId }) => routeId === 'rpc.route.stale').status, 'stale');
  assert.equal(health.routes.find(({ routeId }) => routeId === 'rpc.route.wrong_chain').status, 'wrong_chain');
  assert.equal(health.routes.find(({ routeId }) => routeId === 'rpc.route.down').status, 'unavailable');
  assert.equal(router.select(chain.chainId, 1500).routeId, 'rpc.route.fast_primary');
  assert.throws(() => router.select(chain.chainId, 2001), /health_unavailable/u);
});

test('finalized hash disagreement fails closed without a majority and quarantines a minority fork', async () => {
  const tied = new RpcHealthRouter({ chains: [chain], routes: [route('rpc.route.one', { hash: hashA }), route('rpc.route.two', { hash: hashB })] });
  const tiedHealth = await tied.refresh(chain.chainId, 1000);
  assert.ok(tiedHealth.routes.every(({ status }) => status === 'forked'));
  assert.throws(() => tied.select(chain.chainId, 1000), /route_unavailable/u);
  const majority = new RpcHealthRouter({ chains: [chain], routes: [route('rpc.route.one', { hash: hashA }), route('rpc.route.two', { hash: hashA }), route('rpc.route.three', { hash: hashB })] });
  const majorityHealth = await majority.refresh(chain.chainId, 1000);
  assert.equal(majorityHealth.quorumAvailable, true);
  assert.equal(majorityHealth.routes.find(({ routeId }) => routeId === 'rpc.route.three').status, 'forked');
  assert.equal(majorityHealth.routes.filter(({ status }) => status === 'healthy').length, 2);
});

test('Solana probes bind genesis identity, finalized slot, and common finalized block hash', async () => {
  const solana = { ...chain, chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', protocol: 'solana', finalityDepth: 32, maximumReorgDepth: 16 };
  const solanaRoute = {
    routeId: 'rpc.route.solana_recorded',
    chainId: solana.chainId,
    async execute(calls) {
      return calls.map(({ method }, index) => ({ id: index + 1, ok: true, result: method === 'getGenesisHash' ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' : method === 'getSlot' ? 1000 : { blockhash: '11111111111111111111111111111111' } }));
    },
  };
  const router = new RpcHealthRouter({ chains: [solana], routes: [solanaRoute] });
  const health = await router.refresh(solana.chainId, 1000);
  assert.equal(health.routes[0].status, 'healthy');
  assert.equal(health.routes[0].finalizedReferenceHeight, 968);
});
