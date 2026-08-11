import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DeepgramSpeechAdapter } from '../../dist/adapters/ai/src/deepgram-speech.js';
import { AI_EXECUTION_REQUEST_SCHEMA_VERSION, CONTRACT_VERSION } from '../../dist/packages/contracts/src/index.js';

const phrase = 'Clervo speech is bounded.';
const bytes = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(60)]);
const hash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function request(overrides = {}) {
  return {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_EXECUTION_REQUEST_SCHEMA_VERSION,
    operationId: 'op_01K0DEEPGRAMSPEECH00001',
    productId: 'ai.speech',
    requestedModel: 'aura-2-thalia-en',
    input: { kind: 'speech', input: phrase, voice: 'aura-2-thalia-en', responseFormat: 'wav' },
    usageBounds: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: phrase.length },
    maximumSupplierCost: { asset: 'USD', amountAtomic: '100000', decimals: 6 },
    deadlineAt: '2026-08-02T04:00:00.000Z',
    ...overrides,
  };
}

function adapter(inspect = () => {}, responseOverrides = {}) {
  return new DeepgramSpeechAdapter({
    config: { routeId: 'ai.route.aura_2_thalia_en', exactModelId: 'aura-2-thalia-en', secretName: 'DEEPGRAM_API_KEY', maximumResponseBytes: 1_000_000 },
    transport: { async request(input) { inspect(input); return { status: 200, contentType: 'audio/wav', body: bytes, responseHeaders: { 'dg-model-name': 'aura-2-thalia-en', 'dg-char-count': String(phrase.length) }, ...responseOverrides }; } },
    secret: async () => 'opaque-deepgram-test-key',
    artifacts: { async put(input) { assert.deepEqual(Buffer.from(input.bytes), bytes); return { artifactUri: 'artifact://ai/speech/deepgram-0001', sha256: hash }; } },
    clock: () => '2026-08-02T03:10:00.000Z',
  });
}

test('Deepgram speech binds exact voice, opts out of model improvement, validates metadata, and stores hash-bound audio', async () => {
  let sent;
  const result = await adapter((input) => { sent = input; }).execute({ request: request(), exactModelId: 'aura-2-thalia-en', signal: AbortSignal.timeout(1_000) });
  const url = new URL(sent.url);
  assert.equal(url.origin, 'https://api.deepgram.com');
  assert.equal(url.pathname, '/v1/speak');
  assert.equal(url.searchParams.get('model'), 'aura-2-thalia-en');
  assert.equal(url.searchParams.get('mip_opt_out'), 'true');
  assert.equal(url.searchParams.get('encoding'), 'linear16');
  assert.equal(url.searchParams.get('container'), 'wav');
  assert.equal(sent.headers.authorization, 'Token opaque-deepgram-test-key');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(sent.body)), { text: phrase });
  assert.equal(result.modelIdentity, 'aura-2-thalia-en');
  assert.deepEqual(result.usage, { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: phrase.length, videoSeconds: 0, musicGenerations: 0, virtualTryOnImages: 0 });
  assert.deepEqual(result.output.artifact, { artifactUri: 'artifact://ai/speech/deepgram-0001', sha256: hash, mimeType: 'audio/wav', bytes: bytes.length });
});

test('Deepgram speech fails closed on voice substitution, metadata substitution, and credential errors', async () => {
  await assert.rejects(adapter().execute({ request: request({ input: { kind: 'speech', input: phrase, voice: 'aura-2-arcas-en', responseFormat: 'wav' } }), exactModelId: 'aura-2-thalia-en', signal: AbortSignal.timeout(1_000) }), /deepgram_voice_binding_invalid/u);
  await assert.rejects(adapter(() => {}, { responseHeaders: { 'dg-model-name': 'aura-2-arcas-en', 'dg-char-count': String(phrase.length) } }).execute({ request: request(), exactModelId: 'aura-2-thalia-en', signal: AbortSignal.timeout(1_000) }), /deepgram_response_invalid/u);
  const failing = new DeepgramSpeechAdapter({ config: { routeId: 'ai.route.aura_2_thalia_en', exactModelId: 'aura-2-thalia-en', secretName: 'DEEPGRAM_API_KEY', maximumResponseBytes: 1_000_000 }, transport: { async request() { throw new Error('not reached'); } }, secret: async () => { throw new Error('credential-that-must-not-escape'); }, artifacts: { async put() { throw new Error('not reached'); } } });
  await assert.rejects(failing.execute({ request: request(), exactModelId: 'aura-2-thalia-en', signal: AbortSignal.timeout(1_000) }), (error) => error.message === 'deepgram_credential_unavailable' && !error.message.includes('credential-that'));
});
