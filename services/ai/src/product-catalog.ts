import {
  assignAiCustomerIdentities,
  parseAiCustomerIdentityRegistry,
  parseQualifiedAiSupplyCatalog,
  productIdsForSupplyModel,
  type AiCustomerIdentityEntry,
  type AiCustomerIdentityRegistry,
  type AiProductId,
  type AiRoutePricing,
  type AiSupplyModality,
  type QualifiedAiSupplyCatalog,
  type QualifiedAiSupplyModel,
} from '../../../packages/contracts/src/index.js';

export const aiPricingRateKeys = [
  'inputTokenMicrosPerMillion',
  'cachedInputTokenMicrosPerMillion',
  'outputTokenMicrosPerMillion',
  'reasoningTokenMicrosPerMillion',
  'imageMicrosEach',
  'audioMicrosPerThousandCharacters',
  'videoMicrosPerSecond',
  'musicMicrosPerGeneration',
  'virtualTryOnMicrosPerImage',
] as const;
export type AiPricingRateKey = (typeof aiPricingRateKeys)[number];

export interface AiPricingPolicy {
  policyId: string;
  minimumMarginBasisPoints: number;
  targetMarginBasisPoints: number;
  competitorUndercutBasisPoints: number;
}

export interface AiPricingPolicyCatalog {
  revision: string;
  observedAt: string;
  validUntil: string;
  defaultPolicy: Readonly<AiPricingPolicy>;
  modalityPolicies?: Readonly<Partial<Record<AiSupplyModality, Readonly<AiPricingPolicy>>>>;
  marketModelPolicies?: readonly Readonly<{ marketModelId: string; policy: Readonly<AiPricingPolicy> }>[];
}

export interface AiCompetitorPriceEvidence {
  competitor: string;
  marketModelId: string;
  pricing: Readonly<{ currency: 'USD'; decimals: 6 } & Partial<Record<AiPricingRateKey, number>>>;
  source: string;
  observedAt: string;
  validUntil: string;
  confidence: 'verified' | 'unverified';
}

export interface AiCommercialPermissionDecision {
  gatewaySupplyId: string;
  state: 'approved' | 'denied' | 'unresolved';
  ownerDecisionRef: string | null;
  observedAt: string;
  validUntil: string;
}

export interface AiStrategicPricingOverride {
  gatewaySupplyId: string;
  customerPricing: Readonly<AiRoutePricing>;
  maximumSubsidy: Readonly<AiRoutePricing>;
  ownerAuthorizationRef: string;
  budgetRef: string;
  startsAt: string;
  expiresAt: string;
}

export interface AiPrivateRuntimeBinding {
  routeId: string;
  customerModelId: string;
  gatewaySupplyId: string;
  runtimeModelId: string;
  productIds: readonly AiProductId[];
  executionEligible: boolean;
}

export interface AiInternalProductModel {
  identity: Readonly<AiCustomerIdentityEntry>;
  supply: Readonly<QualifiedAiSupplyModel>;
  productIds: readonly AiProductId[];
  lifecycle: 'available' | 'degraded' | 'paused' | 'withdrawn';
  publicSellable: boolean;
  publicationBlockers: readonly string[];
  pricing: Readonly<AiProductPricingDecision>;
  commercialPermission: 'approved' | 'denied' | 'unresolved' | 'stale';
}

export interface AiPublicProductModel {
  modelId: string;
  identityKind: 'canonical' | 'alias';
  aliasFor?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  aliases: readonly string[];
  name: string;
  description?: string;
  productIds: readonly AiProductId[];
  capabilities: readonly string[];
  inputTypes: readonly string[];
  outputTypes: readonly string[];
  limits: Readonly<{ contextTokens?: number; maximumOutputTokens?: number }>;
  lifecycle: 'available' | 'degraded' | 'paused' | 'withdrawn';
  availability: 'available' | 'degraded' | 'unavailable' | 'withdrawn';
  health: 'healthy' | 'degraded' | 'unavailable';
  publicSellable: boolean;
  publicationBlockers: readonly string[];
  customerPricing: Readonly<AiRoutePricing> | null;
  pricingMethod: string | null;
  competitiveComparison: 'undercut' | 'matched' | 'cost_constrained' | 'unverified' | null;
  billingMode: 'free' | 'metered';
  commerce: Readonly<{
    executionPath: '/v1/ai/execute';
    payment: 'none' | 'x402_or_mpp';
    resultAccounting: 'usage' | 'usage_and_settled_receipt';
    replaySafe: true;
  }>;
}

export interface AiProductPricingDecision {
  state: 'ready' | 'missing_cost' | 'stale_cost' | 'stale_policy' | 'invalid_strategic_override';
  policyId: string | null;
  method: 'cost_policy' | 'competitive_target' | 'strategic_override' | null;
  upstreamCost: Readonly<AiRoutePricing> | null;
  customerPricing: Readonly<AiRoutePricing> | null;
  grossMarginBasisPoints: Readonly<Record<AiPricingRateKey, number>> | null;
  competitor: Readonly<AiCompetitorPriceEvidence> | null;
  competitiveComparison: 'undercut' | 'matched' | 'cost_constrained' | 'unverified' | null;
}

export interface ComposedAiProductCatalog {
  catalogRevision: string;
  composedAt: string;
  sourceRevision: string;
  sourceValidUntil: string;
  identityRegistry: Readonly<AiCustomerIdentityRegistry>;
  internalModels: readonly Readonly<AiInternalProductModel>[];
  privateRuntimeBindings: readonly Readonly<AiPrivateRuntimeBinding>[];
  publicModels: readonly Readonly<AiPublicProductModel>[];
}

export interface AiPublicModelList {
  object: 'list';
  data: readonly Readonly<{
    id: string;
    object: 'model';
    owned_by: 'clervo';
    clervo: Omit<AiPublicProductModel, 'modelId'>;
  }>[];
  clervo: Readonly<{ catalogRevision: string; composedAt: string; sourceValidUntil: string; inventory: Readonly<{ canonicalModels: number; aliases: number; callableIds: number }> }>;
}

export interface AiPublicDiscoveryProjection {
  schemaVersion: 'clervo-ai-discovery.v1';
  catalogRevision: string;
  generatedAt: string;
  modelsPath: '/v1/models';
  executionPath: '/v1/ai/execute';
  inventory: Readonly<{ catalogued: number; sellable: number; canonicalModels: number; aliases: number; callableIds: number; byProduct: Readonly<Record<AiProductId, number>> }>;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    for (const entry of value) freezeDeep(entry);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) freezeDeep(entry);
    return Object.freeze(value);
  }
  return value;
}

function timestamp(value: string, code: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result) || new Date(result).toISOString() !== value) throw new TypeError(code);
  return result;
}

function validatePricing(pricing: Readonly<AiRoutePricing>, code: string): void {
  if (pricing.currency !== 'USD' || pricing.decimals !== 6) throw new TypeError(code);
  for (const key of aiPricingRateKeys) if (!Number.isSafeInteger(pricing[key]) || pricing[key] < 0 || pricing[key] > 1_000_000_000_000) throw new TypeError(code);
}

function normalizedPricing(pricing: Readonly<AiRoutePricing>): Readonly<AiRoutePricing> {
  return fullPricing(Object.fromEntries(aiPricingRateKeys.map((key) => [key, pricing[key] ?? 0])) as Record<AiPricingRateKey, number>);
}

function validateCompetitorPricing(pricing: Readonly<AiCompetitorPriceEvidence['pricing']>): void {
  if (pricing.currency !== 'USD' || pricing.decimals !== 6) throw new TypeError('ai_competitor_pricing_invalid');
  const observedRates = aiPricingRateKeys.filter((key) => pricing[key] !== undefined);
  if (observedRates.length === 0) throw new TypeError('ai_competitor_pricing_empty');
  for (const key of observedRates) {
    const value = pricing[key];
    if (!Number.isSafeInteger(value) || value! < 0 || value! > 1_000_000_000_000) throw new TypeError('ai_competitor_pricing_invalid');
  }
}

function validatePolicy(policy: Readonly<AiPricingPolicy>): void {
  if (!/^[a-z][a-z0-9._-]{2,127}$/u.test(policy.policyId)) throw new TypeError('ai_pricing_policy_id_invalid');
  for (const value of [policy.minimumMarginBasisPoints, policy.targetMarginBasisPoints, policy.competitorUndercutBasisPoints]) if (!Number.isSafeInteger(value) || value < 0 || value > 9_500) throw new TypeError('ai_pricing_policy_basis_points_invalid');
  if (policy.targetMarginBasisPoints < policy.minimumMarginBasisPoints) throw new TypeError('ai_pricing_policy_margin_order_invalid');
}

function validatePolicyCatalog(catalog: Readonly<AiPricingPolicyCatalog>, now: number): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u.test(catalog.revision)) throw new TypeError('ai_pricing_policy_revision_invalid');
  const observedAt = timestamp(catalog.observedAt, 'ai_pricing_policy_observed_at_invalid');
  const validUntil = timestamp(catalog.validUntil, 'ai_pricing_policy_valid_until_invalid');
  if (observedAt > now || validUntil <= observedAt) throw new TypeError('ai_pricing_policy_window_invalid');
  validatePolicy(catalog.defaultPolicy);
  for (const policy of Object.values(catalog.modalityPolicies ?? {})) if (policy !== undefined) validatePolicy(policy);
  const overrides = catalog.marketModelPolicies ?? [];
  if (new Set(overrides.map(({ marketModelId }) => marketModelId)).size !== overrides.length) throw new TypeError('ai_pricing_market_policy_duplicate');
  for (const override of overrides) {
    if (override.marketModelId.length === 0 || override.marketModelId.length > 160) throw new TypeError('ai_pricing_market_model_invalid');
    validatePolicy(override.policy);
  }
}

function priceAtMargin(cost: number, marginBasisPoints: number): number {
  if (cost === 0) return 0;
  const numerator = BigInt(cost) * 10_000n;
  const denominator = BigInt(10_000 - marginBasisPoints);
  const result = (numerator + denominator - 1n) / denominator;
  if (result > 1_000_000_000_000n) throw new TypeError('ai_customer_price_overflow');
  return Number(result);
}

function fullPricing(rates: Readonly<Record<AiPricingRateKey, number>>): Readonly<AiRoutePricing> {
  return freezeDeep({ currency: 'USD' as const, decimals: 6 as const, ...rates });
}

function marginBasisPoints(cost: number, price: number): number {
  if (cost === 0 && price === 0) return 0;
  if (price === 0 || price < cost) return -10_000;
  return Number((BigInt(price - cost) * 10_000n) / BigInt(price));
}

function selectPolicy(model: Readonly<QualifiedAiSupplyModel>, catalog: Readonly<AiPricingPolicyCatalog>): Readonly<AiPricingPolicy> {
  const marketOverride = model.marketModelId === undefined ? undefined : catalog.marketModelPolicies?.find(({ marketModelId }) => marketModelId === model.marketModelId)?.policy;
  return marketOverride ?? catalog.modalityPolicies?.[model.modalities[0]!] ?? catalog.defaultPolicy;
}

function competitorFor(input: {
  model: Readonly<QualifiedAiSupplyModel>;
  evidence: readonly Readonly<AiCompetitorPriceEvidence>[];
  now: number;
}): Readonly<AiCompetitorPriceEvidence> | null {
  if (input.model.marketModelId === undefined) return null;
  const matches = input.evidence.filter((entry) => entry.marketModelId === input.model.marketModelId && entry.confidence === 'verified');
  if (matches.length > 1) throw new TypeError('ai_competitor_evidence_ambiguous');
  const entry = matches[0];
  if (entry === undefined) return null;
  validateCompetitorPricing(entry.pricing);
  const observedAt = timestamp(entry.observedAt, 'ai_competitor_observed_at_invalid');
  const validUntil = timestamp(entry.validUntil, 'ai_competitor_valid_until_invalid');
  if (observedAt > input.now || validUntil <= observedAt || validUntil <= input.now) return null;
  if (!/^https:\/\//u.test(entry.source)) throw new TypeError('ai_competitor_source_invalid');
  return entry;
}

function pricingDecision(input: {
  model: Readonly<QualifiedAiSupplyModel>;
  policyCatalog: Readonly<AiPricingPolicyCatalog>;
  competitorEvidence: readonly Readonly<AiCompetitorPriceEvidence>[];
  strategicOverrides: readonly Readonly<AiStrategicPricingOverride>[];
  now: number;
}): Readonly<AiProductPricingDecision> {
  const policy = selectPolicy(input.model, input.policyCatalog);
  if (timestamp(input.policyCatalog.validUntil, 'ai_pricing_policy_valid_until_invalid') <= input.now) return freezeDeep({ state: 'stale_policy', policyId: policy.policyId, method: null, upstreamCost: null, customerPricing: null, grossMarginBasisPoints: null, competitor: null, competitiveComparison: null });
  const cost = input.model.upstreamCost;
  if (cost.state !== 'known' || cost.pricing === null || cost.validUntil === null) return freezeDeep({ state: 'missing_cost', policyId: policy.policyId, method: null, upstreamCost: null, customerPricing: null, grossMarginBasisPoints: null, competitor: null, competitiveComparison: null });
  if (timestamp(cost.validUntil, 'ai_upstream_cost_valid_until_invalid') <= input.now) return freezeDeep({ state: 'stale_cost', policyId: policy.policyId, method: null, upstreamCost: cost.pricing, customerPricing: null, grossMarginBasisPoints: null, competitor: null, competitiveComparison: null });
  validatePricing(cost.pricing, 'ai_upstream_cost_pricing_invalid');

  const competitor = competitorFor({ model: input.model, evidence: input.competitorEvidence, now: input.now });
  const prices = {} as Record<AiPricingRateKey, number>;
  let method: AiProductPricingDecision['method'] = 'cost_policy';
  let comparison: AiProductPricingDecision['competitiveComparison'] = competitor === null ? 'unverified' : 'undercut';
  for (const key of aiPricingRateKeys) {
    const upstream = cost.pricing[key];
    const sustainable = priceAtMargin(upstream, policy.minimumMarginBasisPoints);
    const target = priceAtMargin(upstream, policy.targetMarginBasisPoints);
    if (competitor === null) {
      prices[key] = target;
      continue;
    }
    const market = competitor.pricing[key];
    if (market === undefined) {
      prices[key] = target;
      continue;
    }
    const competitiveTarget = Number((BigInt(market) * BigInt(10_000 - policy.competitorUndercutBasisPoints)) / 10_000n);
    if (competitiveTarget >= sustainable) {
      prices[key] = Math.min(target, competitiveTarget);
      if (prices[key] < market) method = 'competitive_target';
      else if ((upstream > 0 || market > 0) && prices[key] === market && comparison !== 'cost_constrained') comparison = 'matched';
    } else {
      prices[key] = sustainable;
      if (upstream > 0 || market > 0) comparison = 'cost_constrained';
    }
  }

  const overrideMatches = input.strategicOverrides.filter(({ gatewaySupplyId }) => gatewaySupplyId === input.model.gatewaySupplyId);
  if (overrideMatches.length > 1) throw new TypeError('ai_strategic_override_duplicate');
  const override = overrideMatches[0];
  if (override !== undefined) {
    const overrideCustomerPricing = normalizedPricing(override.customerPricing);
    const overrideMaximumSubsidy = normalizedPricing(override.maximumSubsidy);
    validatePricing(overrideCustomerPricing, 'ai_strategic_override_pricing_invalid');
    validatePricing(overrideMaximumSubsidy, 'ai_strategic_override_subsidy_invalid');
    const startsAt = timestamp(override.startsAt, 'ai_strategic_override_starts_at_invalid');
    const expiresAt = timestamp(override.expiresAt, 'ai_strategic_override_expires_at_invalid');
    if (expiresAt <= startsAt || override.ownerAuthorizationRef.length === 0 || override.budgetRef.length === 0) throw new TypeError('ai_strategic_override_authority_invalid');
    if (startsAt <= input.now && input.now < expiresAt) {
      const withinBoundary = aiPricingRateKeys.every((key) => overrideCustomerPricing[key] >= cost.pricing![key] || cost.pricing![key] - overrideCustomerPricing[key] <= overrideMaximumSubsidy[key]);
      if (!withinBoundary) return freezeDeep({ state: 'invalid_strategic_override', policyId: policy.policyId, method: null, upstreamCost: cost.pricing, customerPricing: null, grossMarginBasisPoints: null, competitor, competitiveComparison: comparison });
      for (const key of aiPricingRateKeys) prices[key] = overrideCustomerPricing[key];
      method = 'strategic_override';
    }
  }
  const customerPricing = fullPricing(prices);
  const margins = Object.fromEntries(aiPricingRateKeys.map((key) => [key, marginBasisPoints(cost.pricing![key], customerPricing[key])])) as unknown as Record<AiPricingRateKey, number>;
  if (method !== 'strategic_override' && aiPricingRateKeys.some((key) => customerPricing[key] < cost.pricing![key])) throw new TypeError('ai_negative_margin_uncontrolled');
  return freezeDeep({ state: 'ready', policyId: policy.policyId, method, upstreamCost: cost.pricing, customerPricing, grossMarginBasisPoints: margins, competitor, competitiveComparison: comparison });
}

function commercialDecision(input: {
  supplyId: string;
  decisions: readonly Readonly<AiCommercialPermissionDecision>[];
  now: number;
}): Readonly<{ state: AiInternalProductModel['commercialPermission']; publicHistory: boolean }> {
  const matches = input.decisions.filter(({ gatewaySupplyId }) => gatewaySupplyId === input.supplyId);
  if (matches.length > 1) throw new TypeError('ai_commercial_permission_duplicate');
  const decision = matches[0];
  if (decision === undefined) return Object.freeze({ state: 'unresolved', publicHistory: false });
  const observedAt = timestamp(decision.observedAt, 'ai_commercial_permission_observed_at_invalid');
  const validUntil = timestamp(decision.validUntil, 'ai_commercial_permission_valid_until_invalid');
  if (observedAt > input.now || validUntil <= observedAt) throw new TypeError('ai_commercial_permission_window_invalid');
  if (decision.state === 'approved' && decision.ownerDecisionRef === null) throw new TypeError('ai_commercial_permission_authority_missing');
  if (validUntil <= input.now) return Object.freeze({ state: 'stale', publicHistory: decision.state === 'approved' });
  return Object.freeze({ state: decision.state, publicHistory: decision.state === 'approved' });
}

function publicProjection(model: Readonly<AiInternalProductModel>): Readonly<AiPublicProductModel> {
  const billingMode = model.pricing.customerPricing !== null && aiPricingRateKeys.every((key) => model.pricing.customerPricing![key] === 0) ? 'free' as const : 'metered' as const;
  const availability = model.lifecycle === 'paused' ? 'unavailable' as const : model.lifecycle;
  const health = model.lifecycle === 'available' ? 'healthy' as const : model.lifecycle === 'degraded' ? 'degraded' as const : 'unavailable' as const;
  return freezeDeep({
    modelId: model.identity.customerModelId,
    identityKind: 'canonical' as const,
    aliases: model.identity.aliases,
    name: model.supply.display.name,
    ...(model.supply.display.description === undefined ? {} : { description: model.supply.display.description }),
    productIds: model.productIds,
    capabilities: model.supply.capabilities,
    inputTypes: model.supply.inputTypes,
    outputTypes: model.supply.outputTypes,
    limits: model.supply.limits,
    lifecycle: model.lifecycle,
    availability,
    health,
    publicSellable: model.publicSellable,
    publicationBlockers: model.publicationBlockers,
    customerPricing: model.pricing.customerPricing,
    pricingMethod: model.pricing.method,
    competitiveComparison: model.pricing.competitiveComparison,
    billingMode,
    commerce: {
      executionPath: '/v1/ai/execute' as const,
      payment: billingMode === 'free' ? 'none' as const : 'x402_or_mpp' as const,
      resultAccounting: billingMode === 'free' ? 'usage' as const : 'usage_and_settled_receipt' as const,
      replaySafe: true as const,
    },
  });
}

function publicProjectionForGroup(models: readonly Readonly<AiInternalProductModel>[]): Readonly<AiPublicProductModel> {
  const first = models[0];
  if (first === undefined) throw new TypeError('ai_public_model_group_empty');
  const compatibilityShape = (model: Readonly<AiInternalProductModel>) => JSON.stringify({ productIds: model.productIds, modalities: model.supply.modalities, inputTypes: model.supply.inputTypes, outputTypes: model.supply.outputTypes });
  if (models.some((model) => compatibilityShape(model) !== compatibilityShape(first))) throw new TypeError('ai_customer_identity_supply_incompatible');
  const candidates = [...models].sort((left, right) => {
    if (left.publicSellable !== right.publicSellable) return left.publicSellable ? -1 : 1;
    const leftPrice = left.pricing.customerPricing === null ? Number.POSITIVE_INFINITY : aiPricingRateKeys.reduce((sum, key) => sum + left.pricing.customerPricing![key], 0);
    const rightPrice = right.pricing.customerPricing === null ? Number.POSITIVE_INFINITY : aiPricingRateKeys.reduce((sum, key) => sum + right.pricing.customerPricing![key], 0);
    return leftPrice - rightPrice || left.identity.routeId.localeCompare(right.identity.routeId);
  });
  const representative = candidates[0]!;
  const projected = publicProjection(representative);
  const anySellable = models.some(({ publicSellable }) => publicSellable);
  const lifecycle = anySellable ? 'available' as const
    : models.some(({ lifecycle }) => lifecycle === 'degraded') ? 'degraded' as const
      : models.every(({ lifecycle }) => lifecycle === 'withdrawn') ? 'withdrawn' as const : 'paused' as const;
  return freezeDeep({
    ...projected,
    aliases: [...new Set(models.flatMap(({ identity }) => identity.aliases))].sort(),
    capabilities: [...new Set(models.flatMap(({ supply }) => supply.capabilities))].sort(),
    lifecycle,
    publicSellable: anySellable,
    publicationBlockers: anySellable ? [] : [...new Set(models.flatMap(({ publicationBlockers }) => publicationBlockers))].sort(),
  });
}

export function composeAiProductCatalog(input: {
  supplyCatalog: Readonly<QualifiedAiSupplyCatalog>;
  identityRegistry: Readonly<AiCustomerIdentityRegistry>;
  pricingPolicies: Readonly<AiPricingPolicyCatalog>;
  competitorEvidence?: readonly Readonly<AiCompetitorPriceEvidence>[];
  commercialPermissions?: readonly Readonly<AiCommercialPermissionDecision>[];
  strategicOverrides?: readonly Readonly<AiStrategicPricingOverride>[];
  composedAt: string;
}): Readonly<ComposedAiProductCatalog> {
  const now = timestamp(input.composedAt, 'ai_product_catalog_composed_at_invalid');
  const supplyCatalog = parseQualifiedAiSupplyCatalog(input.supplyCatalog);
  const identityRegistry = parseAiCustomerIdentityRegistry(input.identityRegistry);
  if (now < timestamp(supplyCatalog.generatedAt, 'qualified_ai_supply_catalog_generated_at_invalid')) throw new TypeError('ai_product_catalog_before_supply_generation');
  validatePolicyCatalog(input.pricingPolicies, now);
  const assigned = assignAiCustomerIdentities({ catalog: supplyCatalog, registry: identityRegistry, assignedAt: input.composedAt });
  const catalogStale = timestamp(supplyCatalog.validUntil, 'qualified_ai_supply_catalog_valid_until_invalid') <= now;
  const internalModels: Readonly<AiInternalProductModel>[] = supplyCatalog.models.map((supply) => {
    const identity = assigned.bySupplyId.get(supply.gatewaySupplyId);
    if (identity === undefined) throw new TypeError('ai_customer_identity_assignment_missing');
    const pricing = pricingDecision({ model: supply, policyCatalog: input.pricingPolicies, competitorEvidence: input.competitorEvidence ?? [], strategicOverrides: input.strategicOverrides ?? [], now });
    const permission = commercialDecision({ supplyId: supply.gatewaySupplyId, decisions: input.commercialPermissions ?? [], now });
    const blockers: string[] = [];
    if (catalogStale) blockers.push('supply_snapshot_stale');
    if (supply.qualification.state !== 'qualified') blockers.push(`technical_qualification_${supply.qualification.state}`);
    else if (timestamp(supply.qualification.expiresAt, 'qualified_ai_supply_qualification_expires_at_invalid') <= now) blockers.push('technical_qualification_expired');
    if (supply.availability.state !== 'available') blockers.push(`availability_${supply.availability.state}`);
    if (pricing.state !== 'ready') blockers.push(`pricing_${pricing.state}`);
    if (permission.state !== 'approved') blockers.push(`commercial_permission_${permission.state}`);
    const publicSellable = blockers.length === 0;
    const lifecycle = supply.availability.state === 'withdrawn' ? 'withdrawn' as const
      : supply.availability.state === 'degraded' ? 'degraded' as const
        : publicSellable ? 'available' as const : 'paused' as const;
    return freezeDeep({ identity, supply, productIds: productIdsForSupplyModel(supply), lifecycle, publicSellable, publicationBlockers: blockers, pricing, commercialPermission: permission.state });
  }).sort((left, right) => left.identity.customerModelId.localeCompare(right.identity.customerModelId));
  const privateRuntimeBindings = internalModels.map((model) => freezeDeep({
    routeId: model.identity.routeId,
    customerModelId: model.identity.customerModelId,
    gatewaySupplyId: model.supply.gatewaySupplyId,
    runtimeModelId: model.supply.runtimeModelId,
    productIds: model.productIds,
    executionEligible: !catalogStale
      && model.supply.qualification.state === 'qualified'
      && timestamp(model.supply.qualification.expiresAt, 'qualified_ai_supply_qualification_expires_at_invalid') > now
      && ['available', 'degraded'].includes(model.supply.availability.state),
  }));
  const publicHistoryIds = new Set((input.commercialPermissions ?? []).filter(({ state }) => state === 'approved').map(({ gatewaySupplyId }) => gatewaySupplyId));
  const publicGroups = new Map<string, Readonly<AiInternalProductModel>[]>();
  for (const model of internalModels.filter((candidate) => candidate.commercialPermission === 'approved' || candidate.commercialPermission === 'stale' || publicHistoryIds.has(candidate.supply.gatewaySupplyId))) {
    const group = publicGroups.get(model.identity.customerModelId) ?? [];
    group.push(model);
    publicGroups.set(model.identity.customerModelId, group);
  }
  const publicModels = [...publicGroups.values()].map(publicProjectionForGroup).sort((left, right) => left.modelId.localeCompare(right.modelId));
  return freezeDeep({
    catalogRevision: `b7:${supplyCatalog.catalogRevision}:${assigned.registry.revision}:${input.pricingPolicies.revision}`,
    composedAt: input.composedAt,
    sourceRevision: supplyCatalog.catalogRevision,
    sourceValidUntil: supplyCatalog.validUntil,
    identityRegistry: assigned.registry,
    internalModels,
    privateRuntimeBindings,
    publicModels,
  });
}

export function createAiPublicModelList(catalog: Readonly<ComposedAiProductCatalog>): Readonly<AiPublicModelList> {
  const canonical = catalog.publicModels.map(({ modelId, ...clervo }) => ({ id: modelId, object: 'model' as const, owned_by: 'clervo' as const, clervo }));
  const reasoningByAlias = Object.freeze({ 'clervo/fast': 'low', 'clervo/smart': 'medium', 'clervo/code': 'medium', 'clervo/deep': 'high' } as const);
  const aliases = catalog.publicModels.flatMap((model) => model.aliases.map((alias) => {
    const { modelId, aliases: _aliases, ...target } = model;
    return {
      id: alias,
      object: 'model' as const,
      owned_by: 'clervo' as const,
      clervo: {
        ...target,
        identityKind: 'alias' as const,
        aliasFor: modelId,
        reasoningEffort: reasoningByAlias[alias as keyof typeof reasoningByAlias],
        aliases: [] as string[],
        name: `${alias} service alias`,
        description: `Stable Clervo service alias for ${modelId}. Canonical requests are never silently substituted.`,
        pricingMethod: 'alias_contract',
      },
    };
  }));
  return freezeDeep({
    object: 'list' as const,
    data: [...canonical, ...aliases].sort((left, right) => left.id.localeCompare(right.id)),
    clervo: { catalogRevision: catalog.catalogRevision, composedAt: catalog.composedAt, sourceValidUntil: catalog.sourceValidUntil, inventory: { canonicalModels: canonical.length, aliases: aliases.length, callableIds: canonical.length + aliases.length } },
  });
}

export function createAiPublicDiscoveryProjection(catalog: Readonly<ComposedAiProductCatalog>): Readonly<AiPublicDiscoveryProjection> {
  const byProduct = Object.fromEntries((['ai.chat', 'ai.embed', 'ai.image', 'ai.speech', 'ai.video', 'ai.music', 'ai.virtual_try_on'] as const).map((productId) => [productId, catalog.publicModels.filter(({ productIds }) => productIds.includes(productId)).length])) as Record<AiProductId, number>;
  return freezeDeep({
    schemaVersion: 'clervo-ai-discovery.v1' as const,
    catalogRevision: catalog.catalogRevision,
    generatedAt: catalog.composedAt,
    modelsPath: '/v1/models' as const,
    executionPath: '/v1/ai/execute' as const,
    inventory: { catalogued: catalog.publicModels.length, sellable: catalog.publicModels.filter(({ publicSellable }) => publicSellable).length, canonicalModels: catalog.publicModels.length, aliases: catalog.publicModels.reduce((total, model) => total + model.aliases.length, 0), callableIds: catalog.publicModels.length + catalog.publicModels.reduce((total, model) => total + model.aliases.length, 0), byProduct },
  });
}
