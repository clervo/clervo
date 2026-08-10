import {
  aiQualificationCheckNames,
  createAiModelCatalog,
  createAiRouteQualification,
  estimateAiSupplierCost,
  hashJson,
  selectAiRoute,
  type AiAlias,
  type AiCapability,
  type AiModelCatalog,
  type AiRoutePricing,
  type AiRuntimeRoute,
  type AiUsageBounds,
  type JsonValue,
} from '../../../packages/contracts/src/index.js';
import type {
  AiInternalProductModel,
  ComposedAiProductCatalog,
} from './product-catalog.js';

const maximumUsageBounds: Readonly<AiUsageBounds> = Object.freeze({
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
const minimumChargeAtomic = 1_000n;

function earliest(...values: string[]): string {
  return values.reduce((left, right) => Date.parse(left) <= Date.parse(right) ? left : right);
}

function qualificationChecks(model: Readonly<AiInternalProductModel>) {
  const names = [
    ...aiQualificationCheckNames,
    ...(model.supply.capabilities.includes('streaming') ? ['streaming' as const] : []),
    ...(model.supply.capabilities.includes('structured_output') ? ['structured_output' as const] : []),
  ];
  const evidenceHash = hashJson({ evidenceRef: model.supply.qualification.evidenceRef } as unknown as JsonValue);
  return names.map((name) => Object.freeze({ name, status: 'passed' as const, evidenceHash }));
}

export interface AiProductRuntimeProjection {
  catalog: Readonly<AiModelCatalog> | null;
  routes: readonly Readonly<AiRuntimeRoute & { customerPricing: Readonly<AiRoutePricing>; priceVersion: string }>[];
  runtimeBindings: ComposedAiProductCatalog['privateRuntimeBindings'];
  aliasTargets: Readonly<Partial<Record<AiAlias, string>>>;
}

export function createAiProductRuntimeProjection(catalog: Readonly<ComposedAiProductCatalog>): Readonly<AiProductRuntimeProjection> {
  const sellable = catalog.internalModels.filter(({ publicSellable }) => publicSellable);
  const definitions = sellable.map((model) => {
    if (model.pricing.upstreamCost === null || model.pricing.customerPricing === null) throw new TypeError('ai_product_runtime_pricing_missing');
    const maximumSupplierCost = estimateAiSupplierCost(maximumUsageBounds, model.pricing.upstreamCost);
    const legacyMaximumExpiry = new Date(Date.parse(model.supply.qualification.checkedAt) + 31 * 86_400_000).toISOString();
    const expiresAt = earliest(model.supply.qualification.expiresAt, model.supply.upstreamCost.validUntil!, catalog.sourceValidUntil, legacyMaximumExpiry);
    const qualification = createAiRouteQualification({
      qualificationId: `aiqual_${hashJson({ routeId: model.identity.routeId, sourceRevision: catalog.sourceRevision } as unknown as JsonValue).slice('sha256:'.length, 'sha256:'.length + 32)}`,
      routeId: model.identity.routeId,
      providerId: 'provider.clervo_ai_gateway',
      supplyFamilyId: 'supply.clervo_ai_gateway',
      exactModelId: model.identity.customerModelId,
      productIds: model.productIds,
      checkedAt: model.supply.qualification.checkedAt,
      expiresAt,
      termsStatus: 'approved',
      resaleAllowed: true,
      checks: qualificationChecks(model),
      observed: { modelIdentity: model.identity.customerModelId, maximumSupplierCost },
    }, model.supply.capabilities as readonly AiCapability[]);
    return Object.freeze({
      routeId: model.identity.routeId,
      providerId: 'provider.clervo_ai_gateway',
      supplyFamilyId: 'supply.clervo_ai_gateway',
      exactModelId: model.identity.customerModelId,
      productIds: model.productIds,
      capabilities: model.supply.capabilities,
      requiredSecretNames: ['CLERVO_AI_GATEWAY_TOKEN'],
      quickAiPremium: false,
      qualification,
    });
  });
  const modelCatalog = definitions.length === 0 ? null : createAiModelCatalog({
    catalogId: `aicat_${hashJson({ sourceRevision: catalog.sourceRevision, identities: definitions.map(({ routeId, exactModelId }) => ({ routeId, exactModelId })) } as unknown as JsonValue).slice('sha256:'.length, 'sha256:'.length + 32)}`,
    evaluatedAt: catalog.composedAt,
    routes: definitions,
  });
  const byRoute = new Map(sellable.map((model) => [model.identity.routeId, model]));
  const routes = definitions.map((definition) => {
    const model = byRoute.get(definition.routeId)!;
    return Object.freeze({
      definition,
      pricing: model.pricing.upstreamCost!,
      customerPricing: model.pricing.customerPricing!,
      priceVersion: `${catalog.catalogRevision}:${model.pricing.policyId ?? 'unpriced'}`,
      health: model.supply.availability.state === 'degraded' ? 'degraded' as const : 'healthy' as const,
      circuit: 'closed' as const,
      latencyMsP95: 0,
      qualityScore: model.supply.quality?.score ?? 0.5,
    });
  });
  const aliasTargets = Object.freeze(Object.fromEntries(catalog.publicModels.flatMap((model) => model.aliases.map((alias) => [alias, model.modelId]))) as Partial<Record<AiAlias, string>>);
  return Object.freeze({ catalog: modelCatalog, routes: Object.freeze(routes), runtimeBindings: catalog.privateRuntimeBindings, aliasTargets });
}

export function createDynamicAiPublicPricing(projection: Readonly<AiProductRuntimeProjection>) {
  return Object.freeze({
    quote({ normalized, operationId, now }: { normalized: Readonly<{ model: string; productId: 'ai.chat' | 'ai.embed' | 'ai.image' | 'ai.speech' | 'ai.video' | 'ai.music' | 'ai.virtual_try_on'; usageBounds: AiUsageBounds }>; operationId: string; now: string }) {
      if (projection.catalog === null) throw Object.assign(new Error('ai_route_unavailable'), { status: 503, rejectionCodes: ['commercial_supply_unavailable'] });
      const decision = selectAiRoute({
        catalog: projection.catalog,
        operationId,
        productId: normalized.productId,
        requestedModel: normalized.model,
        requiredCapabilities: [],
        usageBounds: normalized.usageBounds,
        maximumSupplierCost: { asset: 'USD', amountAtomic: estimateAiSupplierCost(maximumUsageBounds, projection.routes.reduce((highest, route) => {
          const left = BigInt(estimateAiSupplierCost(maximumUsageBounds, highest).amountAtomic);
          const right = BigInt(estimateAiSupplierCost(maximumUsageBounds, route.pricing).amountAtomic);
          return right > left ? route.pricing : highest;
        }, projection.routes[0]!.pricing)).amountAtomic, decimals: 6 },
        routes: projection.routes,
        aliasTargets: projection.aliasTargets,
        decidedAt: now,
      });
      if (decision.outcome !== 'selected') throw Object.assign(new Error('ai_route_unavailable'), { status: 503, rejectionCodes: decision.rejectionCodes });
      const selected = projection.routes.find(({ definition }) => definition.routeId === decision.selectedRouteId);
      if (selected === undefined || decision.maximumSupplierCost === undefined) throw new TypeError('ai_dynamic_route_selection_invalid');
      const customer = estimateAiSupplierCost(normalized.usageBounds, selected.customerPricing);
      const atomic = BigInt(customer.amountAtomic);
      const billingMode = Object.entries(selected.customerPricing).every(([key, value]) => ['currency', 'decimals'].includes(key) || value === 0) ? 'free' : 'metered';
      return Object.freeze({
        catalog: projection.catalog,
        routes: projection.routes,
        runtimeBindings: projection.runtimeBindings,
        aliasTargets: projection.aliasTargets,
        decision,
        selected,
        pricing: Object.freeze({
          priceVersion: `ai-dynamic-${selected.priceVersion}`.slice(0, 128),
          billingMode,
          maximumCharge: Object.freeze({ asset: 'USDC', amountAtomic: billingMode === 'free' ? '0' : (atomic > minimumChargeAtomic ? atomic : minimumChargeAtomic).toString(), decimals: 6 }),
          supplierCost: Object.freeze({ asset: 'usd', amountAtomic: decision.maximumSupplierCost.amountAtomic, decimals: 6 }),
        }),
      });
    },
  });
}
