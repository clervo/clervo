#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const discovery = JSON.parse(await readFile(path.join(root, 'docs/evidence/supply-foundation/owned-ai-source-discovery.v1.json'), 'utf8'));
const nvidiaQuality = JSON.parse(await readFile(path.join(root, 'docs/evidence/supply-foundation/nvidia-chat-quality-run.v1.json'), 'utf8'));
const sambanovaQuality = JSON.parse(await readFile(path.join(root, 'docs/evidence/supply-foundation/sambanova-chat-quality-run.v1.json'), 'utf8'));
const sources = discovery.sources.filter(({ status, serviceId }) => status === 'working' && serviceId !== 'supply.hcnsec_gateway');
const nvidiaScores = new Map(nvidiaQuality.models.map((entry) => [entry.model, entry.results.filter(({ answerMatches }) => answerMatches).length]));
const sambanovaScores = new Map(sambanovaQuality.models.map((entry) => [entry.model, entry.results.filter(({ answerMatches }) => answerMatches).length]));

const sambanovaSupplierPrices = new Map([
  ['DeepSeek-V3.1', [{ unit: 'per M input tokens', price: 3 }, { unit: 'per M output tokens', price: 4.5 }]],
  ['DeepSeek-V3.2', [{ unit: 'per M input tokens', price: 3 }, { unit: 'per M output tokens', price: 4.5 }]],
  ['gemma-4-31B-it', [{ unit: 'per M input tokens', price: 0.22 }, { unit: 'per M output tokens', price: 0.59 }]],
  ['gpt-oss-120b', [{ unit: 'per M input tokens', price: 0.22 }, { unit: 'per M output tokens', price: 0.59 }]],
  ['Meta-Llama-3.3-70B-Instruct', [{ unit: 'per M input tokens', price: 0.6 }, { unit: 'per M output tokens', price: 1.2 }]],
  ['MiniMax-M2.7', [{ unit: 'per M cached input tokens', price: 0.06 }, { unit: 'per M input tokens', price: 0.6 }, { unit: 'per M output tokens', price: 2.4 }]],
]);

const sambanovaCustomerPrices = new Map([
  ['DeepSeek-V3.1', [{ unit: 'per M input tokens', price: 3.15 }, { unit: 'per M output tokens', price: 4.75 }]],
  ['DeepSeek-V3.2', [{ unit: 'per M input tokens', price: 3.15 }, { unit: 'per M output tokens', price: 4.75 }]],
  ['gemma-4-31B-it', [{ unit: 'per M input tokens', price: 0.25 }, { unit: 'per M output tokens', price: 0.65 }]],
  ['gpt-oss-120b', [{ unit: 'per M input tokens', price: 0.25 }, { unit: 'per M output tokens', price: 0.65 }]],
  ['Meta-Llama-3.3-70B-Instruct', [{ unit: 'per M input tokens', price: 0.65 }, { unit: 'per M output tokens', price: 1.3 }]],
  ['MiniMax-M2.7', [{ unit: 'per M cached input tokens', price: 0.07 }, { unit: 'per M input tokens', price: 0.65 }, { unit: 'per M output tokens', price: 2.55 }]],
]);

function grade(score) {
  if (score === 10) return 'best';
  if (score >= 7) return 'good';
  if (score >= 1) return 'poor';
  return 'unranked';
}

function product(modelId) {
  const value = modelId.toLowerCase();
  if (/\b(?:embed|embedding|bge|nvclip)\b/u.test(value)) return 'ai.embed';
  if (/rerank/u.test(value)) return 'ai.rerank';
  if (/(?:image|diffusion|flux|sdxl|stable-diffusion|z-image)/u.test(value)) return 'ai.image';
  if (/(?:video|wan2|cosmos)/u.test(value)) return 'ai.video';
  if (/(?:tts|speech|cosyvoice|orpheus)/u.test(value)) return 'ai.speech';
  if (/(?:transcri|\basr\b|whisper)/u.test(value)) return 'ai.transcribe';
  if (/(?:ocr|parse|deplot)/u.test(value)) return 'ai.ocr';
  return 'ai.chat';
}

function prices(productId, modelId) {
  if (productId === 'ai.embed' || productId === 'ai.rerank') return [{ unit: 'per M input tokens', price: 0.005 }];
  if (productId === 'ai.image') return [{ unit: 'per generated image', price: 0.005 }];
  if (productId === 'ai.video') return [{ unit: 'per generated video second', price: 0.02 }];
  if (productId === 'ai.speech') return [{ unit: 'per 1k characters', price: 0.01 }];
  if (productId === 'ai.transcribe') return [{ unit: 'per audio minute', price: 0.002 }];
  if (productId === 'ai.ocr') return [{ unit: 'per document page', price: 0.005 }];
  const fast = /(?:flash|lite|nano|mini|small|fast|free|auto)/iu.test(modelId);
  return fast
    ? [{ unit: 'per M input tokens', price: 0.05 }, { unit: 'per M output tokens', price: 0.2 }]
    : [{ unit: 'per M input tokens', price: 0.2 }, { unit: 'per M output tokens', price: 0.8 }];
}

const assets = sources.flatMap((source) => source.modelIds.map((modelId) => {
  const productId = product(modelId);
  const isSambanova = source.serviceId === 'supply.sambanova';
  const supplierPrices = isSambanova ? sambanovaSupplierPrices.get(modelId) : undefined;
  return {
    serviceId: source.serviceId,
    modelId,
    product: productId,
    listingStatus: source.serviceId === 'supply.cerebras' || (isSambanova && modelId === 'MiniMax-M2.7') ? 'priced_unavailable_no_balance' : ['supply.nvidia', 'supply.sambanova'].includes(source.serviceId) ? 'priced_terms_blocked' : 'priced_pending_qualification',
    qualityGrade: source.serviceId === 'supply.nvidia' ? grade(nvidiaScores.get(modelId)) : isSambanova ? grade(sambanovaScores.get(modelId)) : 'unranked',
    supplierCostKnown: supplierPrices !== undefined,
    ...(supplierPrices === undefined ? {} : { supplierPrices }),
    customerPrices: isSambanova ? sambanovaCustomerPrices.get(modelId) : prices(productId, modelId),
    pricingMethod: isSambanova ? 'official_cost_competitive_markup' : 'category_introductory_price',
    termsStatus: ['supply.nvidia', 'supply.sambanova'].includes(source.serviceId) ? 'blocked' : 'unreviewed',
  };
})).sort((left, right) => `${left.serviceId}/${left.modelId}`.localeCompare(`${right.serviceId}/${right.modelId}`, 'en-US'));

if (sources.length !== 8 || assets.length !== 612) throw new TypeError('owned_source_pricing_count_invalid');
process.stdout.write(`${JSON.stringify({
  schemaVersion: 'clervo.ai-owned-source-pricing.v1',
  priceVersion: '2026-08-02.1',
  evaluatedAt: discovery.checkedAt,
  currency: 'USD',
  providerVisibility: 'internal_only',
  policy: { customerFreeByDefault: false, unknownSupplierCostBlocksPricing: false, qualificationRequiredForSale: true, termsRequiredForSale: true, providerNamesPublic: false },
  source: { pricedListings: assets.length, workingServices: sources.length, excludedGatewayListings: 21, termsBlockedListings: assets.filter(({ termsStatus }) => termsStatus === 'blocked').length, supplierCostKnownListings: assets.filter(({ supplierCostKnown }) => supplierCostKnown).length, ownerCashSpentUsd: 0, supplierCostKnown: false },
  assets,
}, null, 2)}\n`);
