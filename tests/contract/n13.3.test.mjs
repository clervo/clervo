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
  assert.match(docs, /publication not verified/iu);
  assert.match(docs, /no public API deployment/iu);
});

test('site ships canonical media, static routes, and hardened hosting controls', async () => {
  const media = JSON.parse(await read('apps/site/media/canonical-media.v1.json'));
  assert.equal(media.blenderVersion, '5.2.0 LTS');
  assert.equal(media.generatedMediaUsedAsProductProof, false);
  assert.equal(media.artifacts.length, 26);
  assert.deepEqual(media.actions, [
    'CLERVO_Verification_Aperture',
    'CLERVO_Receipt_Ejection',
  ]);

  const staticRoutes = [
    ['apps/site/dist/index.html', 'Find.'],
    ['apps/site/dist/product/index.html', 'One platform.'],
    ['apps/site/dist/proof-lab/index.html', 'Inspect the mechanism.'],
    ['apps/site/dist/docs/typescript/index.html', 'TypeScript'],
    ['apps/site/dist/security/index.html', 'Failure closes the boundary'],
    ['apps/site/dist/status/index.html', 'Private core frozen.'],
  ];
  for (const [file, expected] of staticRoutes) {
    const html = await read(file);
    assert.match(html, /rel="canonical"/u);
    assert.ok(html.includes(expected), file);
    assert.doesNotMatch(html, /<div id="root"><\/div>/u);
  }

  const headers = await read('apps/site/public/_headers');
  assert.match(headers, /Content-Security-Policy:/u);
  assert.match(headers, /object-src 'none'/u);
  assert.match(headers, /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\)/u);
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
  assert.match(webgl, /ReceiptWafer/u);
});
