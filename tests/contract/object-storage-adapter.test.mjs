import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { R2ObjectStore } from '../../dist/adapters/storage/src/r2-object-store.js';

const bytes = new TextEncoder().encode('synthetic artifact');
const digest = createHash('sha256').update(bytes).digest('hex');
const tenantId = 'tenant_0123456789ABCDEF';

function config(overrides = {}) {
  return {
    endpoint: 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/',
    bucket: 'clervo-artifacts-test',
    accessKeyId: 'test-access-identifier',
    secretAccessKey: 'test-secret-credential-material',
    maximumObjectBytes: 1024,
    maximumStoredBytesPerProcess: 2048,
    maximumWritesPerProcess: 2,
    maximumReadsPerProcess: 2,
    maximumDeletesPerProcess: 1,
    ...overrides,
  };
}

test('object storage uses tenant-scoped content addresses, signed fixed endpoints, and provider-neutral artifact URIs', async () => {
  const requests = [];
  const transport = async (request) => {
    requests.push(request);
    if (request.method === 'GET') return { status: 200, headers: {}, body: bytes };
    return { status: request.method === 'DELETE' ? 204 : 200, headers: {}, body: new Uint8Array() };
  };
  const store = new R2ObjectStore(config(), transport, () => new Date('2026-08-02T08:00:00.000Z'));
  const stored = await store.forAiTenant(tenantId).put({ bytes, mimeType: 'text/plain' });
  assert.deepEqual(stored, { artifactUri: `artifact://generated/${tenantId}/${digest}`, sha256: `sha256:${digest}` });
  assert.equal(requests[0].url.pathname, `/clervo-artifacts-test/tenants/${tenantId}/artifacts/sha256/${digest}`);
  assert.match(requests[0].headers.authorization, /^AWS4-HMAC-SHA256 Credential=test-access-identifier\/20260802\/auto\/s3\/aws4_request,/u);
  assert.equal(JSON.stringify(stored).includes('cloudflare'), false);
  assert.deepEqual(await store.get(tenantId, digest), bytes);
  await store.delete(tenantId, digest);
  assert.deepEqual(store.usage, { storedBytes: bytes.byteLength, writes: 1, reads: 1, deletes: 1 });
});

test('object storage rejects cross-tenant keys, integrity failures, redirects through transport, and budget overruns', async () => {
  assert.throws(() => new R2ObjectStore(config({ endpoint: 'https://example.com/' }), async () => { throw new Error('unused'); }), /endpoint_invalid/u);
  const store = new R2ObjectStore(config({ maximumWritesPerProcess: 1 }), async (request) => request.method === 'GET'
    ? { status: 200, headers: {}, body: new TextEncoder().encode('substituted') }
    : { status: 200, headers: {}, body: new Uint8Array() });
  await assert.rejects(store.get(tenantId, digest), /integrity_failed/u);
  await assert.rejects(store.get('tenant_wrong', digest), /identity_invalid/u);
  await store.put(tenantId, bytes, 'text/plain');
  await assert.rejects(store.put(tenantId, bytes, 'text/plain'), /write_budget_exhausted/u);
});
