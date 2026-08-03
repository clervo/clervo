import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policy = JSON.parse(await readFile('infra/sandbox/system-capacity.v1.json', 'utf8'));
const control = JSON.parse(await readFile('infra/sandbox/control-service.v1.json', 'utf8'));
const capacity = await readFile('scripts/sandbox/gcp-system-capacity.mjs', 'utf8');
const bootstrap = await readFile('scripts/sandbox/gcp-control-service.mjs', 'utf8');

test('Sandbox system capacity upgrades the bounded regular system node and keeps execution isolated', () => {
  assert.equal(policy.nodePool.name, 'default-pool');
  assert.equal(policy.nodePool.machineType, 'e2-standard-2');
  assert.equal(policy.nodePool.nodes, 1);
  assert.equal(policy.controller.replicas, 1);
  assert.equal(policy.controller.minimumAvailable, 1);
  assert.equal(control.boundaries.systemNodePool, policy.nodePool.name);
  assert.equal(control.boundaries.executionNodePool, policy.boundaries.executionNodePool);
  assert.deepEqual(control.boundaries.controllerRequests, policy.controller.requests);
  assert.equal(policy.boundaries.controllerOnExecutionPool, false);
  assert.equal(policy.boundaries.publicEndpoint, false);
  assert.equal(policy.boundaries.paymentEnabled, false);
  assert.equal(policy.quotaConstraint.metric, 'CPUS_ALL_REGIONS');
  assert.equal(policy.quotaConstraint.availableAtQualification, 0);
  assert.equal(policy.quotaConstraint.highAvailabilityQualified, false);
});

test('capacity control performs a no-surge in-place upgrade and verifies readiness', () => {
  assert.match(capacity, /topologySpreadConstraints/u);
  assert.match(capacity, /DoNotSchedule/u);
  assert.match(capacity, /PodDisruptionBudget/u);
  assert.match(capacity, /new Set\(controllerPods\.map/u);
  assert.match(capacity, /provision:sandbox-system-capacity/u);
  assert.match(capacity, /--max-surge-upgrade', '0'/u);
  assert.match(capacity, /--max-unavailable-upgrade', '1'/u);
  assert.doesNotMatch(capacity, /ai\.clervo\.dev|node-pools', 'delete'|instances', 'delete'|clusters', 'delete'/u);
  assert.match(bootstrap, /policy\.boundaries\.controllerRequests/u);
  assert.match(bootstrap, /PodDisruptionBudget/u);
});
