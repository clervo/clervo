#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const policy = JSON.parse(await readFile(
  new URL('../../infra/sandbox/production-plane.v1.json', import.meta.url),
  'utf8',
));
const action = process.argv[2] ?? 'plan';
const nodeEmail = `${policy.nodeIdentity.serviceAccount}@${policy.project}.iam.gserviceaccount.com`;
const nodeSystemConfig = fileURLToPath(new URL('../../infra/sandbox/gke-node-system-config.json', import.meta.url));

function die(message) {
  throw new Error(`sandbox_production_plane_refused:${message}`);
}

function run(command, args, { allowFailure = false, capture = false, timeoutMs = 30 * 60_000 } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) die(`${command}_unavailable`);
  if (result.status !== 0 && !allowFailure) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    die(`${command}_failed_${String(args[0] ?? 'unknown').replaceAll(/[^a-z0-9]+/giu, '_').toLowerCase()}`);
  }
  return { ok: result.status === 0, stdout: capture ? result.stdout.trim() : '', stderr: capture ? result.stderr.trim() : '' };
}

function gcloud(args, options) {
  return run('gcloud', args, options);
}

function clusterExists() {
  return gcloud([
    'container', 'clusters', 'describe', policy.cluster.name,
    '--project', policy.project, '--zone', policy.zone, '--format=value(name)',
  ], { allowFailure: true, capture: true }).ok;
}

function accountExists() {
  return gcloud([
    'iam', 'service-accounts', 'describe', nodeEmail,
    '--project', policy.project, '--format=value(email)',
  ], { allowFailure: true, capture: true }).ok;
}

function ensureNodeIdentity() {
  if (!accountExists()) {
    gcloud([
      'iam', 'service-accounts', 'create', policy.nodeIdentity.serviceAccount,
      '--project', policy.project,
      '--display-name', 'Clervo sandbox GKE nodes',
      '--description', 'Dedicated least-privilege identity for Clervo sandbox system and gVisor nodes.',
      '--quiet',
    ]);
  }
  const member = `serviceAccount:${nodeEmail}`;
  for (const role of policy.nodeIdentity.projectRoles) {
    gcloud(['projects', 'add-iam-policy-binding', policy.project, '--member', member, '--role', role, '--condition=None', '--quiet'], { capture: true });
  }
  gcloud([
    'artifacts', 'repositories', 'add-iam-policy-binding', policy.nodeIdentity.repository,
    '--project', policy.project, '--location', policy.zone.slice(0, -2),
    '--member', member, '--role', policy.nodeIdentity.repositoryRole, '--condition=None', '--quiet',
  ], { capture: true });
}

function createCluster() {
  if (clusterExists()) return false;
  const { cluster, systemPool } = policy;
  gcloud([
    'beta', 'container', 'clusters', 'create', cluster.name,
    '--project', policy.project,
    '--zone', policy.zone,
    '--cluster-version', cluster.version,
    '--release-channel', cluster.releaseChannel,
    '--network', policy.network,
    '--subnetwork', policy.subnetwork,
    '--num-nodes', String(systemPool.nodes),
    '--machine-type', systemPool.machineType,
    '--disk-type', systemPool.diskType,
    '--disk-size', String(systemPool.diskGiB),
    '--image-type', 'COS_CONTAINERD',
    '--service-account', nodeEmail,
    '--scopes', 'cloud-platform',
    '--enable-ip-alias',
    '--enable-dataplane-v2',
    '--enable-private-nodes',
    '--enable-private-endpoint',
    '--master-ipv4-cidr', cluster.controlPlaneCidr,
    '--workload-pool', cluster.workloadIdentityPool,
    '--enable-shielded-nodes',
    '--shielded-secure-boot',
    '--shielded-integrity-monitoring',
    '--enable-intra-node-visibility',
    '--security-posture', cluster.securityPosture,
    '--workload-vulnerability-scanning', cluster.workloadVulnerabilityScanning,
    '--enable-agent-sandbox',
    '--enable-autorepair',
    '--enable-autoupgrade',
    '--metadata', 'disable-legacy-endpoints=true',
    '--labels', 'clervo-plane=sandbox-production',
    '--quiet',
  ], { timeoutMs: 45 * 60_000 });
  return true;
}

function nodePoolExists() {
  return gcloud([
    'container', 'node-pools', 'describe', policy.executionPool.name,
    '--cluster', policy.cluster.name, '--project', policy.project, '--zone', policy.zone,
    '--format=value(name)',
  ], { allowFailure: true, capture: true }).ok;
}

function createExecutionPool() {
  if (nodePoolExists()) return false;
  const pool = policy.executionPool;
  const labels = Object.entries(pool.labels).map(([key, value]) => `${key}=${value}`).join(',');
  gcloud([
    'container', 'node-pools', 'create', pool.name,
    '--cluster', policy.cluster.name,
    '--project', policy.project,
    '--zone', policy.zone,
    '--machine-type', pool.machineType,
    '--num-nodes', String(pool.minimumNodes),
    '--enable-autoscaling',
    '--min-nodes', String(pool.minimumNodes),
    '--max-nodes', String(pool.maximumNodes),
    '--location-policy', 'BALANCED',
    '--disk-type', pool.diskType,
    '--disk-size', String(pool.diskGiB),
    '--image-type', 'COS_CONTAINERD',
    '--sandbox', 'type=gvisor',
    '--system-config-from-file', nodeSystemConfig,
    '--service-account', nodeEmail,
    '--scopes', 'cloud-platform',
    '--node-labels', labels,
    '--node-taints', pool.taints.join(','),
    '--enable-autorepair',
    '--enable-autoupgrade',
    '--shielded-secure-boot',
    '--shielded-integrity-monitoring',
    '--metadata', 'disable-legacy-endpoints=true',
    '--max-surge-upgrade', String(pool.upgrade.maximumSurge),
    '--max-unavailable-upgrade', String(pool.upgrade.maximumUnavailable),
    '--quiet',
  ], { timeoutMs: 45 * 60_000 });
  return true;
}

function ensureExecutionPoolConfig() {
  const raw = gcloud([
    'container', 'node-pools', 'describe', policy.executionPool.name,
    '--cluster', policy.cluster.name, '--project', policy.project, '--zone', policy.zone,
    '--format=json',
  ], { capture: true }).stdout;
  const observed = JSON.parse(raw);
  if (Number(observed.config?.kubeletConfig?.podPidsLimit) === policy.executionPool.podPidsLimit) return false;
  gcloud([
    'container', 'node-pools', 'update', policy.executionPool.name,
    '--cluster', policy.cluster.name, '--project', policy.project, '--zone', policy.zone,
    '--system-config-from-file', nodeSystemConfig,
    '--quiet',
  ], { timeoutMs: 45 * 60_000 });
  return true;
}

function credentials() {
  gcloud([
    'container', 'clusters', 'get-credentials', policy.cluster.name,
    '--project', policy.project, '--zone', policy.zone, '--internal-ip',
  ]);
}

function observe() {
  if (!clusterExists() || !nodePoolExists()) die('plane_incomplete');
  credentials();
  const cluster = JSON.parse(gcloud([
    'container', 'clusters', 'describe', policy.cluster.name,
    '--project', policy.project, '--zone', policy.zone, '--format=json',
  ], { capture: true }).stdout);
  const executionPool = JSON.parse(gcloud([
    'container', 'node-pools', 'describe', policy.executionPool.name,
    '--cluster', policy.cluster.name, '--project', policy.project, '--zone', policy.zone,
    '--format=json',
  ], { capture: true }).stdout);
  const systemPool = JSON.parse(gcloud([
    'container', 'node-pools', 'describe', policy.systemPool.name,
    '--cluster', policy.cluster.name, '--project', policy.project, '--zone', policy.zone,
    '--format=json',
  ], { capture: true }).stdout);
  const nodes = JSON.parse(run('kubectl', ['get', 'nodes', '-o', 'json'], { capture: true }).stdout);
  const sandboxNodes = nodes.items.filter((item) => item.metadata?.labels?.['clervo.dev/node-pool'] === policy.executionPool.name);
  const crds = JSON.parse(run('kubectl', ['get', 'crd', '-o', 'json'], { capture: true }).stdout);
  const requiredCrds = ['sandboxclaims.extensions.agents.x-k8s.io', 'sandboxtemplates.extensions.agents.x-k8s.io'];
  const names = new Set(crds.items.map((item) => item.metadata?.name));
  const observation = {
    cluster: cluster.name,
    status: cluster.status,
    currentMasterVersion: cluster.currentMasterVersion,
    currentNodeVersion: cluster.currentNodeVersion,
    dataPlaneV2: cluster.networkConfig?.datapathProvider === 'ADVANCED_DATAPATH',
    privateNodes: cluster.privateClusterConfig?.enablePrivateNodes === true,
    privateEndpoint: cluster.privateClusterConfig?.enablePrivateEndpoint === true,
    agentSandboxEnabled: cluster.addonsConfig?.agentSandboxConfig?.enabled === true,
    workloadIdentityPool: cluster.workloadIdentityConfig?.workloadPool,
    nodeServiceAccount: nodeEmail,
    nodeCount: nodes.items.length,
    systemNodeMachineType: systemPool.config?.machineType,
    managedPrometheusEnabled: cluster.monitoringConfig?.managedPrometheusConfig?.enabled === true,
    monitoringComponents: cluster.monitoringConfig?.componentConfig?.enableComponents ?? [],
    sandboxNodeCount: sandboxNodes.length,
    sandboxNodesReady: sandboxNodes.every((item) => item.status?.conditions?.some((condition) => condition.type === 'Ready' && condition.status === 'True')),
    sandboxRuntimeClass: run('kubectl', ['get', 'runtimeclass', policy.executionPool.runtimeClass, '-o', 'name'], { capture: true }).stdout === `runtimeclass.node.k8s.io/${policy.executionPool.runtimeClass}`,
    podPidsLimit: Number(executionPool.config?.kubeletConfig?.podPidsLimit ?? 0),
    requiredCrdsPresent: requiredCrds.every((name) => names.has(name)),
    publicWorkload: false,
  };
  assert.equal(observation.status, 'RUNNING');
  assert.equal(observation.dataPlaneV2, true);
  assert.equal(observation.privateNodes, true);
  assert.equal(observation.privateEndpoint, true);
  assert.equal(observation.agentSandboxEnabled, true);
  assert.equal(observation.workloadIdentityPool, policy.cluster.workloadIdentityPool);
  assert.equal(observation.systemNodeMachineType, policy.systemPool.machineType);
  assert.equal(observation.managedPrometheusEnabled, policy.monitoring.managedPrometheusEnabled);
  assert.deepEqual(observation.monitoringComponents, policy.monitoring.components);
  assert.ok(observation.sandboxNodeCount >= policy.executionPool.minimumNodes);
  assert.equal(observation.sandboxNodesReady, true);
  assert.equal(observation.sandboxRuntimeClass, true);
  assert.equal(observation.podPidsLimit, policy.executionPool.podPidsLimit);
  assert.equal(observation.requiredCrdsPresent, true);
  return observation;
}

const plan = {
  action: 'plan',
  project: policy.project,
  zone: policy.zone,
  cluster: policy.cluster,
  systemPool: policy.systemPool,
  executionPool: policy.executionPool,
  nodeIdentity: policy.nodeIdentity,
  publicEndpoint: false,
  publicWorkload: false,
  protectedResources: policy.protectedResources,
};

let result;
if (action === 'plan') result = plan;
else if (action === 'observe') result = { action: 'observed', ...observe() };
else if (action === 'apply') {
  if (process.env.CLERVO_SANDBOX_PRODUCTION_CONFIRM !== `deploy:persistent-sandbox-plane:${policy.project}`) die('owner_confirmation_mismatch');
  assert.ok(!policy.nodeIdentity.projectRoles.some((role) => policy.nodeIdentity.forbiddenRoles.includes(role)));
  ensureNodeIdentity();
  const clusterCreated = createCluster();
  const executionPoolCreated = createExecutionPool();
  const executionPoolConfigUpdated = ensureExecutionPoolConfig();
  result = { action: 'applied-private-plane', clusterCreated, executionPoolCreated, executionPoolConfigUpdated, ...observe() };
} else die('usage_plan_observe_apply');

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
