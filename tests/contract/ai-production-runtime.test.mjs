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
