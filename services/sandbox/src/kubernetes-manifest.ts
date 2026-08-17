import { createHash } from 'node:crypto';

import type { SandboxLimits } from './control-plane.js';

export interface AgentSandboxResourceInput {
  sessionId: string;
  tenantId: string;
  imageRepository: string;
  imageDigest: string;
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

function requireRepository(value: string): void {
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?\/[a-z0-9][a-z0-9._/-]{2,255}$/u.test(value) || value.includes('@') || value.endsWith('/')) throw new TypeError('sandbox_manifest_repository_invalid');
}

function requireLimits(value: SandboxLimits): void {
  const bounds: Readonly<Record<keyof SandboxLimits, readonly [number, number]>> = {
    cpuMillis: [1, 300_000], memoryBytes: [16_777_216, 8_589_934_592], processes: [1, 256], diskBytes: [1_048_576, 10_737_418_240],
    outputBytes: [1, 1_048_576], artifactBytes: [1, 1_048_576], wallTimeMs: [100, 300_000], maximumChargeMicrousd: [1, 1_000_000],
  };
  for (const key of Object.keys(bounds) as (keyof SandboxLimits)[]) {
    const [minimum, maximum] = bounds[key];
    if (!Number.isSafeInteger(value[key]) || value[key] < minimum || value[key] > maximum) throw new TypeError(`sandbox_manifest_limit_invalid:${key}`);
  }
}

export function agentSandboxResourceName(sessionId: string): string {
  requireIdentity(sessionId, 'sbx');
  return `sbx-${hash(sessionId)}`;
}

export function sandboxBoundaryManifests(): readonly JsonObject[] {
  return Object.freeze([
    Object.freeze({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: executionNamespace,
        labels: {
          'clervo.dev/plane': 'sandbox-execution',
          'clervo.dev/network-data-plane': 'gke-dataplane-v2',
          'pod-security.kubernetes.io/enforce': 'restricted',
          'pod-security.kubernetes.io/enforce-version': 'latest',
        },
      },
    }),
  ]);
}

export function buildAgentSandboxResources(input: Readonly<AgentSandboxResourceInput>): readonly JsonObject[] {
  requireIdentity(input.sessionId, 'sbx'); requireIdentity(input.tenantId, 'tenant'); requireRepository(input.imageRepository); requireDigest(input.imageDigest); requireLimits(input.limits);
  const sessionHash = hash(input.sessionId); const tenantHash = hash(input.tenantId);
  const activeDeadlineSeconds = Math.max(1, Math.ceil(input.limits.wallTimeMs / 1000));
  const resourceName = agentSandboxResourceName(input.sessionId);
  const annotations = {
    'clervo.dev/session-id': input.sessionId,
    'clervo.dev/image-digest': input.imageDigest,
    'clervo.dev/cpu-budget-millis': String(input.limits.cpuMillis),
    'clervo.dev/process-limit': String(input.limits.processes),
    'clervo.dev/output-limit-bytes': String(input.limits.outputBytes),
    'clervo.dev/artifact-limit-bytes': String(input.limits.artifactBytes),
    'clervo.dev/maximum-charge-microusd': String(input.limits.maximumChargeMicrousd),
  };
  const labels = { 'app.kubernetes.io/name': 'clervo-sandbox', 'clervo.dev/owner': 'sandbox-control-plane', 'clervo.dev/session-hash': sessionHash, 'clervo.dev/tenant-hash': tenantHash };
  const template = Object.freeze({
    apiVersion: 'extensions.agents.x-k8s.io/v1alpha1',
    kind: 'SandboxTemplate',
    metadata: { name: resourceName, namespace: executionNamespace, labels, annotations },
    spec: {
      networkPolicyManagement: 'Managed',
      networkPolicy: { ingress: [], egress: [] },
      podTemplate: {
        metadata: { labels, annotations },
        spec: {
          runtimeClassName: 'gvisor', restartPolicy: 'Always', activeDeadlineSeconds, terminationGracePeriodSeconds: 1,
          automountServiceAccountToken: false, enableServiceLinks: false, hostNetwork: false, hostPID: false, hostIPC: false, shareProcessNamespace: false,
          nodeSelector: { 'sandbox.gke.io/runtime': 'gvisor', 'clervo.dev/node-pool': 'sandbox-execution', 'clervo.dev/execution-plane': 'true' },
          tolerations: [
            { key: 'sandbox.gke.io/runtime', operator: 'Equal', value: 'gvisor', effect: 'NoSchedule' },
            { key: 'clervo.dev/sandbox-only', operator: 'Equal', value: 'true', effect: 'NoSchedule' },
          ],
          securityContext: { runAsNonRoot: true, runAsUser: 65532, runAsGroup: 65532, fsGroup: 65532, seccompProfile: { type: 'RuntimeDefault' } },
          containers: [{
            name: 'runtime', image: `${input.imageRepository}@${input.imageDigest}`, imagePullPolicy: 'IfNotPresent', workingDir: '/workspace',
            securityContext: { allowPrivilegeEscalation: false, privileged: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
            resources: { requests: { cpu: '10m', memory: String(input.limits.memoryBytes), 'ephemeral-storage': String(input.limits.diskBytes) }, limits: { cpu: '1000m', memory: String(input.limits.memoryBytes), 'ephemeral-storage': String(input.limits.diskBytes) } },
            volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }, { name: 'tmp', mountPath: '/tmp' }],
          }],
          volumes: [{ name: 'workspace', emptyDir: { sizeLimit: String(input.limits.diskBytes) } }, { name: 'tmp', emptyDir: { medium: 'Memory', sizeLimit: '16777216' } }],
        },
      },
    },
  });
  const claim = Object.freeze({
    apiVersion: 'extensions.agents.x-k8s.io/v1alpha1',
    kind: 'SandboxClaim',
    metadata: { name: resourceName, namespace: executionNamespace, labels },
    spec: { sandboxTemplateRef: { name: resourceName }, lifecycle: { shutdownPolicy: 'DeleteForeground', ttlSecondsAfterFinished: 60 } },
  });
  return Object.freeze([template, claim]);
}

export const sandboxExecutionNamespace = executionNamespace;
