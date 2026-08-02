#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBoundedAiHttpTransport, OpenAiCompatibleAdapter } from '../../dist/adapters/ai/src/openai-compatible.js';
import { AI_EXECUTION_REQUEST_SCHEMA_VERSION, CONTRACT_VERSION } from '../../dist/packages/contracts/src/index.js';
import { qualifyAiChatRoute } from '../../dist/services/ai/src/qualification.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-edge-free-pricing.v1.json'), 'utf8'));
const requested = process.env.CLOUDFLARE_QUALIFICATION_MODELS?.split(',').filter(Boolean) ?? ['@cf/openai/gpt-oss-20b', '@cf/openai/gpt-oss-120b'];
const price = (asset, fragment, fallback) => Math.round((asset.supplierPrices.find(({ unit }) => unit.includes(fragment))?.price ?? fallback) * 1_000_000);
const specs = requested.map((exactModelId) => {
  const asset = catalog.assets.find(({ modelId }) => modelId === exactModelId);
  if (!asset || asset.task !== 'Text Generation' || asset.lifecycle !== 'production' || asset.accessStatus !== 'free_allocation_available') throw new TypeError('cloudflare_qualification_model_invalid');
  const digest = createHash('sha256').update(exactModelId).digest('hex').toUpperCase();
  return {
    routeId: `ai.route.cf_${exactModelId.replace(/^@cf\//u, '').replace(/[^a-zA-Z0-9]+/gu, '_').replace(/^_|_$/gu, '')}`,
    qualificationId: `aiqual_01K0CF${digest.slice(0, 20)}`,
    exactModelId,
    input: price(asset, 'input', 0.05),
    output: price(asset, 'output', 0.2),
  };
});
const capabilities = ['text_input', 'text_output', 'streaming', 'structured_output', 'reasoning'];
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const credential = process.env.CLOUDFLARE_AI_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
if (typeof accountId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/u.test(accountId) || typeof credential !== 'string' || credential.length < 20 || /[\r\n]/u.test(credential)) throw new TypeError('cloudflare_qualification_configuration_invalid');
const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/`;
const transport = createBoundedAiHttpTransport();
let operationSequence = 0;

function request(spec, prompt, stream, responseFormat) {
  operationSequence += 1;
  return {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_EXECUTION_REQUEST_SCHEMA_VERSION,
    operationId: `op_01K0CFLIVEQUAL${operationSequence.toString().padStart(8, '0')}`,
    productId: 'ai.chat',
    requestedModel: spec.exactModelId,
    input: { kind: 'chat', messages: [{ role: 'user', content: prompt }], responseFormat, stream },
    usageBounds: { inputTokens: 1_000, cachedInputTokens: 1_000, outputTokens: 256, reasoningTokens: 256, images: 0, audioCharacters: 0 },
    maximumSupplierCost: { asset: 'USD', amountAtomic: '10000', decimals: 6 },
    deadlineAt: new Date(Date.now() + 45_000).toISOString(),
  };
}

function adapter(spec) {
  return new OpenAiCompatibleAdapter({
    config: { routeId: spec.routeId, baseUrl, allowedHosts: ['api.cloudflare.com'], secretName: 'CLOUDFLARE_API_TOKEN', exactModelId: spec.exactModelId, productId: 'ai.chat', maximumResponseBytes: 1_000_000 },
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
      if (result.output.kind !== 'chat') throw new TypeError('cloudflare_qualification_output_invalid');
      return { modelIdentity: result.modelIdentity, outputText: result.output.content, usage: result.usage, latencyMs: Math.round((performance.now() - started) * 100) / 100 };
    },
    async invalidModelFailsSafely() {
      const invalid = { ...spec, routeId: 'ai.route.invalid_cloudflare_screen', exactModelId: '@cf/clervo/invalid-qualification-model' };
      try {
        await adapter(invalid).execute({ request: request(invalid, 'This request must fail.', false, 'text'), exactModelId: invalid.exactModelId, signal: AbortSignal.timeout(45_000) });
        return false;
      } catch { return true; }
    },
  };
}

const checkedAt = new Date().toISOString();
const expiresAt = new Date(Date.parse(checkedAt) + 7 * 86_400_000).toISOString();
const qualifications = [];
for (const spec of specs) {
  const pricing = { currency: 'USD', decimals: 6, inputTokenMicrosPerMillion: spec.input, cachedInputTokenMicrosPerMillion: spec.input, outputTokenMicrosPerMillion: spec.output, reasoningTokenMicrosPerMillion: spec.output, imageMicrosEach: 0, audioMicrosPerThousandCharacters: 0 };
  qualifications.push(await qualifyAiChatRoute({
    qualificationId: spec.qualificationId,
    routeId: spec.routeId,
    providerId: 'provider.cloudflare_workers_ai',
    supplyFamilyId: 'supply.cloudflare_workers_ai',
    exactModelId: spec.exactModelId,
    capabilities,
    credentialAvailable: true,
    termsStatus: 'restricted',
    resaleAllowed: true,
    checkedAt,
    expiresAt,
    maximumLatencyMsP95: 20_000,
    maximumSupplierCost: { asset: 'USD', amountAtomic: '10000', decimals: 6 },
    pricing,
    probe: probe(spec),
  }));
}

process.stdout.write(`${JSON.stringify({ schemaVersion: 'clervo.cloudflare-chat-live-qualification.v1', checkedAt, externalCalls: operationSequence, ownerCashSpentUsd: 0, freeAllocationBacked: true, qualifications }, null, 2)}\n`);
