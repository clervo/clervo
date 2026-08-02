#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evidenceRoot = path.join(root, 'docs/evidence/supply-foundation');
const discovery = JSON.parse(await readFile(path.join(evidenceRoot, 'owned-ai-source-discovery.v1.json'), 'utf8'));
const quality = JSON.parse(await readFile(path.join(evidenceRoot, 'hcnsec-chat-quality-run.v1.json'), 'utf8'));
const identity = JSON.parse(await readFile(path.join(evidenceRoot, 'hcnsec-chat-identity-probe.v1.json'), 'utf8'));
const models = discovery.sources.find(({ serviceId }) => serviceId === 'supply.hcnsec_gateway')?.modelIds;
if (!Array.isArray(models) || models.length !== 21) throw new TypeError('hcnsec_pricing_discovery_invalid');

const qualityByModel = new Map(quality.models.map((entry) => [entry.model, entry.results.filter(({ answerMatches }) => answerMatches).length]));
const identityByModel = new Map(identity.results.map((entry) => [entry.requestedModel, entry]));

function product(modelId) {
  if (modelId === 'step-image-edit-2') return 'ai.image_edit';
  if (modelId.endsWith('-asr')) return 'ai.transcribe';
  if (modelId.endsWith('-tts')) return 'ai.speech';
  if (modelId.endsWith('-realtime')) return 'ai.speech_realtime';
  return 'ai.chat';
}

function prices(productId, modelId) {
  if (productId === 'ai.image_edit') return [{ unit: 'per edited image', price: 0.005 }];
  if (productId === 'ai.transcribe') return [{ unit: 'per audio minute', price: 0.002 }];
  if (productId === 'ai.speech') return [{ unit: 'per 1k characters', price: 0.01 }];
  if (productId === 'ai.speech_realtime') return [{ unit: 'per audio minute', price: 0.004 }];
  const fast = /flash|lite|fast|router|auto/iu.test(modelId);
  return fast
    ? [{ unit: 'per M input tokens', price: 0.05 }, { unit: 'per M output tokens', price: 0.2 }]
    : [{ unit: 'per M input tokens', price: 0.2 }, { unit: 'per M output tokens', price: 0.8 }];
}

function grade(score) {
  if (score === 10) return 'best';
  if (score >= 8) return 'good';
  if (score >= 1) return 'poor';
  return 'unranked';
}

const assets = models.map((modelId) => {
  const observed = identityByModel.get(modelId);
  const identityFailed = observed !== undefined && !observed.identityMatches;
  return {
    modelId,
    product: product(modelId),
    listingStatus: identityFailed ? 'priced_identity_failed' : 'priced_pending_qualification',
    qualityGrade: grade(qualityByModel.get(modelId)),
    supplierCostKnown: false,
    customerPrices: prices(product(modelId), modelId),
    pricingMethod: 'category_introductory_price',
    identityStatus: identityFailed ? 'substitution_observed' : 'not_run',
    observedModelId: identityFailed ? observed.observedModel : null,
    termsStatus: 'review_required',
  };
});

process.stdout.write(`${JSON.stringify({
  schemaVersion: 'clervo.ai-gateway-pricing.v1',
  priceVersion: '2026-08-02.1',
  evaluatedAt: identity.checkedAt,
  currency: 'USD',
  providerVisibility: 'internal_only',
  policy: { customerFreeByDefault: false, unknownSupplierCostBlocksPricing: false, identityFailureBlocksSale: true, termsReviewBlocksSale: true, accountPoolingAllowed: false },
  source: { discoveredAssets: 21, credentialSlotsUsed: 1, configuredCredentialSlots: 20, externalCalls: 55, ownerCashSpentUsd: 0, supplierCostKnown: false },
  assets,
}, null, 2)}\n`);
