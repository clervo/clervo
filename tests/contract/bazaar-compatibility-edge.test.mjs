import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../../apps/worker/src/api-edge.js';
import { normalizeAnthropicMessagesRequest } from '../../apps/api/src/anthropic-messages-compat.mjs';
import { normalizeOpenAiChatCompletionRequest } from '../../apps/api/src/openai-chat-compat.mjs';
import {
  createOpenAiResponsesDiscoveryContract,
  normalizeOpenAiResponsesRequest,
} from '../../apps/api/src/openai-responses-compat.mjs';

const env = Object.freeze({
  CLERVO_AI_PUBLIC_ENABLED: 'true',
  CLERVO_SANDBOX_PUBLIC_ENABLED: 'true',
  CLERVO_PREDICTION_PUBLIC_ENABLED: 'true',
  CLERVO_CRYPTO_PUBLIC_ENABLED: 'true',
  CLERVO_EDGE_AUTHORIZATION: 'edge-authorization-at-least-32-characters',
});

function request(pathname, body) {
  return new Request(`https://api.clervo.dev${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': '127.0.0.1',
    },
    body: JSON.stringify(body),
  });
}

test('vendor model names resolve before the canonical AI catalog lookup', () => {
  assert.equal(
    normalizeOpenAiChatCompletionRequest({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 5,
    }).model,
    'clervo/gpt-5.6-luna',
  );

  assert.equal(
    normalizeAnthropicMessagesRequest({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'hi' }],
    }).model,
    'clervo/claude-sonnet-4-6',
  );

  assert.equal(
    normalizeOpenAiResponsesRequest({
      model: 'gpt-4o',
      input: 'hi',
      max_output_tokens: 5,
    }).model,
    'clervo/gpt-5.6-luna',
  );
});

test('Responses defaults store to false and does not require it in discovery', () => {
  const contract = createOpenAiResponsesDiscoveryContract({
    model: 'gpt-4o',
    input: 'hi',
    max_output_tokens: 5,
  });

  assert.equal(contract.input.store, false);
  assert.deepEqual(contract.inputSchema.required, ['model', 'input']);
  assert.equal(contract.inputSchema.properties.store.const, false);

  assert.throws(
    () => normalizeOpenAiResponsesRequest({
      model: 'gpt-4o',
      input: 'hi',
      max_output_tokens: 5,
      store: true,
    }),
    /openai_responses_storage_unsupported/u,
  );
});

test('public edge exposes the three agent discovery aliases', async () => {
  const mcp = await worker.fetch(new Request('https://api.clervo.dev/.well-known/mcp/server.json'), env);
  assert.equal(mcp.status, 200);
  assert.match(mcp.headers.get('content-type') ?? '', /^application\/json/iu);

  const agent = await worker.fetch(new Request('https://api.clervo.dev/.well-known/agent.json'), env);
  assert.equal(agent.status, 200);
  assert.match(agent.headers.get('content-type') ?? '', /^application\/json/iu);

  const agents = await worker.fetch(new Request('https://api.clervo.dev/agents.txt'), env);
  assert.equal(agents.status, 200);
  assert.match(agents.headers.get('content-type') ?? '', /^text\/plain/iu);
  assert.ok((await agents.text()).length > 0);
});

test('Bazaar-style compatibility probes are normalized before the origin sees them', async (context) => {
  const forwarded = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (upstreamRequest) => {
    forwarded.push({
      pathname: new URL(upstreamRequest.url).pathname,
      body: await upstreamRequest.json(),
    });
    return new Response(JSON.stringify({ x402Version: 2 }), {
      status: 402,
      headers: {
        'content-type': 'application/json',
        'payment-required': 'test-challenge',
      },
    });
  };
  context.after(() => { globalThis.fetch = originalFetch; });

  const chat = await worker.fetch(request('/v1/chat/completions', {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 5,
  }), env);
  assert.equal(chat.status, 402);

  const messages = await worker.fetch(request('/v1/messages', {
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 5,
    messages: [{ role: 'user', content: 'hi' }],
  }), env);
  assert.equal(messages.status, 402);

  const responses = await worker.fetch(request('/v1/responses', {
    model: 'gpt-4o',
    input: 'hi',
    max_output_tokens: 5,
  }), env);
  assert.equal(responses.status, 402);

  assert.deepEqual(forwarded, [
    {
      pathname: '/v1/chat/completions',
      body: {
        model: 'clervo/gpt-5.6-luna',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      },
    },
    {
      pathname: '/v1/messages',
      body: {
        model: 'clervo/claude-sonnet-4-6',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }],
      },
    },
    {
      pathname: '/v1/responses',
      body: {
        model: 'clervo/gpt-5.6-luna',
        input: 'hi',
        max_output_tokens: 5,
        store: false,
      },
    },
  ]);
});
