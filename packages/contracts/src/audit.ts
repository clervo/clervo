import type { JsonPrimitive, JsonValue, OperationState } from './types.js';
import { CONTRACT_VERSION } from './types.js';
import { hashJson } from './receipt.js';

export const auditFactNames = [
  'adapter_id',
  'attempt',
  'duration_ms',
  'error_code',
  'from_state',
  'http_status',
  'latency_ms',
  'product_id',
  'qualification_id',
  'receipt_hash',
  'retryable',
  'route_id',
  'to_state',
] as const;

export type AuditFactName = (typeof auditFactNames)[number];

export interface AuditEvent {
  contractVersion: typeof CONTRACT_VERSION;
  eventId: string;
  sequence: number;
  occurredAt: string;
  eventType: string;
  outcome: 'success' | 'failure' | 'unknown' | 'denied';
  actor: {
    type: 'service' | 'worker' | 'operator' | 'system';
    id: string;
  };
  operationId?: string;
  operationState?: OperationState;
  traceId?: string;
  spanId?: string;
  facts: readonly { name: AuditFactName; value: JsonPrimitive }[];
  previousEventHash?: string;
  eventHash: string;
}

export type UnsignedAuditEvent = Omit<AuditEvent, 'eventHash'>;

function assertAuditFacts(facts: UnsignedAuditEvent['facts']): void {
  const allowed = new Set<string>(auditFactNames);
  for (const fact of facts) {
    if (!allowed.has(fact.name)) throw new TypeError(`audit fact is not allowlisted: ${fact.name}`);
    if (typeof fact.value === 'string' && fact.value.length > 256) throw new TypeError(`audit fact is too long: ${fact.name}`);
  }
}

export function auditEventHash(event: UnsignedAuditEvent): string {
  return hashJson(event as unknown as JsonValue);
}

export function createAuditEvent(event: UnsignedAuditEvent): Readonly<AuditEvent> {
  assertAuditFacts(event.facts);
  return Object.freeze({ ...event, facts: Object.freeze([...event.facts]), eventHash: auditEventHash(event) });
}

export function verifyAuditEvent(event: AuditEvent): boolean {
  const { eventHash: claimed, ...unsigned } = event;
  return claimed === auditEventHash(unsigned);
}