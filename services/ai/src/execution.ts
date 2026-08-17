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
  type AiRouteDecision,
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

export type AiAdapterFailureClass =
  | 'authentication'
  | 'quota'
  | 'rate_limit'
  | 'transient'
  | 'configuration'
  | 'transport'
  | 'invalid_response'
  | 'identity_mismatch'
  | 'provider_rejected'
  | 'deadline'
  | 'unknown';

export type AiAdapterCommitState = 'not_started' | 'not_committed' | 'unknown' | 'committed';
export type AiAdapterRetryDisposition = 'next_exact_route' | 'stop';

export interface AiAdapterFailureMetadata {
  failureClass: AiAdapterFailureClass;
  commitState: AiAdapterCommitState;
  retryDisposition: AiAdapterRetryDisposition;
  providerStatus?: number;
  providerErrorCode?: string;
}

type AiFailureBearingError = Error & { aiFailure?: Readonly<AiAdapterFailureMetadata> };

const failureClasses = new Set<AiAdapterFailureClass>([
  'authentication',
  'quota',
  'rate_limit',
  'transient',
  'configuration',
  'transport',
  'invalid_response',
  'identity_mismatch',
  'provider_rejected',
  'deadline',
  'unknown',
]);
const commitStates = new Set<AiAdapterCommitState>(['not_started', 'not_committed', 'unknown', 'committed']);
const retryDispositions = new Set<AiAdapterRetryDisposition>(['next_exact_route', 'stop']);

export function createAiAdapterFailureError(message: string, metadata: AiAdapterFailureMetadata): Error {
  const error = new TypeError(message) as AiFailureBearingError;
  Object.defineProperty(error, 'aiFailure', {
    value: Object.freeze({ ...metadata }),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return error;
}

export interface AiExecutionAdapter {
  readonly routeId: string;
  supportsRoute?(routeId: string): boolean;
  execute(input: Readonly<{
    request: AiExecutionRequest;
    exactModelId: string;
    runtimeModelId?: string;
    routeId?: string;
    signal: AbortSignal;
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
    ...(request.input.responseFormat === 'json_object' ? ['structured_output' as const] : []),
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

function nowIso(clock: (() => number) | undefined, fallback: string): string {
  if (clock === undefined) return fallback;
  const value = clock();
  return Number.isFinite(value) ? new Date(value).toISOString() : fallback;
}

function failureMetadata(error: unknown): Readonly<AiAdapterFailureMetadata> {
  if (error instanceof Error) {
    const candidate = (error as AiFailureBearingError).aiFailure;
    if (
      candidate !== undefined
      && failureClasses.has(candidate.failureClass)
      && commitStates.has(candidate.commitState)
      && retryDispositions.has(candidate.retryDisposition)
      && (candidate.providerStatus === undefined || (Number.isInteger(candidate.providerStatus) && candidate.providerStatus >= 100 && candidate.providerStatus <= 599))
      && (candidate.providerErrorCode === undefined || (/^[A-Za-z0-9_.:-]{1,96}$/u.test(candidate.providerErrorCode)))
    ) return candidate;
    if (error.message.includes('model_identity_mismatch')) return Object.freeze({ failureClass: 'identity_mismatch', commitState: 'committed', retryDisposition: 'stop' });
  }
  return Object.freeze({ failureClass: 'unknown', commitState: 'unknown', retryDisposition: 'stop' });
}

function isRetrySafe(metadata: Readonly<AiAdapterFailureMetadata>): boolean {
  return metadata.retryDisposition === 'next_exact_route' && (metadata.commitState === 'not_started' || metadata.commitState === 'not_committed');
}

function selectDecision(input: {
  request: Readonly<AiExecutionRequest>;
  catalog: Readonly<AiModelCatalog>;
  routes: readonly AiRuntimeRoute[];
  aliasTargets?: Readonly<Partial<Record<AiAlias, string>>>;
  decidedAt: string;
}): Readonly<AiRouteDecision> {
  return selectAiRoute({
    catalog: input.catalog,
    operationId: input.request.operationId,
    productId: input.request.productId,
    requestedModel: input.request.requestedModel,
    requiredCapabilities: requiredCapabilities(input.request),
    usageBounds: input.request.usageBounds,
    maximumSupplierCost: input.request.maximumSupplierCost,
    routes: input.routes,
    ...(input.aliasTargets === undefined ? {} : { aliasTargets: input.aliasTargets }),
    decidedAt: input.decidedAt,
  });
}

function nextExactDecision(input: {
  request: Readonly<AiExecutionRequest>;
  catalog: Readonly<AiModelCatalog>;
  routes: readonly AiRuntimeRoute[];
  aliasTargets?: Readonly<Partial<Record<AiAlias, string>>>;
  attemptedRouteIds: ReadonlySet<string>;
  selectedExactModelId: string;
  selectedSupplyFamilyId: string;
  decidedAt: string;
  explicitRouteRequest: boolean;
}): Readonly<AiRouteDecision> | undefined {
  if (input.explicitRouteRequest) return undefined;
  const remaining = input.routes.filter(({ definition }) => definition.exactModelId === input.selectedExactModelId && definition.supplyFamilyId === input.selectedSupplyFamilyId && !input.attemptedRouteIds.has(definition.routeId));
  if (remaining.length === 0) return undefined;
  const decision = selectDecision({
    request: input.request,
    catalog: input.catalog,
    routes: remaining,
    ...(input.aliasTargets === undefined ? {} : { aliasTargets: input.aliasTargets }),
    decidedAt: input.decidedAt,
  });
  if (decision.outcome !== 'selected' || decision.selectedExactModelId !== input.selectedExactModelId || decision.selectedRouteId === undefined) return undefined;
  return decision;
}

function failureEvent(input: {
  occurredAt: string;
  request: Readonly<AiExecutionRequest>;
  outcome: 'attempt_failed' | 'execution_failed';
  routeId: string;
  providerId?: string;
  attemptIndex: number;
  metadata: Readonly<AiAdapterFailureMetadata>;
  retrying: boolean;
}): AiExecutionMonitoringEvent {
  return {
    occurredAt: input.occurredAt,
    operationId: input.request.operationId,
    productId: input.request.productId,
    outcome: input.outcome,
    routeId: input.routeId,
    attemptIndex: input.attemptIndex,
    failureClass: input.metadata.failureClass,
    commitState: input.metadata.commitState,
    retryDisposition: input.metadata.retryDisposition,
    retrying: input.retrying,
    ...(input.providerId === undefined ? {} : { providerId: input.providerId }),
    ...(input.metadata.providerStatus === undefined ? {} : { providerStatus: input.metadata.providerStatus }),
    ...(input.metadata.providerErrorCode === undefined ? {} : { providerErrorCode: input.metadata.providerErrorCode }),
  };
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
}): Promise<Readonly<AiOperationOutcome>> {
  assertAiExecutionRequest(input.request);
  if (Date.parse(input.startedAt) >= Date.parse(input.request.deadlineAt) || input.signal?.aborted) {
    monitor(input.monitor, { occurredAt: input.startedAt, operationId: input.request.operationId, productId: input.request.productId, outcome: 'execution_failed', failureClass: 'deadline', commitState: 'not_started', retryDisposition: 'stop', retrying: false });
    return failed('deadline_exceeded');
  }

  let decision = selectDecision({
    request: input.request,
    catalog: input.catalog,
    routes: input.routes,
    ...(input.aliasTargets === undefined ? {} : { aliasTargets: input.aliasTargets }),
    decidedAt: input.startedAt,
  });
  if (decision.outcome !== 'selected') {
    monitor(input.monitor, { occurredAt: input.startedAt, operationId: input.request.operationId, productId: input.request.productId, outcome: 'routing_rejected', rejectionCodes: decision.rejectionCodes });
    return failed('routing_rejected');
  }

  const selectedExactModelId = decision.selectedExactModelId;
  if (selectedExactModelId === undefined) throw new TypeError('ai_selected_model_missing');
  const initialRoute = input.routes.find(({ definition }) => definition.routeId === decision.selectedRouteId);
  if (initialRoute === undefined) throw new TypeError('ai_selected_route_missing');
  const selectedSupplyFamilyId = initialRoute.definition.supplyFamilyId;
  const explicitRouteRequest = input.routes.some(({ definition }) => definition.routeId === input.request.requestedModel);
  const attemptedRouteIds = new Set<string>();
  let attemptIndex = 0;

  while (decision.outcome === 'selected') {
    const selectedRouteId = decision.selectedRouteId;
    if (selectedRouteId === undefined) throw new TypeError('ai_selected_route_missing');
    if (decision.selectedExactModelId !== selectedExactModelId) throw new TypeError('ai_exact_fallback_identity_drift');
    attemptedRouteIds.add(selectedRouteId);
    attemptIndex += 1;
    const occurredAt = nowIso(input.clock, input.startedAt);
    monitor(input.monitor, {
      occurredAt,
      operationId: input.request.operationId,
      productId: input.request.productId,
      outcome: 'attempt_started',
      routeId: selectedRouteId,
      attemptIndex,
      ...(decision.selectedProviderId === undefined ? {} : { providerId: decision.selectedProviderId }),
    });

    const retryAfter = (metadata: Readonly<AiAdapterFailureMetadata>): Readonly<AiRouteDecision> | undefined => {
      if (!isRetrySafe(metadata)) return undefined;
      return nextExactDecision({
        request: input.request,
        catalog: input.catalog,
        routes: input.routes,
        ...(input.aliasTargets === undefined ? {} : { aliasTargets: input.aliasTargets }),
        attemptedRouteIds,
        selectedExactModelId,
        selectedSupplyFamilyId,
        decidedAt: nowIso(input.clock, input.startedAt),
        explicitRouteRequest,
      });
    };

    const adapter = input.adapters.find((candidate) => candidate.routeId === selectedRouteId || candidate.supportsRoute?.(selectedRouteId) === true);
    const runtime = input.routes.find(({ definition }) => definition.routeId === selectedRouteId);
    const binding = input.runtimeBindings?.find(({ routeId }) => routeId === selectedRouteId);
    const bindingInvalid = input.runtimeBindings !== undefined && (binding === undefined || !binding.executionEligible || binding.customerModelId !== selectedExactModelId);
    if (adapter === undefined || runtime === undefined || bindingInvalid) {
      const metadata = Object.freeze<AiAdapterFailureMetadata>({ failureClass: 'configuration', commitState: 'not_started', retryDisposition: 'next_exact_route' });
      const next = retryAfter(metadata);
      monitor(input.monitor, failureEvent({ occurredAt, request: input.request, outcome: 'attempt_failed', routeId: selectedRouteId, ...(decision.selectedProviderId === undefined ? {} : { providerId: decision.selectedProviderId }), attemptIndex, metadata, retrying: next !== undefined }));
      if (next !== undefined) { decision = next; continue; }
      monitor(input.monitor, failureEvent({ occurredAt, request: input.request, outcome: 'execution_failed', routeId: selectedRouteId, ...(decision.selectedProviderId === undefined ? {} : { providerId: decision.selectedProviderId }), attemptIndex, metadata, retrying: false }));
      return failed('adapter_missing');
    }

    const runtimeModelId = binding?.runtimeModelId ?? selectedExactModelId;
    const deadlineMs = Date.parse(input.request.deadlineAt);
    const remainingMs = deadlineMs - (input.clock?.() ?? Date.now());
    if (remainingMs <= 0) {
      const metadata = Object.freeze<AiAdapterFailureMetadata>({ failureClass: 'deadline', commitState: 'not_started', retryDisposition: 'stop' });
      monitor(input.monitor, failureEvent({ occurredAt, request: input.request, outcome: 'attempt_failed', routeId: selectedRouteId, ...(decision.selectedProviderId === undefined ? {} : { providerId: decision.selectedProviderId }), attemptIndex, metadata, retrying: false }));
      monitor(input.monitor, failureEvent({ occurredAt, request: input.request, outcome: 'execution_failed', routeId: selectedRouteId, ...(decision.selectedProviderId === undefined ? {} : { providerId: decision.selectedProviderId }), attemptIndex, metadata, retrying: false }));
      return failed('deadline_exceeded');
    }

    const controller = new AbortController();
    const abort = () => controller.abort();
    input.signal?.addEventListener('abort', abort, { once: true });
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(createAiAdapterFailureError('deadline_exceeded', { failureClass: 'deadline', commitState: 'unknown', retryDisposition: 'stop' }));
        }, remainingMs);
      });
      const execution = await Promise.race([
        adapter.execute({ request: input.request, exactModelId: selectedExactModelId, runtimeModelId, routeId: selectedRouteId, signal: controller.signal }),
        timeout,
      ]);
      if (execution.modelIdentity !== runtimeModelId) {
        const metadata = Object.freeze<AiAdapterFailureMetadata>({ failureClass: 'identity_mismatch', commitState: 'committed', retryDisposition: 'stop' });
        monitor(input.monitor, failureEvent({ occurredAt: execution.completedAt, request: input.request, outcome: 'attempt_failed', routeId: selectedRouteId, ...(decision.selectedProviderId === undefined ? {} : { providerId: decision.selectedProviderId }), attemptIndex, metadata, retrying: false }));
        monitor(input.monitor, failureEvent({ occurredAt: execution.completedAt, request: input.request, outcome: 'execution_failed', routeId: selectedRouteId, ...(decision.selectedProviderId === undefined ? {} : { providerId: decision.selectedProviderId }), attemptIndex, metadata, retrying: false }));
        return failed('model_identity_mismatch');
      }
      try {
        const cost = reconcileAiSupplierCost({ reservedMaximum: decision.maximumSupplierCost!, usage: execution.usage, pricing: runtime.pricing as AiRoutePricing });
        const result = createAiExecutionResult({ request: input.request, routeDecision: decision, completedAt: execution.completedAt, usage: execution.usage, supplierCost: cost.actual, output: execution.output });
        monitor(input.monitor, {
          occurredAt: execution.completedAt,
          operationId: input.request.operationId,
          productId: input.request.productId,
          outcome: 'completed',
          routeId: selectedRouteId,
          attemptIndex,
          ...(decision.selectedProviderId === undefined ? {} : { providerId: decision.selectedProviderId }),
        });
        return Object.freeze({ outcome: 'completed', result });
      } catch {
        const metadata = Object.freeze<AiAdapterFailureMetadata>({ failureClass: 'invalid_response', commitState: 'committed', retryDisposition: 'stop' });
        monitor(input.monitor, failureEvent({ occurredAt: execution.completedAt, request: input.request, outcome: 'attempt_failed', routeId: selectedRouteId, ...(decision.selectedProviderId === undefined ? {} : { providerId: decision.selectedProviderId }), attemptIndex, metadata, retrying: false }));
        monitor(input.monitor, failureEvent({ occurredAt: execution.completedAt, request: input.request, outcome: 'execution_failed', routeId: selectedRouteId, ...(decision.selectedProviderId === undefined ? {} : { providerId: decision.selectedProviderId }), attemptIndex, metadata, retrying: false }));
        return failed('usage_or_output_invalid');
      }
    } catch (error) {
      const metadata = failureMetadata(error);
      const next = retryAfter(metadata);
      const failedAt = nowIso(input.clock, input.startedAt);
      monitor(input.monitor, failureEvent({ occurredAt: failedAt, request: input.request, outcome: 'attempt_failed', routeId: selectedRouteId, ...(decision.selectedProviderId === undefined ? {} : { providerId: decision.selectedProviderId }), attemptIndex, metadata, retrying: next !== undefined }));
      if (next !== undefined) { decision = next; continue; }
      monitor(input.monitor, failureEvent({ occurredAt: failedAt, request: input.request, outcome: 'execution_failed', routeId: selectedRouteId, ...(decision.selectedProviderId === undefined ? {} : { providerId: decision.selectedProviderId }), attemptIndex, metadata, retrying: false }));
      return failed(metadata.failureClass === 'deadline' ? 'deadline_exceeded' : 'adapter_failed');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      input.signal?.removeEventListener('abort', abort);
    }
  }

  return failed('routing_rejected');
}
