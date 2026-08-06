export type PillarLifecycle = 'preview' | 'unavailable';

export interface DiscoveryProduct {
  productId: 'search.web' | 'search.answer';
  operationId: 'search.web' | 'search.answer';
  title: string;
  summary: string;
  lifecycle: PillarLifecycle;
  publicAvailable: false;
  deliveryModes: string[];
  pricing: {
    model: 'non_payable_mock_fixture';
    displayPrice: { asset: 'mock:usdc'; amountAtomic: string; decimals: 6 };
    maximumChargeRequired: true;
    priceVersion: string;
  };
  payment: { challengeImplemented: true; payable: false; mockExecutionAvailableByInjectionOnly: true };
}

export interface DiscoveryPillar {
  pillarId: 'search' | 'ai' | 'sandbox' | 'rpc' | 'prediction' | 'crypto_intelligence';
  lifecycle: PillarLifecycle;
  coreQualified: true;
  capabilityIds: string[];
}

export interface Discovery {
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
    productCore: { interfacesFrozen: true; compatibilityVerified: true; ready: true };
    firstRevenueRelease: { ready: false };
    pillars: DiscoveryPillar[];
  };
}
