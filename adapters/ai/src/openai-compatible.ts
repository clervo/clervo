import { createHash } from 'node:crypto';
import type {
  AiAdapterExecution,
  AiExecutionAdapter,
} from '../../../services/ai/src/execution.js';
import type {
  AiExecutionOutput,
  AiExecutionRequest,
  AiUsage,
  JsonValue,
} from '../../../packages/contracts/src/index.js';

export interface AiHttpResponse {
  status: number;
  contentType: string;
  body: Uint8Array;
}

export interface AiHttpTransport {
  request(input: Readonly<{
    url: string;
    headers: Readonly<Record<string, string>>;
    body: Uint8Array;
    signal: AbortSignal;
    maximumResponseBytes: number;
  }>): Promise<Readonly<AiHttpResponse>>;
}

export function createBoundedAiHttpTransport(fetcher: typeof globalThis.fetch = globalThis.fetch): AiHttpTransport {
  return Object.freeze({
    async request(input: Parameters<AiHttpTransport['request']>[0]): Promise<Readonly<AiHttpResponse>> {
      const response = await fetcher(input.url, {
        method: 'POST',
        headers: input.headers,
        body: Uint8Array.from(input.body).buffer,
        signal: input.signal,
        redirect: 'error',
      });
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^(?:0|[1-9][0-9]{0,15})$/u.test(declared) || Number(declared) > input.maximumResponseBytes)) throw new TypeError('ai_provider_response_too_large');
      if (response.body === null) throw new TypeError('ai_provider_response_empty');
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          total += next.value.byteLength;
          if (total > input.maximumResponseBytes) {
            await reader.cancel();
            throw new TypeError('ai_provider_response_too_large');
          }
          chunks.push(next.value);
        }
      } finally { reader.releaseLock(); }
      const body = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      return Object.freeze({ status: response.status, contentType: response.headers.get('content-type') ?? '', body });
    },
  });
}

export interface AiArtifactStore {
  put(input: Readonly<{ bytes: Uint8Array; mimeType: string }>): Promise<Readonly<{ artifactUri: string; sha256: string }>>;
}

export interface OpenAiCompatibleAdapterConfig {
  routeId: string;
  baseUrl: string;
  allowedHosts: readonly string[];
  secretName: string;
  exactModelId: string;
  productId: 'ai.chat' | 'ai.embed' | 'ai.image' | 'ai.speech';
  maximumResponseBytes: number;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('ai_provider_response_invalid');
  return value as Record<string, unknown>;
}

function integer(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(`ai_provider_${name}_invalid`);
  return value as number;
}

function string(value: unknown, name: string, maximum = 1_000_000): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) throw new TypeError(`ai_provider_${name}_invalid`);
  return value;
}

function parseJson(bytes: Uint8Array): Record<string, unknown> {
  try { return record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
  catch { throw new TypeError('ai_provider_response_invalid'); }
}

function usageFrom(value: unknown, request: AiExecutionRequest): AiUsage {
  const source = record(value);
  const details = source.prompt_tokens_details === undefined ? {} : record(source.prompt_tokens_details);
  const completionDetails = source.completion_tokens_details === undefined ? {} : record(source.completion_tokens_details);
  return {
    inputTokens: integer(source.prompt_tokens ?? source.input_tokens, 'input_tokens'),
    cachedInputTokens: integer(details.cached_tokens ?? 0, 'cached_input_tokens'),
    outputTokens: integer(source.completion_tokens ?? source.output_tokens ?? 0, 'output_tokens'),
    reasoningTokens: integer(completionDetails.reasoning_tokens ?? 0, 'reasoning_tokens'),
    images: request.input.kind === 'image' ? request.input.count : 0,
    audioCharacters: request.input.kind === 'speech' ? request.input.input.length : 0,
  };
}

function finishReason(value: unknown): 'stop' | 'length' | 'tool_calls' {
  if (value === 'stop' || value === 'length' || value === 'tool_calls') return value;
  throw new TypeError('ai_provider_finish_reason_invalid');
}

function groundedChat(content: string, request: AiExecutionRequest): Extract<AiExecutionOutput, { kind: 'chat' }> {
  if (request.input.kind !== 'chat' || request.input.evidence === undefined) return { kind: 'chat', content, finishReason: 'stop' };
  let parsed: Record<string, unknown>;
  try { parsed = record(JSON.parse(content)); } catch { throw new TypeError('ai_provider_grounded_output_invalid'); }
  const claimsValue = parsed.claims;
  if (!Array.isArray(claimsValue)) throw new TypeError('ai_provider_grounded_output_invalid');
  const claims = claimsValue.map((value) => {
    const claim = record(value);
    if (!Array.isArray(claim.citationIds)) throw new TypeError('ai_provider_grounded_output_invalid');
    return { text: string(claim.text, 'claim', 100_000), citationIds: claim.citationIds.map((id) => string(id, 'citation_id', 80)) };
  });
  return { kind: 'chat', content: claims.map(({ text: claim }) => claim).join('\n'), finishReason: 'stop', claims };
}

function parseChatJson(response: Record<string, unknown>, request: AiExecutionRequest): { model: string; usage: AiUsage; output: Extract<AiExecutionOutput, { kind: 'chat' }> } {
  if (!Array.isArray(response.choices) || response.choices.length !== 1) throw new TypeError('ai_provider_choices_invalid');
  const choice = record(response.choices[0]);
  const message = record(choice.message);
  const output = groundedChat(string(message.content, 'chat_content'), request);
  output.finishReason = finishReason(choice.finish_reason);
  return { model: string(response.model, 'model', 160), usage: usageFrom(response.usage, request), output };
}

function parseChatStream(bytes: Uint8Array, request: AiExecutionRequest): { model: string; usage: AiUsage; output: Extract<AiExecutionOutput, { kind: 'chat' }> } {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let model: string | undefined;
  let content = '';
  let reason: 'stop' | 'length' | 'tool_calls' | undefined;
  let observedUsage: AiUsage | undefined;
  for (const line of source.split(/\r?\n/u)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '' || data === '[DONE]') continue;
    const event = record(JSON.parse(data));
    if (event.model !== undefined) model = string(event.model, 'model', 160);
    if (event.usage !== undefined) observedUsage = usageFrom(event.usage, request);
    if (Array.isArray(event.choices) && event.choices.length > 0) {
      const choice = record(event.choices[0]);
      if (choice.delta !== undefined) {
        const delta = record(choice.delta);
        if (delta.content !== undefined) content += string(delta.content, 'chat_delta');
      }
      if (choice.finish_reason !== undefined && choice.finish_reason !== null) reason = finishReason(choice.finish_reason);
    }
  }
  if (model === undefined || observedUsage === undefined || reason === undefined) throw new TypeError('ai_provider_stream_incomplete');
  const output = groundedChat(content, request);
  output.finishReason = reason;
  return { model, usage: observedUsage, output };
}

function endpoint(config: OpenAiCompatibleAdapterConfig): URL {
  const base = new URL(config.baseUrl);
  if (base.protocol !== 'https:' || base.username !== '' || base.password !== '' || base.search !== '' || base.hash !== '' || !config.allowedHosts.includes(base.hostname) || /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1\]?$)/u.test(base.hostname)) throw new TypeError('ai_provider_base_url_invalid');
  const suffix = config.productId === 'ai.chat' ? 'chat/completions' : config.productId === 'ai.embed' ? 'embeddings' : config.productId === 'ai.image' ? 'images/generations' : 'audio/speech';
  return new URL(suffix, base.href.endsWith('/') ? base : `${base.href}/`);
}

function requestPayload(request: AiExecutionRequest, model: string): Record<string, JsonValue> {
  if (request.input.kind === 'chat') return {
    model,
    messages: request.input.messages as unknown as JsonValue,
    stream: request.input.stream,
    ...(request.input.stream ? { stream_options: { include_usage: true } } : {}),
    ...(request.input.responseFormat === 'json_object' || request.input.evidence !== undefined ? { response_format: { type: 'json_object' } } : {}),
  };
  if (request.input.kind === 'embedding') return { model, input: request.input.inputs as unknown as JsonValue, ...(request.input.dimensions === undefined ? {} : { dimensions: request.input.dimensions }) };
  if (request.input.kind === 'image') return { model, prompt: request.input.prompt, size: request.input.size, quality: request.input.quality, n: request.input.count, response_format: 'b64_json' };
  return { model, input: request.input.input, voice: request.input.voice, response_format: request.input.responseFormat };
}

function sha256(bytes: Uint8Array): string { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }

export class OpenAiCompatibleAdapter implements AiExecutionAdapter {
  readonly routeId: string;
  readonly #config: Readonly<OpenAiCompatibleAdapterConfig>;
  readonly #transport: AiHttpTransport;
  readonly #secret: (name: string) => Promise<string>;
  readonly #artifacts: AiArtifactStore | undefined;
  readonly #clock: () => string;
  readonly #endpoint: URL;

  constructor(input: {
    config: OpenAiCompatibleAdapterConfig;
    transport: AiHttpTransport;
    secret(name: string): Promise<string>;
    artifacts?: AiArtifactStore;
    clock?: () => string;
  }) {
    if (!/^ai\.route\.[a-z0-9_]+$/u.test(input.config.routeId) || !/^[A-Z][A-Z0-9_]{2,63}$/u.test(input.config.secretName) || input.config.exactModelId.length === 0 || !Number.isInteger(input.config.maximumResponseBytes) || input.config.maximumResponseBytes < 1 || input.config.maximumResponseBytes > 20_000_000) throw new TypeError('ai_provider_config_invalid');
    this.#endpoint = endpoint(input.config);
    this.routeId = input.config.routeId;
    this.#config = Object.freeze({ ...input.config, allowedHosts: Object.freeze([...input.config.allowedHosts]) });
    this.#transport = input.transport;
    this.#secret = input.secret;
    this.#artifacts = input.artifacts;
    this.#clock = input.clock ?? (() => new Date().toISOString());
  }

  async execute(input: Readonly<{ request: AiExecutionRequest; exactModelId: string; signal: AbortSignal }>): Promise<Readonly<AiAdapterExecution>> {
    if (input.exactModelId !== this.#config.exactModelId || input.request.productId !== this.#config.productId) throw new TypeError('ai_provider_request_binding_invalid');
    let credential: string;
    try { credential = await this.#secret(this.#config.secretName); }
    catch { throw new TypeError('ai_provider_credential_unavailable'); }
    if (credential.length < 8 || credential.length > 8_192 || /[\r\n]/u.test(credential)) throw new TypeError('ai_provider_credential_invalid');
    const body = new TextEncoder().encode(JSON.stringify(requestPayload(input.request, input.exactModelId)));
    let response: Readonly<AiHttpResponse>;
    try {
      response = await this.#transport.request({
        url: this.#endpoint.href,
        headers: Object.freeze({ authorization: `Bearer ${credential}`, 'content-type': 'application/json', accept: input.request.input.kind === 'chat' && input.request.input.stream ? 'text/event-stream' : '*/*' }),
        body,
        signal: input.signal,
        maximumResponseBytes: this.#config.maximumResponseBytes,
      });
    } catch { throw new TypeError('ai_provider_transport_failed'); }
    if (response.status < 200 || response.status >= 300 || response.body.byteLength === 0 || response.body.byteLength > this.#config.maximumResponseBytes) throw new TypeError('ai_provider_http_failed');
    const mediaType = response.contentType.split(';')[0]?.trim().toLowerCase();
    if (input.request.input.kind === 'chat' && input.request.input.stream) {
      if (mediaType !== 'text/event-stream') throw new TypeError('ai_provider_content_type_invalid');
    } else if (input.request.input.kind !== 'speech' && mediaType !== 'application/json') throw new TypeError('ai_provider_content_type_invalid');
    try {
      if (input.request.input.kind === 'chat') {
        const parsed = input.request.input.stream ? parseChatStream(response.body, input.request) : parseChatJson(parseJson(response.body), input.request);
        return Object.freeze({ modelIdentity: parsed.model, completedAt: this.#clock(), usage: Object.freeze(parsed.usage), output: Object.freeze(parsed.output) });
      }
      if (input.request.input.kind === 'embedding') {
        const parsed = parseJson(response.body);
        if (!Array.isArray(parsed.data) || parsed.data.length !== input.request.input.inputs.length) throw new TypeError('ai_provider_embeddings_invalid');
        const vectors = parsed.data.map((value, index) => {
          const item = record(value);
          if (!Array.isArray(item.embedding)) throw new TypeError('ai_provider_embedding_invalid');
          return Object.freeze({ index: integer(item.index, 'embedding_index'), embedding: Object.freeze(item.embedding.map((entry) => {
            if (typeof entry !== 'number' || !Number.isFinite(entry)) throw new TypeError('ai_provider_embedding_invalid'); return entry;
          })) });
        });
        return Object.freeze({ modelIdentity: string(parsed.model, 'model', 160), completedAt: this.#clock(), usage: Object.freeze(usageFrom(parsed.usage, input.request)), output: Object.freeze({ kind: 'embedding', vectors: Object.freeze(vectors) }) });
      }
      if (this.#artifacts === undefined) throw new TypeError('ai_provider_artifact_store_unavailable');
      if (input.request.input.kind === 'image') {
        const parsed = parseJson(response.body);
        if (!Array.isArray(parsed.data) || parsed.data.length !== input.request.input.count) throw new TypeError('ai_provider_images_invalid');
        const dimensions = input.request.input.size.split('x').map(Number);
        const width = dimensions[0];
        const height = dimensions[1];
        if (width === undefined || height === undefined) throw new TypeError('ai_provider_image_dimensions_invalid');
        const artifacts = await Promise.all(parsed.data.map(async (value) => {
          const encoded = string(record(value).b64_json, 'image_data', this.#config.maximumResponseBytes * 2);
          if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) throw new TypeError('ai_provider_image_encoding_invalid');
          const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'));
          if (bytes.byteLength === 0 || bytes.byteLength > this.#config.maximumResponseBytes) throw new TypeError('ai_provider_image_bytes_invalid');
          const stored = await this.#artifacts!.put({ bytes, mimeType: 'image/png' });
          if (stored.sha256 !== sha256(bytes)) throw new TypeError('ai_provider_artifact_hash_invalid');
          return Object.freeze({ ...stored, mimeType: 'image/png' as const, width, height });
        }));
        const usageValue = parsed.usage ?? { input_tokens: 0, output_tokens: 0 };
        return Object.freeze({ modelIdentity: string(parsed.model, 'model', 160), completedAt: this.#clock(), usage: Object.freeze(usageFrom(usageValue, input.request)), output: Object.freeze({ kind: 'image', artifacts: Object.freeze(artifacts) }) });
      }
      const mime = response.contentType.split(';')[0]?.trim();
      const mimeByFormat = { mp3: 'audio/mpeg', opus: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav', pcm: 'audio/pcm' } as const;
      const expectedMime = mimeByFormat[input.request.input.responseFormat];
      if (mime !== expectedMime) throw new TypeError('ai_provider_speech_mime_invalid');
      const stored = await this.#artifacts.put({ bytes: response.body, mimeType: expectedMime });
      if (stored.sha256 !== sha256(response.body)) throw new TypeError('ai_provider_artifact_hash_invalid');
      return Object.freeze({ modelIdentity: input.exactModelId, completedAt: this.#clock(), usage: Object.freeze({ ...({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0 }), audioCharacters: input.request.input.input.length }), output: Object.freeze({ kind: 'speech', artifact: Object.freeze({ ...stored, mimeType: expectedMime, bytes: response.body.byteLength }) }) });
    } catch { throw new TypeError('ai_provider_response_invalid'); }
  }
}
