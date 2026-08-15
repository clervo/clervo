import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { AI_MAXIMUM_AUTHORIZATION_USAGE_BOUNDS, AI_MAXIMUM_OUTPUT_TOKENS, estimateAiSupplierCost } from '../../dist/packages/contracts/src/index.js';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const json = async (file) => JSON.parse(await read(file));

test('machine discovery publishes every live public product and payment contract', async () => {
  const [discovery, status, pricing, capabilities, mcp, openapi, yaml, aiPricing] = await Promise.all([
    json('generated/public/.well-known/clervo.json'),
    json('generated/public/status.json'),
    json('generated/public/pricing.json'),
    json('generated/public/capabilities.json'),
    json('generated/public/.well-known/mcp.json'),
    json('generated/public/openapi.json'),
    json('generated/public/openapi.yaml'),
    json('packages/catalog/ai-b7-commercial-pricing.v1.json'),
  ]);
  assert.equal(discovery.distribution.callable, true);
  assert.equal(discovery.payment.publicAvailable, true);
  assert.deepEqual(discovery.payment.protocols, ['x402', 'mpp']);
  assert.equal(discovery.releaseScope, undefined);
  assert.equal(discovery.artifacts.claims, undefined);
  assert.ok(discovery.products.every(({ publicAvailable }) => publicAvailable));
  assert.equal(discovery.products.some(({ productId }) => productId === 'search.answer'), true);
  const ai = discovery.products.find(({ productId }) => productId === 'ai');
  assert.equal(ai.publicAvailable, true);
  assert.equal(ai.payment.payable, true);
  assert.deepEqual(ai.payment.paidModels, ['x402', 'mpp']);
  assert.equal(ai.pricing.model, 'authoritative_per_model_usage_pricing');
  assert.equal(ai.pricing.freeAndPaid, true);
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
  assert.equal(status.paymentProof, undefined);
  assert.equal(pricing.publicOfferAvailable, true);
  assert.equal(pricing.publicPrice.productId, 'search.web');
  assert.equal(pricing.publicPrice.amountAtomic, '6000');
  assert.equal(capabilities.products.length, 6);
  assert.equal(mcp.name, '@clervo/mcp');
  assert.equal(mcp.version, '0.5.2');
  assert.equal(mcp.publicApiAvailable, true);
  assert.deepEqual(mcp.configurationRequired, []);
  assert.deepEqual(mcp.configurationOptional, ['CLERVO_BASE_URL', 'CLERVO_HOME', 'CLERVO_AUTO_PAY']);
  assert.equal(mcp.paymentSigningImplemented, true);
  assert.deepEqual(yaml, openapi);
  assert.ok(openapi.paths['/v1/ai/execute']);
  assert.ok(openapi.paths['/v1/chat/completions']);
  assert.ok(openapi.paths['/v1/messages']);
  assert.ok(openapi.paths['/v1/responses']);
  assert.ok(openapi.paths['/v1/sandbox/execute']);
  assert.ok(openapi.paths['/v1/prediction/execute']);
  assert.equal(openapi.info.contact.url, 'https://github.com/clervo/clervo');
  assert.equal(openapi.info.contact.email, 'mo@clervo.dev');
  assert.match(openapi.info['x-guidance'], /same key.*without a second charge/iu);
  assert.deepEqual(openapi.paths['/v1/search/free'].post.security, []);
  assert.deepEqual(openapi.paths['/v1/models'].get.security, []);
  assert.deepEqual(openapi.paths['/v1/search/paid'].post['x-payment-info'], {
    price: { mode: 'fixed', currency: 'USD', amount: '0.006000' },
    protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
  });
  const maximumAiAtomic = aiPricing.models.filter(({ billingMode }) => billingMode === 'metered')
    .map(({ customerPricing }) => BigInt(estimateAiSupplierCost(AI_MAXIMUM_AUTHORIZATION_USAGE_BOUNDS, customerPricing).amountAtomic))
    .reduce((maximum, amount) => amount > maximum ? amount : maximum, 0n);
  const decimal = (amount) => `${String(amount).padStart(7, '0').slice(0, -6)}.${String(amount).padStart(7, '0').slice(-6)}`;
  assert.deepEqual(openapi.paths['/v1/ai/execute'].post['x-payment-info'], {
    price: { mode: 'dynamic', currency: 'USD', min: decimal(aiPricing.minimumBillableAtomic), max: decimal(maximumAiAtomic) },
    protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
  });
  const aiProbe = openapi.paths['/v1/ai/execute'].post.requestBody.content['application/json'];
  const models = await json('generated/public/models.json');
  assert.ok(models.data.some(({ id, clervo }) => id === aiProbe.example.model && clervo.publicSellable && clervo.billingMode === 'metered'));
  assert.equal(aiProbe.schema.properties.model.type, 'string');
  assert.equal(aiProbe.schema.properties.model.enum, undefined);
  assert.equal(aiProbe.schema.properties.model.default, undefined);
  assert.equal(aiProbe.schema.properties.maximumOutputTokens.maximum, AI_MAXIMUM_OUTPUT_TOKENS);
  assert.deepEqual(openapi.paths['/v1/sandbox/execute'].post['x-payment-info'], {
    price: { mode: 'dynamic', currency: 'USD', min: '0.010000', max: '0.060000' },
    protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
  });
  assert.deepEqual(openapi.paths['/v1/prediction/execute'].post['x-payment-info'], {
    price: { mode: 'dynamic', currency: 'USD', min: '0.002000', max: '0.003000' },
    protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
  });
  assert.equal(openapi.paths['/v1/search/paid'].post.requestBody.content['application/json'].example.synthesize, false);
  assert.deepEqual(openapi.paths['/v1/sandbox/execute'].post.requestBody.content['application/json'].example.command.slice(0, 2), ['node', '-e']);
  assert.equal(openapi.paths['/v1/prediction/execute'].post.requestBody.content['application/json'].example.kind, 'markets');
  assert.doesNotMatch(JSON.stringify(openapi.paths), /"\$ref"/u);
});

test('important site routes and discovery surfaces are built', async () => {
  const requiredPages = [
    'index.html',
    'start/index.html',
    'product/index.html',
    'research/index.html',
    'products/search/index.html',
    'products/ai/index.html',
    'products/sandbox/index.html',
    'products/rpc/index.html',
    'products/prediction/index.html',
    'products/crypto/index.html',
    'pricing/index.html',
    'docs/quickstart/index.html',
    'docs/receipts/index.html',
    'docs/replay/index.html',
    'docs/failures/index.html',
    'docs/x402/index.html',
    'docs/catalog/index.html',
    'docs/index.html',
    'operations/ai.execute/index.html',
    'security/index.html',
    'legal/index.html',
    'status/index.html',
    'changelog/index.html',
  ];
  const pages = await Promise.all(requiredPages.map((file) => read(`apps/site/dist/${file}`)));
  assert.ok(pages.every((html) => html.includes('rel="canonical"')));

  const machineFiles = [
    'llms.txt',
    'openapi.yaml',
    'openapi.json',
    '.well-known/clervo.json',
    '.well-known/agent.json',
    '.well-known/mcp.json',
    '.well-known/mcp/server.json',
    '.well-known/x402',
    'agents.txt',
    'v1/models',
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
