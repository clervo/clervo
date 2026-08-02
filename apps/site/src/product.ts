import discoverySource from '../../../generated/public/.well-known/clervo.json';

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
