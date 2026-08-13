import {
  AI_OPERATION_ID,
  CONTRACT_VERSION,
  canonicalRequestHash,
  normalizeAiHttpRequest,
} from '../../../dist/packages/contracts/src/index.js';

export const OPENAI_CHAT_COMPLETIONS_PATH = '/v1/chat/completions';

function refuse(code, status = 400) {
  throw Object.assign(new Error(code), { status });
}

function assertDefault(value, expected, code) {
  if (value !== undefined && value !== expected) refuse(code, 422);
}

function normalizeContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content) || content.length === 0) {
    refuse('openai_chat_message_content_invalid');
  }

  return content.map((part) => {
    if (part === null || typeof part !== 'object' || Array.isArray(part)) {
      refuse('openai_chat_message_content_invalid');
    }

    if (part.type === 'text' && typeof part.text === 'string') {
      return { type: 'text', text: part.text };
    }

    if (
      part.type === 'image_url'
      && part.image_url !== null
      && typeof part.image_url === 'object'
      && !Array.isArray(part.image_url)
      && typeof part.image_url.url === 'string'
    ) {
      if (
        part.image_url.detail !== undefined
        && part.image_url.detail !== 'auto'
      ) {
        refuse('openai_chat_image_detail_unsupported', 422);
      }

      return {
        type: 'image_url',
        image_url: { url: part.image_url.url },
      };
    }

    refuse('openai_chat_message_content_unsupported', 422);
  });
}

function normalizeMessage(message) {
  if (
    message === null
    || typeof message !== 'object'
    || Array.isArray(message)
  ) {
    refuse('openai_chat_message_invalid');
  }

  const allowed = new Set(['role', 'content', 'name']);
  if (Object.keys(message).some((key) => !allowed.has(key))) {
    refuse('openai_chat_message_property_unsupported', 422);
  }

  let role = message.role;
  if (role === 'developer') role = 'system';

  if (!['system', 'user', 'assistant'].includes(role)) {
    refuse('openai_chat_role_unsupported', 422);
  }

  if (
    message.name !== undefined
    && (typeof message.name !== 'string' || message.name.length === 0)
  ) {
    refuse('openai_chat_message_name_invalid');
  }

  return {
    role,
    content: normalizeContent(message.content),
  };
}

function responseFormat(value) {
  if (value === undefined) return 'text';

  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || typeof value.type !== 'string'
  ) {
    refuse('openai_chat_response_format_invalid');
  }

  if (value.type === 'text') return 'text';
  if (value.type === 'json_object') return 'json_object';

  refuse('openai_chat_response_format_unsupported', 422);
}

export function normalizeOpenAiChatCompletionRequest(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    refuse('openai_chat_request_invalid');
  }

  const allowed = new Set([
    'model',
    'messages',
    'stream',
    'max_completion_tokens',
    'max_tokens',
    'response_format',
    'n',
    'temperature',
    'top_p',
    'presence_penalty',
    'frequency_penalty',
    'stop',
    'seed',
    'logprobs',
    'top_logprobs',
  ]);

  if (Object.keys(value).some((key) => !allowed.has(key))) {
    refuse('openai_chat_request_property_unsupported', 422);
  }

  if (!Array.isArray(value.messages) || value.messages.length === 0) {
    refuse('openai_chat_messages_invalid');
  }

  if (value.stream === true) {
    refuse('openai_chat_streaming_unavailable', 422);
  }
  if (value.stream !== undefined && value.stream !== false) {
    refuse('openai_chat_stream_invalid');
  }

  assertDefault(value.n, 1, 'openai_chat_multiple_choices_unsupported');
  assertDefault(value.temperature, 1, 'openai_chat_temperature_unsupported');
  assertDefault(value.top_p, 1, 'openai_chat_top_p_unsupported');
  assertDefault(value.presence_penalty, 0, 'openai_chat_presence_penalty_unsupported');
  assertDefault(value.frequency_penalty, 0, 'openai_chat_frequency_penalty_unsupported');
  assertDefault(value.logprobs, false, 'openai_chat_logprobs_unsupported');
  assertDefault(value.top_logprobs, 0, 'openai_chat_top_logprobs_unsupported');

  if (value.stop !== undefined && value.stop !== null) {
    refuse('openai_chat_stop_unsupported', 422);
  }
  if (value.seed !== undefined) {
    refuse('openai_chat_seed_unsupported', 422);
  }

  if (
    value.max_completion_tokens !== undefined
    && value.max_tokens !== undefined
    && value.max_completion_tokens !== value.max_tokens
  ) {
    refuse('openai_chat_token_limit_conflict');
  }

  const maximumOutputTokens =
    value.max_completion_tokens ?? value.max_tokens;

  return normalizeAiHttpRequest({
    model: value.model,
    input: {
      kind: 'chat',
      messages: value.messages.map(normalizeMessage),
      responseFormat: responseFormat(value.response_format),
      stream: false,
    },
    ...(maximumOutputTokens === undefined
      ? {}
      : { maximumOutputTokens }),
  });
}

export function openAiChatRequestHash(normalized) {
  return canonicalRequestHash({
    contractVersion: CONTRACT_VERSION,
    operation: AI_OPERATION_ID,
    method: 'POST',
    target: OPENAI_CHAT_COMPLETIONS_PATH,
    contentType: 'application/json',
    body: normalized,
  });
}

export function createOpenAiChatDiscoveryContract(openAiRequest) {
  const normalized = normalizeOpenAiChatCompletionRequest(openAiRequest);

  if (normalized.input.kind !== 'chat') {
    refuse('openai_chat_discovery_input_invalid', 503);
  }

  const input = Object.freeze({
    model: normalized.model,
    messages: structuredClone(openAiRequest.messages),
    stream: false,
    max_completion_tokens: normalized.usageBounds.outputTokens,
    response_format: Object.freeze({
      type: normalized.input.responseFormat,
    }),
  });

  return Object.freeze({
    method: 'POST',
    bodyType: 'json',
    input,
    inputSchema: Object.freeze({
      type: 'object',
      required: ['model', 'messages'],
      properties: {
        model: {
          type: 'string',
          const: normalized.model,
        },
        messages: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['role', 'content'],
            properties: {
              role: {
                enum: ['system', 'developer', 'user', 'assistant'],
              },
              content: {
                type: 'string',
                minLength: 1,
              },
              name: {
                type: 'string',
                minLength: 1,
              },
            },
            additionalProperties: false,
          },
        },
        stream: {
          const: false,
        },
        max_completion_tokens: {
          type: 'integer',
          minimum: 1,
          maximum: 65_536,
        },
        response_format: {
          type: 'object',
          required: ['type'],
          properties: {
            type: {
              enum: ['text', 'json_object'],
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: true,
    }),
    output: Object.freeze({
      example: Object.freeze({
        id: 'chatcmpl-example',
        object: 'chat.completion',
        created: 0,
        model: normalized.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Idempotency prevents a retry from becoming a second logical operation or charge.',
              refusal: null,
            },
            logprobs: null,
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      }),
      schema: Object.freeze({
        type: 'object',
        required: [
          'id',
          'object',
          'created',
          'model',
          'choices',
          'usage',
        ],
        properties: {
          id: { type: 'string' },
          object: { const: 'chat.completion' },
          created: { type: 'integer' },
          model: { type: 'string' },
          choices: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: [
                'index',
                'message',
                'finish_reason',
              ],
            },
          },
          usage: {
            type: 'object',
          },
        },
        additionalProperties: true,
      }),
    }),
  });
}

export function createOpenAiChatCompletion(value) {
  const output = value?.result?.output;
  const usage = value?.result?.usage;

  if (output?.kind !== 'chat' || usage === undefined) {
    refuse('openai_chat_result_invalid', 503);
  }

  const completedAt = Date.parse(value.result.completedAt);
  if (!Number.isFinite(completedAt)) {
    refuse('openai_chat_completed_at_invalid', 503);
  }

  const reasoningTokens = usage.reasoningTokens ?? 0;
  const completionTokens = usage.outputTokens + reasoningTokens;

  return {
    id: `chatcmpl-${String(value.operationId).replace(/^op_/, '')}`,
    object: 'chat.completion',
    created: Math.floor(completedAt / 1000),
    model: value.exactModelId,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: output.content,
          refusal: null,
        },
        logprobs: null,
        finish_reason: output.finishReason,
      },
    ],
    usage: {
      prompt_tokens: usage.inputTokens,
      completion_tokens: completionTokens,
      total_tokens: usage.inputTokens + completionTokens,
      prompt_tokens_details: {
        cached_tokens: usage.cachedInputTokens ?? 0,
      },
      completion_tokens_details: {
        reasoning_tokens: reasoningTokens,
      },
    },
  };
}
