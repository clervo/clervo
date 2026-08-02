import { createHash } from 'node:crypto';
import type {
  AiExecutionOutput,
  AiExecutionRequest,
  AiUsage,
} from '../../../packages/contracts/src/index.js';
import type {
  AiAdapterExecution,
  AiExecutionAdapter,
} from '../../../services/ai/src/execution.js';
import type {
  AiArtifactStore,
  AiHttpTransport,
} from './openai-compatible.js';

export interface VertexGeminiAdapterConfig {
  routeId: string;
  projectId: string;
  location: 'global';
  exactModelId: string;
  productId: 'ai.chat' | 'ai.image';
  maximumResponseBytes: number;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('vertex_response_invalid');
  return value as JsonRecord;
}

function integer(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(`vertex_${name}_invalid`);
  return value as number;
}

function text(value: unknown, name: string, maximum = 1_000_000): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) throw new TypeError(`vertex_${name}_invalid`);
  return value;
}

function parseJson(bytes: Uint8Array): JsonRecord {
  try { return record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
  catch { throw new TypeError('vertex_response_invalid'); }
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function endpoint(config: VertexGeminiAdapterConfig): URL {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/u.test(config.projectId)) throw new TypeError('vertex_project_invalid');
  return new URL(`https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/locations/${config.location}/publishers/google/models/${encodeURIComponent(config.exactModelId)}:generateContent`);
}

function systemInstruction(request: AiExecutionRequest): string | undefined {
  if (request.input.kind !== 'chat') return undefined;
  const instructions = request.input.messages.filter(({ role }) => role === 'system').map(({ content }) => content);
  if (request.input.responseFormat === 'json_object') instructions.push('Return only one valid JSON object. Do not use Markdown.');
  if (request.input.evidence !== undefined) {
    instructions.push('Answer only from the supplied evidence. Return JSON with exactly one key named claims. claims must be a non-empty array of objects with text and citationIds. Every claim must cite at least one supplied citationId.');
  }
  return instructions.length === 0 ? undefined : instructions.join('\n');
}

function chatPayload(request: AiExecutionRequest): JsonRecord {
  if (request.input.kind !== 'chat' || request.input.stream) throw new TypeError('vertex_chat_request_unsupported');
  if (request.input.messages.some(({ role }) => role === 'tool')) throw new TypeError('vertex_tool_message_unsupported');
  const contents = request.input.messages.filter(({ role }) => role !== 'system').map(({ role, content }) => ({
    role: role === 'assistant' ? 'model' : 'user',
    parts: [{ text: content }],
  }));
  if (request.input.evidence !== undefined) {
    contents.unshift({
      role: 'user',
      parts: [{ text: `Evidence JSON:\n${JSON.stringify(request.input.evidence)}` }],
    });
  }
  const instruction = systemInstruction(request);
  const maximumOutputTokens = Math.max(64, Math.min(65_536, request.usageBounds.outputTokens + request.usageBounds.reasoningTokens));
  return {
    ...(instruction === undefined ? {} : { systemInstruction: { parts: [{ text: instruction }] } }),
    contents,
    generationConfig: {
      maxOutputTokens: maximumOutputTokens,
      responseModalities: ['TEXT'],
      ...(request.input.responseFormat === 'json_object' || request.input.evidence !== undefined ? { responseMimeType: 'application/json' } : {}),
    },
  };
}

const aspectRatioBySize = {
  '1024x1024': '1:1',
  '1024x1536': '2:3',
  '1536x1024': '3:2',
} as const;

function imagePayload(request: AiExecutionRequest): JsonRecord {
  if (request.input.kind !== 'image' || request.input.quality !== 'low') throw new TypeError('vertex_image_request_unsupported');
  return {
    contents: [{ role: 'user', parts: [{ text: request.input.prompt }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: aspectRatioBySize[request.input.size], imageSize: '1K' },
    },
  };
}

function usageFrom(response: JsonRecord): AiUsage {
  const usage = record(response.usageMetadata);
  return {
    inputTokens: integer(usage.promptTokenCount, 'input_tokens'),
    cachedInputTokens: integer(usage.cachedContentTokenCount ?? 0, 'cached_input_tokens'),
    outputTokens: integer(usage.candidatesTokenCount ?? 0, 'output_tokens'),
    reasoningTokens: integer(usage.thoughtsTokenCount ?? 0, 'reasoning_tokens'),
    images: 0,
    audioCharacters: 0,
  };
}

function candidate(response: JsonRecord): JsonRecord {
  if (!Array.isArray(response.candidates) || response.candidates.length !== 1) throw new TypeError('vertex_candidates_invalid');
  return record(response.candidates[0]);
}

function responseParts(response: JsonRecord): JsonRecord[] {
  const content = record(candidate(response).content);
  if (!Array.isArray(content.parts) || content.parts.length === 0) throw new TypeError('vertex_parts_invalid');
  return content.parts.map(record);
}

function finishReason(response: JsonRecord): 'stop' | 'length' {
  const value = candidate(response).finishReason;
  if (value === 'STOP') return 'stop';
  if (value === 'MAX_TOKENS') return 'length';
  throw new TypeError('vertex_finish_reason_invalid');
}

function chatOutput(response: JsonRecord, request: AiExecutionRequest): Extract<AiExecutionOutput, { kind: 'chat' }> {
  const content = responseParts(response).filter((part) => part.thought !== true && typeof part.text === 'string').map((part) => part.text).join('');
  text(content, 'chat_content');
  const reason = finishReason(response);
  if (request.input.kind !== 'chat' || request.input.evidence === undefined) return { kind: 'chat', content, finishReason: reason };
  let parsed: JsonRecord;
  try { parsed = record(JSON.parse(content)); } catch { throw new TypeError('vertex_grounded_output_invalid'); }
  if (!Array.isArray(parsed.claims) || parsed.claims.length === 0) throw new TypeError('vertex_grounded_output_invalid');
  const claims = parsed.claims.map((value) => {
    const claim = record(value);
    if (!Array.isArray(claim.citationIds) || claim.citationIds.length === 0) throw new TypeError('vertex_grounded_output_invalid');
    return { text: text(claim.text, 'claim', 100_000), citationIds: claim.citationIds.map((id) => text(id, 'citation_id', 80)) };
  });
  return { kind: 'chat', content: claims.map(({ text: claim }) => claim).join('\n'), finishReason: reason, claims };
}

function imageDimensions(bytes: Uint8Array, mimeType: string): { width: number; height: number } {
  if (mimeType === 'image/png' && bytes.byteLength >= 24 && bytes[0] === 0x89 && new TextDecoder().decode(bytes.slice(1, 4)) === 'PNG') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mimeType === 'image/jpeg' && bytes.byteLength >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === undefined || marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = (bytes[offset + 2] ?? 0) * 256 + (bytes[offset + 3] ?? 0);
      if (length < 2 || offset + length + 2 > bytes.byteLength) break;
      if (marker >= 0xc0 && marker <= 0xc3) return { width: (bytes[offset + 7] ?? 0) * 256 + (bytes[offset + 8] ?? 0), height: (bytes[offset + 5] ?? 0) * 256 + (bytes[offset + 6] ?? 0) };
      offset += length + 2;
    }
  }
  throw new TypeError('vertex_image_dimensions_invalid');
}

export class VertexGeminiAdapter implements AiExecutionAdapter {
  readonly routeId: string;
  readonly #config: Readonly<VertexGeminiAdapterConfig>;
  readonly #transport: AiHttpTransport;
  readonly #accessToken: () => Promise<string>;
  readonly #artifacts: AiArtifactStore | undefined;
  readonly #clock: () => string;
  readonly #endpoint: URL;

  constructor(input: {
    config: VertexGeminiAdapterConfig;
    transport: AiHttpTransport;
    accessToken(): Promise<string>;
    artifacts?: AiArtifactStore;
    clock?: () => string;
  }) {
    if (!/^ai\.route\.[a-z0-9_]+$/u.test(input.config.routeId) || input.config.exactModelId.length === 0 || !['ai.chat', 'ai.image'].includes(input.config.productId) || !Number.isInteger(input.config.maximumResponseBytes) || input.config.maximumResponseBytes < 1 || input.config.maximumResponseBytes > 20_000_000) throw new TypeError('vertex_config_invalid');
    this.#endpoint = endpoint(input.config);
    this.routeId = input.config.routeId;
    this.#config = Object.freeze({ ...input.config });
    this.#transport = input.transport;
    this.#accessToken = input.accessToken;
    this.#artifacts = input.artifacts;
    this.#clock = input.clock ?? (() => new Date().toISOString());
  }

  async #request(payload: JsonRecord, signal: AbortSignal): Promise<JsonRecord> {
    let token: string;
    try { token = await this.#accessToken(); } catch { throw new TypeError('vertex_credential_unavailable'); }
    if (token.length < 8 || token.length > 8_192 || /[\r\n]/u.test(token)) throw new TypeError('vertex_credential_invalid');
    let response;
    try {
      response = await this.#transport.request({
        url: this.#endpoint.href,
        headers: Object.freeze({ authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' }),
        body: new TextEncoder().encode(JSON.stringify(payload)),
        signal,
        maximumResponseBytes: this.#config.maximumResponseBytes,
      });
    } catch { throw new TypeError('vertex_transport_failed'); }
    if (response.status < 200 || response.status >= 300 || response.contentType.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new TypeError('vertex_http_failed');
    return parseJson(response.body);
  }

  async execute(input: Readonly<{ request: AiExecutionRequest; exactModelId: string; signal: AbortSignal }>): Promise<Readonly<AiAdapterExecution>> {
    if (input.exactModelId !== this.#config.exactModelId || input.request.productId !== this.#config.productId) throw new TypeError('vertex_request_binding_invalid');
    if (input.request.input.kind === 'chat') {
      const response = await this.#request(chatPayload(input.request), input.signal);
      const modelIdentity = text(response.modelVersion, 'model_identity', 160);
      return Object.freeze({ modelIdentity, completedAt: this.#clock(), usage: Object.freeze(usageFrom(response)), output: Object.freeze(chatOutput(response, input.request)) });
    }
    if (input.request.input.kind !== 'image' || this.#artifacts === undefined) throw new TypeError('vertex_artifact_store_unavailable');
    const artifacts = [];
    let inputTokens = 0;
    for (let index = 0; index < input.request.input.count; index += 1) {
      const response = await this.#request(imagePayload(input.request), input.signal);
      if (text(response.modelVersion, 'model_identity', 160) !== input.exactModelId) throw new TypeError('vertex_model_identity_mismatch');
      const usage = usageFrom(response);
      inputTokens += usage.inputTokens;
      const part = responseParts(response).find((value) => value.inlineData !== undefined);
      if (part === undefined) throw new TypeError('vertex_image_output_missing');
      const inline = record(part.inlineData);
      const mimeType = text(inline.mimeType, 'image_mime', 32);
      if (!['image/png', 'image/jpeg'].includes(mimeType)) throw new TypeError('vertex_image_mime_invalid');
      const encoded = text(inline.data, 'image_data', this.#config.maximumResponseBytes * 2);
      if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) throw new TypeError('vertex_image_encoding_invalid');
      const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'));
      const dimensions = imageDimensions(bytes, mimeType);
      const expected = input.request.input.size.split('x').map(Number);
      if (dimensions.width !== expected[0] || dimensions.height !== expected[1]) throw new TypeError('vertex_image_size_mismatch');
      const stored = await this.#artifacts.put({ bytes, mimeType });
      if (stored.sha256 !== sha256(bytes)) throw new TypeError('vertex_artifact_hash_invalid');
      artifacts.push(Object.freeze({ ...stored, mimeType: mimeType as 'image/png' | 'image/jpeg', ...dimensions }));
    }
    return Object.freeze({
      modelIdentity: input.exactModelId,
      completedAt: this.#clock(),
      usage: Object.freeze({ inputTokens, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: artifacts.length, audioCharacters: 0 }),
      output: Object.freeze({ kind: 'image', artifacts: Object.freeze(artifacts) }),
    });
  }
}
