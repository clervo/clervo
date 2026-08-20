import {
  AI_OPERATION_ID,
  CONTRACT_VERSION,
  canonicalRequestHash,
  normalizeAiHttpRequest,
} from '../../../dist/packages/contracts/src/index.js';
import { assertSupportedStrictJsonSchema } from '../../../dist/services/ai/src/json-schema.js';
import { resolveCompatibilityModel } from './compatibility-model-map.mjs';

export const OPENAI_CHAT_COMPLETIONS_PATH = '/v1/chat/completions';

function refuse(code, status = 400) {
  throw Object.assign(new Error(code), { status });
}

function assertDefault(value, expected, code) {
  if (value !== undefined && value !== expected) refuse(code, 422);
}

function normalizeContent(content) {
  if (content === null) return null;
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

function normalizeToolCall(call) {
  if (call === null || typeof call !== 'object' || Array.isArray(call) || call.type !== 'function' || typeof call.id !== 'string' || call.function === null || typeof call.function !== 'object' || Array.isArray(call.function) || typeof call.function.name !== 'string' || typeof call.function.arguments !== 'string') refuse('openai_chat_tool_call_invalid');
  return { id: call.id, type: 'function', function: { name: call.function.name, arguments: call.function.arguments } };
}

function normalizeMessage(message) {
  if (
    message === null
    || typeof message !== 'object'
    || Array.isArray(message)
  ) {
    refuse('openai_chat_message_invalid');
  }

  const allowed = new Set(['role', 'content', 'name', 'tool_calls', 'tool_call_id', 'refusal']);
  if (Object.keys(message).some((key) => !allowed.has(key))) {
    refuse('openai_chat_message_property_unsupported', 422);
  }

  let role = message.role;
  if (role === 'developer') role = 'system';

  if (!['system', 'user', 'assistant', 'tool'].includes(role)) {
    refuse('openai_chat_role_unsupported', 422);
  }
  if (message.refusal !== undefined && message.refusal !== null) refuse('openai_chat_refusal_unsupported', 422);

  if (
    message.name !== undefined
    && (typeof message.name !== 'string' || message.name.length === 0)
  ) {
    refuse('openai_chat_message_name_invalid');
  }

  if (message.tool_calls !== undefined && (!Array.isArray(message.tool_calls) || message.tool_calls.length === 0 || role !== 'assistant')) refuse('openai_chat_tool_calls_invalid');
  if (message.tool_call_id !== undefined && (typeof message.tool_call_id !== 'string' || role !== 'tool')) refuse('openai_chat_tool_call_id_invalid');
  const content = normalizeContent(message.content);
  if (content === null && (role !== 'assistant' || message.tool_calls === undefined)) refuse('openai_chat_message_content_invalid');
  return {
    role,
    content,
    ...(message.name === undefined ? {} : { name: message.name }),
    ...(message.tool_calls === undefined ? {} : { toolCalls: message.tool_calls.map(normalizeToolCall) }),
    ...(message.tool_call_id === undefined ? {} : { toolCallId: message.tool_call_id }),
  };
}

function normalizeTool(tool) {
  if (tool === null || typeof tool !== 'object' || Array.isArray(tool) || tool.type !== 'function' || tool.function === null || typeof tool.function !== 'object' || Array.isArray(tool.function)) refuse('openai_chat_tool_invalid');
  const fn = tool.function;
  const allowed = new Set(['name', 'description', 'parameters', 'strict']);
  if (Object.keys(fn).some((key) => !allowed.has(key)) || typeof fn.name !== 'string' || fn.parameters === null || typeof fn.parameters !== 'object' || Array.isArray(fn.parameters)) refuse('openai_chat_tool_invalid');
  if (fn.strict === true) assertSupportedStrictJsonSchema(fn.parameters);
  else if (fn.strict !== undefined && fn.strict !== false) refuse('openai_chat_tool_strict_invalid');
  return { type: 'function', function: { name: fn.name, ...(fn.description === undefined ? {} : { description: fn.description }), parameters: structuredClone(fn.parameters), ...(fn.strict === undefined ? {} : { strict: fn.strict }) } };
}

function normalizeToolChoice(value) {
  if (value === undefined) return 'auto';
  if (['auto', 'none', 'required'].includes(value)) return value;
  if (value === null || typeof value !== 'object' || Array.isArray(value) || value.type !== 'function' || value.function === null || typeof value.function !== 'object' || Array.isArray(value.function) || typeof value.function.name !== 'string') refuse('openai_chat_tool_choice_invalid');
  return { type: 'function', function: { name: value.function.name } };
}

function responseFormat(value) {
  if (value === undefined) return { responseFormat: 'text' };

  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || typeof value.type !== 'string'
  ) {
    refuse('openai_chat_response_format_invalid');
  }

  if (value.type === 'text') return { responseFormat: 'text' };
  if (value.type === 'json_object') return { responseFormat: 'json_object' };
  if (value.type === 'json_schema') {
    const format = value.json_schema;
    if (format === null || typeof format !== 'object' || Array.isArray(format) || typeof format.name !== 'string' || format.strict !== true || format.schema === null || typeof format.schema !== 'object' || Array.isArray(format.schema)) refuse('openai_chat_json_schema_invalid');
    assertSupportedStrictJsonSchema(format.schema);
    return { responseFormat: 'json_schema', jsonSchema: { name: format.name, ...(format.description === undefined ? {} : { description: format.description }), schema: structuredClone(format.schema), strict: true } };
  }

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
    'tools',
    'tool_choice',
    'parallel_tool_calls',
    'reasoning_effort',
    'stream_options',
  ]);

  if (Object.keys(value).some((key) => !allowed.has(key))) {
    refuse('openai_chat_request_property_unsupported', 422);
  }

  if (!Array.isArray(value.messages) || value.messages.length === 0) {
    refuse('openai_chat_messages_invalid');
  }

  if (
    value.stream !== undefined
    && typeof value.stream !== 'boolean'
  ) {
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
  if (value.tools !== undefined && !Array.isArray(value.tools)) refuse('openai_chat_tools_invalid');
  const tools = (value.tools ?? []).map(normalizeTool);
  const toolChoice = normalizeToolChoice(value.tool_choice);
  if (value.parallel_tool_calls !== undefined && typeof value.parallel_tool_calls !== 'boolean') refuse('openai_chat_parallel_tool_calls_invalid');
  if (value.reasoning_effort !== undefined && !['none', 'low', 'medium', 'high'].includes(value.reasoning_effort)) refuse('openai_chat_reasoning_effort_invalid');
  if (value.stream_options !== undefined && (value.stream_options === null || typeof value.stream_options !== 'object' || Array.isArray(value.stream_options) || value.stream_options.include_usage !== true || Object.keys(value.stream_options).some((key) => key !== 'include_usage'))) refuse('openai_chat_stream_options_invalid');
  const format = responseFormat(value.response_format);

  return normalizeAiHttpRequest({
    model: resolveCompatibilityModel(value.model),
    input: {
      kind: 'chat',
      messages: value.messages.map(normalizeMessage),
      ...format,
      ...(tools.length === 0 ? {} : { tools, toolChoice, parallelToolCalls: value.parallel_tool_calls === true }),
      ...(value.reasoning_effort === undefined ? {} : { reasoningEffort: value.reasoning_effort }),
      stream: value.stream === true,
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
    stream: normalized.input.stream,
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
          type: 'boolean',
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
          content: output.finishReason === 'tool_calls' && output.content.length === 0 ? null : output.content,
          ...(output.toolCalls === undefined ? {} : { tool_calls: output.toolCalls }),
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

function openAiChatSseData(value) {
  return `data: ${JSON.stringify(value)}\n\n`;
}

export function createOpenAiChatStream(value) {
  const completion = createOpenAiChatCompletion(value);
  const choice = completion.choices[0];

  const common = {
    id: completion.id,
    object: 'chat.completion.chunk',
    created: completion.created,
    model: completion.model,
  };

  const chunks = [
    {
      ...common,
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          content: '',
        },
        logprobs: null,
        finish_reason: null,
      }],
    },
    ...(typeof choice.message.content !== 'string' || choice.message.content.length === 0
      ? []
      : [{
          ...common,
          choices: [{
            index: 0,
            delta: {
              content: choice.message.content,
            },
            logprobs: null,
            finish_reason: null,
          }],
        }]),
    {
      ...common,
      choices: [{
        index: 0,
        delta: {},
        logprobs: null,
        finish_reason: choice.finish_reason,
      }],
    },
  ];

  if (choice.message.tool_calls !== undefined) chunks.splice(1, 0, ...choice.message.tool_calls.map((call, index) => ({
    ...common,
    choices: [{ index: 0, delta: { tool_calls: [{ index, ...call }] }, logprobs: null, finish_reason: null }],
  })));

  return `${chunks.map(openAiChatSseData).join('')}data: [DONE]\n\n`;
}
