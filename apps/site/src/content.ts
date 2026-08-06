export type FamilyId = 'search' | 'ai' | 'sandbox' | 'rpc' | 'prediction' | 'crypto_intelligence';

export interface FamilyProfile {
  id: FamilyId;
  slug: string;
  title: string;
  promise: string;
  description: string;
}

export const familyProfiles: FamilyProfile[] = [
  {
    id: 'search',
    slug: 'search',
    title: 'Search',
    promise: 'Acquire current information with inspectable evidence.',
    description: 'Qualify retrieval and synthesis routes against scope, freshness, cost, and evidence requirements before they run.',
  },
  {
    id: 'ai',
    slug: 'ai',
    title: 'AI',
    promise: 'Choose an appropriate model route for the task and boundary.',
    description: 'Keep provider, capability, cost ceiling, and output contract attached to the model decision.',
  },
  {
    id: 'sandbox',
    slug: 'secure-sandbox',
    title: 'Secure Sandbox',
    promise: 'Execute bounded code and file work inside an explicit isolation contract.',
    description: 'Make network, resource, provenance, cleanup, and failure behavior visible before execution.',
  },
  {
    id: 'rpc',
    slug: 'multi-chain-rpc',
    title: 'Multi-chain RPC',
    promise: 'Route chain work with the network and operation made explicit.',
    description: 'Preserve chain identity, method policy, provider terms, cost controls, and evidence through the result.',
  },
  {
    id: 'prediction',
    slug: 'prediction',
    title: 'Prediction',
    promise: 'Turn market and forecast data into structured, attributable evidence.',
    description: 'Qualify sources, timestamps, market state, and interpretation boundaries before synthesis.',
  },
  {
    id: 'crypto_intelligence',
    slug: 'crypto-intelligence',
    title: 'Crypto Intelligence',
    promise: 'Trace assets, entities, and transactions into explainable evidence.',
    description: 'Keep networks, identifiers, attribution limits, source provenance, and confidence visible.',
  },
];

export function findFamilyBySlug(slug: string): FamilyProfile | undefined {
  return familyProfiles.find((family) => family.slug === slug);
}
