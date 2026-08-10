import type { AiExecutionRequest } from '../../../packages/contracts/src/index.js';
import type { AiAdapterExecution, AiExecutionAdapter } from '../../../services/ai/src/execution.js';
import type { AiHttpTransport } from './openai-compatible.js';

export interface VertexEmbeddingAdapterConfig {
  routeId: string;
  projectId: string;
  location: 'us-central1';
  exactModelId: 'gemini-embedding-001';
  maximumResponseBytes: number;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('vertex_embedding_response_invalid');
  return value as JsonRecord;
}

function parse(bytes: Uint8Array): JsonRecord {
  try { return record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
  catch { throw new TypeError('vertex_embedding_response_invalid'); }
}

function endpoint(config: VertexEmbeddingAdapterConfig): URL {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/u.test(config.projectId)) throw new TypeError('vertex_embedding_project_invalid');
  return new URL(`https://${config.location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/locations/${config.location}/publishers/google/models/${config.exactModelId}:predict`);
}

export class VertexEmbeddingAdapter implements AiExecutionAdapter {
  readonly routeId: string;
  readonly #config: Readonly<VertexEmbeddingAdapterConfig>;
  readonly #transport: AiHttpTransport;
  readonly #accessToken: () => Promise<string>;
  readonly #clock: () => string;
  readonly #endpoint: URL;

  constructor(input: {
    config: VertexEmbeddingAdapterConfig;
    transport: AiHttpTransport;
    accessToken(): Promise<string>;
    clock?: () => string;
  }) {
    if (!/^ai\.route\.[a-z0-9_]+$/u.test(input.config.routeId)
      || !Number.isInteger(input.config.maximumResponseBytes)
      || input.config.maximumResponseBytes < 1
      || input.config.maximumResponseBytes > 20_000_000) throw new TypeError('vertex_embedding_config_invalid');
    this.#endpoint = endpoint(input.config);
    this.routeId = input.config.routeId;
    this.#config = Object.freeze({ ...input.config });
    this.#transport = input.transport;
    this.#accessToken = input.accessToken;
    this.#clock = input.clock ?? (() => new Date().toISOString());
  }

  async execute(input: Readonly<{ request: AiExecutionRequest; exactModelId: string; signal: AbortSignal }>): Promise<Readonly<AiAdapterExecution>> {
    if (input.exactModelId !== this.#config.exactModelId || input.request.productId !== 'ai.embed' || input.request.input.kind !== 'embedding') throw new TypeError('vertex_embedding_request_binding_invalid');
    if (input.request.input.inputs.length > 250) throw new TypeError('vertex_embedding_input_count_invalid');
    const dimensions = input.request.input.dimensions ?? 3_072;
    if (dimensions > 3_072) throw new TypeError('vertex_embedding_dimensions_invalid');
    let token: string;
    try { token = await this.#accessToken(); } catch { throw new TypeError('vertex_embedding_credential_unavailable'); }
    if (token.length < 8 || token.length > 8_192 || /[\r\n]/u.test(token)) throw new TypeError('vertex_embedding_credential_invalid');
    const vectors: { index: number; embedding: readonly number[] }[] = [];
    let inputTokens = 0;
    for (const [index, content] of input.request.input.inputs.entries()) {
      let response;
      try {
        response = await this.#transport.request({
          url: this.#endpoint.href,
          headers: Object.freeze({ authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' }),
          body: new TextEncoder().encode(JSON.stringify({ instances: [{ content }], parameters: { autoTruncate: false, outputDimensionality: dimensions } })),
          signal: input.signal,
          maximumResponseBytes: this.#config.maximumResponseBytes,
        });
      } catch { throw new TypeError('vertex_embedding_transport_failed'); }
      if (response.status < 200 || response.status >= 300 || response.contentType.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new TypeError('vertex_embedding_http_failed');
      const body = parse(response.body);
      if (!Array.isArray(body.predictions) || body.predictions.length !== 1) throw new TypeError('vertex_embedding_predictions_invalid');
      const embeddings = record(record(body.predictions[0]).embeddings);
      const statistics = record(embeddings.statistics);
      if (statistics.truncated !== false || !Number.isSafeInteger(statistics.token_count) || (statistics.token_count as number) < 0) throw new TypeError('vertex_embedding_usage_invalid');
      if (!Array.isArray(embeddings.values) || embeddings.values.length !== dimensions || embeddings.values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) throw new TypeError('vertex_embedding_vector_invalid');
      inputTokens += statistics.token_count as number;
      vectors.push(Object.freeze({ index, embedding: Object.freeze([...(embeddings.values as number[])]) }));
    }
    return Object.freeze({
      modelIdentity: input.exactModelId,
      completedAt: this.#clock(),
      usage: Object.freeze({ inputTokens, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: 0, videoSeconds: 0, musicGenerations: 0, virtualTryOnImages: 0 }),
      output: Object.freeze({ kind: 'embedding', vectors: Object.freeze(vectors) }),
    });
  }
}
