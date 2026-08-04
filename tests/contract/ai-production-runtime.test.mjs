import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeAiHttpRequest } from '../../dist/packages/contracts/src/index.js';
import { createAiProductionRuntime } from '../../apps/api/src/ai-production-runtime.mjs';

const env = Object.freeze({
  CLERVO_AI_ROUTE_FAMILIES: 'clervo_gateway,groq,cloudflare,vertex',
  CLERVO_AI_BASE_URL: 'https://ai.clervo.dev/v1/',
  CLERVO_AI_API_KEY: 'opaque-clervo-credential',
  GROQ_API_KEY: 'opaque-groq-credential',
  CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  CLOUDFLARE_AI_TOKEN: 'opaque-cloudflare-credential',
  CLERVO_VERTEX_PROJECT_ID: 'bloxsniper-prod',
});

test('production AI runtime builds only explicitly configured real adapter families without network access', async () => {
  let calls = 0;
  const runtime = await createAiProductionRuntime({ env, fetcher: async () => { calls += 1; throw new Error('metadata must stay lazy'); } });
  assert.equal(calls, 0);
  assert.deepEqual(runtime.families, ['clervo_gateway', 'groq', 'cloudflare', 'vertex']);
  assert.equal(runtime.adapters.length, 15);
  assert.equal(new Set(runtime.adapters.map(({ routeId }) => routeId)).size, runtime.adapters.length);
  const quote = runtime.publicPricing.quote({
    normalized: normalizeAiHttpRequest({ model: 'clervo/fast', input: { kind: 'chat', messages: [{ role: 'user', content: 'Production readiness' }], responseFormat: 'text', stream: false }, maximumOutputTokens: 100 }),
    operationId: `op_${'a'.repeat(32)}`,
    now: '2026-08-04T07:00:00.000Z',
  });
  assert.equal(quote.decision.outcome, 'selected');
  assert.ok(runtime.adapters.some(({ routeId }) => routeId === quote.decision.selectedRouteId));
});

test('production AI runtime fails startup for implicit, missing, or artifactless families', async () => {
  await assert.rejects(createAiProductionRuntime({ env: { ...env, CLERVO_AI_ROUTE_FAMILIES: '' } }), /families_required/u);
  await assert.rejects(createAiProductionRuntime({ env: { ...env, CLERVO_AI_ROUTE_FAMILIES: 'groq', GROQ_API_KEY: '' } }), /groq_api_key_invalid/u);
  await assert.rejects(createAiProductionRuntime({ env: { ...env, CLERVO_AI_ROUTE_FAMILIES: 'deepgram', DEEPGRAM_API_KEY: 'opaque-deepgram' } }), /artifact_store_required/u);
});

test('production AI runtime enables embedding, image, and speech only with payer-scoped artifact storage', async () => {
  const stores = [];
  const runtime = await createAiProductionRuntime({
    env: { ...env, CLERVO_AI_ROUTE_FAMILIES: `${env.CLERVO_AI_ROUTE_FAMILIES},deepgram`, DEEPGRAM_API_KEY: 'opaque-deepgram' },
    fetcher: async () => { throw new Error('network_not_expected'); },
    artifactStoreFactory(authorization) {
      const store = { payer: authorization.verification.payer, async put() { throw new Error('not_executed'); } };
      stores.push(store);
      return store;
    },
  });
  assert.equal(runtime.adapters.length, 15);
  assert.equal(typeof runtime.adapterFactory, 'function');
  const executionAdapters = runtime.adapterFactory({ verification: { payer: `0x${'b'.repeat(40)}` } });
  assert.equal(executionAdapters.length, 21);
  assert.equal(stores.length, 1);
  assert.equal(stores[0].payer, `0x${'b'.repeat(40)}`);
  assert.ok(executionAdapters.some(({ routeId }) => routeId === 'ai.route.gemini_embedding_001'));
  assert.ok(executionAdapters.some(({ routeId }) => routeId === 'ai.route.gemini_3_1_flash_lite_image'));
  assert.ok(executionAdapters.some(({ routeId }) => routeId === 'ai.route.cloudflare_aura_2_en'));
  assert.ok(executionAdapters.some(({ routeId }) => routeId === 'ai.route.aura_2_thalia_en'));

  for (const request of [
    { model: 'gemini-embedding-001', input: { kind: 'embedding', inputs: ['bounded embedding'] } },
    { model: 'gemini-3.1-flash-lite-image', input: { kind: 'image', prompt: 'A small cyan prism', size: '1024x1024', quality: 'low', count: 1 } },
    { model: 'aura-2-thalia-en', input: { kind: 'speech', input: 'Verified.', voice: 'thalia', responseFormat: 'mp3' } },
  ]) {
    const quote = runtime.publicPricing.quote({ normalized: normalizeAiHttpRequest(request), operationId: `op_${'c'.repeat(32)}`, now: '2026-08-04T07:00:00.000Z' });
    assert.equal(quote.decision.outcome, 'selected');
    assert.ok(BigInt(quote.pricing.maximumCharge.amountAtomic) > 0n);
  }
});
