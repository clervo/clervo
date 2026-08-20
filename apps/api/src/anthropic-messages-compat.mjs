import {
  AI_OPERATION_ID,
  CONTRACT_VERSION,
  canonicalRequestHash,
  normalizeAiHttpRequest,
} from '../../../dist/packages/contracts/src/index.js';
import { assertSupportedStrictJsonSchema } from '../../../dist/services/ai/src/json-schema.js';
import { resolveCompatibilityModel } from './compatibility-model-map.mjs';

export const ANTHROPIC_MESSAGES_PATH = '/v1/messages';

function refuse(code, status = 400) {
  throw Object.assign(new Error(code), { status });
}

function assertDefault(value, expected, code) {
  if (value !== undefined && value !== expected) refuse(code, 422);
}

function normalizeTextContent(content) {
  if (typeof content === 'string') return content;

  if (!Array.isArray(content) || content.length === 0) {
    refuse('anthropic_message_content_invalid');
  }

  return content.map((part) => {
    if (
      part === null
      || typeof part !== 'object'
      || Array.isArray(part)
    ) {
      refuse('anthropic_message_content_invalid');
    }

    if (
      part.type === 'text'
      && typeof part.text === 'string'
    ) {
      const allowed = new Set(['type', 'text']);
      if (Object.keys(part).some((key) => !allowed.has(key))) {
        refuse('anthropic_content_property_unsupported', 422);
      }

      return {
        type: 'text',
        text: part.text,
      };
    }

    refuse('anthropic_content_block_unsupported', 422);
  });
}

function normalizeAnthropicTool(tool) {
  if (tool === null || typeof tool !== 'object' || Array.isArray(tool) || typeof tool.name !== 'string' || tool.input_schema === null || typeof tool.input_schema !== 'object' || Array.isArray(tool.input_schema)) refuse('anthropic_tool_invalid');
  assertSupportedStrictJsonSchema(tool.input_schema);
  return { type: 'function', function: { name: tool.name, ...(tool.description === undefined ? {} : { description: tool.description }), parameters: structuredClone(tool.input_schema), strict: true } };
}

function normalizeAnthropicToolChoice(value) {
  if (value === undefined || value?.type === 'auto') return 'auto';
  if (value?.type === 'none') return 'none';
  if (value?.type === 'any') return 'required';
  if (value?.type === 'tool' && typeof value.name === 'string') return { type: 'function', function: { name: value.name } };
  refuse('anthropic_tool_choice_invalid');
}

function normalizeMessage(message) {
  if (
    message === null
    || typeof message !== 'object'
    || Array.isArray(message)
  ) {
    refuse('anthropic_message_invalid');
  }

  const allowed = new Set(['role', 'content']);
  if (Object.keys(message).some((key) => !allowed.has(key))) {
    refuse('anthropic_message_property_unsupported', 422);
  }

  if (!['user', 'assistant'].includes(message.role)) {
    refuse('anthropic_message_role_unsupported', 422);
  }

  if (typeof message.content === 'string') return [{ role: message.role, content: message.content }];
  if (!Array.isArray(message.content) || message.content.length === 0) refuse('anthropic_message_content_invalid');
  if (message.role === 'assistant') {
    const textBlocks = [];
    const toolCalls = [];
    for (const part of message.content) {
      if (part?.type === 'text' && typeof part.text === 'string') textBlocks.push({ type: 'text', text: part.text });
      else if (part?.type === 'tool_use' && typeof part.id === 'string' && typeof part.name === 'string' && part.input !== null && typeof part.input === 'object' && !Array.isArray(part.input)) toolCalls.push({ id: part.id, type: 'function', function: { name: part.name, arguments: JSON.stringify(part.input) } });
      else refuse('anthropic_content_block_unsupported', 422);
    }
    return [{ role: 'assistant', content: textBlocks.length === 0 ? null : textBlocks, ...(toolCalls.length === 0 ? {} : { toolCalls }) }];
  }
  const normalized = [];
  const textBlocks = [];
  for (const part of message.content) {
    if (part?.type === 'text' && typeof part.text === 'string') textBlocks.push({ type: 'text', text: part.text });
    else if (part?.type === 'tool_result' && typeof part.tool_use_id === 'string') {
      if (textBlocks.length > 0) { normalized.push({ role: 'user', content: textBlocks.splice(0) }); }
      const content = typeof part.content === 'string' ? part.content : Array.isArray(part.content) ? part.content.filter((block) => block?.type === 'text' && typeof block.text === 'string').map(({ text }) => text).join('\n') : '';
      if (content.length === 0) refuse('anthropic_tool_result_invalid');
      normalized.push({ role: 'tool', content, toolCallId: part.tool_use_id });
    } else refuse('anthropic_content_block_unsupported', 422);
  }
  if (textBlocks.length > 0) normalized.push({ role: 'user', content: textBlocks });
  return normalized;
}

function normalizeSystem(system) {
  if (system === undefined) return [];

  return [{
    role: 'system',
    content: normalizeTextContent(system),
  }];
}

function assertUnsupported(value, code) {
  if (value !== undefined) refuse(code, 422);
}

export function normalizeAnthropicMessagesRequest(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    refuse('anthropic_request_invalid');
  }

  const allowed = new Set([
    'model',
    'max_tokens',
    'messages',
    'system',
    'stream',
    'temperature',
    'top_p',
    'top_k',
    'stop_sequences',
    'metadata',
    'tools',
    'tool_choice',
    'thinking',
    'output_config',
    'service_tier',
    'cache_control',
    'container',
    'inference_geo',
    'user_profile_id',
  ]);

  if (Object.keys(value).some((key) => !allowed.has(key))) {
    refuse('anthropic_request_property_unsupported', 422);
  }

  if (
    !Number.isInteger(value.max_tokens)
    || value.max_tokens < 1
    || value.max_tokens > 65_536
  ) {
    refuse('anthropic_max_tokens_invalid');
  }

  if (
    !Array.isArray(value.messages)
    || value.messages.length === 0
  ) {
    refuse('anthropic_messages_invalid');
  }

  if (
    value.stream !== undefined
    && typeof value.stream !== 'boolean'
  ) {
    refuse('anthropic_stream_invalid');
  }

  assertDefault(
    value.temperature,
    1,
    'anthropic_temperature_unsupported',
  );

  assertDefault(
    value.top_p,
    1,
    'anthropic_top_p_unsupported',
  );

  if (value.top_k !== undefined) {
    refuse('anthropic_top_k_unsupported', 422);
  }

  if (value.stop_sequences !== undefined) {
    if (
      !Array.isArray(value.stop_sequences)
      || value.stop_sequences.some(
        (item) => typeof item !== 'string',
      )
    ) {
      refuse('anthropic_stop_sequences_invalid');
    }

    if (value.stop_sequences.length > 0) {
      refuse('anthropic_stop_sequences_unsupported', 422);
    }
  }

  assertUnsupported(
    value.metadata,
    'anthropic_metadata_unsupported',
  );
  if (value.tools !== undefined && !Array.isArray(value.tools)) refuse('anthropic_tools_invalid');
  const tools = (value.tools ?? []).map(normalizeAnthropicTool);
  const toolChoice = normalizeAnthropicToolChoice(value.tool_choice);
  assertUnsupported(
    value.thinking,
    'anthropic_thinking_unsupported',
  );
  let format = { responseFormat: 'text' };
  if (value.output_config !== undefined) {
    const configured = value.output_config?.format;
    if (configured?.type !== 'json_schema' || typeof configured.name !== 'string' || configured.schema === null || typeof configured.schema !== 'object' || Array.isArray(configured.schema)) refuse('anthropic_output_config_unsupported', 422);
    assertSupportedStrictJsonSchema(configured.schema);
    format = { responseFormat: 'json_schema', jsonSchema: { name: configured.name, ...(configured.description === undefined ? {} : { description: configured.description }), schema: structuredClone(configured.schema), strict: true } };
  }

  if (
    value.service_tier !== undefined
    && value.service_tier !== 'auto'
  ) {
    refuse('anthropic_service_tier_unsupported', 422);
  }

  assertUnsupported(
    value.cache_control,
    'anthropic_cache_control_unsupported',
  );
  assertUnsupported(
    value.container,
    'anthropic_container_unsupported',
  );
  assertUnsupported(
    value.inference_geo,
    'anthropic_inference_geo_unsupported',
  );
  assertUnsupported(
    value.user_profile_id,
    'anthropic_user_profile_unsupported',
  );

  return normalizeAiHttpRequest({
    model: resolveCompatibilityModel(value.model),
    input: {
      kind: 'chat',
      messages: [
        ...normalizeSystem(value.system),
        ...value.messages.flatMap(normalizeMessage),
      ],
      ...format,
      ...(tools.length === 0 ? {} : { tools, toolChoice, parallelToolCalls: false }),
      stream: value.stream === true,
    },
    maximumOutputTokens: value.max_tokens,
  });
}

export function anthropicMessagesRequestHash(normalized) {
  return canonicalRequestHash({
    contractVersion: CONTRACT_VERSION,
    operation: AI_OPERATION_ID,
    method: 'POST',
    target: ANTHROPIC_MESSAGES_PATH,
    contentType: 'application/json',
    body: normalized,
  });
}

export function createAnthropicMessagesDiscoveryContract(
  anthropicRequest,
) {
  const normalized =
    normalizeAnthropicMessagesRequest(anthropicRequest);

  if (normalized.input.kind !== 'chat') {
    refuse('anthropic_discovery_input_invalid', 503);
  }

  const input = Object.freeze({
    model: normalized.model,
    max_tokens: normalized.usageBounds.outputTokens,
    messages: structuredClone(anthropicRequest.messages),
    ...(anthropicRequest.system === undefined
      ? {}
      : { system: structuredClone(anthropicRequest.system) }),
    stream: normalized.input.stream,
  });

  const textContentSchema = Object.freeze({
    oneOf: [
      {
        type: 'string',
      },
      {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['type', 'text'],
          properties: {
            type: { const: 'text' },
            text: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    ],
  });

  return Object.freeze({
    method: 'POST',
    bodyType: 'json',
    input,
    inputSchema: Object.freeze({
      type: 'object',
      required: ['model', 'max_tokens', 'messages'],
      properties: {
        model: {
          type: 'string',
          const: normalized.model,
        },
        max_tokens: {
          type: 'integer',
          minimum: 1,
          maximum: 65_536,
        },
        messages: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['role', 'content'],
            properties: {
              role: {
                enum: ['user', 'assistant'],
              },
              content: textContentSchema,
            },
            additionalProperties: false,
          },
        },
        system: textContentSchema,
        stream: {
          type: 'boolean',
        },
      },
      additionalProperties: true,
    }),
    output: Object.freeze({
      example: Object.freeze({
        id: 'msg_example',
        type: 'message',
        role: 'assistant',
        model: normalized.model,
        content: [
          {
            type: 'text',
            text: 'Idempotency keeps retries from becoming a second logical operation or charge.',
          },
        ],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 1,
          output_tokens: 1,
        },
      }),
      schema: Object.freeze({
        type: 'object',
        required: [
          'id',
          'type',
          'role',
          'model',
          'content',
          'stop_reason',
          'stop_sequence',
          'usage',
        ],
        properties: {
          id: { type: 'string' },
          type: { const: 'message' },
          role: { const: 'assistant' },
          model: { type: 'string' },
          content: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['type', 'text'],
              properties: {
                type: { const: 'text' },
                text: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
          stop_reason: {
            enum: ['end_turn', 'max_tokens'],
          },
          stop_sequence: {
            type: ['string', 'null'],
          },
          usage: {
            type: 'object',
            required: ['input_tokens', 'output_tokens'],
          },
        },
        additionalProperties: true,
      }),
    }),
  });
}

function anthropicStopReason(finishReason) {
  if (finishReason === 'stop') return 'end_turn';
  if (finishReason === 'length') return 'max_tokens';
  if (finishReason === 'tool_calls') return 'tool_use';

  refuse('anthropic_result_finish_reason_invalid', 503);
}

export function createAnthropicMessage(value) {
  const output = value?.result?.output;
  const usage = value?.result?.usage;

  if (output?.kind !== 'chat' || usage === undefined) {
    refuse('anthropic_result_invalid', 503);
  }

  const reasoningTokens = usage.reasoningTokens ?? 0;

  return {
    id: `msg_${String(value.operationId).replace(/^op_/, '')}`,
    type: 'message',
    role: 'assistant',
    model: value.exactModelId,
    content: [
      ...(output.content.length === 0 ? [] : [{ type: 'text', text: output.content }]),
      ...(output.toolCalls ?? []).map((call) => ({ type: 'tool_use', id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments) })),
    ],
    stop_reason: anthropicStopReason(output.finishReason),
    stop_sequence: null,
    usage: {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens + reasoningTokens,
    },
  };
}

function anthropicSseEvent(type, data) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createAnthropicMessageStream(value) {
  const message = createAnthropicMessage(value);

  const events = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: message.id,
          type: 'message',
          role: 'assistant',
          model: message.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: message.usage.input_tokens,
            output_tokens: 0,
          },
        },
      },
    ],
    [
      'content_block_start',
      {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'text',
          text: '',
        },
      },
    ],
    [
      'content_block_delta',
      {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: message.content[0].text,
        },
      },
    ],
    [
      'content_block_stop',
      {
        type: 'content_block_stop',
        index: 0,
      },
    ],
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: {
          stop_reason: message.stop_reason,
          stop_sequence: message.stop_sequence,
        },
        usage: {
          output_tokens: message.usage.output_tokens,
        },
      },
    ],
    [
      'message_stop',
      {
        type: 'message_stop',
      },
    ],
  ];

  return events
    .map(([type, data]) => anthropicSseEvent(type, data))
    .join('');
}
