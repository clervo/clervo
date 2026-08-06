import onboardingSource from '../../../generated/public/onboarding.json';

import type { DiscoveryPillar, PillarLifecycle } from './data/discovery-types';
import { publicSiteSnapshot } from './data/public-site-source';

export type ExperiencePhase = 'risk' | 'qualified' | 'approval' | 'verified' | 'receipt';
export type { PillarLifecycle };
export const discovery = publicSiteSnapshot;

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
    state: 'candidate_verified' | 'fixture_verified' | 'fixture_only' | 'unavailable';
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

export const phases: Array<{ id: ExperiencePhase; eyebrow: string; title: string; detail: string }> = [
  { id: 'risk', eyebrow: '01 / Bound the request', title: 'Unknown work enters as risk.', detail: 'Identity, scope, price ceiling, and failure policy are made explicit before execution.' },
  { id: 'qualified', eyebrow: '02 / Qualify', title: 'A route earns the right to run.', detail: 'Contracts, provider terms, cost controls, and evidence gates remain attached to the decision.' },
  { id: 'approval', eyebrow: '03 / Approve', title: 'The maximum charge is visible.', detail: 'Approval is a deliberate boundary. Unknown settlement state always fails closed.' },
  { id: 'verified', eyebrow: '04 / Verify', title: 'The result carries its evidence.', detail: 'Outputs remain bound to exact operations, request hashes, citations, and safe failure behavior.' },
  { id: 'receipt', eyebrow: '05 / Receipt', title: 'Every outcome closes with proof.', detail: 'A replay-safe receipt preserves what ran, what it cost, and which evidence supports the result.' },
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
