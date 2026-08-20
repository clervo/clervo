import type { AssetAmount } from './types.js';
import { createHash } from 'node:crypto';
import { CONTRACT_VERSION } from './types.js';
import { hashJson } from './receipt.js';
import type { JsonValue } from './types.js';

export const SANDBOX_OPERATION_REQUEST_SCHEMA_VERSION = 'sandbox-operation-request.v1' as const;
export const SANDBOX_OPERATION_RESULT_SCHEMA_VERSION = 'sandbox-operation-result.v1' as const;
export const SANDBOX_MAX_REQUEST_BYTES = 1_500_000;
export const SANDBOX_MAX_INLINE_INPUT_BYTES = 1_048_576;
export const SANDBOX_MAX_INLINE_PROGRAM_BYTES = 262_144;
export const SANDBOX_MAX_ARTIFACT_BYTES = 1_048_576;
export const SANDBOX_MAX_OUTPUT_BYTES = 1_048_576;
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

export interface SandboxFileInput {
  path: string;
  contentBase64: string;
}

export interface SandboxArtifactInput {
  path: string;
  filename?: string;
  mimeType?: string;
}

export type SandboxOperationInput =
  | { kind: 'run'; executionId: string; imageDigest: string; command: readonly string[]; stdinBase64?: string; limits: SandboxResourceLimits; files?: readonly SandboxFileInput[]; artifactPaths?: readonly SandboxArtifactInput[] }
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
  scan: Readonly<{ verdict: 'clean'; scannerVersion: string } | { verdict: 'not_scanned'; scannerVersion: null }>;
  contentBase64?: string;
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
    cpuMillis: [1, 300_000], memoryBytes: [16_777_216, 8_589_934_592], processes: [1, 256], diskBytes: [1_048_576, 10_737_418_240], outputBytes: [1, SANDBOX_MAX_OUTPUT_BYTES], artifactBytes: [1, SANDBOX_MAX_ARTIFACT_BYTES], wallTimeMs: [100, 300_000],
  };
  for (const key of Object.keys(bounds) as (keyof SandboxResourceLimits)[]) { const [minimum, maximum] = bounds[key]; if (!Number.isSafeInteger(value[key]) || value[key] < minimum || value[key] > maximum) throw new TypeError(`sandbox_request_limit_invalid:${key}`); }
}

export function validSandboxInlineProgram(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
    && Buffer.byteLength(value) <= SANDBOX_MAX_INLINE_PROGRAM_BYTES
    && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);
}

function command(value: readonly string[]): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) throw new TypeError('sandbox_request_command_invalid');
  const inlineProgram = (value[0] === 'node' && value[1] === '-e') || ((value[0] === 'python' || value[0] === 'python3') && value[1] === '-c');
  if (value.some((part, index) => inlineProgram && index === 2
    ? !validSandboxInlineProgram(part)
    : typeof part !== 'string' || part.length < 1 || part.length > 4_096 || /[\u0000-\u001F\u007F]/u.test(part))) throw new TypeError('sandbox_request_command_invalid');
}

function workspacePath(value: string, code: string): void {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || value.startsWith('/') || value.includes('\\') || value.split('/').some((part) => part === '' || part === '.' || part === '..' || !/^[A-Za-z0-9._ -]+$/u.test(part)) || value.split('/')[0] === '.clervo-runtime') throw new TypeError(code);
}

function files(value: readonly SandboxFileInput[] | undefined): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 32) throw new TypeError('sandbox_request_files_invalid');
  let total = 0; const paths = new Set<string>();
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !['path', 'contentBase64'].includes(key))) throw new TypeError('sandbox_request_file_invalid');
    workspacePath(item.path, 'sandbox_request_file_path_invalid');
    if (paths.has(item.path)) throw new TypeError('sandbox_request_file_path_duplicate'); paths.add(item.path);
    base64(item.contentBase64, SANDBOX_MAX_INLINE_INPUT_BYTES, 'sandbox_request_file_content_invalid');
    total += Buffer.from(item.contentBase64, 'base64').byteLength;
    if (total > SANDBOX_MAX_INLINE_INPUT_BYTES) throw new TypeError('sandbox_request_files_too_large');
  }
}

function artifactPaths(value: readonly SandboxArtifactInput[] | undefined): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 32) throw new TypeError('sandbox_request_artifacts_invalid');
  const paths = new Set<string>();
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !['path', 'filename', 'mimeType'].includes(key))) throw new TypeError('sandbox_request_artifact_invalid');
    workspacePath(item.path, 'sandbox_request_artifact_path_invalid');
    if (paths.has(item.path)) throw new TypeError('sandbox_request_artifact_path_duplicate'); paths.add(item.path);
    if (item.filename !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/u.test(item.filename)) throw new TypeError('sandbox_request_artifact_filename_invalid');
    if (item.mimeType !== undefined && !/^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,63}$/u.test(item.mimeType)) throw new TypeError('sandbox_request_artifact_mime_invalid');
  }
}

function base64(value: string | undefined, maximumBytes = SANDBOX_MAX_INLINE_INPUT_BYTES, code = 'sandbox_request_stdin_invalid'): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || value.length > Math.ceil(maximumBytes / 3) * 4 || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value) || Buffer.from(value, 'base64').byteLength > maximumBytes || Buffer.from(value, 'base64').toString('base64') !== value) throw new TypeError(code);
}

function inlineInputBytes(input: Extract<SandboxOperationInput, { kind: 'run' }>): number {
  return input.command.reduce((total, part) => total + Buffer.byteLength(part), 0)
    + (input.stdinBase64 === undefined ? 0 : Buffer.from(input.stdinBase64, 'base64').byteLength)
    + (input.files ?? []).reduce((total, item) => total + Buffer.from(item.contentBase64, 'base64').byteLength, 0);
}

export function assertSandboxOperationRequest(value: SandboxOperationRequest): void {
  if (value.contractVersion !== CONTRACT_VERSION || value.schemaVersion !== SANDBOX_OPERATION_REQUEST_SCHEMA_VERSION || !sandboxProductIds.includes(value.productId)) throw new TypeError('sandbox_request_version_invalid');
  if (!/^op_[A-Za-z0-9]{20,64}$/u.test(value.operationId) || expectedKind[value.productId] !== value.input.kind) throw new TypeError('sandbox_request_operation_invalid');
  amount(value.maximumCharge); timestamp(value.deadlineAt);
  const input = value.input;
  if (input.kind === 'run') {
    if (!/^exec_[A-Za-z0-9]{20,64}$/u.test(input.executionId) || !/^sha256:[a-f0-9]{64}$/u.test(input.imageDigest)) throw new TypeError('sandbox_request_run_invalid');
    command(input.command); base64(input.stdinBase64); limits(input.limits); files(input.files); artifactPaths(input.artifactPaths);
    if (inlineInputBytes(input) > SANDBOX_MAX_INLINE_INPUT_BYTES) throw new TypeError('sandbox_request_inline_input_too_large');
    if (Buffer.byteLength(JSON.stringify(value)) > SANDBOX_MAX_REQUEST_BYTES) throw new TypeError('sandbox_request_envelope_too_large');
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
  const validScan = value.scan?.verdict === 'not_scanned' ? value.scan.scannerVersion === null : value.scan?.verdict === 'clean' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u.test(value.scan.scannerVersion);
  if (!/^art_[a-f0-9]{32}$/u.test(value.artifactId) || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/u.test(value.filename) || !/^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,63}$/u.test(value.mimeType) || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > SANDBOX_MAX_ARTIFACT_BYTES || !/^sha256:[a-f0-9]{64}$/u.test(value.sha256) || !/^artifact:\/\/generated\/tenant_[A-Za-z0-9]{20,64}\/[a-f0-9]{64}$/u.test(value.artifactUri) || !validScan) throw new TypeError('sandbox_result_artifact_invalid');
  if (value.contentBase64 !== undefined) {
    base64(value.contentBase64, SANDBOX_MAX_ARTIFACT_BYTES, 'sandbox_result_artifact_content_invalid');
    const bytes = Buffer.from(value.contentBase64, 'base64');
    if (bytes.byteLength !== value.bytes || `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== value.sha256) throw new TypeError('sandbox_result_artifact_content_invalid');
  }
}

function output(request: SandboxOperationRequest, value: SandboxOperationOutput): void {
  if (request.input.kind === 'run' || request.input.kind === 'session_exec') {
    if (value.kind !== 'execution' || !/^sbx_[A-Za-z0-9]{20,64}$/u.test(value.sessionId) || value.executionId !== request.input.executionId || (request.input.kind === 'run' ? value.sessionState !== 'destroyed' : value.sessionState !== 'ready') || !Number.isSafeInteger(value.exitCode) || value.exitCode < 0 || value.exitCode > 255 || !Number.isSafeInteger(value.cpuMillis) || value.cpuMillis < 0 || !Number.isSafeInteger(value.durationMs) || value.durationMs < 0) throw new TypeError('sandbox_result_execution_invalid');
    const maximumOutput = request.input.kind === 'run' ? request.input.limits.outputBytes : SANDBOX_MAX_OUTPUT_BYTES;
    base64(value.stdoutBase64, SANDBOX_MAX_OUTPUT_BYTES); base64(value.stderrBase64, SANDBOX_MAX_OUTPUT_BYTES);
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
