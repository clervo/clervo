import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policy = JSON.parse(await readFile('infra/sandbox/system-capacity.v1.json', 'utf8'));
const control = JSON.parse(await readFile('infra/sandbox/control-service.v1.json', 'utf8'));
const capacity = await readFile('scripts/sandbox/gcp-system-capacity.mjs', 'utf8');
const bootstrap = await readFile('scripts/sandbox/gcp-control-service.mjs', 'utf8');

test('Sandbox system capacity uses a bounded dedicated system node and keeps execution isolated', () => {
  assert.equal(policy.nodePool.name, 'sandbox-system');
  assert.equal(policy.nodePool.machineType, 'n1-standard-1');
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
  assert.equal(policy.quotaConstraint.availableBeforeRecovery, 1);
  assert.equal(policy.quotaConstraint.availableAfterRecovery, 0);
  assert.equal(policy.quotaConstraint.highAvailabilityQualified, false);
  assert.equal(policy.quiescedNodePool.name, 'default-pool');
  assert.equal(policy.quiescedNodePool.desiredNodes, 0);
});

test('capacity control quiesces the broken pool, creates its bounded replacement, and verifies readiness', () => {
  assert.match(capacity, /topologySpreadConstraints/u);
  assert.match(capacity, /DoNotSchedule/u);
  assert.match(capacity, /PodDisruptionBudget/u);
  assert.match(capacity, /new Set\(controllerPods\.map/u);
  assert.match(capacity, /provision:sandbox-system-capacity/u);
  assert.match(capacity, /clusters', 'resize'/u);
  assert.match(capacity, /node-pools', 'create'/u);
  assert.match(capacity, /policy\.quiescedNodePool\.desiredNodes/u);
  assert.doesNotMatch(capacity, /ai\.clervo\.dev|node-pools', 'delete'|instances', 'delete'|clusters', 'delete'/u);
  assert.match(bootstrap, /policy\.boundaries\.controllerRequests/u);
  assert.match(bootstrap, /PodDisruptionBudget/u);
});
