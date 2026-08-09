import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (value) => readFile(path.join(root, value), 'utf8');

test('generated discovery publishes exactly the product families the registry observes live', async () => {
  const discovery = JSON.parse(await read('generated/public/.well-known/clervo.json'));
  const registry = JSON.parse(await read('packages/catalog/live-registry.json'));
  // This test used to pin the distribution block to the private-candidate
  // snapshot and freeze the published product list at the two Search
  // operations. Both broke the moment a further family went live: the fix for
  // a truthful surface was to make the test fail. It now asserts the binding
  // instead — every published operation belongs to a family the probed
  // registry observes live, and no live family is silently withheld.
  const familyOf = (productId) => ({ search: 'search', ai: 'ai', sandbox: 'sandbox', rpc: 'rpc', prediction: 'prediction', crypto: 'crypto_intelligence' })[productId.split('.')[0]];
  const liveFamilies = new Set(registry.products.filter(({ state }) => state === 'live').map(({ id }) => id));
  const published = discovery.products.map(({ productId }) => productId);
  assert.ok(published.includes('search.web'), 'raw Search must stay published');
  assert.ok(published.includes('search.answer'), 'Search synthesis must stay listed');
  for (const productId of published) {
    assert.ok(liveFamilies.has(familyOf(productId)), `${productId} is published but its family is not observed live`);
  }
  for (const family of liveFamilies) {
    assert.ok(published.some((productId) => familyOf(productId) === family), `${family} is observed live but nothing is published for it`);
  }

  // Distribution flags follow the registry rather than a frozen snapshot.
  assert.equal(discovery.distribution.callable, liveFamilies.size > 0);
  assert.equal(discovery.distribution.publicAvailable, liveFamilies.size > 0);
  assert.equal(discovery.distribution.noPublicDistribution, liveFamilies.size === 0);

  // Only an operation with an observed price may be advertised as payable.
  for (const product of discovery.products) {
    if (product.payment.payable !== true) continue;
    assert.notEqual(product.pricing.model, 'non_payable_mock_fixture', `${product.productId} advertises a mock price`);
  }

  const product = await read('apps/site/src/product.ts');
  assert.match(product, /generated\/public\/\.well-known\/clervo\.json/u);
});

test('site ships canonical media, static routes, and hardened hosting controls', async () => {
  const media = JSON.parse(await read('apps/site/media/canonical-media.v1.json'));
  assert.equal(media.blenderVersion, '5.2.0 LTS');
  assert.equal(media.generatedMediaUsedAsProductProof, false);
  assert.equal(media.artifacts.length, 26);
  assert.deepEqual(media.actions, [
    'CLERVO_Shell_Left',
    'CLERVO_Shell_Right',
    'CLERVO_Verification_Aperture',
    'CLERVO_Receipt_Ejection',
  ]);
  const worlds = JSON.parse(await read('apps/site/media/canonical-worlds-media.v1.json'));
  assert.equal(worlds.blenderVersion, '5.2.0 LTS');
  assert.equal(worlds.generatedMediaUsedAsProductProof, false);
  assert.equal(worlds.artifacts.length, 6);
  assert.equal(worlds.runtimeAsset, 'apps/site/public-assets/clervo-worlds.glb');

  const staticRoutes = [
    ['apps/site/dist/index.html', 'One job in.'],
    ['apps/site/dist/product/index.html', 'One platform.'],
    ['apps/site/dist/proof-lab/index.html', 'Inspect the mechanism.'],
    ['apps/site/dist/docs/typescript/index.html', 'TypeScript'],
    ['apps/site/dist/security/index.html', 'Failure closes the boundary'],
    // The status headline is deliberately a constant that describes the method,
    // not the status. Pinning a rendered status value here would make the test
    // a second, competing source of truth.
    ['apps/site/dist/status/index.html', 'Probed, not asserted.'],
  ];
  for (const [file, expected] of staticRoutes) {
    const html = await read(file);
    assert.match(html, /rel="canonical"/u);
    assert.match(html, /data-prerender-path=/u);
    assert.ok(html.includes(expected), file);
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

test('site projects live Prediction operations, prices, attribution, and proof from generated truth', async () => {
  const [prediction, catalog, pricing, status, home] = await Promise.all([
    read('apps/site/dist/products/prediction/index.html'),
    read('apps/site/dist/catalog/index.html'),
    read('apps/site/dist/pricing/index.html'),
    read('apps/site/dist/status/index.html'),
    read('apps/site/dist/index.html'),
  ]);
  assert.match(prediction, /prediction\.markets/u);
  assert.match(prediction, /pdata\.world \/ CC BY 4\.0/u);
  assert.match(prediction, /public x402 challenge available paid result pending/u);
  assert.match(catalog, /prediction\.markets/u);
  assert.match(catalog, /pdata\.world<!-- -->, <!-- -->CC BY 4\.0/u);
  assert.match(pricing, /prediction\.markets/u);
  assert.match(pricing, /0\.002 USDC/u);
  assert.match(status, /Routes answering<\/dt><dd><b>7/u);
  assert.match(home, /Routes serving<\/dt><dd>7/u);
});

test('site keeps WebGL optional for narrow and reduced-motion clients', async () => {
  const instrument = await read('apps/site/src/components/Instrument.tsx');
  assert.match(instrument, /max-width: 900px/u);
  assert.match(instrument, /prefers-reduced-motion: reduce/u);
  assert.match(instrument, /clervo-prism-portrait-\$\{phase\}\.webp/u);
  assert.match(instrument, /import\('\.\/WebGLInstrument'\)/u);

  const webgl = await read('apps/site/src/components/WebGLInstrument.tsx');
  assert.match(webgl, /clervo-prism\.glb/u);
  assert.match(webgl, /VerificationAperture/u);
  assert.match(webgl, /ShellPetalLeft/u);
  assert.match(webgl, /ShellPetalRight/u);
  assert.match(webgl, /ReceiptWafer/u);
  assert.match(webgl, /frameloop="demand"/u);
  assert.match(instrument, /MediaBoundary/u);

  const worlds = await read('apps/site/src/components/Worlds.tsx');
  const webglWorlds = await read('apps/site/src/components/WebGLWorlds.tsx');
  assert.match(worlds, /prefers-reduced-motion: reduce/u);
  assert.match(worlds, /The artwork is a system model\. The state on each card is observed\./u);
  assert.match(worlds, /MediaBoundary/u);
  assert.match(webglWorlds, /clervo-worlds\.glb/u);
  assert.match(webglWorlds, /frameloop="demand"/u);
});
