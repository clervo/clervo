#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const policy = JSON.parse(await readFile(new URL('../../infra/sandbox/system-capacity.v1.json', import.meta.url), 'utf8'));
const action = process.argv[2] ?? 'plan';

function fail(code) { throw new Error(`sandbox_system_capacity_refused:${code}`); }

function run(command, args, { allowFailure = false, input, timeout = 600_000 } = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], timeout, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    if (allowFailure) return { ok: false, stdout: result.stdout?.trim() ?? '', stderr: result.stderr?.trim() ?? '' };
    fail(`${command}_${String(args[0] ?? 'command').replaceAll(/[^a-z0-9]+/giu, '_').toLowerCase()}_failed`);
  }
  return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function gcloud(args, options) { return run('gcloud', args, options); }
function kubectl(args, options) { return run('kubectl', args, options); }

function credentials() {
  gcloud(['container', 'clusters', 'get-credentials', policy.cluster, '--project', policy.project, '--zone', policy.zone, '--internal-ip']);
}

function pool(name, allowFailure = false) {
  return gcloud(['container', 'node-pools', 'describe', name, '--cluster', policy.cluster, '--project', policy.project, '--zone', policy.zone, '--format=json'], { allowFailure });
}

function ensurePool() {
  const existing = pool(policy.nodePool.name, true);
  if (!existing.ok) fail('system_pool_missing');
  let value = JSON.parse(existing.stdout);
  if (value.config?.machineType !== policy.nodePool.machineType) {
    gcloud([
      'container', 'node-pools', 'update', policy.nodePool.name, '--cluster', policy.cluster,
      '--project', policy.project, '--zone', policy.zone, '--machine-type', policy.nodePool.machineType,
      '--max-surge-upgrade', '0', '--max-unavailable-upgrade', '1', '--quiet',
    ]);
    value = JSON.parse(pool(policy.nodePool.name).stdout);
    assert.equal(value.config?.machineType, policy.nodePool.machineType);
    return true;
  }
  assert.equal(value.config?.serviceAccount, policy.nodePool.serviceAccount);
  assert.equal(value.config?.diskType, policy.nodePool.diskType);
  return false;
}

function disruptionBudget() {
  return {
    apiVersion: 'policy/v1', kind: 'PodDisruptionBudget',
    metadata: { name: policy.controller.deployment, namespace: policy.controller.namespace },
    spec: { minAvailable: policy.controller.minimumAvailable, selector: { matchLabels: { 'app.kubernetes.io/name': policy.controller.deployment, 'clervo.dev/plane': 'sandbox-control' } } },
  };
}

function moveController() {
  const patch = {
    spec: {
      replicas: policy.controller.replicas,
      strategy: { type: 'RollingUpdate', rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } },
      template: { spec: {
        nodeSelector: { 'cloud.google.com/gke-nodepool': policy.nodePool.name },
        topologySpreadConstraints: [{ maxSkew: 1, topologyKey: 'kubernetes.io/hostname', whenUnsatisfiable: 'DoNotSchedule', labelSelector: { matchLabels: { 'app.kubernetes.io/name': policy.controller.deployment, 'clervo.dev/plane': 'sandbox-control' } } }],
        containers: [{ name: 'control', resources: { requests: policy.controller.requests, limits: policy.controller.limits } }],
      } },
    },
  };
  kubectl(['patch', 'deployment', policy.controller.deployment, '-n', policy.controller.namespace, '--type=strategic', '--patch', JSON.stringify(patch)]);
  kubectl(['apply', '--server-side=true', '--field-manager=clervo-sandbox-bootstrap', '--force-conflicts=false', '-f', '-'], { input: JSON.stringify(disruptionBudget()) });
  kubectl(['rollout', 'status', `deployment/${policy.controller.deployment}`, '-n', policy.controller.namespace, '--timeout=300s']);
}

function observe() {
  credentials();
  const described = JSON.parse(pool(policy.nodePool.name).stdout);
  const nodes = JSON.parse(kubectl(['get', 'nodes', '-l', `cloud.google.com/gke-nodepool=${policy.nodePool.name}`, '-o', 'json']).stdout);
  const deployment = JSON.parse(kubectl(['get', 'deployment', policy.controller.deployment, '-n', policy.controller.namespace, '-o', 'json']).stdout);
  const pods = JSON.parse(kubectl(['get', 'pods', '-n', policy.controller.namespace, '-l', `app.kubernetes.io/name=${policy.controller.deployment}`, '-o', 'json']).stdout);
  const pdb = JSON.parse(kubectl(['get', 'poddisruptionbudget', policy.controller.deployment, '-n', policy.controller.namespace, '-o', 'json']).stdout);
  const nodeNames = new Set(nodes.items.map(({ metadata }) => metadata.name));
  const controllerPods = pods.items.map((pod) => ({
    name: pod.metadata.name, nodeName: pod.spec.nodeName,
    ready: pod.status.conditions?.some(({ type, status }) => type === 'Ready' && status === 'True') === true,
    requests: pod.spec.containers.find(({ name }) => name === 'control')?.resources?.requests,
  }));
  const result = {
    nodePool: described.name, machineType: described.config?.machineType, desiredNodes: policy.nodePool.nodes,
    readyNodes: nodes.items.filter(({ status }) => status.conditions?.some(({ type, status: value }) => type === 'Ready' && value === 'True')).length,
    allocatableMemory: nodes.items.map(({ metadata, status }) => ({ node: metadata.name, memory: status.allocatable?.memory })),
    controllerReplicas: deployment.status?.availableReplicas ?? 0, controllerPods,
    minimumAvailable: pdb.spec?.minAvailable, disruptionsAllowed: pdb.status?.disruptionsAllowed ?? 0,
    publicEndpoint: false, paymentEnabled: false,
  };
  assert.equal(result.machineType, policy.nodePool.machineType);
  assert.equal(result.readyNodes, policy.nodePool.nodes);
  assert.equal(result.controllerReplicas, policy.controller.replicas);
  assert.equal(controllerPods.length, policy.controller.replicas);
  assert.ok(controllerPods.every(({ nodeName, ready, requests }) => nodeNames.has(nodeName) && ready && requests?.cpu === policy.controller.requests.cpu && requests?.memory === policy.controller.requests.memory));
  assert.equal(new Set(controllerPods.map(({ nodeName }) => nodeName)).size, 1);
  assert.equal(result.minimumAvailable, policy.controller.minimumAvailable);
  return result;
}

let result;
if (action === 'plan') result = { action: 'plan', ...policy, mutation: false };
else if (action === 'apply') {
  assert.equal(process.env.CLERVO_SANDBOX_CAPACITY_CONFIRM, `provision:sandbox-system-capacity:${policy.project}`, 'owner confirmation mismatch');
  const nodePoolUpdated = ensurePool(); credentials(); moveController();
  result = { action: 'system-capacity-ready', nodePoolUpdated, ...observe() };
} else if (action === 'observe') result = { action: 'observed', ...observe() };
else fail('usage_plan_apply_observe');

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
