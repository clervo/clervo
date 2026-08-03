import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createSandboxOperationResult } from '../../dist/packages/contracts/src/sandbox.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';

const apiToken = 'sandbox-api-token-0123456789ABCDEFGHIJ';
const tenantId = 'tenant_0123456789ABCDEFGHIJ';
const request = {
  contractVersion: '2026-07-29.1', schemaVersion: 'sandbox-operation-request.v1', operationId: 'op_0123456789ABCDEFGHIJ', productId: 'sandbox.run',
  input: { kind: 'run', executionId: 'exec_0123456789ABCDEFGHIJ', imageDigest: `sha256:${'7'.repeat(64)}`, command: ['node', '-e', 'process.stdout.write("ok")'], limits: { cpuMillis: 5000, memoryBytes: 268435456, processes: 64, diskBytes: 10485760, outputBytes: 65536, artifactBytes: 4096, wallTimeMs: 10000 } },
  maximumCharge: { asset: 'USD', amountAtomic: '1000', decimals: 6 }, deadlineAt: '2026-08-03T15:00:00.000Z',
};
const result = createSandboxOperationResult({ request, completedAt: '2026-08-03T14:00:00.000Z', meteredCharge: { asset: 'USD', amountAtomic: '0', decimals: 6 }, output: { kind: 'execution', sessionId: 'sbx_0123456789ABCDEFGHIJ', executionId: request.input.executionId, sessionState: 'destroyed', exitCode: 0, stdoutBase64: Buffer.from('ok').toString('base64'), stderrBase64: '', cpuMillis: 2, durationMs: 8, artifacts: [] } });

async function fixture(overrides = {}) {
  const calls = [];
  const gateway = {
    durable: true, async ready() { return true; },
    async run(input) { calls.push(input); return { result, replayed: false }; },
    ...overrides,
  };
  const server = createSearchServer({ executor: { async execute() { throw new Error('search_not_expected'); } }, environment: 'production', releaseId: 'release-test', sandboxGateway: gateway, sandboxApiToken: apiToken });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { gateway, calls, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

function invoke(origin, headers = {}, body = request) {
  return fetch(`${origin}/internal/v1/sandbox/run`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-clervo-tenant-id': tenantId, 'x-clervo-internal-authorization': `Bearer ${apiToken}`, ...headers }, body: JSON.stringify(body) });
}

test('private production API authenticates and forwards the Sandbox contract with replay state', async () => {
  const service = await fixture();
  try {
    const response = await invoke(service.origin); assert.equal(response.status, 200); assert.equal(response.headers.get('x-clervo-replay'), 'false'); assert.deepEqual(await response.json(), result);
    assert.equal(service.calls.length, 1); assert.equal(service.calls[0].tenantId, tenantId); assert.deepEqual(service.calls[0].request, request);
    const health = await fetch(`${service.origin}/v1/health`); const healthBody = await health.json(); assert.equal(healthBody.sandboxPrivateEnabled, true); assert.equal(healthBody.sandboxDurableState, true);
  } finally { await service.close(); }
});

test('private Sandbox API rejects missing auth before parsing or executing', async () => {
  const service = await fixture();
  try {
    const response = await invoke(service.origin, { 'x-clervo-internal-authorization': '' }, { secret: 'must-not-be-processed' });
    assert.equal(response.status, 401); assert.equal((await response.json()).code, 'sandbox_api_unauthorized'); assert.equal(service.calls.length, 0);
  } finally { await service.close(); }
});

test('private Sandbox API preserves conflict and unknown states without claiming success', async () => {
  const conflict = await fixture({ async run() { throw Object.assign(new Error('sandbox_idempotency_conflict'), { status: 409 }); } });
  try { const response = await invoke(conflict.origin); assert.equal(response.status, 409); assert.equal((await response.json()).code, 'sandbox_idempotency_conflict'); }
  finally { await conflict.close(); }
  const unknown = await fixture({ async run() { throw Object.assign(new Error('sandbox_execution_unknown'), { status: 503 }); } });
  try { const response = await invoke(unknown.origin); assert.equal(response.status, 503); assert.equal((await response.json()).code, 'sandbox_execution_unknown'); assert.equal(response.headers.get('retry-after'), '30'); }
  finally { await unknown.close(); }
});

test('production entrypoint keeps Sandbox disabled unless all durable private dependencies are configured', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile('apps/api/src/staging-search-main.mjs', 'utf8'));
  assert.match(source, /CLERVO_SANDBOX_MODE/u);
  assert.match(source, /sandbox requires PostgreSQL state/u);
  assert.match(source, /CLERVO_SANDBOX_CONTROL_ORIGIN/u);
  assert.match(source, /CLERVO_SANDBOX_CONTROL_TOKEN/u);
  assert.match(source, /CLERVO_SANDBOX_API_TOKEN/u);
});
