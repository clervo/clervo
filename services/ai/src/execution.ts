import {
  assertAiExecutionRequest,
  createAiExecutionResult,
  reconcileAiSupplierCost,
  selectAiRoute,
  type AiExecutionOutput,
  type AiExecutionRequest,
  type AiExecutionResult,
  type AiModelCatalog,
  type AiRoutePricing,
  type AiRuntimeRoute,
  type AiUsage,
} from '../../../packages/contracts/src/index.js';
import type { AiExecutionMonitor, AiExecutionMonitoringEvent } from './monitoring.js';

export interface AiAdapterExecution {
  modelIdentity: string;
  completedAt: string;
  usage: AiUsage;
  output: AiExecutionOutput;
}

export interface AiExecutionAdapter {
  readonly routeId: string;
  execute(input: Readonly<{
    request: AiExecutionRequest;
    exactModelId: string;
    signal: AbortSignal;
  }>): Promise<Readonly<AiAdapterExecution>>;
}

export type AiExecutionFailureCode =
  | 'routing_rejected'
  | 'adapter_missing'
  | 'adapter_failed'
  | 'deadline_exceeded'
  | 'model_identity_mismatch'
  | 'usage_or_output_invalid';

export type AiOperationOutcome =
  | { outcome: 'completed'; result: Readonly<AiExecutionResult> }
  | { outcome: 'failed'; failureCode: AiExecutionFailureCode };

function requiredCapabilities(request: AiExecutionRequest) {
  if (request.input.kind === 'chat') return [
    'text_input' as const,
    'text_output' as const,
    ...(request.input.stream ? ['streaming' as const] : []),
    ...(request.input.responseFormat === 'json_object' ? ['structured_output' as const] : []),
  ];
  if (request.input.kind === 'embedding') return ['text_input' as const, 'embedding_output' as const];
  if (request.input.kind === 'image') return ['text_input' as const, 'image_output' as const];
  return ['text_input' as const, 'audio_output' as const];
}

function failed(failureCode: AiExecutionFailureCode): Readonly<AiOperationOutcome> {
  return Object.freeze({ outcome: 'failed', failureCode });
}

function monitor(value: AiExecutionMonitor | undefined, event: AiExecutionMonitoringEvent): void {
  try { value?.record(event); } catch { /* monitoring cannot change execution semantics */ }
}

export async function executeAiOperation(input: {
  request: Readonly<AiExecutionRequest>;
  catalog: Readonly<AiModelCatalog>;
  routes: readonly AiRuntimeRoute[];
  adapters: readonly AiExecutionAdapter[];
  startedAt: string;
  signal?: AbortSignal;
  clock?: () => number;
  monitor?: AiExecutionMonitor;
}): Promise<Readonly<AiOperationOutcome>> {
  assertAiExecutionRequest(input.request);
  if (Date.parse(input.startedAt) >= Date.parse(input.request.deadlineAt) || input.signal?.aborted) {
    monitor(input.monitor, { occurredAt: input.startedAt, operationId: input.request.operationId, productId: input.request.productId, outcome: 'execution_failed' });
    return failed('deadline_exceeded');
  }
  const decision = selectAiRoute({
    catalog: input.catalog,
    operationId: input.request.operationId,
    productId: input.request.productId,
    requestedModel: input.request.requestedModel,
    requiredCapabilities: requiredCapabilities(input.request),
    usageBounds: input.request.usageBounds,
    maximumSupplierCost: input.request.maximumSupplierCost,
    routes: input.routes,
    decidedAt: input.startedAt,
  });
  if (decision.outcome !== 'selected') {
    monitor(input.monitor, { occurredAt: input.startedAt, operationId: input.request.operationId, productId: input.request.productId, outcome: 'routing_rejected', rejectionCodes: decision.rejectionCodes });
    return failed('routing_rejected');
  }
  const selectedRouteId = decision.selectedRouteId;
  if (selectedRouteId === undefined) throw new TypeError('ai_selected_route_missing');
  const adapter = input.adapters.find(({ routeId }) => routeId === selectedRouteId);
  if (adapter === undefined) {
    monitor(input.monitor, { occurredAt: input.startedAt, operationId: input.request.operationId, productId: input.request.productId, outcome: 'execution_failed', routeId: selectedRouteId });
    return failed('adapter_missing');
  }
  const runtime = input.routes.find(({ definition }) => definition.routeId === selectedRouteId);
  if (runtime === undefined) return failed('adapter_missing');
  const deadlineMs = Date.parse(input.request.deadlineAt);
  const remainingMs = deadlineMs - (input.clock?.() ?? Date.now());
  if (remainingMs <= 0) return failed('deadline_exceeded');
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal?.addEventListener('abort', abort, { once: true });
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('deadline_exceeded')); }, remainingMs); });
    const execution = await Promise.race([adapter.execute({ request: input.request, exactModelId: decision.selectedExactModelId!, signal: controller.signal }), timeout]);
    if (execution.modelIdentity !== decision.selectedExactModelId) {
      monitor(input.monitor, { occurredAt: input.startedAt, operationId: input.request.operationId, productId: input.request.productId, outcome: 'execution_failed', routeId: selectedRouteId });
      return failed('model_identity_mismatch');
    }
    try {
      const cost = reconcileAiSupplierCost({ reservedMaximum: decision.maximumSupplierCost!, usage: execution.usage, pricing: runtime.pricing as AiRoutePricing });
      const result = createAiExecutionResult({ request: input.request, routeDecision: decision, completedAt: execution.completedAt, usage: execution.usage, supplierCost: cost.actual, output: execution.output });
      monitor(input.monitor, { occurredAt: execution.completedAt, operationId: input.request.operationId, productId: input.request.productId, outcome: 'completed', routeId: selectedRouteId });
      return Object.freeze({ outcome: 'completed', result });
    } catch {
      monitor(input.monitor, { occurredAt: input.startedAt, operationId: input.request.operationId, productId: input.request.productId, outcome: 'execution_failed', routeId: selectedRouteId });
      return failed('usage_or_output_invalid');
    }
  } catch (error) {
    monitor(input.monitor, { occurredAt: input.startedAt, operationId: input.request.operationId, productId: input.request.productId, outcome: 'execution_failed', routeId: selectedRouteId });
    return failed(error instanceof Error && error.message === 'deadline_exceeded' ? 'deadline_exceeded' : 'adapter_failed');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    input.signal?.removeEventListener('abort', abort);
  }
}
