#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const policyUrl = new URL('../../infra/sandbox/control-service.v1.json', import.meta.url);
const policy = JSON.parse(await readFile(policyUrl, 'utf8'));
const action = process.argv[2] ?? 'plan';
const runtimeIdentity = `clervo-api-production@${policy.project}.iam.gserviceaccount.com`;
const controlImage = policy.imageDigest ? `${policy.imageRepository}@${policy.imageDigest}` : null;

function fail(code) { throw new Error(`sandbox_control_service_refused:${code}`); }

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', input: options.input, timeout: options.timeoutMs ?? 300_000,
    maxBuffer: 16 * 1024 * 1024, stdio: options.capture === false ? 'inherit' : ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    if (options.allowFailure) return { ok: false, stdout: result.stdout?.trim() ?? '', stderr: result.stderr?.trim() ?? '' };
    fail(`${command}_${String(args[0] ?? 'command').replaceAll(/[^a-z0-9]+/giu, '_').toLowerCase()}_failed`);
  }
  return { ok: true, stdout: result.stdout?.trim() ?? '', stderr: result.stderr?.trim() ?? '' };
}

function kubectl(args, options) { return run('kubectl', args, options); }
function gcloud(args, options) { return run('gcloud', args, options); }

function namespace(name, labels) {
  return { apiVersion: 'v1', kind: 'Namespace', metadata: { name, labels } };
}

function publicResources(token) {
  if (!controlImage) fail('control_image_digest_missing');
  const systemLabels = { 'clervo.dev/plane': 'sandbox-control', 'pod-security.kubernetes.io/enforce': 'restricted', 'pod-security.kubernetes.io/enforce-version': 'latest' };
  const executionLabels = { 'clervo.dev/plane': 'sandbox-execution', 'clervo.dev/network-data-plane': 'gke-dataplane-v2', 'pod-security.kubernetes.io/enforce': 'restricted', 'pod-security.kubernetes.io/enforce-version': 'latest' };
  const appLabels = { 'app.kubernetes.io/name': policy.deployment, 'clervo.dev/plane': 'sandbox-control' };
  return [
    namespace(policy.systemNamespace, systemLabels),
    namespace(policy.executionNamespace, executionLabels),
    { apiVersion: 'v1', kind: 'ServiceAccount', metadata: { name: policy.serviceAccount, namespace: policy.systemNamespace }, automountServiceAccountToken: true },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'Role', metadata: { name: policy.serviceAccount, namespace: policy.executionNamespace }, rules: [
        { apiGroups: ['extensions.agents.x-k8s.io'], resources: policy.rbac.agentResources, verbs: policy.rbac.agentVerbs },
        { apiGroups: [''], resources: policy.rbac.coreResources, verbs: policy.rbac.coreVerbs },
        { apiGroups: [''], resources: policy.rbac.execResources, verbs: policy.rbac.execVerbs },
        { apiGroups: ['networking.k8s.io'], resources: policy.rbac.networkResources, verbs: policy.rbac.networkVerbs },
      ],
    },
    { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'RoleBinding', metadata: { name: policy.serviceAccount, namespace: policy.executionNamespace }, subjects: [{ kind: 'ServiceAccount', name: policy.serviceAccount, namespace: policy.systemNamespace }], roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: policy.serviceAccount } },
    { apiVersion: 'v1', kind: 'Secret', metadata: { name: policy.authentication.kubernetesSecret, namespace: policy.systemNamespace }, type: 'Opaque', stringData: { token } },
    {
      apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: policy.deployment, namespace: policy.systemNamespace, labels: appLabels },
      spec: {
        replicas: policy.replicas, strategy: { type: 'Recreate' }, selector: { matchLabels: appLabels },
        template: {
          metadata: { labels: appLabels },
          spec: {
            serviceAccountName: policy.serviceAccount, automountServiceAccountToken: true, enableServiceLinks: false,
            nodeSelector: { 'cloud.google.com/gke-nodepool': policy.boundaries.systemNodePool }, terminationGracePeriodSeconds: 10,
            securityContext: { runAsNonRoot: true, runAsUser: policy.boundaries.runAsUser, runAsGroup: policy.boundaries.runAsUser, fsGroup: policy.boundaries.runAsUser, seccompProfile: { type: 'RuntimeDefault' } },
            containers: [{
              name: 'control', image: controlImage, imagePullPolicy: 'IfNotPresent',
              ports: [{ name: 'http', containerPort: 8080, protocol: 'TCP' }],
              env: [
                { name: 'CLERVO_SANDBOX_CONTROL_TOKEN', valueFrom: { secretKeyRef: { name: policy.authentication.kubernetesSecret, key: 'token' } } },
                { name: 'CLERVO_SANDBOX_RUNNER_REPOSITORY', value: policy.runnerRepository },
                { name: 'CLERVO_SANDBOX_RUNNER_DIGEST', value: policy.runnerDigest },
                { name: 'CLERVO_SANDBOX_RUNNER_SBOM_SHA256', value: policy.runnerSbomSha256 },
              ],
              securityContext: { allowPrivilegeEscalation: false, privileged: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
              resources: { requests: { cpu: '1m', memory: '1Mi' }, limits: { cpu: '500m', memory: '512Mi' } },
              startupProbe: { httpGet: { path: '/healthz', port: 'http' }, periodSeconds: 2, timeoutSeconds: 1, failureThreshold: 30 },
              readinessProbe: { httpGet: { path: '/readyz', port: 'http' }, periodSeconds: 5, timeoutSeconds: 2, failureThreshold: 2 },
              livenessProbe: { httpGet: { path: '/healthz', port: 'http' }, periodSeconds: 10, timeoutSeconds: 1, failureThreshold: 3 },
            }],
          },
        },
      },
    },
    { apiVersion: 'v1', kind: 'Service', metadata: { name: policy.service, namespace: policy.systemNamespace, labels: appLabels }, spec: { type: 'ClusterIP', selector: appLabels, ports: [{ name: 'http', port: 8080, targetPort: 'http', protocol: 'TCP' }] } },
    {
      apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy', metadata: { name: `${policy.deployment}-boundary`, namespace: policy.systemNamespace },
      spec: {
        podSelector: { matchLabels: appLabels }, policyTypes: ['Ingress', 'Egress'],
        ingress: [{ from: [
          { podSelector: { matchLabels: { 'clervo.dev/sandbox-api': 'true' } } },
          { ipBlock: { cidr: policy.network.serverlessSubnetCidr } },
          ...policy.network.healthCheckSourceRanges.map((cidr) => ({ ipBlock: { cidr } })),
        ], ports: [{ protocol: 'TCP', port: 8080 }] }],
        egress: [{ to: [{ ipBlock: { cidr: policy.network.apiServiceIp } }, { ipBlock: { cidr: policy.network.privateControlPlaneIp } }], ports: [{ protocol: 'TCP', port: 443 }] }],
      },
    },
  ];
}

function ensureSecret() {
  const exists = gcloud(['secrets', 'describe', policy.authentication.gcpSecret, '--project', policy.project, '--format=value(name)'], { allowFailure: true }).ok;
  if (!exists) {
    const token = randomBytes(48).toString('base64url');
    gcloud(['secrets', 'create', policy.authentication.gcpSecret, '--project', policy.project, '--replication-policy=automatic', '--data-file=-', '--quiet'], { input: token });
  }
  gcloud(['secrets', 'add-iam-policy-binding', policy.authentication.gcpSecret, '--project', policy.project, '--member', `serviceAccount:${runtimeIdentity}`, '--role', 'roles/secretmanager.secretAccessor', '--condition=None', '--quiet'], { capture: true });
  const token = gcloud(['secrets', 'versions', 'access', 'latest', '--secret', policy.authentication.gcpSecret, '--project', policy.project], { capture: true }).stdout;
  if (Buffer.byteLength(token) < policy.authentication.minimumTokenBytes) fail('control_token_invalid');
  return token;
}

function apply() {
  const token = ensureSecret();
  const resources = { apiVersion: 'v1', kind: 'List', items: publicResources(token) };
  kubectl(['apply', '--server-side=true', '--field-manager=clervo-sandbox-bootstrap', '--force-conflicts=false', '-f', '-'], { input: JSON.stringify(resources) });
  kubectl(['rollout', 'status', `deployment/${policy.deployment}`, '-n', policy.systemNamespace, '--timeout=300s'], { timeoutMs: 310_000 });
  return observe();
}

function canI(verb, resource, namespace = policy.executionNamespace, subresource) {
  return kubectl(['auth', 'can-i', verb, resource, ...(subresource ? ['--subresource', subresource] : []), '-n', namespace, '--as', `system:serviceaccount:${policy.systemNamespace}:${policy.serviceAccount}`], { capture: true, allowFailure: true }).stdout === 'yes';
}

function observe() {
  const deployment = JSON.parse(kubectl(['get', 'deployment', policy.deployment, '-n', policy.systemNamespace, '-o', 'json'], { capture: true }).stdout);
  const service = JSON.parse(kubectl(['get', 'service', policy.service, '-n', policy.systemNamespace, '-o', 'json'], { capture: true }).stdout);
  const pods = JSON.parse(kubectl(['get', 'pods', '-n', policy.systemNamespace, '-l', `app.kubernetes.io/name=${policy.deployment}`, '-o', 'json'], { capture: true }).stdout);
  const role = JSON.parse(kubectl(['get', 'role', policy.serviceAccount, '-n', policy.executionNamespace, '-o', 'json'], { capture: true }).stdout);
  const secrets = JSON.parse(kubectl(['get', 'secrets', '-n', policy.executionNamespace, '-o', 'json'], { capture: true }).stdout);
  const pod = pods.items[0]; const container = pod?.spec?.containers?.[0];
  const allowed = {
    createSandboxClaim: canI('create', 'sandboxclaims.extensions.agents.x-k8s.io'),
    createSandboxTemplate: canI('create', 'sandboxtemplates.extensions.agents.x-k8s.io'),
    getPod: canI('get', 'pods'),
    execPod: canI('get', 'pods', policy.executionNamespace, 'exec'),
    getNetworkPolicy: canI('get', 'networkpolicies.networking.k8s.io'),
  };
  const denied = {
    getSecret: !canI('get', 'secrets'), createPod: !canI('create', 'pods'), deletePod: !canI('delete', 'pods'),
    getNode: !canI('get', 'nodes'), patchNamespace: !canI('patch', 'namespaces'), createRole: !canI('create', 'roles.rbac.authorization.k8s.io'),
  };
  const result = {
    status: deployment.status?.availableReplicas === policy.replicas ? 'ready' : 'unready',
    availableReplicas: deployment.status?.availableReplicas ?? 0,
    image: container?.image ?? null,
    systemNodePool: pod?.spec?.nodeSelector?.['cloud.google.com/gke-nodepool'] ?? null,
    podReady: pod?.status?.conditions?.some((condition) => condition.type === 'Ready' && condition.status === 'True') === true,
    serviceType: service.spec?.type,
    serviceClusterIpAssigned: typeof service.spec?.clusterIP === 'string',
    publicEndpoint: (service.status?.loadBalancer?.ingress?.length ?? 0) > 0 || (service.spec?.externalIPs?.length ?? 0) > 0,
    roleRuleCount: role.rules?.length ?? 0,
    allowed,
    denied,
    executionNamespaceSecretCount: secrets.items?.length ?? 0,
    controlSecretPresent: kubectl(['get', 'secret', policy.authentication.kubernetesSecret, '-n', policy.systemNamespace, '-o', 'name'], { capture: true }).ok,
  };
  assert.equal(result.status, 'ready'); assert.equal(result.image, controlImage); assert.equal(result.systemNodePool, policy.boundaries.systemNodePool);
  assert.equal(result.podReady, true); assert.equal(result.serviceType, 'ClusterIP'); assert.equal(result.publicEndpoint, false);
  assert.ok(Object.values(result.allowed).every(Boolean)); assert.ok(Object.values(result.denied).every(Boolean));
  assert.equal(result.executionNamespaceSecretCount, 0); assert.equal(result.controlSecretPresent, true);
  return result;
}

async function portForward() {
  const child = spawn('kubectl', ['port-forward', `deployment/${policy.deployment}`, '-n', policy.systemNamespace, '18976:8080'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => finish(() => {
      child.kill('SIGTERM');
      reject(new Error('sandbox_control_port_forward_timeout'));
    }), 15_000);
    child.once('error', (error) => finish(() => reject(error)));
    const ready = (chunk) => { if (chunk.toString().includes('Forwarding from')) finish(resolve); };
    child.stdout.on('data', ready);
    child.stderr.on('data', ready);
    child.once('exit', (code) => finish(() => reject(new Error(`sandbox_control_port_forward_exit_${code}`))));
  });
  return child;
}

async function smoke() {
  const before = observe(); const token = ensureSecret(); const forward = await portForward();
  try {
    const ready = await fetch('http://127.0.0.1:18976/readyz', { signal: AbortSignal.timeout(5_000) }); assert.equal(ready.status, 200);
    const nonce = randomBytes(16).toString('hex');
    const request = {
      contractVersion: '2026-07-29.1', schemaVersion: 'sandbox-operation-request.v1', operationId: `op_${nonce}`,
      productId: 'sandbox.run', input: { kind: 'run', executionId: `exec_${nonce}`, imageDigest: policy.runnerDigest, command: ['node', '-e', 'process.stdout.write("sandbox-control-live")'], limits: { cpuMillis: 5_000, memoryBytes: 268_435_456, processes: 64, diskBytes: 10_485_760, outputBytes: 65_536, artifactBytes: 4_096, wallTimeMs: 10_000 } },
      maximumCharge: { asset: 'USD', amountAtomic: '1000', decimals: 6 }, deadlineAt: new Date(Date.now() + 180_000).toISOString(),
    };
    const invoke = () => fetch('http://127.0.0.1:18976/internal/v1/sandbox/run', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-clervo-tenant-id': `tenant_${nonce}`, 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(150_000) });
    const first = await invoke();
    const result = await first.json();
    if (first.status !== 200) throw new Error(`sandbox_control_smoke_http_${first.status}_${typeof result?.code === 'string' ? result.code : 'unknown'}`);
    assert.equal(first.headers.get('x-clervo-replay'), 'false');
    const stdout = Buffer.from(result.output.stdoutBase64, 'base64');
    const stderr = Buffer.from(result.output.stderrBase64, 'base64');
    if (stdout.toString() !== 'sandbox-control-live') throw new Error(`sandbox_control_smoke_output_invalid_exit_${result.output.exitCode}_stdout_${stdout.byteLength}_stderr_${stderr.byteLength}`);
    assert.equal(result.output.sessionState, 'destroyed'); assert.equal(result.meteredCharge.amountAtomic, '0');
    const replay = await invoke(); assert.equal(replay.status, 200); assert.equal(replay.headers.get('x-clervo-replay'), 'true'); assert.deepEqual(await replay.json(), result);
    const claims = JSON.parse(kubectl(['get', 'sandboxclaims', '-n', policy.executionNamespace, '-l', 'clervo.dev/owner=sandbox-control-plane', '-o', 'json'], { capture: true }).stdout);
    const templates = JSON.parse(kubectl(['get', 'sandboxtemplates', '-n', policy.executionNamespace, '-l', 'clervo.dev/owner=sandbox-control-plane', '-o', 'json'], { capture: true }).stdout);
    assert.equal(claims.items.length, 0); assert.equal(templates.items.length, 0);
    const report = {
      schemaVersion: 'clervo.sandbox-control-live-smoke.v1', evaluatedAt: new Date().toISOString(), status: 'passed',
      controlImageDigest: policy.imageDigest, runnerImageDigest: policy.runnerDigest, privateService: true, publicEndpoint: false,
      authenticated: true, usefulResult: true, replayWithoutExecution: true, cleanupVerified: true, chargedMicrousd: 0, infrastructure: before,
    };
    await writeFile(new URL('../../docs/evidence/sandbox/control-service-live-smoke.v1.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally { forward.kill('SIGTERM'); }
}

let result;
if (action === 'plan') result = { action: 'plan', policy: { ...policy, authentication: { ...policy.authentication, value: '[runtime-only]' } } };
else if (action === 'apply') result = { action: 'applied', ...apply() };
else if (action === 'observe') result = { action: 'observed', ...observe() };
else if (action === 'smoke') result = { action: 'smoke', ...(await smoke()) };
else fail('usage_plan_apply_observe_smoke');
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
