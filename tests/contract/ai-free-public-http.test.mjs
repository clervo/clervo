import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import { createDynamicAiProductionRuntime } from '../../apps/api/src/ai-dynamic-production-runtime.mjs';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';
import { InMemoryAiFreeTierQuotaStore } from '../../dist/services/ai/src/free-tier.js';
import { normalizeAiHttpRequest } from '../../dist/packages/contracts/src/index.js';

const observedAt = '2026-08-10T20:11:00.000Z';

test('one AI endpoint executes free models without payment and challenges paid models from the same catalog', async (context) => {
  let executions = 0;
  let challenges = 0;
  const discoveryChallenges = [];
  const runtime = await createDynamicAiProductionRuntime({
    env: { CLERVO_AI_BASE_URL: 'https://ai.clervo.dev/v1/', CLERVO_AI_GATEWAY_TOKEN: 'test-gateway-token' },
    clock: () => observedAt,
    fetcher: async (_url, init) => {
      executions += 1;
      const request = JSON.parse(new TextDecoder().decode(init.body));
      return new Response(JSON.stringify({
        model: request.model,
        choices: [{ message: { content: 'Free useful output.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 3 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    artifactStore: { async put() { return { artifactUri: 'artifact://test/unused-media', sha256: `sha256:${'0'.repeat(64)}` }; } },
  });
  const server = createSearchServer({
    executor: { async execute() { throw new Error('search_not_called'); } },
    now: () => observedAt,
    environment: 'test',
    releaseId: 'ai-free-http-test',
    edgeAuthorization: 'edge-authorization-at-least-32-characters',
    x402Service: {
      mode: 'settlement_enabled',
      async challenge({ quote, resourcePath, discovery }) {
        challenges += 1;
        if (discovery !== undefined) discoveryChallenges.push(discovery);
        return { status: 402, headers: { 'PAYMENT-REQUIRED': 'test' }, body: { accepts: [{ amount: quote.maximumCharge.amountAtomic }], resource: { url: `https://api.clervo.dev${resourcePath}` } } };
      },
      async authorize() { throw new Error('payment_not_expected'); },
      async settle() { throw new Error('settlement_not_expected'); },
    },
    x402StateStore: new InMemoryX402OperationStore({ environmentNamespace: 'ai_free_http' }),
    aiPublicPricing: runtime.publicPricing,
    aiAdapters: runtime.adapters,
    aiRuntimeBindings: runtime.runtimeBindings,
    aiFreeTier: {
      policy: { ...runtime.freeTierPolicy, perWalletDailyRequests: 1, globalDailyRequests: 10 },
      store: new InMemoryAiFreeTierQuotaStore(),
    },
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [alias, exact] of [['clervo/fast', 'clervo/gpt-5.6-luna'], ['clervo/smart', 'clervo/gpt-5.6-terra'], ['clervo/code', 'clervo/gpt-5.6-sol'], ['clervo/deep', 'clervo/gpt-5.6-sol']]) {
    const normalized = normalizeAiHttpRequest({ model: alias, input: { kind: 'chat', messages: [{ role: 'user', content: 'Alias contract' }], responseFormat: 'text', stream: false }, maximumOutputTokens: 16 });
    const quote = runtime.publicPricing.quote({ normalized, operationId: `op_${alias.slice('clervo/'.length).padEnd(32, '0')}`, now: observedAt });
    assert.equal(quote.decision.selectedExactModelId, exact);
  }
  const edgeHeaders = {
    'content-type': 'application/json',
    'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters',
    'x-clervo-quota-subject': `sha256:${'1'.repeat(64)}`,
  };
  const discoveryResponse = await fetch(`${origin}/v1/ai/execute`, {
    method: 'POST',
    headers: { 'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters' },
  });
  assert.equal(discoveryResponse.status, 402);
  assert.equal(discoveryChallenges.length, 1);
  const chunkedEmptyStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(`${origin}/v1/ai/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'transfer-encoding': 'chunked',
        'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters',
      },
    }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.end();
  });
  assert.equal(chunkedEmptyStatus, 402);
  assert.equal(discoveryChallenges.length, 2);
  const [declared] = discoveryChallenges;
  assert.equal(declared.method, 'POST');
  assert.equal(declared.bodyType, 'json');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  assert.equal(ajv.compile(declared.inputSchema)(declared.input), true);
  assert.equal(ajv.compile(declared.output.schema)(declared.output.example), true);
  assert.ok(runtime.productCatalog.publicModels.some(({ modelId, publicSellable, availability, billingMode, productIds }) => modelId === declared.input.model
    && publicSellable === true
    && availability === 'available'
    && billingMode === 'metered'
    && productIds.includes('ai.chat')));
  const freeBody = JSON.stringify({ model: 'clervo/gemma-4-26b-a4b-it', input: { kind: 'chat', messages: [{ role: 'user', content: 'Hello' }], responseFormat: 'text', stream: false }, maximumOutputTokens: 16 });

  const free = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers: edgeHeaders, body: freeBody });
  const freeText = await free.text();
  assert.equal(free.status, 200, freeText);
  const idempotencyKey = free.headers.get('idempotency-key');
  assert.match(idempotencyKey, /^srv\.free\./u);
  const freeResult = JSON.parse(freeText);
  assert.equal(freeResult.fundingMode, 'free');
  assert.equal(freeResult.result.output.content, 'Free useful output.');
  assert.equal(executions, 1);
  assert.equal(challenges, 2);

  const replay = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers: { ...edgeHeaders, 'idempotency-key': idempotencyKey }, body: freeBody });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).replayed, true);
  assert.equal(executions, 1);

  const quotaExceeded = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers: edgeHeaders, body: freeBody });
  assert.equal(quotaExceeded.status, 429);
  assert.equal((await quotaExceeded.json()).automaticPaidOverageAllowed, false);
  assert.equal(executions, 1);

  const paidBody = JSON.stringify({ model: 'clervo/gpt-5.6-luna', input: { kind: 'chat', messages: [{ role: 'user', content: 'Hello' }], responseFormat: 'text', stream: false }, maximumOutputTokens: 16 });
  const paid = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers: edgeHeaders, body: paidBody });
  assert.equal(paid.status, 402);
  assert.match(paid.headers.get('idempotency-key'), /^srv\.ai\./u);
  assert.ok(BigInt((await paid.json()).quote.maximumCharge.amountAtomic) > 0n);
  assert.equal(challenges, 3);
  assert.equal(executions, 1);

  const unknown = await fetch(`${origin}/v1/ai/execute`, {
    method: 'POST', headers: edgeHeaders,
    body: JSON.stringify({ model: 'clervo/model-that-does-not-exist', input: { kind: 'chat', messages: [{ role: 'user', content: 'Hello' }], responseFormat: 'text', stream: false }, maximumOutputTokens: 16 }),
  });
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).code, 'ai_model_not_found');
  const unavailableModel = runtime.productCatalog.publicModels.find(({ publicSellable, productIds }) => !publicSellable && productIds.includes('ai.chat'));
  assert.ok(unavailableModel);
  const unavailable = await fetch(`${origin}/v1/ai/execute`, {
    method: 'POST', headers: edgeHeaders,
    body: JSON.stringify({ model: unavailableModel.modelId, input: { kind: 'chat', messages: [{ role: 'user', content: 'Hello' }], responseFormat: 'text', stream: false }, maximumOutputTokens: 16 }),
  });
  assert.equal(unavailable.status, 422);
  assert.equal((await unavailable.json()).code, 'ai_model_unavailable');
  const malformed = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers: edgeHeaders, body: '{}' });
  assert.equal(malformed.status, 400);
  assert.equal(challenges, 3);
  assert.equal(executions, 1);

  const image = Buffer.from('bounded-test-image').toString('base64');
  const virtualTryOn = await fetch(`${origin}/v1/ai/execute`, {
    method: 'POST', headers: edgeHeaders,
    body: JSON.stringify({ model: 'clervo/virtual-try-on-001', input: { kind: 'virtual_try_on', personImageBase64: image, productImageBase64: image } }),
  });
  assert.equal(virtualTryOn.status, 402);
  assert.equal((await virtualTryOn.json()).quote.productId, 'ai.virtual_try_on');
  assert.equal(challenges, 4);
  assert.equal(executions, 1);
});
