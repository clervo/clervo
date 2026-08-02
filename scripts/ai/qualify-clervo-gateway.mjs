#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBoundedAiHttpTransport, OpenAiCompatibleAdapter } from '../../dist/adapters/ai/src/openai-compatible.js';
import {
  AI_EXECUTION_REQUEST_SCHEMA_VERSION,
  CONTRACT_VERSION,
  createAiModelCatalog,
} from '../../dist/packages/contracts/src/index.js';
import { qualifyAiChatRoute } from '../../dist/services/ai/src/qualification.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const routes = [
  {
    routeId: 'ai.route.gpt_5_6_luna',
    qualificationId: 'aiqual_01K0CLERVOGATEWAYLUNA01',
    exactModelId: 'gpt-5.6-luna',
    pricing: { currency: 'USD', decimals: 6, inputTokenMicrosPerMillion: 1_000_000, cachedInputTokenMicrosPerMillion: 100_000, outputTokenMicrosPerMillion: 6_000_000, reasoningTokenMicrosPerMillion: 6_000_000, imageMicrosEach: 0, audioMicrosPerThousandCharacters: 0 },
  },
  {
    routeId: 'ai.route.gpt_5_6_terra',
    qualificationId: 'aiqual_01K0CLERVOGATEWAYTERRA1',
    exactModelId: 'gpt-5.6-terra',
    pricing: { currency: 'USD', decimals: 6, inputTokenMicrosPerMillion: 2_500_000, cachedInputTokenMicrosPerMillion: 250_000, outputTokenMicrosPerMillion: 15_000_000, reasoningTokenMicrosPerMillion: 15_000_000, imageMicrosEach: 0, audioMicrosPerThousandCharacters: 0 },
  },
  {
    routeId: 'ai.route.gpt_5_6_sol',
    qualificationId: 'aiqual_01K0CLERVOGATEWAYSOL001',
    exactModelId: 'gpt-5.6-sol',
    pricing: { currency: 'USD', decimals: 6, inputTokenMicrosPerMillion: 5_000_000, cachedInputTokenMicrosPerMillion: 500_000, outputTokenMicrosPerMillion: 30_000_000, reasoningTokenMicrosPerMillion: 30_000_000, imageMicrosEach: 0, audioMicrosPerThousandCharacters: 0 },
  },
];
const capabilities = ['text_input', 'text_output', 'streaming', 'structured_output'];

async function configuration() {
  const file = await readFile(path.join(root, '.env'), 'utf8');
  const local = Object.fromEntries(file.split(/\r?\n/u).filter((line) => line !== '' && !line.startsWith('#')).map((line) => {
    const separator = line.indexOf('=');
    return separator < 1 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
  }));
  const baseUrl = process.env.CLERVO_AI_BASE_URL ?? local.CLERVO_AI_BASE_URL;
  const opaqueCredential = process.env.CLERVO_AI_API_KEY ?? local.CLERVO_AI_API_KEY;
  if (typeof baseUrl !== 'string' || typeof opaqueCredential !== 'string' || opaqueCredential.length < 8 || /[\r\n]/u.test(opaqueCredential)) throw new TypeError('clervo_qualification_configuration_invalid');
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.hostname !== 'ai.clervo.dev' || base.username !== '' || base.password !== '' || base.search !== '' || base.hash !== '') throw new TypeError('clervo_qualification_base_url_invalid');
  return { baseUrl: base.href.endsWith('/') ? base.href : `${base.href}/`, opaqueCredential };
}

let operationSequence = 0;
function executionRequest(routeId, prompt, stream, responseFormat) {
  operationSequence += 1;
  return {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_EXECUTION_REQUEST_SCHEMA_VERSION,
    operationId: `op_01K0CLERVOLIVEQUAL${operationSequence.toString().padStart(6, '0')}`,
    productId: 'ai.chat',
    requestedModel: routeId,
    input: { kind: 'chat', messages: [{ role: 'user', content: prompt }], responseFormat, stream },
    usageBounds: { inputTokens: 10_000, cachedInputTokens: 10_000, outputTokens: 1_000, reasoningTokens: 1_000, images: 0, audioCharacters: 0 },
    maximumSupplierCost: { asset: 'USD', amountAtomic: '100000', decimals: 6 },
    deadlineAt: new Date(Date.now() + 45_000).toISOString(),
  };
}

function probe(config, route) {
  const adapter = new OpenAiCompatibleAdapter({
    config: { routeId: route.routeId, baseUrl: config.baseUrl, allowedHosts: ['ai.clervo.dev'], secretName: 'CLERVO_AI_API_KEY', exactModelId: route.exactModelId, productId: 'ai.chat', maximumResponseBytes: 1_000_000 },
    transport: createBoundedAiHttpTransport(),
    secret: async () => config.opaqueCredential,
  });
  return {
    async complete({ prompt, stream, responseFormat }) {
      const started = performance.now();
      const result = await adapter.execute({ request: executionRequest(route.routeId, prompt, stream, responseFormat), exactModelId: route.exactModelId, signal: AbortSignal.timeout(45_000) });
      if (result.output.kind !== 'chat') throw new TypeError('clervo_qualification_output_invalid');
      return { modelIdentity: result.modelIdentity, outputText: result.output.content, usage: result.usage, latencyMs: Math.round((performance.now() - started) * 100) / 100 };
    },
    async invalidModelFailsSafely() {
      const invalidRoute = { ...route, routeId: 'ai.route.invalid_screen', exactModelId: 'clervo-invalid-model-qualification' };
      const invalidAdapter = new OpenAiCompatibleAdapter({
        config: { routeId: invalidRoute.routeId, baseUrl: config.baseUrl, allowedHosts: ['ai.clervo.dev'], secretName: 'CLERVO_AI_API_KEY', exactModelId: invalidRoute.exactModelId, productId: 'ai.chat', maximumResponseBytes: 1_000_000 },
        transport: createBoundedAiHttpTransport(),
        secret: async () => config.opaqueCredential,
      });
      try {
        await invalidAdapter.execute({ request: executionRequest(invalidRoute.routeId, 'This request must fail.', false, 'text'), exactModelId: invalidRoute.exactModelId, signal: AbortSignal.timeout(45_000) });
        return false;
      } catch { return true; }
    },
  };
}

const config = await configuration();
const checkedAt = new Date().toISOString();
const expiresAt = new Date(Date.parse(checkedAt) + 7 * 86_400_000).toISOString();
const definitions = [];
for (const route of routes) {
  const qualification = await qualifyAiChatRoute({
    qualificationId: route.qualificationId,
    routeId: route.routeId,
    providerId: 'provider.clervo_ai_gateway',
    supplyFamilyId: 'supply.clervo_ai_gateway',
    exactModelId: route.exactModelId,
    capabilities,
    credentialAvailable: true,
    termsStatus: 'restricted',
    resaleAllowed: true,
    checkedAt,
    expiresAt,
    maximumLatencyMsP95: 15_000,
    maximumSupplierCost: { asset: 'USD', amountAtomic: '100000', decimals: 6 },
    pricing: route.pricing,
    probe: probe(config, route),
  });
  definitions.push({ routeId: route.routeId, providerId: 'provider.clervo_ai_gateway', supplyFamilyId: 'supply.clervo_ai_gateway', exactModelId: route.exactModelId, productIds: ['ai.chat'], capabilities, requiredSecretNames: ['CLERVO_AI_API_KEY'], quickAiPremium: false, qualification });
}

const catalog = createAiModelCatalog({ catalogId: 'aicat_01K0CLERVOGATEWAYCAT01', evaluatedAt: new Date().toISOString(), routes: definitions });
process.stdout.write(`${JSON.stringify({ schemaVersion: 'clervo.gateway-live-qualification.v1', externalCalls: operationSequence, ownerCashSpentUsd: 0, supplierBalanceDebitKnown: false, catalog }, null, 2)}\n`);
