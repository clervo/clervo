import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const read = async (name) => JSON.parse(await readFile(path.join(process.cwd(), name), 'utf8'));

test('crypto source registry preserves technical assets but blocks every commercially incompatible customer route', async () => {
  const registry = await read('infra/crypto/source-routes.v1.json');
  assert.equal(registry.lifecycle, 'unavailable');
  assert.equal(registry.customerRoutingEnabled, false);
  assert.ok(registry.sources.length >= 3);
  assert.ok(registry.sources.every(({ technicalStatus }) => technicalStatus === 'passed'));
  assert.ok(registry.sources.every(({ termsStatus, resaleStatus, customerRoutingEnabled }) => termsStatus !== 'approved' && resaleStatus !== 'approved' && customerRoutingEnabled === false));
  assert.ok(registry.sources.some(({ chainCoverage }) => chainCoverage.includes('evm')));
  assert.ok(registry.sources.some(({ chainCoverage }) => chainCoverage.includes('solana')));
});

test('all five unavailable crypto products have positive prices and bounded responses without public provider names', async () => {
  const pricing = await read('packages/catalog/crypto-product-pricing.v1.json');
  assert.equal(pricing.lifecycle, 'unavailable');
  assert.equal(pricing.providerNamesPublic, false);
  assert.deepEqual(pricing.products.map(({ productId }) => productId), ['crypto.wallet', 'crypto.token', 'crypto.transaction', 'crypto.protocol', 'crypto.report']);
  assert.ok(pricing.products.every(({ customerPriceMicrousd, listingStatus, maximumItems, maximumResponseBytes }) => customerPriceMicrousd > 0 && listingStatus === 'terms_blocked' && maximumItems <= 10000 && maximumResponseBytes <= 10_485_760));
});

test('canonical registry includes Crypto Intelligence internally with no route or availability claim', async () => {
  const registry = await read('packages/catalog/platform-registry.v1.json');
  const expected = ['crypto.wallet', 'crypto.token', 'crypto.transaction', 'crypto.protocol', 'crypto.report'];
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
