export interface SandboxLimits {
  cpuMillis: number;
  memoryBytes: number;
  processes: number;
  diskBytes: number;
  outputBytes: number;
  wallTimeMs: number;
  maximumChargeMicrousd: number;
}

export interface SandboxAttestation {
  runtimeClass: 'gvisor';
  dedicatedExecutionNodes: true;
  controlPlaneSeparated: true;
  networkDefaultDeny: true;
  serviceAccountTokenMounted: false;
  executionNodeSecrets: false;
  imageDigest: string;
  readOnlyRootFilesystem: true;
}

export interface SandboxExecutor {
  attest(): Promise<Readonly<SandboxAttestation>>;
  create(input: Readonly<{ sessionId: string; tenantId: string; imageDigest: string; limits: SandboxLimits }>): Promise<void>;
  execute(input: Readonly<{ sessionId: string; executionId: string; command: readonly string[]; stdin: Uint8Array; limits: SandboxLimits }>): Promise<Readonly<{ exitCode: number; stdout: Uint8Array; stderr: Uint8Array; cpuMillis: number; durationMs: number }>>;
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
  executions: Map<string, Readonly<SandboxExecutionResult>>;
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
}

const maximums: SandboxLimits = { cpuMillis: 300_000, memoryBytes: 8_589_934_592, processes: 256, diskBytes: 10_737_418_240, outputBytes: 10_485_760, wallTimeMs: 300_000, maximumChargeMicrousd: 1_000_000 };

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

export class SandboxControlPlane {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly executor: SandboxExecutor, private readonly now: () => number = Date.now) {}

  async create(input: Readonly<{ sessionId: string; tenantId: string; imageDigest: string; limits: SandboxLimits; ttlMs: number }>): Promise<void> {
    identity(input.sessionId, 'sbx'); identity(input.tenantId, 'tenant'); limits(input.limits);
    if (!Number.isSafeInteger(input.ttlMs) || input.ttlMs < 1_000 || input.ttlMs > 900_000 || this.sessions.has(input.sessionId)) throw new TypeError('sandbox_create_invalid');
    const attestation = await this.executor.attest();
    if (!validAttestation(attestation, input.imageDigest)) throw new Error('sandbox_runtime_unavailable');
    await this.executor.create({ sessionId: input.sessionId, tenantId: input.tenantId, imageDigest: input.imageDigest, limits: input.limits });
    const createdAtMs = this.now();
    this.sessions.set(input.sessionId, { ...input, createdAtMs, expiresAtMs: createdAtMs + input.ttlMs, state: 'ready', executions: new Map() });
  }

  async execute(input: Readonly<{ sessionId: string; executionId: string; tenantId: string; command: readonly string[]; stdin: Uint8Array }>): Promise<Readonly<SandboxExecutionResult>> {
    identity(input.sessionId, 'sbx'); identity(input.executionId, 'exec'); identity(input.tenantId, 'tenant');
    const session = this.sessions.get(input.sessionId);
    if (!session || session.tenantId !== input.tenantId || session.state === 'destroyed' || session.state === 'quarantined') throw new Error('sandbox_session_unavailable');
    const replay = session.executions.get(input.executionId); if (replay) return replay;
    if (session.state !== 'ready' || this.now() >= session.expiresAtMs || input.command.length < 1 || input.command.length > 32 || input.command.some((part) => part.length < 1 || part.length > 4096) || input.stdin.byteLength > 1_048_576) throw new Error('sandbox_execution_rejected');
    session.state = 'executing';
    try {
      const observed = await this.executor.execute({ sessionId: session.sessionId, executionId: input.executionId, command: input.command, stdin: input.stdin, limits: session.limits });
      if (!Number.isSafeInteger(observed.exitCode) || observed.exitCode < 0 || observed.exitCode > 255 || observed.stdout.byteLength + observed.stderr.byteLength > session.limits.outputBytes || observed.cpuMillis > session.limits.cpuMillis || observed.durationMs > session.limits.wallTimeMs) throw new Error('sandbox_executor_limit_breach');
      const result = Object.freeze({ sessionId: session.sessionId, executionId: input.executionId, ...observed, maximumChargeMicrousd: session.limits.maximumChargeMicrousd });
      session.executions.set(input.executionId, result); session.state = 'ready'; return result;
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
    const known = new Set(this.sessions.keys()); const foreignOrphans = (await this.executor.list()).filter((id) => !known.has(id)).length;
    return Object.freeze({ destroyed, quarantined, foreignOrphans });
  }
}
