import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (value) => readFile(path.join(root, value), 'utf8');

test('site derives its public truth from the frozen distribution candidate', async () => {
  const discovery = JSON.parse(await read('generated/public/.well-known/clervo.json'));
  assert.equal(discovery.distribution.state, 'candidate');
  assert.equal(discovery.distribution.publicAvailable, false);
  assert.equal(discovery.distribution.callable, false);
  assert.equal(discovery.distribution.noPublicDistribution, true);
  assert.deepEqual(discovery.products.map(({ productId }) => productId), ['search.web', 'search.answer']);
  assert.ok(discovery.products.every(({ payment }) => payment.payable === false));

  const product = await read('apps/site/src/product.ts');
  const proof = await read('apps/site/src/pages/ProofLab.tsx');
  const docs = await read('apps/site/src/pages/Docs.tsx');
  assert.match(product, /generated\/public\/\.well-known\/clervo\.json/u);
  assert.match(proof, /no network · no payment/iu);
  assert.match(proof, /Additional charge<\/dt><dd>0/iu);
  assert.match(docs, /Public packages verified/iu);
  assert.match(docs, /customer API is not publicly callable/iu);
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
    ['apps/site/dist/status/index.html', 'Built privately.'],
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
  assert.match(worlds, /Cinematic system model · not live telemetry/u);
  assert.match(worlds, /MediaBoundary/u);
  assert.match(webglWorlds, /clervo-worlds\.glb/u);
  assert.match(webglWorlds, /frameloop="demand"/u);
});
