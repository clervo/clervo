import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAgentSandboxResources, sandboxBoundaryManifests, sandboxExecutionNamespace } from '../../dist/services/sandbox/src/kubernetes-manifest.js';

const input = {
  sessionId: 'sbx_0123456789ABCDEFGHIJ', tenantId: 'tenant_0123456789ABCDEFGHIJ', imageRepository: 'us-central1-docker.pkg.dev/example/clervo-sandbox/runner', imageDigest: `sha256:${'a'.repeat(64)}`,
  limits: { cpuMillis: 1000, memoryBytes: 134217728, processes: 16, diskBytes: 10485760, outputBytes: 1024, artifactBytes: 4096, wallTimeMs: 2000, maximumChargeMicrousd: 1000 },
};

test('sandbox uses a managed air-gapped Agent Sandbox template and claim instead of a plain Pod', () => {
  const [template, claim] = buildAgentSandboxResources(input); const spec = template.spec.podTemplate.spec; const container = spec.containers[0];
  assert.equal(template.kind, 'SandboxTemplate');
  assert.equal(template.metadata.namespace, sandboxExecutionNamespace);
  assert.equal(template.spec.networkPolicyManagement, 'Managed');
  assert.deepEqual(template.spec.networkPolicy, { ingress: [], egress: [] });
  assert.equal(claim.kind, 'SandboxClaim');
  assert.equal(claim.metadata.annotations['clervo.dev/session-id'], input.sessionId);
  assert.equal(claim.spec.sandboxTemplateRef.name, template.metadata.name);
  assert.equal(claim.spec.lifecycle.shutdownPolicy, 'DeleteForeground');
  assert.equal(spec.runtimeClassName, 'gvisor');
  assert.equal(spec.automountServiceAccountToken, false);
  assert.deepEqual([spec.hostNetwork, spec.hostPID, spec.hostIPC, spec.shareProcessNamespace], [false, false, false, false]);
  assert.deepEqual(spec.nodeSelector, { 'sandbox.gke.io/runtime': 'gvisor', 'clervo.dev/node-pool': 'sandbox-execution', 'clervo.dev/execution-plane': 'true' });
  assert.deepEqual(spec.tolerations, [
    { key: 'sandbox.gke.io/runtime', operator: 'Equal', value: 'gvisor', effect: 'NoSchedule' },
    { key: 'clervo.dev/sandbox-only', operator: 'Equal', value: 'true', effect: 'NoSchedule' },
  ]);
  assert.equal(container.image, `${input.imageRepository}@${input.imageDigest}`);
  assert.equal(container.securityContext.readOnlyRootFilesystem, true);
  assert.equal(container.securityContext.allowPrivilegeEscalation, false);
  assert.equal(container.securityContext.privileged, false);
  assert.deepEqual(container.securityContext.capabilities.drop, ['ALL']);
  assert.equal(container.resources.limits.memory, String(input.limits.memoryBytes));
  assert.equal(spec.volumes[0].emptyDir.sizeLimit, String(input.limits.diskBytes));
  assert.equal(spec.activeDeadlineSeconds, 2);
});

test('sandbox execution namespace requires restricted pods and the qualified Dataplane V2 boundary', () => {
  const [namespace] = sandboxBoundaryManifests();
  assert.equal(namespace.metadata.labels['pod-security.kubernetes.io/enforce'], 'restricted');
  assert.equal(namespace.metadata.labels['clervo.dev/network-data-plane'], 'gke-dataplane-v2');
  assert.equal(sandboxBoundaryManifests().some(({ kind }) => kind === 'Pod'), false);
  assert.equal(sandboxBoundaryManifests().some(({ kind }) => kind === 'NetworkPolicy'), false);
});

test('sandbox manifest rejects mutable images, excessive limits, and malformed commands', () => {
  assert.throws(() => buildAgentSandboxResources({ ...input, imageDigest: 'latest' }), /digest_invalid/u);
  assert.throws(() => buildAgentSandboxResources({ ...input, imageRepository: 'registry.example/runner:latest' }), /repository_invalid/u);
  assert.throws(() => buildAgentSandboxResources({ ...input, limits: { ...input.limits, processes: 257 } }), /limit_invalid:processes/u);
});
