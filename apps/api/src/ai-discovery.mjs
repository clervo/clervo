export function createAiDiscoveryContract(input) {
  if (
    !input
    || typeof input.model !== 'string'
    || input.input?.kind !== 'chat'
    || !Array.isArray(input.input.messages)
    || input.input.messages.length < 1
    || !Number.isInteger(input.maximumOutputTokens)
  ) throw new TypeError('ai_discovery_input_invalid');

  return Object.freeze({
    method: 'POST',
    bodyType: 'json',
    input,
    inputSchema: Object.freeze({
      type: 'object', required: ['model', 'input', 'maximumOutputTokens'], additionalProperties: false,
      properties: {
        model: { type: 'string', const: input.model },
        input: {
          type: 'object', required: ['kind', 'messages', 'responseFormat', 'stream'], additionalProperties: false,
          properties: {
            kind: { const: 'chat' },
            messages: { type: 'array', minItems: 1, items: { type: 'object', required: ['role', 'content'], additionalProperties: false, properties: { role: { enum: ['user'] }, content: { type: 'string', minLength: 1 } } } },
            responseFormat: { const: 'text' }, stream: { const: false },
          },
        },
        maximumOutputTokens: { type: 'integer', minimum: 1, maximum: 65_536 },
      },
    }),
    output: Object.freeze({
      example: Object.freeze({ productId: 'ai.chat', state: 'RECEIPTED', replayed: false, exactModelId: input.model, result: { output: { kind: 'chat', content: 'Idempotency prevents a retry from becoming a second logical operation or charge.' } }, receipt: { settlement: { status: 'settled' } } }),
      schema: Object.freeze({
        type: 'object',
        required: ['productId', 'state', 'replayed', 'exactModelId', 'result', 'receipt'],
        properties: {
          productId: { const: 'ai.chat' },
          state: { type: 'string' },
          replayed: { type: 'boolean' },
          exactModelId: { type: 'string', const: input.model },
          result: { type: 'object' },
          receipt: { type: 'object' },
        },
        additionalProperties: true,
      }),
    }),
  });
}
