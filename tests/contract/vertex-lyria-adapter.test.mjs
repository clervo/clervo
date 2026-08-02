import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { VertexLyriaAdapter } from '../../dist/adapters/ai/src/vertex-lyria.js';

const wav = new Uint8Array([...Buffer.from('RIFF'), 36, 0, 0, 0, ...Buffer.from('WAVEfmt '), ...new Uint8Array(32)]);

function adapter(overrides = {}) {
  const capture = {};
  const value = new VertexLyriaAdapter({
    config: { projectId: 'clervo-test-project', exactModelId: 'lyria-002', location: 'us-central1', maximumResponseBytes: 8_000_000 },
    transport: { request: async (input) => { capture.request = input; return { status: 200, contentType: 'application/json', body: new TextEncoder().encode(JSON.stringify({ predictions: [{ bytesBase64Encoded: Buffer.from(wav).toString('base64') }] })) }; } },
    accessToken: async () => 'test-access-token',
    artifacts: { put: async ({ bytes }) => ({ artifactUri: 'artifact://generated/music/test-0001', sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }) },
    ...overrides,
  });
  return { value, capture };
}

test('Lyria adapter binds the exact endpoint, verifies WAV output, stores bytes, and returns no credential or raw payload', async () => {
  const { value, capture } = adapter();
  const result = await value.generate({ prompt: 'A calm instrumental cue.', negativePrompt: 'vocals', seed: 42, maximumSupplierCostMicrousd: 60_000, signal: new AbortController().signal });
  assert.match(capture.request.url, /\/models\/lyria-002:predict$/u);
  assert.equal(capture.request.headers.authorization, 'Bearer test-access-token');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(capture.request.body)), { instances: [{ prompt: 'A calm instrumental cue.', negative_prompt: 'vocals', seed: 42 }], parameters: {} });
  assert.deepEqual(result, { modelIdentity: 'lyria-002', durationSeconds: 30, instrumentalOnly: true, artifact: { artifactUri: 'artifact://generated/music/test-0001', sha256: `sha256:${createHash('sha256').update(wav).digest('hex')}`, mimeType: 'audio/wav', bytes: wav.byteLength }, supplierCostMicrousd: 60_000 });
  assert.equal(JSON.stringify(result).includes('test-access-token'), false);
  assert.equal(JSON.stringify(result).includes(Buffer.from(wav).toString('base64')), false);
});

test('Lyria adapter fails closed on cost, endpoint configuration, output shape, and transport errors', async () => {
  const { value } = adapter();
  await assert.rejects(value.generate({ prompt: 'Music', seed: 1, maximumSupplierCostMicrousd: 59_999, signal: new AbortController().signal }), /request_invalid/u);
  assert.throws(() => adapter({ config: { projectId: 'clervo-test-project', exactModelId: 'lyria-002', location: 'europe-west1', maximumResponseBytes: 8_000_000 } }), /configuration_invalid/u);
  const malformed = adapter({ transport: { request: async () => ({ status: 200, contentType: 'application/json', body: new TextEncoder().encode('{"predictions":[{"bytesBase64Encoded":"YQ=="}]}') }) } }).value;
  await assert.rejects(malformed.generate({ prompt: 'Music', seed: 1, maximumSupplierCostMicrousd: 60_000, signal: new AbortController().signal }), /audio_invalid/u);
});
