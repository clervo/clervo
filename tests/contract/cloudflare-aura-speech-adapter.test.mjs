import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { CloudflareAuraSpeechAdapter } from '../../dist/adapters/ai/src/cloudflare-aura-speech.js';
import { AI_EXECUTION_REQUEST_SCHEMA_VERSION, CONTRACT_VERSION } from '../../dist/packages/contracts/src/index.js';

const phrase = 'Clervo verifies every generated speech artifact.';
const audio = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(800)]);
const encoded = audio.toString('base64');
const envelope = Buffer.from(JSON.stringify({ success: true, result: { audio: encoded } }));
const hash = `sha256:${createHash('sha256').update(audio).digest('hex')}`;

function request(overrides = {}) {
  return {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_EXECUTION_REQUEST_SCHEMA_VERSION,
    operationId: 'op_01K0CLOUDFLAREAURA200001',
    productId: 'ai.speech',
    requestedModel: '@cf/deepgram/aura-2-en',
    input: { kind: 'speech', input: phrase, voice: 'thalia', responseFormat: 'mp3' },
    usageBounds: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: phrase.length },
    maximumSupplierCost: { asset: 'USD', amountAtomic: '100000', decimals: 6 },
    deadlineAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  };
}

function adapter(inspect = () => {}, responseOverrides = {}) {
  return new CloudflareAuraSpeechAdapter({
    config: { routeId: 'ai.route.cloudflare_aura_2_en', accountId: '0123456789abcdef0123456789abcdef', secretName: 'CLOUDFLARE_API_TOKEN', maximumResponseBytes: 1_000_000 },
    transport: { async request(input) { inspect(input); return { status: 200, contentType: 'application/json', body: envelope, ...responseOverrides }; } },
    secret: async () => 'opaque-cloudflare-test-token',
    artifacts: { async put(input) { assert.deepEqual(Buffer.from(input.bytes), audio); return { artifactUri: 'artifact://ai/speech/cloudflare-aura-0001', sha256: hash }; } },
    clock: () => '2026-08-02T08:00:00.000Z',
  });
}

test('Cloudflare Aura binds one immutable model endpoint and stores validated MP3 audio', async () => {
  let sent;
  const result = await adapter((input) => { sent = input; }).execute({ request: request(), exactModelId: '@cf/deepgram/aura-2-en', signal: AbortSignal.timeout(1_000) });
  const url = new URL(sent.url);
  assert.equal(url.origin, 'https://api.cloudflare.com');
  assert.equal(url.pathname, '/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/deepgram/aura-2-en');
  assert.equal(sent.headers.authorization, 'Bearer opaque-cloudflare-test-token');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(sent.body)), { text: phrase, speaker: 'thalia', encoding: 'mp3' });
  assert.equal(result.modelIdentity, '@cf/deepgram/aura-2-en');
  assert.deepEqual(result.usage, { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: phrase.length });
  assert.deepEqual(result.output.artifact, { artifactUri: 'artifact://ai/speech/cloudflare-aura-0001', sha256: hash, mimeType: 'audio/mpeg', bytes: audio.length });
});

test('Cloudflare Aura fails closed on model, voice, format, envelope, and secret errors', async () => {
  await assert.rejects(adapter().execute({ request: request(), exactModelId: '@cf/deepgram/aura-1', signal: AbortSignal.timeout(1_000) }), /cloudflare_aura_request_binding_invalid/u);
  await assert.rejects(adapter().execute({ request: request({ input: { kind: 'speech', input: phrase, voice: 'arcas', responseFormat: 'mp3' } }), exactModelId: '@cf/deepgram/aura-2-en', signal: AbortSignal.timeout(1_000) }), /cloudflare_aura_voice_or_format_invalid/u);
  await assert.rejects(adapter().execute({ request: request({ input: { kind: 'speech', input: phrase, voice: 'thalia', responseFormat: 'wav' } }), exactModelId: '@cf/deepgram/aura-2-en', signal: AbortSignal.timeout(1_000) }), /cloudflare_aura_voice_or_format_invalid/u);
  await assert.rejects(adapter(() => {}, { body: Buffer.from(JSON.stringify({ success: true, result: { audio: 'not-base64!' } })) }).execute({ request: request(), exactModelId: '@cf/deepgram/aura-2-en', signal: AbortSignal.timeout(1_000) }), /cloudflare_aura_response_invalid/u);
  const failing = new CloudflareAuraSpeechAdapter({ config: { routeId: 'ai.route.cloudflare_aura_2_en', accountId: '0123456789abcdef0123456789abcdef', secretName: 'CLOUDFLARE_API_TOKEN', maximumResponseBytes: 1_000_000 }, transport: { async request() { throw new Error('not reached'); } }, secret: async () => { throw new Error('credential-that-must-not-escape'); }, artifacts: { async put() { throw new Error('not reached'); } } });
  await assert.rejects(failing.execute({ request: request(), exactModelId: '@cf/deepgram/aura-2-en', signal: AbortSignal.timeout(1_000) }), (error) => error.message === 'cloudflare_aura_credential_unavailable' && !error.message.includes('credential-that'));
});
