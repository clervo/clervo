import { createHash } from 'node:crypto';
import type { SandboxAttestation, SandboxExecutor, SandboxLimits } from '../../../services/sandbox/src/control-plane.js';
import { SANDBOX_MAX_REQUEST_BYTES, type SandboxArtifactInput, type SandboxFileInput } from '../../../packages/contracts/src/sandbox.js';
import {
  agentSandboxResourceName,
  buildAgentSandboxResources,
  sandboxBoundaryManifests,
  sandboxExecutionNamespace,
} from '../../../services/sandbox/src/kubernetes-manifest.js';

type JsonObject = Readonly<Record<string, unknown>>;

export interface AgentSandboxRuntimeObservation {
  runtimeClassName: string;
  image: string;
  dedicatedExecutionNode: boolean;
  controlPlaneSeparated: boolean;
  networkPolicyManagement: string;
  networkPolicyIngressRules: number;
  networkPolicyEgressRules: number;
  serviceAccountTokenMounted: boolean;
  executionNodeSecretsPresent: boolean;
  readOnlyRootFilesystem: boolean;
}

export interface AgentSandboxTransport {
  apply(resources: readonly JsonObject[]): Promise<void>;
  waitForReady(input: Readonly<{ namespace: string; claimName: string; timeoutMs: number }>): Promise<Readonly<AgentSandboxRuntimeObservation>>;
  exec(input: Readonly<{ namespace: string; podName: string; command: readonly string[]; stdin: Uint8Array; timeoutMs: number; maximumOutputBytes: number }>): Promise<Readonly<{ stdout: Uint8Array; stderr: Uint8Array; exitCode: number }>>;
  delete(input: Readonly<{ namespace: string; kind: 'SandboxClaim' | 'SandboxTemplate'; name: string; foreground: boolean }>): Promise<void>;
  listSessionIds(namespace: string): Promise<readonly string[]>;
}

export interface AgentSandboxExecutorConfig {
  imageRepository: string;
  readinessTimeoutMs: number;
}

interface RunnerResult {
  exitCode: number;
  stdoutBase64: string;
  stderrBase64: string;
  cpuMillis: number;
  durationMs: number;
  maximumProcessesObserved: number;
  limitFailure: null | 'process_limit' | 'output_limit' | 'wall_time_limit' | 'cpu_limit' | 'artifact_limit';
  artifacts: readonly { path: string; filename: string; mimeType: string; bytes: number; sha256: string; contentBase64: string }[];
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('agent_sandbox_runner_response_invalid');
  return value as Record<string, unknown>;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new Error('agent_sandbox_runner_response_invalid');
  return value as number;
}

function canonicalBase64(value: unknown, maximumBytes: number): Uint8Array {
  if (typeof value !== 'string' || value.length > Math.ceil(maximumBytes / 3) * 4 + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw new Error('agent_sandbox_runner_response_invalid');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength > maximumBytes || bytes.toString('base64') !== value) throw new Error('agent_sandbox_runner_response_invalid');
  return new Uint8Array(bytes);
}

function maximumRunnerResponseBytes(limits: SandboxLimits): number {
  return Math.ceil(limits.outputBytes / 3) * 4 + Math.ceil(limits.artifactBytes / 3) * 4 + 65_536;
}

function parseRunnerResult(bytes: Uint8Array, maximumOutputBytes: number, limits: SandboxLimits): Readonly<RunnerResult & { stdout: Uint8Array; stderr: Uint8Array }> {
  let source: Record<string, unknown>;
  try { source = parseRecord(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
  catch { throw new Error('agent_sandbox_runner_response_invalid'); }
  const stdout = canonicalBase64(source.stdoutBase64, maximumOutputBytes);
  const stderr = canonicalBase64(source.stderrBase64, maximumOutputBytes);
  if (stdout.byteLength + stderr.byteLength > maximumOutputBytes) throw new Error('agent_sandbox_runner_response_invalid');
  const limitFailure = source.limitFailure;
  if (limitFailure !== null && !['process_limit', 'output_limit', 'wall_time_limit', 'cpu_limit', 'artifact_limit'].includes(String(limitFailure))) throw new Error('agent_sandbox_runner_response_invalid');
  const rawArtifacts = source.artifacts ?? [];
  if (!Array.isArray(rawArtifacts) || rawArtifacts.length > 32) throw new Error('agent_sandbox_runner_response_invalid');
  const artifacts = rawArtifacts.map((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) throw new Error('agent_sandbox_runner_response_invalid');
    const value = item as Record<string, unknown>;
    if (typeof value.path !== 'string' || !/^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*\\)[A-Za-z0-9._ -]+(?:\/[A-Za-z0-9._ -]+)*$/u.test(value.path)
      || typeof value.filename !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/u.test(value.filename)
      || typeof value.mimeType !== 'string' || !/^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,63}$/u.test(value.mimeType)
      || !/^sha256:[a-f0-9]{64}$/u.test(String(value.sha256))) throw new Error('agent_sandbox_runner_response_invalid');
    const content = canonicalBase64(value.contentBase64, limits.artifactBytes);
    if (content.byteLength !== value.bytes || !Number.isSafeInteger(value.bytes) || Number(value.bytes) < 1 || Number(value.bytes) > limits.artifactBytes
      || `sha256:${createHash('sha256').update(content).digest('hex')}` !== value.sha256) throw new Error('agent_sandbox_runner_response_invalid');
    return Object.freeze({ path: value.path, filename: value.filename, mimeType: value.mimeType, bytes: Number(value.bytes), sha256: String(value.sha256), contentBase64: String(value.contentBase64) });
  });
  if (artifacts.reduce((sum, item) => sum + item.bytes, 0) > limits.artifactBytes) throw new Error('agent_sandbox_runner_response_invalid');
  return Object.freeze({
    exitCode: integer(source.exitCode, 0, 255),
    stdoutBase64: source.stdoutBase64 as string,
    stderrBase64: source.stderrBase64 as string,
    cpuMillis: integer(source.cpuMillis, 0, limits.cpuMillis),
    durationMs: integer(source.durationMs, 0, limits.wallTimeMs),
    maximumProcessesObserved: integer(source.maximumProcessesObserved, 0, 100_000),
    limitFailure: limitFailure as RunnerResult['limitFailure'],
    artifacts,
    stdout,
    stderr,
  });
}

export class AgentSandboxExecutor implements SandboxExecutor {
  readonly #transport: AgentSandboxTransport;
  readonly #config: Readonly<AgentSandboxExecutorConfig>;

  constructor(input: Readonly<{ transport: AgentSandboxTransport; config: AgentSandboxExecutorConfig }>) {
    if (!Number.isSafeInteger(input.config.readinessTimeoutMs) || input.config.readinessTimeoutMs < 1_000 || input.config.readinessTimeoutMs > 300_000) throw new TypeError('agent_sandbox_config_invalid');
    this.#transport = input.transport;
    this.#config = Object.freeze({ ...input.config });
  }

  async create(input: Readonly<{ sessionId: string; tenantId: string; imageDigest: string; limits: SandboxLimits }>): Promise<Readonly<SandboxAttestation>> {
    const resources = buildAgentSandboxResources({ ...input, imageRepository: this.#config.imageRepository });
    const claimName = agentSandboxResourceName(input.sessionId);
    try {
      await this.#transport.apply([...sandboxBoundaryManifests(), ...resources]);
      const observed = await this.#transport.waitForReady({ namespace: sandboxExecutionNamespace, claimName, timeoutMs: this.#config.readinessTimeoutMs });
      const expectedImage = `${this.#config.imageRepository}@${input.imageDigest}`;
      return Object.freeze({
        runtimeClass: observed.runtimeClassName,
        dedicatedExecutionNodes: observed.dedicatedExecutionNode === true,
        controlPlaneSeparated: observed.controlPlaneSeparated === true,
        networkDefaultDeny: observed.networkPolicyManagement === 'Managed' && observed.networkPolicyIngressRules === 0 && observed.networkPolicyEgressRules === 0,
        serviceAccountTokenMounted: observed.serviceAccountTokenMounted,
        executionNodeSecrets: observed.executionNodeSecretsPresent,
        imageDigest: observed.image === expectedImage ? input.imageDigest : '',
        readOnlyRootFilesystem: observed.readOnlyRootFilesystem,
      });
    } catch {
      try { await this.destroy(input.sessionId); } catch { /* caller fails closed; the reaper retains cleanup uncertainty */ }
      throw new Error('agent_sandbox_create_failed');
    }
  }

  async execute(input: Readonly<{ sessionId: string; executionId: string; command: readonly string[]; stdin: Uint8Array; limits: SandboxLimits; files?: readonly SandboxFileInput[]; artifactPaths?: readonly SandboxArtifactInput[] }>): Promise<Readonly<{ exitCode: number; stdout: Uint8Array; stderr: Uint8Array; cpuMillis: number; durationMs: number; artifacts: readonly { path: string; filename: string; mimeType: string; bytes: number; sha256: string; contentBase64: string }[] }>> {
    const podName = agentSandboxResourceName(input.sessionId);
    const payload = new TextEncoder().encode(JSON.stringify({ command: input.command, stdinBase64: Buffer.from(input.stdin).toString('base64'), files: input.files, artifactPaths: input.artifactPaths, limits: input.limits }));
    if (payload.byteLength > SANDBOX_MAX_REQUEST_BYTES) throw new Error('agent_sandbox_request_too_large');
    let response: Readonly<{ stdout: Uint8Array; stderr: Uint8Array; exitCode: number }>;
    try {
      response = await this.#transport.exec({
        namespace: sandboxExecutionNamespace,
        podName,
        command: Object.freeze(['node', '/opt/clervo/runner.mjs']),
        stdin: payload,
        timeoutMs: input.limits.wallTimeMs + 15_000,
        maximumOutputBytes: maximumRunnerResponseBytes(input.limits),
      });
    } catch { throw new Error('agent_sandbox_execute_failed'); }
    if (response.exitCode !== 0 || response.stderr.byteLength !== 0) throw new Error('agent_sandbox_runner_failed');
    const result = parseRunnerResult(response.stdout, input.limits.outputBytes, input.limits);
    return Object.freeze({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, cpuMillis: result.cpuMillis, durationMs: result.durationMs, artifacts: result.artifacts });
  }

  async destroy(sessionId: string): Promise<void> {
    const name = agentSandboxResourceName(sessionId);
    const claim = await Promise.allSettled([
      this.#transport.delete({ namespace: sandboxExecutionNamespace, kind: 'SandboxClaim', name, foreground: true }),
    ]);
    const template = await Promise.allSettled([
      this.#transport.delete({ namespace: sandboxExecutionNamespace, kind: 'SandboxTemplate', name, foreground: true }),
    ]);
    if ([...claim, ...template].some(({ status }) => status === 'rejected')) throw new Error('agent_sandbox_cleanup_unknown');
    try {
      if ((await this.#transport.listSessionIds(sandboxExecutionNamespace)).includes(sessionId)) throw new Error('agent_sandbox_cleanup_residual');
    } catch { throw new Error('agent_sandbox_cleanup_unknown'); }
  }

  async list(): Promise<readonly string[]> {
    const ids = await this.#transport.listSessionIds(sandboxExecutionNamespace);
    return Object.freeze([...ids]);
  }
}
