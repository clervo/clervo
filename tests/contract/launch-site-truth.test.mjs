import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const json = async (file) => JSON.parse(await read(file));

test('generated launch state is evidence-bound across packages, payment, and public lifecycle', async () => {
  const [source, generated, release, proof] = await Promise.all([
    json('packages/catalog/launch-state.v1.json'),
    json('generated/public/claims.json'),
    json('packages/distribution/release-targets.v1.json'),
    json('infra/production/gcp/x402-proof.v1.json'),
  ]);
  assert.deepEqual(generated, source);
  assert.equal(generated.repository.url, 'https://github.com/clervo/clervo');
  assert.equal(generated.distribution.packages.state, release.publication.state);
  assert.deepEqual(
    generated.distribution.packages.items.map(({ registry, name, version }) => [registry, name, version]),
    release.packages.map(({ registry, name, version }) => [registry, name, version]),
  );
  assert.equal(generated.distribution.publicApi.publicCallable, true);
  assert.equal(generated.distribution.publicApi.publicTraffic, true);
  assert.equal(generated.paymentProof.amountAtomic, proof.observedSettlement.customerChargeAtomic);
  assert.equal(generated.paymentProof.settlementConfirmed, true);
  assert.equal(generated.paymentProof.replaySameReceipt, true);
  assert.equal(generated.paymentProof.secondAuthorization, false);
  assert.equal(generated.paymentProof.secondExecution, false);
  assert.equal(generated.paymentProof.secondCharge, false);
  assert.equal(generated.paymentProof.revenueEvidence, false);
  assert.equal(generated.paymentProof.demandEvidence, false);
});

test('machine discovery publishes only live Search, Sandbox, and Prediction previews without overstating proof', async () => {
  const [discovery, status, pricing, capabilities, mcp, openapi, yaml] = await Promise.all([
    json('generated/public/.well-known/clervo.json'),
    json('generated/public/status.json'),
    json('generated/public/pricing.json'),
    json('generated/public/capabilities.json'),
    json('generated/public/.well-known/mcp.json'),
    json('generated/public/openapi.json'),
    json('generated/public/openapi.yaml'),
  ]);
  assert.equal(discovery.distribution.callable, true);
  assert.equal(discovery.payment.publicAvailable, true);
  assert.equal(discovery.payment.privateProofVerified, true);
  assert.equal(discovery.payment.commercialProof, false);
  const ai = discovery.products.find(({ productId }) => productId === 'ai.chat');
  assert.equal(ai, undefined, 'supply-paused AI must not be offered as a live operation');
  const sandbox = discovery.products.find(({ productId }) => productId === 'sandbox.run');
  assert.equal(sandbox.publicAvailable, true);
  assert.equal(sandbox.payment.payable, true);
  assert.equal(sandbox.pricing.model, 'class_derived_quote');
  assert.equal(sandbox.pricing.displayPrice.amountAtomic, '10000');
  assert.deepEqual(sandbox.pricing.priceRange, { minimumAtomic: '10000', maximumAtomic: '60000' });
  const prediction = discovery.products.filter(({ productId }) => productId.startsWith('prediction.'));
  assert.equal(prediction.length, 5);
  assert.ok(prediction.every(({ publicAvailable, payment }) => publicAvailable && payment.payable));
  assert.equal(status.packages.state, 'published_verified');
  assert.equal(status.publicApi.customerEndpointAvailable, true);
  assert.equal(pricing.publicOfferAvailable, true);
  assert.equal(pricing.publicPrice.productId, 'search.web');
  assert.equal(pricing.publicPrice.amountAtomic, '6000');
  assert.equal(capabilities.products.length, 6);
  assert.equal(mcp.name, '@clervo/mcp');
  assert.equal(mcp.publicApiAvailable, true);
  assert.equal(mcp.paymentSigningImplemented, false);
  assert.deepEqual(yaml, openapi);
  assert.equal(openapi.paths['/v1/ai/execute'], undefined);
  assert.ok(openapi.paths['/v1/sandbox/execute']);
  assert.ok(openapi.paths['/v1/prediction/execute']);
  assert.equal(openapi.info.contact.url, 'https://github.com/clervo/clervo');
  assert.equal(openapi.info.contact.email, 'mo@clervo.dev');
  assert.match(openapi.info['x-guidance'], /same key.*without a second charge/iu);
  assert.deepEqual(openapi.paths['/v1/search/free'].post.security, []);
  assert.deepEqual(openapi.paths['/v1/search/paid'].post['x-payment-info'], {
    price: { mode: 'fixed', currency: 'USD', amount: '0.006000' },
    protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
  });
  assert.deepEqual(openapi.paths['/v1/sandbox/execute'].post['x-payment-info'], {
    price: { mode: 'dynamic_class', currency: 'USD', minimum: '0.010000', maximum: '0.060000' },
    protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
  });
  assert.deepEqual(openapi.paths['/v1/prediction/execute'].post['x-payment-info'], {
    price: { mode: 'request_derived_per_operation', currency: 'USD', min: '0.002000', max: '0.003000' },
    protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
  });
  assert.equal(openapi.paths['/v1/search/paid'].post.requestBody.content['application/json'].example.synthesize, false);
  assert.deepEqual(openapi.paths['/v1/sandbox/execute'].post.requestBody.content['application/json'].example.command.slice(0, 2), ['node', '-e']);
  assert.equal(openapi.paths['/v1/prediction/execute'].post.requestBody.content['application/json'].example.kind, 'markets');
  assert.doesNotMatch(JSON.stringify(openapi.paths), /"\$ref"/u);
});

test('launch pages and discovery surfaces exist without forbidden or stale claims', async () => {
  const requiredPages = [
    'index.html',
    'research/index.html',
    'platform/index.html',
    'products/search/index.html',
    'products/ai/index.html',
    'products/sandbox/index.html',
    'products/rpc/index.html',
    'products/prediction/index.html',
    'products/crypto/index.html',
    'proof/index.html',
    'pricing/index.html',
    'docs/quickstart/index.html',
    'docs/receipts/index.html',
    'docs/replay/index.html',
    'docs/failures/index.html',
    'docs/x402/index.html',
    'docs/catalog/index.html',
    'trust/index.html',
    'status/index.html',
    'changelog/index.html',
    'compare/blockrun/index.html',
  ];
  const pages = await Promise.all(requiredPages.map((file) => read(`apps/site/dist/${file}`)));
  assert.ok(pages.every((html) => html.includes('rel="canonical"')));
  const publicText = [
    ...pages,
    await read('generated/public/llms.txt'),
    await read('generated/public/claims.json'),
  ].join('\n');
  assert.doesNotMatch(publicText, /Every AI model|Google-quality|BlockRun has 0 free|20% cheaper than BlockRun/iu);
  assert.doesNotMatch(publicText, /Package candidates · publication not verified/iu);
  assert.doesNotMatch(publicText, /the one thing on this site that was actually paid|the single fact on the site that has actually been paid|Settled paid outcome<\/dt><dd><b>1|x402 private proof: one owner-funded/iu);
  assert.match(publicText, /One job in/iu);
  assert.match(publicText, /Public API callable: yes/iu);
  assert.match(publicText, /x402 owner-funded proof: settled outcomes are reported per product/iu);
  assert.match(publicText, /no customer revenue or demand claimed/iu);

  const machineFiles = [
    'llms.txt',
    'openapi.yaml',
    'openapi.json',
    '.well-known/clervo.json',
    '.well-known/mcp.json',
    'catalog.json',
    'capabilities.json',
    'pricing.json',
    'status.json',
    '.well-known/security.txt',
    'robots.txt',
    'sitemap.xml',
  ];
  await Promise.all(machineFiles.map((file) => read(`apps/site/dist/${file}`)));
});
