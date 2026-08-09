// Resolves, for one catalogued route, both sides of its price: what the
// supplier charges us and what we charge the customer.
//
// Neither number is invented here. Both are read out of the pricing catalogs
// that already hold them, which is why this file is a resolver and not a price
// list. It exists because those catalogs record the same two facts in five
// different shapes — per million tokens, per million input tokens, per image,
// per thousand characters, and a micros-per-million launch valuation — and both
// the requalifier and the margin check need them in one shape.
//
// `AiRoutePricing` is that shape, and `estimateAiSupplierCost` is the only
// consumer, so the conversion has to match its units exactly: micros per
// million tokens, micros per image, micros per thousand audio characters.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CATALOG_FILES = Object.freeze({
  credit: 'ai-credit-backed-pricing.v1.json',
  speech: 'ai-speech-pricing.v1.json',
  launch: 'ai-launch-pricing.v1.json',
  freeTier: 'ai-free-tier-pricing.v1.json',
  edge: 'ai-edge-free-pricing.v1.json',
});

export async function loadPricingCatalogs() {
  const entries = await Promise.all(Object.entries(CATALOG_FILES)
    .map(async ([name, file]) => [name, JSON.parse(await readFile(path.join(root, 'packages/catalog', file), 'utf8'))]));
  return Object.freeze(Object.fromEntries(entries));
}

// A price of 0 is a real price — a free allocation — and must survive as 0
// rather than becoming "unknown". Only a missing or non-finite value is unknown.
function micros(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const result = Math.round(value * 1_000_000);
  return Number.isSafeInteger(result) ? result : null;
}

function pricing({ input = 0, cachedInput = null, output = 0, reasoning = null, imageEach = 0, audioPerThousand = 0 }) {
  const inputMicros = micros(input);
  const outputMicros = micros(output);
  const imageMicros = micros(imageEach);
  const audioMicros = micros(audioPerThousand);
  if (inputMicros === null || outputMicros === null || imageMicros === null || audioMicros === null) return null;
  // Where a catalog does not separate cached input or reasoning, the
  // conservative reading is that they cost the same as their uncached and
  // output counterparts. Understating either would let a route pass a cost
  // ceiling it does not actually respect.
  const cachedMicros = micros(cachedInput) ?? inputMicros;
  const reasoningMicros = micros(reasoning) ?? outputMicros;
  return Object.freeze({
    currency: 'USD',
    decimals: 6,
    inputTokenMicrosPerMillion: inputMicros,
    cachedInputTokenMicrosPerMillion: cachedMicros,
    outputTokenMicrosPerMillion: outputMicros,
    reasoningTokenMicrosPerMillion: reasoningMicros,
    imageMicrosEach: imageMicros,
    audioMicrosPerThousandCharacters: audioMicros,
  });
}

function unit(entries, pattern) {
  if (!Array.isArray(entries)) return null;
  const found = entries.find(({ unit: name }) => typeof name === 'string' && pattern.test(name));
  return found === undefined ? null : found.price;
}

function fromLaunch(route) {
  // The launch catalog already speaks micros per million, so it is the one
  // shape that must not be multiplied again.
  const supplier = route.shadowBudgetValuation ?? {};
  const customer = route.customerPrice ?? {};
  const direct = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback);
  const shape = (source) => Object.freeze({
    currency: 'USD',
    decimals: 6,
    inputTokenMicrosPerMillion: direct(source.inputMicrosPerMillion, 0),
    cachedInputTokenMicrosPerMillion: direct(source.cachedInputMicrosPerMillion, direct(source.inputMicrosPerMillion, 0)),
    outputTokenMicrosPerMillion: direct(source.outputMicrosPerMillion, 0),
    reasoningTokenMicrosPerMillion: direct(source.reasoningMicrosPerMillion, direct(source.outputMicrosPerMillion, 0)),
    imageMicrosEach: 0,
    audioMicrosPerThousandCharacters: 0,
  });
  return {
    supplier: shape(supplier),
    customer: shape(customer),
    supplierKnown: Object.keys(supplier).length > 0,
    basis: 'ai-launch-pricing.v1',
    listingStatus: route.listingStatus ?? null,
  };
}

// Each branch below reads one catalog shape. The order is by specificity: a
// route is resolved by the catalog that actually prices its modality, so a chat
// entry can never supply the price for a speech route of the same family.
export function resolveRoutePricing(route, catalogs) {
  const modelId = route.exactModelId;
  const productId = route.productIds[0];

  const launch = (catalogs.launch.routes ?? []).find((entry) => entry.modelId === modelId);
  if (launch !== undefined) return fromLaunch(launch);

  const creditChat = (catalogs.credit.chatRoutes ?? []).find((entry) => entry.modelId === modelId);
  if (creditChat !== undefined) {
    return {
      supplier: pricing({ input: creditChat.shadowPriceUsdPerMillion?.input, cachedInput: creditChat.shadowPriceUsdPerMillion?.cachedInput, output: creditChat.shadowPriceUsdPerMillion?.output, reasoning: creditChat.shadowPriceUsdPerMillion?.reasoning }),
      customer: pricing({ input: creditChat.customerPriceUsdPerMillion?.input, cachedInput: creditChat.customerPriceUsdPerMillion?.cachedInput, output: creditChat.customerPriceUsdPerMillion?.output, reasoning: creditChat.customerPriceUsdPerMillion?.reasoning }),
      supplierKnown: creditChat.shadowPriceUsdPerMillion !== undefined,
      basis: 'ai-credit-backed-pricing.v1.chatRoutes',
      listingStatus: creditChat.listingStatus ?? null,
    };
  }

  const creditEmbedding = (catalogs.credit.embeddingRoutes ?? []).find((entry) => entry.modelId === modelId);
  if (creditEmbedding !== undefined) {
    return {
      supplier: pricing({ input: creditEmbedding.shadowUsdPerMillionInputTokens, output: 0 }),
      customer: pricing({ input: creditEmbedding.customerUsdPerMillionInputTokens, output: 0 }),
      supplierKnown: typeof creditEmbedding.shadowUsdPerMillionInputTokens === 'number',
      basis: 'ai-credit-backed-pricing.v1.embeddingRoutes',
      listingStatus: creditEmbedding.listingStatus ?? null,
    };
  }

  const creditImage = (catalogs.credit.imageRoutes ?? []).find((entry) => entry.modelId === modelId);
  if (creditImage !== undefined) {
    return {
      supplier: pricing({ imageEach: creditImage.shadowUsdPerImage }),
      customer: pricing({ imageEach: creditImage.customerUsdPerImage }),
      supplierKnown: typeof creditImage.shadowUsdPerImage === 'number',
      basis: 'ai-credit-backed-pricing.v1.imageRoutes',
      listingStatus: creditImage.listingStatus ?? null,
    };
  }

  const speech = (catalogs.speech.speechRoutes ?? []).find((entry) => entry.modelId === modelId);
  if (speech !== undefined) {
    return {
      supplier: pricing({ audioPerThousand: speech.shadowUsdPerThousandCharacters }),
      customer: pricing({ audioPerThousand: speech.customerUsdPerThousandCharacters }),
      supplierKnown: typeof speech.shadowUsdPerThousandCharacters === 'number',
      basis: 'ai-speech-pricing.v1.speechRoutes',
      listingStatus: speech.listingStatus ?? null,
    };
  }

  const freeTier = (catalogs.freeTier.assets ?? []).find((entry) => entry.modelId === modelId);
  if (freeTier !== undefined) {
    return {
      supplier: pricing({ input: freeTier.shadowPrice?.input, output: freeTier.shadowPrice?.output }),
      customer: pricing({ input: freeTier.customerPrice?.input, output: freeTier.customerPrice?.output }),
      supplierKnown: freeTier.supplierPriceKnown === true,
      basis: 'ai-free-tier-pricing.v1.assets',
      listingStatus: freeTier.listingStatus ?? null,
    };
  }

  const edge = (catalogs.edge.assets ?? []).find((entry) => entry.modelId === modelId);
  if (edge !== undefined) {
    const supplierAudio = unit(edge.supplierPrices, /1k characters/iu);
    const customerAudio = unit(edge.customerPrices, /1k characters/iu);
    const supplier = productId === 'ai.speech'
      ? pricing({ audioPerThousand: supplierAudio })
      : pricing({ input: unit(edge.supplierPrices, /input token/iu), output: unit(edge.supplierPrices, /output token/iu) });
    const customer = productId === 'ai.speech'
      ? pricing({ audioPerThousand: customerAudio })
      : pricing({ input: unit(edge.customerPrices, /input token/iu), output: unit(edge.customerPrices, /output token/iu) });
    return {
      supplier,
      customer,
      supplierKnown: edge.supplierPriceKnown === true,
      basis: 'ai-edge-free-pricing.v1.assets',
      listingStatus: edge.listingStatus ?? null,
    };
  }

  // A route with no catalogued price is reported as unpriced, never defaulted to
  // zero. A zero supplier cost would silently pass every ceiling and every
  // margin check.
  return { supplier: null, customer: null, supplierKnown: false, basis: null, listingStatus: null };
}
