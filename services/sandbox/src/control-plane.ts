import { createHash } from 'node:crypto';
import type { SandboxImagePolicy } from './image-registry.js';
import {
  SANDBOX_MAX_ARTIFACT_BYTES,
  SANDBOX_MAX_INLINE_INPUT_BYTES,
  SANDBOX_MAX_OUTPUT_BYTES,
  validSandboxInlineProgram,
  type SandboxArtifactInput,
  type SandboxFileInput,
} from '../../../packages/contracts/src/sandbox.js';

export interface SandboxLimits {
  cpuMillis: number;
  memoryBytes: number;
  processes: number;
  diskBytes: number;
  outputBytes: number;
  artifactBytes: number;
  wallTimeMs: number;
  maximumChargeMicrousd: number;
}

export interface SandboxAttestation {
  runtimeClass: string;
  dedicatedExecutionNodes: boolean;
  controlPlaneSeparated: boolean;
  networkDefaultDeny: boolean;
  serviceAccountTokenMounted: boolean;
  executionNodeSecrets: boolean;
  imageDigest: string;
  readOnlyRootFilesystem: boolean;
}

export interface SandboxExecutor {
  create(input: Readonly<{ sessionId: string; tenantId: string; imageDigest: string; limits: SandboxLimits }>): Promise<Readonly<SandboxAttestation>>;
  execute(input: Readonly<{ sessionId: string; executionId: string; command: readonly string[]; stdin: Uint8Array; limits: SandboxLimits; files?: readonly SandboxFileInput[]; artifactPaths?: readonly SandboxArtifactInput[] }>): Promise<Readonly<{ exitCode: number; stdout: Uint8Array; stderr: Uint8Array; cpuMillis: number; durationMs: number; artifacts?: readonly { path: string; filename: string; mimeType: string; bytes: number; sha256: string; contentBase64: string }[] }>>;
  destroy(sessionId: string): Promise<void>;
  list(): Promise<readonly string[]>;
}

interface Session {
  sessionId: string;
  tenantId: string;
  imageDigest: string;
  limits: SandboxLimits;
  createdAtMs: number;
  expiresAtMs: number;
  state: 'ready' | 'executing' | 'destroyed' | 'quarantined';
  executions: Map<string, Readonly<{ requestHash: string; result: Readonly<SandboxExecutionResult> }>>;
}

export interface SandboxExecutionResult {
  sessionId: string;
  executionId: string;
  exitCode: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
  cpuMillis: number;
  durationMs: number;
  maximumChargeMicrousd: number;
  artifacts?: readonly { path: string; filename: string; mimeType: string; bytes: number; sha256: string; contentBase64: string }[];
}

const maximums: SandboxLimits = { cpuMillis: 300_000, memoryBytes: 8_589_934_592, processes: 256, diskBytes: 10_737_418_240, outputBytes: SANDBOX_MAX_OUTPUT_BYTES, artifactBytes: SANDBOX_MAX_ARTIFACT_BYTES, wallTimeMs: 300_000, maximumChargeMicrousd: 1_000_000 };

function identity(value: string, prefix: string): void {
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]{20,64}$`, 'u').test(value)) throw new TypeError('sandbox_identity_invalid');
}

function limits(value: SandboxLimits): void {
  for (const key of Object.keys(maximums) as (keyof SandboxLimits)[]) if (!Number.isSafeInteger(value[key]) || value[key] < 1 || value[key] > maximums[key]) throw new TypeError(`sandbox_limit_invalid:${key}`);
  if (value.memoryBytes < 16_777_216 || value.diskBytes < 1_048_576 || value.wallTimeMs < 100) throw new TypeError('sandbox_limit_below_minimum');
}

function validAttestation(value: SandboxAttestation, imageDigest: string): boolean {
  return value.runtimeClass === 'gvisor' && value.dedicatedExecutionNodes === true && value.controlPlaneSeparated === true && value.networkDefaultDeny === true && value.serviceAccountTokenMounted === false && value.executionNodeSecrets === false && value.readOnlyRootFilesystem === true && value.imageDigest === imageDigest && /^sha256:[a-f0-9]{64}$/u.test(value.imageDigest);
}

function workspacePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !value.startsWith('/') && !value.includes('\\')
    && value.split('/')[0] !== '.clervo-runtime'
    && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..' && /^[A-Za-z0-9._ -]+$/u.test(part));
}

function validCommand(command: readonly string[]): boolean {
  if (!Array.isArray(command) || command.length < 1 || command.length > 32) return false;
  const inlineProgram = (command[0] === 'node' && command[1] === '-e') || ((command[0] === 'python' || command[0] === 'python3') && command[1] === '-c');
  return command.every((part, index) => inlineProgram && index === 2
    ? validSandboxInlineProgram(part)
    : typeof part === 'string' && part.length > 0 && part.length <= 4_096 && !/[\u0000-\u001f\u007f]/u.test(part));
}

function canonicalFileBytes(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) return undefined;
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64') === value ? bytes.byteLength : undefined;
}

function validExecutionInput(input: Readonly<{ command: readonly string[]; stdin: Uint8Array; files?: readonly SandboxFileInput[]; artifactPaths?: readonly SandboxArtifactInput[] }>): boolean {
  if (!validCommand(input.command) || input.stdin.byteLength > SANDBOX_MAX_INLINE_INPUT_BYTES) return false;
  if (input.files !== undefined && (!Array.isArray(input.files) || input.files.length > 32)) return false;
  if (input.artifactPaths !== undefined && (!Array.isArray(input.artifactPaths) || input.artifactPaths.length > 32)) return false;
  let inlineBytes = input.stdin.byteLength + input.command.reduce((total, part) => total + Buffer.byteLength(part), 0);
  const filePaths = new Set<string>();
  for (const file of input.files ?? []) {
    if (file === null || typeof file !== 'object' || Array.isArray(file) || Object.keys(file).some((key) => !['path', 'contentBase64'].includes(key)) || !workspacePath(file.path) || filePaths.has(file.path)) return false;
    filePaths.add(file.path); const bytes = canonicalFileBytes(file.contentBase64); if (bytes === undefined) return false; inlineBytes += bytes;
  }
  const artifactPaths = new Set<string>();
  for (const artifact of input.artifactPaths ?? []) {
    if (artifact === null || typeof artifact !== 'object' || Array.isArray(artifact) || Object.keys(artifact).some((key) => !['path', 'filename', 'mimeType'].includes(key)) || !workspacePath(artifact.path) || artifactPaths.has(artifact.path)) return false;
    if (artifact.filename !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/u.test(artifact.filename)) return false;
    if (artifact.mimeType !== undefined && !/^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,63}$/u.test(artifact.mimeType)) return false;
    artifactPaths.add(artifact.path);
  }
  return inlineBytes <= SANDBOX_MAX_INLINE_INPUT_BYTES;
}

function executionRequestHash(input: Readonly<{ command: readonly string[]; stdin: Uint8Array; files?: readonly SandboxFileInput[]; artifactPaths?: readonly SandboxArtifactInput[] }>, session: Session): string {
  const semanticRequest = {
    imageDigest: session.imageDigest,
    limits: {
      cpuMillis: session.limits.cpuMillis, memoryBytes: session.limits.memoryBytes, processes: session.limits.processes,
      diskBytes: session.limits.diskBytes, outputBytes: session.limits.outputBytes, artifactBytes: session.limits.artifactBytes,
      wallTimeMs: session.limits.wallTimeMs, maximumChargeMicrousd: session.limits.maximumChargeMicrousd,
    },
    command: [...input.command], stdinBase64: Buffer.from(input.stdin).toString('base64'),
    files: (input.files ?? []).map(({ path, contentBase64 }) => ({ path, contentBase64 })),
    artifactPaths: (input.artifactPaths ?? []).map(({ path, filename, mimeType }) => ({ path, ...(filename === undefined ? {} : { filename }), ...(mimeType === undefined ? {} : { mimeType }) })),
  };
  return createHash('sha256').update(JSON.stringify(semanticRequest)).digest('hex');
}

export class SandboxControlPlane {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly executor: SandboxExecutor, private readonly now: () => number, private readonly images: SandboxImagePolicy) {}

  cleanupUncertain(): boolean {
    return [...this.sessions.values()].some(({ state }) => state === 'quarantined');
  }

  async create(input: Readonly<{ sessionId: string; tenantId: string; imageDigest: string; limits: SandboxLimits; ttlMs: number }>): Promise<void> {
    identity(input.sessionId, 'sbx'); identity(input.tenantId, 'tenant'); limits(input.limits);
    if (!Number.isSafeInteger(input.ttlMs) || input.ttlMs < 1_000 || input.ttlMs > 900_000 || this.sessions.has(input.sessionId)) throw new TypeError('sandbox_create_invalid');
    if (!this.images.allows(input.imageDigest)) throw new Error('sandbox_image_unavailable');
    const attestation = await this.executor.create({ sessionId: input.sessionId, tenantId: input.tenantId, imageDigest: input.imageDigest, limits: input.limits });
    if (!validAttestation(attestation, input.imageDigest)) {
      try { await this.executor.destroy(input.sessionId); } catch { throw new Error('sandbox_cleanup_unknown'); }
      throw new Error('sandbox_runtime_unavailable');
    }
    const createdAtMs = this.now();
    this.sessions.set(input.sessionId, { ...input, createdAtMs, expiresAtMs: createdAtMs + input.ttlMs, state: 'ready', executions: new Map() });
  }

  async execute(input: Readonly<{ sessionId: string; executionId: string; tenantId: string; command: readonly string[]; stdin: Uint8Array; files?: readonly SandboxFileInput[]; artifactPaths?: readonly SandboxArtifactInput[] }>): Promise<Readonly<SandboxExecutionResult>> {
    identity(input.sessionId, 'sbx'); identity(input.executionId, 'exec'); identity(input.tenantId, 'tenant');
    const session = this.sessions.get(input.sessionId);
    if (!session || session.tenantId !== input.tenantId || session.state === 'destroyed' || session.state === 'quarantined') throw new Error('sandbox_session_unavailable');
    if (session.state !== 'ready' || this.now() >= session.expiresAtMs || !validExecutionInput(input)) throw new Error('sandbox_execution_rejected');
    const requestHash = executionRequestHash(input, session);
    const replay = session.executions.get(input.executionId);
    if (replay) {
      if (replay.requestHash !== requestHash) throw new Error('sandbox_idempotency_conflict');
      return replay.result;
    }
    session.state = 'executing';
    try {
      const observed = await this.executor.execute({ sessionId: session.sessionId, executionId: input.executionId, command: input.command, stdin: input.stdin, ...(input.files === undefined ? {} : { files: input.files }), ...(input.artifactPaths === undefined ? {} : { artifactPaths: input.artifactPaths }), limits: session.limits });
      if (!Number.isSafeInteger(observed.exitCode) || observed.exitCode < 0 || observed.exitCode > 255 || !Number.isSafeInteger(observed.cpuMillis) || observed.cpuMillis < 0 || !Number.isSafeInteger(observed.durationMs) || observed.durationMs < 0 || observed.stdout.byteLength + observed.stderr.byteLength > session.limits.outputBytes || observed.cpuMillis > session.limits.cpuMillis || observed.durationMs > session.limits.wallTimeMs) throw new Error('sandbox_executor_limit_breach');
      const result = Object.freeze({ sessionId: session.sessionId, executionId: input.executionId, exitCode: observed.exitCode, stdout: new Uint8Array(observed.stdout), stderr: new Uint8Array(observed.stderr), cpuMillis: observed.cpuMillis, durationMs: observed.durationMs, maximumChargeMicrousd: session.limits.maximumChargeMicrousd, artifacts: observed.artifacts === undefined ? [] : Object.freeze(observed.artifacts.map((item) => Object.freeze({ ...item }))) });
      session.executions.set(input.executionId, Object.freeze({ requestHash, result })); session.state = 'ready'; return result;
    } catch (error) {
      session.state = 'quarantined';
      try { await this.executor.destroy(session.sessionId); session.state = 'destroyed'; } catch { /* unknown cleanup remains quarantined */ }
      throw error;
    }
  }

  async destroy(sessionId: string, tenantId: string): Promise<void> {
    identity(sessionId, 'sbx'); identity(tenantId, 'tenant'); const session = this.sessions.get(sessionId);
    if (!session || session.tenantId !== tenantId) throw new Error('sandbox_session_unavailable');
    if (session.state === 'destroyed') return;
    try { await this.executor.destroy(sessionId); session.state = 'destroyed'; } catch { session.state = 'quarantined'; throw new Error('sandbox_cleanup_unknown'); }
  }

  async reap(): Promise<Readonly<{ destroyed: number; quarantined: number; foreignOrphans: number }>> {
    let destroyed = 0; let quarantined = 0;
    for (const session of this.sessions.values()) if (session.state !== 'destroyed' && this.now() >= session.expiresAtMs) {
      try { await this.executor.destroy(session.sessionId); session.state = 'destroyed'; destroyed += 1; } catch { session.state = 'quarantined'; quarantined += 1; }
    }
    const known = new Set(this.sessions.keys()); const foreign = (await this.executor.list()).filter((id) => !known.has(id));
    let foreignOrphans = 0;
    for (const sessionId of foreign) {
      try { await this.executor.destroy(sessionId); destroyed += 1; }
      catch { quarantined += 1; foreignOrphans += 1; }
    }
    return Object.freeze({ destroyed, quarantined, foreignOrphans });
  }
}
