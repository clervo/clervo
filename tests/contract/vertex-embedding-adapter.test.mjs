import assert from 'node:assert/strict';
import test from 'node:test';
import { VertexEmbeddingAdapter } from '../../dist/adapters/ai/src/vertex-embedding.js';
import { AI_EXECUTION_REQUEST_SCHEMA_VERSION, CONTRACT_VERSION } from '../../dist/packages/contracts/src/index.js';

const inputs = ['payment retry safety', 'garden sunlight'];

function request(overrides = {}) {
  return {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_EXECUTION_REQUEST_SCHEMA_VERSION,
    operationId: 'op_01K0VERTEXEMBEDDING00001',
    productId: 'ai.embed',
    requestedModel: 'gemini-embedding-001',
    input: { kind: 'embedding', inputs, dimensions: 3 },
    usageBounds: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: 0 },
    maximumSupplierCost: { asset: 'USD', amountAtomic: '100000', decimals: 6 },
    deadlineAt: '2026-08-02T04:00:00.000Z',
    ...overrides,
  };
}

function adapter(inspect = () => {}, mutate = (value) => value) {
  let call = 0;
  return new VertexEmbeddingAdapter({
    config: { routeId: 'ai.route.gemini_embedding_001', projectId: 'clervo-test-project', location: 'us-central1', exactModelId: 'gemini-embedding-001', maximumResponseBytes: 1_000_000 },
    transport: { async request(input) { inspect(input, call); const body = mutate({ predictions: [{ embeddings: { values: call++ === 0 ? [0.1, 0.2, 0.3] : [0.4, 0.5, 0.6], statistics: { token_count: 4, truncated: false } } }] }); return { status: 200, contentType: 'application/json', body: new TextEncoder().encode(JSON.stringify(body)) }; } },
    accessToken: async () => 'opaque-vertex-token',
    clock: () => '2026-08-02T03:20:00.000Z',
  });
}

test('Vertex embedding uses a fixed publisher endpoint, disables truncation, preserves order, and reports native usage', async () => {
  const seen = [];
  const result = await adapter((input) => seen.push(input)).execute({ request: request(), exactModelId: 'gemini-embedding-001', signal: AbortSignal.timeout(1_000) });
  assert.equal(seen.length, 2);
  assert.ok(seen.every(({ url }) => new URL(url).hostname === 'us-central1-aiplatform.googleapis.com' && url.endsWith('/gemini-embedding-001:predict')));
  assert.deepEqual(seen.map(({ body }) => JSON.parse(new TextDecoder().decode(body))), inputs.map((content) => ({ instances: [{ content }], parameters: { autoTruncate: false, outputDimensionality: 3 } })));
  assert.equal(result.modelIdentity, 'gemini-embedding-001');
  assert.deepEqual(result.usage, { inputTokens: 8, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: 0, videoSeconds: 0, musicGenerations: 0, virtualTryOnImages: 0 });
  assert.deepEqual(result.output.vectors, [{ index: 0, embedding: [0.1, 0.2, 0.3] }, { index: 1, embedding: [0.4, 0.5, 0.6] }]);
});

test('Vertex embedding rejects unsupported dimensions, truncation, substitution, and credential leakage', async () => {
  await assert.rejects(adapter().execute({ request: request({ input: { kind: 'embedding', inputs, dimensions: 3073 } }), exactModelId: 'gemini-embedding-001', signal: AbortSignal.timeout(1_000) }), /dimensions_invalid/u);
  await assert.rejects(adapter(() => {}, (body) => { body.predictions[0].embeddings.statistics.truncated = true; return body; }).execute({ request: request(), exactModelId: 'gemini-embedding-001', signal: AbortSignal.timeout(1_000) }), /usage_invalid/u);
  await assert.rejects(adapter().execute({ request: request(), exactModelId: 'substitute-model', signal: AbortSignal.timeout(1_000) }), /request_binding_invalid/u);
  const failing = new VertexEmbeddingAdapter({ config: { routeId: 'ai.route.gemini_embedding_001', projectId: 'clervo-test-project', location: 'us-central1', exactModelId: 'gemini-embedding-001', maximumResponseBytes: 1_000_000 }, transport: { async request() { throw new Error('not reached'); } }, accessToken: async () => { throw new Error('credential-that-must-not-escape'); } });
  await assert.rejects(failing.execute({ request: request(), exactModelId: 'gemini-embedding-001', signal: AbortSignal.timeout(1_000) }), (error) => error.message === 'vertex_embedding_credential_unavailable' && !error.message.includes('credential-that'));
});
