import discoverySource from '../../../generated/public/.well-known/clervo.json';
import launchStateSource from '../../../generated/public/claims.json';
import modelsSource from '../../../generated/public/models.json';
import onboardingSource from '../../../generated/public/onboarding.json';

export type ExperiencePhase = 'risk' | 'qualified' | 'approval' | 'verified' | 'receipt';
export type PillarLifecycle = 'preview' | 'unavailable' | 'available';

// Lifecycle state and proof level are two separate facts, observed by probing
// the deployed system, and the site renders both. Collapsing them into one
// would let a returned quote read as a working paid product.
export type LifecycleState = 'live' | 'supply_paused' | 'unavailable';
export type ProofLevel = 'none' | 'quote_observed_unpaid' | 'paid_outcome_verified' | 'externally_repeated';

export interface ObservedProduct {
  id: 'search' | 'ai' | 'sandbox' | 'rpc' | 'prediction' | 'crypto_intelligence';
  label: string;
  operations: string[];
  lifecycleState: LifecycleState;
  proofLevel: ProofLevel;
  reason: string | null;
  expectedReturnAt: string | null;
  publiclyReachable: boolean;
  observedPrice: {
    amountAtomic: string;
    asset: string;
    network: string;
    priceVersion: string;
  } | null;
  freeEntry: { route: string; acceptsNaiveRequest: boolean } | null;
}

export interface ObservedTruth {
  provenance: {
    source: string;
    generatedBy: string;
    observedAt: string;
    releaseId: string;
    proofLevels: Record<ProofLevel, string>;
    states: Record<LifecycleState, string>;
  };
  products: ObservedProduct[];
}

export interface DiscoveryProduct {
  productId: string;
  operationId: string;
  title: string;
  summary: string;
  lifecycle: PillarLifecycle;
  publicAvailable: boolean;
  deliveryModes: string[];
  pricing: {
    model: string;
    displayPrice: {
      asset: string;
      amountAtomic: string;
      decimals: number;
    } | null;
    maximumChargeRequired: boolean;
    priceVersion: string;
  };
  routes?: { freeSample?: string; paidChallenge?: string };
  attribution?: {
    source: string;
    license?: string;
    licenseUrl?: string;
    transformedBy: string;
  };
  payment: {
    challengeImplemented: boolean;
    payable: boolean;
    mockExecutionAvailableByInjectionOnly: boolean;
  };
}

interface DiscoveryPillar {
  pillarId: 'search' | 'ai' | 'sandbox' | 'rpc' | 'prediction' | 'crypto_intelligence';
  lifecycle: PillarLifecycle;
  coreQualified: true;
  capabilityIds: string[];
}

interface Discovery {
  discoveryVersion: string;
  contractVersion: string;
  description: string;
  distribution: {
    state: string;
    publicAvailable: boolean;
    callable: boolean;
    noPublicDistribution: boolean;
    releaseCandidateId: string;
    interfaceHash: string;
  };
  products: DiscoveryProduct[];
  releaseScope: {
    productCore: {
      interfacesFrozen: true;
      compatibilityVerified: true;
      ready: true;
    };
    firstRevenueRelease: {
      ready: boolean;
    };
    pillars: DiscoveryPillar[];
  };
  observedTruth: ObservedTruth;
}

export const discovery = discoverySource as unknown as Discovery;
export const observedTruth = discovery.observedTruth;

const observedById = new Map(observedTruth.products.map((product) => [product.id, product]));

export function observedProduct(id: ObservedProduct['id']): ObservedProduct {
  const product = observedById.get(id);
  if (product === undefined) throw new Error(`observed_product_missing: ${id}`);
  return product;
}

/** Human-readable lifecycle state, never a hand-written status claim. */
export const lifecycleLabels: Record<LifecycleState, string> = {
  live: 'live',
  supply_paused: 'supply paused',
  unavailable: 'unavailable',
};

export const proofLabels: Record<ProofLevel, string> = {
  none: 'nothing demonstrated',
  quote_observed_unpaid: 'quote observed, unpaid',
  paid_outcome_verified: 'paid outcome verified',
  externally_repeated: 'externally repeated',
};

export function attributionLabel(attribution: NonNullable<DiscoveryProduct['attribution']>): string {
  return attribution.license === undefined
    ? attribution.source
    : `${attribution.source} / ${attribution.license}`;
}

/** True when the deployed system serves at least one publicly reachable family. */
export const publicApiCallable = observedTruth.products.some(({ publiclyReachable }) => publiclyReachable);

const familyByPrefix: Record<string, ObservedProduct['id']> = {
  search: 'search',
  ai: 'ai',
  sandbox: 'sandbox',
  rpc: 'rpc',
  prediction: 'prediction',
  crypto: 'crypto_intelligence',
};

/** Map an operation identifier such as `search.web` to its observed family. */
export function familyOf(operationId: string): ObservedProduct['id'] {
  const family = familyByPrefix[operationId.split('.')[0] ?? ''];
  if (family === undefined) throw new Error(`observed_family_missing: ${operationId}`);
  return family;
}

export interface PublicOperation extends DiscoveryProduct {
  familyId: ObservedProduct['id'];
  familyLabel: string;
  lifecycleState: LifecycleState;
  proofLevel: ProofLevel;
}

/**
 * Public operation projection from generated discovery plus live family truth.
 * AI model routes remain useful supply diagnostics, but they are not the
 * cross-product operation catalog and must not drive public counts or prices.
 */
export const publicOperations: PublicOperation[] = discovery.products.map((product) => {
  const familyId = familyOf(product.operationId);
  const family = observedProduct(familyId);
  return {
    ...product,
    familyId,
    familyLabel: family.label,
    lifecycleState: product.publicAvailable ? family.lifecycleState : 'unavailable',
    proofLevel: product.publicAvailable ? family.proofLevel : 'none',
  };
});

export type LaunchProductId = 'search' | 'ai' | 'sandbox' | 'rpc' | 'prediction' | 'crypto_intelligence';

export interface LaunchProduct {
  id: LaunchProductId;
  label: string;
  operations: string[];
  engineeringState: string;
  customerLifecycle: string;
  commercialProof: string;
  paymentState: string;
  supplierRights: string;
  allowedClaims: string[];
  prohibitedClaims: string[];
}

interface LaunchState {
  schemaVersion: 'clervo.launch-state.v1';
  observedAt: string;
  sourceCommit: string;
  identity: {
    category: string;
    headline: string;
    architectureNarrative: string;
    commercialPromise: string;
    explanation: string;
  };
  repository: { state: 'public_verified'; url: string };
  distribution: {
    packages: {
      state: 'published_verified';
      verifiedAt: string;
      items: Array<{ registry: 'npm' | 'pypi'; name: string; version: string; url: string }>;
    };
    publicApi: {
      state: string;
      endpoint?: string;
      publicCallable: boolean;
      publicTraffic: boolean;
      customerEndpointAvailable: boolean;
    };
  };
  paymentProof: {
    state: 'owner_funded_private_proof';
    productId: 'search.web';
    network: 'Base';
    asset: 'USDC';
    amountAtomic: '6000';
    decimals: 6;
    amountDisplay: '0.006 USDC';
    settlementConfirmed: true;
    usefulResult: true;
    replaySameReceipt: true;
    secondAuthorization: false;
    secondExecution: false;
    secondCharge: false;
    publicCustomerPaymentAvailable: boolean;
    revenueEvidence: boolean;
    demandEvidence: boolean;
    transactionUrl: string;
    evidence: string[];
  };
  products: LaunchProduct[];
  competitors: {
    blockrun: {
      state: 'revalidation_required';
      observedAt: string;
      renderVolatileClaims: false;
      reason: string;
    };
  };
}

export const launchState = launchStateSource as unknown as LaunchState;

export interface OnboardingRecovery {
  code: 'insufficient_funds' | 'wrong_network_or_asset' | 'expired_quote' | 'rejected' | 'timeout' | 'unknown_settlement';
  problemCodes: string[];
  action: string;
  retry: 'after_action' | 'prohibited_until_reconciled';
}

interface Onboarding {
  releaseCandidateId: string;
  interfaceHash: string;
  publicCallable: boolean;
  paymentImplemented: boolean;
  journey: Array<{
    step: 'install' | 'ask' | 'fund' | 'approve' | 'result' | 'receipt';
    state: string;
    action: string;
  }>;
  recovery: OnboardingRecovery[];
}

export const onboarding = onboardingSource as unknown as Onboarding;

/*
 * The observed model catalog.
 *
 * `models.json` is generated from the same probed registry as the discovery
 * document, so a route appears in the catalog exactly when the deployed system
 * was observed serving it. Every field the catalog page renders — lifecycle
 * state, supply family, price, pause reason, expected return — comes from here,
 * and none of it is restated in page source.
 */

export interface ObservedRoute {
  id: string;
  routeId: string;
  supplyFamilyId: string;
  productIds: string[];
  capabilities: string[];
  route: string;
  lifecycleState: LifecycleState;
  proofLevel: ProofLevel;
  sellable: boolean;
  reason: string | null;
  expectedReturnAt: string | null;
  observedPrice: {
    amountAtomic: string;
    asset: string;
    network: string;
    decimals: number;
    priceVersion: string;
    maximumCharge: boolean;
  } | null;
}

interface ModelsDocument {
  object: 'list';
  data: Array<{
    id: string;
    object: 'model';
    created: number;
    owned_by: string;
    clervo: Omit<ObservedRoute, 'id'>;
  }>;
  clervo: { provenance: ObservedTruth['provenance'] };
}

const modelsDocument = modelsSource as unknown as ModelsDocument;

export const observedRoutes: ObservedRoute[] = modelsDocument.data
  .map(({ id, clervo }) => ({ id, ...clervo }))
  // Serving routes first, then paused ones, and alphabetically within each
  // group: a catalog that leads with what a caller cannot use today is a
  // catalog that reads as broken.
  .sort((left, right) => {
    if (left.lifecycleState !== right.lifecycleState) {
      return left.lifecycleState === 'live' ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  });

export const supplyFamilyLabels: Record<string, string> = {
  'supply.cloudflare_workers_ai': 'Cloudflare Workers AI',
  'supply.clervo_ai_gateway': 'Clervo AI gateway',
  'supply.deepgram': 'Deepgram',
  'supply.google_vertex': 'Google Vertex',
  'supply.groq': 'Groq',
};

/** A supply family's display name, falling back to its observed identifier. */
export function supplyFamilyLabel(id: string): string {
  return supplyFamilyLabels[id] ?? id;
}

/**
 * Format an observed atomic price as a display amount. The decimals come from
 * the observation, never from an assumption about the asset.
 */
export function formatUsdc(amountAtomic: string, decimals: number): string {
  const value = Number(amountAtomic) / 10 ** decimals;
  return `${value.toFixed(Math.min(decimals, 6)).replace(/0+$/u, '').replace(/\.$/u, '')} USDC`;
}

/** Human-readable capability tag, as observed on the route. */
export function capabilityLabel(capability: string): string {
  return capability.replaceAll('_', ' ');
}

export const pillarLabels: Record<DiscoveryPillar['pillarId'], string> = {
  search: 'Search',
  ai: 'AI',
  sandbox: 'Secure Sandbox',
  rpc: 'Multi-chain RPC',
  prediction: 'Prediction Intelligence',
  crypto_intelligence: 'Crypto Intelligence',
};

/*
 * The five lifecycle steps the homepage narrates and the instrument follows.
 *
 * This is a description of how the mechanism is designed, not a report of
 * anything the deployed system has just done. Each step therefore names the
 * document that specifies it and the rule that step enforces, and the homepage
 * links to that document — a reader who does not believe the sentence can go
 * read the contract. The previous version printed an identical three-row panel
 * on all five steps ("Layer / Behavior / Evidence", always "fail closed",
 * always "inspectable") under an "evidence" label, which is the shape of an
 * instrument readout carrying none of the content of one.
 */
export const phases: Array<{
  id: ExperiencePhase;
  eyebrow: string;
  title: string;
  detail: string;
  rule: string;
  contract: { to: string; label: string };
}> = [
  {
    id: 'risk',
    eyebrow: '01 / Bound the request',
    title: 'Unknown work enters as risk.',
    detail: 'Identity, scope, price ceiling, and failure policy are made explicit before execution.',
    rule: 'A request without a bound maximum charge is refused before anything runs.',
    contract: { to: '/docs/x402', label: 'The x402 boundary' },
  },
  {
    id: 'qualified',
    eyebrow: '02 / Qualify',
    title: 'A route earns the right to run.',
    detail: 'Contracts, provider terms, cost controls, and evidence gates remain attached to the decision.',
    rule: 'Qualification is private engineering state and never implies customer availability.',
    contract: { to: '/docs/catalog', label: 'The machine catalog' },
  },
  {
    id: 'approval',
    eyebrow: '03 / Approve',
    title: 'The maximum charge is visible.',
    detail: 'Approval is a deliberate boundary. Unknown settlement state always fails closed.',
    rule: 'Nothing signs an authorization on the caller’s behalf; the challenge is handed over intact.',
    contract: { to: '/pricing', label: 'Observed ceilings' },
  },
  {
    id: 'verified',
    eyebrow: '04 / Verify',
    title: 'The result carries its evidence.',
    detail: 'Outputs remain bound to exact operations, request hashes, citations, and safe failure behavior.',
    rule: 'A failure names the next safe action and says whether retrying is allowed.',
    contract: { to: '/docs/failures', label: 'Recovery states' },
  },
  {
    id: 'receipt',
    eyebrow: '05 / Receipt',
    title: 'Every outcome closes with proof.',
    detail: 'A replay-safe receipt preserves what ran, what it cost, and which evidence supports the result.',
    rule: 'Replaying one request returns the existing receipt instead of executing a second time.',
    contract: { to: '/docs/replay', label: 'Replay behaviour' },
  },
];

// The one command a first-time caller runs, built from the probed registry so
// the published example can never advertise a route or a header requirement the
// deployed system does not have. The base URL is the observed free route's own
// origin, not a placeholder: a copy-pasteable example that needs to be edited
// before it works is not copy-pasteable.
const observedFreeRoute = observedTruth.products.find(({ id }) => id === 'search')?.freeEntry ?? null;

export const quickStartCurl = observedFreeRoute === null
  ? null
  : [
    `curl -sS ${observedFreeRoute.route} \\`,
    "  -H 'content-type: application/json' \\",
    `  -d '{"query":"what is the x402 payment protocol","maxResults":3,"synthesize":false}'${observedFreeRoute.acceptsNaiveRequest ? '' : ' \\'}`,
    // While the free route still demands a caller key, the published example
    // shows one. Publishing the shorter command before the runtime accepts it
    // would hand every first-time caller a 400.
    ...(observedFreeRoute.acceptsNaiveRequest ? [] : ["  -H 'idempotency-key: clervo-first-call-0001'"]),
  ].join('\n');

/** True when the published curl needs no idempotency key, as observed. */
export const quickStartNeedsNoKey = observedFreeRoute?.acceptsNaiveRequest === true;

/*
 * The base URL every client example configures.
 *
 * It is the origin of the free route the probe actually saw, so a reader who
 * copies a snippet points at the endpoint that answered rather than at a
 * loopback address that only exists on a developer's machine. When no public
 * route is observed there is no honest public origin to publish, and the
 * examples fall back to the local one.
 */
export const observedApiOrigin = observedFreeRoute === null
  ? 'http://127.0.0.1:8080'
  : new URL(observedFreeRoute.route).origin;

export const installExamples = {
  http: quickStartCurl ?? `export CLERVO_BASE_URL=${observedApiOrigin}

curl --fail-with-body \\
  --request POST "$CLERVO_BASE_URL/v1/search/free" \\
  --header "content-type: application/json" \\
  --header "idempotency-key: clervo_example_0001" \\
  --data '{
    "query": "payment idempotency",
    "maxResults": 5,
    "synthesize": false,
    "language": "en",
    "region": "US"
  }'`,
  typescript: `npm install @clervo/sdk

import { ClervoClient } from '@clervo/sdk';

const clervo = new ClervoClient({
  baseUrl: '${observedApiOrigin}'
});

const result = await clervo.search.web({
  query: 'payment idempotency'
});`,
  python: `pip install clervo-sdk

from clervo import Clervo

clervo = Clervo(
    base_url="${observedApiOrigin}"
)

result = clervo.search.web(
    query="payment idempotency"
)`,
  mcp: `{
  "mcpServers": {
    "clervo": {
      "command": "npx",
      "args": ["-y", "@clervo/mcp", "--profile", "research"],
      "env": {
        "CLERVO_BASE_URL": "${observedApiOrigin}"
      }
    }
  }
}`,
} as const;

function publishedClient(name: string) {
  const item = launchState.distribution.packages.items.find((entry) => entry.name === name);
  if (item === undefined) throw new Error(`published_client_missing:${name}`);
  return item;
}

export const publishedClients = [
  { id: 'typescript', label: 'TypeScript', ...publishedClient('@clervo/sdk') },
  { id: 'mcp', label: 'MCP', ...publishedClient('@clervo/mcp') },
  { id: 'python', label: 'Python', ...publishedClient('clervo-sdk') },
] as const;
