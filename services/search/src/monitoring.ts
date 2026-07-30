import {
  alertsForLog,
  createLogRecord,
  createMetricPoint,
  hashJson,
  type AlertEvent,
  type JsonValue,
  type MetricPoint,
} from '../../../packages/contracts/src/index.js';

export const searchMonitoringOutcomes = [
  'execution_failure',
  'paid_completion',
  'payment_challenge',
  'quota_rejected',
  'success',
] as const;

export type SearchMonitoringOutcome = (typeof searchMonitoringOutcomes)[number];
export type SearchMonitoringProductId = 'search.answer' | 'search.web';

export interface SearchMonitoringRecord {
  timestamp: string;
  productId: SearchMonitoringProductId;
  outcome: SearchMonitoringOutcome;
  durationSeconds?: number;
  operationId?: string;
}

export interface SearchMonitoringSummary {
  requestsObserved: number;
  successfulExecutions: number;
  failedExecutions: number;
  quotaRejections: number;
  paymentChallenges: number;
  paidCompletions: number;
  availabilityRatio: number;
  latencySeconds: Readonly<{
    count: number;
    total: number;
    maximum: number;
    average: number;
  }>;
}

export interface SearchMonitoringSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  service: 'search.api';
  summary: Readonly<SearchMonitoringSummary>;
  metricPoints: readonly Readonly<MetricPoint>[];
  alerts: readonly Readonly<AlertEvent>[];
  exportState: Readonly<{
    configured: boolean;
    successfulExports: number;
    failedExports: number;
  }>;
}

export interface SearchMonitoringExporter {
  export(snapshot: Readonly<SearchMonitoringSnapshot>): void | Promise<void>;
}

export interface SearchMonitor {
  record(input: SearchMonitoringRecord): void;
  snapshot(generatedAt: string): Readonly<SearchMonitoringSnapshot>;
  exportSnapshot(generatedAt: string): Promise<boolean>;
}

const productIds = new Set<SearchMonitoringProductId>(['search.answer', 'search.web']);
const outcomes = new Set<SearchMonitoringOutcome>(searchMonitoringOutcomes);
const maximumMetricPoints = 128;
const maximumAlerts = 32;

function assertTimestamp(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value))) throw new TypeError('invalid_search_monitoring_timestamp');
}

function frozenSnapshot<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    for (const item of value) frozenSnapshot(item);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) frozenSnapshot(item);
    return Object.freeze(value);
  }
  return value;
}

export function createSearchMonitor(exporter?: SearchMonitoringExporter): SearchMonitor {
  if (exporter !== undefined && typeof exporter.export !== 'function') throw new TypeError('invalid_search_monitoring_exporter');
  const metricPoints: Readonly<MetricPoint>[] = [];
  const alerts: Readonly<AlertEvent>[] = [];
  const counts = new Map<SearchMonitoringOutcome, number>(searchMonitoringOutcomes.map((outcome) => [outcome, 0]));
  let latencyCount = 0;
  let latencyTotal = 0;
  let latencyMaximum = 0;
  let successfulExports = 0;
  let failedExports = 0;
  let alertSequence = 0;

  const appendMetric = (point: Readonly<MetricPoint>): void => {
    metricPoints.push(point);
    if (metricPoints.length > maximumMetricPoints) metricPoints.shift();
  };

  const appendAlert = (alert: Readonly<AlertEvent>): void => {
    alerts.push(alert);
    if (alerts.length > maximumAlerts) alerts.shift();
  };

  const monitor: SearchMonitor = {
    record(input) {
      assertTimestamp(input.timestamp);
      if (!productIds.has(input.productId)) throw new TypeError('invalid_search_monitoring_product');
      if (!outcomes.has(input.outcome)) throw new TypeError('invalid_search_monitoring_outcome');
      if (input.durationSeconds !== undefined && (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0)) throw new TypeError('invalid_search_monitoring_duration');
      counts.set(input.outcome, (counts.get(input.outcome) ?? 0) + 1);
      appendMetric(createMetricPoint({
        timestamp: input.timestamp,
        name: 'clervo.operations',
        instrument: 'counter',
        unit: '1',
        value: 1,
        attributes: Object.freeze([
          Object.freeze({ name: 'component' as const, value: 'search' }),
          Object.freeze({ name: 'outcome' as const, value: input.outcome }),
          Object.freeze({ name: 'product_id' as const, value: input.productId }),
        ]),
      }));
      if (input.durationSeconds !== undefined) {
        latencyCount += 1;
        latencyTotal += input.durationSeconds;
        latencyMaximum = Math.max(latencyMaximum, input.durationSeconds);
        appendMetric(createMetricPoint({
          timestamp: input.timestamp,
          name: 'clervo.operation.duration',
          instrument: 'histogram',
          unit: 's',
          value: input.durationSeconds,
          attributes: Object.freeze([
            Object.freeze({ name: 'component' as const, value: 'search' }),
            Object.freeze({ name: 'outcome' as const, value: input.outcome }),
            Object.freeze({ name: 'product_id' as const, value: input.productId }),
          ]),
        }));
      }
      if (input.outcome === 'execution_failure') {
        const sequence = alertSequence;
        alertSequence += 1;
        const record = createLogRecord({
          timestamp: input.timestamp,
          severity: 'error',
          eventName: 'search.execution_failed',
          body: 'Bounded search execution failed closed.',
          service: 'search.api',
          ...(input.operationId === undefined ? {} : { operationId: input.operationId }),
          attributes: [
            { name: 'component', value: 'search' },
            { name: 'outcome', value: input.outcome },
            { name: 'product_id', value: input.productId },
          ],
        });
        for (const alert of alertsForLog(record, (code) => {
          const hash = hashJson({ code, productId: input.productId, sequence } as unknown as JsonValue);
          return `alert_${hash.slice('sha256:'.length, 'sha256:'.length + 32)}`;
        })) appendAlert(alert);
      }
    },
    snapshot(generatedAt) {
      assertTimestamp(generatedAt);
      const successfulExecutions = counts.get('success') ?? 0;
      const failedExecutions = counts.get('execution_failure') ?? 0;
      const availabilityDenominator = successfulExecutions + failedExecutions;
      return frozenSnapshot({
        schemaVersion: 1 as const,
        generatedAt,
        service: 'search.api' as const,
        summary: {
          requestsObserved: successfulExecutions
            + failedExecutions
            + (counts.get('quota_rejected') ?? 0)
            + (counts.get('payment_challenge') ?? 0),
          successfulExecutions,
          failedExecutions,
          quotaRejections: counts.get('quota_rejected') ?? 0,
          paymentChallenges: counts.get('payment_challenge') ?? 0,
          paidCompletions: counts.get('paid_completion') ?? 0,
          availabilityRatio: availabilityDenominator === 0 ? 1 : successfulExecutions / availabilityDenominator,
          latencySeconds: {
            count: latencyCount,
            total: latencyTotal,
            maximum: latencyMaximum,
            average: latencyCount === 0 ? 0 : latencyTotal / latencyCount,
          },
        },
        metricPoints: [...metricPoints],
        alerts: [...alerts],
        exportState: {
          configured: exporter !== undefined,
          successfulExports,
          failedExports,
        },
      });
    },
    async exportSnapshot(generatedAt) {
      if (exporter === undefined) return false;
      try {
        await exporter.export(monitor.snapshot(generatedAt));
        successfulExports += 1;
        return true;
      } catch {
        failedExports += 1;
        return false;
      }
    },
  };
  return Object.freeze(monitor);
}