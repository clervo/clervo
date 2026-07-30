import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alertsForLog,
  createLogRecord,
  createMetricPoint,
  createTraceSpan,
  operationStateAttribute,
} from '../../dist/packages/contracts/src/index.js';

const timestamp = '2026-07-30T16:00:00.000Z';
const operationId = 'op_01JZ8Q5Y4QFD48Q24H6M5F4K9P';
const traceId = '11111111111111111111111111111111';
const spanId = '2222222222222222';

function log(overrides = {}) {
  return createLogRecord({
    timestamp,
    severity: 'info',
    eventName: 'operation.completed',
    body: 'Operation completed.',
    service: 'commerce.worker',
    operationId,
    traceId,
    spanId,
    attributes: [{ name: 'component', value: 'commerce' }],
    ...overrides,
  });
}

test('structured logs redact secret-bearing content and normalize injection characters', () => {
  const credential = ['Bear', 'er opaque-value'].join('');
  const record = log({
    body: credential,
    attributes: [
      { name: 'component', value: 'commerce\nforged=true' },
      { name: ['auth', 'orization'].join(''), value: credential },
    ],
  });
  assert.equal(record.body, '[REDACTED]');
  assert.deepEqual(record.attributes, [{ name: 'component', value: 'commerce forged=true' }]);
  assert.equal(record.redactionCount, 3);
  assert.equal(JSON.stringify(record).includes('opaque-value'), false);
});

test('unknown telemetry fields fail closed instead of exporting raw payloads', () => {
  assert.throws(
    () => log({ attributes: [{ name: 'provider_response', value: { raw: true } }] }),
    /telemetry_attribute_not_allowlisted/,
  );
  assert.throws(() => log({ attributes: [{ name: 'component', value: 'commerce' }, { name: 'component', value: 'worker' }] }), /duplicate/);
});

test('metrics enforce fixed names, units, instruments, and low-cardinality dimensions', () => {
  const point = createMetricPoint({
    timestamp,
    name: 'clervo.operation.duration',
    instrument: 'histogram',
    unit: 's',
    value: 0.125,
    attributes: [{ name: 'component', value: 'commerce' }],
  });
  assert.equal(point.unit, 's');
  assert.throws(() => createMetricPoint({ ...point, instrument: 'counter' }), /invalid_duration_metric/);
  assert.throws(() => createMetricPoint({ ...point, attributes: [{ name: 'operationId', value: operationId }] }), /not_allowlisted/);
});

test('trace spans retain correlation but redact attributes and reject reversed timing', () => {
  const credential = ['api_', 'key=value'].join('');
  const span = createTraceSpan({
    traceId,
    spanId,
    name: 'provider.execute',
    kind: 'client',
    startedAt: timestamp,
    endedAt: '2026-07-30T16:00:00.125Z',
    status: 'error',
    operationId,
    attributes: [{ name: 'error_code', value: credential }],
  });
  assert.deepEqual(span.attributes, [{ name: 'error_code', value: '[REDACTED]' }]);
  assert.equal(span.redactionCount, 1);
  assert.throws(() => createTraceSpan({ ...span, startedAt: span.endedAt, endedAt: timestamp }), /trace_end_before_start/);
});

test('settlement unknown produces a critical delivery-neutral alert', () => {
  const record = log({
    severity: 'error',
    eventName: 'commerce.settlement_unknown',
    attributes: [{ name: 'component', value: 'commerce' }, operationStateAttribute('SETTLEMENT_UNKNOWN')],
  });
  const alerts = alertsForLog(record, () => 'alert_01JZ8Q5Y4QFD48Q24H6M5F4K9P');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].code, 'commerce.settlement_unknown');
  assert.equal(alerts[0].severity, 'critical');
  assert.equal(alerts[0].summary, 'Settlement outcome is unknown and the operation is quarantined.');
});

test('dependency failures map only to fixed safe alert summaries', () => {
  const record = log({
    severity: 'error',
    eventName: 'dependency.failed',
    body: 'untrusted upstream detail',
    attributes: [{ name: 'dependency', value: 'database' }, { name: 'error_code', value: 'connection_refused' }],
  });
  const [alert] = alertsForLog(record, () => 'alert_01JZ8Q5Y4QFD48Q24H6M5F4K9P');
  assert.equal(alert.code, 'dependency.database_unavailable');
  assert.equal(alert.summary, 'Database dependency is unavailable.');
  assert.equal(JSON.stringify(alert).includes('untrusted upstream detail'), false);
  assert.equal(JSON.stringify(alert).includes('connection_refused'), false);
});

test('redaction creates a security signal without reproducing redacted material', () => {
  const credential = ['pass', 'word=value'].join('');
  const record = log({ body: credential });
  const [alert] = alertsForLog(record, () => 'alert_01JZ8Q5Y4QFD48Q24H6M5F4K9P');
  assert.equal(alert.code, 'security.telemetry_redaction');
  assert.equal(JSON.stringify(alert).includes(credential), false);
});

test('alert fingerprints are stable and exclude correlation identifiers', () => {
  const first = alertsForLog(log({ severity: 'error', attributes: [{ name: 'dependency', value: 'provider' }] }), () => 'alert_01JZ8Q5Y4QFD48Q24H6M5F4K9P')[0];
  const second = alertsForLog(log({ severity: 'error', operationId: 'op_01JZ8Q5Y4QFD48Q24H6M5F4K8Q', traceId: '33333333333333333333333333333333', attributes: [{ name: 'dependency', value: 'provider' }] }), () => 'alert_01JZ8Q5Y4QFD48Q24H6M5F4K8Q')[0];
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.labels, [{ name: 'dependency', value: 'provider' }]);
});