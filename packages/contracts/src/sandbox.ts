import type { AssetAmount } from './types.js';
import { CONTRACT_VERSION } from './types.js';
import { hashJson } from './receipt.js';
import type { JsonValue } from './types.js';

export const SANDBOX_OPERATION_REQUEST_SCHEMA_VERSION = 'sandbox-operation-request.v1' as const;
export const SANDBOX_OPERATION_RESULT_SCHEMA_VERSION = 'sandbox-operation-result.v1' as const;
export const sandboxProductIds = ['sandbox.run', 'sandbox.session.create', 'sandbox.session.exec', 'sandbox.artifact.get', 'sandbox.session.destroy'] as const;
export type SandboxProductId = (typeof sandboxProductIds)[number];

export interface SandboxResourceLimits {
  cpuMillis: number;
  memoryBytes: number;
  processes: number;
  diskBytes: number;
  outputBytes: number;
  artifactBytes: number;
  wallTimeMs: number;
}

export type SandboxOperationInput =
  | { kind: 'run'; executionId: string; imageDigest: string; command: readonly string[]; stdinBase64?: string; limits: SandboxResourceLimits }
  | { kind: 'session_create'; imageDigest: string; limits: SandboxResourceLimits; ttlMs: number }
  | { kind: 'session_exec'; sessionId: string; executionId: string; command: readonly string[]; stdinBase64?: string }
  | { kind: 'artifact_get'; artifactId: string }
  | { kind: 'session_destroy'; sessionId: string };

export interface SandboxOperationRequest {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof SANDBOX_OPERATION_REQUEST_SCHEMA_VERSION;
  operationId: string;
  productId: SandboxProductId;
  input: SandboxOperationInput;
  maximumCharge: AssetAmount;
  deadlineAt: string;
}

export interface SandboxArtifactResult {
  artifactId: string;
  filename: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  artifactUri: string;
  scan: Readonly<{ verdict: 'clean'; scannerVersion: string }>;
}

export type SandboxOperationOutput =
  | { kind: 'execution'; sessionId: string; executionId: string; sessionState: 'ready' | 'destroyed'; exitCode: number; stdoutBase64: string; stderrBase64: string; cpuMillis: number; durationMs: number; artifacts: readonly SandboxArtifactResult[] }
  | { kind: 'session_created'; sessionId: string; expiresAt: string }
  | { kind: 'artifact'; artifact: SandboxArtifactResult }
  | { kind: 'session_destroyed'; sessionId: string };

export interface SandboxOperationResult {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof SANDBOX_OPERATION_RESULT_SCHEMA_VERSION;
  operationId: string;
  productId: SandboxProductId;
  completedAt: string;
  meteredCharge: AssetAmount;
  output: SandboxOperationOutput;
  resultHash: string;
}

const expectedKind: Readonly<Record<SandboxProductId, SandboxOperationInput['kind']>> = Object.freeze({
  'sandbox.run': 'run', 'sandbox.session.create': 'session_create', 'sandbox.session.exec': 'session_exec', 'sandbox.artifact.get': 'artifact_get', 'sandbox.session.destroy': 'session_destroy',
});

function timestamp(value: string): void {
  const parsed = Date.parse(value); if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError('sandbox_request_deadline_invalid');
}

function amount(value: AssetAmount): void {
  if (value.asset !== 'USD' || value.decimals !== 6 || !/^(?:0|[1-9][0-9]{0,6})$/u.test(value.amountAtomic) || BigInt(value.amountAtomic) > 1_000_000n) throw new TypeError('sandbox_request_maximum_charge_invalid');
}

function limits(value: SandboxResourceLimits): void {
  const bounds: Readonly<Record<keyof SandboxResourceLimits, readonly [number, number]>> = {
    cpuMillis: [1, 300_000], memoryBytes: [16_777_216, 8_589_934_592], processes: [1, 256], diskBytes: [1_048_576, 10_737_418_240], outputBytes: [1, 10_485_760], artifactBytes: [1, 104_857_600], wallTimeMs: [100, 300_000],
  };
  for (const key of Object.keys(bounds) as (keyof SandboxResourceLimits)[]) { const [minimum, maximum] = bounds[key]; if (!Number.isSafeInteger(value[key]) || value[key] < minimum || value[key] > maximum) throw new TypeError(`sandbox_request_limit_invalid:${key}`); }
}

function command(value: readonly string[]): void {
  if (value.length < 1 || value.length > 32 || value.some((part) => part.length < 1 || part.length > 4096 || /[\u0000-\u001F\u007F]/u.test(part))) throw new TypeError('sandbox_request_command_invalid');
}

function base64(value: string | undefined, maximumBytes = 1_048_576): void {
  if (value === undefined) return;
  if (value.length > Math.ceil(maximumBytes / 3) * 4 || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value) || Buffer.from(value, 'base64').byteLength > maximumBytes) throw new TypeError('sandbox_request_stdin_invalid');
}

export function assertSandboxOperationRequest(value: SandboxOperationRequest): void {
  if (value.contractVersion !== CONTRACT_VERSION || value.schemaVersion !== SANDBOX_OPERATION_REQUEST_SCHEMA_VERSION || !sandboxProductIds.includes(value.productId)) throw new TypeError('sandbox_request_version_invalid');
  if (!/^op_[A-Za-z0-9]{20,64}$/u.test(value.operationId) || expectedKind[value.productId] !== value.input.kind) throw new TypeError('sandbox_request_operation_invalid');
  amount(value.maximumCharge); timestamp(value.deadlineAt);
  const input = value.input;
  if (input.kind === 'run') {
    if (!/^exec_[A-Za-z0-9]{20,64}$/u.test(input.executionId) || !/^sha256:[a-f0-9]{64}$/u.test(input.imageDigest)) throw new TypeError('sandbox_request_run_invalid');
    command(input.command); base64(input.stdinBase64); limits(input.limits);
  } else if (input.kind === 'session_create') {
    if (!/^sha256:[a-f0-9]{64}$/u.test(input.imageDigest) || !Number.isSafeInteger(input.ttlMs) || input.ttlMs < 1_000 || input.ttlMs > 900_000) throw new TypeError('sandbox_request_create_invalid');
    limits(input.limits);
  } else if (input.kind === 'session_exec') {
    if (!/^sbx_[A-Za-z0-9]{20,64}$/u.test(input.sessionId) || !/^exec_[A-Za-z0-9]{20,64}$/u.test(input.executionId)) throw new TypeError('sandbox_request_exec_invalid');
    command(input.command); base64(input.stdinBase64);
  } else if (input.kind === 'artifact_get') {
    if (!/^art_[a-f0-9]{32}$/u.test(input.artifactId)) throw new TypeError('sandbox_request_artifact_invalid');
  } else if (!/^sbx_[A-Za-z0-9]{20,64}$/u.test(input.sessionId)) throw new TypeError('sandbox_request_destroy_invalid');
}

function artifact(value: SandboxArtifactResult): void {
  if (!/^art_[a-f0-9]{32}$/u.test(value.artifactId) || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/u.test(value.filename) || !/^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,63}$/u.test(value.mimeType) || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > 104_857_600 || !/^sha256:[a-f0-9]{64}$/u.test(value.sha256) || !/^artifact:\/\/generated\/tenant_[A-Za-z0-9]{20,64}\/[a-f0-9]{64}$/u.test(value.artifactUri) || value.scan.verdict !== 'clean' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u.test(value.scan.scannerVersion)) throw new TypeError('sandbox_result_artifact_invalid');
}

function output(request: SandboxOperationRequest, value: SandboxOperationOutput): void {
  if (request.input.kind === 'run' || request.input.kind === 'session_exec') {
    if (value.kind !== 'execution' || !/^sbx_[A-Za-z0-9]{20,64}$/u.test(value.sessionId) || value.executionId !== request.input.executionId || (request.input.kind === 'run' ? value.sessionState !== 'destroyed' : value.sessionState !== 'ready') || !Number.isSafeInteger(value.exitCode) || value.exitCode < 0 || value.exitCode > 255 || !Number.isSafeInteger(value.cpuMillis) || value.cpuMillis < 0 || !Number.isSafeInteger(value.durationMs) || value.durationMs < 0) throw new TypeError('sandbox_result_execution_invalid');
    const maximumOutput = request.input.kind === 'run' ? request.input.limits.outputBytes : 10_485_760;
    base64(value.stdoutBase64, 10_485_760); base64(value.stderrBase64, 10_485_760);
    if (Buffer.from(value.stdoutBase64, 'base64').byteLength + Buffer.from(value.stderrBase64, 'base64').byteLength > maximumOutput || (request.input.kind === 'run' && (value.cpuMillis > request.input.limits.cpuMillis || value.durationMs > request.input.limits.wallTimeMs))) throw new TypeError('sandbox_result_limit_exceeded');
    if (value.artifacts.length > 64) throw new TypeError('sandbox_result_artifacts_invalid'); for (const item of value.artifacts) artifact(item);
  } else if (request.input.kind === 'session_create') {
    if (value.kind !== 'session_created' || !/^sbx_[A-Za-z0-9]{20,64}$/u.test(value.sessionId)) throw new TypeError('sandbox_result_create_invalid'); timestamp(value.expiresAt);
  } else if (request.input.kind === 'artifact_get') {
    if (value.kind !== 'artifact' || value.artifact.artifactId !== request.input.artifactId) throw new TypeError('sandbox_result_artifact_mismatch'); artifact(value.artifact);
  } else if (value.kind !== 'session_destroyed' || value.sessionId !== request.input.sessionId) throw new TypeError('sandbox_result_destroy_invalid');
}

export function createSandboxOperationResult(input: Readonly<{ request: SandboxOperationRequest; completedAt: string; meteredCharge: AssetAmount; output: SandboxOperationOutput }>): Readonly<SandboxOperationResult> {
  assertSandboxOperationRequest(input.request); timestamp(input.completedAt); if (Date.parse(input.completedAt) > Date.parse(input.request.deadlineAt)) throw new TypeError('sandbox_result_deadline_exceeded');
  amount(input.meteredCharge); if (BigInt(input.meteredCharge.amountAtomic) > BigInt(input.request.maximumCharge.amountAtomic)) throw new TypeError('sandbox_result_charge_exceeded'); output(input.request, input.output);
  const unsigned = { contractVersion: CONTRACT_VERSION, schemaVersion: SANDBOX_OPERATION_RESULT_SCHEMA_VERSION, operationId: input.request.operationId, productId: input.request.productId, completedAt: input.completedAt, meteredCharge: input.meteredCharge, output: input.output };
  return Object.freeze({ ...unsigned, resultHash: hashJson(unsigned as unknown as JsonValue) });
}

export function verifySandboxOperationResult(value: SandboxOperationResult, request: SandboxOperationRequest): boolean {
  try { return JSON.stringify(createSandboxOperationResult({ request, completedAt: value.completedAt, meteredCharge: value.meteredCharge, output: value.output })) === JSON.stringify(value); } catch { return false; }
}
