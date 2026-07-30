import { hashJson } from './receipt.js';
import type { JsonPrimitive, JsonValue, OperationState } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export const logAttributeNames = [
  'adapter_id',
  'component',
  'dependency',
  'error_code',
  'http_status',
  'operation_state',
  'outcome',
  'product_id',
  'retryable',
  'route_id',
] as const;

export const metricAttributeNames = ['component', 'dependency', 'outcome', 'product_id'] as const;
export const alertCodes = [
  'commerce.settlement_unknown',
  'dependency.database_unavailable',
  'dependency.facilitator_unavailable',
  'dependency.network_unavailable',
  'dependency.provider_unavailable',
  'search.execution_failure',
  'security.telemetry_redaction',
] as const;

export type LogAttributeName = (typeof logAttributeNames)[number];
export type MetricAttributeName = (typeof metricAttributeNames)[number];
export type AlertCode = (typeof alertCodes)[number];
export type TelemetryAttribute = Readonly<{ name: LogAttributeName; value: JsonPrimitive }>;
export type MetricAttribute = Readonly<{ name: MetricAttributeName; value: string }>;

export interface LogRecord {
  contractVersion: typeof CONTRACT_VERSION;
  timestamp: string;
  severity: 'debug' | 'info' | 'warn' | 'error';
  eventName: string;
  body: string;
  service: string;
  traceId?: string;
  spanId?: string;
  operationId?: string;
  attributes: readonly TelemetryAttribute[];
  redactionCount: number;
}

export interface MetricPoint {
  contractVersion: typeof CONTRACT_VERSION;
  timestamp: string;
  name: 'clervo.alerts' | 'clervo.operation.duration' | 'clervo.operations' | 'clervo.redactions';
  instrument: 'counter' | 'histogram';
  unit: '1' | 's';
  value: number;
  attributes: readonly MetricAttribute[];
}

export interface TraceSpan {
  contractVersion: typeof CONTRACT_VERSION;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: 'internal' | 'server' | 'client' | 'producer' | 'consumer';
  startedAt: string;
  endedAt: string;
  status: 'unset' | 'ok' | 'error';
  operationId?: string;
  attributes: readonly TelemetryAttribute[];
  redactionCount: number;
}

export interface AlertEvent {
  contractVersion: typeof CONTRACT_VERSION;
  alertId: string;
  occurredAt: string;
  code: AlertCode;
  severity: 'warning' | 'critical';
  status: 'firing';
  summary: string;
  fingerprint: string;
  service: string;
  traceId?: string;
  operationId?: string;
  labels: readonly MetricAttribute[];
}

export interface TelemetryInputAttribute {
  name: string;
  value: unknown;
}

export interface LogRecordInput extends Omit<LogRecord, 'contractVersion' | 'attributes' | 'redactionCount'> {
  attributes: readonly TelemetryInputAttribute[];
}

export interface TraceSpanInput extends Omit<TraceSpan, 'contractVersion' | 'attributes' | 'redactionCount'> {
  attributes: readonly TelemetryInputAttribute[];
}

const sensitiveName = /(?:authorization|cookie|credential|password|private[_-]?key|secret|session|signature|token|wallet)/i;
const sensitiveValue = /(?:\bbearer\s+[a-z0-9._~+\/-]+=*|-----BEGIN [^-]*PRIVATE KEY-----|(?:api[_-]?key|password|secret|token)\s*[:=])/i;
const eventNamePattern = /^[a-z][a-z0-9_.]{2,79}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

function sanitizeString(value: string): { value: string; redacted: boolean } {
  if (sensitiveValue.test(value)) return { value: '[REDACTED]', redacted: true };
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return { value: normalized.slice(0, 256), redacted: normalized !== value || normalized.length > 256 };
}

function sanitizeAttributes(attributes: readonly TelemetryInputAttribute[]): { attributes: readonly TelemetryAttribute[]; redactionCount: number } {
  const allowed = new Set<string>(logAttributeNames);
  const seen = new Set<string>();
  const output: TelemetryAttribute[] = [];
  let redactionCount = 0;
  if (attributes.length > 16) throw new TypeError('too_many_telemetry_attributes');
  for (const attribute of attributes) {
    if (seen.has(attribute.name)) throw new TypeError(`duplicate_telemetry_attribute:${attribute.name}`);
    seen.add(attribute.name);
    if (sensitiveName.test(attribute.name)) {
      redactionCount += 1;
      continue;
    }
    if (!allowed.has(attribute.name)) throw new TypeError(`telemetry_attribute_not_allowlisted:${attribute.name}`);
    if (attribute.value === null || typeof attribute.value === 'boolean' || typeof attribute.value === 'number') {
      if (typeof attribute.value === 'number' && !Number.isFinite(attribute.value)) throw new TypeError(`invalid_telemetry_number:${attribute.name}`);
      output.push(Object.freeze({ name: attribute.name as LogAttributeName, value: attribute.value }));
      continue;
    }
    if (typeof attribute.value !== 'string') throw new TypeError(`invalid_telemetry_value:${attribute.name}`);
    const sanitized = sanitizeString(attribute.value);
    if (sanitized.redacted) redactionCount += 1;
    output.push(Object.freeze({ name: attribute.name as LogAttributeName, value: sanitized.value }));
  }
  return { attributes: Object.freeze(output), redactionCount };
}

function assertCommon(name: string, service: string): void {
  if (!eventNamePattern.test(name)) throw new TypeError('invalid_telemetry_name');
  if (!identifierPattern.test(service)) throw new TypeError('invalid_service_name');
}

export function createLogRecord(input: LogRecordInput): Readonly<LogRecord> {
  assertCommon(input.eventName, input.service);
  const body = sanitizeString(input.body);
  const sanitized = sanitizeAttributes(input.attributes);
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    ...input,
    body: body.value,
    attributes: sanitized.attributes,
    redactionCount: sanitized.redactionCount + (body.redacted ? 1 : 0),
  });
}

export function createTraceSpan(input: TraceSpanInput): Readonly<TraceSpan> {
  assertCommon(input.name, 'trace.service');
  if (Date.parse(input.endedAt) < Date.parse(input.startedAt)) throw new TypeError('trace_end_before_start');
  const sanitized = sanitizeAttributes(input.attributes);
  return Object.freeze({ contractVersion: CONTRACT_VERSION, ...input, attributes: sanitized.attributes, redactionCount: sanitized.redactionCount });
}

export function createMetricPoint(input: Omit<MetricPoint, 'contractVersion'>): Readonly<MetricPoint> {
  if (!Number.isFinite(input.value) || input.value < 0) throw new TypeError('invalid_metric_value');
  if (input.name === 'clervo.operation.duration' && (input.instrument !== 'histogram' || input.unit !== 's')) throw new TypeError('invalid_duration_metric');
  if (input.name !== 'clervo.operation.duration' && (input.instrument !== 'counter' || input.unit !== '1')) throw new TypeError('invalid_counter_metric');
  const allowed = new Set<string>(metricAttributeNames);
  const seen = new Set<string>();
  if (input.attributes.length > 4) throw new TypeError('too_many_metric_attributes');
  for (const attribute of input.attributes) {
    if (!allowed.has(attribute.name) || sensitiveName.test(attribute.name)) throw new TypeError(`metric_attribute_not_allowlisted:${attribute.name}`);
    if (seen.has(attribute.name)) throw new TypeError(`duplicate_metric_attribute:${attribute.name}`);
    if (!identifierPattern.test(attribute.value)) throw new TypeError(`invalid_metric_attribute:${attribute.name}`);
    seen.add(attribute.name);
  }
  return Object.freeze({ contractVersion: CONTRACT_VERSION, ...input, attributes: Object.freeze([...input.attributes]) });
}

const alertDefinitions: Record<AlertCode, { severity: AlertEvent['severity']; summary: string }> = {
  'commerce.settlement_unknown': { severity: 'critical', summary: 'Settlement outcome is unknown and the operation is quarantined.' },
  'dependency.database_unavailable': { severity: 'critical', summary: 'Database dependency is unavailable.' },
  'dependency.facilitator_unavailable': { severity: 'critical', summary: 'Payment facilitator dependency is unavailable.' },
  'dependency.network_unavailable': { severity: 'warning', summary: 'External network dependency is unavailable.' },
  'dependency.provider_unavailable': { severity: 'warning', summary: 'Provider dependency is unavailable.' },
  'search.execution_failure': { severity: 'warning', summary: 'A bounded search execution failed closed.' },
  'security.telemetry_redaction': { severity: 'warning', summary: 'Sensitive or unsafe telemetry content was redacted.' },
};

export function alertsForLog(record: LogRecord, alertId: (code: AlertCode) => string): readonly Readonly<AlertEvent>[] {
  const codes = new Set<AlertCode>();
  if (record.redactionCount > 0) codes.add('security.telemetry_redaction');
  const attributes = Object.fromEntries(record.attributes.map((attribute) => [attribute.name, attribute.value]));
  if (attributes.operation_state === 'SETTLEMENT_UNKNOWN') codes.add('commerce.settlement_unknown');
  if (record.severity === 'error' && attributes.dependency === 'database') codes.add('dependency.database_unavailable');
  if (record.severity === 'error' && attributes.dependency === 'facilitator') codes.add('dependency.facilitator_unavailable');
  if (record.severity === 'error' && attributes.dependency === 'network') codes.add('dependency.network_unavailable');
  if (record.severity === 'error' && attributes.dependency === 'provider') codes.add('dependency.provider_unavailable');
  if (record.severity === 'error' && attributes.component === 'search' && attributes.outcome === 'execution_failure') codes.add('search.execution_failure');
  const labels = record.attributes
    .filter((attribute): attribute is { name: MetricAttributeName; value: string } => metricAttributeNames.includes(attribute.name as MetricAttributeName) && typeof attribute.value === 'string')
    .map((attribute) => Object.freeze({ name: attribute.name, value: attribute.value }));
  return Object.freeze([...codes].sort().map((code) => {
    const definition = alertDefinitions[code];
    const fingerprint = hashJson({ code, service: record.service, labels } as unknown as JsonValue);
    return Object.freeze({
      contractVersion: CONTRACT_VERSION,
      alertId: alertId(code),
      occurredAt: record.timestamp,
      code,
      severity: definition.severity,
      status: 'firing' as const,
      summary: definition.summary,
      fingerprint,
      service: record.service,
      ...(record.traceId ? { traceId: record.traceId } : {}),
      ...(record.operationId ? { operationId: record.operationId } : {}),
      labels: Object.freeze(labels),
    });
  }));
}

export function operationStateAttribute(state: OperationState): TelemetryInputAttribute {
  return { name: 'operation_state', value: state };
}