import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ClervoAiGatewayAdapter } from '../../../dist/adapters/ai/src/clervo-ai-gateway.js';
import { createBoundedAiHttpTransport, OpenAiCompatibleAdapter } from '../../../dist/adapters/ai/src/openai-compatible.js';
import {
  AuthenticatedQualifiedAiSupplyCatalogSource,
  InMemoryQualifiedAiSupplyRevisionStateStore,
  RevisionGuardedQualifiedAiSupplyCatalogSource,
  StaticQualifiedAiSupplyCatalogSource,
} from '../../../dist/services/ai/src/catalog-source.js';
import { composeAiProductCatalog } from '../../../dist/services/ai/src/product-catalog.js';
import { createAiProductRuntimeProjection, createDynamicAiPublicPricing } from '../../../dist/services/ai/src/product-runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function catalogJson(name) {
  return JSON.parse(await readFile(path.join(root, 'packages/catalog', name), 'utf8'));
}

function required(env, name, minimum = 8) {
  const value = env[name];
  if (typeof value !== 'string' || value.length < minimum || value.length > 8_192 || /[\r\n]/u.test(value)) throw new TypeError(`ai_dynamic_runtime_${name.toLowerCase()}_invalid`);
  return value;
}

function applyH4ProductPolicy({ supplyCatalog, identityRegistry, policy }) {
  if (policy?.schemaVersion !== 'clervo.ai-h4-product-policy.v1' || !Array.isArray(policy.temporarilyUnavailableModelIds) || policy.aliases === null || typeof policy.aliases !== 'object' || Array.isArray(policy.aliases) || policy.capabilityOverrides === null || typeof policy.capabilityOverrides !== 'object' || Array.isArray(policy.capabilityOverrides)) throw new TypeError('ai_h4_product_policy_invalid');
  const entryBySupply = new Map(identityRegistry.entries.map((entry) => [entry.gatewaySupplyId, entry]));
  const modelIds = new Set(identityRegistry.entries.map(({ customerModelId }) => customerModelId));
  const unavailable = new Set(policy.temporarilyUnavailableModelIds);
  const exactEquivalentIds = new Set((policy.exactEquivalentRoutes ?? []).map(({ customerModelId }) => customerModelId));
  if (unavailable.size !== policy.temporarilyUnavailableModelIds.length) throw new TypeError('ai_h4_product_policy_model_invalid');
  const configuredAliases = Object.entries(policy.aliases);
  if (configuredAliases.length !== 4 || configuredAliases.some(([alias, target]) => !['clervo/fast', 'clervo/smart', 'clervo/code', 'clervo/deep'].includes(alias) || typeof target !== 'string' || unavailable.has(target))) throw new TypeError('ai_h4_product_policy_alias_invalid');
  const aliases = configuredAliases.filter(([, target]) => modelIds.has(target));
  const rewrittenEntries = identityRegistry.entries.map((entry) => ({
    ...entry,
    aliases: aliases.filter(([, target]) => target === entry.customerModelId).map(([alias]) => alias).sort(),
  }));
  const models = supplyCatalog.models.map((model) => {
    const identity = entryBySupply.get(model.gatewaySupplyId);
    if (identity === undefined) return model;
    const override = policy.capabilityOverrides[identity.customerModelId];
    if (override !== undefined && (!Array.isArray(override) || override.length === 0)) throw new TypeError('ai_h4_product_policy_capabilities_invalid');
    return {
      ...model,
      ...(override === undefined ? {} : { capabilities: override }),
      ...(unavailable.has(identity.customerModelId) ? {
        availability: {
          state: 'unavailable',
          reason: 'temporarily_unavailable',
          observedAt: model.availability.observedAt,
        },
      } : exactEquivalentIds.has(identity.customerModelId) ? { availability: { state: 'available', reason: null, observedAt: model.availability.observedAt } } : {}),
    };
  });
  return Object.freeze({
    supplyCatalog: Object.freeze({ ...supplyCatalog, models: Object.freeze(models) }),
    identityRegistry: Object.freeze({ ...identityRegistry, revision: `h4:${policy.revision}`, entries: Object.freeze(rewrittenEntries) }),
  });
}

function exactEquivalentAdapter({ routeId, customerModelId, providerModelId, secretName, transport, secret, onClock }) {
  const delegate = new OpenAiCompatibleAdapter({
    config: { routeId, baseUrl: 'https://api.groq.com/openai/v1/', allowedHosts: ['api.groq.com'], secretName, exactModelId: providerModelId, productId: 'ai.chat', maximumResponseBytes: 1_000_000 },
    transport, secret, clock: onClock,
  });
  return Object.freeze({
    routeId,
    sourceId: 'groq',
    async execute(input) {
      if (input.runtimeModelId !== customerModelId || input.exactModelId !== customerModelId || input.routeId !== routeId) throw new TypeError('ai_exact_equivalent_binding_invalid');
      const execution = await delegate.execute({
        request: input.request,
        exactModelId: providerModelId,
        signal: input.signal,
        ...(input.onEvent === undefined ? {} : {
          onEvent(event) {
            input.onEvent(event.type === 'response.started'
              ? Object.freeze({ ...event, modelIdentity: customerModelId, providerModelIdentity: providerModelId })
              : event);
          },
        }),
      });
      if (execution.modelIdentity !== providerModelId) throw new TypeError('ai_exact_equivalent_identity_mismatch');
      return Object.freeze({ ...execution, modelIdentity: customerModelId, providerModelIdentity: providerModelId });
    },
  });
}

export async function createDynamicAiProductionRuntime({
  env = process.env,
  fetcher = globalThis.fetch,
  catalogSource,
  identityRegistry,
  pricingPolicies,
  competitorEvidence,
  commercialPermissions,
  strategicOverrides,
  commercialPricingAuthority,
  artifactStore,
  artifactStoreFactory,
  clock = () => new Date().toISOString(),
} = {}) {
  if (typeof fetcher !== 'function' || typeof clock !== 'function') throw new TypeError('ai_dynamic_runtime_configuration_invalid');
  if (artifactStoreFactory !== undefined && typeof artifactStoreFactory !== 'function') throw new TypeError('ai_dynamic_runtime_artifact_store_factory_invalid');
  const baseUrl = new URL(required(env, 'CLERVO_AI_BASE_URL'));
  if (baseUrl.protocol !== 'https:' || baseUrl.hostname !== 'ai.clervo.dev' || baseUrl.username !== '' || baseUrl.password !== '' || baseUrl.search !== '' || baseUrl.hash !== '') throw new TypeError('ai_dynamic_runtime_base_url_invalid');
  const runtimeSecretName = typeof env.CLERVO_AI_GATEWAY_TOKEN === 'string' ? 'CLERVO_AI_GATEWAY_TOKEN' : 'CLERVO_AI_API_KEY';
  required(env, runtimeSecretName);
  const source = catalogSource ?? new RevisionGuardedQualifiedAiSupplyCatalogSource(
    env.CLERVO_AI_CATALOG_URL === undefined
      ? new StaticQualifiedAiSupplyCatalogSource(await catalogJson('ai-b7-qualified-supply.v1.json'))
      : new AuthenticatedQualifiedAiSupplyCatalogSource({
        endpoint: required(env, 'CLERVO_AI_CATALOG_URL'),
        allowedHosts: ['ai.clervo.dev'],
        credential: async () => required(env, 'CLERVO_AI_CATALOG_TOKEN'),
        fetcher,
      }),
    new InMemoryQualifiedAiSupplyRevisionStateStore(),
  );
  if (typeof source?.load !== 'function') throw new TypeError('ai_dynamic_runtime_catalog_source_invalid');
  const [rawSupplyCatalog, rawRegistry, policies, competitorCatalog, commercialCatalog, strategicCatalog, pricingAuthority, h4Policy] = await Promise.all([
    source.load(),
    identityRegistry ?? catalogJson('ai-b7-customer-identity-registry.v1.json'),
    pricingPolicies ?? catalogJson('ai-product-pricing-policy.v1.json'),
    competitorEvidence === undefined ? catalogJson('ai-competitor-price-evidence.v1.json') : { evidence: competitorEvidence },
    commercialPermissions === undefined ? catalogJson('ai-b7-commercial-permission.v1.json') : { decisions: commercialPermissions },
    strategicOverrides === undefined ? catalogJson('ai-b7-strategic-pricing-overrides.v1.json') : { overrides: strategicOverrides },
    commercialPricingAuthority ?? catalogJson('ai-b7-commercial-pricing.v1.json'),
    catalogJson('ai-h4-product-policy.v1.json'),
  ]);
  const policyProjection = applyH4ProductPolicy({ supplyCatalog: rawSupplyCatalog, identityRegistry: rawRegistry, policy: h4Policy });
  const supplyCatalog = policyProjection.supplyCatalog;
  const registry = policyProjection.identityRegistry;
  const composedAt = clock();
  const productCatalog = composeAiProductCatalog({
    supplyCatalog,
    identityRegistry: registry,
    pricingPolicies: policies,
    competitorEvidence: competitorCatalog.evidence,
    commercialPermissions: commercialCatalog.decisions,
    strategicOverrides: strategicCatalog.overrides,
    composedAt,
  });
  const mediaSellable = productCatalog.internalModels.some(({ publicSellable, productIds }) => publicSellable && productIds.some((productId) => ['ai.image', 'ai.speech', 'ai.video', 'ai.music', 'ai.virtual_try_on'].includes(productId)));
  const resolveArtifactStore = artifactStoreFactory ?? (artifactStore === undefined ? undefined : () => artifactStore);
  if (mediaSellable && resolveArtifactStore === undefined) throw new TypeError('ai_dynamic_runtime_artifact_store_required');
  const projection = createAiProductRuntimeProjection(productCatalog);
  const transport = createBoundedAiHttpTransport(fetcher);
  const makeAdapter = (artifacts) => new ClervoAiGatewayAdapter({
    config: { baseUrl: baseUrl.href, allowedHosts: ['ai.clervo.dev'], secretName: runtimeSecretName, maximumResponseBytes: 80_000_000 },
    transport,
    secret: async (name) => required(env, name),
    ...(artifacts === undefined ? {} : { artifacts }),
    clock,
  });
  const directAdapters = h4Policy.exactEquivalentRoutes.flatMap((route) => {
    const binding = projection.runtimeBindings.find(({ customerModelId }) => customerModelId === route.customerModelId);
    if (binding === undefined) return [];
    if (!binding.executionEligible || route.providerId !== 'provider.groq' || route.secretName !== 'GROQ_API_KEY') throw new TypeError('ai_exact_equivalent_route_invalid');
    if (typeof env[route.secretName] !== 'string') return [];
    required(env, route.secretName);
    return [exactEquivalentAdapter({ routeId: binding.routeId, customerModelId: binding.customerModelId, providerModelId: route.providerModelId, secretName: route.secretName, transport, secret: async (name) => required(env, name), onClock: clock })];
  });
  const adapters = Object.freeze([...directAdapters, makeAdapter(artifactStore)]);
  const freeTierPolicy = Object.freeze({
    revision: pricingAuthority.revision,
    enabled: pricingAuthority.freeTier.enabled,
    zeroUpstreamCostRequired: true,
    automaticPaidOverageAllowed: false,
    perWalletDailyRequests: pricingAuthority.freeTier.perWalletDailyRequests,
    globalDailyRequests: pricingAuthority.freeTier.globalDailyRequests,
    validUntil: pricingAuthority.validUntil,
  });
  return Object.freeze({
    supplyAuthority: 'qualified_ai_supply_catalog',
    sourceRevision: productCatalog.sourceRevision,
    productCatalog,
    runtimeBindings: projection.runtimeBindings,
    publicPricing: createDynamicAiPublicPricing(projection),
    freeTierPolicy,
    adapters,
    async ready() {
      try {
        const checks = [
          fetcher(new URL('models', baseUrl).href, {
          method: 'GET',
          headers: { accept: 'application/json', authorization: `Bearer ${required(env, runtimeSecretName)}` },
          redirect: 'error',
          signal: AbortSignal.timeout(5_000),
          }),
          ...(directAdapters.length === 0 ? [] : [fetcher('https://api.groq.com/openai/v1/models', { method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${required(env, 'GROQ_API_KEY')}` }, redirect: 'error', signal: AbortSignal.timeout(5_000) })]),
        ];
        const responses = await Promise.all(checks);
        await Promise.all(responses.map((response) => response.body?.cancel()));
        return responses.every(({ status }) => status === 200);
      } catch { return false; }
    },
    ...(resolveArtifactStore === undefined ? {} : {
      adapterFactory(authorization) {
        const store = resolveArtifactStore(authorization);
        if (!store || typeof store.put !== 'function') throw new TypeError('ai_dynamic_runtime_artifact_store_invalid');
        return Object.freeze([...directAdapters, makeAdapter(store)]);
      },
    }),
    families: Object.freeze(['qualified_ai_supply_catalog']),
  });
}
