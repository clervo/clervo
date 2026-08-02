#!/usr/bin/env node

import { createBoundedAiHttpTransport, OpenAiCompatibleAdapter } from '../../dist/adapters/ai/src/openai-compatible.js';
import { AI_EXECUTION_REQUEST_SCHEMA_VERSION, CONTRACT_VERSION } from '../../dist/packages/contracts/src/index.js';
import { qualifyAiChatRoute } from '../../dist/services/ai/src/qualification.js';

const specs = [
  { routeId: 'ai.route.gpt_oss_20b', qualificationId: 'aiqual_01K0GROQGPTOSS20B0001', exactModelId: 'openai/gpt-oss-20b', reasoningEffort: 'low', reasoningFormat: 'hidden', input: 75_000, cached: 37_500, output: 300_000 },
  { routeId: 'ai.route.gpt_oss_120b', qualificationId: 'aiqual_01K0GROQGPTOSS120B001', exactModelId: 'openai/gpt-oss-120b', reasoningEffort: 'low', reasoningFormat: 'hidden', input: 150_000, cached: 75_000, output: 600_000 },
  { routeId: 'ai.route.qwen3_6_27b', qualificationId: 'aiqual_01K0GROQQWEN3627B0001', exactModelId: 'qwen/qwen3.6-27b', reasoningEffort: 'none', input: 600_000, cached: 600_000, output: 3_000_000 },
];
const capabilities = ['text_input', 'text_output', 'streaming', 'structured_output', 'reasoning'];
const credential = process.env.GROQ_API_KEY;
if (typeof credential !== 'string' || credential.length < 8 || /[\r\n]/u.test(credential)) throw new TypeError('groq_qualification_configuration_invalid');
const transport = createBoundedAiHttpTransport();
let operationSequence = 0;

function request(spec, prompt, stream, responseFormat) {
  operationSequence += 1;
  const reasoningTokens = spec.reasoningEffort === 'none' ? 0 : 256;
  return {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_EXECUTION_REQUEST_SCHEMA_VERSION,
    operationId: `op_01K0GROQLIVEQUAL${operationSequence.toString().padStart(6, '0')}`,
    productId: 'ai.chat',
    requestedModel: spec.exactModelId,
    input: { kind: 'chat', messages: [{ role: 'user', content: prompt }], responseFormat, stream },
    usageBounds: { inputTokens: 1_000, cachedInputTokens: 1_000, outputTokens: 256, reasoningTokens, images: 0, audioCharacters: 0 },
    maximumSupplierCost: { asset: 'USD', amountAtomic: '10000', decimals: 6 },
    deadlineAt: new Date(Date.now() + 45_000).toISOString(),
  };
}

function adapter(spec) {
  return new OpenAiCompatibleAdapter({
    config: { routeId: spec.routeId, baseUrl: 'https://api.groq.com/openai/v1/', allowedHosts: ['api.groq.com'], secretName: 'GROQ_API_KEY', exactModelId: spec.exactModelId, productId: 'ai.chat', maximumResponseBytes: 1_000_000, reasoningEffort: spec.reasoningEffort, ...(spec.reasoningFormat === undefined ? {} : { reasoningFormat: spec.reasoningFormat }) },
    transport,
    secret: async () => credential,
  });
}

function probe(spec) {
  const selected = adapter(spec);
  return {
    async complete({ prompt, stream, responseFormat }) {
      const started = performance.now();
      const result = await selected.execute({ request: request(spec, prompt, stream, responseFormat), exactModelId: spec.exactModelId, signal: AbortSignal.timeout(45_000) });
      if (result.output.kind !== 'chat') throw new TypeError('groq_qualification_output_invalid');
      return { modelIdentity: result.modelIdentity, outputText: result.output.content, usage: result.usage, latencyMs: Math.round((performance.now() - started) * 100) / 100 };
    },
    async invalidModelFailsSafely() {
      const invalidSpec = { ...spec, routeId: 'ai.route.invalid_groq_screen', exactModelId: 'clervo-invalid-model-qualification' };
      try {
        await adapter(invalidSpec).execute({ request: request(invalidSpec, 'This request must fail.', false, 'text'), exactModelId: invalidSpec.exactModelId, signal: AbortSignal.timeout(45_000) });
        return false;
      } catch { return true; }
    },
  };
}

const checkedAt = new Date().toISOString();
const expiresAt = new Date(Date.parse(checkedAt) + 7 * 86_400_000).toISOString();
const qualifications = [];
for (const spec of specs) {
  const pricing = { currency: 'USD', decimals: 6, inputTokenMicrosPerMillion: spec.input, cachedInputTokenMicrosPerMillion: spec.cached, outputTokenMicrosPerMillion: spec.output, reasoningTokenMicrosPerMillion: spec.output, imageMicrosEach: 0, audioMicrosPerThousandCharacters: 0 };
  qualifications.push(await qualifyAiChatRoute({
    qualificationId: spec.qualificationId,
    routeId: spec.routeId,
    providerId: 'provider.groq',
    supplyFamilyId: 'supply.groq',
    exactModelId: spec.exactModelId,
    capabilities,
    credentialAvailable: true,
    termsStatus: 'restricted',
    resaleAllowed: true,
    checkedAt,
    expiresAt,
    maximumLatencyMsP95: 5_000,
    maximumSupplierCost: { asset: 'USD', amountAtomic: '10000', decimals: 6 },
    pricing,
    probe: probe(spec),
  }));
}

process.stdout.write(`${JSON.stringify({ schemaVersion: 'clervo.groq-live-qualification.v1', checkedAt, externalCalls: operationSequence, ownerCashSpentUsd: 0, freeTierBacked: true, qualifications }, null, 2)}\n`);
