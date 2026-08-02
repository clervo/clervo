import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { SandboxArtifactService } from '../../dist/services/sandbox/src/artifacts.js';

const tenantId = 'tenant_0123456789ABCDEFGHIJ'; const sessionId = 'sbx_0123456789ABCDEFGHIJ'; const executionId = 'exec_0123456789ABCDEFGHIJ';
const bytes = new TextEncoder().encode('bounded sandbox output'); const hex = createHash('sha256').update(bytes).digest('hex');

function dependencies(scannerOverride = {}) {
  const calls = []; const objects = new Map();
  const store = {
    async put(tenant, value) { calls.push(['put', tenant]); objects.set(`${tenant}:${hex}`, new Uint8Array(value)); return { artifactUri: `artifact://generated/${tenant}/${hex}`, sha256: `sha256:${hex}` }; },
    async get(tenant, digest) { calls.push(['get', tenant]); const value = objects.get(`${tenant}:${digest}`); if (!value) throw new Error('missing'); return new Uint8Array(value); },
    async delete(tenant, digest) { calls.push(['delete', tenant]); objects.delete(`${tenant}:${digest}`); },
  };
  const scanner = { async scan(input) { calls.push(['scan', input.filename]); return { verdict: 'clean', detectedMimeType: input.declaredMimeType, findings: [], scannerVersion: 'test-scanner/1' }; }, ...scannerOverride };
  return { calls, store, scanner };
}

test('sandbox artifacts are scanned before tenant-scoped content-addressed storage and verified on read', async () => {
  const deps = dependencies(); const service = new SandboxArtifactService(deps.store, deps.scanner, 1024, 4096);
  const descriptor = await service.publish({ tenantId, sessionId, executionId, filename: 'result.txt', mimeType: 'text/plain', bytes });
  assert.deepEqual(deps.calls.map(([name]) => name), ['scan', 'put']);
  assert.equal(descriptor.sha256, `sha256:${hex}`); assert.equal(descriptor.artifactUri, `artifact://generated/${tenantId}/${hex}`); assert.equal(descriptor.scan.verdict, 'clean');
  const downloaded = await service.get(tenantId, descriptor.artifactId); assert.deepEqual(downloaded.bytes, bytes); assert.equal(downloaded.descriptor.artifactId, descriptor.artifactId);
  await assert.rejects(service.get('tenant_ZYXWVUTSRQPONMLKJIHG', descriptor.artifactId), /not_found/u);
});

test('detected, unscannable, active, mismatched, oversized, and path-like artifacts fail closed before storage', async () => {
  for (const result of [
    { verdict: 'detected', detectedMimeType: 'text/plain', findings: ['malware'], scannerVersion: 'scanner/1' },
    { verdict: 'unscannable', detectedMimeType: 'text/plain', findings: [], scannerVersion: 'scanner/1' },
    { verdict: 'clean', detectedMimeType: 'application/octet-stream', findings: ['type_mismatch'], scannerVersion: 'scanner/1' },
  ]) {
    const deps = dependencies({ async scan() { return result; } }); const service = new SandboxArtifactService(deps.store, deps.scanner, 1024, 4096);
    await assert.rejects(service.publish({ tenantId, sessionId, executionId, filename: 'result.txt', mimeType: 'text/plain', bytes }), /quarantined/u);
    assert.equal(deps.calls.some(([name]) => name === 'put'), false);
  }
  const deps = dependencies(); const service = new SandboxArtifactService(deps.store, deps.scanner, 4, 8);
  await assert.rejects(service.publish({ tenantId, sessionId, executionId, filename: '../result.txt', mimeType: 'text/plain', bytes }), /filename_invalid/u);
  await assert.rejects(service.publish({ tenantId, sessionId, executionId, filename: 'result.html', mimeType: 'text/html', bytes }), /input_invalid/u);
  await assert.rejects(service.publish({ tenantId, sessionId, executionId, filename: 'result.txt', mimeType: 'text/plain', bytes }), /input_invalid/u);
});

test('artifact publication rejects a store that substitutes content identity', async () => {
  const deps = dependencies(); deps.store.put = async () => ({ artifactUri: `artifact://generated/${tenantId}/${'0'.repeat(64)}`, sha256: `sha256:${'0'.repeat(64)}` });
  const service = new SandboxArtifactService(deps.store, deps.scanner, 1024, 4096);
  await assert.rejects(service.publish({ tenantId, sessionId, executionId, filename: 'result.txt', mimeType: 'text/plain', bytes }), /storage_integrity_failed/u);
});
