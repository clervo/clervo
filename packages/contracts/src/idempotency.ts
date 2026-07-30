export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
export const IDEMPOTENCY_RETENTION_SECONDS = 24 * 60 * 60;

export type IdempotencyDecision =
  | { kind: 'new' }
  | { kind: 'replay'; operationId: string }
  | { kind: 'in_progress'; operationId: string }
  | { kind: 'conflict'; operationId: string };

export interface StoredIdempotencyRecord {
  operationId: string;
  requestHash: string;
  terminal: boolean;
}

export function validateIdempotencyKey(key: string): void {
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new TypeError('Idempotency-Key must be 8-128 visible ASCII token characters');
  }
}

export function decideIdempotency(
  requestHash: string,
  stored?: StoredIdempotencyRecord,
): IdempotencyDecision {
  if (!stored) return { kind: 'new' };
  if (stored.requestHash !== requestHash) return { kind: 'conflict', operationId: stored.operationId };
  if (!stored.terminal) return { kind: 'in_progress', operationId: stored.operationId };
  return { kind: 'replay', operationId: stored.operationId };
}