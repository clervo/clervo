export const productLifecycleStates = [
  'available',
  'degraded',
  'preview',
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

export const productCorePillars = pillarIds;
export const firstRevenueReleasePillars = pillarIds;

export const firstRevenueRequirementIds = [
  'machine_readable_api',
  'mcp_sdk_access',
  'bounded_pricing_receipts',
  'tested_onboarding',
  'unified_public_experience_distribution',
  'production_deployment',
  'real_demonstrations',
  'bounded_real_settlement',
  'external_useful_paid_result',
] as const;

export type FirstRevenueRequirementId = (typeof firstRevenueRequirementIds)[number];

export interface FirstRevenueRequirement {
  requirementId: FirstRevenueRequirementId;
  verified: boolean;
}

export interface PillarScope {
  pillarId: PillarId;
  release: 'first_revenue_release';
  lifecycle: ProductLifecycleState;
  coreQualified: boolean;
  capabilityIds: readonly string[];
}

export interface ProductCoreGate {
  requiredPillars: typeof productCorePillars;
  interfacesFrozen: boolean;
  compatibilityVerified: boolean;
  ready: boolean;
}

export interface ProductScopeDocument {
  scopeVersion: '2026-08-01.3';
  company: {
    name: 'Clervo';
    identity: 'outcome infrastructure for agents';
    permanentNarrative: readonly ['find', 'understand', 'act'];
  };
  productCore: ProductCoreGate;
  firstRevenueRelease: {
    productId: 'clervo.platform';
    productName: 'Clervo Platform';
    requiredPillars: typeof firstRevenueReleasePillars;
    requirements: readonly FirstRevenueRequirement[];
    ready: boolean;
  };
  pillars: readonly PillarScope[];
}

const currentPillars = [
  { pillarId: 'search', release: 'first_revenue_release', lifecycle: 'preview', coreQualified: true, capabilityIds: ['search.web', 'search.answer', 'web.fetch', 'web.extract', 'research.report'] },
  { pillarId: 'ai', release: 'first_revenue_release', lifecycle: 'unavailable', coreQualified: true, capabilityIds: ['ai.chat', 'ai.embed', 'ai.image', 'ai.speech'] },
  { pillarId: 'sandbox', release: 'first_revenue_release', lifecycle: 'unavailable', coreQualified: true, capabilityIds: ['sandbox.run', 'sandbox.session.create', 'sandbox.session.exec', 'sandbox.artifact.get', 'sandbox.session.destroy'] },
  { pillarId: 'rpc', release: 'first_revenue_release', lifecycle: 'unavailable', coreQualified: true, capabilityIds: ['rpc.call', 'rpc.batch', 'rpc.health', 'rpc.archive', 'rpc.broadcast'] },
  { pillarId: 'prediction', release: 'first_revenue_release', lifecycle: 'unavailable', coreQualified: true, capabilityIds: ['prediction.markets', 'prediction.market', 'prediction.compare', 'prediction.history', 'prediction.signal'] },
  { pillarId: 'crypto_intelligence', release: 'first_revenue_release', lifecycle: 'unavailable', coreQualified: true, capabilityIds: ['crypto.wallet', 'crypto.token', 'crypto.transaction', 'crypto.protocol', 'crypto.report'] },
] as const satisfies readonly PillarScope[];

function hasExactPillarIds(required: readonly PillarId[]): boolean {
  return required.length === pillarIds.length
    && new Set(required).size === pillarIds.length
    && pillarIds.every((pillarId) => required.includes(pillarId));
}

function releaseRequirementsVerified(requirements: readonly FirstRevenueRequirement[]): boolean {
  const byId = new Map(requirements.map((requirement) => [requirement.requirementId, requirement]));
  return requirements.length === firstRevenueRequirementIds.length
    && byId.size === firstRevenueRequirementIds.length
    && firstRevenueRequirementIds.every((requirementId) => byId.get(requirementId)?.verified === true);
}

export function releaseGateReady(required: readonly PillarId[], pillars: readonly PillarScope[]): boolean {
  const byId = new Map(pillars.map((pillar) => [pillar.pillarId, pillar]));
  return required.every((pillarId) => byId.get(pillarId)?.lifecycle === 'available');
}

export function productCoreReady(
  pillars: readonly PillarScope[],
  interfacesFrozen: boolean,
  compatibilityVerified: boolean,
): boolean {
  const byId = new Map(pillars.map((pillar) => [pillar.pillarId, pillar]));
  return interfacesFrozen
    && compatibilityVerified
    && productCorePillars.every((pillarId) => byId.get(pillarId)?.coreQualified === true);
}

export function firstRevenueReleaseReady(
  pillars: readonly PillarScope[],
  productCore: ProductCoreGate,
  requirements: readonly FirstRevenueRequirement[],
): boolean {
  return productCore.ready
    && productCore.ready === productCoreReady(pillars, productCore.interfacesFrozen, productCore.compatibilityVerified)
    && releaseGateReady(firstRevenueReleasePillars, pillars)
    && releaseRequirementsVerified(requirements);
}

export function createProductScopeDocument(): ProductScopeDocument {
  const pillars = currentPillars.map((pillar) => ({ ...pillar, capabilityIds: [...pillar.capabilityIds] }));
  const requirements = firstRevenueRequirementIds.map((requirementId) => ({ requirementId, verified: false }));
  const productCore: ProductCoreGate = {
    requiredPillars: productCorePillars,
    interfacesFrozen: true,
    compatibilityVerified: true,
    ready: true,
  };
  productCore.ready = productCoreReady(pillars, productCore.interfacesFrozen, productCore.compatibilityVerified);
  return {
    scopeVersion: '2026-08-01.3',
    company: {
      name: 'Clervo',
      identity: 'outcome infrastructure for agents',
      permanentNarrative: ['find', 'understand', 'act'],
    },
    productCore,
    firstRevenueRelease: {
      productId: 'clervo.platform',
      productName: 'Clervo Platform',
      requiredPillars: firstRevenueReleasePillars,
      requirements,
      ready: firstRevenueReleaseReady(pillars, productCore, requirements),
    },
    pillars,
  };
}

export function assertProductScope(document: ProductScopeDocument): void {
  const failures: string[] = [];
  const byId = new Map(document.pillars.map((pillar) => [pillar.pillarId, pillar]));
  if (document.pillars.length !== pillarIds.length || byId.size !== pillarIds.length || pillarIds.some((pillarId) => !byId.has(pillarId))) failures.push('all_pillars_required_once');
  if (!hasExactPillarIds(document.productCore.requiredPillars)) failures.push('product_core_pillars_invalid');
  if (!hasExactPillarIds(document.firstRevenueRelease.requiredPillars)) failures.push('first_revenue_release_pillars_invalid');
  for (const pillarId of firstRevenueReleasePillars) {
    const pillar = byId.get(pillarId);
    if (pillar?.release !== 'first_revenue_release') failures.push(`first_revenue_release_assignment_invalid:${pillarId}`);
    if ((pillar?.lifecycle as string | undefined) === 'planned_post_launch') failures.push(`first_revenue_pillar_planned_post_launch:${pillarId}`);
    if (pillar?.coreQualified !== true && (pillar?.lifecycle === 'available' || pillar?.lifecycle === 'degraded')) failures.push(`unqualified_pillar_falsely_live:${pillarId}`);
  }
  const requirementIds = document.firstRevenueRelease.requirements.map(({ requirementId }) => requirementId);
  if (requirementIds.length !== firstRevenueRequirementIds.length
    || new Set(requirementIds).size !== firstRevenueRequirementIds.length
    || firstRevenueRequirementIds.some((requirementId) => !requirementIds.includes(requirementId))) failures.push('first_revenue_requirements_incomplete');
  if (document.productCore.ready !== productCoreReady(document.pillars, document.productCore.interfacesFrozen, document.productCore.compatibilityVerified)) failures.push('product_core_gate_dishonest');
  if (document.firstRevenueRelease.ready !== firstRevenueReleaseReady(document.pillars, document.productCore, document.firstRevenueRelease.requirements)) failures.push('first_revenue_release_gate_dishonest');
  if (failures.length > 0) throw new TypeError(`invalid product scope: ${failures.join(', ')}`);
}
