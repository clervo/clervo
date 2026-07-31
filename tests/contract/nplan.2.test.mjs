import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertProductScope,
  createProductScopeDocument,
  firstRevenueReleaseReady,
  fullPlatformExpansionReady,
} from '../../dist/packages/contracts/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('First Revenue Release is Clervo Live Intelligence and does not require AI or Sandbox', () => {
  const scope = createProductScopeDocument();
  assert.equal(scope.company.identity, 'outcome infrastructure for agents');
  assert.equal(scope.firstRevenueRelease.productId, 'clervo.live_intelligence');
  assert.deepEqual(scope.firstRevenueRelease.requiredPillars, ['search']);
  assert.equal(scope.firstRevenueRelease.ready, false);

  const pillars = scope.pillars.map((pillar) => ({
    ...pillar,
    lifecycle: pillar.pillarId === 'search' ? 'available' : pillar.lifecycle,
  }));
  const requirements = scope.firstRevenueRelease.requirements.map((requirement) => ({ ...requirement, verified: true }));
  assert.equal(firstRevenueReleaseReady(pillars, requirements), true);
  assert.equal(fullPlatformExpansionReady(pillars), false);
});

test('future pillars cannot falsely appear live before their additive stages', () => {
  for (const pillarId of ['ai', 'sandbox', 'rpc', 'prediction', 'crypto_intelligence']) {
    const scope = createProductScopeDocument();
    scope.pillars.find((candidate) => candidate.pillarId === pillarId).lifecycle = 'available';
    assert.throws(() => assertProductScope(scope), new RegExp(`future_pillar_falsely_live:${pillarId}`));
  }
});

test('First Revenue Release fails closed when any finished-product proof is missing', () => {
  const scope = createProductScopeDocument();
  const pillars = scope.pillars.map((pillar) => ({
    ...pillar,
    lifecycle: pillar.pillarId === 'search' ? 'available' : pillar.lifecycle,
  }));
  const requirements = scope.firstRevenueRelease.requirements.map((requirement) => ({ ...requirement, verified: true }));
  requirements.find(({ requirementId }) => requirementId === 'external_useful_paid_result').verified = false;
  assert.equal(firstRevenueReleaseReady(pillars, requirements), false);

  const incomplete = structuredClone(scope);
  incomplete.firstRevenueRelease.requirements.pop();
  assert.throws(() => assertProductScope(incomplete), /first_revenue_requirements_incomplete/);
});

test('future expansion leaves existing capability identifiers unchanged', () => {
  const before = createProductScopeDocument();
  const stable = Object.fromEntries(before.pillars.map(({ pillarId, capabilityIds }) => [pillarId, [...capabilityIds]]));
  const after = structuredClone(before);
  for (const pillar of after.pillars) {
    if (pillar.pillarId !== 'search') pillar.lifecycle = 'planned_post_launch';
  }
  assert.deepEqual(Object.fromEntries(after.pillars.map(({ pillarId, capabilityIds }) => [pillarId, capabilityIds])), stable);
});

test('canonical launch authority fixes connector modes, claim ladder, journey, and future stage order', async () => {
  const authority = await readFile(path.join(root, 'docs/product/CLERVO-LIVE-INTELLIGENCE-LAUNCH-AUTHORITY.md'), 'utf8');
  for (const mode of ['open_web', 'official_api', 'bring_your_own_credentials', 'user_authorized_session', 'partner_access', 'customer_supplied_data', 'unsupported']) {
    assert.match(authority, new RegExp(`\\\`${mode}\\\``));
  }
  assert.match(authority, /Clervo-owned live Web retrieval/);
  assert.match(authority, /Advanced live intelligence for agents/);
  assert.match(authority, /Install → Ask → Fund → Approve → Result → Receipt/);
  assert.match(authority, /Stage 5 — Live Intelligence productization/);
  assert.match(authority, /Stage 10 — AI supply and reasoning layer/);
  assert.match(authority, /Stage 11 — Secure Sandbox execution layer/);
  assert.match(authority, /Stage 16 — Full Platform Expansion verification/);
});

test('active positioning sources do not require AI or Sandbox before First Revenue Release', async () => {
  const activeSources = [
    'README.md',
    'AI_BUILDER.md',
    'apps/site/PROTOTYPE-COPY.md',
    'docs/brand/FOCUSED-LAUNCH-SCOPE-v1.md',
    'docs/marketing/INITIAL-COMMERCIAL-RELEASE.md',
    'docs/product/INITIAL-AGENT-USE-CASE-FRAMEWORK.md',
    'docs/product/CLERVO-LIVE-INTELLIGENCE-LAUNCH-AUTHORITY.md',
  ];
  for (const relative of activeSources) {
    const source = await readFile(path.join(root, relative), 'utf8');
    assert.doesNotMatch(source, /Initial Commercial Release (?:requires|pillars are).*Search.*AI.*Sandbox/is, relative);
    assert.doesNotMatch(source, /AI (?:and|or) Sandbox (?:is|are).*First Revenue Release (?:requirement|prerequisite)/is, relative);
  }
});
