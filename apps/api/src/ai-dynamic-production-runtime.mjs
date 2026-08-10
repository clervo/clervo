import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ClervoAiGatewayAdapter } from '../../../dist/adapters/ai/src/clervo-ai-gateway.js';
import { createBoundedAiHttpTransport } from '../../../dist/adapters/ai/src/openai-compatible.js';
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
  const [supplyCatalog, registry, policies, competitorCatalog, commercialCatalog, strategicCatalog, pricingAuthority] = await Promise.all([
    source.load(),
    identityRegistry ?? catalogJson('ai-b7-customer-identity-registry.v1.json'),
    pricingPolicies ?? catalogJson('ai-product-pricing-policy.v1.json'),
    competitorEvidence === undefined ? catalogJson('ai-competitor-price-evidence.v1.json') : { evidence: competitorEvidence },
    commercialPermissions === undefined ? catalogJson('ai-b7-commercial-permission.v1.json') : { decisions: commercialPermissions },
    strategicOverrides === undefined ? catalogJson('ai-b7-strategic-pricing-overrides.v1.json') : { overrides: strategicOverrides },
    commercialPricingAuthority ?? catalogJson('ai-b7-commercial-pricing.v1.json'),
  ]);
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
  const adapters = Object.freeze([makeAdapter(artifactStore)]);
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
        const response = await fetcher(new URL('models', baseUrl).href, {
          method: 'GET',
          headers: { accept: 'application/json', authorization: `Bearer ${required(env, runtimeSecretName)}` },
          redirect: 'error',
          signal: AbortSignal.timeout(5_000),
        });
        await response.body?.cancel();
        return response.status === 200;
      } catch { return false; }
    },
    ...(resolveArtifactStore === undefined ? {} : {
      adapterFactory(authorization) {
        const store = resolveArtifactStore(authorization);
        if (!store || typeof store.put !== 'function') throw new TypeError('ai_dynamic_runtime_artifact_store_invalid');
        return Object.freeze([makeAdapter(store)]);
      },
    }),
    families: Object.freeze(['qualified_ai_supply_catalog']),
  });
}
