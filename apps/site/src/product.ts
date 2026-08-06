import discoverySource from '../../../generated/public/.well-known/clervo.json';
import launchStateSource from '../../../generated/public/claims.json';
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

interface DiscoveryProduct {
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

export const pillarLabels: Record<DiscoveryPillar['pillarId'], string> = {
  search: 'Search',
  ai: 'AI',
  sandbox: 'Secure Sandbox',
  rpc: 'Multi-chain RPC',
  prediction: 'Prediction Intelligence',
  crypto_intelligence: 'Crypto Intelligence',
};

export const phases: Array<{
  id: ExperiencePhase;
  eyebrow: string;
  title: string;
  detail: string;
}> = [
  {
    id: 'risk',
    eyebrow: '01 / Bound the request',
    title: 'Unknown work enters as risk.',
    detail: 'Identity, scope, price ceiling, and failure policy are made explicit before execution.',
  },
  {
    id: 'qualified',
    eyebrow: '02 / Qualify',
    title: 'A route earns the right to run.',
    detail: 'Contracts, provider terms, cost controls, and evidence gates remain attached to the decision.',
  },
  {
    id: 'approval',
    eyebrow: '03 / Approve',
    title: 'The maximum charge is visible.',
    detail: 'Approval is a deliberate boundary. Unknown settlement state always fails closed.',
  },
  {
    id: 'verified',
    eyebrow: '04 / Verify',
    title: 'The result carries its evidence.',
    detail: 'Outputs remain bound to exact operations, request hashes, citations, and safe failure behavior.',
  },
  {
    id: 'receipt',
    eyebrow: '05 / Receipt',
    title: 'Every outcome closes with proof.',
    detail: 'A replay-safe receipt preserves what ran, what it cost, and which evidence supports the result.',
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

export const installExamples = {
  http: quickStartCurl ?? `export CLERVO_BASE_URL=http://127.0.0.1:8080

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
  baseUrl: 'http://127.0.0.1:8080'
});

const result = await clervo.search.web({
  query: 'payment idempotency'
});`,
  python: `pip install clervo-sdk

from clervo import Clervo

clervo = Clervo(
    base_url="http://127.0.0.1:8080"
)

result = clervo.search.web(
    query="payment idempotency"
)`,
  mcp: `{
  "mcpServers": {
    "clervo": {
      "command": "npx",
      "args": ["-y", "@clervo/mcp"],
      "env": {
        "CLERVO_BASE_URL": "http://127.0.0.1:8080"
      }
    }
  }
}`,
} as const;

export const publishedClients = [
  { id: 'typescript', label: 'TypeScript', name: '@clervo/sdk', version: '0.3.0', url: 'https://www.npmjs.com/package/@clervo/sdk' },
  { id: 'mcp', label: 'MCP', name: '@clervo/mcp', version: '0.3.0', url: 'https://www.npmjs.com/package/@clervo/mcp' },
  { id: 'python', label: 'Python', name: 'clervo-sdk', version: '0.2.0', url: 'https://pypi.org/project/clervo-sdk/0.2.0/' },
] as const;
