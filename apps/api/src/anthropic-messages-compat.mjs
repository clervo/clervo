import {
  AI_OPERATION_ID,
  CONTRACT_VERSION,
  canonicalRequestHash,
  normalizeAiHttpRequest,
} from '../../../dist/packages/contracts/src/index.js';
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

  return {
    role: message.role,
    content: normalizeTextContent(message.content),
  };
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
  assertUnsupported(
    value.tools,
    'anthropic_tools_unsupported',
  );
  assertUnsupported(
    value.tool_choice,
    'anthropic_tool_choice_unsupported',
  );
  assertUnsupported(
    value.thinking,
    'anthropic_thinking_unsupported',
  );
  assertUnsupported(
    value.output_config,
    'anthropic_output_config_unsupported',
  );

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
        ...value.messages.map(normalizeMessage),
      ],
      responseFormat: 'text',
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
      {
        type: 'text',
        text: output.content,
      },
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
