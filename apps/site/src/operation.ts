import catalogSource from '../../../generated/public/catalog.json';
import openapiSource from '../../../generated/public/openapi.json';
import pricingSource from '../../../generated/public/pricing.json';
import statusSource from '../../../generated/public/status.json';

import {
  discovery,
  familyOf,
  lifecycleLabels,
  publicStatus,
  observedProduct,
  observedRoutes,
  onboarding,
  proofLabels,
  type LaunchProductId,
} from './product';

export type OperationScenario = 'verified' | 'refused' | 'unresolved';

interface PricingOffer {
  productId: string;
  publicAvailable: boolean;
  model: string;
  displayPrice: { asset: string; amountAtomic: string; decimals: number } | null;
  maximumChargeRequired: boolean;
  priceVersion: string;
}

interface PricingDocument {
  schemaVersion: string;
  observedAt: string;
  publicOfferAvailable: boolean;
  publicPrice: {
    productId: string;
    network: string;
    asset: string;
    amountAtomic: string;
    decimals: number;
    amountDisplay: string;
    maximumCharge: boolean;
  } | null;
  offers: PricingOffer[];
}

interface StatusDocument {
  schemaVersion: string;
  observedAt: string;
  publicApi: {
    state: string;
    endpoint?: string;
    publicCallable: boolean;
    publicTraffic: boolean;
    customerEndpointAvailable: boolean;
  };
  packages: {
    state: string;
    verifiedAt: string;
    items: Array<{ registry: 'npm' | 'pypi'; name: string; version: string; url: string }>;
  };
  paymentProof: {
    state: 'verified' | 'unverified';
    productId: string;
    network: string;
    asset: string;
    amountAtomic: string;
    decimals: number;
    amountDisplay: string;
    settlementConfirmed: boolean;
    usefulResult: boolean;
    replaySameReceipt: boolean;
    secondAuthorization: boolean;
    secondExecution: boolean;
    secondCharge: boolean;
    transactionUrl: string;
  };
}

interface CatalogDocument {
  contractVersion: string;
  catalogVersion: string;
  artifacts?: Record<string, string>;
}

type OpenApiMethod = {
  summary?: string;
  description?: string;
  parameters?: Array<{ name?: string; in?: string; required?: boolean; schema?: unknown }>;
  requestBody?: { content?: { 'application/json'?: { schema?: unknown } } };
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: unknown }> }>;
};

type OpenApiDocument = {
  info?: { version?: string };
  paths?: Record<string, { post?: OpenApiMethod }>;
};

const pricing = pricingSource as unknown as PricingDocument;
const status = statusSource as unknown as StatusDocument;

if (status.schemaVersion !== publicStatus.schemaVersion) {
  throw new Error('public_status_schema_mismatch');
}
const catalog = catalogSource as unknown as CatalogDocument;
const openapi = openapiSource as unknown as OpenApiDocument;

const familyLabels: Record<LaunchProductId, string> = {
  search: 'Search',
  ai: 'AI',
  sandbox: 'Secure Sandbox',
  rpc: 'Multi-chain RPC',
  prediction: 'Prediction',
  crypto_intelligence: 'Crypto Intelligence',
};

const familyRoutes: Record<LaunchProductId, string> = {
  search: 'search',
  ai: 'ai',
  sandbox: 'sandbox',
  rpc: 'rpc',
  prediction: 'prediction',
  crypto_intelligence: 'crypto',
};

const canonicalIds = new Set<string>();
for (const product of discovery.observedTruth.products) {
  for (const operationId of product.operations) canonicalIds.add(operationId);
}
for (const product of discovery.products) canonicalIds.add(product.operationId);

export const canonicalOperationIds = [...canonicalIds].sort((left, right) => left.localeCompare(right));
export const publishedOperationIds = discovery.products.map(({ operationId }) => operationId);

export function isCanonicalOperationId(operationId: string): boolean {
  return canonicalIds.has(operationId);
}

function priceAmount(offer: PricingOffer | undefined, operationId: string): string {
  if (pricing.publicPrice?.productId === operationId) return pricing.publicPrice.amountDisplay;
  if (offer?.displayPrice === null || offer?.displayPrice === undefined) return 'No single amount published';
  const value = Number(offer.displayPrice.amountAtomic) / 10 ** offer.displayPrice.decimals;
  const asset = offer.displayPrice.asset === 'USDC' ? 'USDC' : 'canonical asset';
  return `${value.toFixed(Math.min(offer.displayPrice.decimals, 6)).replace(/0+$/u, '').replace(/\.$/u, '')} ${asset}`;
}

function priceBehavior(offer: PricingOffer | undefined): string {
  if (offer === undefined) return 'No public price record';
  if (offer.model === 'unavailable' || !offer.publicAvailable) return 'Unavailable';
  if (offer.model === 'x402_request_quote') return 'Request-bound quote';
  if (offer.model === 'x402_exact') return 'Fixed maximum';
  if (offer.model === 'fixed_request') return 'Fixed request';
  return offer.model.replaceAll('_', ' ');
}

function schemaFrom(method: OpenApiMethod | undefined, kind: 'request' | 'response'): unknown | null {
  if (method === undefined) return null;
  if (kind === 'request') return method.requestBody?.content?.['application/json']?.schema ?? null;
  return method.responses?.['200']?.content?.['application/json']?.schema ?? null;
}

export type OperationContract = ReturnType<typeof operationContract>;

export function operationContract(operationId: string) {
  if (!isCanonicalOperationId(operationId)) throw new Error(`operation_contract_unknown:${operationId}`);

  const familyId = familyOf(operationId);
  const family = observedProduct(familyId);
  const published = discovery.products.find((entry) => entry.operationId === operationId);
  const offer = pricing.offers.find((entry) => entry.productId === operationId);
  const publicRoute = published?.publicAvailable === true && published.payment.challengeImplemented
    ? (published.routes?.paidChallenge ?? published.routes?.freeSample ?? null)
    : null;
  const method = publicRoute === null ? undefined : openapi.paths?.[publicRoute]?.post;
  const operationRoutes = observedRoutes.filter((route) => route.productIds.includes(operationId));
  const relatedOperationIds = family.operations.filter((id) => id !== operationId);
  const exactPaymentProof = status.paymentProof.productId === operationId ? status.paymentProof : null;
  const exactPublicPrice = pricing.publicPrice?.productId === operationId ? pricing.publicPrice : null;
  const idempotencyRequired = method?.parameters?.some((parameter) =>
    parameter.name?.toLowerCase() === 'idempotency-key' && parameter.required === true,
  ) ?? false;

  const lifecycle = published === undefined
    ? 'Unavailable'
    : `${published.lifecycle[0]?.toUpperCase() ?? ''}${published.lifecycle.slice(1)}`;
  const access = published?.publicAvailable === true ? 'Publicly callable preview' : 'No public execution path';
  const summary = published?.summary ?? 'No public human summary is currently bound to this canonical operation identity.';
  const title = published?.title ?? operationId;
  const offerAmount = priceAmount(offer, operationId);
  const priceNetwork = exactPublicPrice?.network ?? (offer?.model === 'x402_request_quote' ? 'Returned by the selected quote' : 'Not bound at operation level');
  const priceAsset = exactPublicPrice === null
    ? (offer?.displayPrice?.asset ?? (offer?.model === 'x402_request_quote' ? 'Returned by quote' : 'Not bound'))
    : exactPublicPrice.asset;

  return {
    id: operationId,
    familyId,
    familyLabel: familyLabels[familyId],
    familyRoute: familyRoutes[familyId],
    title,
    summary,
    lifecycle,
    observedFamilyLifecycle: lifecycleLabels[family.lifecycleState],
    proofLabel: proofLabels[family.proofLevel],
    health: 'No operation-specific incident feed is bound',
    actionClass: 'Not bound in public operation truth',
    access,
    publicAvailable: published?.publicAvailable === true,
    publicRoute,
    contractVersion: catalog.contractVersion,
    catalogVersion: catalog.catalogVersion,
    openApiVersion: openapi.info?.version ?? catalog.contractVersion,
    observedAt: discovery.observedTruth.provenance.observedAt,
    publicationTitle: published?.title ?? null,
    price: {
      behavior: priceBehavior(offer),
      amount: offerAmount,
      maximumChargeRequired: offer?.maximumChargeRequired ?? null,
      network: priceNetwork,
      asset: priceAsset,
      priceVersion: offer?.priceVersion ?? null,
      observedAt: pricing.observedAt,
    },
    openapi: {
      summary: method?.summary ?? null,
      description: method?.description ?? null,
      requestSchema: schemaFrom(method, 'request'),
      responseSchema: schemaFrom(method, 'response'),
      responses: method?.responses ?? null,
      idempotencyRequired,
    },
    operationRoutes,
    exactPaymentProof,
    recovery: onboarding.recovery,
    relatedOperationIds,
    artifacts: {
      catalog: catalog.artifacts?.catalog ?? '/catalog.json',
      openapi: catalog.artifacts?.openapi ?? '/openapi.json',
      skill: catalog.artifacts?.skill ?? '/skill.md',
      status: catalog.artifacts?.status ?? '/status.json',
      pricing: catalog.artifacts?.pricing ?? '/pricing.json',
    },
    packages: status.packages.items,
    statusObservedAt: status.observedAt,
    publicApiState: status.publicApi.state,
  };
}
