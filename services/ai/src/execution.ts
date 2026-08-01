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

export async function executeAiOperation(input: {
  request: Readonly<AiExecutionRequest>;
  catalog: Readonly<AiModelCatalog>;
  routes: readonly AiRuntimeRoute[];
  adapters: readonly AiExecutionAdapter[];
  startedAt: string;
  signal?: AbortSignal;
  clock?: () => number;
}): Promise<Readonly<AiOperationOutcome>> {
  assertAiExecutionRequest(input.request);
  if (Date.parse(input.startedAt) >= Date.parse(input.request.deadlineAt) || input.signal?.aborted) return failed('deadline_exceeded');
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
  if (decision.outcome !== 'selected') return failed('routing_rejected');
  const adapter = input.adapters.find(({ routeId }) => routeId === decision.selectedRouteId);
  if (adapter === undefined) return failed('adapter_missing');
  const runtime = input.routes.find(({ definition }) => definition.routeId === decision.selectedRouteId);
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
    if (execution.modelIdentity !== decision.selectedExactModelId) return failed('model_identity_mismatch');
    try {
      const cost = reconcileAiSupplierCost({ reservedMaximum: decision.maximumSupplierCost!, usage: execution.usage, pricing: runtime.pricing as AiRoutePricing });
      return Object.freeze({ outcome: 'completed', result: createAiExecutionResult({ request: input.request, routeDecision: decision, completedAt: execution.completedAt, usage: execution.usage, supplierCost: cost.actual, output: execution.output }) });
    } catch { return failed('usage_or_output_invalid'); }
  } catch (error) {
    return failed(error instanceof Error && error.message === 'deadline_exceeded' ? 'deadline_exceeded' : 'adapter_failed');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    input.signal?.removeEventListener('abort', abort);
  }
}
