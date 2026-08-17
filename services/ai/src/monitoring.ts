import {
  alertsForLog,
  createLogRecord,
  createMetricPoint,
  type AlertEvent,
  type LogRecord,
  type MetricPoint,
} from '../../../packages/contracts/src/index.js';
import type { AiAdapterCommitState, AiAdapterFailureClass, AiAdapterRetryDisposition } from './execution.js';

export interface AiExecutionMonitoringEvent {
  occurredAt: string;
  operationId: string;
  productId: 'ai.chat' | 'ai.embed' | 'ai.image' | 'ai.speech' | 'ai.video' | 'ai.music' | 'ai.virtual_try_on';
  outcome: 'attempt_started' | 'attempt_failed' | 'completed' | 'routing_rejected' | 'execution_failed';
  routeId?: string;
  providerId?: string;
  attemptIndex?: number;
  failureClass?: AiAdapterFailureClass;
  commitState?: AiAdapterCommitState;
  retryDisposition?: AiAdapterRetryDisposition;
  retrying?: boolean;
  providerStatus?: number;
  providerErrorCode?: string;
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

function bodyFor(outcome: AiExecutionMonitoringEvent['outcome']): string {
  if (outcome === 'attempt_started') return 'Bounded AI execution attempt started.';
  if (outcome === 'attempt_failed') return 'Bounded AI execution attempt failed with disclosed retry state.';
  if (outcome === 'completed') return 'Bounded AI execution completed.';
  if (outcome === 'routing_rejected') return 'Bounded AI routing failed closed.';
  return 'Bounded AI execution failed closed.';
}

export function createAiExecutionMonitor(): AiExecutionMonitor & { snapshot(): Readonly<AiMonitoringSnapshot> } {
  const logs: Readonly<LogRecord>[] = [];
  const metrics: Readonly<MetricPoint>[] = [];
  const alerts: Readonly<AlertEvent>[] = [];
  let alertSequence = 0;
  return Object.freeze({
    record(event: Readonly<AiExecutionMonitoringEvent>) {
      const terminalFailure = event.outcome === 'routing_rejected' || event.outcome === 'execution_failed';
      const providerUnavailable = event.outcome === 'attempt_failed'
        || event.outcome === 'execution_failed'
        || event.rejectionCodes?.some((code) => ['route_unhealthy', 'circuit_open', 'qualification_unavailable'].includes(code)) === true;
      const severity = terminalFailure ? 'error' as const : event.outcome === 'attempt_failed' ? 'warn' as const : 'info' as const;
      const log = createLogRecord({
        timestamp: event.occurredAt,
        severity,
        eventName: `clervo.ai.${event.outcome}`,
        body: bodyFor(event.outcome),
        service: 'clervo.ai',
        operationId: event.operationId,
        attributes: [
          { name: 'component', value: 'ai_core' },
          { name: 'product_id', value: event.productId },
          { name: 'outcome', value: event.outcome },
          ...(providerUnavailable ? [{ name: 'dependency' as const, value: 'provider' }] : []),
          ...(event.routeId === undefined ? [] : [{ name: 'route_id' as const, value: event.routeId }]),
          ...(event.providerId === undefined ? [] : [{ name: 'adapter_id' as const, value: event.providerId }]),
          ...(event.attemptIndex === undefined ? [] : [{ name: 'attempt_index' as const, value: event.attemptIndex }]),
          ...(event.failureClass === undefined ? [] : [{ name: 'failure_class' as const, value: event.failureClass }]),
          ...(event.commitState === undefined ? [] : [{ name: 'commit_state' as const, value: event.commitState }]),
          ...(event.providerErrorCode === undefined ? [] : [{ name: 'error_code' as const, value: event.providerErrorCode }]),
          ...(event.providerStatus === undefined ? [] : [{ name: 'http_status' as const, value: event.providerStatus }]),
          ...(event.retrying === undefined ? [] : [{ name: 'retryable' as const, value: event.retrying }]),
        ],
      });
      logs.push(log);
      if (event.outcome === 'completed' || terminalFailure) {
        metrics.push(createMetricPoint({ timestamp: event.occurredAt, name: 'clervo.operations', instrument: 'counter', unit: '1', value: 1, attributes: [{ name: 'component', value: 'ai_core' }, { name: 'product_id', value: event.productId }, { name: 'outcome', value: event.outcome }] }));
      }
      if (terminalFailure) alerts.push(...alertsForLog(log, () => `alert_ai_${(++alertSequence).toString().padStart(20, '0')}`));
    },
    snapshot() { return Object.freeze({ logs: Object.freeze([...logs]), metrics: Object.freeze([...metrics]), alerts: Object.freeze([...alerts]) }); },
  });
}
