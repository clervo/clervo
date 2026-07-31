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

export const initialCommercialReleasePillars = ['search', 'ai', 'sandbox'] as const;
export const fullPlatformExpansionPillars = pillarIds;
export const postLaunchExpansionPillars = ['rpc', 'prediction', 'crypto_intelligence'] as const;

export interface PillarScope {
  pillarId: PillarId;
  release: 'initial_commercial_release' | 'post_launch_expansion';
  lifecycle: ProductLifecycleState;
  capabilityIds: readonly string[];
}

export interface ProductScopeDocument {
  scopeVersion: '2026-07-31.1';
  initialCommercialRelease: {
    requiredPillars: typeof initialCommercialReleasePillars;
    ready: boolean;
  };
  fullPlatformExpansion: {
    requiredPillars: typeof fullPlatformExpansionPillars;
    ready: boolean;
  };
  pillars: readonly PillarScope[];
}

const currentPillars = [
  { pillarId: 'search', release: 'initial_commercial_release', lifecycle: 'preview', capabilityIds: ['search.web', 'search.answer'] },
  { pillarId: 'ai', release: 'initial_commercial_release', lifecycle: 'unavailable', capabilityIds: ['ai.chat', 'ai.embed', 'ai.image', 'ai.speech'] },
  { pillarId: 'sandbox', release: 'initial_commercial_release', lifecycle: 'unavailable', capabilityIds: ['sandbox.run', 'sandbox.session.create', 'sandbox.session.exec', 'sandbox.artifact.get', 'sandbox.session.destroy'] },
  { pillarId: 'rpc', release: 'post_launch_expansion', lifecycle: 'planned_post_launch', capabilityIds: ['rpc.call', 'rpc.batch', 'rpc.health', 'rpc.archive', 'rpc.broadcast'] },
  { pillarId: 'prediction', release: 'post_launch_expansion', lifecycle: 'planned_post_launch', capabilityIds: ['prediction.markets', 'prediction.market', 'prediction.compare', 'prediction.history', 'prediction.signal'] },
  { pillarId: 'crypto_intelligence', release: 'post_launch_expansion', lifecycle: 'planned_post_launch', capabilityIds: ['crypto.wallet', 'crypto.token', 'crypto.transaction', 'crypto.protocol', 'crypto.report'] },
] as const satisfies readonly PillarScope[];

export function releaseGateReady(required: readonly PillarId[], pillars: readonly PillarScope[]): boolean {
  const byId = new Map(pillars.map((pillar) => [pillar.pillarId, pillar]));
  return required.every((pillarId) => byId.get(pillarId)?.lifecycle === 'available');
}

export function initialCommercialReleaseReady(pillars: readonly PillarScope[]): boolean {
  return releaseGateReady(initialCommercialReleasePillars, pillars);
}

export function fullPlatformExpansionReady(pillars: readonly PillarScope[]): boolean {
  return releaseGateReady(fullPlatformExpansionPillars, pillars);
}

export function createProductScopeDocument(): ProductScopeDocument {
  const pillars = currentPillars.map((pillar) => ({ ...pillar, capabilityIds: [...pillar.capabilityIds] }));
  return {
    scopeVersion: '2026-07-31.1',
    initialCommercialRelease: {
      requiredPillars: initialCommercialReleasePillars,
      ready: initialCommercialReleaseReady(pillars),
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
  for (const pillarId of initialCommercialReleasePillars) {
    if (byId.get(pillarId)?.release !== 'initial_commercial_release') failures.push(`initial_release_assignment_invalid:${pillarId}`);
  }
  for (const pillarId of postLaunchExpansionPillars) {
    const pillar = byId.get(pillarId);
    if (pillar?.release !== 'post_launch_expansion') failures.push(`post_launch_assignment_invalid:${pillarId}`);
    if (pillar?.lifecycle === 'available' || pillar?.lifecycle === 'degraded' || pillar?.lifecycle === 'preview') failures.push(`post_launch_pillar_falsely_live:${pillarId}`);
  }
  if (document.initialCommercialRelease.ready !== initialCommercialReleaseReady(document.pillars)) failures.push('initial_release_gate_dishonest');
  if (document.fullPlatformExpansion.ready !== fullPlatformExpansionReady(document.pillars)) failures.push('full_platform_gate_dishonest');
  if (failures.length > 0) throw new TypeError(`invalid product scope: ${failures.join(', ')}`);
}
