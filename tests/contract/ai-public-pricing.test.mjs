import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { normalizeAiHttpRequest } from '../../dist/packages/contracts/src/index.js';
import { createAiPublicPricing } from '../../apps/api/src/ai-public-pricing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const operationId = `op_${'a'.repeat(32)}`;
const now = '2026-08-04T05:00:00.000Z';

async function pricing() {
  return createAiPublicPricing({
    model: await read('packages/catalog/ai-model-catalog.v1.json'),
    gateway: await read('packages/catalog/ai-launch-pricing.v1.json'),
    credit: await read('packages/catalog/ai-credit-backed-pricing.v1.json'),
    speech: await read('packages/catalog/ai-speech-pricing.v1.json'),
    recurring: await read('packages/catalog/ai-free-tier-pricing.v1.json'),
    edge: await read('packages/catalog/ai-edge-free-pricing.v1.json'),
  });
}

test('public AI pricing resolves exact and alias routes into bounded USDC quotes', async () => {
  const publicPricing = await pricing();
  const cases = [
    { request: { model: 'gpt-5.6-luna', input: { kind: 'chat', messages: [{ role: 'user', content: 'Hello' }], responseFormat: 'text', stream: false }, maximumOutputTokens: 100 }, productId: 'ai.chat', exact: 'gpt-5.6-luna' },
    { request: { model: 'gemini-embedding-001', input: { kind: 'embedding', inputs: ['one', 'two'], dimensions: 64 } }, productId: 'ai.embed', exact: 'gemini-embedding-001' },
    { request: { model: 'gemini-3.1-flash-lite-image', input: { kind: 'image', prompt: 'A prism', size: '1024x1024', quality: 'low', count: 1 } }, productId: 'ai.image', exact: 'gemini-3.1-flash-lite-image' },
    { request: { model: 'aura-2-thalia-en', input: { kind: 'speech', input: 'Hello', voice: 'aura-2-thalia-en', responseFormat: 'mp3' } }, productId: 'ai.speech', exact: 'aura-2-thalia-en' },
  ];
  for (const value of cases) {
    const quote = publicPricing.quote({ normalized: normalizeAiHttpRequest(value.request), operationId, now });
    assert.equal(quote.decision.outcome, 'selected');
    assert.equal(quote.decision.selectedExactModelId, value.exact);
    assert.equal(quote.decision.productId, value.productId);
    assert.equal(quote.pricing.maximumCharge.asset, 'USDC');
    assert.ok(BigInt(quote.pricing.maximumCharge.amountAtomic) > 0n);
    assert.ok(BigInt(quote.pricing.supplierCost.amountAtomic) >= 0n);
  }
});

test('public AI pricing fails closed for expired, unpriced, wrong-modality, or unknown routes', async () => {
  const publicPricing = await pricing();
  const chat = (model) => normalizeAiHttpRequest({ model, input: { kind: 'chat', messages: [{ role: 'user', content: 'Hello' }], responseFormat: 'text', stream: false } });
  assert.throws(() => publicPricing.quote({ normalized: chat('not-a-model'), operationId, now }), /ai_route_unavailable/u);
  assert.throws(() => publicPricing.quote({ normalized: chat('gpt-5.6-luna'), operationId, now: '2026-08-10T00:00:00.000Z' }), /ai_route_unavailable/u);
  assert.throws(() => publicPricing.quote({ normalized: normalizeAiHttpRequest({ model: 'gpt-5.6-luna', input: { kind: 'embedding', inputs: ['wrong'] } }), operationId, now }), /ai_route_unavailable/u);
});
