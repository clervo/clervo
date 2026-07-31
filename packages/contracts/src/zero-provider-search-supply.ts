import { CONTRACT_VERSION } from './types.js';

export const focusedIndexRouteId = 'clervo.focused-index.v1' as const;
export const liveFederationRouteId = 'clervo.live-federation.v1' as const;

export interface ZeroProviderRouteAssessment {
  routeId: typeof focusedIndexRouteId | typeof liveFederationRouteId;
  role: 'focused_index' | 'live_federation';
  discoveryDependency: string;
  indexStateIdentity: string;
  healthIdentity: string;
  failureDomain: string;
}

export interface ZeroProviderSearchSupplyAssessment {
  decisionId: string;
  evaluatedAt: string;
  environment: 'development';
  providerApiCostUsdMicros: 0;
  infrastructureAccounting: {
    measured: true;
    capped: true;
    includedInCustomerPricing: true;
  };
  routes: readonly ZeroProviderRouteAssessment[];
  tools: {
    scrapling: {
      version: '0.4.12';
      license: 'BSD-3-Clause';
      sdistSha256: string;
      mode: 'http_default_non_stealth';
    };
    crawl4ai: {
      version: '0.9.2';
      license: 'Apache-2.0';
      sdistSha256: string;
      playwrightVersion: '1.61.0';
      mode: 'javascript_internal_provisional_until_n4_25';
    };
    meilisearch: {
      version: '1.51.0';
      license: 'MIT AND BUSL-1.1';
      communityBinarySha256: string;
      communityFeaturesOnly: true;
      enterpriseFeaturesSelected: false;
    };
  };
  lawfulness: {
    robotsEnforced: true;
    approvedOrUserAuthorizedDomainsOnly: true;
    unrestrictedCrawlingAllowed: false;
    publicNominatimProductionAllowed: false;
    commonCrawlMetadataDiscoveryAllowed: true;
    commonCrawlBodiesPaidOutputAllowed: false;
    credentialedGeneralWebAccountsAllowed: false;
  };
  paidSearchProviderDependencies: readonly string[];
  benchmark: {
    corpusSha256: string;
    scraplingPassed: boolean;
    crawl4aiPassed: boolean;
    meilisearchPassed: boolean;
    clervoBoundaryPassed: boolean;
    externalCalls: 0;
  };
}

export interface ZeroProviderSearchSupplyDecision extends ZeroProviderSearchSupplyAssessment {
  contractVersion: typeof CONTRACT_VERSION;
  routeIdentitiesIndependent: true;
  benchmarkVerified: boolean;
  stage4Ready: false;
  nextTicket: 'N4.23B';
  failureCodes: readonly string[];
}

const expectedDigests = Object.freeze({
  scrapling: 'c6f06d0ea54208d430d47402c4e66760280718dc5b116fa99985beb7b9a517f4',
  crawl4ai: '58dbfa05a82c1cfa667a20383a1d0f7a42187304da5e4d0661a6f59b0ed6a406',
  meilisearch: '73f4f8809a80c5293a594de100b6121cb60879f9869875bdbc732c03771de560',
});

function parseTimestamp(value: string): void {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error('invalid_zero_provider_supply_timestamp');
}

function exactRoute(route: ZeroProviderRouteAssessment, expected: ZeroProviderRouteAssessment): boolean {
  return route.routeId === expected.routeId && route.role === expected.role;
}

export function createZeroProviderSearchSupplyDecision(
  assessment: ZeroProviderSearchSupplyAssessment,
): Readonly<ZeroProviderSearchSupplyDecision> {
  if (!/^zsupply_[A-Za-z0-9]{20,64}$/u.test(assessment.decisionId)) throw new Error('invalid_zero_provider_supply_decision_id');
  parseTimestamp(assessment.evaluatedAt);
  if (assessment.providerApiCostUsdMicros !== 0 || assessment.paidSearchProviderDependencies.length !== 0) throw new Error('paid_search_provider_dependency_prohibited');
  if (!assessment.infrastructureAccounting.measured || !assessment.infrastructureAccounting.capped || !assessment.infrastructureAccounting.includedInCustomerPricing) throw new Error('infrastructure_cost_accounting_required');
  if (assessment.routes.length !== 2) throw new Error('zero_provider_supply_requires_exactly_two_paths');
  const focused = assessment.routes.find((route) => route.routeId === focusedIndexRouteId);
  const live = assessment.routes.find((route) => route.routeId === liveFederationRouteId);
  if (focused === undefined || !exactRoute(focused, { ...focused, routeId: focusedIndexRouteId, role: 'focused_index' })) throw new Error('focused_index_identity_missing');
  if (live === undefined || !exactRoute(live, { ...live, routeId: liveFederationRouteId, role: 'live_federation' })) throw new Error('live_federation_identity_missing');
  for (const route of assessment.routes) {
    for (const value of [route.discoveryDependency, route.indexStateIdentity, route.healthIdentity, route.failureDomain]) {
      if (!/^[a-z][a-z0-9._-]{2,95}$/u.test(value)) throw new Error('invalid_zero_provider_route_identity');
    }
  }
  for (const field of ['discoveryDependency', 'indexStateIdentity', 'healthIdentity', 'failureDomain'] as const) {
    if (focused[field] === live[field]) throw new Error(`duplicate_zero_provider_${field}`);
  }
  if (assessment.tools.scrapling.sdistSha256 !== expectedDigests.scrapling
    || assessment.tools.crawl4ai.sdistSha256 !== expectedDigests.crawl4ai
    || assessment.tools.meilisearch.communityBinarySha256 !== expectedDigests.meilisearch) throw new Error('zero_provider_tool_digest_mismatch');
  if (!assessment.tools.meilisearch.communityFeaturesOnly || assessment.tools.meilisearch.enterpriseFeaturesSelected) throw new Error('meilisearch_enterprise_feature_not_selected');
  if (!assessment.lawfulness.robotsEnforced || !assessment.lawfulness.approvedOrUserAuthorizedDomainsOnly
    || assessment.lawfulness.unrestrictedCrawlingAllowed || assessment.lawfulness.publicNominatimProductionAllowed
    || !assessment.lawfulness.commonCrawlMetadataDiscoveryAllowed || assessment.lawfulness.commonCrawlBodiesPaidOutputAllowed
    || assessment.lawfulness.credentialedGeneralWebAccountsAllowed) throw new Error('unlawful_zero_provider_supply_configuration');
  if (!/^[a-f0-9]{64}$/u.test(assessment.benchmark.corpusSha256) || assessment.benchmark.externalCalls !== 0) throw new Error('invalid_zero_provider_benchmark_evidence');

  const benchmarkChecks = [
    ['scrapling_benchmark_failed', assessment.benchmark.scraplingPassed],
    ['crawl4ai_benchmark_failed', assessment.benchmark.crawl4aiPassed],
    ['meilisearch_benchmark_failed', assessment.benchmark.meilisearchPassed],
    ['clervo_boundary_benchmark_failed', assessment.benchmark.clervoBoundaryPassed],
  ] as const;
  const benchmarkFailures = benchmarkChecks.filter(([, passed]) => !passed).map(([code]) => code);
  const failureCodes = Object.freeze([
    ...benchmarkFailures,
    'focused_index_not_implemented',
    'live_federation_not_implemented',
    'staging_qualification_missing',
  ]);
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    ...assessment,
    infrastructureAccounting: Object.freeze({ ...assessment.infrastructureAccounting }),
    routes: Object.freeze(assessment.routes.map((route) => Object.freeze({ ...route }))),
    tools: Object.freeze({
      scrapling: Object.freeze({ ...assessment.tools.scrapling }),
      crawl4ai: Object.freeze({ ...assessment.tools.crawl4ai }),
      meilisearch: Object.freeze({ ...assessment.tools.meilisearch }),
    }),
    lawfulness: Object.freeze({ ...assessment.lawfulness }),
    paidSearchProviderDependencies: Object.freeze([]),
    benchmark: Object.freeze({ ...assessment.benchmark }),
    routeIdentitiesIndependent: true,
    benchmarkVerified: benchmarkFailures.length === 0,
    stage4Ready: false,
    nextTicket: 'N4.23B',
    failureCodes,
  });
}

export function assertZeroProviderStage4Claim(
  decision: Pick<ZeroProviderSearchSupplyDecision, 'stage4Ready'>,
  claimedReady: boolean,
): void {
  if (claimedReady !== decision.stage4Ready) throw new Error('dishonest_zero_provider_stage4_ready_status');
}
