import assert from 'node:assert/strict';
import test from 'node:test';
import { SandboxControlPlane } from '../../dist/services/sandbox/src/control-plane.js';

const sessionId = 'sbx_0123456789ABCDEFGHIJ';
const tenantId = 'tenant_0123456789ABCDEFGHIJ';
const executionId = 'exec_0123456789ABCDEFGHIJ';
const imageDigest = `sha256:${'a'.repeat(64)}`;
const limits = { cpuMillis: 1000, memoryBytes: 134217728, processes: 16, diskBytes: 10485760, outputBytes: 1024, artifactBytes: 4096, wallTimeMs: 2000, maximumChargeMicrousd: 1000 };
const images = { allows: (value) => value === imageDigest };

function executor(overrides = {}) {
  const calls = [];
  return { calls, async create(input) { calls.push(['create', input.sessionId]); return { runtimeClass: 'gvisor', dedicatedExecutionNodes: true, controlPlaneSeparated: true, networkDefaultDeny: true, serviceAccountTokenMounted: false, executionNodeSecrets: false, imageDigest, readOnlyRootFilesystem: true }; }, async execute(input) { calls.push(['execute', input.executionId]); return { exitCode: 0, stdout: new TextEncoder().encode('ok'), stderr: new Uint8Array(), cpuMillis: 10, durationMs: 20 }; }, async destroy(id) { calls.push(['destroy', id]); }, async list() { return []; }, ...overrides };
}

test('sandbox control plane accepts only attested bounded execution and replays without rerunning', async () => {
  const runtime = executor(); const plane = new SandboxControlPlane(runtime, () => 1000, images);
  await plane.create({ sessionId, tenantId, imageDigest, limits, ttlMs: 5000 });
  const first = await plane.execute({ sessionId, executionId, tenantId, command: ['node', 'main.js'], stdin: new Uint8Array() });
  const replay = await plane.execute({ sessionId, executionId, tenantId, command: ['node', 'main.js'], stdin: new Uint8Array() });
  assert.deepEqual(first, replay); assert.equal(runtime.calls.filter(([name]) => name === 'execute').length, 1); assert.equal(first.maximumChargeMicrousd, 1000);
  await assert.rejects(plane.execute({ sessionId, executionId, tenantId, command: ['substituted'], stdin: new Uint8Array() }), /idempotency_conflict/u);
  await plane.destroy(sessionId, tenantId); await plane.destroy(sessionId, tenantId); assert.equal(runtime.calls.filter(([name]) => name === 'destroy').length, 1);
});

test('sandbox rejects weak attestation and destroys a limit-breaching runtime', async () => {
  const weak = executor({ async create(input) { this.calls.push(['create', input.sessionId]); return { runtimeClass: 'gvisor', dedicatedExecutionNodes: true, controlPlaneSeparated: true, networkDefaultDeny: false, serviceAccountTokenMounted: false, executionNodeSecrets: false, imageDigest, readOnlyRootFilesystem: true }; } });
  await assert.rejects(new SandboxControlPlane(weak, Date.now, images).create({ sessionId, tenantId, imageDigest, limits, ttlMs: 5000 }), /runtime_unavailable/u);
  assert.equal(weak.calls.some(([name]) => name === 'destroy'), true);
  const flooding = executor({ async execute() { return { exitCode: 0, stdout: new Uint8Array(2048), stderr: new Uint8Array(), cpuMillis: 10, durationMs: 20 }; } });
  const plane = new SandboxControlPlane(flooding, Date.now, images); await plane.create({ sessionId, tenantId, imageDigest, limits, ttlMs: 5000 });
  await assert.rejects(plane.execute({ sessionId, executionId, tenantId, command: ['node'], stdin: new Uint8Array() }), /limit_breach/u);
  assert.equal(flooding.calls.some(([name]) => name === 'destroy'), true);
});

test('sandbox reaper destroys expired sessions and owned foreign orphans', async () => {
  let now = 0; const runtime = executor({ async list() { return ['sbx_FOREIGNORPHAN0123456789']; } }); const plane = new SandboxControlPlane(runtime, () => now, images);
  await plane.create({ sessionId, tenantId, imageDigest, limits, ttlMs: 1000 }); now = 1000;
  assert.deepEqual(await plane.reap(), { destroyed: 2, quarantined: 0, foreignOrphans: 0 });
  assert.equal(runtime.calls.some(([name, id]) => name === 'destroy' && id === 'sbx_FOREIGNORPHAN0123456789'), true);
});

test('sandbox rejects an unapproved image before touching the executor', async () => {
  const runtime = executor(); const plane = new SandboxControlPlane(runtime, Date.now, { allows: () => false });
  await assert.rejects(plane.create({ sessionId, tenantId, imageDigest, limits, ttlMs: 5000 }), /image_unavailable/u);
  assert.deepEqual(runtime.calls, []);
});
