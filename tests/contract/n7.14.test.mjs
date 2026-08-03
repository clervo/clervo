import assert from 'node:assert/strict';
import test from 'node:test';

import { createSandboxControlServer } from '../../apps/api/src/sandbox-control-main.mjs';

const token = 'sandbox-control-test-token-0123456789';
const tenantId = 'tenant_0123456789ABCDEFGHIJ';
const digest = `sha256:${'7'.repeat(64)}`;
const request = {
  contractVersion: '2026-07-29.1', schemaVersion: 'sandbox-operation-request.v1', operationId: 'op_0123456789ABCDEFGHIJ', productId: 'sandbox.run',
  input: { kind: 'run', executionId: 'exec_0123456789ABCDEFGHIJ', imageDigest: digest, command: ['node', '-e', 'process.stdout.write("ok")'], limits: { cpuMillis: 1000, memoryBytes: 134217728, processes: 16, diskBytes: 10485760, outputBytes: 1024, artifactBytes: 4096, wallTimeMs: 2000 } },
  maximumCharge: { asset: 'USD', amountAtomic: '1000', decimals: 6 }, deadlineAt: '2099-08-03T12:00:00.000Z',
};

function plane(overrides = {}) {
  const calls = [];
  return {
    calls,
    async create(input) { calls.push(['create', input]); },
    async execute(input) { calls.push(['execute', input]); return { sessionId: input.sessionId, executionId: input.executionId, exitCode: 0, stdout: new TextEncoder().encode('ok'), stderr: new Uint8Array(), cpuMillis: 4, durationMs: 8, maximumChargeMicrousd: 1000 }; },
    async destroy(sessionId, tenant) { calls.push(['destroy', sessionId, tenant]); },
    ...overrides,
  };
}

async function fixture(runtime = plane()) {
  const server = createSandboxControlServer({ token, plane: runtime, ready: async () => [] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const close = () => new Promise((resolve) => server.close(resolve));
  return { server, origin, close, runtime };
}

async function run(origin, value = request, authorization = `Bearer ${token}`) {
  return fetch(`${origin}/internal/v1/sandbox/run`, { method: 'POST', headers: { authorization, 'x-clervo-tenant-id': tenantId, 'content-type': 'application/json' }, body: JSON.stringify(value) });
}

test('private Sandbox control returns one contract result and replays without executing twice', async () => {
  const service = await fixture();
  try {
    const health = await fetch(`${service.origin}/healthz`); assert.equal(health.status, 200);
    const ready = await fetch(`${service.origin}/readyz`); assert.equal(ready.status, 200); assert.equal((await ready.json()).public, false);
    const first = await run(service.origin); assert.equal(first.status, 200); assert.equal(first.headers.get('x-clervo-replay'), 'false');
    const result = await first.json(); assert.equal(result.productId, 'sandbox.run'); assert.equal(result.output.sessionState, 'destroyed'); assert.equal(Buffer.from(result.output.stdoutBase64, 'base64').toString(), 'ok'); assert.equal(result.meteredCharge.amountAtomic, '0');
    const replay = await run(service.origin); assert.equal(replay.status, 200); assert.equal(replay.headers.get('x-clervo-replay'), 'true'); assert.deepEqual(await replay.json(), result);
    assert.equal(service.runtime.calls.filter(([name]) => name === 'execute').length, 1);
    assert.equal(service.runtime.calls.filter(([name]) => name === 'destroy').length, 1);
  } finally { await service.close(); }
});

test('private Sandbox control rejects missing authentication, substitution, and unavailable images before a result', async () => {
  const service = await fixture();
  try {
    assert.equal((await run(service.origin, request, 'Bearer wrong')).status, 401);
    assert.equal((await run(service.origin)).status, 200);
    const substitute = structuredClone(request); substitute.input.command = ['node', '-e', 'process.stdout.write("substituted")'];
    const conflict = await run(service.origin, substitute); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).code, 'sandbox_idempotency_conflict');
  } finally { await service.close(); }
  const unavailable = await fixture(plane({ async create() { throw new Error('sandbox_image_unavailable'); } }));
  try { const response = await run(unavailable.origin); assert.equal(response.status, 409); assert.equal((await response.json()).code, 'sandbox_image_unavailable'); }
  finally { await unavailable.close(); }
});

test('private Sandbox control exposes cleanup uncertainty instead of hiding it', async () => {
  const runtime = plane({
    async execute() { throw new Error('agent_sandbox_execute_failed'); },
    async destroy() { throw new Error('agent_sandbox_cleanup_unknown'); },
  });
  const service = await fixture(runtime);
  try { const response = await run(service.origin); assert.equal(response.status, 503); assert.equal((await response.json()).code, 'sandbox_cleanup_unknown'); }
  finally { await service.close(); }
});
