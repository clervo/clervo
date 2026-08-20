import { aiProductIds, type AiProductId } from './ai-model.js';
import { verifyAiRouteDecision, type AiRouteDecision, type AiUsageBounds } from './ai-routing.js';
import { hashJson } from './receipt.js';
import type { AssetAmount, JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export const AI_EXECUTION_REQUEST_SCHEMA_VERSION = 'ai-execution-request.v1' as const;
export const AI_EXECUTION_RESULT_SCHEMA_VERSION = 'ai-execution-result.v1' as const;

export interface AiEvidenceItem {
  citationId: string;
  resultId: string;
  canonicalUrl: string;
  quote: string;
}

export type AiChatMessageContent = string | readonly (
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
)[];

export interface AiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface AiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: JsonValue;
    strict?: boolean;
  };
}

export type AiToolChoice = 'auto' | 'none' | 'required' | {
  type: 'function';
  function: { name: string };
};

export interface AiJsonSchemaFormat {
  name: string;
  description?: string;
  schema: JsonValue;
  strict: true;
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: AiChatMessageContent | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: readonly AiToolCall[];
}

export type AiExecutionInput =
  | {
      kind: 'chat';
      messages: readonly AiChatMessage[];
      responseFormat: 'text' | 'json_object' | 'json_schema';
      jsonSchema?: AiJsonSchemaFormat;
      tools?: readonly AiToolDefinition[];
      toolChoice?: AiToolChoice;
      parallelToolCalls?: boolean;
      reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
      stream: boolean;
      evidence?: readonly AiEvidenceItem[];
    }
  | { kind: 'embedding'; inputs: readonly string[]; dimensions?: number }
  | { kind: 'image'; prompt: string; size: '1024x1024' | '1024x1536' | '1536x1024'; quality: 'low' | 'medium' | 'high'; count: number }
  | { kind: 'speech'; input: string; voice: string; responseFormat: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm' }
  | { kind: 'video'; prompt: string; durationSeconds: number; aspectRatio: '16:9' | '9:16'; resolution: '720p' | '1080p' }
  | { kind: 'music'; prompt: string; durationSeconds: number; instrumental: boolean }
  | { kind: 'virtual_try_on'; personImageBase64: string; productImageBase64: string };

export interface AiExecutionRequest {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof AI_EXECUTION_REQUEST_SCHEMA_VERSION;
  operationId: string;
  productId: AiProductId;
  requestedModel: string;
  input: AiExecutionInput;
  usageBounds: AiUsageBounds;
  maximumSupplierCost: AssetAmount;
  deadlineAt: string;
}

export interface AiUsage extends AiUsageBounds {}

export type AiExecutionOutput =
  | { kind: 'chat'; content: string; finishReason: 'stop' | 'length' | 'tool_calls'; toolCalls?: readonly AiToolCall[]; structured?: JsonValue; claims?: readonly { text: string; citationIds: readonly string[] }[] }
  | { kind: 'embedding'; vectors: readonly { index: number; embedding: readonly number[] }[] }
  | { kind: 'image'; artifacts: readonly { artifactUri: string; sha256: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; width: number; height: number }[] }
  | { kind: 'speech'; artifact: { artifactUri: string; sha256: string; mimeType: 'audio/mpeg' | 'audio/ogg' | 'audio/aac' | 'audio/flac' | 'audio/wav' | 'audio/pcm'; bytes: number } }
  | { kind: 'video'; artifact: { artifactUri: string; sha256: string; mimeType: 'video/mp4'; bytes: number; durationSeconds: number } }
  | { kind: 'music'; artifact: { artifactUri: string; sha256: string; mimeType: 'audio/mpeg' | 'audio/wav'; bytes: number; durationSeconds: number } }
  | { kind: 'virtual_try_on'; artifact: { artifactUri: string; sha256: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; bytes: number } };

export interface AiExecutionResult {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof AI_EXECUTION_RESULT_SCHEMA_VERSION;
  operationId: string;
  productId: AiProductId;
  requestedModel: string;
  routeDecisionHash: string;
  routeId: string;
  providerId: string;
  exactModelId: string;
  executedModelId?: string;
  completedAt: string;
  usage: AiUsage;
  supplierCost: AssetAmount;
  output: AiExecutionOutput;
  resultHash: string;
}

const productKind: Readonly<Record<AiProductId, AiExecutionInput['kind']>> = Object.freeze({
  'ai.chat': 'chat', 'ai.embed': 'embedding', 'ai.image': 'image', 'ai.speech': 'speech',
  'ai.video': 'video', 'ai.music': 'music', 'ai.virtual_try_on': 'virtual_try_on',
});

function freezeDeep<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    for (const entry of value) freezeDeep(entry);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) freezeDeep(entry);
    return Object.freeze(value);
  }
  return value;
}

function hash(value: object): string { return hashJson(value as unknown as JsonValue); }

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError(`ai_execution_${name}_invalid`);
  return parsed;
}

function text(value: string, name: string, maximum: number): void {
  if (value.length === 0 || value.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) throw new TypeError(`ai_execution_${name}_invalid`);
}

function amount(value: AssetAmount, name: string): void {
  if (value.asset !== 'USD' || value.decimals !== 6 || !/^(?:0|[1-9][0-9]{0,77})$/u.test(value.amountAtomic)) throw new TypeError(`ai_execution_${name}_invalid`);
}

function usage(value: AiUsageBounds): void {
  const maxima: AiUsageBounds = { inputTokens: 5_000_000, cachedInputTokens: 5_000_000, outputTokens: 1_000_000, reasoningTokens: 1_000_000, images: 16, audioCharacters: 100_000, videoSeconds: 120, musicGenerations: 4, virtualTryOnImages: 4 };
  const optionalLegacyAdditions = new Set<keyof AiUsageBounds>(['videoSeconds', 'musicGenerations', 'virtualTryOnImages']);
  for (const name of Object.keys(maxima) as (keyof AiUsageBounds)[]) {
    const amount = value[name];
    if (amount === undefined && optionalLegacyAdditions.has(name)) continue;
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > maxima[name]) throw new TypeError(`ai_execution_usage_${name}_invalid`);
  }
  if (value.cachedInputTokens > value.inputTokens) throw new TypeError('ai_execution_cached_input_invalid');
}

function assertEvidence(items: readonly AiEvidenceItem[]): void {
  if (items.length === 0 || items.length > 100 || new Set(items.map(({ citationId }) => citationId)).size !== items.length) throw new TypeError('ai_execution_evidence_invalid');
  for (const item of items) {
    if (!/^cite_[A-Za-z0-9]{20,64}$/u.test(item.citationId) || !/^sr_[A-Za-z0-9]{20,64}$/u.test(item.resultId)) throw new TypeError('ai_execution_evidence_identity_invalid');
    const url = new URL(item.canonicalUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '' || url.hash !== '') throw new TypeError('ai_execution_evidence_url_invalid');
    text(item.quote, 'evidence_quote', 4_000);
  }
}

function boundedJson(value: unknown, code: string, maximum = 100_000): void {
  let encoded: string;
  try { encoded = JSON.stringify(value); } catch { throw new TypeError(code); }
  if (encoded === undefined || encoded.length === 0 || encoded.length > maximum) throw new TypeError(code);
}

function toolName(value: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/u.test(value)) throw new TypeError('ai_execution_tool_name_invalid');
}

function assertToolCall(value: AiToolCall): void {
  if (value === null || typeof value !== 'object' || value.type !== 'function') throw new TypeError('ai_execution_tool_call_invalid');
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(value.id)) throw new TypeError('ai_execution_tool_call_id_invalid');
  toolName(value.function?.name);
  if (typeof value.function?.arguments !== 'string' || value.function.arguments.length > 100_000) throw new TypeError('ai_execution_tool_arguments_invalid');
  try {
    const parsed = JSON.parse(value.function.arguments);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('invalid');
  } catch { throw new TypeError('ai_execution_tool_arguments_invalid'); }
}

export function assertAiExecutionRequest(value: AiExecutionRequest): void {
  if (value.contractVersion !== CONTRACT_VERSION || value.schemaVersion !== AI_EXECUTION_REQUEST_SCHEMA_VERSION || !aiProductIds.includes(value.productId)) throw new TypeError('ai_execution_request_version_invalid');
  if (!/^op_[A-Za-z0-9]{20,64}$/u.test(value.operationId)) throw new TypeError('ai_execution_operation_id_invalid');
  text(value.requestedModel, 'requested_model', 160);
  timestamp(value.deadlineAt, 'deadline');
  usage(value.usageBounds);
  amount(value.maximumSupplierCost, 'maximum_cost');
  if (productKind[value.productId] !== value.input.kind) throw new TypeError('ai_execution_product_input_mismatch');
  if (value.input.kind === 'chat') {
    if (value.input.messages.length === 0 || value.input.messages.length > 128 || !['text', 'json_object', 'json_schema'].includes(value.input.responseFormat) || typeof value.input.stream !== 'boolean') throw new TypeError('ai_execution_chat_shape_invalid');
    if (value.input.responseFormat === 'json_schema') {
      const format = value.input.jsonSchema;
      if (format === undefined || format.strict !== true || !/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/u.test(format.name)) throw new TypeError('ai_execution_json_schema_invalid');
      if (format.description !== undefined) text(format.description, 'json_schema_description', 2_000);
      if (format.schema === null || typeof format.schema !== 'object' || Array.isArray(format.schema)) throw new TypeError('ai_execution_json_schema_invalid');
      boundedJson(format.schema, 'ai_execution_json_schema_invalid');
    } else if (value.input.jsonSchema !== undefined) throw new TypeError('ai_execution_json_schema_unexpected');
    const tools = value.input.tools ?? [];
    if (tools.length > 64 || new Set(tools.map(({ function: definition }) => definition?.name)).size !== tools.length) throw new TypeError('ai_execution_tools_invalid');
    for (const tool of tools) {
      if (tool === null || typeof tool !== 'object' || tool.type !== 'function') throw new TypeError('ai_execution_tool_invalid');
      toolName(tool.function?.name);
      if (tool.function.description !== undefined) text(tool.function.description, 'tool_description', 4_000);
      if (tool.function.parameters === null || typeof tool.function.parameters !== 'object' || Array.isArray(tool.function.parameters) || typeof tool.function.strict !== 'boolean' && tool.function.strict !== undefined) throw new TypeError('ai_execution_tool_parameters_invalid');
      boundedJson(tool.function.parameters, 'ai_execution_tool_parameters_invalid');
    }
    const toolChoice = value.input.toolChoice ?? 'auto';
    if (typeof toolChoice === 'string') {
      if (!['auto', 'none', 'required'].includes(toolChoice) || toolChoice === 'required' && tools.length === 0) throw new TypeError('ai_execution_tool_choice_invalid');
    } else if (toolChoice === null || toolChoice.type !== 'function' || !tools.some(({ function: definition }) => definition.name === toolChoice.function?.name)) throw new TypeError('ai_execution_tool_choice_invalid');
    if (value.input.parallelToolCalls !== undefined && typeof value.input.parallelToolCalls !== 'boolean') throw new TypeError('ai_execution_parallel_tools_invalid');
    if (value.input.reasoningEffort !== undefined && !['none', 'low', 'medium', 'high'].includes(value.input.reasoningEffort)) throw new TypeError('ai_execution_reasoning_effort_invalid');
    let characters = 0;
    const priorToolCalls = new Set<string>();
    const toolResults = new Set<string>();
    for (const message of value.input.messages) {
      if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) throw new TypeError('ai_execution_message_role_invalid');
      if (message.name !== undefined) toolName(message.name);
      if (message.toolCalls !== undefined) {
        if (message.role !== 'assistant' || message.toolCalls.length === 0 || message.toolCalls.length > 64) throw new TypeError('ai_execution_message_tool_calls_invalid');
        for (const call of message.toolCalls) {
          assertToolCall(call);
          if (priorToolCalls.has(call.id)) throw new TypeError('ai_execution_tool_call_duplicate');
          priorToolCalls.add(call.id);
        }
      }
      if (message.toolCallId !== undefined) {
        if (message.role !== 'tool' || !priorToolCalls.has(message.toolCallId) || toolResults.has(message.toolCallId)) throw new TypeError(message.role === 'tool' && toolResults.has(message.toolCallId) ? 'ai_execution_tool_result_duplicate' : 'ai_execution_tool_result_unknown');
        toolResults.add(message.toolCallId);
      } else if (message.role === 'tool') throw new TypeError('ai_execution_tool_result_id_required');
      if (message.content === null) {
        if (message.role !== 'assistant' || message.toolCalls === undefined) throw new TypeError('ai_execution_message_content_invalid');
        continue;
      }
      if (typeof message.content === 'string') { text(message.content, 'message', 100_000); characters += message.content.length; continue; }
      if (!Array.isArray(message.content) || message.content.length === 0 || message.content.length > 32) throw new TypeError('ai_execution_message_content_invalid');
      for (const part of message.content) {
        if (part.type === 'text') { text(part.text, 'message', 100_000); characters += part.text.length; }
        else if (part.type === 'image_url') {
          text(part.image_url.url, 'message_image', 8_000_000);
          if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/u.test(part.image_url.url)) throw new TypeError('ai_execution_message_image_invalid');
        } else throw new TypeError('ai_execution_message_content_invalid');
      }
    }
    if (characters > 200_000) throw new TypeError('ai_execution_chat_too_large');
    if (value.input.evidence !== undefined) assertEvidence(value.input.evidence);
  } else if (value.input.kind === 'embedding') {
    if (value.input.inputs.length === 0 || value.input.inputs.length > 256) throw new TypeError('ai_execution_embedding_count_invalid');
    for (const input of value.input.inputs) text(input, 'embedding_input', 20_000);
    if (value.input.dimensions !== undefined && (!Number.isInteger(value.input.dimensions) || value.input.dimensions < 1 || value.input.dimensions > 4_096)) throw new TypeError('ai_execution_embedding_dimensions_invalid');
  } else if (value.input.kind === 'image') {
    text(value.input.prompt, 'image_prompt', 32_000);
    if (!['1024x1024', '1024x1536', '1536x1024'].includes(value.input.size) || !['low', 'medium', 'high'].includes(value.input.quality) || !Number.isInteger(value.input.count) || value.input.count < 1 || value.input.count > 16) throw new TypeError('ai_execution_image_shape_invalid');
  } else if (value.input.kind === 'speech') {
    text(value.input.input, 'speech_input', 100_000);
    text(value.input.voice, 'speech_voice', 64);
    if (!['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'].includes(value.input.responseFormat)) throw new TypeError('ai_execution_speech_format_invalid');
  } else if (value.input.kind === 'video') {
    text(value.input.prompt, 'video_prompt', 32_000);
    if (!Number.isInteger(value.input.durationSeconds) || value.input.durationSeconds < 3 || value.input.durationSeconds > 8 || !['16:9', '9:16'].includes(value.input.aspectRatio) || !['720p', '1080p'].includes(value.input.resolution)) throw new TypeError('ai_execution_video_shape_invalid');
  } else if (value.input.kind === 'music') {
    text(value.input.prompt, 'music_prompt', 32_000);
    if (!Number.isInteger(value.input.durationSeconds) || value.input.durationSeconds < 5 || value.input.durationSeconds > 180 || typeof value.input.instrumental !== 'boolean') throw new TypeError('ai_execution_music_shape_invalid');
  } else {
    for (const [name, encoded] of [['person', value.input.personImageBase64], ['product', value.input.productImageBase64]] as const) {
      text(encoded, `virtual_try_on_${name}`, 5_000_000);
      if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) throw new TypeError('ai_execution_virtual_try_on_image_invalid');
    }
  }
}

function assertOutput(request: AiExecutionRequest, output: AiExecutionOutput): void {
  if (output.kind !== request.input.kind) throw new TypeError('ai_execution_output_kind_invalid');
  if (output.kind === 'chat') {
    if (output.content.length > 0) text(output.content, 'chat_content', 1_000_000);
    if (!['stop', 'length', 'tool_calls'].includes(output.finishReason)) throw new TypeError('ai_execution_finish_reason_invalid');
    if (output.finishReason === 'tool_calls') {
      if (output.toolCalls === undefined || output.toolCalls.length === 0 || output.content.length > 0 && output.content.length > 1_000_000) throw new TypeError('ai_execution_tool_calls_required');
      const ids = new Set<string>();
      for (const call of output.toolCalls) { assertToolCall(call); if (ids.has(call.id)) throw new TypeError('ai_execution_tool_call_duplicate'); ids.add(call.id); }
    } else if (output.toolCalls !== undefined) throw new TypeError('ai_execution_tool_calls_unexpected');
    if (request.input.kind === 'chat' && request.input.responseFormat !== 'text') {
      let parsed: JsonValue;
      try { parsed = JSON.parse(output.content) as JsonValue; } catch { throw new TypeError('ai_execution_structured_output_invalid'); }
      if (output.structured === undefined || JSON.stringify(output.structured) !== JSON.stringify(parsed)) throw new TypeError('ai_execution_structured_output_invalid');
    } else if (output.structured !== undefined) throw new TypeError('ai_execution_structured_output_unexpected');
    const evidence = request.input.kind === 'chat' ? request.input.evidence : undefined;
    if (evidence !== undefined) {
      if (output.claims === undefined || output.claims.length === 0 || output.content !== output.claims.map(({ text: claim }) => claim).join('\n')) throw new TypeError('ai_execution_grounded_claims_required');
      const citationIds = new Set(evidence.map(({ citationId }) => citationId));
      for (const claim of output.claims) {
        text(claim.text, 'claim', 100_000);
        if (claim.citationIds.length === 0 || new Set(claim.citationIds).size !== claim.citationIds.length || claim.citationIds.some((id) => !citationIds.has(id))) throw new TypeError('ai_execution_claim_citation_invalid');
      }
    }
  } else if (output.kind === 'embedding') {
    const input = request.input.kind === 'embedding' ? request.input : undefined;
    if (input === undefined || output.vectors.length !== input.inputs.length) throw new TypeError('ai_execution_embedding_output_count_invalid');
    for (const [index, vector] of output.vectors.entries()) {
      if (vector.index !== index || vector.embedding.length === 0 || vector.embedding.length > 4_096 || (input.dimensions !== undefined && vector.embedding.length !== input.dimensions) || vector.embedding.some((entry) => !Number.isFinite(entry))) throw new TypeError('ai_execution_embedding_output_invalid');
    }
  } else if (output.kind === 'image') {
    const input = request.input.kind === 'image' ? request.input : undefined;
    if (input === undefined || output.artifacts.length !== input.count) throw new TypeError('ai_execution_image_output_count_invalid');
    const [width, height] = input.size.split('x').map(Number);
    for (const artifact of output.artifacts) if (!/^artifact:\/\/[A-Za-z0-9._/-]{8,256}$/u.test(artifact.artifactUri) || !/^sha256:[a-f0-9]{64}$/u.test(artifact.sha256) || !['image/png', 'image/jpeg', 'image/webp'].includes(artifact.mimeType) || artifact.width !== width || artifact.height !== height) throw new TypeError('ai_execution_image_artifact_invalid');
  } else if (output.kind === 'speech') {
    if (!/^artifact:\/\/[A-Za-z0-9._/-]{8,256}$/u.test(output.artifact.artifactUri) || !/^sha256:[a-f0-9]{64}$/u.test(output.artifact.sha256) || !['audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/wav', 'audio/pcm'].includes(output.artifact.mimeType) || !Number.isInteger(output.artifact.bytes) || output.artifact.bytes < 1) throw new TypeError('ai_execution_speech_artifact_invalid');
  } else if (output.kind === 'video') {
    if (!/^artifact:\/\/[A-Za-z0-9._/-]{8,256}$/u.test(output.artifact.artifactUri) || !/^sha256:[a-f0-9]{64}$/u.test(output.artifact.sha256) || output.artifact.mimeType !== 'video/mp4' || !Number.isInteger(output.artifact.bytes) || output.artifact.bytes < 1 || output.artifact.durationSeconds !== (request.input.kind === 'video' ? request.input.durationSeconds : -1)) throw new TypeError('ai_execution_video_artifact_invalid');
  } else if (output.kind === 'music') {
    if (!/^artifact:\/\/[A-Za-z0-9._/-]{8,256}$/u.test(output.artifact.artifactUri) || !/^sha256:[a-f0-9]{64}$/u.test(output.artifact.sha256) || !['audio/mpeg', 'audio/wav'].includes(output.artifact.mimeType) || !Number.isInteger(output.artifact.bytes) || output.artifact.bytes < 1 || output.artifact.durationSeconds !== (request.input.kind === 'music' ? request.input.durationSeconds : -1)) throw new TypeError('ai_execution_music_artifact_invalid');
  } else {
    if (!/^artifact:\/\/[A-Za-z0-9._/-]{8,256}$/u.test(output.artifact.artifactUri) || !/^sha256:[a-f0-9]{64}$/u.test(output.artifact.sha256) || !['image/png', 'image/jpeg', 'image/webp'].includes(output.artifact.mimeType) || !Number.isInteger(output.artifact.bytes) || output.artifact.bytes < 1) throw new TypeError('ai_execution_virtual_try_on_artifact_invalid');
  }
}

export function createAiExecutionResult(input: {
  request: AiExecutionRequest;
  routeDecision: AiRouteDecision;
  completedAt: string;
  usage: AiUsage;
  supplierCost: AssetAmount;
  output: AiExecutionOutput;
  executedModelId?: string;
}): Readonly<AiExecutionResult> {
  assertAiExecutionRequest(input.request);
  if (!verifyAiRouteDecision(input.routeDecision) || input.routeDecision.outcome !== 'selected' || input.routeDecision.operationId !== input.request.operationId || input.routeDecision.productId !== input.request.productId || input.routeDecision.requestedModel !== input.request.requestedModel) throw new TypeError('ai_execution_route_decision_invalid');
  const completedAt = timestamp(input.completedAt, 'completed_at');
  if (completedAt > timestamp(input.request.deadlineAt, 'deadline')) throw new TypeError('ai_execution_completed_after_deadline');
  usage(input.usage);
  for (const name of Object.keys(input.usage) as (keyof AiUsage)[]) if (input.usage[name] > (input.request.usageBounds[name] ?? 0)) throw new TypeError(`ai_execution_usage_exceeded:${name}`);
  amount(input.supplierCost, 'supplier_cost');
  if (input.executedModelId !== undefined) text(input.executedModelId, 'executed_model', 160);
  if (BigInt(input.supplierCost.amountAtomic) > BigInt(input.request.maximumSupplierCost.amountAtomic) || BigInt(input.supplierCost.amountAtomic) > BigInt(input.routeDecision.maximumSupplierCost?.amountAtomic ?? '-1')) throw new TypeError('ai_execution_supplier_cost_exceeded');
  assertOutput(input.request, input.output);
  const unsigned = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_EXECUTION_RESULT_SCHEMA_VERSION,
    operationId: input.request.operationId,
    productId: input.request.productId,
    requestedModel: input.request.requestedModel,
    routeDecisionHash: input.routeDecision.decisionHash,
    routeId: input.routeDecision.selectedRouteId!,
    providerId: input.routeDecision.selectedProviderId!,
    exactModelId: input.routeDecision.selectedExactModelId!,
    ...(input.executedModelId === undefined || input.executedModelId === input.routeDecision.selectedExactModelId ? {} : { executedModelId: input.executedModelId }),
    completedAt: input.completedAt,
    usage: input.usage,
    supplierCost: input.supplierCost,
    output: input.output,
  };
  return freezeDeep({ ...unsigned, resultHash: hash(unsigned) });
}

export function verifyAiExecutionResult(value: AiExecutionResult, request: AiExecutionRequest, decision: AiRouteDecision): boolean {
  try {
    const rebuilt = createAiExecutionResult({ request, routeDecision: decision, completedAt: value.completedAt, usage: value.usage, supplierCost: value.supplierCost, output: value.output, ...(value.executedModelId === undefined ? {} : { executedModelId: value.executedModelId }) });
    return JSON.stringify(rebuilt) === JSON.stringify(value);
  } catch { return false; }
}
