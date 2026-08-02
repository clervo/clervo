import type { AssetAmount } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export const SANDBOX_OPERATION_REQUEST_SCHEMA_VERSION = 'sandbox-operation-request.v1' as const;
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

function base64(value: string | undefined): void {
  if (value === undefined) return;
  if (value.length > 1_398_104 || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value) || Buffer.from(value, 'base64').byteLength > 1_048_576) throw new TypeError('sandbox_request_stdin_invalid');
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
