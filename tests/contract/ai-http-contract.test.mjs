import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  AI_CHAT_INPUT_ENVELOPE_TOKENS,
  CONTRACT_VERSION,
  aiHttpRequestHash,
  createAiExecutionRequest,
  createAiHttpResult,
  hashJson,
  normalizeAiHttpRequest,
  sealReceipt,
} from '../../dist/packages/contracts/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const operationId = `op_${'a'.repeat(32)}`;
const now = '2026-08-04T04:00:00.000Z';

test('public AI request normalization derives conservative bounded usage and a stable hash', () => {
  const source = {
    model: 'clervo/fast',
    input: { kind: 'chat', messages: [{ role: 'user', content: 'Hello Clervo' }], responseFormat: 'text', stream: false },
    maximumOutputTokens: 500,
  };
  const normalized = normalizeAiHttpRequest(source);
  assert.equal(normalized.productId, 'ai.chat');
  assert.equal(normalized.usageBounds.inputTokens, AI_CHAT_INPUT_ENVELOPE_TOKENS + 12);
  assert.equal(normalized.usageBounds.outputTokens, 500);
  assert.equal(normalized.usageBounds.reasoningTokens, 500);
  assert.match(aiHttpRequestHash(normalized), /^sha256:[a-f0-9]{64}$/u);
  assert.equal(aiHttpRequestHash(normalized), aiHttpRequestHash(normalizeAiHttpRequest(structuredClone(source))));
  assert.throws(() => normalizeAiHttpRequest({ ...source, provider: 'hidden' }), /additional_property/u);
  assert.throws(() => normalizeAiHttpRequest({ model: 'embed', input: { kind: 'embedding', inputs: ['one'] }, maximumOutputTokens: 10 }), /token_limits_product/u);
});

test('public AI result exposes exact model and proof without supplier identity', async () => {
  const normalized = normalizeAiHttpRequest({ model: 'clervo/fast', input: { kind: 'chat', messages: [{ role: 'user', content: 'Say hello.' }], responseFormat: 'text', stream: false } });
  const requestHash = aiHttpRequestHash(normalized);
  const request = createAiExecutionRequest({ normalized, operationId, maximumSupplierCost: { asset: 'USD', amountAtomic: '1000', decimals: 6 }, deadlineAt: '2026-08-04T04:02:00.000Z' });
  const unsignedResult = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: 'ai-execution-result.v1',
    operationId,
    productId: 'ai.chat',
    requestedModel: 'clervo/fast',
    routeDecisionHash: `sha256:${'1'.repeat(64)}`,
    routeId: 'ai.route.private',
    providerId: 'provider.private',
    exactModelId: 'exact-model-v1',
    completedAt: now,
    usage: { inputTokens: 3, cachedInputTokens: 0, outputTokens: 2, reasoningTokens: 0, images: 0, audioCharacters: 0 },
    supplierCost: { asset: 'USD', amountAtomic: '5', decimals: 6 },
    output: { kind: 'chat', content: 'Hello.', finishReason: 'stop' },
  };
  const executionResult = { ...unsignedResult, resultHash: hashJson(unsignedResult) };
  const receipt = sealReceipt({
    contractVersion: CONTRACT_VERSION,
    receiptId: `rcpt_${'b'.repeat(32)}`,
    operationId,
    productId: 'ai.chat',
    requestHash,
    quoteId: `quote_${'c'.repeat(32)}`,
    quoteHash: `sha256:${'2'.repeat(64)}`,
    fundingMode: 'paid',
    customerCharge: { asset: 'USDC', amountAtomic: '10', decimals: 6 },
    supplierCost: { asset: 'usd', amountAtomic: '5', decimals: 6 },
    settlement: { status: 'settled', referenceHash: `sha256:${'3'.repeat(64)}` },
    resultHash: hashJson(executionResult),
    provenance: [{ adapterId: 'adapter_ai.qualified_route', qualificationId: `qual_${'d'.repeat(32)}`, providerReferenceHash: `sha256:${'4'.repeat(64)}` }],
    completedAt: now,
  });
  const response = createAiHttpResult({ request, requestHash, result: executionResult, receipt });
  assert.equal(response.exactModelId, 'exact-model-v1');
  assert.equal(response.result.output.content, 'Hello.');
  assert.equal(JSON.stringify(response).includes('provider.private'), false);
  assert.equal(JSON.stringify(response).includes('ai.route.private'), false);

  const files = (await readdir(path.join(root, 'packages/contracts/schemas'))).filter((file) => file.endsWith('.schema.json'));
  const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
  for (const file of files) ajv.addSchema(JSON.parse(await readFile(path.join(root, 'packages/contracts/schemas', file), 'utf8')));
  const requestSchema = ajv.getSchema('https://api.clervo.dev/schemas/2026-07-29.1/ai-http-request.schema.json');
  const resultSchema = ajv.getSchema('https://api.clervo.dev/schemas/2026-07-29.1/ai-http-result.schema.json');
  assert.equal(requestSchema({ model: 'clervo/fast', input: { kind: 'chat', messages: [{ role: 'user', content: 'Say hello.' }], responseFormat: 'text', stream: false } }), true, ajv.errorsText(requestSchema.errors));
  assert.equal(resultSchema(response), true, ajv.errorsText(resultSchema.errors));
});
