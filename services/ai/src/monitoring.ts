import {
  alertsForLog,
  createLogRecord,
  createMetricPoint,
  type AlertEvent,
  type LogRecord,
  type MetricPoint,
} from '../../../packages/contracts/src/index.js';

export interface AiExecutionMonitoringEvent {
  occurredAt: string;
  operationId: string;
  productId: 'ai.chat' | 'ai.embed' | 'ai.image' | 'ai.speech' | 'ai.video' | 'ai.music' | 'ai.virtual_try_on';
  outcome: 'completed' | 'routing_rejected' | 'execution_failed';
  routeId?: string;
  rejectionCodes?: readonly string[];
}

export interface AiExecutionMonitor {
  record(event: Readonly<AiExecutionMonitoringEvent>): void;
}

export interface AiMonitoringSnapshot {
  logs: readonly Readonly<LogRecord>[];
  metrics: readonly Readonly<MetricPoint>[];
  alerts: readonly Readonly<AlertEvent>[];
}

export function createAiExecutionMonitor(): AiExecutionMonitor & { snapshot(): Readonly<AiMonitoringSnapshot> } {
  const logs: Readonly<LogRecord>[] = [];
  const metrics: Readonly<MetricPoint>[] = [];
  const alerts: Readonly<AlertEvent>[] = [];
  let alertSequence = 0;
  return Object.freeze({
    record(event: Readonly<AiExecutionMonitoringEvent>) {
      const failure = event.outcome !== 'completed';
      const providerUnavailable = event.outcome === 'execution_failed' || event.rejectionCodes?.some((code) => ['route_unhealthy', 'circuit_open', 'qualification_unavailable'].includes(code)) === true;
      const log = createLogRecord({
        timestamp: event.occurredAt,
        severity: failure ? 'error' : 'info',
        eventName: `clervo.ai.${event.outcome}`,
        body: failure ? 'Bounded AI execution failed closed.' : 'Bounded AI execution completed.',
        service: 'clervo.ai',
        operationId: event.operationId,
        attributes: [
          { name: 'component', value: 'ai_core' },
          { name: 'product_id', value: event.productId },
          { name: 'outcome', value: event.outcome },
          ...(providerUnavailable ? [{ name: 'dependency' as const, value: 'provider' }] : []),
          ...(event.routeId === undefined ? [] : [{ name: 'route_id' as const, value: event.routeId }]),
        ],
      });
      logs.push(log);
      metrics.push(createMetricPoint({ timestamp: event.occurredAt, name: 'clervo.operations', instrument: 'counter', unit: '1', value: 1, attributes: [{ name: 'component', value: 'ai_core' }, { name: 'product_id', value: event.productId }, { name: 'outcome', value: event.outcome }] }));
      alerts.push(...alertsForLog(log, () => `alert_ai_${(++alertSequence).toString().padStart(20, '0')}`));
    },
    snapshot() { return Object.freeze({ logs: Object.freeze([...logs]), metrics: Object.freeze([...metrics]), alerts: Object.freeze([...alerts]) }); },
  });
}
