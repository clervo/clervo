export const productLifecycleStates = [
  'available',
  'degraded',
  'preview',
  'planned_post_launch',
  'unavailable',
] as const;

export type ProductLifecycleState = (typeof productLifecycleStates)[number];

export const pillarIds = [
  'search',
  'ai',
  'sandbox',
  'rpc',
  'prediction',
  'crypto_intelligence',
] as const;

export type PillarId = (typeof pillarIds)[number];

export const firstRevenueReleasePillars = ['search'] as const;
export const additiveEnginePillars = ['ai', 'sandbox'] as const;
export const laterPlatformExpansionPillars = ['rpc', 'prediction', 'crypto_intelligence'] as const;
export const fullPlatformExpansionPillars = pillarIds;

export const firstRevenueRequirementIds = [
  'search',
  'fetch',
  'extract',
  'provenance_exact_citations',
  'compare',
  'monitoring',
  'changes',
  'alerts',
  'machine_readable_api',
  'mcp_sdk_access',
  'bounded_pricing_receipts',
  'tested_onboarding',
  'production_deployment',
  'public_product_pages_documentation',
  'real_demonstrations',
  'external_useful_paid_result',
] as const;

export type FirstRevenueRequirementId = (typeof firstRevenueRequirementIds)[number];

export interface FirstRevenueRequirement {
  requirementId: FirstRevenueRequirementId;
  verified: boolean;
}

export interface PillarScope {
  pillarId: PillarId;
  release: 'first_revenue_release' | 'additive_expansion' | 'later_platform_expansion';
  lifecycle: ProductLifecycleState;
  capabilityIds: readonly string[];
}

export interface ProductScopeDocument {
  scopeVersion: '2026-07-31.2';
  company: {
    name: 'Clervo';
    identity: 'outcome infrastructure for agents';
    permanentNarrative: readonly ['find', 'understand', 'act'];
  };
  firstRevenueRelease: {
    productId: 'clervo.live_intelligence';
    productName: 'Clervo Live Intelligence';
    requiredPillars: typeof firstRevenueReleasePillars;
    requirements: readonly FirstRevenueRequirement[];
    ready: boolean;
  };
  fullPlatformExpansion: {
    requiredPillars: typeof fullPlatformExpansionPillars;
    ready: boolean;
  };
  pillars: readonly PillarScope[];
}

const currentPillars = [
  { pillarId: 'search', release: 'first_revenue_release', lifecycle: 'preview', capabilityIds: ['search.web', 'search.answer', 'web.fetch', 'web.extract'] },
  { pillarId: 'ai', release: 'additive_expansion', lifecycle: 'unavailable', capabilityIds: ['ai.chat', 'ai.embed', 'ai.image', 'ai.speech'] },
  { pillarId: 'sandbox', release: 'additive_expansion', lifecycle: 'unavailable', capabilityIds: ['sandbox.run', 'sandbox.session.create', 'sandbox.session.exec', 'sandbox.artifact.get', 'sandbox.session.destroy'] },
  { pillarId: 'rpc', release: 'later_platform_expansion', lifecycle: 'planned_post_launch', capabilityIds: ['rpc.call', 'rpc.batch', 'rpc.health', 'rpc.archive', 'rpc.broadcast'] },
  { pillarId: 'prediction', release: 'later_platform_expansion', lifecycle: 'planned_post_launch', capabilityIds: ['prediction.markets', 'prediction.market', 'prediction.compare', 'prediction.history', 'prediction.signal'] },
  { pillarId: 'crypto_intelligence', release: 'later_platform_expansion', lifecycle: 'planned_post_launch', capabilityIds: ['crypto.wallet', 'crypto.token', 'crypto.transaction', 'crypto.protocol', 'crypto.report'] },
] as const satisfies readonly PillarScope[];

export function releaseGateReady(required: readonly PillarId[], pillars: readonly PillarScope[]): boolean {
  const byId = new Map(pillars.map((pillar) => [pillar.pillarId, pillar]));
  return required.every((pillarId) => byId.get(pillarId)?.lifecycle === 'available');
}

export function firstRevenueReleaseReady(
  pillars: readonly PillarScope[],
  requirements: readonly FirstRevenueRequirement[],
): boolean {
  return releaseGateReady(firstRevenueReleasePillars, pillars)
    && requirements.length === firstRevenueRequirementIds.length
    && requirements.every(({ verified }) => verified);
}

export function fullPlatformExpansionReady(pillars: readonly PillarScope[]): boolean {
  return releaseGateReady(fullPlatformExpansionPillars, pillars);
}

export function createProductScopeDocument(): ProductScopeDocument {
  const pillars = currentPillars.map((pillar) => ({ ...pillar, capabilityIds: [...pillar.capabilityIds] }));
  const requirements = firstRevenueRequirementIds.map((requirementId) => ({ requirementId, verified: false }));
  return {
    scopeVersion: '2026-07-31.2',
    company: {
      name: 'Clervo',
      identity: 'outcome infrastructure for agents',
      permanentNarrative: ['find', 'understand', 'act'],
    },
    firstRevenueRelease: {
      productId: 'clervo.live_intelligence',
      productName: 'Clervo Live Intelligence',
      requiredPillars: firstRevenueReleasePillars,
      requirements,
      ready: firstRevenueReleaseReady(pillars, requirements),
    },
    fullPlatformExpansion: {
      requiredPillars: fullPlatformExpansionPillars,
      ready: fullPlatformExpansionReady(pillars),
    },
    pillars,
  };
}

export function assertProductScope(document: ProductScopeDocument): void {
  const failures: string[] = [];
  const byId = new Map(document.pillars.map((pillar) => [pillar.pillarId, pillar]));
  if (byId.size !== pillarIds.length || pillarIds.some((pillarId) => !byId.has(pillarId))) failures.push('all_pillars_required_once');
  for (const pillarId of firstRevenueReleasePillars) {
    if (byId.get(pillarId)?.release !== 'first_revenue_release') failures.push(`first_revenue_release_assignment_invalid:${pillarId}`);
  }
  for (const pillarId of additiveEnginePillars) {
    const pillar = byId.get(pillarId);
    if (pillar?.release !== 'additive_expansion') failures.push(`additive_expansion_assignment_invalid:${pillarId}`);
    if (pillar?.lifecycle === 'available' || pillar?.lifecycle === 'degraded' || pillar?.lifecycle === 'preview') failures.push(`future_pillar_falsely_live:${pillarId}`);
  }
  for (const pillarId of laterPlatformExpansionPillars) {
    const pillar = byId.get(pillarId);
    if (pillar?.release !== 'later_platform_expansion') failures.push(`later_expansion_assignment_invalid:${pillarId}`);
    if (pillar?.lifecycle === 'available' || pillar?.lifecycle === 'degraded' || pillar?.lifecycle === 'preview') failures.push(`future_pillar_falsely_live:${pillarId}`);
  }
  const requirementIds = document.firstRevenueRelease.requirements.map(({ requirementId }) => requirementId);
  if (requirementIds.length !== firstRevenueRequirementIds.length
    || new Set(requirementIds).size !== firstRevenueRequirementIds.length
    || firstRevenueRequirementIds.some((requirementId) => !requirementIds.includes(requirementId))) failures.push('first_revenue_requirements_incomplete');
  if (document.firstRevenueRelease.ready !== firstRevenueReleaseReady(document.pillars, document.firstRevenueRelease.requirements)) failures.push('first_revenue_release_gate_dishonest');
  if (document.fullPlatformExpansion.ready !== fullPlatformExpansionReady(document.pillars)) failures.push('full_platform_gate_dishonest');
  if (failures.length > 0) throw new TypeError(`invalid product scope: ${failures.join(', ')}`);
}
