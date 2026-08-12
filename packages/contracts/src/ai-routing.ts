import {
  aiCapabilities,
  verifyAiModelCatalog,
  type AiCapability,
  type AiModelCatalog,
  type AiProductId,
  type AiRouteDefinition,
} from './ai-model.js';
import { hashJson } from './receipt.js';
import type { AssetAmount, JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export const AI_ROUTE_DECISION_SCHEMA_VERSION = 'ai-route-decision.v1' as const;
export const aiAliases = ['clervo/fast', 'clervo/smart', 'clervo/code', 'clervo/deep'] as const;
export type AiAlias = (typeof aiAliases)[number];

export interface AiUsageBounds {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  images: number;
  audioCharacters: number;
  videoSeconds: number;
  musicGenerations: number;
  virtualTryOnImages: number;
}

export interface AiRoutePricing {
  currency: 'USD';
  decimals: 6;
  inputTokenMicrosPerMillion: number;
  cachedInputTokenMicrosPerMillion: number;
  outputTokenMicrosPerMillion: number;
  reasoningTokenMicrosPerMillion: number;
  imageMicrosEach: number;
  audioMicrosPerThousandCharacters: number;
  videoMicrosPerSecond: number;
  musicMicrosPerGeneration: number;
  virtualTryOnMicrosPerImage: number;
}

export const AI_MAXIMUM_AUTHORIZATION_USAGE_BOUNDS: Readonly<AiUsageBounds> = Object.freeze({
  inputTokens: 5_000_000,
  cachedInputTokens: 0,
  outputTokens: 1_000_000,
  reasoningTokens: 1_000_000,
  images: 16,
  audioCharacters: 100_000,
  videoSeconds: 120,
  musicGenerations: 4,
  virtualTryOnImages: 4,
});

export interface AiRuntimeRoute {
  definition: Readonly<AiRouteDefinition>;
  pricing: Readonly<AiRoutePricing>;
  health: 'healthy' | 'degraded' | 'unavailable' | 'unknown';
  circuit: 'closed' | 'open' | 'half_open';
  latencyMsP95: number;
  qualityScore: number;
}

export interface AiRouteDecision {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof AI_ROUTE_DECISION_SCHEMA_VERSION;
  operationId: string;
  productId: AiProductId;
  requestedModel: string;
  selectionKind: 'exact' | 'alias';
  outcome: 'selected' | 'rejected';
  selectedRouteId?: string;
  selectedProviderId?: string;
  selectedExactModelId?: string;
  maximumSupplierCost?: AssetAmount;
  rejectionCodes: readonly string[];
  decidedAt: string;
  decisionHash: string;
}

const aliasCapabilities = {
  'clervo/fast': ['text_input', 'text_output'],
  'clervo/smart': ['text_input', 'text_output', 'structured_output'],
  'clervo/code': ['text_input', 'text_output', 'structured_output', 'tool_calling'],
  'clervo/deep': ['text_input', 'text_output', 'reasoning'],
} as const satisfies Readonly<Record<AiAlias, readonly AiCapability[]>>;

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

function hash(value: object): string {
  return hashJson(value as unknown as JsonValue);
}

function assertTimestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError('ai_routing_timestamp_invalid');
  return parsed;
}

function assertUsage(bounds: AiUsageBounds): void {
  const maxima: Readonly<Record<keyof AiUsageBounds, number>> = {
    inputTokens: 5_000_000,
    cachedInputTokens: 5_000_000,
    outputTokens: 1_000_000,
    reasoningTokens: 1_000_000,
    images: 16,
    audioCharacters: 100_000,
    videoSeconds: 120,
    musicGenerations: 4,
    virtualTryOnImages: 4,
  };
  const optionalLegacyAdditions = new Set<keyof AiUsageBounds>(['videoSeconds', 'musicGenerations', 'virtualTryOnImages']);
  for (const [name, maximum] of Object.entries(maxima) as [keyof AiUsageBounds, number][]) {
    const value = bounds[name];
    if (value === undefined && optionalLegacyAdditions.has(name)) continue;
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new TypeError(`ai_usage_${name}_invalid`);
  }
  if (bounds.cachedInputTokens > bounds.inputTokens) throw new TypeError('ai_cached_input_exceeds_input');
}

function assertPricing(pricing: AiRoutePricing): void {
  if (pricing.currency !== 'USD' || pricing.decimals !== 6) throw new TypeError('ai_pricing_currency_invalid');
  for (const [name, value] of Object.entries(pricing)) {
    if (name === 'currency' || name === 'decimals') continue;
    if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000_000) throw new TypeError(`ai_pricing_${name}_invalid`);
  }
  for (const name of ['inputTokenMicrosPerMillion', 'cachedInputTokenMicrosPerMillion', 'outputTokenMicrosPerMillion', 'reasoningTokenMicrosPerMillion', 'imageMicrosEach', 'audioMicrosPerThousandCharacters'] as const) {
    if (!Number.isSafeInteger(pricing[name])) throw new TypeError(`ai_pricing_${name}_invalid`);
  }
}

function ceilUnits(units: number, rate: number, denominator: bigint): bigint {
  const numerator = BigInt(units) * BigInt(rate);
  return numerator === 0n ? 0n : (numerator + denominator - 1n) / denominator;
}

export function estimateAiSupplierCost(bounds: AiUsageBounds, pricing: AiRoutePricing): AssetAmount {
  assertUsage(bounds);
  assertPricing(pricing);
  const uncachedInput = bounds.inputTokens - bounds.cachedInputTokens;
  const micros = ceilUnits(uncachedInput, pricing.inputTokenMicrosPerMillion, 1_000_000n)
    + ceilUnits(bounds.cachedInputTokens, pricing.cachedInputTokenMicrosPerMillion, 1_000_000n)
    + ceilUnits(bounds.outputTokens, pricing.outputTokenMicrosPerMillion, 1_000_000n)
    + ceilUnits(bounds.reasoningTokens, pricing.reasoningTokenMicrosPerMillion, 1_000_000n)
    + BigInt(bounds.images) * BigInt(pricing.imageMicrosEach)
    + ceilUnits(bounds.audioCharacters, pricing.audioMicrosPerThousandCharacters, 1_000n)
    + BigInt(bounds.videoSeconds ?? 0) * BigInt(pricing.videoMicrosPerSecond ?? 0)
    + BigInt(bounds.musicGenerations ?? 0) * BigInt(pricing.musicMicrosPerGeneration ?? 0)
    + BigInt(bounds.virtualTryOnImages ?? 0) * BigInt(pricing.virtualTryOnMicrosPerImage ?? 0);
  return Object.freeze({ asset: 'USD', amountAtomic: micros.toString(), decimals: 6 });
}

export function reconcileAiSupplierCost(input: {
  reservedMaximum: AssetAmount;
  usage: AiUsageBounds;
  pricing: AiRoutePricing;
}): Readonly<{ actual: AssetAmount; unusedAtomic: string }> {
  if (input.reservedMaximum.asset !== 'USD' || input.reservedMaximum.decimals !== 6 || !/^(?:0|[1-9][0-9]{0,77})$/u.test(input.reservedMaximum.amountAtomic)) throw new TypeError('ai_reserved_cost_invalid');
  const actual = estimateAiSupplierCost(input.usage, input.pricing);
  const reserved = BigInt(input.reservedMaximum.amountAtomic);
  const charged = BigInt(actual.amountAtomic);
  if (charged > reserved) throw new TypeError('ai_supplier_cost_exceeds_reservation');
  return freezeDeep({ actual, unusedAtomic: (reserved - charged).toString() });
}

function selectedDecision(input: {
  operationId: string;
  productId: AiProductId;
  requestedModel: string;
  selectionKind: 'exact' | 'alias';
  route: AiRuntimeRoute;
  maximumSupplierCost: AssetAmount;
  decidedAt: string;
}): Readonly<AiRouteDecision> {
  const unsigned = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_ROUTE_DECISION_SCHEMA_VERSION,
    operationId: input.operationId,
    productId: input.productId,
    requestedModel: input.requestedModel,
    selectionKind: input.selectionKind,
    outcome: 'selected' as const,
    selectedRouteId: input.route.definition.routeId,
    selectedProviderId: input.route.definition.providerId,
    selectedExactModelId: input.route.definition.exactModelId,
    maximumSupplierCost: input.maximumSupplierCost,
    rejectionCodes: [] as string[],
    decidedAt: input.decidedAt,
  };
  return freezeDeep({ ...unsigned, decisionHash: hash(unsigned) });
}

function rejectedDecision(input: {
  operationId: string;
  productId: AiProductId;
  requestedModel: string;
  selectionKind: 'exact' | 'alias';
  rejectionCodes: readonly string[];
  decidedAt: string;
}): Readonly<AiRouteDecision> {
  const unsigned = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_ROUTE_DECISION_SCHEMA_VERSION,
    operationId: input.operationId,
    productId: input.productId,
    requestedModel: input.requestedModel,
    selectionKind: input.selectionKind,
    outcome: 'rejected' as const,
    rejectionCodes: [...new Set(input.rejectionCodes)].sort(),
    decidedAt: input.decidedAt,
  };
  return freezeDeep({ ...unsigned, decisionHash: hash(unsigned) });
}

function candidateFailure(route: AiRuntimeRoute, input: {
  productId: AiProductId;
  requiredCapabilities: readonly AiCapability[];
  evaluatedAtMs: number;
  maximumCostAtomic: bigint;
  usageBounds: AiUsageBounds;
}): string | undefined {
  const definition = route.definition;
  if (definition.qualification.status !== 'passed' || Date.parse(definition.qualification.expiresAt) <= input.evaluatedAtMs) return 'qualification_unavailable';
  if (!definition.productIds.includes(input.productId)) return 'product_unsupported';
  if (input.requiredCapabilities.some((capability) => !definition.capabilities.includes(capability))) return 'capability_unsupported';
  if (route.health === 'unavailable' || route.health === 'unknown') return 'route_unhealthy';
  if (route.circuit === 'open') return 'circuit_open';
  if (!Number.isFinite(route.latencyMsP95) || route.latencyMsP95 < 0 || !Number.isFinite(route.qualityScore) || route.qualityScore < 0 || route.qualityScore > 1) return 'route_metrics_invalid';
  const estimate = estimateAiSupplierCost(input.usageBounds, route.pricing);
  if (BigInt(estimate.amountAtomic) > input.maximumCostAtomic || BigInt(estimate.amountAtomic) > BigInt(definition.qualification.observed.maximumSupplierCost?.amountAtomic ?? '-1')) return 'cost_ceiling_exceeded';
  return undefined;
}

function aliasComparator(alias: AiAlias, usage: AiUsageBounds): (left: AiRuntimeRoute, right: AiRuntimeRoute) => number {
  return (left, right) => {
    const leftCost = BigInt(estimateAiSupplierCost(usage, left.pricing).amountAtomic);
    const rightCost = BigInt(estimateAiSupplierCost(usage, right.pricing).amountAtomic);
    const costCompare = leftCost < rightCost ? -1 : leftCost > rightCost ? 1 : 0;
    const compare = alias === 'clervo/fast'
      ? left.latencyMsP95 - right.latencyMsP95 || costCompare
      : alias === 'clervo/smart' || alias === 'clervo/code' || alias === 'clervo/deep'
        ? right.qualityScore - left.qualityScore || costCompare
        : 0;
    return compare || (left.definition.routeId < right.definition.routeId ? -1 : left.definition.routeId > right.definition.routeId ? 1 : 0);
  };
}

function equivalentSupplyComparator(usage: AiUsageBounds): (left: AiRuntimeRoute, right: AiRuntimeRoute) => number {
  return (left, right) => {
    const leftCost = BigInt(estimateAiSupplierCost(usage, left.pricing).amountAtomic);
    const rightCost = BigInt(estimateAiSupplierCost(usage, right.pricing).amountAtomic);
    const costCompare = leftCost < rightCost ? -1 : leftCost > rightCost ? 1 : 0;
    return costCompare
      || right.qualityScore - left.qualityScore
      || left.latencyMsP95 - right.latencyMsP95
      || left.definition.routeId.localeCompare(right.definition.routeId);
  };
}

export function selectAiRoute(input: {
  catalog: Readonly<AiModelCatalog>;
  operationId: string;
  productId: AiProductId;
  requestedModel: string;
  requiredCapabilities: readonly AiCapability[];
  usageBounds: AiUsageBounds;
  maximumSupplierCost: AssetAmount;
  routes: readonly AiRuntimeRoute[];
  aliasTargets?: Readonly<Partial<Record<AiAlias, string>>>;
  decidedAt: string;
}): Readonly<AiRouteDecision> {
  if (!verifyAiModelCatalog(input.catalog)) throw new TypeError('ai_catalog_invalid');
  if (!/^op_[A-Za-z0-9]{20,64}$/u.test(input.operationId)) throw new TypeError('ai_route_request_invalid');
  if (new Set(input.requiredCapabilities).size !== input.requiredCapabilities.length || input.requiredCapabilities.some((value) => !aiCapabilities.includes(value))) throw new TypeError('ai_required_capabilities_invalid');
  assertUsage(input.usageBounds);
  if (input.maximumSupplierCost.asset !== 'USD' || input.maximumSupplierCost.decimals !== 6 || !/^(?:0|[1-9][0-9]{0,77})$/u.test(input.maximumSupplierCost.amountAtomic)) throw new TypeError('ai_maximum_cost_invalid');
  const decidedAtMs = assertTimestamp(input.decidedAt);
  const selectionKind = aiAliases.includes(input.requestedModel as AiAlias) ? 'alias' as const : 'exact' as const;
  if (selectionKind === 'alias' && input.productId !== 'ai.chat') return rejectedDecision({ ...input, selectionKind, rejectionCodes: ['alias_product_unsupported'] });
  const catalogRoutes = new Map(input.catalog.routes.map((route) => [route.routeId, route]));
  if (new Set(input.routes.map(({ definition }) => definition.routeId)).size !== input.routes.length) throw new TypeError('ai_runtime_routes_duplicate');
  for (const route of input.routes) {
    const catalogRoute = catalogRoutes.get(route.definition.routeId);
    if (catalogRoute === undefined || JSON.stringify(catalogRoute) !== JSON.stringify(route.definition)) throw new TypeError('ai_runtime_route_catalog_mismatch');
  }
  const aliasTarget = selectionKind === 'alias' ? input.aliasTargets?.[input.requestedModel as AiAlias] : undefined;
  const requiredCapabilities = selectionKind === 'alias' && aliasTarget === undefined
    ? [...new Set([...aliasCapabilities[input.requestedModel as AiAlias], ...input.requiredCapabilities])]
    : input.requiredCapabilities;
  const possible = [...(selectionKind === 'exact'
    ? input.routes.filter(({ definition }) => definition.routeId === input.requestedModel || definition.exactModelId === input.requestedModel)
    : aliasTarget === undefined ? input.routes : input.routes.filter(({ definition }) => definition.exactModelId === aliasTarget))].sort((left, right) => left.definition.routeId < right.definition.routeId ? -1 : left.definition.routeId > right.definition.routeId ? 1 : 0);
  if (possible.length === 0) return rejectedDecision({ ...input, selectionKind, rejectionCodes: ['model_not_found'] });
  const failures = possible.map((route) => ({ route, failure: candidateFailure(route, { productId: input.productId, requiredCapabilities, evaluatedAtMs: decidedAtMs, maximumCostAtomic: BigInt(input.maximumSupplierCost.amountAtomic), usageBounds: input.usageBounds }) }));
  const eligible = failures.filter(({ failure }) => failure === undefined).map(({ route }) => route);
  if (eligible.length === 0) return rejectedDecision({ ...input, selectionKind, rejectionCodes: failures.map(({ failure }) => failure ?? 'route_rejected') });
  const routeIdWasRequested = possible.length === 1 && possible[0]?.definition.routeId === input.requestedModel;
  const selected = selectionKind === 'exact'
    ? routeIdWasRequested ? eligible[0] : [...eligible].sort(equivalentSupplyComparator(input.usageBounds))[0]
    : [...eligible].sort(aliasComparator(input.requestedModel as AiAlias, input.usageBounds))[0];
  if (selected === undefined) throw new TypeError('ai_route_selection_invariant');
  return selectedDecision({ ...input, selectionKind, route: selected, maximumSupplierCost: estimateAiSupplierCost(input.usageBounds, selected.pricing) });
}

export function verifyAiRouteDecision(value: AiRouteDecision): boolean {
  try {
    assertTimestamp(value.decidedAt);
    if (value.contractVersion !== CONTRACT_VERSION || value.schemaVersion !== AI_ROUTE_DECISION_SCHEMA_VERSION || !/^op_[A-Za-z0-9]{20,64}$/u.test(value.operationId)) return false;
    if (!['exact', 'alias'].includes(value.selectionKind) || !['selected', 'rejected'].includes(value.outcome)) return false;
    if (value.outcome === 'selected' && (value.selectedRouteId === undefined || value.selectedProviderId === undefined || value.selectedExactModelId === undefined || value.maximumSupplierCost === undefined || value.rejectionCodes.length !== 0)) return false;
    if (value.outcome === 'rejected' && (value.selectedRouteId !== undefined || value.maximumSupplierCost !== undefined || value.rejectionCodes.length === 0)) return false;
    const { decisionHash, ...unsigned } = value;
    return decisionHash === hash(unsigned);
  } catch { return false; }
}
