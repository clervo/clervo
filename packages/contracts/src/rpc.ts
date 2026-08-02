import { canonicalize } from './canonical-request.js';
import { hashJson } from './receipt.js';
import { CONTRACT_VERSION, type AssetAmount, type JsonValue } from './types.js';

export const RPC_OPERATION_REQUEST_SCHEMA_VERSION = 'rpc-operation-request.v1' as const;
export const RPC_OPERATION_RESULT_SCHEMA_VERSION = 'rpc-operation-result.v1' as const;
export const rpcProductIds = ['rpc.call', 'rpc.batch', 'rpc.health', 'rpc.archive', 'rpc.broadcast'] as const;
export type RpcOperationProductId = (typeof rpcProductIds)[number];

export interface RpcOperationCall {
  method: string;
  params: JsonValue;
}

export type RpcOperationInput =
  | { kind: 'call'; chainId: string; call: RpcOperationCall; quorum?: 1 | 2 | 3 }
  | { kind: 'batch'; chainId: string; calls: readonly RpcOperationCall[]; quorum?: 1 | 2 | 3 }
  | { kind: 'health'; chainId: string }
  | { kind: 'archive'; chainId: string; call: RpcOperationCall; quorum?: 1 | 2 | 3 }
  | { kind: 'broadcast'; chainId: string; call: RpcOperationCall; idempotencyKey: string };

export interface RpcOperationRequest {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof RPC_OPERATION_REQUEST_SCHEMA_VERSION;
  operationId: string;
  productId: RpcOperationProductId;
  input: RpcOperationInput;
  maximumCharge: AssetAmount;
  deadlineAt: string;
}

export type RpcPublicOutcome =
  | { id: number; ok: true; result: JsonValue }
  | { id: number; ok: false; error: { code: number; message: string } };

export type RpcOperationOutput =
  | { kind: 'rpc'; chainId: string; outcomes: readonly RpcPublicOutcome[]; cache: 'hit' | 'miss' | 'bypass'; quorum: 1 | 2 | 3; observedAt: string; requestHash: string }
  | { kind: 'health'; chainId: string; status: 'healthy' | 'degraded' | 'unavailable'; healthyRoutes: number; highestHeight: number | null; quorumAvailable: boolean; observedAt: string }
  | { kind: 'broadcast'; chainId: string; state: 'submitted' | 'confirmed' | 'rejected' | 'unknown'; transactionId: string | null; replayed: boolean; requestHash: string };

export interface RpcOperationResult {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof RPC_OPERATION_RESULT_SCHEMA_VERSION;
  operationId: string;
  productId: RpcOperationProductId;
  completedAt: string;
  meteredCharge: AssetAmount;
  output: RpcOperationOutput;
  resultHash: string;
}

const expectedKind: Readonly<Record<RpcOperationProductId, RpcOperationInput['kind']>> = Object.freeze({
  'rpc.call': 'call', 'rpc.batch': 'batch', 'rpc.health': 'health', 'rpc.archive': 'archive', 'rpc.broadcast': 'broadcast',
});

function timestamp(value: string): void {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError('rpc_operation_timestamp_invalid');
}

function amount(value: AssetAmount): void {
  if (value.asset !== 'USD' || value.decimals !== 6 || !/^(?:0|[1-9][0-9]{0,6})$/u.test(value.amountAtomic) || BigInt(value.amountAtomic) > 1_000_000n) throw new TypeError('rpc_operation_charge_invalid');
}

function chainId(value: string): void {
  if (!/^(?:eip155:[1-9][0-9]{0,9}|solana:[A-Za-z0-9]{8,64})$/u.test(value)) throw new TypeError('rpc_operation_chain_invalid');
}

function call(value: Readonly<RpcOperationCall>): void {
  if (!/^[A-Za-z][A-Za-z0-9_]{1,63}$/u.test(value.method)) throw new TypeError('rpc_operation_call_invalid');
  let encoded: string;
  try { encoded = canonicalize(value.params); } catch { throw new TypeError('rpc_operation_call_invalid'); }
  if (Buffer.byteLength(encoded) > 65_536) throw new TypeError('rpc_operation_call_invalid');
}

export function assertRpcOperationRequest(value: Readonly<RpcOperationRequest>): void {
  if (value.contractVersion !== CONTRACT_VERSION || value.schemaVersion !== RPC_OPERATION_REQUEST_SCHEMA_VERSION || !rpcProductIds.includes(value.productId)) throw new TypeError('rpc_operation_version_invalid');
  if (!/^op_[A-Za-z0-9]{20,64}$/u.test(value.operationId) || expectedKind[value.productId] !== value.input.kind) throw new TypeError('rpc_operation_product_mismatch');
  timestamp(value.deadlineAt); amount(value.maximumCharge); chainId(value.input.chainId);
  if (value.productId === 'rpc.health' && value.maximumCharge.amountAtomic !== '0') throw new TypeError('rpc_operation_health_charge_invalid');
  const input = value.input;
  if (input.kind === 'call' || input.kind === 'archive') {
    call(input.call);
    if (input.quorum !== undefined && ![1, 2, 3].includes(input.quorum)) throw new TypeError('rpc_operation_quorum_invalid');
  } else if (input.kind === 'batch') {
    if (input.calls.length < 1 || input.calls.length > 100) throw new TypeError('rpc_operation_batch_invalid');
    for (const item of input.calls) call(item);
    if (input.quorum !== undefined && ![1, 2, 3].includes(input.quorum)) throw new TypeError('rpc_operation_quorum_invalid');
  } else if (input.kind === 'broadcast') {
    call(input.call);
    const expected = input.chainId.startsWith('eip155:') ? 'eth_sendRawTransaction' : 'sendTransaction';
    if (input.call.method !== expected || !/^idem_[A-Za-z0-9]{20,64}$/u.test(input.idempotencyKey)) throw new TypeError('rpc_operation_broadcast_invalid');
  }
}

function outcome(value: Readonly<RpcPublicOutcome>): void {
  if (!Number.isSafeInteger(value.id) || value.id < 1 || value.id > 100) throw new TypeError('rpc_operation_outcome_invalid');
  if (value.ok) {
    try { canonicalize(value.result); } catch { throw new TypeError('rpc_operation_outcome_invalid'); }
  } else if (!Number.isSafeInteger(value.error.code) || value.error.code < -32_768 || value.error.code > 32_767 || value.error.message.length < 1 || value.error.message.length > 512 || /[\u0000-\u001F\u007F]/u.test(value.error.message)) throw new TypeError('rpc_operation_outcome_invalid');
}

function output(request: Readonly<RpcOperationRequest>, value: Readonly<RpcOperationOutput>): void {
  if (value.chainId !== request.input.chainId) throw new TypeError('rpc_operation_result_chain_mismatch');
  if (request.productId === 'rpc.health') {
    if (value.kind !== 'health' || !Number.isSafeInteger(value.healthyRoutes) || value.healthyRoutes < 0 || value.healthyRoutes > 128 || value.highestHeight !== null && (!Number.isSafeInteger(value.highestHeight) || value.highestHeight < 0)) throw new TypeError('rpc_operation_health_result_invalid');
    timestamp(value.observedAt);
  } else if (request.productId === 'rpc.broadcast') {
    if (value.kind !== 'broadcast' || !/^sha256:[a-f0-9]{64}$/u.test(value.requestHash) || value.transactionId !== null && !/^0x[0-9a-fA-F]{64}$/u.test(value.transactionId) && !/^[1-9A-HJ-NP-Za-km-z]{32,128}$/u.test(value.transactionId)) throw new TypeError('rpc_operation_broadcast_result_invalid');
  } else {
    if (value.kind !== 'rpc' || value.outcomes.length < 1 || value.outcomes.length > 100 || ![1, 2, 3].includes(value.quorum) || !/^sha256:[a-f0-9]{64}$/u.test(value.requestHash)) throw new TypeError('rpc_operation_result_invalid');
    const expectedCount = request.input.kind === 'batch' ? request.input.calls.length : 1;
    if (value.outcomes.length !== expectedCount) throw new TypeError('rpc_operation_result_count_mismatch');
    for (const item of value.outcomes) outcome(item);
    timestamp(value.observedAt);
  }
}

export function createRpcOperationResult(input: Readonly<{ request: RpcOperationRequest; completedAt: string; meteredCharge: AssetAmount; output: RpcOperationOutput }>): Readonly<RpcOperationResult> {
  assertRpcOperationRequest(input.request); timestamp(input.completedAt);
  if (Date.parse(input.completedAt) > Date.parse(input.request.deadlineAt)) throw new TypeError('rpc_operation_deadline_exceeded');
  amount(input.meteredCharge);
  if (BigInt(input.meteredCharge.amountAtomic) > BigInt(input.request.maximumCharge.amountAtomic)) throw new TypeError('rpc_operation_charge_exceeded');
  output(input.request, input.output);
  const unsigned = { contractVersion: CONTRACT_VERSION, schemaVersion: RPC_OPERATION_RESULT_SCHEMA_VERSION, operationId: input.request.operationId, productId: input.request.productId, completedAt: input.completedAt, meteredCharge: input.meteredCharge, output: input.output };
  return Object.freeze({ ...unsigned, resultHash: hashJson(unsigned as unknown as JsonValue) });
}

export function verifyRpcOperationResult(value: Readonly<RpcOperationResult>, request: Readonly<RpcOperationRequest>): boolean {
  try { return JSON.stringify(createRpcOperationResult({ request, completedAt: value.completedAt, meteredCharge: value.meteredCharge, output: value.output })) === JSON.stringify(value); }
  catch { return false; }
}
