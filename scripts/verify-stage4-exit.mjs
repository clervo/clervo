#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const REQUIRED_STAGE4_CHECK_IDS = Object.freeze([
  'federated_lawful_retrieval',
  'query_rewriting',
  'parallel_retrieval',
  'url_normalization_and_near_duplicate_removal',
  'freshness_authority_relevance_diversity_ranking',
  'isolated_javascript_retrieval',
  'retrieval_safety_controls',
  'prompt_injection_boundaries',
  'evidence_tied_citations',
  'disclosed_cache_freshness',
  'language_and_region_options',
  'separate_raw_and_synthesis_prices',
  'quality_latency_and_cost_benchmarks',
  'two_independent_retrieval_paths',
  'deterministic_schema',
  'citation_verifier',
  'ssrf_and_security_suite',
  'blockrun_compatible_baseline_improvement',
  'deployed_free_sample',
  'deployed_paid_route',
  'monitoring',
  'cost_caps',
]);

const STATUSES = new Set(['repository_verified', 'staging_verified', 'missing', 'contradicted']);

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export async function validateStage4SourceBindings(root, evidence) {
  const source = evidence.sourceBindings?.n426;
  assert.ok(source, 'N4.26 source binding is required');
  assert.equal(source.path, 'docs/evidence/n4.26/stage4-binding.v1.json', 'N4.26 binding path drift');
  assert.equal(source.schemaVersion, 'clervo.n4.26.stage4-binding.v1', 'N4.26 binding schema drift');
  assert.equal(source.startingBlockerCount, 21, 'N4.26 must preserve the 21-blocker starting state');

  const binding = JSON.parse(await readFile(path.join(root, source.path), 'utf8'));
  assert.equal(binding.schemaVersion, source.schemaVersion, 'N4.26 bound document schema mismatch');
  assert.equal(binding.startingBlockerCount, source.startingBlockerCount, 'N4.26 starting blocker mismatch');
  assert.equal(binding.stage5Authorized, false, 'N4.26 cannot authorize Stage 5');
  assert.equal(binding.advancedLiveIntelligenceAuthorized, false, 'N4.26 cannot authorize the advanced claim without proof');
  assert.equal(binding.usdcSpent, 0, 'N4.26 must not spend USDC');

  const closed = binding.closedCheckIds;
  const remaining = binding.remainingBlockers.map((value) => value.id);
  assert.equal(new Set(closed).size, closed.length, 'N4.26 closed check IDs must be unique');
  assert.equal(new Set(remaining).size, remaining.length, 'N4.26 remaining blocker IDs must be unique');
  assert.equal(closed.length + remaining.length, source.startingBlockerCount, 'N4.26 must account for all 21 starting blockers');
  assert.deepEqual(
    closed,
    evidence.checks.filter((check) => check.stagingVerified && check.id !== 'deployed_free_sample').map((check) => check.id),
    'N4.26 closed IDs must exactly equal newly staging-verified checks',
  );
  assert.ok(binding.remainingBlockers.every((value) => typeof value.reason === 'string' && value.reason.length >= 80), 'every N4.26 blocker needs an explicit reason');
  assert.deepEqual(
    remaining,
    evidence.checks.filter((check) => !check.stagingVerified).map((check) => check.id),
    'N4.26 remaining blockers must match the Stage 4 manifest',
  );
  assert.equal(binding.claimDecision, 'not_yet_commercially_competitive', 'N4.26 claim decision drift');

  for (const [name, artifact] of Object.entries(binding.artifactBindings)) {
    assert.match(artifact.path, /^docs\/evidence\/n4\.26\/[a-z0-9.-]+$/u, `${name}: artifact must stay in N4.26 evidence`);
    assert.match(artifact.sha256, /^sha256:[a-f0-9]{64}$/u, `${name}: invalid artifact digest`);
    const bytes = await readFile(path.join(root, artifact.path));
    assert.equal(sha256(bytes), artifact.sha256, `${name}: bound artifact digest mismatch`);
  }

  return Object.freeze({ binding, artifactCount: Object.keys(binding.artifactBindings).length });
}

export function evaluateStage4Exit(evidence, actualSourceState) {
  assert.equal(evidence.schemaVersion, 1, 'stage4 evidence schema version drift');
  assert.equal(evidence.stage, 4, 'stage4 evidence must target Stage 4');
  assert.equal(evidence.scope, 'bounded_repository_and_staging_exit_verification');
  assert.match(evidence.evaluatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  assert.deepEqual(evidence.sourceState, actualSourceState, 'stage4 source-state assertions do not match checked-in artifacts');
  assert.ok(Array.isArray(evidence.checks), 'stage4 checks must be an array');

  const ids = evidence.checks.map((check) => check.id);
  assert.equal(new Set(ids).size, ids.length, 'stage4 check IDs must be unique');
  assert.deepEqual([...ids].sort(), [...REQUIRED_STAGE4_CHECK_IDS].sort(), 'stage4 checks must cover every §7.1 requirement and gate');

  for (const check of evidence.checks) {
    assert.ok(STATUSES.has(check.status), `${check.id}: invalid evidence status`);
    assert.equal(typeof check.stagingVerified, 'boolean', `${check.id}: stagingVerified must be boolean`);
    assert.equal(typeof check.evidence, 'string', `${check.id}: evidence must be text`);
    assert.ok(check.evidence.length >= 20, `${check.id}: evidence is too short`);
    assert.equal(check.status === 'staging_verified', check.stagingVerified, `${check.id}: staging status mismatch`);
  }

  const blockingCheckIds = evidence.checks
    .filter((check) => !check.stagingVerified)
    .map((check) => check.id);
  const computedDecision = blockingCheckIds.length === 0 ? 'passed' : 'blocked';
  assert.equal(evidence.decision, computedDecision, 'stage4 decision must be recomputed from staging evidence');
  assert.equal(evidence.referencePatternAuthorized, computedDecision === 'passed', 'reference-pattern authorization must follow the exit decision');
  assert.equal(evidence.stage5Authorized, computedDecision === 'passed', 'Stage 5 authorization must follow the exit decision');
  assert.equal(typeof evidence.nextAction, 'string');
  assert.ok(evidence.nextAction.length >= 40, 'stage4 next action must be explicit');

  return Object.freeze({ decision: computedDecision, blockingCheckIds: Object.freeze(blockingCheckIds) });
}

export async function loadStage4ExitInputs(root = repositoryRoot) {
  const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
  const [evidence, staging, release, discovery, openapi] = await Promise.all([
    readJson('infra/staging/stage4-exit-evidence.json'),
    readJson('infra/environments/staging.json'),
    readJson('infra/staging/release-manifest.json'),
    readJson('generated/public/.well-known/clervo.json'),
    readJson('generated/public/openapi.json'),
  ]);
  const sourceBinding = await validateStage4SourceBindings(root, evidence);
  const products = discovery.products.filter((value) => value.productId === 'search.web' || value.productId === 'search.answer');
  assert.equal(products.length, 2, 'search.web and search.answer discovery products are required');
  return {
    evidence,
    actualSourceState: {
      stagingReleaseStatus: release.liveDeploymentStatus,
      stagingPublic: staging.public,
      stagingUsesMockProvidersByDefault: staging.mockProvidersByDefault,
      discoveryLifecycle: discovery.lifecycle,
      discoveryPaymentImplemented: discovery.payment.implemented,
      discoveryPaidRoutePayable: products.some((product) => product.payment.payable),
      openApiDeploymentVerified: openapi['x-clervo-status'].deploymentVerified,
      openApiPaymentImplemented: openapi['x-clervo-status'].paymentImplemented,
    },
    sourceBinding,
  };
}

async function main() {
  const { evidence, actualSourceState, sourceBinding } = await loadStage4ExitInputs();
  const result = evaluateStage4Exit(evidence, actualSourceState);
  console.log('stage4 exit verification: PASS');
  console.log(`decision: ${result.decision}`);
  console.log(`blocking checks: ${result.blockingCheckIds.length}`);
  console.log(`reference pattern authorized: ${evidence.referencePatternAuthorized}`);
  console.log(`Stage 5 authorized: ${evidence.stage5Authorized}`);
  console.log(`N4.26 bound artifacts: ${sourceBinding.artifactCount}`);
  console.log('network calls made: 0 external');
  console.log('USDC spent: 0');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`stage4 exit verification: FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
