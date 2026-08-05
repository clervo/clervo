import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const json = async (path) => JSON.parse(await read(path));

test('Shop-Open readiness follows the real Search money path', async () => {
  const [launch, discovery, pricing, onboarding] = await Promise.all([
    json('packages/catalog/launch-state.v1.json'),
    json('generated/public/.well-known/clervo.json'),
    json('generated/public/pricing.json'),
    json('generated/public/onboarding.json'),
  ]);

  assert.equal(launch.distribution.publicApi.publicCallable, true);
  const search = discovery.products.find(({ productId }) => productId === 'search.web');
  assert.equal(search.publicAvailable, true);
  assert.equal(search.payment.payable, true);
  assert.equal(search.pricing.displayPrice.amountAtomic, '6000');

  assert.equal(pricing.publicPrice.productId, 'search.web');
  assert.equal(pricing.publicPrice.amountDisplay, '0.006 USDC');
  assert.equal(onboarding.publicCallable, true);
  assert.equal(onboarding.paymentImplemented, true);
  assert.deepEqual(onboarding.journey.map(({ step }) => step), [
    'install', 'ask', 'fund', 'approve', 'result', 'receipt',
  ]);
});

test('current authority opens Search without an all-six or external-payer gate', async () => {
  const [agents, product, state, execution] = await Promise.all([
    read('AGENTS.md'),
    read('docs/PRODUCT.md'),
    read('docs/CURRENT-STATE.yaml'),
    read('docs/product/SHOP-OPEN-EXECUTION.md'),
  ]);

  assert.ok(agents.split('\n').length <= 120);
  assert.match(agents, /owner-approved production\s+wallet/u);
  assert.match(product, /active Shop-Open product is `search\.web`/u);
  assert.match(state, /maximum_authorized_spend_usdc: 0\.006/u);
  assert.match(execution, /No external tester is required before opening/u);

  const combined = [agents, product, state, execution].join('\n');
  assert.doesNotMatch(combined, /58\.33%/u);
  assert.doesNotMatch(combined, /one external customer pays once/iu);
  assert.doesNotMatch(combined, /all-six \*\*Clervo Platform\*\*/u);
});

test('six permanent families remain preserved without blocking Search opening', async () => {
  const registry = await json('packages/catalog/platform-registry.v1.json');
  assert.deepEqual(registry.pillars.map(({ pillarId }) => pillarId), [
    'search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto_intelligence',
  ]);
});
