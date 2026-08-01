import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertProductScope,
  createProductScopeDocument,
  firstRevenueReleaseReady,
  firstRevenueRequirementIds,
  pillarIds,
  productCoreReady,
} from '../../dist/packages/contracts/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const stableCapabilityIds = {
  search: ['search.web', 'search.answer', 'web.fetch', 'web.extract', 'research.report'],
  ai: ['ai.chat', 'ai.embed', 'ai.image', 'ai.speech'],
  sandbox: ['sandbox.run', 'sandbox.session.create', 'sandbox.session.exec', 'sandbox.artifact.get', 'sandbox.session.destroy'],
  rpc: ['rpc.call', 'rpc.batch', 'rpc.health', 'rpc.archive', 'rpc.broadcast'],
  prediction: ['prediction.markets', 'prediction.market', 'prediction.compare', 'prediction.history', 'prediction.signal'],
  crypto_intelligence: ['crypto.wallet', 'crypto.token', 'crypto.transaction', 'crypto.protocol', 'crypto.report'],
};

test('Clervo Platform scope preserves the privately qualified Search core and five pending cores', () => {
  const scope = createProductScopeDocument();
  assert.equal(scope.scopeVersion, '2026-08-01.3');
  assert.equal(scope.firstRevenueRelease.productId, 'clervo.platform');
  assert.equal(scope.firstRevenueRelease.productName, 'Clervo Platform');
  assert.deepEqual([...scope.firstRevenueRelease.requiredPillars], [...pillarIds]);
  assert.deepEqual([...scope.productCore.requiredPillars], [...pillarIds]);
  assert.deepEqual(scope.pillars.map(({ lifecycle }) => lifecycle), ['preview', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable']);
  assert.ok(scope.pillars.every(({ release }) => release === 'first_revenue_release'));
  assert.deepEqual(scope.pillars.map(({ coreQualified }) => coreQualified), [true, false, false, false, false, false]);
  assert.deepEqual(Object.fromEntries(scope.pillars.map(({ pillarId, capabilityIds }) => [pillarId, capabilityIds])), stableCapabilityIds);
  assert.equal(scope.productCore.ready, false);
  assert.equal(scope.firstRevenueRelease.ready, false);
  assert.deepEqual(scope.firstRevenueRelease.requirements.map(({ requirementId }) => requirementId), [...firstRevenueRequirementIds]);
});

test('product core requires all six qualifications plus frozen compatible interfaces', () => {
  const scope = createProductScopeDocument();
  const qualified = scope.pillars.map((pillar) => ({ ...pillar, coreQualified: true }));
  assert.equal(productCoreReady(qualified, false, true), false);
  assert.equal(productCoreReady(qualified, true, false), false);
  assert.equal(productCoreReady(qualified, true, true), true);
  qualified.find(({ pillarId }) => pillarId === 'prediction').coreQualified = false;
  assert.equal(productCoreReady(qualified, true, true), false);
});

test('First Revenue Release additionally requires all-six availability and every exact shared proof', () => {
  const scope = createProductScopeDocument();
  const pillars = scope.pillars.map((pillar) => ({ ...pillar, coreQualified: true, lifecycle: 'available' }));
  const productCore = { ...scope.productCore, interfacesFrozen: true, compatibilityVerified: true, ready: true };
  const requirements = scope.firstRevenueRelease.requirements.map((requirement) => ({ ...requirement, verified: true }));
  assert.equal(firstRevenueReleaseReady(pillars, productCore, requirements), true);

  pillars.find(({ pillarId }) => pillarId === 'sandbox').lifecycle = 'preview';
  assert.equal(firstRevenueReleaseReady(pillars, productCore, requirements), false);
  pillars.find(({ pillarId }) => pillarId === 'sandbox').lifecycle = 'available';
  requirements.find(({ requirementId }) => requirementId === 'bounded_real_settlement').verified = false;
  assert.equal(firstRevenueReleaseReady(pillars, productCore, requirements), false);
  requirements.find(({ requirementId }) => requirementId === 'bounded_real_settlement').verified = true;
  requirements[0].requirementId = requirements[1].requirementId;
  assert.equal(firstRevenueReleaseReady(pillars, productCore, requirements), false);
});

test('scope validation rejects a live pillar without core qualification and dishonest gates', () => {
  const falseLive = createProductScopeDocument();
  falseLive.pillars.find(({ pillarId }) => pillarId === 'rpc').lifecycle = 'available';
  assert.throws(() => assertProductScope(falseLive), /unqualified_pillar_falsely_live:rpc/);

  const dishonestCore = createProductScopeDocument();
  dishonestCore.productCore.ready = true;
  assert.throws(() => assertProductScope(dishonestCore), /product_core_gate_dishonest/);

  const falsePostLaunch = createProductScopeDocument();
  falsePostLaunch.pillars.find(({ pillarId }) => pillarId === 'ai').lifecycle = 'planned_post_launch';
  assert.throws(() => assertProductScope(falsePostLaunch), /first_revenue_pillar_planned_post_launch:ai/);
});

test('repository authority contains the exact canonical Stage 5–16 titles', async () => {
  const authority = await readFile(path.join(root, 'docs/archive/product-authorities/CLERVO-LIVE-INTELLIGENCE-LAUNCH-AUTHORITY.md'), 'utf8');
  const stageTitles = [...authority.matchAll(/^### Stage (\d+) — (.+)$/gmu)].map(([, stage, title]) => [Number(stage), title]);
  assert.deepEqual(stageTitles, [
    [5, 'Live Intelligence productization and platform-registry foundation'],
    [6, 'AI product core'],
    [7, 'Secure Sandbox product core'],
    [8, 'Universal multi-chain RPC product core'],
    [9, 'Prediction-market Intelligence product core'],
    [10, 'Crypto Intelligence product core'],
    [11, 'Combined workflows and private six-product stabilization'],
    [12, 'Cross-pillar contract and product-core freeze'],
    [13, 'Shared access, design, onboarding, and distribution'],
    [14, 'Full-platform production hardening and deployment'],
    [15, 'Bounded real x402 settlement proof'],
    [16, 'External paid result and First Revenue Release'],
  ]);
});
