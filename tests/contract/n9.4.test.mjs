import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = async (name) => JSON.parse(await readFile(path.join(root, name), 'utf8'));

test('prediction source registry enables only explicitly licensed supply and keeps unresolved direct adapters fail closed', async () => {
  const registry = await read('infra/prediction/source-routes.v1.json');
  assert.equal(registry.lifecycle, 'live');
  assert.equal(registry.customerRoutingEnabled, true);
  assert.equal(registry.sources.length, 3);
  assert.ok(registry.sources.every(({ technicalQualification }) => technicalQualification === 'qualified'));
  const direct = registry.sources.filter(({ adapterId }) => adapterId !== 'adapter_prediction.pdata_rest');
  assert.deepEqual(new Set(direct.map(({ venueId }) => venueId)), new Set(['polymarket', 'kalshi']));
  assert.ok(direct.every(({ commercialPermission, publicSellable, historyPermission, customerRoutingEnabled }) => commercialPermission === 'unresolved' && publicSellable === false && historyPermission === 'unresolved' && customerRoutingEnabled === false));
  const pdata = registry.sources.find(({ adapterId }) => adapterId === 'adapter_prediction.pdata_rest');
  assert.deepEqual(pdata.venueIds, ['polymarket', 'kalshi', 'manifold', 'limitless']);
  assert.equal(pdata.commercialPermission, 'approved');
  assert.equal(pdata.publicSellable, true);
  assert.equal(pdata.historyPermission, 'approved');
  assert.equal(pdata.customerRoutingEnabled, true);
  assert.ok(Date.parse(pdata.technicalObservedAt) < Date.parse(pdata.technicalExpiresAt));
  assert.equal(Date.parse(pdata.technicalExpiresAt) - Date.parse(pdata.technicalObservedAt), 7 * 24 * 60 * 60 * 1_000);
  const qualification = await read('docs/evidence/prediction/pdata-live-conformance.v1.json');
  assert.equal(qualification.qualified, true);
  assert.equal(qualification.qualification.qualificationId, pdata.qualificationId);
  assert.equal(qualification.qualification.technicalObservedAt, pdata.technicalObservedAt);
  assert.equal(qualification.qualification.technicalExpiresAt, pdata.technicalExpiresAt);
  assert.equal(qualification.runtimeProbe.passed, true);
  assert.equal(qualification.search.runtimeClientSideFilteringQualified, true);
  assert.deepEqual(
    { licenseId: pdata.commercialRights.licenseId, commercialUse: pdata.commercialRights.commercialUse, adaptation: pdata.commercialRights.adaptation, redistribution: pdata.commercialRights.redistribution, apiReuse: pdata.commercialRights.apiReuse },
    { licenseId: 'CC BY 4.0', commercialUse: true, adaptation: true, redistribution: true, apiReuse: true },
  );
  const enabledVenues = registry.sources.filter(({ customerRoutingEnabled }) => customerRoutingEnabled).flatMap(({ venueIds, venueId }) => venueIds ?? [venueId]);
  assert.equal(new Set(enabledVenues).size, enabledVenues.length);
});

test('all five sellable prediction products recover bounded infrastructure cost with zero supplier spend', async () => {
  const pricing = await read('packages/catalog/prediction-product-pricing.v1.json');
  assert.equal(pricing.lifecycle, 'live');
  assert.equal(pricing.providerNamesPublic, true);
  assert.equal(pricing.costBasis.zeroCostDataSupply, true);
  assert.equal(pricing.costBasis.facilitatorOverageMicrousdPerSettlement, 1000);
  assert.equal(pricing.costBasis.postFreeTierCostIncluded, true);
  assert.ok(pricing.costBasis.evidenceUrls.every((url) => url.startsWith('https://')));
  assert.deepEqual(pricing.products.map(({ productId }) => productId), ['prediction.markets', 'prediction.market', 'prediction.compare', 'prediction.history', 'prediction.signal']);
  assert.ok(pricing.products.every(({ customerPriceMicrousd, supplierCostMicrousd, infrastructureCostAllowanceMicrousd, listingStatus, maximumItems, maximumResponseBytes }) => customerPriceMicrousd >= pricing.minimumBillableMicrousd && supplierCostMicrousd === 0 && infrastructureCostAllowanceMicrousd > pricing.costBasis.facilitatorOverageMicrousdPerSettlement && customerPriceMicrousd > supplierCostMicrousd + infrastructureCostAllowanceMicrousd && listingStatus === 'sellable' && maximumItems <= 201 && maximumResponseBytes <= 10_485_760));
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
