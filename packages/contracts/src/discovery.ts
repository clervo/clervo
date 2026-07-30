import { CONTRACT_VERSION } from './types.js';

export const DISCOVERY_VERSION = '2026-07-30.1' as const;
export const PUBLIC_ORIGIN = 'https://api.clervo.dev' as const;

export interface OpenApiDocument {
  openapi: '3.1.1';
  jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema';
  info: {
    title: string;
    version: typeof CONTRACT_VERSION;
    description: string;
  };
  paths: Record<string, never>;
  components: { schemas: Record<string, Record<string, unknown>> };
  'x-clervo-status': {
    lifecycle: 'contract_preview';
    callable: false;
    paymentImplemented: false;
    deploymentVerified: false;
  };
}

export interface DiscoveryDocument {
  discoveryVersion: typeof DISCOVERY_VERSION;
  contractVersion: typeof CONTRACT_VERSION;
  name: 'Clervo Next';
  description: string;
  lifecycle: 'contract_preview';
  callable: false;
  payment: {
    protocol: 'x402';
    implemented: false;
    settlementVerified: false;
  };
  artifacts: {
    openapi: string;
    llms: string;
    schemas: string;
  };
  products: [];
  limitations: string[];
}

export function createOpenApiDocument(schemas: Record<string, Record<string, unknown>>): OpenApiDocument {
  return {
    openapi: '3.1.1',
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: {
      title: 'Clervo Next contract preview',
      version: CONTRACT_VERSION,
      description: 'Generated repository-local contract documentation. No callable product API or payment flow is claimed.',
    },
    paths: {},
    components: { schemas },
    'x-clervo-status': {
      lifecycle: 'contract_preview',
      callable: false,
      paymentImplemented: false,
      deploymentVerified: false,
    },
  };
}

export function createDiscoveryDocument(): DiscoveryDocument {
  return {
    discoveryVersion: DISCOVERY_VERSION,
    contractVersion: CONTRACT_VERSION,
    name: 'Clervo Next',
    description: 'Machine-readable preview of Clervo Next contracts. Products and payment execution are not available yet.',
    lifecycle: 'contract_preview',
    callable: false,
    payment: {
      protocol: 'x402',
      implemented: false,
      settlementVerified: false,
    },
    artifacts: {
      openapi: `${PUBLIC_ORIGIN}/openapi.json`,
      llms: `${PUBLIC_ORIGIN}/llms.txt`,
      schemas: `${PUBLIC_ORIGIN}/schemas/${CONTRACT_VERSION}/`,
    },
    products: [],
    limitations: [
      'No product HTTP handlers are implemented.',
      'No catalog product is published or callable.',
      'No x402 verification or settlement flow is implemented.',
      'No production deployment is verified.',
    ],
  };
}

export function createLlmsText(): string {
  return [
    '# Clervo Next',
    '',
    '> Contract preview for a clean-room x402 capability marketplace. It is not a live or callable service.',
    '',
    'Important status:',
    '',
    '- Lifecycle: contract_preview',
    '- Callable products: none',
    '- x402 payment implementation: not implemented',
    '- Production deployment: not verified',
    '',
    '## Machine-readable contracts',
    '',
    `- [OpenAPI contract preview](${PUBLIC_ORIGIN}/openapi.json): OpenAPI 3.1.1 document with no callable paths.`,
    `- [Discovery document](${PUBLIC_ORIGIN}/.well-known/clervo.json): Explicit capability and availability status.`,
    `- [JSON Schemas](${PUBLIC_ORIGIN}/schemas/${CONTRACT_VERSION}/): Draft 2020-12 operation, catalog, adapter, receipt, and audit contracts.`,
    '',
    '## Optional',
    '',
    '- Product, SDK, MCP, quickstart, and payment documentation will be added only after their implementation tickets pass.',
    '',
  ].join('\n');
}

export function assertPreviewArtifacts(openapi: OpenApiDocument, discovery: DiscoveryDocument, llms: string): void {
  const failures: string[] = [];
  if (Object.keys(openapi.paths).length > 0) failures.push('openapi_paths_must_be_empty');
  if (openapi['x-clervo-status'].callable) failures.push('openapi_must_not_claim_callable');
  if (openapi['x-clervo-status'].paymentImplemented) failures.push('openapi_must_not_claim_payment');
  if (openapi['x-clervo-status'].deploymentVerified) failures.push('openapi_must_not_claim_deployment');
  if (discovery.callable) failures.push('discovery_must_not_claim_callable');
  if (discovery.payment.implemented) failures.push('discovery_must_not_claim_payment');
  if (discovery.payment.settlementVerified) failures.push('discovery_must_not_claim_settlement');
  if (discovery.products.length > 0) failures.push('discovery_products_must_be_empty');
  if (!llms.includes('Callable products: none')) failures.push('llms_missing_non_callable_status');
  if (!llms.includes('x402 payment implementation: not implemented')) failures.push('llms_missing_payment_status');
  if (failures.length > 0) throw new TypeError(`unsafe discovery preview: ${failures.join(', ')}`);
}