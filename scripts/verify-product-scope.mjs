#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const json = async (relative) => JSON.parse(await read(relative));

try {
  const [registry, launch, discovery, catalog, pricing, status, onboarding, openapi] = await Promise.all([
    json('packages/catalog/platform-registry.v1.json'),
    json('packages/catalog/launch-state.v1.json'),
    json('generated/public/.well-known/clervo.json'),
    json('generated/public/catalog.json'),
    json('generated/public/pricing.json'),
    json('generated/public/status.json'),
    json('generated/public/onboarding.json'),
    json('generated/public/openapi.json'),
  ]);

  const families = ['search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto_intelligence'];
  assert.deepEqual(registry.pillars.map(({ pillarId }) => pillarId), families);
  assert.deepEqual(launch.products.map(({ id }) => id), families);

  assert.equal(launch.distribution.publicApi.publicCallable, true);
  assert.equal(launch.distribution.publicApi.publicTraffic, true);
  assert.equal(launch.distribution.publicApi.customerEndpointAvailable, true);

  const discoveryById = new Map(discovery.products.map((product) => [product.productId, product]));
  const search = discoveryById.get('search.web');
  assert.ok(search, 'search.web missing from discovery');
  assert.equal(search.lifecycle, 'preview');
  assert.equal(search.publicAvailable, true);
  assert.equal(search.payment.payable, true);
  assert.equal(search.pricing.displayPrice.amountAtomic, '6000');
  assert.equal(search.pricing.displayPrice.decimals, 6);

  const answer = discoveryById.get('search.answer');
  assert.ok(answer, 'search.answer missing from discovery');
  assert.equal(answer.publicAvailable, false);
  assert.equal(answer.payment.payable, false);

  const catalogById = new Map(catalog.products.map((product) => [product.productId, product]));
  assert.equal(catalogById.get('search.web')?.publicAvailable, true);
  assert.equal(catalogById.get('search.answer')?.publicAvailable, false);

  assert.equal(pricing.publicOfferAvailable, true);
  assert.equal(pricing.publicPrice.productId, 'search.web');
  assert.equal(pricing.publicPrice.amountAtomic, '6000');
  assert.equal(pricing.offers.find(({ productId }) => productId === 'search.web')?.publicAvailable, true);
  assert.equal(pricing.offers.find(({ productId }) => productId === 'search.answer')?.publicAvailable, false);

  assert.deepEqual(status.publicApi, launch.distribution.publicApi);
  assert.equal(onboarding.publicCallable, true);
  assert.equal(onboarding.paymentImplemented, true);
  assert.ok(openapi.paths['/v1/search/free']);
  assert.ok(openapi.paths['/v1/search/paid']);

  const controls = await Promise.all([
    'AGENTS.md',
    'AI_BUILDER.md',
    'README.md',
    'docs/PRODUCT.md',
    'docs/product/CURRENT-ENGINEERING-STATE.md',
    'docs/product/SHOP-OPEN-EXECUTION.md',
    'docs/brand/FOCUSED-LAUNCH-SCOPE-v1.md',
    'docs/marketing/INITIAL-COMMERCIAL-RELEASE.md',
  ].map(async (relative) => [relative, await read(relative)]));

  const obsolete = [
    /all-six \*\*Clervo Platform\*\*/u,
    /Customer-functional paid readiness is currently 58\.33%/u,
    /external payer needed/u,
    /one external customer pays once/u,
    /apps\/site\/capability-scope\.json/u,
    /apps\/site\/PROTOTYPE-COPY\.md/u,
  ];

  for (const [relative, source] of controls) {
    for (const pattern of obsolete) {
      assert.doesNotMatch(source, pattern, `${relative}: obsolete authority`);
    }
  }

  assert.ok((await read('AGENTS.md')).split('\n').length <= 120);
  console.log('shop-open product scope consistency: PASS');
} catch (error) {
  console.error(`shop-open product scope consistency: FAIL: ${error.message}`);
  process.exitCode = 1;
}
