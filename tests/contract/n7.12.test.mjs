import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policy = JSON.parse(await readFile('infra/sandbox/production-plane.v1.json', 'utf8'));
const bootstrap = await readFile('scripts/sandbox/gcp-production-plane.mjs', 'utf8');
const qualification = await readFile('scripts/sandbox/qualify-agent-sandbox-network.mjs', 'utf8');

test('persistent sandbox plane preserves the qualified private Dataplane V2 and gVisor boundary', () => {
  assert.equal(policy.state, 'private_plane_qualified');
  assert.equal(policy.cluster.dataPlane, 'gke-dataplane-v2');
  assert.equal(policy.cluster.agentSandboxEnabled, true);
  assert.equal(policy.cluster.privateNodes, true);
  assert.equal(policy.cluster.privateEndpoint, true);
  assert.equal(policy.boundaries.publicEndpoint, false);
  assert.equal(policy.boundaries.publicWorkload, false);
  assert.equal(policy.executionPool.runtimeClass, 'gvisor');
  assert.equal(policy.executionPool.podPidsLimit, 1024);
  assert.deepEqual(policy.executionPool.upgrade, { maximumSurge: 0, maximumUnavailable: 1 });
  assert.deepEqual(policy.executionPool.labels, {
    'clervo.dev/node-pool': 'sandbox-execution',
    'clervo.dev/execution-plane': 'true',
  });
  assert.deepEqual(policy.executionPool.taints, ['clervo.dev/sandbox-only=true:NoSchedule']);
  assert.equal(policy.runner.malwareScan, 'passed');
  assert.equal(policy.observed.clusterStatus, 'RUNNING');
  assert.equal(policy.observed.sandboxNodesReady, true);
  assert.equal(policy.observed.requiredCrdsPresent, true);
  assert.equal(policy.observed.publicWorkload, false);
  assert.equal(policy.observed.failedZoneAttemptRemoved, true);
  assert.equal(policy.observed.runnerRedTeamReportSha256, 'sha256:1b12e86151e22e09874a154abd156e5027ff7d035a5c2c4d74ed80f06ee94da4');
  assert.match(bootstrap, /--enable-dataplane-v2/u);
  assert.match(bootstrap, /--enable-private-nodes/u);
  assert.match(bootstrap, /--enable-private-endpoint/u);
  assert.match(bootstrap, /--enable-agent-sandbox/u);
  assert.match(bootstrap, /--sandbox', 'type=gvisor/u);
  assert.match(bootstrap, /--system-config-from-file/u);
});

test('runner combines a kernel pod ceiling with an in-runtime traced process ceiling', async () => {
  const native = await readFile('infra/sandbox/runner/sandbox-init.c', 'utf8');
  const runner = await readFile('infra/sandbox/runner/runner.mjs', 'utf8');
  assert.match(native, /PTRACE_O_TRACEFORK/u);
  assert.match(native, /PTRACE_O_TRACEVFORK/u);
  assert.match(native, /PTRACE_O_TRACECLONE/u);
  assert.match(native, /PTRACE_O_EXITKILL/u);
  assert.match(native, /kill\(-child, SIGKILL\)/u);
  assert.match(native, /monitor_processes/u);
  assert.match(native, /descendants\(state->root/u);
  assert.match(native, /nanosleep/u);
  assert.match(native, /processLimitTriggered/u);
  assert.match(runner, /nativeUsage\.processLimitTriggered === true/u);
  assert.match(runner, /limitFailure = 'process_limit'/u);
});

test('sandbox node identity is least privilege and cannot mutate Clervo application secrets or infrastructure', () => {
  assert.deepEqual(policy.nodeIdentity.projectRoles, [
    'roles/logging.logWriter',
    'roles/monitoring.metricWriter',
    'roles/monitoring.viewer',
  ]);
  assert.equal(policy.nodeIdentity.repositoryRole, 'roles/artifactregistry.reader');
  assert.ok(policy.nodeIdentity.forbiddenRoles.includes('roles/compute.admin'));
  assert.ok(policy.nodeIdentity.forbiddenRoles.includes('roles/container.admin'));
  assert.doesNotMatch(JSON.stringify(policy.nodeIdentity), /secretmanager|cloudsql|run\.admin/u);
  assert.doesNotMatch(bootstrap, /ai\.clervo\.dev|instances delete|run services delete/u);
});

test('live qualification accepts production only for the exact documented cluster and retains cleanup', () => {
  assert.match(qualification, /acknowledgement === 'persistent-production'/u);
  assert.match(qualification, /expectedCluster === productionPolicy\.cluster\.name/u);
  assert.match(qualification, /delete', 'namespace'/u);
  assert.match(qualification, /cleanupVerified/u);
});
