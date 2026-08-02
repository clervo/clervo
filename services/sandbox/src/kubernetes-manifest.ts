import { createHash } from 'node:crypto';

import type { SandboxLimits } from './control-plane.js';

export interface SandboxPodInput {
  sessionId: string;
  tenantId: string;
  imageDigest: string;
  command: readonly string[];
  limits: SandboxLimits;
}

type JsonObject = Readonly<Record<string, unknown>>;

const executionNamespace = 'clervo-sandbox-execution';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function requireIdentity(value: string, prefix: 'sbx' | 'tenant'): void {
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]{20,64}$`, 'u').test(value)) throw new TypeError('sandbox_manifest_identity_invalid');
}

function requireDigest(value: string): void {
  if (!/^sha256:[a-f0-9]{64}$/u.test(value)) throw new TypeError('sandbox_manifest_digest_invalid');
}

function requireCommand(value: readonly string[]): void {
  if (value.length < 1 || value.length > 32 || value.some((part) => part.length < 1 || part.length > 4096 || part.includes('\0'))) throw new TypeError('sandbox_manifest_command_invalid');
}

function requireLimits(value: SandboxLimits): void {
  const bounds: Readonly<Record<keyof SandboxLimits, readonly [number, number]>> = {
    cpuMillis: [1, 300_000], memoryBytes: [16_777_216, 8_589_934_592], processes: [1, 256], diskBytes: [1_048_576, 10_737_418_240],
    outputBytes: [1, 10_485_760], artifactBytes: [1, 104_857_600], wallTimeMs: [100, 300_000], maximumChargeMicrousd: [1, 1_000_000],
  };
  for (const key of Object.keys(bounds) as (keyof SandboxLimits)[]) {
    const [minimum, maximum] = bounds[key];
    if (!Number.isSafeInteger(value[key]) || value[key] < minimum || value[key] > maximum) throw new TypeError(`sandbox_manifest_limit_invalid:${key}`);
  }
}

export function sandboxBoundaryManifests(): readonly JsonObject[] {
  return Object.freeze([
    Object.freeze({
      apiVersion: 'v1', kind: 'Namespace', metadata: { name: executionNamespace, labels: { 'clervo.dev/plane': 'sandbox-execution', 'pod-security.kubernetes.io/enforce': 'restricted', 'pod-security.kubernetes.io/enforce-version': 'latest' } },
    }),
    Object.freeze({
      apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy', metadata: { name: 'default-deny-all', namespace: executionNamespace },
      spec: { podSelector: {}, policyTypes: ['Ingress', 'Egress'], ingress: [], egress: [] },
    }),
  ]);
}

export function buildSandboxPod(input: Readonly<SandboxPodInput>): JsonObject {
  requireIdentity(input.sessionId, 'sbx'); requireIdentity(input.tenantId, 'tenant'); requireDigest(input.imageDigest); requireCommand(input.command); requireLimits(input.limits);
  const sessionHash = hash(input.sessionId); const tenantHash = hash(input.tenantId);
  const activeDeadlineSeconds = Math.max(1, Math.ceil(input.limits.wallTimeMs / 1000));
  const annotations = {
    'clervo.dev/session-id': input.sessionId,
    'clervo.dev/image-digest': input.imageDigest,
    'clervo.dev/cpu-budget-millis': String(input.limits.cpuMillis),
    'clervo.dev/process-limit': String(input.limits.processes),
    'clervo.dev/output-limit-bytes': String(input.limits.outputBytes),
    'clervo.dev/artifact-limit-bytes': String(input.limits.artifactBytes),
    'clervo.dev/maximum-charge-microusd': String(input.limits.maximumChargeMicrousd),
  };
  return Object.freeze({
    apiVersion: 'v1', kind: 'Pod',
    metadata: { name: `sbx-${sessionHash}`, namespace: executionNamespace, labels: { 'app.kubernetes.io/name': 'clervo-sandbox', 'clervo.dev/owner': 'sandbox-control-plane', 'clervo.dev/session-hash': sessionHash, 'clervo.dev/tenant-hash': tenantHash }, annotations },
    spec: {
      runtimeClassName: 'gvisor', restartPolicy: 'Never', activeDeadlineSeconds, terminationGracePeriodSeconds: 1,
      automountServiceAccountToken: false, enableServiceLinks: false, hostNetwork: false, hostPID: false, hostIPC: false, shareProcessNamespace: false,
      nodeSelector: { 'sandbox.gke.io/runtime': 'gvisor', 'clervo.dev/node-pool': 'sandbox-execution', 'clervo.dev/execution-plane': 'true' },
      tolerations: [
        { key: 'sandbox.gke.io/runtime', operator: 'Equal', value: 'gvisor', effect: 'NoSchedule' },
        { key: 'clervo.dev/sandbox-only', operator: 'Equal', value: 'true', effect: 'NoSchedule' },
      ],
      securityContext: { runAsNonRoot: true, runAsUser: 65532, runAsGroup: 65532, fsGroup: 65532, seccompProfile: { type: 'RuntimeDefault' } },
      containers: [{
        name: 'execution', image: `clervo-sandbox@${input.imageDigest}`, imagePullPolicy: 'IfNotPresent', command: [...input.command], workingDir: '/workspace',
        securityContext: { allowPrivilegeEscalation: false, privileged: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
        resources: { requests: { cpu: '10m', memory: String(input.limits.memoryBytes), 'ephemeral-storage': String(input.limits.diskBytes) }, limits: { cpu: '1000m', memory: String(input.limits.memoryBytes), 'ephemeral-storage': String(input.limits.diskBytes) } },
        volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }, { name: 'tmp', mountPath: '/tmp' }],
      }],
      volumes: [{ name: 'workspace', emptyDir: { sizeLimit: String(input.limits.diskBytes) } }, { name: 'tmp', emptyDir: { medium: 'Memory', sizeLimit: '16777216' } }],
    },
  });
}

export const sandboxExecutionNamespace = executionNamespace;
