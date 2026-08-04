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

test('machine discovery publishes verified Search and bounded paid AI without overstating proof', async () => {
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
  assert.equal(ai.publicAvailable, true);
  assert.equal(ai.payment.payable, true);
  assert.equal(ai.pricing.model, 'x402_request_quote');
  assert.equal(ai.pricing.displayPrice, null);
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
  assert.ok(openapi.paths['/v1/ai/execute']);
  assert.equal(openapi.info.contact.url, 'https://github.com/clervo/clervo');
  assert.match(openapi.info['x-guidance'], /same key.*without a second charge/iu);
  assert.deepEqual(openapi.paths['/v1/search/free'].post.security, []);
  assert.deepEqual(openapi.paths['/v1/search/paid'].post['x-payment-info'], {
    price: { mode: 'fixed', currency: 'USD', amount: '0.006000' },
    protocols: [{ x402: {} }],
  });
  assert.deepEqual(openapi.paths['/v1/ai/execute'].post['x-payment-info'], {
    price: { mode: 'dynamic', currency: 'USD', min: '0.000001', max: '2.621440' },
    protocols: [{ x402: {} }],
  });
  assert.equal(openapi.paths['/v1/search/paid'].post.requestBody.content['application/json'].example.synthesize, false);
  assert.equal(openapi.paths['/v1/ai/execute'].post.requestBody.content['application/json'].example.input.kind, 'chat');
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
  assert.match(publicText, /One job in/iu);
  assert.match(publicText, /Public API callable: yes/iu);
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
