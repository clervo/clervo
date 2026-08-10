import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { CONTRACT_VERSION, AI_EXECUTION_REQUEST_SCHEMA_VERSION } from '../../dist/packages/contracts/src/index.js';
import { createBoundedAiHttpTransport, OpenAiCompatibleAdapter } from '../../dist/adapters/ai/src/openai-compatible.js';

const deadlineAt = '2026-08-02T00:01:00.000Z';
const usageBounds = { inputTokens: 1000, cachedInputTokens: 100, outputTokens: 500, reasoningTokens: 100, images: 1, audioCharacters: 100 };

function request(productId, input, suffix) {
  return { contractVersion: CONTRACT_VERSION, schemaVersion: AI_EXECUTION_REQUEST_SCHEMA_VERSION, operationId: `op_01K0AIADAPTER${suffix}000001`, productId, requestedModel: `ai.route.${suffix.toLowerCase()}`, input, usageBounds, maximumSupplierCost: { asset: 'USD', amountAtomic: '1000000', decimals: 6 }, deadlineAt };
}

function response(value, contentType = 'application/json', status = 200) {
  const body = typeof value === 'string' ? new TextEncoder().encode(value) : new TextEncoder().encode(JSON.stringify(value));
  return { status, contentType, body };
}

function transport(result, capture = {}) {
  return { request: async (input) => { capture.value = input; return typeof result === 'function' ? result(input) : result; } };
}

function config(productId, suffix) {
  return { routeId: `ai.route.${suffix.toLowerCase()}`, baseUrl: 'https://api.example.test/openai/v1/', allowedHosts: ['api.example.test'], secretName: 'TEST_PROVIDER_API_KEY', exactModelId: `${suffix.toLowerCase()}-v1`, productId, maximumResponseBytes: 1_000_000 };
}

function adapter(productId, suffix, result, options = {}) {
  const capture = {};
  return {
    capture,
    value: new OpenAiCompatibleAdapter({
      config: config(productId, suffix),
      transport: transport(result, capture),
      secret: async () => 'opaque-test-credential',
      clock: () => '2026-08-02T00:00:01.000Z',
      ...options,
    }),
  };
}

test('OpenAI-compatible chat binds endpoint, credential, exact model, usage, and response shape', async () => {
  const { value, capture } = adapter('ai.chat', 'CHAT', response({ model: 'chat-v1', choices: [{ message: { role: 'assistant', content: 'Hello.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 1 } } }));
  const req = request('ai.chat', { kind: 'chat', messages: [{ role: 'user', content: 'Hello?' }], responseFormat: 'text', stream: false }, 'CHAT');
  const result = await value.execute({ request: req, exactModelId: 'chat-v1', signal: new AbortController().signal });
  assert.equal(capture.value.url, 'https://api.example.test/openai/v1/chat/completions');
  assert.equal(capture.value.headers.authorization, 'Bearer opaque-test-credential');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(capture.value.body)), { model: 'chat-v1', messages: req.input.messages, stream: false, max_completion_tokens: 600 });
  assert.deepEqual(result.usage, { inputTokens: 10, cachedInputTokens: 1, outputTokens: 2, reasoningTokens: 0, images: 0, audioCharacters: 0, videoSeconds: 0, musicGenerations: 0, virtualTryOnImages: 0 });
  assert.deepEqual(result.output, { kind: 'chat', content: 'Hello.', finishReason: 'stop' });
  assert.equal(JSON.stringify(result).includes('opaque-test-credential'), false);
});

test('OpenAI-compatible usage separates hidden reasoning from total completion tokens', async () => {
  const { value } = adapter('ai.chat', 'CHAT', response({ model: 'chat-v1', choices: [{ message: { role: 'assistant', content: 'Ready.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 14, completion_tokens_details: { reasoning_tokens: 12 } } }));
  const req = request('ai.chat', { kind: 'chat', messages: [{ role: 'user', content: 'Ready?' }], responseFormat: 'text', stream: false }, 'CHAT');
  const result = await value.execute({ request: req, exactModelId: 'chat-v1', signal: new AbortController().signal });
  assert.equal(result.usage.outputTokens, 2);
  assert.equal(result.usage.reasoningTokens, 12);
});

test('OpenAI-compatible chat applies bounded provider reasoning controls without exposing them to non-chat products', async () => {
  const capture = {};
  const value = new OpenAiCompatibleAdapter({
    config: { ...config('ai.chat', 'CHAT'), reasoningEffort: 'low', reasoningFormat: 'hidden' },
    transport: transport(response({ model: 'chat-v1', choices: [{ message: { role: 'assistant', content: '{}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), capture),
    secret: async () => 'opaque-test-credential',
  });
  const req = request('ai.chat', { kind: 'chat', messages: [{ role: 'user', content: 'Return JSON.' }], responseFormat: 'json_object', stream: false }, 'CHAT');
  await value.execute({ request: req, exactModelId: 'chat-v1', signal: new AbortController().signal });
  const payload = JSON.parse(new TextDecoder().decode(capture.value.body));
  assert.equal(payload.reasoning_effort, 'low');
  assert.equal(payload.reasoning_format, 'hidden');
  assert.equal(payload.max_completion_tokens, 600);
  assert.throws(() => new OpenAiCompatibleAdapter({ config: { ...config('ai.embed', 'EMBED'), reasoningEffort: 'low' }, transport: transport(response({})), secret: async () => 'credential' }), /config_invalid/u);
});

test('streaming chat is aggregated only with terminal usage and completion evidence', async () => {
  const stream = [
    'data: {"model":"chat-v1","choices":[{"delta":{"content":""},"finish_reason":null}]}',
    'data: {"model":"chat-v1","choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}',
    'data: {"model":"chat-v1","choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}',
    'data: {"model":"chat-v1","choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2}}',
    'data: [DONE]', '',
  ].join('\n');
  const { value, capture } = adapter('ai.chat', 'CHAT', response(stream, 'text/event-stream'));
  const req = request('ai.chat', { kind: 'chat', messages: [{ role: 'user', content: 'Hello?' }], responseFormat: 'text', stream: true }, 'CHAT');
  const result = await value.execute({ request: req, exactModelId: 'chat-v1', signal: new AbortController().signal });
  assert.equal(capture.value.headers.accept, 'text/event-stream');
  assert.equal(JSON.parse(new TextDecoder().decode(capture.value.body)).stream_options.include_usage, true);
  assert.deepEqual(result.output, { kind: 'chat', content: 'Hello', finishReason: 'stop' });
  assert.equal(result.usage.outputTokens, 2);
});

test('embeddings retain order and reject malformed numeric vectors', async () => {
  const req = request('ai.embed', { kind: 'embedding', inputs: ['one', 'two'], dimensions: 2 }, 'EMBED');
  const good = adapter('ai.embed', 'EMBED', response({ model: 'embed-v1', data: [{ index: 0, embedding: [0.1, 0.2] }, { index: 1, embedding: [0.3, 0.4] }], usage: { prompt_tokens: 3, total_tokens: 3 } })).value;
  const result = await good.execute({ request: req, exactModelId: 'embed-v1', signal: new AbortController().signal });
  assert.deepEqual(result.output.vectors.map(({ index }) => index), [0, 1]);
  const bad = adapter('ai.embed', 'EMBED', response({ model: 'embed-v1', data: [{ index: 0, embedding: [null] }, { index: 1, embedding: [0.3] }], usage: { prompt_tokens: 3 } })).value;
  await assert.rejects(() => bad.execute({ request: req, exactModelId: 'embed-v1', signal: new AbortController().signal }), /provider_response_invalid/u);
});

test('image and speech bytes enter only an integrity-checking artifact store', async () => {
  const stored = [];
  const artifacts = { put: async ({ bytes, mimeType }) => { const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`; stored.push({ bytes: [...bytes], mimeType, sha256 }); return { artifactUri: `artifact://ai/generated/${stored.length.toString().padStart(4, '0')}`, sha256 }; } };
  const imageBytes = new Uint8Array([137, 80, 78, 71]);
  const imageReq = request('ai.image', { kind: 'image', prompt: 'A prism', size: '1024x1024', quality: 'low', count: 1 }, 'IMAGE');
  const imageAdapter = adapter('ai.image', 'IMAGE', response({ model: 'image-v1', data: [{ b64_json: Buffer.from(imageBytes).toString('base64'), mime_type: 'image/png' }], usage: { input_tokens: 2, output_tokens: 0 } }), { artifacts }).value;
  const image = await imageAdapter.execute({ request: imageReq, exactModelId: 'image-v1', signal: new AbortController().signal });
  assert.equal(image.output.artifacts[0].artifactUri, 'artifact://ai/generated/0001');
  assert.deepEqual(stored[0].bytes, [...imageBytes]);

  const speechBytes = new Uint8Array([1, 2, 3, 4]);
  const speechReq = request('ai.speech', { kind: 'speech', input: 'Hello.', voice: 'neutral', responseFormat: 'mp3' }, 'SPEECH');
  const speechAdapter = adapter('ai.speech', 'SPEECH', { status: 200, contentType: 'audio/mpeg', body: speechBytes }, { artifacts }).value;
  const speech = await speechAdapter.execute({ request: speechReq, exactModelId: 'speech-v1', signal: new AbortController().signal });
  assert.equal(speech.output.artifact.bytes, 4);
  assert.equal(speech.usage.audioCharacters, 6);
});

test('unsafe endpoints, wrong media, oversized bodies, and transport errors fail with fixed safe codes', async () => {
  assert.throws(() => new OpenAiCompatibleAdapter({ config: { ...config('ai.chat', 'CHAT'), baseUrl: 'http://127.0.0.1/' }, transport: transport(response({})), secret: async () => 'credential' }), /base_url_invalid/u);
  const req = request('ai.chat', { kind: 'chat', messages: [{ role: 'user', content: 'Hello?' }], responseFormat: 'text', stream: false }, 'CHAT');
  const wrongMedia = adapter('ai.chat', 'CHAT', response('{}', 'text/html')).value;
  await assert.rejects(() => wrongMedia.execute({ request: req, exactModelId: 'chat-v1', signal: new AbortController().signal }), /content_type_invalid/u);
  const failedTransport = new OpenAiCompatibleAdapter({ config: config('ai.chat', 'CHAT'), transport: { request: async () => { throw new Error('opaque-test-credential'); } }, secret: async () => 'opaque-test-credential' });
  await assert.rejects(() => failedTransport.execute({ request: req, exactModelId: 'chat-v1', signal: new AbortController().signal }), (error) => error.message === 'ai_provider_transport_failed' && !error.message.includes('credential'));
});

test('default transport disables redirects and enforces declared and streamed byte ceilings', async () => {
  let init;
  const bounded = createBoundedAiHttpTransport(async (_url, value) => {
    init = value;
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'application/json', 'content-length': '3' } });
  });
  const result = await bounded.request({ url: 'https://api.example.test/openai/v1/chat/completions', headers: {}, body: new Uint8Array([1]), signal: new AbortController().signal, maximumResponseBytes: 3 });
  assert.equal(init.redirect, 'error');
  assert.deepEqual([...result.body], [1, 2, 3]);
  const declared = createBoundedAiHttpTransport(async () => new Response(new Uint8Array([1]), { status: 200, headers: { 'content-length': '4' } }));
  await assert.rejects(() => declared.request({ url: 'https://api.example.test/', headers: {}, body: new Uint8Array(), signal: new AbortController().signal, maximumResponseBytes: 3 }), /too_large/u);
  const streamed = createBoundedAiHttpTransport(async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }));
  await assert.rejects(() => streamed.request({ url: 'https://api.example.test/', headers: {}, body: new Uint8Array(), signal: new AbortController().signal, maximumResponseBytes: 3 }), /too_large/u);
});
