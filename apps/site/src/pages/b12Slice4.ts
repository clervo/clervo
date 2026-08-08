import type { LaunchProductId } from '../product';

export type Slice4FamilyId = LaunchProductId;

export const FAMILY_ORDER: Slice4FamilyId[] = [
  'search',
  'ai',
  'sandbox',
  'rpc',
  'prediction',
  'crypto_intelligence',
];

export const FAMILY_DISPLAY: Record<Slice4FamilyId, string> = {
  search: 'Search',
  ai: 'AI',
  sandbox: 'Secure Sandbox',
  rpc: 'Multi-chain RPC',
  prediction: 'Prediction',
  crypto_intelligence: 'Crypto Intelligence',
};

export const FAMILY_ROUTE: Record<Slice4FamilyId, string> = {
  search: 'search',
  ai: 'ai',
  sandbox: 'sandbox',
  rpc: 'rpc',
  prediction: 'prediction',
  crypto_intelligence: 'crypto',
};

export const ROUTE_FAMILY: Record<string, Slice4FamilyId> = {
  search: 'search',
  ai: 'ai',
  sandbox: 'sandbox',
  rpc: 'rpc',
  prediction: 'prediction',
  crypto: 'crypto_intelligence',
};

export const FAMILY_CODE: Record<Slice4FamilyId, string> = {
  search: 'SE',
  ai: 'AI',
  sandbox: 'SB',
  rpc: 'RP',
  prediction: 'PR',
  crypto_intelligence: 'CI',
};

/**
 * Locked Step-7C editorial task shapes. These describe the design fixture and
 * are deliberately separated from observed registry/runtime truth.
 */
export const FAMILY_FIXTURE: Record<Slice4FamilyId, {
  promise: string;
  tasks: string[];
  qualify: string;
  example: readonly [string, string, string];
  limitation: string;
}> = {
  search: {
    promise: 'Find current information, sources, changes, and structured research without forcing the agent to assemble provider integrations.',
    tasks: ['Research a company with cited sources', 'Monitor a page or topic for meaningful change', 'Discover current public documents and facts'],
    qualify: 'Freshness, source policy, requested depth, evidence requirements, route health, and cost are checked before search work is eligible.',
    example: ['Research Acme’s current pricing and return a sourced comparison.', 'Search route qualifies for freshness, evidence, and bounded cost.', 'Structured comparison + source evidence + receipt.'],
    limitation: 'Source quality and freshness remain explicit; stale, blocked, or contradictory evidence cannot become verified truth.',
  },
  ai: {
    promise: 'Transform, extract, compare, classify, and generate bounded outputs with model choice treated as a route—not the product.',
    tasks: ['Extract structured data from messy text', 'Compare model outputs under one rubric', 'Transform content into an exact schema'],
    qualify: 'Task shape, model capability, policy, context size, validation requirements, latency, and cost are part of qualification.',
    example: ['Extract the contract dates, parties, and renewal terms.', 'AI route qualifies for schema, context, and validation.', 'Validated structured output + route evidence + receipt.'],
    limitation: 'Generated output is not automatically verified. Required checks must pass before any gold proof state.',
  },
  sandbox: {
    promise: 'Run code and tools inside a bounded environment with explicit resources, network policy, timeout, and artifact handling.',
    tasks: ['Execute code against supplied input', 'Run a reproducible data transformation', 'Create an isolated browser or CLI task'],
    qualify: 'Runtime, dependencies, file access, network policy, resource limits, timeout, and side effects are explicit qualification inputs.',
    example: ['Run this JavaScript on the attached fixture and return stdout.', 'Sandbox qualifies for runtime, files, network policy, and timeout.', 'stdout + execution evidence + receipt.'],
    limitation: 'Unsafe behavior, unsupported runtimes, or unclear side effects are refused rather than silently expanded.',
  },
  rpc: {
    promise: 'Read, simulate, and eventually submit chain activity across supported networks through one normalized task contract.',
    tasks: ['Check balances across supported chains', 'Simulate a transaction before signing', 'Read contract or transaction state'],
    qualify: 'Network, method, node health, finality needs, write risk, signing boundary, cost, and replay behavior remain explicit.',
    example: ['Check this address balance across Ethereum and Base.', 'RPC routes qualify for network health and read-only policy.', 'Normalized balances + block evidence + receipt.'],
    limitation: 'Irreversible writes require separate explicit authority and may remain unavailable until the full safety contract is proven.',
  },
  prediction: {
    promise: 'Discover, compare, and interpret prediction-market signals while preserving source, timing, and resolution uncertainty.',
    tasks: ['Compare markets for the same event', 'Read current odds and liquidity', 'Track resolution status and source changes'],
    qualify: 'Market identity, source health, event equivalence, liquidity, timestamp, and resolution rules are qualification inputs.',
    example: ['Compare current markets for the next rate decision.', 'Prediction sources qualify for event equivalence and freshness.', 'Normalized comparison + source evidence + receipt.'],
    limitation: 'Market prices are signals, not guaranteed outcomes. Ambiguous event matching must remain explicit.',
  },
  crypto_intelligence: {
    promise: 'Turn wallet, token, entity, and transaction data into bounded intelligence with provenance and explicit confidence.',
    tasks: ['Inspect wallet risk indicators', 'Profile token and holder concentration', 'Trace an entity relationship with evidence'],
    qualify: 'Chain coverage, data freshness, attribution confidence, provider health, policy, and cost stay visible during qualification.',
    example: ['Inspect this wallet for current risk indicators.', 'Data routes qualify for chain coverage, freshness, and confidence.', 'Risk profile + evidence + receipt.'],
    limitation: 'Attribution can be uncertain. Inference must never be presented as verified identity.',
  },
};
