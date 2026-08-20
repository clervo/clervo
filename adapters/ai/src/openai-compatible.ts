import { createHash } from 'node:crypto';
import type {
  AiAdapterExecution,
  AiAdapterStreamEvent,
  AiExecutionAdapter,
} from '../../../services/ai/src/execution.js';
import { validateStrictJsonSchema } from '../../../services/ai/src/json-schema.js';
import type {
  AiExecutionOutput,
  AiExecutionRequest,
  AiToolCall,
  AiUsage,
  JsonValue,
} from '../../../packages/contracts/src/index.js';

export interface AiHttpResponse {
  status: number;
  contentType: string;
  body: Uint8Array;
  responseHeaders?: Readonly<Record<string, string>>;
}

export interface AiHttpStreamResponse {
  status: number;
  contentType: string;
  chunks: AsyncIterable<Uint8Array>;
  responseHeaders?: Readonly<Record<string, string>>;
}

export interface AiHttpTransport {
  request(input: Readonly<{
    url: string;
    headers: Readonly<Record<string, string>>;
    body: Uint8Array;
    signal: AbortSignal;
    maximumResponseBytes: number;
  }>): Promise<Readonly<AiHttpResponse>>;
  stream?(input: Readonly<{
    url: string;
    headers: Readonly<Record<string, string>>;
    body: Uint8Array;
    signal: AbortSignal;
    maximumResponseBytes: number;
  }>): Promise<Readonly<AiHttpStreamResponse>>;
}

export function createBoundedAiHttpTransport(fetcher: typeof globalThis.fetch = globalThis.fetch): AiHttpTransport {
  const responseHeaders = (response: Response) => Object.freeze(Object.fromEntries(
    ['dg-char-count', 'dg-model-name', 'dg-model-uuid', 'dg-request-id', 'retry-after']
      .map((name) => [name, response.headers.get(name)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null),
  ));
  const fetchResponse = async (input: Parameters<AiHttpTransport['request']>[0]) => {
    const response = await fetcher(input.url, {
      method: 'POST', headers: input.headers, body: Uint8Array.from(input.body).buffer,
      signal: input.signal, redirect: 'error',
    });
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^(?:0|[1-9][0-9]{0,15})$/u.test(declared) || Number(declared) > input.maximumResponseBytes)) throw new TypeError('ai_provider_response_too_large');
    if (response.body === null) throw new TypeError('ai_provider_response_empty');
    return response;
  };
  return Object.freeze({
    async request(input: Parameters<AiHttpTransport['request']>[0]): Promise<Readonly<AiHttpResponse>> {
      const response = await fetchResponse(input);
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = response.body!.getReader();
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
      return Object.freeze({ status: response.status, contentType: response.headers.get('content-type') ?? '', body, responseHeaders: responseHeaders(response) });
    },
    async stream(input: Parameters<NonNullable<AiHttpTransport['stream']>>[0]): Promise<Readonly<AiHttpStreamResponse>> {
      const response = await fetchResponse(input);
      const body = response.body!;
      async function* chunks() {
        const reader = body.getReader();
        let total = 0;
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) return;
            total += next.value.byteLength;
            if (total > input.maximumResponseBytes) {
              await reader.cancel();
              throw new TypeError('ai_provider_response_too_large');
            }
            yield next.value;
          }
        } finally { reader.releaseLock(); }
      }
      return Object.freeze({ status: response.status, contentType: response.headers.get('content-type') ?? '', chunks: chunks(), responseHeaders: responseHeaders(response) });
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
  productId: 'ai.chat' | 'ai.embed' | 'ai.image' | 'ai.speech' | 'ai.video' | 'ai.music' | 'ai.virtual_try_on';
  maximumResponseBytes: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  reasoningFormat?: 'hidden';
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
  const reasoningTokens = integer(completionDetails.reasoning_tokens ?? 0, 'reasoning_tokens');
  const totalCompletionTokens = integer(source.completion_tokens ?? source.output_tokens ?? 0, 'output_tokens');
  if (reasoningTokens > totalCompletionTokens) throw new TypeError('ai_provider_reasoning_tokens_invalid');
  return {
    inputTokens: integer(source.prompt_tokens ?? source.input_tokens, 'input_tokens'),
    cachedInputTokens: integer(details.cached_tokens ?? 0, 'cached_input_tokens'),
    // OpenAI-compatible completion_tokens includes hidden reasoning. Clervo
    // prices and bounds visible output and reasoning separately.
    outputTokens: totalCompletionTokens - reasoningTokens,
    reasoningTokens,
    images: request.input.kind === 'image' ? request.input.count : 0,
    audioCharacters: request.input.kind === 'speech' ? request.input.input.length : 0,
    videoSeconds: request.input.kind === 'video' ? request.input.durationSeconds : 0,
    musicGenerations: request.input.kind === 'music' ? 1 : 0,
    virtualTryOnImages: request.input.kind === 'virtual_try_on' ? 1 : 0,
  };
}

function finishReason(value: unknown): 'stop' | 'length' | 'tool_calls' {
  if (value === 'stop' || value === 'length' || value === 'tool_calls') return value;
  throw new TypeError('ai_provider_finish_reason_invalid');
}

function parseToolCalls(value: unknown): readonly AiToolCall[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) throw new TypeError('ai_provider_tool_calls_invalid');
  return Object.freeze(value.map((entry) => {
    const call = record(entry);
    const fn = record(call.function);
    const id = string(call.id, 'tool_call_id', 128);
    const name = string(fn.name, 'tool_name', 64);
    const args = typeof fn.arguments === 'string' ? fn.arguments : '';
    if (call.type !== 'function' || !/^[A-Za-z0-9_-]{1,128}$/u.test(id) || !/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/u.test(name) || args.length > 100_000) throw new TypeError('ai_provider_tool_call_invalid');
    let parsed: unknown;
    try { parsed = JSON.parse(args); } catch { throw new TypeError('ai_provider_tool_arguments_invalid'); }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('ai_provider_tool_arguments_invalid');
    return Object.freeze({ id, type: 'function' as const, function: Object.freeze({ name, arguments: args }) });
  }));
}

function validateToolCallsForRequest(calls: readonly AiToolCall[], request: AiExecutionRequest): void {
  if (request.input.kind !== 'chat' || request.input.tools === undefined || request.input.toolChoice === 'none') throw new TypeError('ai_provider_tool_calls_unexpected');
  if (request.input.parallelToolCalls === false && calls.length > 1) throw new TypeError('ai_provider_parallel_tool_calls_unexpected');
  const forcedName = typeof request.input.toolChoice === 'object' ? request.input.toolChoice.function.name : undefined;
  for (const call of calls) {
    const tool = request.input.tools.find(({ function: definition }) => definition.name === call.function.name);
    if (tool === undefined || forcedName !== undefined && call.function.name !== forcedName) throw new TypeError('ai_provider_unknown_tool_call');
    if (tool.function.strict === true && !validateStrictJsonSchema(tool.function.parameters, JSON.parse(call.function.arguments))) throw new TypeError('ai_provider_tool_schema_validation_failed');
  }
}

function parsedStructured(content: string, request: AiExecutionRequest): JsonValue | undefined {
  if (request.input.kind !== 'chat' || request.input.responseFormat === 'text') return undefined;
  let parsed: JsonValue;
  try { parsed = JSON.parse(content) as JsonValue; } catch { throw new TypeError('ai_provider_structured_output_invalid'); }
  if (request.input.responseFormat === 'json_schema' && !validateStrictJsonSchema(request.input.jsonSchema!.schema, parsed)) throw new TypeError('ai_provider_schema_validation_failed');
  return parsed;
}

function chatOutput(content: string, request: AiExecutionRequest, reason: 'stop' | 'length' | 'tool_calls', toolCalls?: readonly AiToolCall[]): Extract<AiExecutionOutput, { kind: 'chat' }> {
  if (request.input.kind !== 'chat') throw new TypeError('ai_provider_chat_request_invalid');
  const structured = parsedStructured(content, request);
  if (request.input.evidence === undefined) return {
    kind: 'chat', content, finishReason: reason,
    ...(toolCalls === undefined ? {} : { toolCalls }),
    ...(structured === undefined ? {} : { structured }),
  };
  let parsed: Record<string, unknown>;
  try { parsed = record(JSON.parse(content)); } catch { throw new TypeError('ai_provider_grounded_output_invalid'); }
  const claimsValue = parsed.claims;
  if (!Array.isArray(claimsValue)) throw new TypeError('ai_provider_grounded_output_invalid');
  const claims = claimsValue.map((value) => {
    const claim = record(value);
    if (!Array.isArray(claim.citationIds)) throw new TypeError('ai_provider_grounded_output_invalid');
    return { text: string(claim.text, 'claim', 100_000), citationIds: claim.citationIds.map((id) => string(id, 'citation_id', 80)) };
  });
  return { kind: 'chat', content: claims.map(({ text: claim }) => claim).join('\n'), finishReason: reason, claims };
}

function parseChatJson(response: Record<string, unknown>, request: AiExecutionRequest): { model: string; usage: AiUsage; output: Extract<AiExecutionOutput, { kind: 'chat' }> } {
  if (!Array.isArray(response.choices) || response.choices.length !== 1) throw new TypeError('ai_provider_choices_invalid');
  const choice = record(response.choices[0]);
  const message = record(choice.message);
  const reason = finishReason(choice.finish_reason);
  const toolCalls = message.tool_calls === undefined ? undefined : parseToolCalls(message.tool_calls);
  if (toolCalls !== undefined) validateToolCallsForRequest(toolCalls, request);
  const content = message.content === null && toolCalls !== undefined ? '' : typeof message.content === 'string' ? message.content : (() => { throw new TypeError('ai_provider_chat_content_invalid'); })();
  if (content.length > 1_000_000 || reason === 'tool_calls' !== (toolCalls !== undefined)) throw new TypeError('ai_provider_chat_content_invalid');
  const output = chatOutput(content, request, reason, toolCalls);
  return { model: string(response.model, 'model', 160), usage: usageFrom(response.usage, request), output };
}

async function parseChatStream(chunks: AsyncIterable<Uint8Array>, request: AiExecutionRequest, onEvent?: (event: AiAdapterStreamEvent) => void): Promise<{ model: string; usage: AiUsage; output: Extract<AiExecutionOutput, { kind: 'chat' }> }> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  let model: string | undefined;
  let content = '';
  let reason: 'stop' | 'length' | 'tool_calls' | undefined;
  let observedUsage: AiUsage | undefined;
  const toolParts = new Map<number, { id: string; name: string; arguments: string }>();
  const processLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (data === '' || data === '[DONE]') return;
    const event = record(JSON.parse(data));
    if (event.model !== undefined) {
      const nextModel = string(event.model, 'model', 160);
      if (model !== undefined && model !== nextModel) throw new TypeError('ai_provider_stream_model_changed');
      if (model === undefined) { model = nextModel; onEvent?.(Object.freeze({ type: 'response.started', modelIdentity: model })); }
    }
    if (event.usage !== undefined && event.usage !== null) {
      observedUsage = usageFrom(event.usage, request);
      onEvent?.(Object.freeze({ type: 'usage', usage: observedUsage }));
    }
    if (Array.isArray(event.choices) && event.choices.length > 0) {
      const choice = record(event.choices[0]);
      if (choice.delta !== undefined) {
        const delta = record(choice.delta);
        if (delta.content !== undefined && delta.content !== null) {
          if (typeof delta.content !== 'string' || delta.content.length > 1_000_000) throw new TypeError('ai_provider_chat_delta_invalid');
          content += delta.content;
          if (content.length > 1_000_000) throw new TypeError('ai_provider_chat_delta_invalid');
          if (delta.content.length > 0) onEvent?.(Object.freeze({ type: 'text.delta', text: delta.content }));
        }
        if (delta.tool_calls !== undefined) {
          if (!Array.isArray(delta.tool_calls)) throw new TypeError('ai_provider_tool_delta_invalid');
          for (const raw of delta.tool_calls) {
            const tool = record(raw);
            const index = integer(tool.index, 'tool_index');
            const prior = toolParts.get(index) ?? { id: '', name: '', arguments: '' };
            const fn = tool.function === undefined ? {} : record(tool.function);
            const id = tool.id === undefined ? '' : string(tool.id, 'tool_call_id', 128);
            const name = fn.name === undefined ? '' : string(fn.name, 'tool_name', 64);
            const argumentsDelta = fn.arguments === undefined ? '' : typeof fn.arguments === 'string' ? fn.arguments : (() => { throw new TypeError('ai_provider_tool_delta_invalid'); })();
            if (prior.id !== '' && id !== '' && prior.id !== id || prior.name !== '' && name !== '' && prior.name !== name) throw new TypeError('ai_provider_tool_delta_changed');
            const next = { id: prior.id || id, name: prior.name || name, arguments: prior.arguments + argumentsDelta };
            if (next.arguments.length > 100_000) throw new TypeError('ai_provider_tool_delta_invalid');
            toolParts.set(index, next);
            onEvent?.(Object.freeze({ type: 'tool_call.delta', index, ...(id === '' ? {} : { id }), ...(name === '' ? {} : { name }), ...(argumentsDelta === '' ? {} : { argumentsDelta }) }));
          }
        }
      }
      if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
        reason = finishReason(choice.finish_reason);
        onEvent?.(Object.freeze({ type: 'response.completed', finishReason: reason }));
      }
    }
  };
  for await (const chunk of chunks) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop() ?? '';
    for (const line of lines) processLine(line);
  }
  pending += decoder.decode();
  if (pending.length > 0) processLine(pending);
  if (model === undefined || observedUsage === undefined || reason === undefined) throw new TypeError('ai_provider_stream_incomplete');
  const toolCalls = toolParts.size === 0 ? undefined : parseToolCalls([...toolParts.entries()].sort(([a], [b]) => a - b).map(([, value]) => ({ id: value.id, type: 'function', function: { name: value.name, arguments: value.arguments } })));
  if (toolCalls !== undefined) validateToolCallsForRequest(toolCalls, request);
  if (reason === 'tool_calls' !== (toolCalls !== undefined)) throw new TypeError('ai_provider_stream_tool_calls_invalid');
  const output = chatOutput(content, request, reason, toolCalls);
  return { model, usage: observedUsage, output };
}

function endpoint(config: OpenAiCompatibleAdapterConfig): URL {
  const base = new URL(config.baseUrl);
  if (base.protocol !== 'https:' || base.username !== '' || base.password !== '' || base.search !== '' || base.hash !== '' || !config.allowedHosts.includes(base.hostname) || /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1\]?$)/u.test(base.hostname)) throw new TypeError('ai_provider_base_url_invalid');
  const suffix = config.productId === 'ai.chat' ? 'chat/completions'
    : config.productId === 'ai.embed' ? 'embeddings'
      : config.productId === 'ai.image' ? 'images/generations'
        : config.productId === 'ai.speech' ? 'audio/speech'
          : config.productId === 'ai.video' ? 'videos/generations'
            : config.productId === 'ai.music' ? 'music/generations'
              : 'virtual-try-on';
  return new URL(suffix, base.href.endsWith('/') ? base : `${base.href}/`);
}

function requestPayload(request: AiExecutionRequest, config: Readonly<OpenAiCompatibleAdapterConfig>): Record<string, JsonValue> {
  const model = config.exactModelId;
  if (request.input.kind === 'chat') return {
    model,
    messages: request.input.messages.map(({ toolCallId, toolCalls, ...message }) => ({
      ...message,
      ...(toolCallId === undefined ? {} : { tool_call_id: toolCallId }),
      ...(toolCalls === undefined ? {} : { tool_calls: toolCalls }),
    })) as unknown as JsonValue,
    stream: request.input.stream,
    max_completion_tokens: request.usageBounds.outputTokens + request.usageBounds.reasoningTokens,
    ...((request.input.reasoningEffort ?? config.reasoningEffort) === undefined ? {} : { reasoning_effort: request.input.reasoningEffort ?? config.reasoningEffort! }),
    ...(config.reasoningFormat === undefined ? {} : { reasoning_format: config.reasoningFormat }),
    ...(request.input.stream ? { stream_options: { include_usage: true } } : {}),
    ...(request.input.tools === undefined ? {} : { tools: request.input.tools as unknown as JsonValue }),
    ...(request.input.toolChoice === undefined ? {} : { tool_choice: request.input.toolChoice as unknown as JsonValue }),
    ...(request.input.parallelToolCalls === undefined ? {} : { parallel_tool_calls: request.input.parallelToolCalls }),
    ...(request.input.responseFormat === 'json_schema'
      ? { response_format: { type: 'json_schema', json_schema: request.input.jsonSchema as unknown as JsonValue } }
      : request.input.responseFormat === 'json_object' || request.input.evidence !== undefined
        ? { response_format: { type: 'json_object' } }
        : {}),
  };
  if (request.input.kind === 'embedding') return { model, input: request.input.inputs as unknown as JsonValue, ...(request.input.dimensions === undefined ? {} : { dimensions: request.input.dimensions }) };
  if (request.input.kind === 'image') return { model, prompt: request.input.prompt, size: request.input.size, quality: request.input.quality, n: request.input.count, response_format: 'b64_json' };
  if (request.input.kind === 'speech') return { model, input: request.input.input, voice: request.input.voice, response_format: request.input.responseFormat };
  if (request.input.kind === 'video') return { model, prompt: request.input.prompt, duration_seconds: request.input.durationSeconds, aspect_ratio: request.input.aspectRatio, resolution: request.input.resolution };
  if (request.input.kind === 'music') return { model, prompt: request.input.prompt, duration_seconds: request.input.durationSeconds, instrumental: request.input.instrumental };
  return { model, person_image: { b64_json: request.input.personImageBase64 }, product_image: { b64_json: request.input.productImageBase64 } };
}

function sha256(bytes: Uint8Array): string { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }

function decodedMedia(value: unknown, maximumBytes: number): Readonly<{ bytes: Uint8Array; mimeType: string }> {
  const item = record(value);
  const encoded = string(item.b64_json, 'media_data', maximumBytes * 2);
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) throw new TypeError('ai_provider_media_encoding_invalid');
  const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'));
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) throw new TypeError('ai_provider_media_bytes_invalid');
  return Object.freeze({ bytes, mimeType: string(item.mime_type ?? item.mimeType, 'media_mime', 80).toLowerCase() });
}

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
    if (!/^ai\.route\.[a-z0-9_]+$/u.test(input.config.routeId) || !/^[A-Z][A-Z0-9_]{2,63}$/u.test(input.config.secretName) || input.config.exactModelId.length === 0 || !Number.isInteger(input.config.maximumResponseBytes) || input.config.maximumResponseBytes < 1 || input.config.maximumResponseBytes > 80_000_000 || ((input.config.reasoningEffort !== undefined || input.config.reasoningFormat !== undefined) && input.config.productId !== 'ai.chat')) throw new TypeError('ai_provider_config_invalid');
    this.#endpoint = endpoint(input.config);
    this.routeId = input.config.routeId;
    this.#config = Object.freeze({ ...input.config, allowedHosts: Object.freeze([...input.config.allowedHosts]) });
    this.#transport = input.transport;
    this.#secret = input.secret;
    this.#artifacts = input.artifacts;
    this.#clock = input.clock ?? (() => new Date().toISOString());
  }

  async execute(input: Readonly<{ request: AiExecutionRequest; exactModelId: string; signal: AbortSignal; onEvent?: (event: AiAdapterStreamEvent) => void }>): Promise<Readonly<AiAdapterExecution>> {
    if (input.exactModelId !== this.#config.exactModelId || input.request.productId !== this.#config.productId) throw new TypeError('ai_provider_request_binding_invalid');
    let credential: string;
    try { credential = await this.#secret(this.#config.secretName); }
    catch { throw new TypeError('ai_provider_credential_unavailable'); }
    if (credential.length < 8 || credential.length > 8_192 || /[\r\n]/u.test(credential)) throw new TypeError('ai_provider_credential_invalid');
    const body = new TextEncoder().encode(JSON.stringify(requestPayload(input.request, this.#config)));
    const headers = Object.freeze({ authorization: `Bearer ${credential}`, 'content-type': 'application/json', accept: input.request.input.kind === 'chat' && input.request.input.stream ? 'text/event-stream' : '*/*' });
    if (input.request.input.kind === 'chat' && input.request.input.stream && input.onEvent !== undefined) {
      if (this.#transport.stream === undefined) throw new TypeError('ai_provider_true_streaming_unavailable');
      try {
        const streamed = await this.#transport.stream({ url: this.#endpoint.href, headers, body, signal: input.signal, maximumResponseBytes: this.#config.maximumResponseBytes });
        if (streamed.status < 200 || streamed.status >= 300) throw Object.assign(new TypeError(`ai_provider_http_${streamed.status}`), { supplierStatus: streamed.status, retryAfter: streamed.responseHeaders?.['retry-after'] });
        if (streamed.contentType.split(';')[0]?.trim().toLowerCase() !== 'text/event-stream') throw new TypeError('ai_provider_stream_content_type_invalid');
        const parsed = await parseChatStream(streamed.chunks, input.request, input.onEvent);
        return Object.freeze({ modelIdentity: parsed.model, completedAt: this.#clock(), usage: Object.freeze(parsed.usage), output: Object.freeze(parsed.output) });
      } catch (error) {
        if (error instanceof TypeError && error.message.startsWith('ai_provider_')) throw error;
        throw new TypeError('ai_provider_transport_failed');
      }
    }
    let response: Readonly<AiHttpResponse>;
    try {
      response = await this.#transport.request({
        url: this.#endpoint.href,
        headers,
        body,
        signal: input.signal,
        maximumResponseBytes: this.#config.maximumResponseBytes,
      });
    } catch { throw new TypeError('ai_provider_transport_failed'); }
    if (response.status < 200 || response.status >= 300) throw Object.assign(new TypeError(`ai_provider_http_${response.status}`), { supplierStatus: response.status, retryAfter: response.responseHeaders?.['retry-after'] });
    if (response.body.byteLength === 0 || response.body.byteLength > this.#config.maximumResponseBytes) throw new TypeError('ai_provider_http_failed');
    const mediaType = response.contentType.split(';')[0]?.trim().toLowerCase();
    if (input.request.input.kind === 'chat' && input.request.input.stream) {
      if (mediaType !== 'text/event-stream') throw new TypeError('ai_provider_content_type_invalid');
    } else if (input.request.input.kind !== 'speech' && mediaType !== 'application/json') throw new TypeError('ai_provider_content_type_invalid');
    try {
      if (input.request.input.kind === 'chat') {
        const parsed = input.request.input.stream
          ? await parseChatStream((async function* () { yield response.body; })(), input.request)
          : parseChatJson(parseJson(response.body), input.request);
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
          const media = decodedMedia(value, this.#config.maximumResponseBytes);
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(media.mimeType)) throw new TypeError('ai_provider_image_mime_invalid');
          const stored = await this.#artifacts!.put({ bytes: media.bytes, mimeType: media.mimeType });
          if (stored.sha256 !== sha256(media.bytes)) throw new TypeError('ai_provider_artifact_hash_invalid');
          return Object.freeze({ ...stored, mimeType: media.mimeType as 'image/png' | 'image/jpeg' | 'image/webp', width, height });
        }));
        const usageValue = parsed.usage ?? { input_tokens: 0, output_tokens: 0 };
        return Object.freeze({ modelIdentity: string(parsed.model, 'model', 160), completedAt: this.#clock(), usage: Object.freeze(usageFrom(usageValue, input.request)), output: Object.freeze({ kind: 'image', artifacts: Object.freeze(artifacts) }) });
      }
      if (input.request.input.kind === 'video' || input.request.input.kind === 'music' || input.request.input.kind === 'virtual_try_on') {
        const parsed = parseJson(response.body);
        if (!Array.isArray(parsed.data) || parsed.data.length !== 1) throw new TypeError('ai_provider_media_invalid');
        const media = decodedMedia(parsed.data[0], this.#config.maximumResponseBytes);
        const expected = input.request.input.kind === 'video' ? ['video/mp4']
          : input.request.input.kind === 'music' ? ['audio/mpeg', 'audio/mp3', 'audio/wav']
            : ['image/png', 'image/jpeg', 'image/webp'];
        if (!expected.includes(media.mimeType)) throw new TypeError('ai_provider_media_mime_invalid');
        const normalizedMime = media.mimeType === 'audio/mp3' ? 'audio/mpeg' : media.mimeType;
        const stored = await this.#artifacts.put({ bytes: media.bytes, mimeType: normalizedMime });
        if (stored.sha256 !== sha256(media.bytes)) throw new TypeError('ai_provider_artifact_hash_invalid');
        const baseUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: 0, videoSeconds: 0, musicGenerations: 0, virtualTryOnImages: 0 };
        if (input.request.input.kind === 'video') return Object.freeze({ modelIdentity: string(parsed.model, 'model', 160), completedAt: this.#clock(), usage: Object.freeze({ ...baseUsage, videoSeconds: input.request.input.durationSeconds }), output: Object.freeze({ kind: 'video', artifact: Object.freeze({ ...stored, mimeType: 'video/mp4', bytes: media.bytes.byteLength, durationSeconds: input.request.input.durationSeconds }) }) });
        if (input.request.input.kind === 'music') return Object.freeze({ modelIdentity: string(parsed.model, 'model', 160), completedAt: this.#clock(), usage: Object.freeze({ ...baseUsage, musicGenerations: 1 }), output: Object.freeze({ kind: 'music', artifact: Object.freeze({ ...stored, mimeType: normalizedMime as 'audio/mpeg' | 'audio/wav', bytes: media.bytes.byteLength, durationSeconds: input.request.input.durationSeconds }) }) });
        return Object.freeze({ modelIdentity: string(parsed.model, 'model', 160), completedAt: this.#clock(), usage: Object.freeze({ ...baseUsage, images: 2, virtualTryOnImages: 1 }), output: Object.freeze({ kind: 'virtual_try_on', artifact: Object.freeze({ ...stored, mimeType: normalizedMime as 'image/png' | 'image/jpeg' | 'image/webp', bytes: media.bytes.byteLength }) }) });
      }
      const mime = response.contentType.split(';')[0]?.trim();
      const mimeByFormat = { mp3: 'audio/mpeg', opus: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav', pcm: 'audio/pcm' } as const;
      const expectedMime = mimeByFormat[input.request.input.responseFormat];
      if (mime !== expectedMime) throw new TypeError('ai_provider_speech_mime_invalid');
      const stored = await this.#artifacts.put({ bytes: response.body, mimeType: expectedMime });
      if (stored.sha256 !== sha256(response.body)) throw new TypeError('ai_provider_artifact_hash_invalid');
      return Object.freeze({ modelIdentity: input.exactModelId, completedAt: this.#clock(), usage: Object.freeze({ ...({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, videoSeconds: 0, musicGenerations: 0, virtualTryOnImages: 0 }), audioCharacters: input.request.input.input.length }), output: Object.freeze({ kind: 'speech', artifact: Object.freeze({ ...stored, mimeType: expectedMime, bytes: response.body.byteLength }) }) });
    } catch (error) {
      if (error instanceof TypeError && /^ai_provider_/u.test(error.message)) throw error;
      throw new TypeError('ai_provider_response_invalid');
    }
  }
}
