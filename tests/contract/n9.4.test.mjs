import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = async (name) => JSON.parse(await readFile(path.join(root, name), 'utf8'));

test('prediction source registry keeps recorded adapters unavailable until commercial and history rights are qualified', async () => {
  const registry = await read('infra/prediction/source-routes.v1.json');
  assert.equal(registry.lifecycle, 'unavailable');
  assert.equal(registry.customerRoutingEnabled, false);
  assert.equal(registry.sources.length, 2);
  assert.deepEqual(new Set(registry.sources.map(({ venueId }) => venueId)), new Set(['polymarket', 'kalshi']));
  assert.ok(registry.sources.every(({ technicalQualification }) => technicalQualification === 'qualified'));
  assert.ok(registry.sources.every(({ commercialPermission, publicSellable, historyPermission, customerRoutingEnabled }) => commercialPermission === 'unresolved' && publicSellable === false && historyPermission === 'unresolved' && customerRoutingEnabled === false));
});

test('all five unavailable prediction products have positive competitive prices and hard response/item ceilings', async () => {
  const pricing = await read('packages/catalog/prediction-product-pricing.v1.json');
  assert.equal(pricing.lifecycle, 'unavailable');
  assert.equal(pricing.providerNamesPublic, true);
  assert.deepEqual(pricing.products.map(({ productId }) => productId), ['prediction.markets', 'prediction.market', 'prediction.compare', 'prediction.history', 'prediction.signal']);
  assert.ok(pricing.products.every(({ customerPriceMicrousd, supplierCostMicrousd, infrastructureCostAllowanceMicrousd, listingStatus, maximumItems, maximumResponseBytes }) => customerPriceMicrousd >= pricing.minimumBillableMicrousd && customerPriceMicrousd > supplierCostMicrousd + infrastructureCostAllowanceMicrousd && listingStatus === 'commercial_permission_blocked' && maximumItems <= 201 && maximumResponseBytes <= 10_485_760));
  assert.deepEqual(pricing.subsidy, { enabled: false, budgetMicrousd: 0, ownerApprovalRequired: true });
});

test('canonical registry includes every prediction product internally without exposing a route or availability claim', async () => {
  const registry = await read('packages/catalog/platform-registry.v1.json');
  const expected = ['prediction.markets', 'prediction.market', 'prediction.compare', 'prediction.history', 'prediction.signal'];
  const products = registry.products.filter(({ pillarId }) => pillarId === 'prediction');
  const operations = registry.operations.filter(({ operationId }) => operationId.startsWith('prediction.'));
  assert.deepEqual(products.map(({ productId }) => productId), expected);
  assert.deepEqual(operations.map(({ operationId }) => operationId), expected);
  assert.ok([...products, ...operations].every(({ lifecycle, visibility }) => lifecycle === 'unavailable' && visibility === 'internal'));
  assert.ok(operations.every(({ route }) => route === null));
});

test('prediction schemas are explicitly internal and product mismatch fixtures fail closed', async () => {
  const visibility = await read('packages/catalog/schema-visibility.v1.json');
  const entries = visibility.schemas.filter(({ file }) => file.startsWith('prediction-'));
  assert.equal(entries.length, 7);
  assert.ok(entries.every(({ visibility: state }) => state === 'internal_control'));
  const mismatch = await read('packages/contracts/fixtures/prediction-operation-request-product-mismatch-invalid.json');
  const bypass = await read('packages/contracts/fixtures/prediction-source-routes-terms-bypass-invalid.json');
  assert.equal(mismatch.valid, false);
  assert.equal(bypass.valid, false);
});
