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
  assert.equal(generated.distribution.publicApi.publicCallable, false);
  assert.equal(generated.distribution.publicApi.publicTraffic, false);
  assert.equal(generated.paymentProof.amountAtomic, proof.observedSettlement.customerChargeAtomic);
  assert.equal(generated.paymentProof.settlementConfirmed, true);
  assert.equal(generated.paymentProof.replaySameReceipt, true);
  assert.equal(generated.paymentProof.secondAuthorization, false);
  assert.equal(generated.paymentProof.secondExecution, false);
  assert.equal(generated.paymentProof.secondCharge, false);
  assert.equal(generated.paymentProof.revenueEvidence, false);
  assert.equal(generated.paymentProof.demandEvidence, false);
});

test('machine discovery separates installable clients from the unavailable customer API', async () => {
  const [discovery, status, pricing, capabilities, mcp, openapi, yaml] = await Promise.all([
    json('generated/public/.well-known/clervo.json'),
    json('generated/public/status.json'),
    json('generated/public/pricing.json'),
    json('generated/public/capabilities.json'),
    json('generated/public/.well-known/mcp.json'),
    json('generated/public/openapi.json'),
    json('generated/public/openapi.yaml'),
  ]);
  assert.equal(discovery.distribution.callable, false);
  assert.equal(discovery.payment.publicAvailable, false);
  assert.equal(discovery.payment.privateProofVerified, true);
  assert.equal(discovery.payment.commercialProof, false);
  assert.equal(status.packages.state, 'published_verified');
  assert.equal(status.publicApi.customerEndpointAvailable, false);
  assert.equal(pricing.publicOfferAvailable, false);
  assert.equal(pricing.publicPrice, null);
  assert.equal(capabilities.products.length, 6);
  assert.equal(mcp.name, '@clervo/mcp');
  assert.equal(mcp.publicApiAvailable, false);
  assert.equal(mcp.paymentSigningImplemented, false);
  assert.deepEqual(yaml, openapi);
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
  assert.match(publicText, /not publicly callable/iu);
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
