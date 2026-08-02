import {
  SEARCH_FREE_PATH,
  SEARCH_PAID_PATH,
  SEARCH_PRODUCT_PRICING,
  SEARCH_RAW_PRODUCT_ID,
  SEARCH_SYNTHESIS_PRODUCT_ID,
  type SearchProductId,
} from './search-http.js';
import type { AssetAmount } from './types.js';
import { CONTRACT_VERSION } from './types.js';
import { assertProductScope, createProductScopeDocument, type ProductScopeDocument } from './product-scope.js';

export const DISCOVERY_VERSION = '2026-08-02.1' as const;
export const RELEASE_CANDIDATE_ID = 'clervo-private-core-2026-08-02.1' as const;
export const RELEASE_CANDIDATE_INTERFACE_HASH = 'sha256:3a230339f444960f70c69e67c0b32dc600e7af8d7ae6c61101ee82226e536768' as const;

export interface DistributionProjection {
  releaseCandidateId: string;
  interfaceHash: `sha256:${string}`;
  noPublicDistribution: true;
  publicOperationIds: readonly ['search.web', 'search.answer'];
}

export const DEFAULT_DISTRIBUTION_PROJECTION: DistributionProjection = Object.freeze({
  releaseCandidateId: RELEASE_CANDIDATE_ID,
  interfaceHash: RELEASE_CANDIDATE_INTERFACE_HASH,
  noPublicDistribution: true,
  publicOperationIds: [SEARCH_RAW_PRODUCT_ID, SEARCH_SYNTHESIS_PRODUCT_ID] as const,
});

export interface OpenApiDocument {
  openapi: '3.1.1';
  jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema';
  info: { title: string; version: typeof CONTRACT_VERSION; description: string };
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, Record<string, unknown>> };
  'x-clervo-status': {
    lifecycle: 'preview';
    distribution: 'candidate';
    noPublicDistribution: true;
    publicCallable: false;
    paymentImplemented: false;
    deploymentVerified: false;
    releaseCandidateId: string;
    interfaceHash: `sha256:${string}`;
    operationIds: readonly ['search.web', 'search.answer'];
  };
}

export interface DiscoveryProduct {
  productId: SearchProductId;
  operationId: SearchProductId;
  title: string;
  summary: string;
  lifecycle: 'preview';
  publicAvailable: false;
  deliveryModes: readonly ['sync'];
  selection: { synthesize: boolean };
  pricing: {
    model: 'non_payable_mock_fixture';
    displayPrice: AssetAmount;
    maximumChargeRequired: true;
    priceVersion: string;
  };
  routes: { freeSample: typeof SEARCH_FREE_PATH; paidChallenge: typeof SEARCH_PAID_PATH };
  payment: { challengeImplemented: true; payable: false; mockExecutionAvailableByInjectionOnly: true };
}

export interface DiscoveryDocument {
  discoveryVersion: typeof DISCOVERY_VERSION;
  contractVersion: typeof CONTRACT_VERSION;
  name: 'Clervo';
  description: string;
  lifecycle: 'preview';
  distribution: {
    state: 'candidate';
    publicAvailable: false;
    callable: false;
    noPublicDistribution: true;
    releaseCandidateId: string;
    interfaceHash: `sha256:${string}`;
  };
  payment: { protocol: 'x402'; implemented: false; settlementVerified: false };
  releaseScope: ProductScopeDocument;
  artifacts: { openapi: string; catalog: string; llms: string; schemas: string };
  products: readonly [DiscoveryProduct, DiscoveryProduct];
  limitations: string[];
}

function operation(
  operationId: string,
  summary: string,
  description: string,
  responses: Record<string, unknown>,
): Record<string, unknown> {
  return {
    summary,
    description,
    operationId,
    parameters: [{
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', minLength: 8, maxLength: 128 },
    }],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/SearchHttpRequest' } } },
    },
    responses,
  };
}

export function createOpenApiDocument(
  schemas: Record<string, Record<string, unknown>>,
  projection: DistributionProjection = DEFAULT_DISTRIBUTION_PROJECTION,
): OpenApiDocument {
  return {
    openapi: '3.1.1',
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: {
      title: 'Clervo search distribution candidate',
      version: CONTRACT_VERSION,
      description: 'Generated contract candidate for the repository-local search preview. It does not claim a public deployment, public callable service, or payable x402 settlement.',
    },
    paths: {
      [SEARCH_FREE_PATH]: {
        post: operation(
          'searchPreview',
          'Execute a bounded search preview',
          'Repository-local idempotent sample route. It is not a public availability claim.',
          {
            200: { description: 'Preview completed', content: { 'application/json': { schema: { $ref: '#/components/schemas/SearchHttpResult' } } } },
            400: { description: 'Invalid request', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
            409: { description: 'Idempotency conflict', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
            429: { description: 'Preview quota exceeded', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
            502: { description: 'Executor failed closed', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
          },
        ),
      },
      [SEARCH_PAID_PATH]: {
        post: operation(
          'searchPaymentChallenge',
          'Request a non-payable search challenge',
          'Returns an explicitly non-payable mock x402 challenge. Execution exists only through test dependency injection.',
          {
            200: { description: 'Injected mock test execution completed', content: { 'application/json': { schema: { $ref: '#/components/schemas/SearchHttpResult' } } } },
            400: { description: 'Invalid request', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
            402: {
              description: 'Non-payable mock payment challenge',
              headers: { 'PAYMENT-REQUIRED': { schema: { type: 'string', contentEncoding: 'base64' } } },
              content: { 'application/json': { schema: { $ref: '#/components/schemas/MockPaymentRequired' } } },
            },
            409: { description: 'Idempotency conflict', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
            502: { description: 'Mock test execution failed closed', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
          },
        ),
      },
    },
    components: { schemas },
    'x-clervo-status': {
      lifecycle: 'preview',
      distribution: 'candidate',
      noPublicDistribution: projection.noPublicDistribution,
      publicCallable: false,
      paymentImplemented: false,
      deploymentVerified: false,
      releaseCandidateId: projection.releaseCandidateId,
      interfaceHash: projection.interfaceHash,
      operationIds: projection.publicOperationIds,
    },
  };
}

export function createDiscoveryDocument(
  projection: DistributionProjection = DEFAULT_DISTRIBUTION_PROJECTION,
): DiscoveryDocument {
  const product = (
    productId: SearchProductId,
    title: string,
    summary: string,
    synthesize: boolean,
  ): DiscoveryProduct => ({
    productId,
    operationId: productId,
    title,
    summary,
    lifecycle: 'preview',
    publicAvailable: false,
    deliveryModes: ['sync'],
    selection: { synthesize },
    pricing: {
      model: 'non_payable_mock_fixture',
      displayPrice: SEARCH_PRODUCT_PRICING[productId].maximumCharge,
      maximumChargeRequired: true,
      priceVersion: SEARCH_PRODUCT_PRICING[productId].priceVersion,
    },
    routes: { freeSample: SEARCH_FREE_PATH, paidChallenge: SEARCH_PAID_PATH },
    payment: { challengeImplemented: true, payable: false, mockExecutionAvailableByInjectionOnly: true },
  });
  return {
    discoveryVersion: DISCOVERY_VERSION,
    contractVersion: CONTRACT_VERSION,
    name: 'Clervo',
    description: 'Machine-readable distribution candidate derived from the frozen private product core. All six cores are privately qualified; Search remains a repository-local preview, the other five public lifecycles remain unavailable, and no public deployment or real payment is claimed.',
    lifecycle: 'preview',
    distribution: {
      state: 'candidate',
      publicAvailable: false,
      callable: false,
      noPublicDistribution: projection.noPublicDistribution,
      releaseCandidateId: projection.releaseCandidateId,
      interfaceHash: projection.interfaceHash,
    },
    payment: { protocol: 'x402', implemented: false, settlementVerified: false },
    releaseScope: createProductScopeDocument(),
    artifacts: {
      openapi: '/openapi.json',
      catalog: '/catalog.json',
      llms: '/llms.txt',
      schemas: `/schemas/${CONTRACT_VERSION}/`,
    },
    products: [
      product(SEARCH_RAW_PRODUCT_ID, 'Web search evidence', 'Normalized ranked retrieval evidence without synthesized prose.', false),
      product(SEARCH_SYNTHESIS_PRODUCT_ID, 'Search answer', 'Evidence-grounded synthesized answer with citations.', true),
    ],
    limitations: [
      'Public distribution and deployment are not verified.',
      'Real x402 verification, facilitator authorization, and settlement are not implemented.',
      'Published prices in this candidate are explicitly non-payable mock fixtures.',
      'The default paid route does not execute.',
      'The reference free quota is process-local and must be replaced before production.',
      'AI, Secure Sandbox, RPC, Prediction, and Crypto Intelligence remain publicly unavailable.',
    ],
  };
}

export function createCatalogDocument(
  projection: DistributionProjection = DEFAULT_DISTRIBUTION_PROJECTION,
): Record<string, unknown> {
  const discovery = createDiscoveryDocument(projection);
  return {
    contractVersion: CONTRACT_VERSION,
    catalogVersion: DISCOVERY_VERSION,
    distribution: discovery.distribution,
    releaseScope: discovery.releaseScope,
    products: discovery.products,
  };
}

export function createLlmsText(
  projection: DistributionProjection = DEFAULT_DISTRIBUTION_PROJECTION,
): string {
  return [
    '# Clervo',
    '',
    '> Clervo is outcome infrastructure for agents: Find, Understand, Act.',
    '',
    'Current verified status:',
    '',
    '- Distribution state: repository-generated candidate; not publicly distributed',
    `- Frozen release candidate: ${projection.releaseCandidateId}`,
    `- Frozen interface hash: ${projection.interfaceHash}`,
    '- Six product cores: privately qualified and compatibility-frozen',
    '- Public lifecycle: Search preview; AI, Secure Sandbox, RPC, Prediction, and Crypto Intelligence unavailable',
    '- Projected operation IDs: search.web, search.answer',
    '- Public API callable: no',
    '- x402 payment implementation: not implemented',
    '- Production deployment: not verified',
    '- Prices in this candidate: non-payable mock fixtures only',
    '- First Revenue Release ready: no',
    '- llms.txt is a documentation map, not a search or AI ranking claim',
    '',
    '## Repository-generated contracts',
    '',
    '- [OpenAPI contract](/openapi.json): repository-local preview and non-payable challenge routes.',
    '- [Catalog](/catalog.json): exact projected operations and lifecycle limitations.',
    '- [Discovery document](/.well-known/clervo.json): release-candidate binding and distribution status.',
    `- [JSON Schemas](/schemas/${CONTRACT_VERSION}/): projected public-wire contracts.`,
    '',
  ].join('\n');
}

export function assertPreviewArtifacts(
  openapi: OpenApiDocument,
  discovery: DiscoveryDocument,
  llms: string,
  projection: DistributionProjection = DEFAULT_DISTRIBUTION_PROJECTION,
): void {
  const failures: string[] = [];
  if (!openapi.paths[SEARCH_FREE_PATH] || !openapi.paths[SEARCH_PAID_PATH]) failures.push('openapi_search_paths_required');
  const status = openapi['x-clervo-status'];
  if (!status.noPublicDistribution || status.publicCallable || status.paymentImplemented || status.deploymentVerified) failures.push('openapi_distribution_claim_unsafe');
  if (status.releaseCandidateId !== projection.releaseCandidateId || status.interfaceHash !== projection.interfaceHash) failures.push('openapi_release_candidate_binding_invalid');
  if (status.operationIds.join(',') !== projection.publicOperationIds.join(',')) failures.push('openapi_operation_projection_invalid');
  const productIds = discovery.products.map(({ productId }) => productId);
  if (discovery.products.length !== 2 || productIds.join(',') !== projection.publicOperationIds.join(',')) failures.push('discovery_search_products_invalid');
  if (discovery.distribution.publicAvailable || discovery.distribution.callable || !discovery.distribution.noPublicDistribution) failures.push('discovery_distribution_claim_unsafe');
  if (discovery.distribution.releaseCandidateId !== projection.releaseCandidateId || discovery.distribution.interfaceHash !== projection.interfaceHash) failures.push('discovery_release_candidate_binding_invalid');
  if (discovery.products.some((product) =>
    product.publicAvailable
    || product.selection.synthesize !== (product.productId === SEARCH_SYNTHESIS_PRODUCT_ID)
    || product.pricing.model !== 'non_payable_mock_fixture'
    || product.pricing.priceVersion !== SEARCH_PRODUCT_PRICING[product.productId].priceVersion
    || product.pricing.displayPrice.amountAtomic !== SEARCH_PRODUCT_PRICING[product.productId].maximumCharge.amountAtomic
    || product.payment.payable
  )) failures.push('discovery_product_projection_invalid');
  if (discovery.payment.implemented || discovery.payment.settlementVerified) failures.push('discovery_payment_claim_unsafe');
  try {
    assertProductScope(discovery.releaseScope);
  } catch {
    failures.push('discovery_product_scope_invalid');
  }
  if (!discovery.releaseScope.productCore.ready || discovery.releaseScope.firstRevenueRelease.ready) failures.push('discovery_release_scope_invalid');
  if (!discovery.releaseScope.pillars.every(({ coreQualified }) => coreQualified)) failures.push('discovery_private_core_qualification_incomplete');
  if (!llms.includes('Public API callable: no')) failures.push('llms_missing_callable_status');
  if (!llms.includes('x402 payment implementation: not implemented')) failures.push('llms_missing_payment_status');
  if (!llms.includes(projection.interfaceHash)) failures.push('llms_missing_interface_binding');
  if (/\b(?:live service|available now|production-ready)\b/iu.test(llms)) failures.push('llms_unsafe_public_claim');
  if (failures.length > 0) throw new TypeError(`unsafe discovery artifacts: ${failures.join(', ')}`);
}
