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

export const DISCOVERY_VERSION = '2026-08-01.3' as const;
export const PUBLIC_ORIGIN = 'https://api.clervo.dev' as const;

export interface OpenApiDocument {
  openapi: '3.1.1';
  jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema';
  info: { title: string; version: typeof CONTRACT_VERSION; description: string };
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, Record<string, unknown>> };
  'x-clervo-status': { lifecycle: 'implemented_unverified'; callable: true; paymentImplemented: false; deploymentVerified: false };
}

export interface DiscoveryProduct {
  productId: SearchProductId;
  title: string;
  summary: string;
  status: 'implemented_unverified';
  deliveryModes: readonly ['sync'];
  selection: { synthesize: boolean };
  pricing: { model: 'fixed'; displayPrice: AssetAmount; maximumChargeRequired: true; priceVersion: string };
  freeEndpoint: string;
  paidEndpoint: string;
  payment: { challengeImplemented: true; payable: false; mockExecutionAvailableByInjectionOnly: true };
}

export interface DiscoveryDocument {
  discoveryVersion: typeof DISCOVERY_VERSION;
  contractVersion: typeof CONTRACT_VERSION;
  name: 'Clervo';
  description: string;
  lifecycle: 'implemented_unverified';
  callable: true;
  payment: { protocol: 'x402'; implemented: false; settlementVerified: false };
  releaseScope: ProductScopeDocument;
  artifacts: { openapi: string; catalog: string; llms: string; schemas: string };
  products: readonly [DiscoveryProduct, DiscoveryProduct];
  limitations: string[];
}

function operation(summary: string, description: string, responses: Record<string, unknown>): Record<string, unknown> {
  return {
    summary,
    description,
    operationId: summary.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_'),
    parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 128 } }],
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SearchHttpRequest' } } } },
    responses,
  };
}

export function createOpenApiDocument(schemas: Record<string, Record<string, unknown>>): OpenApiDocument {
  return {
    openapi: '3.1.1',
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: { title: 'Clervo Platform search contract', version: CONTRACT_VERSION, description: 'Generated repository-local contract for separately priced raw retrieval and synthesized-answer products on the bounded search.query HTTP slice. This privately qualified Search core remains a preview within the future six-pillar Clervo Platform First Revenue Release. Deployment is not verified and public payment is not implemented.' },
    paths: {
      [SEARCH_FREE_PATH]: { post: operation('Execute free search sample', 'Bounded, idempotent free-sample route with an in-memory quota reference implementation.', { 200: { description: 'Search completed', content: { 'application/json': { schema: { $ref: '#/components/schemas/SearchHttpResult' } } } }, 400: { description: 'Invalid request' }, 409: { description: 'Idempotency conflict' }, 429: { description: 'Free quota exceeded' }, 502: { description: 'Search executor failed closed' } }) },
      [SEARCH_PAID_PATH]: { post: operation('Request paid search', 'Returns an explicitly non-payable mock x402 challenge by default. Mock-paid execution exists only through test dependency injection.', { 200: { description: 'Mock-paid test execution completed', content: { 'application/json': { schema: { $ref: '#/components/schemas/SearchHttpResult' } } } }, 400: { description: 'Invalid request' }, 402: { description: 'Non-payable mock payment challenge', headers: { 'PAYMENT-REQUIRED': { schema: { type: 'string', contentEncoding: 'base64' } } }, content: { 'application/json': { schema: { $ref: '#/components/schemas/MockPaymentRequired' } } } }, 409: { description: 'Idempotency conflict' }, 502: { description: 'Mock-paid execution failed closed' } }) },
    },
    components: { schemas },
    'x-clervo-status': { lifecycle: 'implemented_unverified', callable: true, paymentImplemented: false, deploymentVerified: false },
  };
}

export function createDiscoveryDocument(): DiscoveryDocument {
  const product = (productId: SearchProductId, title: string, summary: string, synthesize: boolean): DiscoveryProduct => ({
    productId,
    title,
    summary,
    status: 'implemented_unverified',
    deliveryModes: ['sync'],
    selection: { synthesize },
    pricing: { model: 'fixed', displayPrice: SEARCH_PRODUCT_PRICING[productId].maximumCharge, maximumChargeRequired: true, priceVersion: SEARCH_PRODUCT_PRICING[productId].priceVersion },
    freeEndpoint: `${PUBLIC_ORIGIN}${SEARCH_FREE_PATH}`,
    paidEndpoint: `${PUBLIC_ORIGIN}${SEARCH_PAID_PATH}`,
    payment: { challengeImplemented: true, payable: false, mockExecutionAvailableByInjectionOnly: true },
  });
  return {
    discoveryVersion: DISCOVERY_VERSION,
    contractVersion: CONTRACT_VERSION,
    name: 'Clervo',
    description: 'Machine-readable preview of the implemented repository-local search.query HTTP slice for the future six-pillar Clervo Platform First Revenue Release. Search is privately core-qualified; the other five pillars and the overall product-core gate are not ready, and public deployment and real payment are not verified.',
    lifecycle: 'implemented_unverified',
    callable: true,
    payment: { protocol: 'x402', implemented: false, settlementVerified: false },
    releaseScope: createProductScopeDocument(),
    artifacts: { openapi: `${PUBLIC_ORIGIN}/openapi.json`, catalog: `${PUBLIC_ORIGIN}/catalog.json`, llms: `${PUBLIC_ORIGIN}/llms.txt`, schemas: `${PUBLIC_ORIGIN}/schemas/${CONTRACT_VERSION}/` },
    products: [
      product(SEARCH_RAW_PRODUCT_ID, 'Web search evidence', 'Normalized ranked retrieval evidence without synthesized prose.', false),
      product(SEARCH_SYNTHESIS_PRODUCT_ID, 'Search answer', 'Evidence-grounded synthesized answer with citations.', true),
    ],
    limitations: ['Public deployment is not verified.', 'Real x402 verification, facilitator authorization, and settlement are not implemented.', 'The default paid route is explicitly non-payable and does not execute.', 'The reference free quota is process-local and must be replaced by a durable limiter before production.'],
  };
}

export function createCatalogDocument(): Record<string, unknown> {
  const discovery = createDiscoveryDocument();
  return { contractVersion: CONTRACT_VERSION, catalogVersion: DISCOVERY_VERSION, releaseScope: discovery.releaseScope, products: discovery.products };
}

export function createLlmsText(): string {
  return [
    '# Clervo',
    '',
    '> Clervo is outcome infrastructure for agents. The planned First Revenue Release is the all-six Clervo Platform; Search is privately core-qualified but remains a preview, and the other five product cores are not yet implemented.',
    '',
    'Important status:',
    '',
    '- Lifecycle: implemented_unverified',
    '- First Revenue Release: Clervo Platform',
    '- Required pillars: Search, AI, Secure Sandbox, RPC, Prediction, Crypto Intelligence',
    '- Permanent narrative: Find, Understand, Act',
    '- Search release lifecycle: preview; product core qualified: true (private qualification only)',
    '- AI, Secure Sandbox, RPC, Prediction, and Crypto Intelligence release lifecycle: unavailable; product core qualified: false',
    '- Product core ready: false',
    '- Callable products: search.web, search.answer',
    '- Product selection: synthesize=false selects search.web; synthesize=true selects search.answer',
    '- Free endpoint: POST /v1/search/free',
    '- Paid endpoint: POST /v1/search/paid (non-payable mock challenge by default)',
    '- x402 payment implementation: not implemented',
    '- First Revenue Release ready: false',
    '- Production deployment: not verified',
    '- llms.txt is a documentation map, not a search or AI ranking claim',
    '',
    '## Machine-readable contracts',
    '',
    `- [OpenAPI contract](${PUBLIC_ORIGIN}/openapi.json): Search request, free-sample, and non-payable paid-challenge paths.`,
    `- [Catalog](${PUBLIC_ORIGIN}/catalog.json): Versioned scope plus search.web and search.answer pricing publication.`,
    `- [Discovery document](${PUBLIC_ORIGIN}/.well-known/clervo.json): Explicit release scope, lifecycle, implementation, and payment limitations.`,
    `- [JSON Schemas](${PUBLIC_ORIGIN}/schemas/${CONTRACT_VERSION}/): Draft 2020-12 contracts.`,
    '',
  ].join('\n');
}

export function assertPreviewArtifacts(openapi: OpenApiDocument, discovery: DiscoveryDocument, llms: string): void {
  const failures: string[] = [];
  if (!openapi.paths[SEARCH_FREE_PATH] || !openapi.paths[SEARCH_PAID_PATH]) failures.push('openapi_search_paths_required');
  if (!openapi['x-clervo-status'].callable) failures.push('openapi_must_claim_callable');
  if (openapi['x-clervo-status'].paymentImplemented) failures.push('openapi_must_not_claim_payment');
  if (openapi['x-clervo-status'].deploymentVerified) failures.push('openapi_must_not_claim_deployment');
  const productIds = discovery.products.map(({ productId }) => productId);
  if (!discovery.callable || discovery.products.length !== 2 || !productIds.includes(SEARCH_RAW_PRODUCT_ID) || !productIds.includes(SEARCH_SYNTHESIS_PRODUCT_ID)) failures.push('discovery_search_products_required');
  if (discovery.products.some((product) => product.selection.synthesize !== (product.productId === SEARCH_SYNTHESIS_PRODUCT_ID) || product.pricing.priceVersion !== SEARCH_PRODUCT_PRICING[product.productId].priceVersion || product.pricing.displayPrice.amountAtomic !== SEARCH_PRODUCT_PRICING[product.productId].maximumCharge.amountAtomic)) failures.push('discovery_search_pricing_invalid');
  if (discovery.payment.implemented || discovery.payment.settlementVerified || discovery.products.some((product) => product.payment.payable)) failures.push('discovery_must_not_claim_payment');
  try {
    assertProductScope(discovery.releaseScope);
  } catch {
    failures.push('discovery_product_scope_invalid');
  }
  if (discovery.releaseScope.firstRevenueRelease.ready || discovery.releaseScope.productCore.ready) failures.push('discovery_must_not_claim_release_ready');
  if (!llms.includes('Callable products: search.web, search.answer')) failures.push('llms_missing_callable_products');
  if (!llms.includes('x402 payment implementation: not implemented')) failures.push('llms_missing_payment_status');
  if (failures.length > 0) throw new TypeError(`unsafe discovery artifacts: ${failures.join(', ')}`);
}
