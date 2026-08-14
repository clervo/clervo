import type {
  AiAdapterExecution,
  AiExecutionAdapter,
} from '../../../services/ai/src/execution.js';
import type {
  AiExecutionRequest,
  AiProductId,
} from '../../../packages/contracts/src/index.js';
import {
  OpenAiCompatibleAdapter,
  type AiArtifactStore,
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
    if (input.runtimeModelId === undefined || input.routeId === undefined || !this.supportsRoute(input.routeId)) throw new TypeError('clervo_ai_gateway_binding_invalid');
    const alternateModelIdentity =
      input.runtimeModelId.startsWith('clervo/')
        ? input.runtimeModelId.slice('clervo/'.length)
        : input.runtimeModelId;

    if (alternateModelIdentity.length === 0) {
      throw new TypeError('clervo_ai_gateway_runtime_model_invalid');
    }

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
      transport: this.#transport,
      secret: this.#secret,
      ...(this.#artifacts === undefined ? {} : { artifacts: this.#artifacts }),
      clock: this.#clock,
    });

    const execution = await adapter.execute({
      request: input.request,
      exactModelId: input.runtimeModelId,
      signal: input.signal,
    });

    if (
      execution.modelIdentity !== input.runtimeModelId
      && execution.modelIdentity !== alternateModelIdentity
    ) {
      throw new TypeError(
        'clervo_ai_gateway_model_identity_mismatch',
      );
    }

    return Object.freeze({
      ...execution,
      modelIdentity: input.runtimeModelId,
    });
  }
}
