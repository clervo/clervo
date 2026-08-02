import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSandboxPod, sandboxBoundaryManifests, sandboxExecutionNamespace } from '../../dist/services/sandbox/src/kubernetes-manifest.js';

const input = {
  sessionId: 'sbx_0123456789ABCDEFGHIJ', tenantId: 'tenant_0123456789ABCDEFGHIJ', imageDigest: `sha256:${'a'.repeat(64)}`, command: ['node', '/opt/clervo/runner.js'],
  limits: { cpuMillis: 1000, memoryBytes: 134217728, processes: 16, diskBytes: 10485760, outputBytes: 1024, wallTimeMs: 2000, maximumChargeMicrousd: 1000 },
};

test('sandbox pod is digest-pinned to gVisor on credential-free dedicated execution nodes', () => {
  const pod = buildSandboxPod(input); const spec = pod.spec; const container = spec.containers[0];
  assert.equal(pod.metadata.namespace, sandboxExecutionNamespace);
  assert.equal(spec.runtimeClassName, 'gvisor');
  assert.equal(spec.automountServiceAccountToken, false);
  assert.deepEqual([spec.hostNetwork, spec.hostPID, spec.hostIPC, spec.shareProcessNamespace], [false, false, false, false]);
  assert.deepEqual(spec.nodeSelector, { 'clervo.dev/node-pool': 'sandbox-execution', 'clervo.dev/execution-plane': 'true' });
  assert.equal(container.image, `clervo-sandbox@${input.imageDigest}`);
  assert.equal(container.securityContext.readOnlyRootFilesystem, true);
  assert.equal(container.securityContext.allowPrivilegeEscalation, false);
  assert.equal(container.securityContext.privileged, false);
  assert.deepEqual(container.securityContext.capabilities.drop, ['ALL']);
  assert.equal(container.resources.limits.memory, String(input.limits.memoryBytes));
  assert.equal(spec.volumes[0].emptyDir.sizeLimit, String(input.limits.diskBytes));
  assert.equal(spec.activeDeadlineSeconds, 2);
});

test('sandbox execution namespace enforces restricted pods and deny-all network policy', () => {
  const [namespace, policy] = sandboxBoundaryManifests();
  assert.equal(namespace.metadata.labels['pod-security.kubernetes.io/enforce'], 'restricted');
  assert.equal(policy.metadata.namespace, sandboxExecutionNamespace);
  assert.deepEqual(policy.spec, { podSelector: {}, policyTypes: ['Ingress', 'Egress'], ingress: [], egress: [] });
});

test('sandbox manifest rejects mutable images, excessive limits, and malformed commands', () => {
  assert.throws(() => buildSandboxPod({ ...input, imageDigest: 'latest' }), /digest_invalid/u);
  assert.throws(() => buildSandboxPod({ ...input, command: ['node\0--escape'] }), /command_invalid/u);
  assert.throws(() => buildSandboxPod({ ...input, limits: { ...input.limits, processes: 257 } }), /limit_invalid:processes/u);
});
