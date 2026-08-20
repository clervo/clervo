import {
  assertAiExecutionRequest,
  createAiExecutionResult,
  reconcileAiSupplierCost,
  selectAiRoute,
  type AiExecutionOutput,
  type AiAlias,
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
  providerModelIdentity?: string;
  completedAt: string;
  usage: AiUsage;
  output: AiExecutionOutput;
}

export type AiAdapterStreamEvent =
  | Readonly<{ type: 'response.started'; modelIdentity: string; providerModelIdentity?: string }>
  | Readonly<{ type: 'text.delta'; text: string }>
  | Readonly<{ type: 'tool_call.delta'; index: number; id?: string; name?: string; argumentsDelta?: string }>
  | Readonly<{ type: 'usage'; usage: AiUsage }>
  | Readonly<{ type: 'response.completed'; finishReason: 'stop' | 'length' | 'tool_calls' }>;

export interface AiExecutionAdapter {
  readonly routeId: string;
  supportsRoute?(routeId: string): boolean;
  execute(input: Readonly<{
    request: AiExecutionRequest;
    exactModelId: string;
    runtimeModelId?: string;
    routeId?: string;
    signal: AbortSignal;
    onEvent?: (event: AiAdapterStreamEvent) => void;
  }>): Promise<Readonly<AiAdapterExecution>>;
}

export interface AiExecutionRuntimeBinding {
  routeId: string;
  customerModelId: string;
  runtimeModelId: string;
  executionEligible: boolean;
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
    ...(request.input.messages.some(({ content }) => Array.isArray(content) && content.some((part) => part.type === 'image_url')) ? ['image_input' as const] : []),
    ...(request.input.stream ? ['streaming' as const] : []),
    ...(request.input.responseFormat !== 'text' ? ['structured_output' as const] : []),
    ...(request.input.responseFormat === 'json_schema' ? ['strict_schema' as const] : []),
    ...((request.input.tools?.length ?? 0) > 0 ? ['tool_calling' as const] : []),
    ...(request.input.parallelToolCalls === true && (request.input.tools?.length ?? 0) > 0 ? ['parallel_tool_calling' as const] : []),
    ...(request.input.reasoningEffort !== undefined && request.input.reasoningEffort !== 'none' ? ['reasoning' as const] : []),
  ];
  if (request.input.kind === 'embedding') return ['text_input' as const, 'embedding_output' as const];
  if (request.input.kind === 'image') return ['text_input' as const, 'image_output' as const];
  if (request.input.kind === 'speech') return ['text_input' as const, 'audio_output' as const];
  if (request.input.kind === 'video') return ['text_input' as const, 'video_output' as const];
  if (request.input.kind === 'music') return ['text_input' as const, 'audio_output' as const, 'music_output' as const];
  return ['image_input' as const, 'image_output' as const];
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
  runtimeBindings?: readonly Readonly<AiExecutionRuntimeBinding>[];
  aliasTargets?: Readonly<Partial<Record<AiAlias, string>>>;
  startedAt: string;
  signal?: AbortSignal;
  clock?: () => number;
  monitor?: AiExecutionMonitor;
  onEvent?: (event: AiAdapterStreamEvent) => void;
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
    ...(input.aliasTargets === undefined ? {} : { aliasTargets: input.aliasTargets }),
    decidedAt: input.startedAt,
  });
  if (decision.outcome !== 'selected') {
    monitor(input.monitor, { occurredAt: input.startedAt, operationId: input.request.operationId, productId: input.request.productId, outcome: 'routing_rejected', rejectionCodes: decision.rejectionCodes });
    return failed('routing_rejected');
  }
  const selectedRouteId = decision.selectedRouteId;
  if (selectedRouteId === undefined) throw new TypeError('ai_selected_route_missing');
  const candidateAdapters = input.adapters.filter((candidate) => candidate.routeId === selectedRouteId || candidate.supportsRoute?.(selectedRouteId) === true);
  if (candidateAdapters.length === 0) {
    monitor(input.monitor, { occurredAt: input.startedAt, operationId: input.request.operationId, productId: input.request.productId, outcome: 'execution_failed', routeId: selectedRouteId });
    return failed('adapter_missing');
  }
  const runtime = input.routes.find(({ definition }) => definition.routeId === selectedRouteId);
  if (runtime === undefined) return failed('adapter_missing');
  const binding = input.runtimeBindings?.find(({ routeId }) => routeId === selectedRouteId);
  if (input.runtimeBindings !== undefined && (binding === undefined || !binding.executionEligible || binding.customerModelId !== decision.selectedExactModelId)) return failed('adapter_missing');
  const runtimeModelId = binding?.runtimeModelId ?? decision.selectedExactModelId!;
  const deadlineMs = Date.parse(input.request.deadlineAt);
  const remainingMs = deadlineMs - (input.clock?.() ?? Date.now());
  if (remainingMs <= 0) return failed('deadline_exceeded');
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal?.addEventListener('abort', abort, { once: true });
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('deadline_exceeded')); }, remainingMs); });
    const maximumAttempts = decision.maximumSupplierCost?.amountAtomic === '0' ? Math.min(3, candidateAdapters.length) : 1;
    let execution: Readonly<AiAdapterExecution> | undefined;
    let lastFailure: unknown;
    for (const adapter of candidateAdapters.slice(0, maximumAttempts)) {
      let emitted = false;
      try {
        const next = await Promise.race([adapter.execute({
          request: input.request, exactModelId: decision.selectedExactModelId!, runtimeModelId, routeId: selectedRouteId, signal: controller.signal,
          ...(input.onEvent === undefined ? {} : { onEvent: (event: AiAdapterStreamEvent) => { emitted = true; input.onEvent!(event); } }),
        }), timeout]);
        if (next.modelIdentity !== runtimeModelId) {
          lastFailure = new Error('model_identity_mismatch');
          if (emitted) return failed('model_identity_mismatch');
          continue;
        }
        execution = next;
        break;
      } catch (error) {
        lastFailure = error;
        if (emitted || error instanceof Error && error.message === 'deadline_exceeded') throw error;
      }
    }
    if (execution === undefined) {
      if (lastFailure instanceof Error && lastFailure.message === 'model_identity_mismatch') return failed('model_identity_mismatch');
      throw lastFailure ?? new Error('adapter_failed');
    }
    try {
      const cost = reconcileAiSupplierCost({ reservedMaximum: decision.maximumSupplierCost!, usage: execution.usage, pricing: runtime.pricing as AiRoutePricing });
      const result = createAiExecutionResult({ request: input.request, routeDecision: decision, completedAt: execution.completedAt, usage: execution.usage, supplierCost: cost.actual, output: execution.output, executedModelId: execution.providerModelIdentity ?? execution.modelIdentity });
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
