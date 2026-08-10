import { canonicalRequestHash } from './canonical-request.js';
import {
  AI_EXECUTION_REQUEST_SCHEMA_VERSION,
  assertAiExecutionRequest,
  type AiExecutionInput,
  type AiExecutionRequest,
  type AiExecutionResult,
} from './ai-execution.js';
import type { AiProductId } from './ai-model.js';
import type { AiUsageBounds } from './ai-routing.js';
import { hashJson, verifyReceipt, type OperationReceipt } from './receipt.js';
import type { AssetAmount, JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export const AI_HTTP_REQUEST_SCHEMA_VERSION = 'ai-http-request.v1' as const;
export const AI_HTTP_RESULT_SCHEMA_VERSION = 'ai-http-result.v1' as const;
export const AI_OPERATION_ID = 'ai.execute' as const;
export const AI_PAID_PATH = '/v1/ai/execute' as const;
export const AI_MAX_BODY_BYTES = 10_485_760;
export const AI_DEFAULT_MAXIMUM_OUTPUT_TOKENS = 1_024;
export const AI_MAXIMUM_OUTPUT_TOKENS = 65_536;
// Chat gateways add role framing, safety instructions, and other protocol
// envelope tokens that are included in truthful upstream usage even though
// they are not present in the caller's message text. Keep that bounded here so
// quote, execution validation, and receipt usage share the same authority.
export const AI_CHAT_INPUT_ENVELOPE_TOKENS = 1_024;

export interface AiHttpRequest {
  model: string;
  input: AiExecutionInput;
  maximumOutputTokens?: number;
  maximumReasoningTokens?: number;
}

export interface NormalizedAiHttpRequest {
  model: string;
  productId: AiProductId;
  input: AiExecutionInput;
  usageBounds: AiUsageBounds;
}

export interface PublicAiExecutionResult {
  requestedModel: string;
  exactModelId: string;
  completedAt: string;
  usage: AiExecutionResult['usage'];
  output: AiExecutionResult['output'];
  resultHash: string;
}

export interface AiHttpResult {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof AI_HTTP_RESULT_SCHEMA_VERSION;
  operationId: string;
  operation: typeof AI_OPERATION_ID;
  productId: AiProductId;
  model: string;
  exactModelId: string;
  state: 'RECEIPTED';
  replayed: boolean;
  fundingMode: 'paid';
  requestHash: string;
  result: PublicAiExecutionResult;
  receipt: OperationReceipt;
}

export type AiFreeHttpResult = Omit<AiHttpResult, 'state' | 'fundingMode' | 'receipt'> & {
  state: 'COMPLETED';
  fundingMode: 'free';
};

const productByKind: Readonly<Record<AiExecutionInput['kind'], AiProductId>> = Object.freeze({
  chat: 'ai.chat',
  embedding: 'ai.embed',
  image: 'ai.image',
  speech: 'ai.speech',
  video: 'ai.video',
  music: 'ai.music',
  virtual_try_on: 'ai.virtual_try_on',
});

const zeroUsage = Object.freeze({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: 0, videoSeconds: 0, musicGenerations: 0, virtualTryOnImages: 0 });

function assertMaximum(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > AI_MAXIMUM_OUTPUT_TOKENS) throw new TypeError(`ai_http_${name}_invalid`);
  return value as number;
}

function byteLength(values: readonly string[]): number {
  return values.reduce((total, value) => total + new TextEncoder().encode(value).byteLength, 0);
}

function chatContentBytes(input: Extract<AiExecutionInput, { kind: 'chat' }>): number {
  return input.messages.reduce((total, { content }) => total + (typeof content === 'string'
    ? byteLength([content])
    : byteLength(content.flatMap((part) => part.type === 'text' ? [part.text] : [part.image_url.url]))), 0);
}

function usageBounds(input: AiExecutionInput, maximumOutputTokens: number | undefined, maximumReasoningTokens: number | undefined): AiUsageBounds {
  if (input.kind !== 'chat' && (maximumOutputTokens !== undefined || maximumReasoningTokens !== undefined)) throw new TypeError('ai_http_token_limits_product_invalid');
  if (input.kind === 'chat') {
    const outputTokens = maximumOutputTokens ?? AI_DEFAULT_MAXIMUM_OUTPUT_TOKENS;
    const reasoningTokens = maximumReasoningTokens ?? outputTokens;
    if (outputTokens < 1) throw new TypeError('ai_http_maximum_output_tokens_invalid');
    const evidence = input.evidence?.flatMap((item) => [item.quote, item.canonicalUrl]) ?? [];
    return Object.freeze({ ...zeroUsage, inputTokens: AI_CHAT_INPUT_ENVELOPE_TOKENS + chatContentBytes(input) + byteLength(evidence), outputTokens, reasoningTokens });
  }
  if (input.kind === 'embedding') return Object.freeze({ ...zeroUsage, inputTokens: byteLength(input.inputs) });
  if (input.kind === 'image') return Object.freeze({ ...zeroUsage, inputTokens: byteLength([input.prompt]), images: input.count });
  if (input.kind === 'speech') return Object.freeze({ ...zeroUsage, audioCharacters: input.input.length });
  if (input.kind === 'video') return Object.freeze({ ...zeroUsage, inputTokens: byteLength([input.prompt]), videoSeconds: input.durationSeconds });
  if (input.kind === 'music') return Object.freeze({ ...zeroUsage, inputTokens: byteLength([input.prompt]), musicGenerations: 1 });
  return Object.freeze({ ...zeroUsage, images: 2, virtualTryOnImages: 1 });
}

function cloneInput(value: unknown): AiExecutionInput {
  try { return structuredClone(value) as AiExecutionInput; }
  catch { throw new TypeError('invalid_ai_http_request'); }
}

export function normalizeAiHttpRequest(value: unknown): Readonly<NormalizedAiHttpRequest> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('invalid_ai_http_request');
  const record = value as Record<string, unknown>;
  const allowed = new Set(['model', 'input', 'maximumOutputTokens', 'maximumReasoningTokens']);
  if (Object.keys(record).some((key) => !allowed.has(key))) throw new TypeError('ai_http_request_additional_property');
  if (typeof record.model !== 'string') throw new TypeError('ai_http_model_invalid');
  const model = record.model.trim();
  if (model.length < 1 || model.length > 160 || /[\u0000-\u001F\u007F]/u.test(model)) throw new TypeError('ai_http_model_invalid');
  const input = cloneInput(record.input);
  if (input === null || typeof input !== 'object' || !Object.hasOwn(productByKind, input.kind)) throw new TypeError('ai_http_input_invalid');
  const maximumOutputTokens = assertMaximum(record.maximumOutputTokens, 'maximum_output_tokens');
  const maximumReasoningTokens = assertMaximum(record.maximumReasoningTokens, 'maximum_reasoning_tokens');
  const productId = productByKind[input.kind];
  const bounds = usageBounds(input, maximumOutputTokens, maximumReasoningTokens);
  assertAiExecutionRequest({
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_EXECUTION_REQUEST_SCHEMA_VERSION,
    operationId: `op_${'A'.repeat(32)}`,
    productId,
    requestedModel: model,
    input,
    usageBounds: bounds,
    maximumSupplierCost: { asset: 'USD', amountAtomic: '0', decimals: 6 },
    deadlineAt: '2099-01-01T00:00:00.000Z',
  });
  return Object.freeze({ model, productId, input: Object.freeze(input), usageBounds: bounds });
}

export function aiHttpRequestHash(request: Readonly<NormalizedAiHttpRequest>): string {
  return canonicalRequestHash({
    contractVersion: CONTRACT_VERSION,
    operation: AI_OPERATION_ID,
    method: 'POST',
    target: AI_PAID_PATH,
    contentType: 'application/json',
    body: request as unknown as JsonValue,
  });
}

export function createAiExecutionRequest(input: {
  normalized: Readonly<NormalizedAiHttpRequest>;
  operationId: string;
  maximumSupplierCost: AssetAmount;
  deadlineAt: string;
}): Readonly<AiExecutionRequest> {
  const request = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_EXECUTION_REQUEST_SCHEMA_VERSION,
    operationId: input.operationId,
    productId: input.normalized.productId,
    requestedModel: input.normalized.model,
    input: input.normalized.input,
    usageBounds: input.normalized.usageBounds,
    maximumSupplierCost: input.maximumSupplierCost,
    deadlineAt: input.deadlineAt,
  };
  assertAiExecutionRequest(request);
  return Object.freeze(request);
}

export function createAiHttpResult(input: {
  request: Readonly<AiExecutionRequest>;
  requestHash: string;
  result: Readonly<AiExecutionResult>;
  receipt: OperationReceipt;
}): Readonly<AiHttpResult> {
  if (input.result.operationId !== input.request.operationId || input.result.productId !== input.request.productId || input.result.requestedModel !== input.request.requestedModel) throw new TypeError('ai_http_result_binding_invalid');
  const { resultHash, ...unsignedResult } = input.result;
  if (resultHash !== hashJson(unsignedResult as unknown as JsonValue)) throw new TypeError('ai_http_result_hash_invalid');
  const receipt = input.receipt;
  if (!verifyReceipt(receipt) || receipt.operationId !== input.request.operationId || receipt.productId !== input.request.productId || receipt.requestHash !== input.requestHash || receipt.resultHash !== hashResult(input.result)) throw new TypeError('ai_http_receipt_binding_invalid');
  const result = Object.freeze({
    requestedModel: input.result.requestedModel,
    exactModelId: input.result.exactModelId,
    completedAt: input.result.completedAt,
    usage: input.result.usage,
    output: input.result.output,
    resultHash: input.result.resultHash,
  });
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_HTTP_RESULT_SCHEMA_VERSION,
    operationId: input.request.operationId,
    operation: AI_OPERATION_ID,
    productId: input.request.productId,
    model: input.request.requestedModel,
    exactModelId: input.result.exactModelId,
    state: 'RECEIPTED',
    replayed: false,
    fundingMode: 'paid',
    requestHash: input.requestHash,
    result,
    receipt,
  });
}

export function createAiFreeHttpResult(input: {
  request: Readonly<AiExecutionRequest>;
  requestHash: string;
  result: Readonly<AiExecutionResult>;
}): Readonly<AiFreeHttpResult> {
  if (input.result.operationId !== input.request.operationId || input.result.productId !== input.request.productId || input.result.requestedModel !== input.request.requestedModel) throw new TypeError('ai_free_http_result_binding_invalid');
  const { resultHash, ...unsignedResult } = input.result;
  if (resultHash !== hashJson(unsignedResult as unknown as JsonValue) || input.result.supplierCost.amountAtomic !== '0') throw new TypeError('ai_free_http_result_invalid');
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_HTTP_RESULT_SCHEMA_VERSION,
    operationId: input.request.operationId,
    operation: AI_OPERATION_ID,
    productId: input.request.productId,
    model: input.request.requestedModel,
    exactModelId: input.result.exactModelId,
    state: 'COMPLETED',
    replayed: false,
    fundingMode: 'free',
    requestHash: input.requestHash,
    result: Object.freeze({
      requestedModel: input.result.requestedModel,
      exactModelId: input.result.exactModelId,
      completedAt: input.result.completedAt,
      usage: input.result.usage,
      output: input.result.output,
      resultHash: input.result.resultHash,
    }),
  });
}

function hashResult(value: AiExecutionResult): string {
  return hashJson(value as unknown as JsonValue);
}
