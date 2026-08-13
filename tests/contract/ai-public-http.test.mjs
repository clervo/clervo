import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createAiPublicPricing } from '../../apps/api/src/ai-public-pricing.mjs';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const now = '2026-08-04T06:00:00.000Z';

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

test('public AI HTTP route is edge-protected, x402-bounded, useful, and replay-safe', async (context) => {
  const calls = { challenge: 0, authorize: 0, settle: 0, execute: 0 };
  const resourcePaths = [];
  const discoveries = [];
  const service = {
    mode: 'settlement_enabled',
    async challenge({ quote, resourcePath, discovery }) {
      calls.challenge += 1;
      resourcePaths.push(resourcePath);
      discoveries.push(discovery);
      return { status: 402, headers: { 'PAYMENT-REQUIRED': 'ai-http' }, body: { x402Version: 2, accepts: [{ amount: quote.maximumCharge.amountAtomic }], resource: { url: `https://api.clervo.dev${resourcePath}` } } };
    },
    async authorize() {
      calls.authorize += 1;
      return {
        fingerprint: `sha256:${calls.authorize.toString(16).padStart(64, '0')}`,
      };
    },
    async settle() { calls.settle += 1; return { kind: 'settled', headers: { 'PAYMENT-RESPONSE': 'ai-http-settled' }, settlement: { network: 'eip155:8453', transaction: `0x${'8'.repeat(64)}` } }; },
  };
  const server = createSearchServer({
    executor: { async execute() { throw new Error('search_not_called'); } },
    now: () => now,
    environment: 'test',
    releaseId: 'ai-http-test',
    edgeAuthorization: 'edge-authorization-at-least-32-characters',
    x402Service: service,
    x402StateStore: new InMemoryX402OperationStore({ environmentNamespace: 'ai_http' }),
    aiPublicPricing: await pricing(),
    aiAdapters: [{
      routeId: 'ai.route.gpt_5_6_luna',
      async execute({ exactModelId }) {
        calls.execute += 1;
        return { modelIdentity: exactModelId, completedAt: '2026-08-04T06:00:01.000Z', usage: { inputTokens: 2, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0, images: 0, audioCharacters: 0 }, output: { kind: 'chat', content: 'Useful output.', finishReason: 'stop' } };
      },
    }],
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const body = JSON.stringify({ model: 'gpt-5.6-luna', input: { kind: 'chat', messages: [{ role: 'user', content: 'Hello' }], responseFormat: 'text', stream: false }, maximumOutputTokens: 100 });
  const headers = { 'content-type': 'application/json', 'idempotency-key': 'idem_ai_http_001' };

  const denied = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers, body });
  assert.equal(denied.status, 401);
  const edgeOnly = { 'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters' };
  const aiProbe = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers: edgeOnly });
  assert.equal(aiProbe.status, 402);
  assert.equal((await aiProbe.json()).resource.url, 'https://api.clervo.dev/v1/ai/execute');
  const searchProbe = await fetch(`${origin}/v1/search/paid`, { method: 'POST', headers: edgeOnly });
  assert.equal(searchProbe.status, 402);
  assert.equal((await searchProbe.json()).accepts[0].amount, '6000');
  const authorized = { ...headers, 'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters' };
  const challenge = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers: authorized, body });
  assert.equal(challenge.status, 402);
  assert.equal(calls.execute, 0);
  const quote = await challenge.json();
  assert.equal(quote.quote.productId, 'ai.chat');

  const paid = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers: { ...authorized, 'payment-signature': 'opaque-payment' }, body });
  assert.equal(paid.status, 200);
  const result = await paid.json();
  assert.equal(result.result.output.content, 'Useful output.');
  assert.equal(result.exactModelId, 'gpt-5.6-luna');
  assert.equal(calls.execute, 1);

  const replay = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers: authorized, body });
  assert.equal(replay.status, 200);
  const replayed = await replay.json();
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.receipt.receiptId, result.receipt.receiptId);

  const compatibleBody = JSON.stringify({
    model: 'gpt-5.6-luna',
    messages: [{ role: 'user', content: 'Hello from an OpenAI client' }],
    stream: false,
    max_completion_tokens: 100,
  });
  const compatibleHeaders = {
    'content-type': 'application/json',
    'idempotency-key': 'idem_openai_chat_001',
    'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters',
  };

  const compatibleChallenge = await fetch(`${origin}/v1/chat/completions`, {
    method: 'POST',
    headers: compatibleHeaders,
    body: compatibleBody,
  });
  assert.equal(compatibleChallenge.status, 402);
  const compatibleQuote = await compatibleChallenge.json();
  assert.equal(compatibleQuote.resource.url, 'https://api.clervo.dev/v1/chat/completions');
  assert.equal(discoveries.at(-1).input.model, 'gpt-5.6-luna');
  assert.equal(discoveries.at(-1).input.messages[0].role, 'user');
  assert.equal(discoveries.at(-1).input.input, undefined);
  assert.equal(discoveries.at(-1).input.stream, false);
  assert.equal(discoveries.at(-1).output.example.object, 'chat.completion');

  const compatiblePaid = await fetch(`${origin}/v1/chat/completions`, {
    method: 'POST',
    headers: { ...compatibleHeaders, 'payment-signature': 'opaque-payment' },
    body: compatibleBody,
  });
  assert.equal(compatiblePaid.status, 200);
  const compatible = await compatiblePaid.json();
  assert.equal(compatible.object, 'chat.completion');
  assert.equal(compatible.model, 'gpt-5.6-luna');
  assert.equal(compatible.choices[0].message.role, 'assistant');
  assert.equal(compatible.choices[0].message.content, 'Useful output.');
  assert.equal(compatible.choices[0].finish_reason, 'stop');
  assert.equal(compatible.usage.prompt_tokens, 2);
  assert.equal(compatible.usage.completion_tokens, 1);
  assert.equal(compatible.usage.total_tokens, 3);

  const anthropicBody = JSON.stringify({
    model: 'gpt-5.6-luna',
    max_tokens: 100,
    system: 'Be concise.',
    messages: [
      {
        role: 'user',
        content: 'Hello from an Anthropic client',
      },
    ],
    stream: false,
  });
  const anthropicHeaders = {
    'content-type': 'application/json',
    'idempotency-key': 'idem_anthropic_messages_001',
    'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters',
    'anthropic-version': '2023-06-01',
  };

  const anthropicChallenge = await fetch(`${origin}/v1/messages`, {
    method: 'POST',
    headers: anthropicHeaders,
    body: anthropicBody,
  });
  assert.equal(anthropicChallenge.status, 402);
  const anthropicQuote = await anthropicChallenge.json();
  assert.equal(
    anthropicQuote.resource.url,
    'https://api.clervo.dev/v1/messages',
  );
  assert.equal(
    discoveries.at(-1).input.model,
    'gpt-5.6-luna',
  );
  assert.equal(
    discoveries.at(-1).input.max_tokens,
    100,
  );
  assert.equal(
    discoveries.at(-1).input.system,
    'Be concise.',
  );
  assert.equal(
    discoveries.at(-1).input.messages[0].role,
    'user',
  );
  assert.equal(
    discoveries.at(-1).output.example.type,
    'message',
  );

  const anthropicPaid = await fetch(`${origin}/v1/messages`, {
    method: 'POST',
    headers: {
      ...anthropicHeaders,
      'payment-signature': 'opaque-payment',
    },
    body: anthropicBody,
  });
  assert.equal(anthropicPaid.status, 200);

  const anthropic = await anthropicPaid.json();
  assert.equal(anthropic.type, 'message');
  assert.equal(anthropic.role, 'assistant');
  assert.equal(anthropic.model, 'gpt-5.6-luna');
  assert.equal(anthropic.content[0].type, 'text');
  assert.equal(
    anthropic.content[0].text,
    'Useful output.',
  );
  assert.equal(
    anthropic.stop_reason,
    'end_turn',
  );
  assert.equal(
    anthropic.stop_sequence,
    null,
  );
  assert.equal(
    anthropic.usage.input_tokens,
    2,
  );
  assert.equal(
    anthropic.usage.output_tokens,
    1,
  );

  const responsesBody = JSON.stringify({
    model: 'gpt-5.6-luna',
    instructions: 'Be concise.',
    input: 'Hello from an OpenAI Responses client',
    max_output_tokens: 100,
    stream: false,
    store: false,
    text: {
      format: {
        type: 'text',
      },
    },
  });

  const responsesHeaders = {
    'content-type': 'application/json',
    'idempotency-key': 'idem_openai_responses_001',
    'x-clervo-edge-authorization':
      'Bearer edge-authorization-at-least-32-characters',
  };

  const responsesChallenge = await fetch(
    `${origin}/v1/responses`,
    {
      method: 'POST',
      headers: responsesHeaders,
      body: responsesBody,
    },
  );

  assert.equal(responsesChallenge.status, 402);

  const responsesQuote = await responsesChallenge.json();

  assert.equal(
    responsesQuote.resource.url,
    'https://api.clervo.dev/v1/responses',
  );

  assert.equal(
    discoveries.at(-1).input.model,
    'gpt-5.6-luna',
  );

  assert.equal(
    discoveries.at(-1).input.input,
    'Hello from an OpenAI Responses client',
  );

  assert.equal(
    discoveries.at(-1).input.instructions,
    'Be concise.',
  );

  assert.equal(
    discoveries.at(-1).input.store,
    false,
  );

  assert.equal(
    discoveries.at(-1).output.example.object,
    'response',
  );

  const responsesPaid = await fetch(
    `${origin}/v1/responses`,
    {
      method: 'POST',
      headers: {
        ...responsesHeaders,
        'payment-signature': 'opaque-payment',
      },
      body: responsesBody,
    },
  );

  assert.equal(responsesPaid.status, 200);

  const responses = await responsesPaid.json();

  assert.match(responses.id, /^resp_/u);
  assert.equal(responses.object, 'response');
  assert.equal(responses.status, 'completed');
  assert.equal(responses.model, 'gpt-5.6-luna');
  assert.equal(responses.store, false);

  assert.equal(
    responses.output[0].type,
    'message',
  );

  assert.equal(
    responses.output[0].role,
    'assistant',
  );

  assert.equal(
    responses.output[0].content[0].type,
    'output_text',
  );

  assert.equal(
    responses.output[0].content[0].text,
    'Useful output.',
  );

  assert.equal(
    responses.text.format.type,
    'text',
  );

  assert.equal(
    responses.usage.input_tokens,
    2,
  );

  assert.equal(
    responses.usage.output_tokens,
    1,
  );

  assert.equal(
    responses.usage.total_tokens,
    3,
  );

  assert.deepEqual(resourcePaths, [
    '/v1/ai/execute',
    '/v1/search/paid',
    '/v1/ai/execute',
    '/v1/chat/completions',
    '/v1/messages',
    '/v1/responses',
  ]);
  assert.deepEqual(calls, {
    challenge: 6,
    authorize: 4,
    settle: 4,
    execute: 4,
  });
});
