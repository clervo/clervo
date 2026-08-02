import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentSandboxExecutor } from '../../dist/adapters/sandbox/src/agent-sandbox.js';

const sessionId = 'sbx_0123456789ABCDEFGHIJ';
const tenantId = 'tenant_0123456789ABCDEFGHIJ';
const imageDigest = `sha256:${'a'.repeat(64)}`;
const imageRepository = 'us-central1-docker.pkg.dev/example/clervo-sandbox/runner';
const limits = { cpuMillis: 1000, memoryBytes: 134217728, processes: 16, diskBytes: 10485760, outputBytes: 1024, artifactBytes: 4096, wallTimeMs: 2000, maximumChargeMicrousd: 1000 };

function dependencies(overrides = {}) {
  const calls = [];
  const transport = {
    async apply(resources) { calls.push(['apply', resources]); },
    async waitForReady(input) {
      calls.push(['ready', input]);
      return { runtimeClassName: 'gvisor', image: `${imageRepository}@${imageDigest}`, dedicatedExecutionNode: true, controlPlaneSeparated: true, networkPolicyManagement: 'Managed', networkPolicyIngressRules: 0, networkPolicyEgressRules: 0, serviceAccountTokenMounted: false, executionNodeSecretsPresent: false, readOnlyRootFilesystem: true };
    },
    async exec(input) {
      calls.push(['exec', input]);
      return { exitCode: 0, stderr: new Uint8Array(), stdout: new TextEncoder().encode(JSON.stringify({ exitCode: 0, stdoutBase64: Buffer.from('ok').toString('base64'), stderrBase64: '', cpuMillis: 10, durationMs: 20, maximumProcessesObserved: 1, limitFailure: null })) };
    },
    async delete(input) { calls.push(['delete', input]); },
    async listSessionIds() { return [sessionId]; },
    ...overrides,
  };
  return { calls, transport, executor: new AgentSandboxExecutor({ transport, config: { imageRepository, readinessTimeoutMs: 5000 } }) };
}

test('Agent Sandbox executor applies only the qualified template/claim path and returns observed attestation', async () => {
  const deps = dependencies();
  const attestation = await deps.executor.create({ sessionId, tenantId, imageDigest, limits });
  assert.deepEqual(attestation, { runtimeClass: 'gvisor', dedicatedExecutionNodes: true, controlPlaneSeparated: true, networkDefaultDeny: true, serviceAccountTokenMounted: false, executionNodeSecrets: false, imageDigest, readOnlyRootFilesystem: true });
  const resources = deps.calls.find(([name]) => name === 'apply')[1];
  assert.deepEqual(resources.map(({ kind }) => kind), ['Namespace', 'SandboxTemplate', 'SandboxClaim']);
  assert.equal(resources.some(({ kind }) => kind === 'Pod'), false);
  assert.equal(resources[1].spec.networkPolicyManagement, 'Managed');
  assert.deepEqual(resources[1].spec.networkPolicy, { ingress: [], egress: [] });
});

test('Agent Sandbox executor invokes only the fixed runner and validates its bounded response', async () => {
  const deps = dependencies();
  const result = await deps.executor.execute({ sessionId, executionId: 'exec_0123456789ABCDEFGHIJ', command: ['node', 'main.js'], stdin: new Uint8Array(), limits });
  assert.deepEqual(result.stdout, new TextEncoder().encode('ok'));
  const call = deps.calls.find(([name]) => name === 'exec')[1];
  assert.deepEqual(call.command, ['node', '/opt/clervo/runner.mjs']);
  assert.ok(call.maximumOutputBytes <= limits.outputBytes + 65536);
  const invalid = dependencies({ async exec() { return { exitCode: 0, stderr: new Uint8Array(), stdout: new TextEncoder().encode('{"exitCode":0}') }; } });
  await assert.rejects(invalid.executor.execute({ sessionId, executionId: 'exec_0123456789ABCDEFGHIJ', command: ['node'], stdin: new Uint8Array(), limits }), /response_invalid/u);
});

test('Agent Sandbox executor fails closed on weak observation and deletes claim before template', async () => {
  const deps = dependencies({
    async waitForReady() { return { runtimeClassName: 'runc', image: `${imageRepository}@${imageDigest}`, dedicatedExecutionNode: false, controlPlaneSeparated: true, networkPolicyManagement: 'Unmanaged', networkPolicyIngressRules: 1, networkPolicyEgressRules: 1, serviceAccountTokenMounted: true, executionNodeSecretsPresent: true, readOnlyRootFilesystem: false }; },
  });
  const attestation = await deps.executor.create({ sessionId, tenantId, imageDigest, limits });
  assert.equal(attestation.networkDefaultDeny, false);
  assert.equal(attestation.imageDigest, imageDigest);
  await deps.executor.destroy(sessionId);
  assert.deepEqual(deps.calls.filter(([name]) => name === 'delete').map(([, input]) => input.kind), ['SandboxClaim', 'SandboxTemplate']);
  assert.deepEqual(await deps.executor.list(), [sessionId]);
});
