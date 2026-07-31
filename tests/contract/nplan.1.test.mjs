import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertProductScope,
  createProductScopeDocument,
  fullPlatformExpansionReady,
  initialCommercialReleaseReady,
} from '../../dist/packages/contracts/src/index.js';

test('initial commercial release depends exactly on Search, AI, and Sandbox', () => {
  const scope = createProductScopeDocument();
  assert.deepEqual(scope.initialCommercialRelease.requiredPillars, ['search', 'ai', 'sandbox']);
  assert.equal(scope.initialCommercialRelease.ready, false);
  const available = scope.pillars.map((pillar) => ({
    ...pillar,
    lifecycle: ['search', 'ai', 'sandbox'].includes(pillar.pillarId) ? 'available' : pillar.lifecycle,
  }));
  assert.equal(initialCommercialReleaseReady(available), true);
  assert.equal(fullPlatformExpansionReady(available), false);
});

test('planned expansion pillars cannot falsely appear live', () => {
  for (const pillarId of ['rpc', 'prediction', 'crypto_intelligence']) {
    const scope = createProductScopeDocument();
    const pillar = scope.pillars.find((candidate) => candidate.pillarId === pillarId);
    assert.equal(pillar.lifecycle, 'planned_post_launch');
    pillar.lifecycle = 'available';
    assert.throws(() => assertProductScope(scope), new RegExp(`post_launch_pillar_falsely_live:${pillarId}`));
  }
});

test('future expansion leaves existing capability identifiers unchanged', () => {
  const before = createProductScopeDocument();
  const stable = Object.fromEntries(before.pillars
    .filter(({ pillarId }) => ['search', 'ai', 'sandbox'].includes(pillarId))
    .map(({ pillarId, capabilityIds }) => [pillarId, [...capabilityIds]]));
  const after = structuredClone(before);
  for (const pillar of after.pillars) {
    if (['rpc', 'prediction', 'crypto_intelligence'].includes(pillar.pillarId)) pillar.lifecycle = 'available';
  }
  assert.deepEqual(Object.fromEntries(after.pillars
    .filter(({ pillarId }) => ['search', 'ai', 'sandbox'].includes(pillarId))
    .map(({ pillarId, capabilityIds }) => [pillarId, capabilityIds])), stable);
});

test('current product scope is internally truthful', () => {
  const scope = createProductScopeDocument();
  assert.doesNotThrow(() => assertProductScope(scope));
  assert.equal(scope.pillars.find(({ pillarId }) => pillarId === 'search').lifecycle, 'preview');
  assert.equal(scope.pillars.find(({ pillarId }) => pillarId === 'ai').lifecycle, 'unavailable');
  assert.equal(scope.pillars.find(({ pillarId }) => pillarId === 'sandbox').lifecycle, 'unavailable');
});
