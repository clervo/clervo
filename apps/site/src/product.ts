import discoverySource from '../../../generated/public/.well-known/clervo.json';
import launchStateSource from '../../../generated/public/claims.json';
import onboardingSource from '../../../generated/public/onboarding.json';

export type ExperiencePhase = 'risk' | 'qualified' | 'approval' | 'verified' | 'receipt';
export type PillarLifecycle = 'preview' | 'unavailable';

interface DiscoveryProduct {
  productId: 'search.web' | 'search.answer';
  operationId: 'search.web' | 'search.answer';
  title: string;
  summary: string;
  lifecycle: PillarLifecycle;
  publicAvailable: false;
  deliveryModes: string[];
  pricing: {
    model: 'non_payable_mock_fixture';
    displayPrice: {
      asset: 'mock:usdc';
      amountAtomic: string;
      decimals: 6;
    };
    maximumChargeRequired: true;
    priceVersion: string;
  };
  payment: {
    challengeImplemented: true;
    payable: false;
    mockExecutionAvailableByInjectionOnly: true;
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
    state: 'candidate';
    publicAvailable: false;
    callable: false;
    noPublicDistribution: true;
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
      ready: false;
    };
    pillars: DiscoveryPillar[];
  };
}

export const discovery = discoverySource as unknown as Discovery;

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
      state: 'private_production_candidate';
      publicCallable: false;
      publicTraffic: false;
      customerEndpointAvailable: false;
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
    publicCustomerPaymentAvailable: false;
    revenueEvidence: false;
    demandEvidence: false;
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
  publicCallable: false;
  paymentImplemented: false;
  journey: Array<{
    step: 'install' | 'ask' | 'fund' | 'approve' | 'result' | 'receipt';
    state: 'published_verified' | 'fixture_verified' | 'fixture_only' | 'unavailable';
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

export const installExamples = {
  http: `export CLERVO_BASE_URL=http://127.0.0.1:8080

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
