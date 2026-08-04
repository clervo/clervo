import assert from 'node:assert/strict';
import test from 'node:test';

import { createAiArtifactRuntime } from '../../apps/api/src/ai-artifact-runtime.mjs';

const env = Object.freeze({
  R2_S3_ENDPOINT: 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/',
  R2_BUCKET_NAME: 'clervo-artifacts',
  R2_ACCESS_KEY_ID: 'test-access-key',
  R2_SECRET_ACCESS_KEY: 'test-secret-access-key-value',
  CLERVO_ARTIFACT_SIGNING_SECRET: 'test-signing-secret-at-least-thirty-two-bytes',
  CLERVO_PUBLIC_ORIGIN: 'https://api.clervo.dev/',
  CLERVO_ARTIFACT_RETENTION_SECONDS: '300',
});

function transportStore() {
  const objects = new Map();
  return {
    objects,
    async fetch(url, init) {
      const key = new URL(url).pathname;
      if (init.method === 'PUT') { objects.set(key, { bytes: new Uint8Array(init.body), mimeType: init.headers['content-type'] }); return new Response(null, { status: 200 }); }
      if (init.method === 'GET') {
        const value = objects.get(key);
        return value === undefined ? new Response(null, { status: 404 }) : new Response(value.bytes, { status: 200, headers: { 'content-type': value.mimeType } });
      }
      objects.delete(key); return new Response(null, { status: 204 });
    },
  };
}

test('AI artifacts are payer-isolated, signed, expiring, and integrity checked', async () => {
  const memory = transportStore();
  let clock = Date.parse('2026-08-04T05:00:00.000Z');
  const runtime = createAiArtifactRuntime({ env, fetcher: memory.fetch, now: () => clock });
  const artifact = await runtime.forAuthorization({ verification: { payer: `0x${'a'.repeat(40)}` } }).put({ bytes: new TextEncoder().encode('media'), mimeType: 'audio/mpeg' });
  assert.match(artifact.artifactUri, /^artifact:\/\/api\.clervo\.dev\/v1\/artifacts\/tenant_[a-f0-9]{32}\/[a-f0-9]{64}\/mp3\/[0-9]{10}\/[A-Za-z0-9_-]{43}$/u);
  const url = new URL(artifact.artifactUri);
  const retrieved = await runtime.retrieve(url.pathname);
  assert.equal(new TextDecoder().decode(retrieved.bytes), 'media');
  assert.equal(retrieved.mimeType, 'audio/mpeg');
  await assert.rejects(runtime.retrieve(`${url.pathname.slice(0, -1)}x`), /artifact_access_invalid/u);
  clock += 301_000;
  await assert.rejects(runtime.retrieve(url.pathname), /artifact_access_expired/u);
});

test('AI artifact runtime rejects missing payer identity and unsafe storage configuration', async () => {
  const memory = transportStore();
  const runtime = createAiArtifactRuntime({ env, fetcher: memory.fetch });
  assert.throws(() => runtime.forAuthorization({ verification: {} }), /payer_identity_invalid/u);
  assert.throws(() => createAiArtifactRuntime({ env: { ...env, R2_S3_ENDPOINT: 'https://localhost/' }, fetcher: memory.fetch }), /object_storage_endpoint_invalid/u);
});
