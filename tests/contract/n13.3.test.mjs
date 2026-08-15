import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (value) => readFile(path.join(root, value), 'utf8');

test('generated discovery publishes exactly the product families the registry observes live', async () => {
  const discovery = JSON.parse(await read('generated/public/.well-known/clervo.json'));
  const registry = JSON.parse(await read('packages/catalog/live-registry.json'));
  // Every published operation belongs to a family observed live, and no live
  // family is silently withheld.
  const familyOf = (productId) => ({ search: 'search', ai: 'ai', sandbox: 'sandbox', rpc: 'rpc', prediction: 'prediction', crypto: 'crypto_intelligence' })[productId.split('.')[0]];
  const liveFamilies = new Set(registry.products.filter(({ state }) => state === 'live').map(({ id }) => id));
  const published = discovery.products.map(({ productId }) => productId);
  assert.ok(published.includes('search.web'), 'raw Search must stay published');
  assert.equal(published.includes('search.answer'), true, 'callable deep Research must stay in public inventory');
  for (const productId of published) {
    assert.ok(liveFamilies.has(familyOf(productId)), `${productId} is published but its family is not observed live`);
  }
  for (const family of liveFamilies) {
    assert.ok(published.some((productId) => familyOf(productId) === family), `${family} is observed live but nothing is published for it`);
  }

  // Distribution flags follow the registry rather than a frozen snapshot.
  assert.equal(discovery.distribution.callable, liveFamilies.size > 0);
  assert.equal(discovery.distribution.publicAvailable, liveFamilies.size > 0);
  assert.equal(discovery.distribution.noPublicDistribution, undefined);

  // Only an operation with an observed price may be advertised as payable.
  for (const product of discovery.products) {
    if (product.payment.payable !== true) continue;
    assert.notEqual(product.pricing.model, 'non_payable_mock_fixture', `${product.productId} advertises a mock price`);
  }

  const product = await read('apps/site/src/product.ts');
  assert.match(product, /generated\/public\/\.well-known\/clervo\.json/u);
});

test('site builds important routes with hardened hosting controls', async () => {
  const staticRoutes = [
    'apps/site/dist/index.html',
    'apps/site/dist/product/index.html',
    'apps/site/dist/catalog/index.html',
    'apps/site/dist/docs/typescript/index.html',
    'apps/site/dist/docs/python/index.html',
    'apps/site/dist/docs/http/index.html',
    'apps/site/dist/security/index.html',
    'apps/site/dist/status/index.html',
  ];
  for (const file of staticRoutes) {
    const html = await read(file);
    assert.match(html, /rel="canonical"/u);
    assert.match(html, /data-prerender-path=/u);
    assert.doesNotMatch(html, /<div id="root"><\/div>/u);
  }

  const headers = await read('apps/site/public/_headers');
  assert.match(headers, /Content-Security-Policy:/u);
  assert.match(headers, /object-src 'none'/u);
  assert.match(headers, /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\)/u);
  const redirects = await read('apps/site/public/_redirects');
  assert.match(redirects, /^\/research \/research\/ 301$/mu);
  assert.match(redirects, /^\/docs\/x402 \/docs\/x402\/ 301$/mu);
});

test('site projects live Prediction operations, prices, and attribution from generated truth', async () => {
  const [prediction, catalog, pricing, status, home] = await Promise.all([
    read('apps/site/dist/products/prediction/index.html'),
    read('apps/site/dist/catalog/index.html'),
    read('apps/site/dist/pricing/index.html'),
    read('apps/site/dist/status/index.html'),
    read('apps/site/dist/index.html'),
  ]);
  assert.match(prediction, /prediction\.markets/u);
  assert.match(prediction, /pdata\.world \/ CC BY 4\.0/u);
  assert.match(catalog, /prediction\.markets/u);
  assert.match(catalog, /pdata\.world \/ CC BY 4\.0/u);
  assert.match(pricing, /prediction\.markets/u);
  assert.match(pricing, /0\.002 USDC/u);
  assert.match(status, /Families serving/u);
  assert.match(home, /Prediction Intelligence/u);
});
