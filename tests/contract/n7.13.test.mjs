import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { AgentSandboxExecutor } from '../../dist/adapters/sandbox/src/agent-sandbox.js';
import { KubernetesAgentSandboxTransport } from '../../dist/adapters/sandbox/src/kubernetes-client-transport.js';

const sessionId = 'sbx_0123456789ABCDEFGHIJ';
const tenantId = 'tenant_0123456789ABCDEFGHIJ';
const executionId = 'exec_0123456789ABCDEFGHIJ';
const imageDigest = `sha256:${'7'.repeat(64)}`;
const imageRepository = 'us-central1-docker.pkg.dev/bloxsniper-prod/clervo-sandbox/runner';
const limits = { cpuMillis: 1000, memoryBytes: 134217728, processes: 16, diskBytes: 10485760, outputBytes: 1024, artifactBytes: 4096, wallTimeMs: 2000, maximumChargeMicrousd: 1000 };

function dependencies(overrides = {}) {
  const calls = [];
  const objects = {
    async create(resource) { calls.push(['create', resource.kind]); return resource; },
    async delete(resource, ...options) { calls.push(['delete', resource.kind, options]); return {}; },
    async read() { const error = new Error('not found'); error.code = 404; throw error; },
    async list() { return { items: [{ metadata: { annotations: { 'clervo.dev/session-id': sessionId } } }] }; },
  };
  const core = {
    async readNamespacedPod() {
      return {
        metadata: { name: 'runtime' }, status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
        spec: {
          runtimeClassName: 'gvisor', automountServiceAccountToken: false,
          nodeSelector: { 'clervo.dev/node-pool': 'sandbox-execution', 'clervo.dev/execution-plane': 'true' },
          containers: [{ name: 'runtime', image: `${imageRepository}@${imageDigest}`, securityContext: { readOnlyRootFilesystem: true } }],
          volumes: [{ name: 'workspace', emptyDir: {} }],
        },
      };
    },
  };
  const network = { async readNamespacedNetworkPolicy({ name }) { return { metadata: { name }, spec: { ingress: [], egress: [] } }; } };
  const exec = {
    async exec(_namespace, _pod, _container, command, stdout, stderr, stdin, _tty, status) {
      calls.push(['exec', command]);
      const socket = new EventEmitter(); socket.close = () => socket.emit('close');
      setImmediate(async () => {
        const input = [];
        for await (const chunk of stdin) input.push(chunk);
        calls.push(['stdin', Buffer.concat(input).toString('utf8')]);
        stdout.write(JSON.stringify({ exitCode: 0, stdoutBase64: Buffer.from('ok').toString('base64'), stderrBase64: '', cpuMillis: 4, durationMs: 8, maximumProcessesObserved: 1, limitFailure: null }));
        stderr.end(); stdout.end(); status({ status: 'Success' }); socket.emit('close');
      });
      return socket;
    },
  };
  const clients = { objects, core, network, exec, ...overrides };
  const transport = new KubernetesAgentSandboxTransport({ clients, pollIntervalMs: 10 });
  const executor = new AgentSandboxExecutor({ transport, config: { imageRepository, readinessTimeoutMs: 1000 } });
  return { calls, clients, transport, executor };
}

test('production Kubernetes transport creates only Agent Sandbox resources and observes the live boundary', async () => {
  const deps = dependencies();
  const attestation = await deps.executor.create({ sessionId, tenantId, imageDigest, limits });
  assert.deepEqual(deps.calls.filter(([operation]) => operation === 'create').map(([, kind]) => kind), ['SandboxTemplate', 'SandboxClaim']);
  assert.deepEqual(attestation, {
    runtimeClass: 'gvisor', dedicatedExecutionNodes: true, controlPlaneSeparated: true, networkDefaultDeny: true,
    serviceAccountTokenMounted: false, executionNodeSecrets: false, imageDigest, readOnlyRootFilesystem: true,
  });
  assert.deepEqual(await deps.executor.list(), [sessionId]);
});

test('production Kubernetes transport streams only the fixed runner and deletes in foreground order', async () => {
  const deps = dependencies();
  const result = await deps.executor.execute({ sessionId, executionId, command: ['node', 'main.js'], stdin: new Uint8Array(), limits });
  assert.equal(new TextDecoder().decode(result.stdout), 'ok');
  assert.deepEqual(deps.calls.find(([operation]) => operation === 'exec')[1], ['node', '/opt/clervo/runner.mjs']);
  assert.match(deps.calls.find(([operation]) => operation === 'stdin')[1], /^\{"command":\["node","main\.js"\]/u);
  await deps.executor.destroy(sessionId);
  assert.deepEqual(deps.calls.filter(([operation]) => operation === 'delete').map(([, kind]) => kind), ['SandboxClaim', 'SandboxTemplate']);
  assert.ok(deps.calls.filter(([operation]) => operation === 'delete').every(([, , options]) => options.at(-1) === 'Foreground'));
});

test('production Kubernetes transport fails closed on foreign resources, credentials, and excess output', async () => {
  const deps = dependencies();
  await assert.rejects(deps.transport.apply([{ apiVersion: 'v1', kind: 'Pod', metadata: { name: 'foreign' } }]), /resource_set_invalid/u);
  const credentialed = dependencies({ core: { async readNamespacedPod() { const pod = await deps.clients.core.readNamespacedPod(); pod.spec.automountServiceAccountToken = true; return pod; } } });
  const observed = await credentialed.executor.create({ sessionId, tenantId, imageDigest, limits });
  assert.equal(observed.serviceAccountTokenMounted, true);
  const flooding = dependencies({ exec: { async exec(_namespace, _pod, _container, _command, stdout) { const socket = new EventEmitter(); socket.close = () => socket.emit('close'); setImmediate(() => stdout.write(Buffer.alloc(70_000))); return socket; } } });
  await assert.rejects(flooding.executor.execute({ sessionId, executionId, command: ['node'], stdin: new Uint8Array(), limits }), /execute_failed/u);
});
