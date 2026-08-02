import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DeepgramTranscriptionAdapter } from '../../dist/adapters/ai/src/deepgram-transcription.js';

const audio = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(800)]);
const audioHash = `sha256:${createHash('sha256').update(audio).digest('hex')}`;
const response = Buffer.from(JSON.stringify({
  metadata: { duration: 3.25, model_info: { opaque: { name: 'general-nova-3', version: '2025-07-31.0' } } },
  results: { channels: [{ alternatives: [{ transcript: 'Clervo preserves every operation exactly once.', confidence: 0.997 }] }] },
}));

function request(overrides = {}) {
  return {
    operationId: 'op_01K0DEEPGRAMTRANSCRIBE001',
    exactModelId: 'nova-3',
    language: 'en-US',
    audio: { bytes: audio, mimeType: 'audio/wav', sha256: audioHash },
    maximumAudioSeconds: 60,
    signal: AbortSignal.timeout(1_000),
    ...overrides,
  };
}

function adapter(inspect = () => {}, responseOverrides = {}) {
  return new DeepgramTranscriptionAdapter({
    config: { routeId: 'ai.route.deepgram_nova_3_transcription', secretName: 'DEEPGRAM_API_KEY', maximumAudioBytes: 1_000_000, maximumResponseBytes: 100_000 },
    transport: { async request(input) { inspect(input); return { status: 200, contentType: 'application/json', body: response, ...responseOverrides }; } },
    secret: async () => 'opaque-deepgram-test-key',
    clock: () => '2026-08-02T08:20:00.000Z',
  });
}

test('Deepgram transcription binds Nova-3, opts out of model improvement, and returns measured usage', async () => {
  let sent;
  const result = await adapter((input) => { sent = input; }).execute(request());
  const url = new URL(sent.url);
  assert.equal(url.origin, 'https://api.deepgram.com');
  assert.equal(url.pathname, '/v1/listen');
  assert.equal(url.searchParams.get('model'), 'nova-3');
  assert.equal(url.searchParams.get('language'), 'en-US');
  assert.equal(url.searchParams.get('smart_format'), 'true');
  assert.equal(url.searchParams.get('mip_opt_out'), 'true');
  assert.equal(sent.headers.authorization, 'Token opaque-deepgram-test-key');
  assert.deepEqual(Buffer.from(sent.body), audio);
  assert.deepEqual(result, {
    operationId: 'op_01K0DEEPGRAMTRANSCRIBE001', exactModelId: 'nova-3', observedModelFamily: 'general-nova-3', observedModelVersion: '2025-07-31.0', completedAt: '2026-08-02T08:20:00.000Z', transcript: 'Clervo preserves every operation exactly once.', confidence: 0.997, usage: { audioSeconds: 3.25 },
  });
});

test('Deepgram transcription fails closed on corrupt audio, excess duration, identity substitution, and secrets', async () => {
  await assert.rejects(adapter().execute(request({ audio: { bytes: audio, mimeType: 'audio/wav', sha256: `sha256:${'0'.repeat(64)}` } })), /deepgram_transcription_audio_invalid/u);
  await assert.rejects(adapter().execute(request({ maximumAudioSeconds: 2 })), /deepgram_transcription_usage_invalid/u);
  const substituted = Buffer.from(JSON.stringify({ metadata: { duration: 3.25, model_info: { opaque: { name: 'general-nova-2', version: '1' } } }, results: { channels: [{ alternatives: [{ transcript: 'text', confidence: 0.9 }] }] } }));
  await assert.rejects(adapter(() => {}, { body: substituted }).execute(request()), /deepgram_transcription_identity_invalid/u);
  const failing = new DeepgramTranscriptionAdapter({ config: { routeId: 'ai.route.deepgram_nova_3_transcription', secretName: 'DEEPGRAM_API_KEY', maximumAudioBytes: 1_000_000, maximumResponseBytes: 100_000 }, transport: { async request() { throw new Error('not reached'); } }, secret: async () => { throw new Error('credential-that-must-not-escape'); } });
  await assert.rejects(failing.execute(request()), (error) => error.message === 'deepgram_transcription_credential_unavailable' && !error.message.includes('credential-that'));
});
