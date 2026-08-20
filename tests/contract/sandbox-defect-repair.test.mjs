import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentSandboxExecutor } from '../../dist/adapters/sandbox/src/agent-sandbox.js';
import { KubernetesAgentSandboxTransport } from '../../dist/adapters/sandbox/src/kubernetes-client-transport.js';
import {
  SANDBOX_MAX_INLINE_INPUT_BYTES,
  SANDBOX_MAX_INLINE_PROGRAM_BYTES,
  SANDBOX_MAX_REQUEST_BYTES,
  assertSandboxOperationRequest,
} from '../../dist/packages/contracts/src/sandbox.js';
import { SandboxControlPlane } from '../../dist/services/sandbox/src/control-plane.js';
import { agentSandboxResourceName, buildAgentSandboxResources } from '../../dist/services/sandbox/src/kubernetes-manifest.js';
import { normalizeSandboxHttpRequest } from '../../apps/api/src/x402-paid-sandbox.mjs';

const sessionId = 'sbx_0123456789ABCDEFGHIJ';
const tenantId = 'tenant_0123456789ABCDEFGHIJ';
const executionId = 'exec_0123456789ABCDEFGHIJ';
const imageDigest = `sha256:${'a'.repeat(64)}`;
const imageRepository = 'us-central1-docker.pkg.dev/example/clervo-sandbox/runner';
const limits = { cpuMillis: 1_000, memoryBytes: 134_217_728, processes: 16, diskBytes: 10_485_760, outputBytes: 4_096, artifactBytes: 4_096, wallTimeMs: 2_000, maximumChargeMicrousd: 1_000 };

function notFound() { const error = new Error('not found'); error.code = 404; return error; }

function cluster({ claimDeleteFailures = 0, templateDeleteFailures = 0 } = {}) {
  const calls = []; const resources = new Map();
  const key = (resource) => `${resource.apiVersion}/${resource.kind}/${resource.metadata.namespace}/${resource.metadata.name}`;
  const [template, claim] = buildAgentSandboxResources({ sessionId, tenantId, imageRepository, imageDigest, limits });
  for (const resource of [template, claim]) {
    const stored = structuredClone(resource); stored.metadata.uid = `uid-${resource.kind.toLowerCase()}`; resources.set(key(stored), stored);
  }
  const pod = {
    apiVersion: 'v1', kind: 'Pod',
    metadata: { ...structuredClone(template.spec.podTemplate.metadata), name: agentSandboxResourceName(sessionId), namespace: 'clervo-sandbox-execution', uid: 'uid-runtime-pod' },
  };
  resources.set(key(pod), pod);
  let claimFailures = claimDeleteFailures; let templateFailures = templateDeleteFailures;
  const objects = {
    async create(resource) { const stored = structuredClone(resource); stored.metadata.uid = `uid-${resource.kind.toLowerCase()}`; resources.set(key(stored), stored); return stored; },
    async read(resource) { const found = resources.get(key(resource)); if (!found) throw notFound(); return structuredClone(found); },
    async list(apiVersion, kind) {
      calls.push(['list', kind]);
      return { items: [...resources.values()].filter((item) => item.apiVersion === apiVersion && item.kind === kind && item.metadata.labels?.['clervo.dev/owner'] === 'sandbox-control-plane').map((item) => structuredClone(item)) };
    },
    async delete(resource, ...options) {
      calls.push(['delete', resource.kind, options]);
      if (resource.kind === 'SandboxClaim' && claimFailures-- > 0) throw new Error('claim delete failed');
      if (resource.kind === 'SandboxTemplate' && templateFailures-- > 0) throw new Error('template delete failed');
      resources.delete(key(resource));
      if (resource.kind === 'SandboxClaim') resources.delete(key(pod));
      return {};
    },
  };
  const unavailable = new Proxy({}, { get: () => async () => { throw new Error('unused'); } });
  const clients = { objects, core: unavailable, network: unavailable, exec: unavailable };
  const transport = new KubernetesAgentSandboxTransport({ clients, pollIntervalMs: 10 });
  const executor = new AgentSandboxExecutor({ transport, config: { imageRepository, readinessTimeoutMs: 1_000 } });
  return { calls, resources, objects, transport, executor, pod };
}

test('restart inventory deduplicates Claim, Template, and runtime Pod identities and rejects malformed ownership evidence', async () => {
  const state = cluster();
  assert.deepEqual(await state.transport.listSessionIds('clervo-sandbox-execution'), [sessionId]);
  assert.deepEqual(state.calls.filter(([name]) => name === 'list').map(([, kind]) => kind), ['SandboxTemplate', 'SandboxClaim', 'Pod']);

  const claim = [...state.resources.values()].find(({ kind }) => kind === 'SandboxClaim');
  delete claim.metadata.annotations['clervo.dev/session-id'];
  await assert.rejects(state.transport.listSessionIds('clervo-sandbox-execution'), /session_inventory_invalid/u);
});

test('Claim deletion failure survives restart, remains unready, and reaper removes Claim plus runtime before health recovers', async () => {
  const state = cluster({ claimDeleteFailures: 2 });
  await assert.rejects(state.executor.destroy(sessionId), /cleanup_unknown/u);
  assert.equal([...state.resources.values()].some(({ kind }) => kind === 'SandboxTemplate'), false);
  assert.equal([...state.resources.values()].some(({ kind }) => kind === 'SandboxClaim'), true);
  assert.equal([...state.resources.values()].some(({ kind }) => kind === 'Pod'), true);

  const restartedPlane = new SandboxControlPlane(state.executor, Date.now, { allows: () => true });
  let cleanupHealthy = false;
  const first = await restartedPlane.reap(); cleanupHealthy = first.quarantined === 0 && first.foreignOrphans === 0;
  assert.equal(cleanupHealthy, false);
  assert.equal([...state.resources.values()].some(({ kind }) => kind === 'Pod'), true);
  const second = await restartedPlane.reap(); cleanupHealthy = second.quarantined === 0 && second.foreignOrphans === 0;
  assert.equal(cleanupHealthy, true);
  assert.deepEqual(await state.transport.listSessionIds('clervo-sandbox-execution'), []);
  assert.equal([...state.resources.values()].some(({ kind }) => ['SandboxClaim', 'SandboxTemplate', 'Pod'].includes(kind)), false);
});

test('Template deletion failure survives restart and reaper removes the surviving Template', async () => {
  const state = cluster({ templateDeleteFailures: 1 });
  await assert.rejects(state.executor.destroy(sessionId), /cleanup_unknown/u);
  assert.deepEqual([...state.resources.values()].filter(({ kind }) => kind !== 'Pod').map(({ kind }) => kind), ['SandboxTemplate']);
  const restartedPlane = new SandboxControlPlane(state.executor, Date.now, { allows: () => true });
  assert.deepEqual(await restartedPlane.reap(), { destroyed: 1, quarantined: 0, foreignOrphans: 0 });
  assert.deepEqual(await state.transport.listSessionIds('clervo-sandbox-execution'), []);
});

test('transport refuses to delete a foreign resource even when its name collides with an owned session', async () => {
  const state = cluster();
  const claim = [...state.resources.values()].find(({ kind }) => kind === 'SandboxClaim');
  claim.metadata.labels['clervo.dev/owner'] = 'foreign-controller';
  const deletesBefore = state.calls.filter(([name]) => name === 'delete').length;
  await assert.rejects(state.transport.delete({ namespace: 'clervo-sandbox-execution', kind: 'SandboxClaim', name: claim.metadata.name, foreground: true }), /session_inventory_invalid/u);
  assert.equal(state.calls.filter(([name]) => name === 'delete').length, deletesBefore);
  assert.equal([...state.resources.values()].includes(claim), true);
});

function operation(command) {
  return {
    contractVersion: '2026-07-29.1', schemaVersion: 'sandbox-operation-request.v1', operationId: 'op_0123456789ABCDEFGHIJ', productId: 'sandbox.run',
    input: { kind: 'run', executionId, imageDigest, command, limits: Object.fromEntries(Object.entries(limits).filter(([key]) => key !== 'maximumChargeMicrousd')) },
    maximumCharge: { asset: 'USD', amountAtomic: '1000', decimals: 6 }, deadlineAt: '2099-08-16T12:00:00.000Z',
  };
}

test('multiline Python and Node source passes HTTP, contract, and control validation with blank lines, indentation, tabs, and CRLF', async () => {
  const python = 'def hello():\r\n\tprint("hello")\r\n\r\nhello()\r\n';
  const node = 'function hello() {\n  console.log("hello");\n}\n\nhello();\n';
  for (const [runtime, source] of [['python', python], ['node', node]]) {
    const normalized = normalizeSandboxHttpRequest({ runtime, code: source });
    assert.doesNotThrow(() => assertSandboxOperationRequest(operation(normalized.command)));
    const calls = [];
    const runtimeExecutor = {
      async create() { return { runtimeClass: 'gvisor', dedicatedExecutionNodes: true, controlPlaneSeparated: true, networkDefaultDeny: true, serviceAccountTokenMounted: false, executionNodeSecrets: false, imageDigest, readOnlyRootFilesystem: true }; },
      async execute(input) { calls.push(input.command); return { exitCode: 0, stdout: new TextEncoder().encode('hello\n'), stderr: new Uint8Array(), cpuMillis: 1, durationMs: 1 }; },
      async destroy() {}, async list() { return []; },
    };
    const plane = new SandboxControlPlane(runtimeExecutor, () => 1_000, { allows: () => true });
    await plane.create({ sessionId, tenantId, imageDigest, limits, ttlMs: 5_000 });
    await plane.execute({ sessionId, executionId, tenantId, command: normalized.command, stdin: new Uint8Array() });
    assert.equal(calls[0][2], source);
  }
});

test('inline source keeps byte and envelope bounds while only TAB, LF, and CR are admitted from C0 controls', () => {
  assert.equal(SANDBOX_MAX_INLINE_PROGRAM_BYTES, 262_144);
  assert.equal(SANDBOX_MAX_INLINE_INPUT_BYTES, 1_048_576);
  assert.equal(SANDBOX_MAX_REQUEST_BYTES, 1_500_000);
  const exactAscii = `\t\r\n${'x'.repeat(SANDBOX_MAX_INLINE_PROGRAM_BYTES - 3)}`;
  const exactUtf8 = 'é'.repeat(SANDBOX_MAX_INLINE_PROGRAM_BYTES / 2);
  for (const source of [exactAscii, exactUtf8]) assert.doesNotThrow(() => normalizeSandboxHttpRequest({ runtime: 'node', code: source }));
  assert.throws(() => normalizeSandboxHttpRequest({ runtime: 'node', code: `${exactAscii}x` }), /sandbox_program_invalid/u);
  for (const control of ['\u0000', '\u0001', '\u0008', '\u000b', '\u000c', '\u000e', '\u001f', '\u007f']) {
    assert.throws(() => normalizeSandboxHttpRequest({ runtime: 'node', code: `before${control}after` }), /sandbox_program_invalid/u);
    assert.throws(() => assertSandboxOperationRequest(operation(['node', '-e', `before${control}after`])), /command_invalid/u);
  }
  for (const whitespace of ['\t', '\n', '\r']) assert.doesNotThrow(() => assertSandboxOperationRequest(operation(['node', '-e', `before${whitespace}after`])));
  assert.throws(() => normalizeSandboxHttpRequest({ runtime: 'node', code: 'ok', args: ['bad\targ'] }), /sandbox_args_invalid/u);
  assert.throws(() => normalizeSandboxHttpRequest({ command: ['node', 'bad\narg'] }), /sandbox_command_invalid/u);
});
