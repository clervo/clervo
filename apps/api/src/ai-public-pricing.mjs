import { estimateAiSupplierCost, selectAiRoute, verifyAiModelCatalog } from '../../../dist/packages/contracts/src/index.js';

const aliasModels = Object.freeze({
  'clervo/fast': Object.freeze(['gpt-5.6-luna']),
  'clervo/smart': Object.freeze(['gpt-5.6-terra']),
  'clervo/code': Object.freeze(['gpt-5.6-sol']),
  'clervo/deep': Object.freeze(['gpt-5.6-sol']),
});

function micros(value, code) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError(code);
  const result = Math.round(value * 1_000_000);
  if (!Number.isSafeInteger(result)) throw new TypeError(code);
  return result;
}

function pricing(input = {}) {
  return Object.freeze({
    currency: 'USD',
    decimals: 6,
    inputTokenMicrosPerMillion: input.input ?? 0,
    cachedInputTokenMicrosPerMillion: input.cachedInput ?? input.input ?? 0,
    outputTokenMicrosPerMillion: input.output ?? 0,
    reasoningTokenMicrosPerMillion: input.reasoning ?? input.output ?? 0,
    imageMicrosEach: input.image ?? 0,
    audioMicrosPerThousandCharacters: input.audioCharacters ?? 0,
  });
}

function tokenPricing(customer, supplier) {
  return Object.freeze({
    customer: pricing({ input: customer.input, cachedInput: customer.cachedInput, output: customer.output, reasoning: customer.reasoning }),
    supplier: pricing({ input: supplier.input, cachedInput: supplier.cachedInput, output: supplier.output, reasoning: supplier.reasoning }),
  });
}

function unitPrice(entries, pattern) {
  const entry = entries?.find(({ unit }) => pattern.test(unit));
  if (entry === undefined) throw new TypeError('ai_public_unit_price_missing');
  return micros(entry.price, 'ai_public_unit_price_invalid');
}

function quality(grade, modelId) {
  if (grade === 'best') return 0.95;
  if (grade === 'good') return 0.8;
  if (modelId === 'gpt-5.6-sol') return 0.98;
  if (modelId === 'gpt-5.6-terra') return 0.92;
  if (modelId === 'gpt-5.6-luna') return 0.82;
  return 0.65;
}

function routePricing(modelId, productId, catalogs) {
  const gateway = catalogs.gateway.routes.find((entry) => entry.modelId === modelId && entry.listingStatus === 'sellable');
  if (gateway !== undefined && productId === 'ai.chat') {
    return {
      ...tokenPricing(
        { input: gateway.customerPrice.inputMicrosPerMillion, cachedInput: gateway.customerPrice.cachedInputMicrosPerMillion, output: gateway.customerPrice.outputMicrosPerMillion, reasoning: gateway.customerPrice.reasoningMicrosPerMillion },
        { input: gateway.shadowBudgetValuation.inputMicrosPerMillion, cachedInput: gateway.shadowBudgetValuation.cachedInputMicrosPerMillion, output: gateway.shadowBudgetValuation.outputMicrosPerMillion, reasoning: gateway.shadowBudgetValuation.reasoningMicrosPerMillion },
      ),
      qualityScore: quality(undefined, modelId),
      priceVersion: catalogs.gateway.priceVersion,
    };
  }

  const creditChat = catalogs.credit.chatRoutes.find((entry) => entry.modelId === modelId && entry.listingStatus === 'sellable');
  if (creditChat !== undefined && productId === 'ai.chat') {
    return {
      ...tokenPricing(
        { input: micros(creditChat.customerPriceUsdPerMillion.input, 'ai_public_customer_price_invalid'), cachedInput: micros(creditChat.customerPriceUsdPerMillion.cachedInput, 'ai_public_customer_price_invalid'), output: micros(creditChat.customerPriceUsdPerMillion.output, 'ai_public_customer_price_invalid'), reasoning: micros(creditChat.customerPriceUsdPerMillion.reasoning, 'ai_public_customer_price_invalid') },
        { input: micros(creditChat.shadowPriceUsdPerMillion.input, 'ai_public_supplier_price_invalid'), cachedInput: micros(creditChat.shadowPriceUsdPerMillion.cachedInput, 'ai_public_supplier_price_invalid'), output: micros(creditChat.shadowPriceUsdPerMillion.output, 'ai_public_supplier_price_invalid'), reasoning: micros(creditChat.shadowPriceUsdPerMillion.reasoning, 'ai_public_supplier_price_invalid') },
      ),
      qualityScore: quality(undefined, modelId),
      priceVersion: catalogs.credit.priceVersion,
    };
  }
  const embedding = catalogs.credit.embeddingRoutes.find((entry) => entry.modelId === modelId && entry.listingStatus === 'sellable');
  if (embedding !== undefined && productId === 'ai.embed') {
    return {
      customer: pricing({ input: micros(embedding.customerUsdPerMillionInputTokens, 'ai_public_customer_price_invalid') }),
      supplier: pricing({ input: micros(embedding.shadowUsdPerMillionInputTokens, 'ai_public_supplier_price_invalid') }),
      qualityScore: 0.9,
      priceVersion: catalogs.credit.priceVersion,
    };
  }
  const image = catalogs.credit.imageRoutes.find((entry) => entry.modelId === modelId && entry.listingStatus === 'sellable');
  if (image !== undefined && productId === 'ai.image') {
    return {
      customer: pricing({ image: micros(image.customerUsdPerImage, 'ai_public_customer_price_invalid') }),
      supplier: pricing({ image: micros(image.shadowUsdPerImage, 'ai_public_supplier_price_invalid') }),
      qualityScore: image.positioning === 'best_quality' ? 0.96 : image.positioning === 'balanced' ? 0.88 : 0.78,
      priceVersion: catalogs.credit.priceVersion,
    };
  }

  const speech = catalogs.speech.speechRoutes.find((entry) => entry.modelId === modelId && entry.listingStatus === 'sellable');
  if (speech !== undefined && productId === 'ai.speech') {
    return {
      customer: pricing({ audioCharacters: micros(speech.customerUsdPerThousandCharacters, 'ai_public_customer_price_invalid') }),
      supplier: pricing({ audioCharacters: micros(speech.shadowUsdPerThousandCharacters, 'ai_public_supplier_price_invalid') }),
      qualityScore: 0.9,
      priceVersion: catalogs.speech.priceVersion,
    };
  }

  const recurring = catalogs.recurring.assets.find((entry) => entry.modelId === modelId && ['sellable', 'sellable_preview'].includes(entry.listingStatus));
  if (recurring !== undefined && productId === 'ai.chat' && recurring.customerUnit === 'USD_per_million_tokens' && recurring.supplierPriceKnown) {
    return {
      ...tokenPricing(
        { input: micros(recurring.customerPrice.input, 'ai_public_customer_price_invalid'), output: micros(recurring.customerPrice.output, 'ai_public_customer_price_invalid') },
        { input: micros(recurring.shadowPrice.input, 'ai_public_supplier_price_invalid'), output: micros(recurring.shadowPrice.output, 'ai_public_supplier_price_invalid') },
      ),
      qualityScore: quality(recurring.qualityGrade, modelId),
      priceVersion: catalogs.recurring.priceVersion,
    };
  }

  const edge = catalogs.edge.assets.find((entry) => entry.modelId === modelId && entry.listingStatus === 'sellable' && entry.supplierPriceKnown);
  if (edge !== undefined && productId === 'ai.chat') {
    return {
      ...tokenPricing(
        { input: unitPrice(edge.customerPrices, /M input tokens/iu), output: unitPrice(edge.customerPrices, /M output tokens/iu) },
        { input: unitPrice(edge.supplierPrices, /M input tokens/iu), output: unitPrice(edge.supplierPrices, /M output tokens/iu) },
      ),
      qualityScore: quality(edge.qualityGrade, modelId),
      priceVersion: catalogs.edge.priceVersion,
    };
  }
  if (edge !== undefined && productId === 'ai.speech') {
    return {
      customer: pricing({ audioCharacters: unitPrice(edge.customerPrices, /1k characters/iu) }),
      supplier: pricing({ audioCharacters: unitPrice(edge.supplierPrices, /1k characters/iu) }),
      qualityScore: quality(edge.qualityGrade, modelId),
      priceVersion: catalogs.edge.priceVersion,
    };
  }
  return undefined;
}

export function createAiPublicPricing(catalogs) {
  if (!verifyAiModelCatalog(catalogs?.model)) throw new TypeError('ai_public_model_catalog_invalid');
  for (const name of ['gateway', 'credit', 'speech', 'recurring', 'edge']) if (typeof catalogs[name]?.priceVersion !== 'string') throw new TypeError('ai_public_pricing_catalog_invalid');

  function availableRoutes(normalized, now) {
    const alias = aliasModels[normalized.model];
    const routes = [];
    for (const definition of catalogs.model.routes) {
      if (!definition.productIds.includes(normalized.productId) || definition.qualification.status !== 'passed' || definition.qualification.resaleAllowed !== true || Date.parse(definition.qualification.expiresAt) <= Date.parse(now)) continue;
      if (alias !== undefined ? !alias.includes(definition.exactModelId) : definition.exactModelId !== normalized.model && definition.routeId !== normalized.model) continue;
      const prices = routePricing(definition.exactModelId, normalized.productId, catalogs);
      if (prices === undefined) continue;
      routes.push(Object.freeze({ definition, pricing: prices.supplier, customerPricing: prices.customer, priceVersion: prices.priceVersion, health: 'healthy', circuit: 'closed', latencyMsP95: definition.qualification.observed.latencyMsP95, qualityScore: prices.qualityScore }));
    }
    return Object.freeze(routes);
  }

  return Object.freeze({
    quote({ normalized, operationId, now }) {
      const routes = availableRoutes(normalized, now);
      const decision = selectAiRoute({
        catalog: catalogs.model,
        operationId,
        productId: normalized.productId,
        requestedModel: normalized.model,
        requiredCapabilities: [],
        usageBounds: normalized.usageBounds,
        maximumSupplierCost: { asset: 'USD', amountAtomic: '1000000000', decimals: 6 },
        routes,
        decidedAt: now,
      });
      if (decision.outcome !== 'selected') throw Object.assign(new Error('ai_route_unavailable'), { status: 503, rejectionCodes: decision.rejectionCodes });
      const selected = routes.find(({ definition }) => definition.routeId === decision.selectedRouteId);
      if (selected === undefined || decision.maximumSupplierCost === undefined) throw new TypeError('ai_public_route_selection_invalid');
      const charge = estimateAiSupplierCost(normalized.usageBounds, selected.customerPricing);
      return Object.freeze({
        catalog: catalogs.model,
        routes,
        decision,
        selected,
        pricing: Object.freeze({
          priceVersion: `ai-${selected.priceVersion}-${selected.definition.routeId}`.slice(0, 128),
          maximumCharge: Object.freeze({ asset: 'USDC', amountAtomic: (BigInt(charge.amountAtomic) > 0n ? charge.amountAtomic : '1'), decimals: 6 }),
          supplierCost: Object.freeze({ asset: 'usd', amountAtomic: decision.maximumSupplierCost.amountAtomic, decimals: 6 }),
        }),
      });
    },
  });
}
