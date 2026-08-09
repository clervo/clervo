import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const read = async (name) => JSON.parse(await readFile(path.join(process.cwd(), name), 'utf8'));

test('crypto source registry selects one technically and commercially qualified EVM value-added route', async () => {
  const registry = await read('infra/crypto/source-routes.v1.json');
  assert.equal(registry.lifecycle, 'live');
  assert.equal(registry.customerRoutingEnabled, true);
  assert.ok(registry.sources.length >= 3);
  const selected = registry.sources.find(({ publicSellable }) => publicSellable === true);
  assert.deepEqual([selected.technicalQualification, selected.commercialPermission, selected.publicSellable, selected.customerRoutingEnabled], ['qualified', 'approved_value_added', true, true]);
  assert.deepEqual(selected.chainIds, ['eip155:1', 'eip155:8453']);
  assert.ok(registry.sources.filter(({ sourceId }) => sourceId !== selected.sourceId).every(({ publicSellable, customerRoutingEnabled }) => publicSellable === false && customerRoutingEnabled === false));
});

test('four bounded provider-neutral crypto operations have sustainable authoritative prices', async () => {
  const pricing = await read('packages/catalog/crypto-product-pricing.v1.json');
  assert.equal(pricing.lifecycle, 'live');
  assert.equal(pricing.providerNamesPublic, true);
  assert.deepEqual(pricing.products.map(({ productId, customerPriceMicrousd }) => [productId, customerPriceMicrousd]), [
    ['crypto.wallet.balances', 2000],
    ['crypto.wallet.tokens', 2000],
    ['crypto.wallet.transactions', 3000],
    ['crypto.wallet.report', 4000],
  ]);
  assert.ok(pricing.products.every(({ customerPriceMicrousd, infrastructureCostAllowanceMicrousd, listingStatus, maximumItems, maximumResponseBytes }) => customerPriceMicrousd > infrastructureCostAllowanceMicrousd && listingStatus === 'sellable' && maximumItems <= 100 && maximumResponseBytes <= 10_485_760));
});

test('canonical registry preserves the stable four-operation Crypto contract without claiming undeployed availability', async () => {
  const registry = await read('packages/catalog/platform-registry.v1.json');
  const expected = ['crypto.wallet.balances', 'crypto.wallet.tokens', 'crypto.wallet.transactions', 'crypto.wallet.report'];
  const products = registry.products.filter(({ pillarId }) => pillarId === 'crypto_intelligence');
  const operations = registry.operations.filter(({ operationId }) => operationId.startsWith('crypto.'));
  assert.deepEqual(products.map(({ productId }) => productId), expected);
  assert.deepEqual(operations.map(({ operationId }) => operationId), expected);
  assert.ok([...products, ...operations].every(({ lifecycle, visibility }) => lifecycle === 'unavailable' && visibility === 'internal'));
  assert.ok(operations.every(({ route }) => route === null));
});

test('crypto schemas remain internal and mismatched products or terms bypass fail closed', async () => {
  const visibility = await read('packages/catalog/schema-visibility.v1.json');
  const entries = visibility.schemas.filter(({ file }) => file.startsWith('crypto-'));
  assert.equal(entries.length, 4);
  assert.ok(entries.every(({ visibility: state }) => state === 'internal_control'));
  assert.equal((await read('packages/contracts/fixtures/crypto-operation-request-product-mismatch-invalid.json')).valid, false);
  assert.equal((await read('packages/contracts/fixtures/crypto-source-routes-bypass-invalid.json')).valid, false);
});
