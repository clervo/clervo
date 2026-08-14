import {
  AI_OPERATION_ID,
  CONTRACT_VERSION,
  canonicalRequestHash,
  normalizeAiHttpRequest,
} from '../../../dist/packages/contracts/src/index.js';

export const OPENAI_RESPONSES_PATH = '/v1/responses';

function refuse(code, status = 400) {
  throw Object.assign(new Error(code), { status });
}

function assertDefault(value, expected, code) {
  if (value !== undefined && value !== expected) {
    refuse(code, 422);
  }
}

function assertUnsupported(value, code) {
  if (value !== undefined) refuse(code, 422);
}

function assertEmptyArray(value, invalidCode, unsupportedCode) {
  if (value === undefined) return;

  if (!Array.isArray(value)) {
    refuse(invalidCode);
  }

  if (value.length > 0) {
    refuse(unsupportedCode, 422);
  }
}

function normalizeInputContent(content) {
  if (typeof content === 'string') {
    if (content.length === 0) {
      refuse('openai_responses_input_content_invalid');
    }

    return content;
  }

  if (!Array.isArray(content) || content.length === 0) {
    refuse('openai_responses_input_content_invalid');
  }

  return content.map((part) => {
    if (
      part === null
      || typeof part !== 'object'
      || Array.isArray(part)
    ) {
      refuse('openai_responses_input_content_invalid');
    }

    const allowed = new Set(['type', 'text']);
    if (Object.keys(part).some((key) => !allowed.has(key))) {
      refuse('openai_responses_input_content_property_unsupported', 422);
    }

    if (
      part.type !== 'input_text'
      || typeof part.text !== 'string'
      || part.text.length === 0
    ) {
      refuse('openai_responses_input_content_unsupported', 422);
    }

    return {
      type: 'text',
      text: part.text,
    };
  });
}

function normalizeInputMessage(item) {
  if (
    item === null
    || typeof item !== 'object'
    || Array.isArray(item)
  ) {
    refuse('openai_responses_input_item_invalid');
  }

  const allowed = new Set(['type', 'role', 'content']);
  if (Object.keys(item).some((key) => !allowed.has(key))) {
    refuse('openai_responses_input_item_property_unsupported', 422);
  }

  if (
    item.type !== undefined
    && item.type !== 'message'
  ) {
    refuse('openai_responses_input_item_unsupported', 422);
  }

  let role = item.role;

  if (role === 'developer') role = 'system';

  if (!['system', 'user', 'assistant'].includes(role)) {
    refuse('openai_responses_input_role_unsupported', 422);
  }

  return {
    role,
    content: normalizeInputContent(item.content),
  };
}

function normalizeInput(input) {
  if (typeof input === 'string') {
    if (input.length === 0) {
      refuse('openai_responses_input_invalid');
    }

    return [{
      role: 'user',
      content: input,
    }];
  }

  if (!Array.isArray(input) || input.length === 0) {
    refuse('openai_responses_input_invalid');
  }

  return input.map(normalizeInputMessage);
}

function normalizeInstructions(instructions) {
  if (instructions === undefined) return [];

  if (
    typeof instructions !== 'string'
    || instructions.length === 0
  ) {
    refuse('openai_responses_instructions_invalid');
  }

  return [{
    role: 'system',
    content: instructions,
  }];
}

function responseFormat(text) {
  if (text === undefined) return 'text';

  if (
    text === null
    || typeof text !== 'object'
    || Array.isArray(text)
  ) {
    refuse('openai_responses_text_invalid');
  }

  const allowed = new Set(['format']);

  if (Object.keys(text).some((key) => !allowed.has(key))) {
    refuse('openai_responses_text_property_unsupported', 422);
  }

  if (text.format === undefined) return 'text';

  if (
    text.format === null
    || typeof text.format !== 'object'
    || Array.isArray(text.format)
  ) {
    refuse('openai_responses_text_format_invalid');
  }

  const formatAllowed = new Set(['type']);

  if (
    Object.keys(text.format)
      .some((key) => !formatAllowed.has(key))
  ) {
    refuse(
      'openai_responses_text_format_property_unsupported',
      422,
    );
  }

  if (text.format.type === 'text') return 'text';
  if (text.format.type === 'json_object') return 'json_object';

  refuse('openai_responses_text_format_unsupported', 422);
}

export function normalizeOpenAiResponsesRequest(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    refuse('openai_responses_request_invalid');
  }

  const allowed = new Set([
    'model',
    'input',
    'instructions',
    'stream',
    'max_output_tokens',
    'text',
    'temperature',
    'top_p',
    'store',
    'background',
    'truncation',
    'parallel_tool_calls',
    'tools',
    'tool_choice',
    'previous_response_id',
    'conversation',
    'prompt',
    'reasoning',
    'metadata',
    'include',
    'max_tool_calls',
    'service_tier',
    'safety_identifier',
    'prompt_cache_key',
    'prompt_cache_retention',
    'stream_options',
    'top_logprobs',
    'user',
  ]);

  if (Object.keys(value).some((key) => !allowed.has(key))) {
    refuse('openai_responses_request_property_unsupported', 422);
  }

  if (
    value.stream !== undefined
    && typeof value.stream !== 'boolean'
  ) {
    refuse('openai_responses_stream_invalid');
  }

  if (value.store === undefined) {
    refuse('openai_responses_store_false_required', 422);
  }

  if (value.store !== false) {
    refuse('openai_responses_storage_unsupported', 422);
  }

  if (value.background === true) {
    refuse('openai_responses_background_unsupported', 422);
  }

  if (
    value.background !== undefined
    && value.background !== false
  ) {
    refuse('openai_responses_background_invalid');
  }

  if (
    value.max_output_tokens !== undefined
    && (
      !Number.isInteger(value.max_output_tokens)
      || value.max_output_tokens < 1
      || value.max_output_tokens > 65_536
    )
  ) {
    refuse('openai_responses_max_output_tokens_invalid');
  }

  assertDefault(
    value.temperature,
    1,
    'openai_responses_temperature_unsupported',
  );

  assertDefault(
    value.top_p,
    1,
    'openai_responses_top_p_unsupported',
  );

  assertDefault(
    value.parallel_tool_calls,
    true,
    'openai_responses_parallel_tool_calls_unsupported',
  );

  assertDefault(
    value.tool_choice,
    'auto',
    'openai_responses_tool_choice_unsupported',
  );

  assertDefault(
    value.truncation,
    'disabled',
    'openai_responses_truncation_unsupported',
  );

  assertDefault(
    value.service_tier,
    'auto',
    'openai_responses_service_tier_unsupported',
  );

  assertDefault(
    value.top_logprobs,
    0,
    'openai_responses_top_logprobs_unsupported',
  );

  assertEmptyArray(
    value.tools,
    'openai_responses_tools_invalid',
    'openai_responses_tools_unsupported',
  );

  assertEmptyArray(
    value.include,
    'openai_responses_include_invalid',
    'openai_responses_include_unsupported',
  );

  assertUnsupported(
    value.previous_response_id,
    'openai_responses_previous_response_unsupported',
  );

  assertUnsupported(
    value.conversation,
    'openai_responses_conversation_unsupported',
  );

  assertUnsupported(
    value.prompt,
    'openai_responses_prompt_unsupported',
  );

  assertUnsupported(
    value.reasoning,
    'openai_responses_reasoning_controls_unsupported',
  );

  assertUnsupported(
    value.metadata,
    'openai_responses_metadata_unsupported',
  );

  assertUnsupported(
    value.max_tool_calls,
    'openai_responses_max_tool_calls_unsupported',
  );

  assertUnsupported(
    value.safety_identifier,
    'openai_responses_safety_identifier_unsupported',
  );

  assertUnsupported(
    value.prompt_cache_key,
    'openai_responses_prompt_cache_key_unsupported',
  );

  assertUnsupported(
    value.prompt_cache_retention,
    'openai_responses_prompt_cache_retention_unsupported',
  );

  assertUnsupported(
    value.stream_options,
    'openai_responses_stream_options_unsupported',
  );

  assertUnsupported(
    value.user,
    'openai_responses_user_unsupported',
  );

  return normalizeAiHttpRequest({
    model: value.model,
    input: {
      kind: 'chat',
      messages: [
        ...normalizeInstructions(value.instructions),
        ...normalizeInput(value.input),
      ],
      responseFormat: responseFormat(value.text),
      stream: value.stream === true,
    },
    ...(value.max_output_tokens === undefined
      ? {}
      : { maximumOutputTokens: value.max_output_tokens }),
  });
}

export function openAiResponsesRequestHash(normalized) {
  return canonicalRequestHash({
    contractVersion: CONTRACT_VERSION,
    operation: AI_OPERATION_ID,
    method: 'POST',
    target: OPENAI_RESPONSES_PATH,
    contentType: 'application/json',
    body: normalized,
  });
}

export function createOpenAiResponsesDiscoveryContract(
  openAiRequest,
) {
  const normalized =
    normalizeOpenAiResponsesRequest(openAiRequest);

  if (normalized.input.kind !== 'chat') {
    refuse('openai_responses_discovery_input_invalid', 503);
  }

  const input = Object.freeze({
    model: normalized.model,
    input: structuredClone(openAiRequest.input),
    ...(openAiRequest.instructions === undefined
      ? {}
      : { instructions: openAiRequest.instructions }),
    stream: normalized.input.stream,
    store: false,
    max_output_tokens: normalized.usageBounds.outputTokens,
    text: Object.freeze({
      format: Object.freeze({
        type: normalized.input.responseFormat,
      }),
    }),
  });

  const inputTextSchema = Object.freeze({
    type: 'array',
    minItems: 1,
    items: {
      type: 'object',
      required: ['type', 'text'],
      properties: {
        type: { const: 'input_text' },
        text: {
          type: 'string',
          minLength: 1,
        },
      },
      additionalProperties: false,
    },
  });

  return Object.freeze({
    method: 'POST',
    bodyType: 'json',
    input,
    inputSchema: Object.freeze({
      type: 'object',
      required: ['model', 'input', 'store'],
      properties: {
        model: {
          type: 'string',
          const: normalized.model,
        },
        input: {
          oneOf: [
            {
              type: 'string',
              minLength: 1,
            },
            {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['role', 'content'],
                properties: {
                  type: {
                    const: 'message',
                  },
                  role: {
                    enum: [
                      'system',
                      'developer',
                      'user',
                      'assistant',
                    ],
                  },
                  content: {
                    oneOf: [
                      {
                        type: 'string',
                        minLength: 1,
                      },
                      inputTextSchema,
                    ],
                  },
                },
                additionalProperties: false,
              },
            },
          ],
        },
        instructions: {
          type: 'string',
          minLength: 1,
        },
        max_output_tokens: {
          type: 'integer',
          minimum: 1,
          maximum: 65_536,
        },
        stream: {
          type: 'boolean',
        },
        store: {
          const: false,
        },
        text: {
          type: 'object',
          required: ['format'],
          properties: {
            format: {
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
          additionalProperties: false,
        },
      },
      additionalProperties: true,
    }),
    output: Object.freeze({
      example: Object.freeze({
        id: 'resp_example',
        object: 'response',
        created_at: 0,
        status: 'completed',
        completed_at: 0,
        error: null,
        incomplete_details: null,
        instructions: null,
        max_output_tokens: 64,
        model: normalized.model,
        output: [
          {
            id: 'msg_example',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Idempotency keeps retries from becoming a second logical operation or charge.',
                annotations: [],
              },
            ],
          },
        ],
        parallel_tool_calls: true,
        previous_response_id: null,
        reasoning: {
          effort: null,
          summary: null,
        },
        store: false,
        temperature: 1,
        text: {
          format: {
            type: 'text',
          },
        },
        tool_choice: 'auto',
        tools: [],
        top_p: 1,
        truncation: 'disabled',
        usage: {
          input_tokens: 1,
          input_tokens_details: {
            cached_tokens: 0,
          },
          output_tokens: 1,
          output_tokens_details: {
            reasoning_tokens: 0,
          },
          total_tokens: 2,
        },
        metadata: {},
      }),
      schema: Object.freeze({
        type: 'object',
        required: [
          'id',
          'object',
          'created_at',
          'status',
          'completed_at',
          'error',
          'incomplete_details',
          'model',
          'output',
          'store',
          'usage',
        ],
        properties: {
          id: {
            type: 'string',
          },
          object: {
            const: 'response',
          },
          created_at: {
            type: 'integer',
          },
          status: {
            enum: ['completed', 'incomplete'],
          },
          completed_at: {
            type: ['integer', 'null'],
          },
          error: {
            type: ['object', 'null'],
          },
          incomplete_details: {
            type: ['object', 'null'],
          },
          model: {
            type: 'string',
          },
          output: {
            type: 'array',
            minItems: 1,
          },
          store: {
            const: false,
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

function responseState(finishReason) {
  if (finishReason === 'stop') {
    return {
      status: 'completed',
      messageStatus: 'completed',
      incompleteDetails: null,
    };
  }

  if (finishReason === 'length') {
    return {
      status: 'incomplete',
      messageStatus: 'incomplete',
      incompleteDetails: {
        reason: 'max_tokens',
      },
    };
  }

  refuse('openai_responses_result_finish_reason_invalid', 503);
}

export function createOpenAiResponse(
  value,
  openAiRequest = {},
) {
  const output = value?.result?.output;
  const usage = value?.result?.usage;

  if (
    output?.kind !== 'chat'
    || usage === undefined
  ) {
    refuse('openai_responses_result_invalid', 503);
  }

  const completedAt = Date.parse(value.result.completedAt);

  if (!Number.isFinite(completedAt)) {
    refuse('openai_responses_completed_at_invalid', 503);
  }

  const state = responseState(output.finishReason);
  const createdAt = Math.floor(completedAt / 1000);
  const reasoningTokens = usage.reasoningTokens ?? 0;
  const outputTokens =
    usage.outputTokens + reasoningTokens;

  return {
    id: `resp_${String(value.operationId).replace(/^op_/, '')}`,
    object: 'response',
    created_at: createdAt,
    status: state.status,
    completed_at:
      state.status === 'completed'
        ? createdAt
        : null,
    error: null,
    incomplete_details: state.incompleteDetails,
    instructions: openAiRequest.instructions ?? null,
    max_output_tokens:
      openAiRequest.max_output_tokens ?? null,
    model: value.exactModelId,
    output: [
      {
        id: `msg_${String(value.operationId).replace(/^op_/, '')}`,
        type: 'message',
        status: state.messageStatus,
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: output.content,
            annotations: [],
          },
        ],
      },
    ],
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: {
      effort: null,
      summary: null,
    },
    store: false,
    temperature: 1,
    text: {
      format: {
        type: responseFormat(openAiRequest.text),
      },
    },
    tool_choice: 'auto',
    tools: [],
    top_p: 1,
    truncation: 'disabled',
    usage: {
      input_tokens: usage.inputTokens,
      input_tokens_details: {
        cached_tokens: usage.cachedInputTokens ?? 0,
      },
      output_tokens: outputTokens,
      output_tokens_details: {
        reasoning_tokens: reasoningTokens,
      },
      total_tokens:
        usage.inputTokens + outputTokens,
    },
    metadata: {},
  };
}

function openAiResponsesSseData(value) {
  return `data: ${JSON.stringify(value)}\n\n`;
}

export function createOpenAiResponsesStream(
  value,
  openAiRequest = {},
) {
  const response = createOpenAiResponse(
    value,
    openAiRequest,
  );

  const item = response.output[0];
  const part = item?.content?.[0];

  if (
    item?.type !== 'message'
    || part?.type !== 'output_text'
  ) {
    refuse(
      'openai_responses_stream_result_invalid',
      503,
    );
  }

  const createdResponse = {
    ...response,
    status: 'in_progress',
    completed_at: null,
    incomplete_details: null,
    output: [],
    usage: null,
  };

  const pendingItem = {
    ...item,
    status: 'in_progress',
    content: [],
  };

  const emptyPart = {
    ...part,
    text: '',
  };

  const terminalType =
    response.status === 'completed'
      ? 'response.completed'
      : 'response.incomplete';

  const events = [
    {
      type: 'response.created',
      response: createdResponse,
      sequence_number: 0,
    },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: pendingItem,
      sequence_number: 1,
    },
    {
      type: 'response.content_part.added',
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      part: emptyPart,
      sequence_number: 2,
    },
    {
      type: 'response.output_text.delta',
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      delta: part.text,
      sequence_number: 3,
    },
    {
      type: 'response.output_text.done',
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      text: part.text,
      sequence_number: 4,
    },
    {
      type: 'response.content_part.done',
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      part,
      sequence_number: 5,
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item,
      sequence_number: 6,
    },
    {
      type: terminalType,
      response,
      sequence_number: 7,
    },
  ];

  return events
    .map(openAiResponsesSseData)
    .join('');
}
