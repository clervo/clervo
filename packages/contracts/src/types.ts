export const CONTRACT_VERSION = '2026-07-29.1' as const;

export const operationStates = [
  'RECEIVED',
  'VALIDATED',
  'QUOTED',
  'PAYMENT_REQUIRED',
  'AUTHORIZED',
  'RESERVED',
  'EXECUTING',
  'EXECUTION_UNKNOWN',
  'EXECUTED',
  'VERIFYING',
  'VERIFIED',
  'SETTLING',
  'SETTLEMENT_UNKNOWN',
  'SETTLED',
  'RECEIPTED',
  'RECONCILING',
  'FAILED',
] as const;

export type OperationState = (typeof operationStates)[number];
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface OperationRequest<TInput extends JsonValue = JsonValue> {
  contractVersion: typeof CONTRACT_VERSION;
  operation: string;
  input: TInput;
}

export interface OperationResult<TOutput extends JsonValue = JsonValue> {
  contractVersion: typeof CONTRACT_VERSION;
  operationId: string;
  operation: string;
  state: 'RECEIPTED';
  replayed: boolean;
  output: TOutput;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  operationId?: string;
  retryable: boolean;
}

export interface OperationSnapshot {
  contractVersion: typeof CONTRACT_VERSION;
  operationId: string;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
  state: OperationState;
  quoteExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}