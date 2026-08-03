import { Readable, Writable } from 'node:stream';

import {
  CoreV1Api,
  Exec,
  KubeConfig,
  KubernetesObjectApi,
  NetworkingV1Api,
  type KubernetesObject,
  type V1NetworkPolicy,
  type V1Pod,
  type V1Status,
} from '@kubernetes/client-node';

import type {
  AgentSandboxRuntimeObservation,
  AgentSandboxTransport,
} from './agent-sandbox.js';

type JsonObject = Readonly<Record<string, unknown>>;

interface ObjectClient {
  create(resource: KubernetesObject): Promise<KubernetesObject>;
  delete(resource: KubernetesObject, pretty?: string, dryRun?: string, gracePeriodSeconds?: number, orphanDependents?: boolean, propagationPolicy?: string): Promise<unknown>;
  read(resource: Readonly<{ apiVersion: string; kind: string; metadata: { name: string; namespace?: string } }>): Promise<KubernetesObject>;
  list(apiVersion: string, kind: string, namespace?: string, pretty?: string, exact?: boolean, exportValue?: boolean, fieldSelector?: string, labelSelector?: string): Promise<Readonly<{ items: readonly KubernetesObject[] }>>;
}

interface CoreClient {
  readNamespacedPod(input: Readonly<{ name: string; namespace: string }>): Promise<V1Pod>;
}

interface NetworkClient {
  readNamespacedNetworkPolicy(input: Readonly<{ name: string; namespace: string }>): Promise<V1NetworkPolicy>;
}

interface ExecClient {
  exec(namespace: string, podName: string, containerName: string, command: string | string[], stdout: Writable | null, stderr: Writable | null, stdin: Readable | null, tty: boolean, statusCallback?: (status: V1Status) => void): Promise<Readonly<{ once(event: string, listener: (...args: unknown[]) => void): unknown; close(): void }>>;
}

interface Clients {
  objects: ObjectClient;
  core: CoreClient;
  network: NetworkClient;
  exec: ExecClient;
}

const expectedNamespace = 'clervo-sandbox-execution';
const expectedOwner = 'sandbox-control-plane';

function errorStatus(error: unknown): number | undefined {
  if (error === null || typeof error !== 'object') return undefined;
  const value = error as { code?: unknown; statusCode?: unknown; body?: { code?: unknown } };
  for (const candidate of [value.code, value.statusCode, value.body?.code]) if (Number.isSafeInteger(candidate)) return candidate as number;
  return undefined;
}

function metadata(resource: JsonObject): Readonly<{ name: string; namespace?: string; labels?: Readonly<Record<string, string>>; annotations?: Readonly<Record<string, string>> }> {
  const value = resource.metadata;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('kubernetes_transport_resource_invalid');
  return value as { name: string; namespace?: string; labels?: Readonly<Record<string, string>>; annotations?: Readonly<Record<string, string>> };
}

function validateResource(resource: JsonObject): 'boundary' | 'template' | 'claim' {
  const resourceMetadata = metadata(resource);
  if (resource.kind === 'Namespace') {
    if (resource.apiVersion !== 'v1' || resourceMetadata.name !== expectedNamespace) throw new TypeError('kubernetes_transport_boundary_invalid');
    return 'boundary';
  }
  if (resource.apiVersion !== 'extensions.agents.x-k8s.io/v1alpha1' || resourceMetadata.namespace !== expectedNamespace
    || resourceMetadata.labels?.['clervo.dev/owner'] !== expectedOwner || !/^sbx-[a-f0-9]{24}$/u.test(resourceMetadata.name)) {
    throw new TypeError('kubernetes_transport_resource_invalid');
  }
  if (resource.kind === 'SandboxTemplate') return 'template';
  if (resource.kind === 'SandboxClaim') return 'claim';
  throw new TypeError('kubernetes_transport_kind_refused');
}

function ready(pod: V1Pod): boolean {
  return pod.status?.phase === 'Running'
    && pod.status.conditions?.some(({ type, status }) => type === 'Ready' && status === 'True') === true;
}

function projectedCredentialPresent(pod: V1Pod): boolean {
  if (pod.spec?.automountServiceAccountToken !== false) return true;
  return pod.spec?.volumes?.some(({ secret, projected }) => secret !== undefined || projected !== undefined) === true
    || pod.spec?.containers?.some(({ env, envFrom }) => (envFrom?.length ?? 0) > 0
      || env?.some(({ valueFrom }) => valueFrom?.secretKeyRef !== undefined) === true) === true;
}

class BoundedWritable extends Writable {
  readonly chunks: Buffer[] = [];
  size = 0;

  constructor(private readonly maximumBytes: number) { super(); }

  override _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
    if (this.size + bytes.byteLength > this.maximumBytes) { callback(new Error('kubernetes_transport_output_limit')); return; }
    this.size += bytes.byteLength; this.chunks.push(Buffer.from(bytes)); callback();
  }

  bytes(): Uint8Array { return new Uint8Array(Buffer.concat(this.chunks)); }
}

function exitCode(status: V1Status | undefined): number {
  if (status?.status === 'Success') return 0;
  const cause = status?.details?.causes?.find(({ reason }) => reason === 'ExitCode');
  const parsed = Number(cause?.message);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 255 ? parsed : 1;
}

export class KubernetesAgentSandboxTransport implements AgentSandboxTransport {
  readonly #clients: Clients;
  readonly #pollIntervalMs: number;

  constructor(input: Readonly<{ clients: Clients; pollIntervalMs?: number }>) {
    const pollIntervalMs = input.pollIntervalMs ?? 250;
    if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 10 || pollIntervalMs > 5_000) throw new TypeError('kubernetes_transport_config_invalid');
    this.#clients = input.clients; this.#pollIntervalMs = pollIntervalMs;
  }

  static fromCluster(): KubernetesAgentSandboxTransport {
    const config = new KubeConfig(); config.loadFromCluster();
    return new KubernetesAgentSandboxTransport({
      clients: {
        objects: KubernetesObjectApi.makeApiClient(config),
        core: config.makeApiClient(CoreV1Api),
        network: config.makeApiClient(NetworkingV1Api),
        exec: new Exec(config),
      },
    });
  }

  async apply(resources: readonly JsonObject[]): Promise<void> {
    if (resources.length !== 3 || validateResource(resources[0] ?? {}) !== 'boundary'
      || validateResource(resources[1] ?? {}) !== 'template' || validateResource(resources[2] ?? {}) !== 'claim') {
      throw new TypeError('kubernetes_transport_resource_set_invalid');
    }
    await this.#clients.objects.create(resources[1] as unknown as KubernetesObject);
    try { await this.#clients.objects.create(resources[2] as unknown as KubernetesObject); }
    catch (error) {
      try { await this.#deleteResource(resources[1] as unknown as KubernetesObject); } catch { /* the caller reports cleanup uncertainty */ }
      throw error;
    }
  }

  async waitForReady(input: Readonly<{ namespace: string; claimName: string; timeoutMs: number }>): Promise<Readonly<AgentSandboxRuntimeObservation>> {
    if (input.namespace !== expectedNamespace || !/^sbx-[a-f0-9]{24}$/u.test(input.claimName)
      || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1_000 || input.timeoutMs > 300_000) throw new TypeError('kubernetes_transport_wait_invalid');
    const deadline = Date.now() + input.timeoutMs;
    let pod: V1Pod | undefined;
    while (Date.now() < deadline) {
      try { pod = await this.#clients.core.readNamespacedPod({ name: input.claimName, namespace: input.namespace }); }
      catch (error) { if (errorStatus(error) !== 404) throw error; }
      if (pod && ready(pod)) break;
      await new Promise((resolve) => setTimeout(resolve, this.#pollIntervalMs));
    }
    if (!pod || !ready(pod)) throw new Error('kubernetes_transport_readiness_timeout');
    const policy = await this.#clients.network.readNamespacedNetworkPolicy({ name: `${input.claimName}-network-policy`, namespace: input.namespace });
    const container = pod.spec?.containers?.find(({ name }) => name === 'runtime');
    if (!container) throw new Error('kubernetes_transport_runtime_missing');
    return Object.freeze({
      runtimeClassName: pod.spec?.runtimeClassName ?? '',
      image: container.image ?? '',
      dedicatedExecutionNode: pod.spec?.nodeSelector?.['clervo.dev/node-pool'] === 'sandbox-execution'
        && pod.spec?.nodeSelector?.['clervo.dev/execution-plane'] === 'true',
      controlPlaneSeparated: pod.spec?.nodeSelector?.['clervo.dev/node-pool'] === 'sandbox-execution',
      networkPolicyManagement: policy.metadata?.name === `${input.claimName}-network-policy`
        && (policy.spec?.ingress?.length ?? 0) === 0 && (policy.spec?.egress?.length ?? 0) === 0 ? 'Managed' : 'Unverified',
      networkPolicyIngressRules: policy.spec?.ingress?.length ?? 0,
      networkPolicyEgressRules: policy.spec?.egress?.length ?? 0,
      serviceAccountTokenMounted: pod.spec?.automountServiceAccountToken !== false,
      executionNodeSecretsPresent: projectedCredentialPresent(pod),
      readOnlyRootFilesystem: container.securityContext?.readOnlyRootFilesystem === true,
    });
  }

  async exec(input: Readonly<{ namespace: string; podName: string; command: readonly string[]; stdin: Uint8Array; timeoutMs: number; maximumOutputBytes: number }>): Promise<Readonly<{ stdout: Uint8Array; stderr: Uint8Array; exitCode: number }>> {
    if (input.namespace !== expectedNamespace || !/^sbx-[a-f0-9]{24}$/u.test(input.podName)
      || input.command.length < 1 || input.command.length > 16 || input.stdin.byteLength > 1_500_000
      || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1_000 || input.timeoutMs > 315_000
      || !Number.isSafeInteger(input.maximumOutputBytes) || input.maximumOutputBytes < 1 || input.maximumOutputBytes > 10_551_296) throw new TypeError('kubernetes_transport_exec_invalid');
    const stdout = new BoundedWritable(input.maximumOutputBytes);
    const stderr = new BoundedWritable(input.maximumOutputBytes);
    let observedStatus: V1Status | undefined;
    const socket = await this.#clients.exec.exec(input.namespace, input.podName, 'runtime', [...input.command], stdout, stderr, Readable.from([Buffer.from(input.stdin)]), false, (status) => { observedStatus = status; });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('kubernetes_transport_exec_timeout')); }, input.timeoutMs);
      socket.once('close', () => { clearTimeout(timer); resolve(); });
      socket.once('error', () => { clearTimeout(timer); reject(new Error('kubernetes_transport_exec_failed')); });
      stdout.once('error', (error) => { clearTimeout(timer); reject(error); socket.close(); });
      stderr.once('error', (error) => { clearTimeout(timer); reject(error); socket.close(); });
    });
    if (stdout.size + stderr.size > input.maximumOutputBytes) throw new Error('kubernetes_transport_output_limit');
    return Object.freeze({ stdout: stdout.bytes(), stderr: stderr.bytes(), exitCode: exitCode(observedStatus) });
  }

  async delete(input: Readonly<{ namespace: string; kind: 'SandboxClaim' | 'SandboxTemplate'; name: string; foreground: boolean }>): Promise<void> {
    if (input.namespace !== expectedNamespace || !/^sbx-[a-f0-9]{24}$/u.test(input.name) || input.foreground !== true) throw new TypeError('kubernetes_transport_delete_invalid');
    await this.#deleteResource({ apiVersion: 'extensions.agents.x-k8s.io/v1alpha1', kind: input.kind, metadata: { namespace: input.namespace, name: input.name } });
  }

  async listSessionIds(namespace: string): Promise<readonly string[]> {
    if (namespace !== expectedNamespace) throw new TypeError('kubernetes_transport_list_invalid');
    const listed = await this.#clients.objects.list('extensions.agents.x-k8s.io/v1alpha1', 'SandboxTemplate', namespace, undefined, undefined, undefined, undefined, `clervo.dev/owner=${expectedOwner}`);
    const ids = listed.items.map((item) => item.metadata?.annotations?.['clervo.dev/session-id']).filter((value): value is string => typeof value === 'string' && /^sbx_[A-Za-z0-9]{20,64}$/u.test(value));
    if (ids.length !== listed.items.length || new Set(ids).size !== ids.length) throw new Error('kubernetes_transport_session_inventory_invalid');
    return Object.freeze(ids);
  }

  async #deleteResource(resource: KubernetesObject): Promise<void> {
    try { await this.#clients.objects.delete(resource, undefined, undefined, 0, undefined, 'Foreground'); }
    catch (error) { if (errorStatus(error) !== 404) throw error; }
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      try { await this.#clients.objects.read(resource as { apiVersion: string; kind: string; metadata: { name: string; namespace?: string } }); }
      catch (error) { if (errorStatus(error) === 404) return; throw error; }
      await new Promise((resolve) => setTimeout(resolve, this.#pollIntervalMs));
    }
    throw new Error('kubernetes_transport_cleanup_timeout');
  }
}
