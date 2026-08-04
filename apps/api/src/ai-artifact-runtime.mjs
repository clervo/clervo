import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import {
  R2ObjectStore,
  createBoundedObjectStorageTransport,
} from '../../../dist/adapters/storage/src/r2-object-store.js';

const ARTIFACT_PATH_PREFIX = '/v1/artifacts/';
const DEFAULT_RETENTION_SECONDS = 604_800;
const MIME_CODES = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/wav': 'wav',
  'audio/pcm': 'pcm',
});
const MIME_TYPES = Object.freeze(Object.fromEntries(Object.entries(MIME_CODES).map(([mimeType, code]) => [code, mimeType])));

function required(env, name, minimum = 1) {
  const value = env[name];
  if (typeof value !== 'string' || value.length < minimum || value.length > 8_192 || /[\r\n]/u.test(value)) throw new TypeError(`ai_artifact_${name.toLowerCase()}_invalid`);
  return value;
}

function payerTenant(authorization) {
  const payer = authorization?.verification?.payer;
  if (!/^0x[a-fA-F0-9]{40}$/u.test(payer ?? '')) throw Object.assign(new Error('ai_artifact_payer_identity_invalid'), { status: 502 });
  return `tenant_${createHash('sha256').update(`ai:${payer.toLowerCase()}`).digest('hex').slice(0, 32)}`;
}

function signature(secret, value) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function sameSignature(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function integer(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new TypeError(`ai_artifact_${name}_invalid`);
  return parsed;
}

export function createAiArtifactRuntime({ env = process.env, fetcher = globalThis.fetch, now = () => Date.now() } = {}) {
  const endpoint = required(env, 'R2_S3_ENDPOINT');
  const bucket = required(env, 'R2_BUCKET_NAME');
  const accessKeyId = required(env, 'R2_ACCESS_KEY_ID');
  const secretAccessKey = required(env, 'R2_SECRET_ACCESS_KEY', 16);
  const signingSecret = required(env, 'CLERVO_ARTIFACT_SIGNING_SECRET', 32);
  const publicOrigin = new URL(required(env, 'CLERVO_PUBLIC_ORIGIN'));
  if (publicOrigin.protocol !== 'https:' || publicOrigin.pathname !== '/' || publicOrigin.search || publicOrigin.hash || publicOrigin.hostname === 'ai.clervo.dev') throw new TypeError('ai_artifact_public_origin_invalid');
  if (typeof fetcher !== 'function' || typeof now !== 'function') throw new TypeError('ai_artifact_runtime_invalid');
  const retentionSeconds = integer(env.CLERVO_ARTIFACT_RETENTION_SECONDS ?? DEFAULT_RETENTION_SECONDS, 'retention_seconds', 300, DEFAULT_RETENTION_SECONDS);
  const maximumObjectBytes = integer(env.CLERVO_ARTIFACT_MAXIMUM_OBJECT_BYTES ?? 20_000_000, 'maximum_object_bytes', 1_024, 20_000_000);
  const store = new R2ObjectStore({
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    maximumObjectBytes,
    maximumStoredBytesPerProcess: integer(env.CLERVO_ARTIFACT_PROCESS_BYTE_CEILING ?? 1_000_000_000, 'process_byte_ceiling', maximumObjectBytes, 10_000_000_000),
    maximumWritesPerProcess: integer(env.CLERVO_ARTIFACT_PROCESS_WRITE_CEILING ?? 1_000, 'process_write_ceiling', 1, 100_000),
    maximumReadsPerProcess: integer(env.CLERVO_ARTIFACT_PROCESS_READ_CEILING ?? 5_000, 'process_read_ceiling', 1, 500_000),
    maximumDeletesPerProcess: integer(env.CLERVO_ARTIFACT_PROCESS_DELETE_CEILING ?? 1_000, 'process_delete_ceiling', 1, 100_000),
  }, createBoundedObjectStorageTransport(fetcher));

  function accessMessage(tenantId, digest, mimeCode, expiresAt) {
    return `${tenantId}:${digest}:${mimeCode}:${expiresAt}`;
  }

  return Object.freeze({
    pathPrefix: ARTIFACT_PATH_PREFIX,
    forAuthorization(authorization) {
      const tenantId = payerTenant(authorization);
      return Object.freeze({
        async put({ bytes, mimeType }) {
          const mimeCode = MIME_CODES[mimeType];
          if (mimeCode === undefined) throw new TypeError('ai_artifact_mime_type_invalid');
          const stored = await store.put(tenantId, bytes, mimeType);
          const digest = stored.sha256.slice('sha256:'.length);
          const expiresAt = Math.floor(now() / 1_000) + retentionSeconds;
          const token = signature(signingSecret, accessMessage(tenantId, digest, mimeCode, expiresAt));
          return Object.freeze({
            sha256: stored.sha256,
            artifactUri: `artifact://${publicOrigin.host}${ARTIFACT_PATH_PREFIX}${tenantId}/${digest}/${mimeCode}/${expiresAt}/${token}`,
          });
        },
      });
    },
    matches(pathname) {
      return pathname.startsWith(ARTIFACT_PATH_PREFIX);
    },
    async retrieve(pathname, signal) {
      const match = /^\/v1\/artifacts\/(tenant_[A-Za-z0-9]{20,64})\/([a-f0-9]{64})\/([a-z0-9]{3,8})\/([1-9][0-9]{9})\/([A-Za-z0-9_-]{43})$/u.exec(pathname);
      if (match === null) throw Object.assign(new Error('artifact_access_invalid'), { status: 404 });
      const [, tenantId, digest, mimeCode, expiresText, token] = match;
      const mimeType = MIME_TYPES[mimeCode];
      if (mimeType === undefined) throw Object.assign(new Error('artifact_access_invalid'), { status: 404 });
      const expiresAt = Number(expiresText);
      if (!Number.isSafeInteger(expiresAt) || Math.floor(now() / 1_000) > expiresAt) throw Object.assign(new Error('artifact_access_expired'), { status: 410 });
      const expected = signature(signingSecret, accessMessage(tenantId, digest, mimeCode, expiresAt));
      if (!sameSignature(token, expected)) throw Object.assign(new Error('artifact_access_invalid'), { status: 404 });
      const bytes = await store.get(tenantId, digest, signal);
      return Object.freeze({ bytes, mimeType, sha256: `sha256:${digest}`, expiresAt: new Date(expiresAt * 1_000).toISOString() });
    },
  });
}
