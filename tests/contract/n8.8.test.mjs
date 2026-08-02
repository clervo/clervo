import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { RpcHealthRouter } from '../../dist/services/rpc/src/health.js';

const json = async (path) => JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('all eight declared chains pass recorded EVM or Solana semantic conformance', async () => {
  const registry = await json('infra/rpc/chain-registry.v1.json');
  const fixtures = await json('tests/fixtures/rpc/semantic-conformance.v1.json');
  assert.deepEqual(new Set(fixtures.chains.map(({ chainId }) => chainId)), new Set(registry.chains.map(({ chainId }) => chainId)));
  for (const chain of registry.chains) {
    const fixture = fixtures.chains.find(({ chainId }) => chainId === chain.chainId);
    const referenceHeight = fixture.height - chain.finalityDepth;
    const route = {
      routeId: `rpc.route.conformance_${chain.name.toLowerCase().replace(/[^a-z0-9]+/gu, '_')}`,
      chainId: chain.chainId,
      async execute(calls) {
        return calls.map(({ method }, index) => ({
          id: index + 1,
          ok: true,
          result: method === 'eth_chainId' || method === 'getGenesisHash' ? fixture.identity
            : method === 'eth_blockNumber' ? `0x${fixture.height.toString(16)}`
              : method === 'getSlot' ? fixture.height
                : chain.protocol === 'evm' ? { number: `0x${referenceHeight.toString(16)}`, hash: fixture.finalizedHash } : { blockhash: fixture.finalizedHash },
        }));
      },
    };
    const health = await new RpcHealthRouter({ chains: [chain], routes: [route] }).refresh(chain.chainId, 1000);
    assert.equal(health.routes[0].status, 'healthy', chain.chainId);
  }
});

test('RPC product pricing covers every product without making blocked supply sellable', async () => {
  const pricing = await json('packages/catalog/rpc-product-pricing.v1.json');
  assert.deepEqual(new Set(pricing.products.map(({ productId }) => productId)), new Set(['rpc.call', 'rpc.batch', 'rpc.health', 'rpc.archive', 'rpc.broadcast']));
  assert.equal(pricing.lifecycle, 'unavailable');
  assert.equal(pricing.providerNamesPublic, false);
  assert.equal(pricing.products.find(({ productId }) => productId === 'rpc.health').customerPriceMicrousd, 0);
  assert.ok(pricing.products.filter(({ productId }) => productId !== 'rpc.health').every(({ customerPriceMicrousd }) => customerPriceMicrousd > 0));
  assert.ok(pricing.products.every(({ listingStatus }) => ['terms_blocked', 'free_unavailable', 'unqualified'].includes(listingStatus)));
});
