import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { VertexGeminiAdapter } from '../../dist/adapters/ai/src/vertex-gemini.js';
import { AI_EXECUTION_REQUEST_SCHEMA_VERSION, CONTRACT_VERSION } from '../../dist/packages/contracts/src/index.js';

const zeroUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: 0, videoSeconds: 0, musicGenerations: 0, virtualTryOnImages: 0 };

function request(productId, requestedModel, input, usageBounds) {
  return {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_EXECUTION_REQUEST_SCHEMA_VERSION,
    operationId: 'op_01K0VERTEXGEMINIADAPTER01',
    productId,
    requestedModel,
    input,
    usageBounds,
    maximumSupplierCost: { asset: 'USD', amountAtomic: '1000000', decimals: 6 },
    deadlineAt: '2026-08-02T04:00:00.000Z',
  };
}

function transport(response, inspect = () => {}) {
  return {
    async request(input) {
      inspect(input);
      return { status: 200, contentType: 'application/json; charset=utf-8', body: new TextEncoder().encode(JSON.stringify(response)) };
    },
  };
}

function config(overrides = {}) {
  return {
    routeId: 'ai.route.gemini_3_6_flash',
    projectId: 'clervo-test-project',
    location: 'global',
    exactModelId: 'gemini-3.6-flash',
    productId: 'ai.chat',
    maximumResponseBytes: 5_000_000,
    ...overrides,
  };
}

test('Vertex chat binds the fixed endpoint, exact identity, JSON mode, and native usage', async () => {
  let payload;
  const adapter = new VertexGeminiAdapter({
    config: config(),
    transport: transport({
      modelVersion: 'gemini-3.6-flash',
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"answer":42}' }] } }],
      usageMetadata: { promptTokenCount: 7, cachedContentTokenCount: 2, candidatesTokenCount: 4, thoughtsTokenCount: 3 },
    }, (input) => {
      assert.equal(new URL(input.url).hostname, 'aiplatform.googleapis.com');
      assert.equal(input.headers.authorization, 'Bearer opaque-test-token');
      payload = JSON.parse(new TextDecoder().decode(input.body));
    }),
    accessToken: async () => 'opaque-test-token',
    clock: () => '2026-08-02T03:00:00.000Z',
  });
  const req = request('ai.chat', 'gemini-3.6-flash', { kind: 'chat', messages: [{ role: 'system', content: 'Be exact.' }, { role: 'user', content: 'Return 42.' }], responseFormat: 'json_object', stream: false }, { ...zeroUsage, inputTokens: 100, outputTokens: 100, reasoningTokens: 100 });
  const result = await adapter.execute({ request: req, exactModelId: 'gemini-3.6-flash', signal: AbortSignal.timeout(1_000) });
  assert.equal(result.modelIdentity, 'gemini-3.6-flash');
  assert.deepEqual(result.usage, { inputTokens: 7, cachedInputTokens: 2, outputTokens: 4, reasoningTokens: 3, images: 0, audioCharacters: 0, videoSeconds: 0, musicGenerations: 0, virtualTryOnImages: 0 });
  assert.deepEqual(result.output, { kind: 'chat', content: '{"answer":42}', finishReason: 'stop' });
  assert.equal(payload.generationConfig.responseMimeType, 'application/json');
  assert.equal(payload.systemInstruction.parts[0].text.includes('Be exact.'), true);
  assert.equal(Object.isFrozen(result), true);
});

test('Vertex image stores only hash-bound exact-size artifacts and accounts per image', async () => {
  const bytes = Buffer.alloc(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
  bytes.writeUInt32BE(1024, 16);
  bytes.writeUInt32BE(1024, 20);
  const hash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  let stored = 0;
  const adapter = new VertexGeminiAdapter({
    config: config({ routeId: 'ai.route.gemini_3_1_flash_lite_image', exactModelId: 'gemini-3.1-flash-lite-image', productId: 'ai.image' }),
    transport: transport({
      modelVersion: 'gemini-3.1-flash-lite-image',
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Created.' }, { inlineData: { mimeType: 'image/png', data: bytes.toString('base64') } }] } }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 1120 },
    }),
    accessToken: async () => 'opaque-test-token',
    artifacts: { async put(input) { stored += 1; assert.deepEqual(Buffer.from(input.bytes), bytes); return { artifactUri: 'artifact://ai/image/vertex-result-0001', sha256: hash }; } },
    clock: () => '2026-08-02T03:00:00.000Z',
  });
  const req = request('ai.image', 'gemini-3.1-flash-lite-image', { kind: 'image', prompt: 'A blue cube.', size: '1024x1024', quality: 'low', count: 1 }, { ...zeroUsage, inputTokens: 100, images: 1 });
  const result = await adapter.execute({ request: req, exactModelId: 'gemini-3.1-flash-lite-image', signal: AbortSignal.timeout(1_000) });
  assert.equal(stored, 1);
  assert.deepEqual(result.usage, { ...zeroUsage, inputTokens: 12, images: 1 });
  assert.deepEqual(result.output.artifacts[0], { artifactUri: 'artifact://ai/image/vertex-result-0001', sha256: hash, mimeType: 'image/png', width: 1024, height: 1024 });
});

test('unsupported image quality and identity substitution fail closed', async () => {
  const imageAdapter = new VertexGeminiAdapter({ config: config({ routeId: 'ai.route.gemini_image', exactModelId: 'gemini-image', productId: 'ai.image' }), transport: transport({}), accessToken: async () => 'opaque-test-token', artifacts: { async put() { throw new Error('not reached'); } } });
  const imageRequest = request('ai.image', 'gemini-image', { kind: 'image', prompt: 'A cube.', size: '1024x1024', quality: 'high', count: 1 }, { ...zeroUsage, inputTokens: 100, images: 1 });
  await assert.rejects(imageAdapter.execute({ request: imageRequest, exactModelId: 'gemini-image', signal: AbortSignal.timeout(1_000) }), /vertex_image_request_unsupported/);

  const chatAdapter = new VertexGeminiAdapter({ config: config(), transport: transport({}), accessToken: async () => 'credential-that-must-never-escape' });
  const chatRequest = request('ai.chat', 'gemini-3.6-flash', { kind: 'chat', messages: [{ role: 'user', content: 'Hello.' }], responseFormat: 'text', stream: false }, { ...zeroUsage, inputTokens: 10, outputTokens: 10 });
  await assert.rejects(chatAdapter.execute({ request: chatRequest, exactModelId: 'different-model', signal: AbortSignal.timeout(1_000) }), (error) => error.message === 'vertex_request_binding_invalid' && !error.message.includes('credential-that'));
});
