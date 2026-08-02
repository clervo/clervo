#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const discovery = JSON.parse(await readFile(path.join(root, 'docs/evidence/supply-foundation/owned-ai-source-discovery.v1.json'), 'utf8'));
const sources = discovery.sources.filter(({ status, serviceId }) => status === 'working' && serviceId !== 'supply.hcnsec_gateway');

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
  return {
    serviceId: source.serviceId,
    modelId,
    product: productId,
    listingStatus: source.serviceId === 'supply.cerebras' ? 'priced_unavailable_no_balance' : 'priced_pending_qualification',
    qualityGrade: 'unranked',
    supplierCostKnown: false,
    customerPrices: prices(productId, modelId),
    pricingMethod: 'category_introductory_price',
    termsStatus: 'unreviewed',
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
  source: { pricedListings: assets.length, workingServices: sources.length, excludedGatewayListings: 21, ownerCashSpentUsd: 0, supplierCostKnown: false },
  assets,
}, null, 2)}\n`);
