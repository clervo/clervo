import {
  createAiAdapterFailureError,
  type AiAdapterExecution,
  type AiAdapterFailureMetadata,
  type AiExecutionAdapter,
} from '../../../services/ai/src/execution.js';
import type {
  AiExecutionRequest,
  AiProductId,
} from '../../../packages/contracts/src/index.js';
import {
  OpenAiCompatibleAdapter,
  type AiArtifactStore,
  type AiHttpResponse,
  type AiHttpTransport,
} from './openai-compatible.js';

export interface ClervoAiGatewayAdapterConfig {
  baseUrl: string;
  allowedHosts: readonly string[];
  secretName: string;
  maximumResponseBytes: number;
}

function productForRequest(request: Readonly<AiExecutionRequest>): AiProductId {
  if (request.input.kind === 'chat') return 'ai.chat';
  if (request.input.kind === 'embedding') return 'ai.embed';
  if (request.input.kind === 'image') return 'ai.image';
  if (request.input.kind === 'speech') return 'ai.speech';
  if (request.input.kind === 'video') return 'ai.video';
  if (request.input.kind === 'music') return 'ai.music';
  return 'ai.virtual_try_on';
}

const aliasReasoningEffort = Object.freeze({
  'clervo/fast': 'low',
  'clervo/smart': 'medium',
  'clervo/code': 'medium',
  'clervo/deep': 'high',
} as const);

function gatewayErrorCode(response: Readonly<AiHttpResponse>): string | undefined {
  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body)) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const error = (parsed as Record<string, unknown>).error;
    if (error === null || typeof error !== 'object' || Array.isArray(error)) return undefined;
    const value = (error as Record<string, unknown>).code ?? (error as Record<string, unknown>).type;
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return /^[A-Za-z0-9_.:-]{1,96}$/u.test(normalized) ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function gatewayFailure(response: Readonly<AiHttpResponse>): Readonly<AiAdapterFailureMetadata> {
  const providerErrorCode = gatewayErrorCode(response);
  const provider = {
    providerStatus: response.status,
    ...(providerErrorCode === undefined ? {} : { providerErrorCode }),
  };
  if (response.status === 401 || response.status === 403) {
    return Object.freeze({ failureClass: 'authentication', commitState: 'not_committed', retryDisposition: 'next_exact_route', ...provider });
  }
  if (response.status === 429) {
    const quota = providerErrorCode !== undefined && /(?:usage|quota|limit)/iu.test(providerErrorCode);
    return Object.freeze({ failureClass: quota ? 'quota' : 'rate_limit', commitState: 'not_committed', retryDisposition: 'next_exact_route', ...provider });
  }
  if (response.status >= 500) {
    return Object.freeze({ failureClass: 'transient', commitState: 'unknown', retryDisposition: 'stop', ...provider });
  }
  return Object.freeze({ failureClass: 'provider_rejected', commitState: 'not_committed', retryDisposition: 'stop', ...provider });
}

function localGatewayFailure(error: unknown): Readonly<AiAdapterFailureMetadata> | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error.message === 'ai_provider_credential_unavailable' || error.message === 'ai_provider_credential_invalid') {
    return Object.freeze({ failureClass: 'authentication', commitState: 'not_started', retryDisposition: 'next_exact_route' });
  }
  if (error.message === 'ai_provider_request_binding_invalid' || error.message === 'clervo_ai_gateway_binding_invalid' || error.message === 'clervo_ai_gateway_runtime_model_invalid') {
    return Object.freeze({ failureClass: 'configuration', commitState: 'not_started', retryDisposition: 'next_exact_route' });
  }
  if (error.message === 'ai_provider_transport_failed') {
    return Object.freeze({ failureClass: 'transport', commitState: 'unknown', retryDisposition: 'stop' });
  }
  return undefined;
}

export class ClervoAiGatewayAdapter implements AiExecutionAdapter {
  readonly routeId = 'ai.route.dynamic_gateway';
  readonly #config: Readonly<ClervoAiGatewayAdapterConfig>;
  readonly #transport: AiHttpTransport;
  readonly #secret: (name: string) => Promise<string>;
  readonly #artifacts: AiArtifactStore | undefined;
  readonly #clock: () => string;

  constructor(input: {
    config: Readonly<ClervoAiGatewayAdapterConfig>;
    transport: AiHttpTransport;
    secret(name: string): Promise<string>;
    artifacts?: AiArtifactStore;
    clock?: () => string;
  }) {
    this.#config = Object.freeze({ ...input.config, allowedHosts: Object.freeze([...input.config.allowedHosts]) });
    this.#transport = input.transport;
    this.#secret = input.secret;
    this.#artifacts = input.artifacts;
    this.#clock = input.clock ?? (() => new Date().toISOString());
  }

  supportsRoute(routeId: string): boolean {
    return /^ai\.route\.(?:dynamic|gateway_)[a-z0-9_]+$/u.test(routeId);
  }

  async execute(input: Readonly<{
    request: AiExecutionRequest;
    exactModelId: string;
    runtimeModelId?: string;
    routeId?: string;
    signal: AbortSignal;
  }>): Promise<Readonly<AiAdapterExecution>> {
    if (input.runtimeModelId === undefined || input.routeId === undefined || !this.supportsRoute(input.routeId)) {
      throw createAiAdapterFailureError('clervo_ai_gateway_binding_invalid', { failureClass: 'configuration', commitState: 'not_started', retryDisposition: 'next_exact_route' });
    }
    const alternateModelIdentity = input.runtimeModelId.startsWith('clervo/')
      ? input.runtimeModelId.slice('clervo/'.length)
      : input.runtimeModelId;

    if (alternateModelIdentity.length === 0) {
      throw createAiAdapterFailureError('clervo_ai_gateway_runtime_model_invalid', { failureClass: 'configuration', commitState: 'not_started', retryDisposition: 'next_exact_route' });
    }

    let observedFailure: Readonly<AiAdapterFailureMetadata> | undefined;
    const observedTransport: AiHttpTransport = Object.freeze({
      request: async (request: Parameters<AiHttpTransport['request']>[0]) => {
        const response = await this.#transport.request(request);
        if (response.status < 200 || response.status >= 300) observedFailure = gatewayFailure(response);
        return response;
      },
    });

    const adapter = new OpenAiCompatibleAdapter({
      config: {
        routeId: input.routeId,
        baseUrl: this.#config.baseUrl,
        allowedHosts: this.#config.allowedHosts,
        secretName: this.#config.secretName,
        exactModelId: input.runtimeModelId,
        productId: productForRequest(input.request),
        maximumResponseBytes: this.#config.maximumResponseBytes,
        ...(input.request.requestedModel in aliasReasoningEffort ? { reasoningEffort: aliasReasoningEffort[input.request.requestedModel as keyof typeof aliasReasoningEffort] } : {}),
      },
      transport: observedTransport,
      secret: this.#secret,
      ...(this.#artifacts === undefined ? {} : { artifacts: this.#artifacts }),
      clock: this.#clock,
    });

    let execution: Readonly<AiAdapterExecution>;
    try {
      execution = await adapter.execute({
        request: input.request,
        exactModelId: input.runtimeModelId,
        signal: input.signal,
      });
    } catch (error) {
      if (observedFailure !== undefined) throw createAiAdapterFailureError('clervo_ai_gateway_upstream_rejected', observedFailure);
      const local = localGatewayFailure(error);
      if (local !== undefined) throw createAiAdapterFailureError(error instanceof Error ? error.message : 'clervo_ai_gateway_failed', local);
      throw error;
    }

    if (execution.modelIdentity !== input.runtimeModelId && execution.modelIdentity !== alternateModelIdentity) {
      throw createAiAdapterFailureError('clervo_ai_gateway_model_identity_mismatch', { failureClass: 'identity_mismatch', commitState: 'committed', retryDisposition: 'stop' });
    }

    return Object.freeze({
      ...execution,
      modelIdentity: input.runtimeModelId,
    });
  }
}
