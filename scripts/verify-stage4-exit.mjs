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
  assert.ok(closed.every((id) => evidence.checks.find((check) => check.id === id)?.stagingVerified), 'N4.26 closed checks must remain staging-verified');
  assert.ok(binding.remainingBlockers.every((value) => typeof value.reason === 'string' && value.reason.length >= 80), 'every N4.26 blocker needs an explicit reason');
  assert.equal(binding.claimDecision, 'not_yet_commercially_competitive', 'N4.26 claim decision drift');

  for (const [name, artifact] of Object.entries(binding.artifactBindings)) {
    assert.match(artifact.path, /^docs\/evidence\/n4\.26\/[a-z0-9.-]+$/u, `${name}: artifact must stay in N4.26 evidence`);
    assert.match(artifact.sha256, /^sha256:[a-f0-9]{64}$/u, `${name}: invalid artifact digest`);
    const bytes = await readFile(path.join(root, artifact.path));
    assert.equal(sha256(bytes), artifact.sha256, `${name}: bound artifact digest mismatch`);
  }

  const n427Source = evidence.sourceBindings?.n427;
  assert.ok(n427Source, 'N4.27 source binding is required');
  assert.equal(n427Source.path, 'docs/evidence/n4.27/stage4-binding.v1.json', 'N4.27 binding path drift');
  assert.equal(n427Source.schemaVersion, 'clervo.n4.27.stage4-binding.v1', 'N4.27 binding schema drift');
  assert.equal(n427Source.startingBlockerCount, 10, 'N4.27 must preserve the ten inherited blockers');

  const n427Binding = JSON.parse(await readFile(path.join(root, n427Source.path), 'utf8'));
  assert.equal(n427Binding.schemaVersion, n427Source.schemaVersion, 'N4.27 bound document schema mismatch');
  assert.equal(n427Binding.startingBlockerCount, n427Source.startingBlockerCount, 'N4.27 starting blocker mismatch');
  assert.equal(n427Binding.holdoutFinalRunCount, 1, 'N4.27 frozen holdout must execute exactly once');
  assert.equal(n427Binding.mandatoryQualityGatesPassed, false, 'N4.27 quality failure must remain explicit');
  assert.equal(n427Binding.browserMandatoryGatePassed, false, 'N4.27 browser failure must remain explicit');
  assert.equal(n427Binding.securityMandatoryGatePassed, false, 'N4.27 security-suite incompleteness must remain explicit');
  assert.equal(n427Binding.mockX402Executed, false, 'N4.27 mock x402 must remain unexecuted after prerequisite failure');
  assert.equal(n427Binding.referencePatternAuthorized, false, 'N4.27 cannot authorize the reference pattern');
  assert.equal(n427Binding.stage5Authorized, false, 'N4.27 cannot authorize Stage 5');
  assert.equal(n427Binding.advancedLiveIntelligenceAuthorized, false, 'N4.27 cannot authorize the advanced claim');
  assert.equal(n427Binding.exaParityAuthorized, false, 'N4.27 cannot authorize Exa parity');
  assert.equal(n427Binding.activeComputeUsdPerDay, 0, 'N4.27 cleanup must leave zero active compute exposure');
  assert.equal(n427Binding.usdcSpent, 0, 'N4.27 must spend no USDC');
  assert.equal(n427Binding.smallestRepairTicket, 'N4.27R', 'N4.27 repair ticket drift');
  const n427Remaining = n427Binding.remainingBlockers.map((value) => value.id);
  assert.equal(new Set(n427Remaining).size, n427Remaining.length, 'N4.27 blocker IDs must be unique');
  assert.equal(n427Remaining.length, n427Source.startingBlockerCount, 'N4.27 must account for every inherited blocker');
  assert.ok(n427Binding.remainingBlockers.every((value) => typeof value.reason === 'string' && value.reason.length >= 100), 'every N4.27 blocker needs an explicit reason');

  for (const [name, artifact] of Object.entries(n427Binding.artifactBindings)) {
    assert.match(artifact.path, /^(?:benchmarks\/n4\.27|docs\/evidence\/n4\.27)\/[A-Za-z0-9_./-]+$/u, `${name}: artifact must stay in N4.27 benchmark/evidence boundaries`);
    assert.match(artifact.sha256, /^sha256:[a-f0-9]{64}$/u, `${name}: invalid artifact digest`);
    const bytes = await readFile(path.join(root, artifact.path));
    assert.equal(sha256(bytes), artifact.sha256, `${name}: bound artifact digest mismatch`);
  }

  const n427sSource = evidence.sourceBindings?.n427s;
  assert.ok(n427sSource, 'N4.27S source binding is required');
  assert.equal(n427sSource.path, 'docs/evidence/n4.27s/stage4-binding.v1.json', 'N4.27S binding path drift');
  assert.equal(n427sSource.schemaVersion, 'clervo.n4.27s.stage4-binding.v1', 'N4.27S binding schema drift');
  assert.equal(n427sSource.startingBlockerCount, 10, 'N4.27S must preserve the ten inherited blockers');

  const n427sBinding = JSON.parse(await readFile(path.join(root, n427sSource.path), 'utf8'));
  assert.equal(n427sBinding.schemaVersion, n427sSource.schemaVersion, 'N4.27S bound document schema mismatch');
  assert.equal(n427sBinding.startingBlockerCount, n427sSource.startingBlockerCount, 'N4.27S starting blocker mismatch');
  assert.equal(n427sBinding.finalRunCount, 1, 'N4.27S final staging corpus must execute exactly once');
  assert.equal(n427sBinding.mandatoryQualityGatesPassed, false, 'N4.27S quality failure must remain explicit');
  assert.equal(n427sBinding.aggregateLiveRouteGatesPassed, true, 'N4.27S aggregate live-route proof drift');
  assert.equal(n427sBinding.completeEverySourceQualificationPassed, false, 'N4.27S developer-source contribution failure must remain explicit');
  assert.equal(n427sBinding.browserMandatoryGatePassed, false, 'N4.27S browser failure must remain explicit');
  assert.equal(n427sBinding.hostileBoundaryPassed, false, 'N4.27S hostile-page failure must remain explicit');
  assert.equal(n427sBinding.operationsMandatoryGatePassed, true, 'N4.27S operations proof drift');
  assert.equal(n427sBinding.dailyExposureGatePassed, false, 'N4.27S transient daily-exposure breach must remain explicit');
  assert.equal(n427sBinding.mockX402Executed, false, 'N4.27S mock x402 must remain unexecuted');
  assert.equal(n427sBinding.paymentExecuted, false, 'N4.27S payment must remain unexecuted');
  assert.equal(n427sBinding.referencePatternAuthorized, false, 'N4.27S cannot authorize the reference pattern');
  assert.equal(n427sBinding.stage5Authorized, false, 'N4.27S cannot authorize Stage 5');
  assert.equal(n427sBinding.activeComputeUsdPerDay, 0, 'N4.27S cleanup must leave zero active compute exposure');
  assert.equal(n427sBinding.providerGeneralWebSearchCostUsd, 0, 'N4.27S provider cost must remain zero');
  assert.equal(n427sBinding.usdcSpent, 0, 'N4.27S must spend no USDC');
  assert.equal(n427sBinding.smallestRepairTicket, 'N4.27T', 'N4.27S repair ticket drift');
  assert.equal(new Set(n427sBinding.closedCheckIds).size, n427sBinding.closedCheckIds.length, 'N4.27S closed check IDs must be unique');
  const n427sRemaining = n427sBinding.remainingBlockers.map((value) => value.id);
  assert.equal(new Set(n427sRemaining).size, n427sRemaining.length, 'N4.27S blocker IDs must be unique');
  assert.equal(n427sBinding.closedCheckIds.length + n427sRemaining.length, n427sSource.startingBlockerCount, 'N4.27S must account for all inherited blockers');
  assert.deepEqual(
    [...n427sBinding.closedCheckIds, ...n427sRemaining].sort(),
    [...n427Remaining].sort(),
    'N4.27S historical outcomes must exactly partition the blockers inherited from N4.27',
  );
  assert.ok(n427sBinding.remainingBlockers.every((value) => typeof value.reason === 'string' && value.reason.length >= 100), 'every N4.27S blocker needs an explicit reason');
  for (const [name, artifact] of Object.entries(n427sBinding.artifactBindings)) {
    assert.match(artifact.path, /^(?:benchmarks\/n4\.27s|docs\/evidence\/n4\.27s)\/[A-Za-z0-9_./-]+$/u, `${name}: artifact must stay in N4.27S benchmark/evidence boundaries`);
    assert.match(artifact.sha256, /^sha256:[a-f0-9]{64}$/u, `${name}: invalid artifact digest`);
    const bytes = await readFile(path.join(root, artifact.path));
    assert.equal(sha256(bytes), artifact.sha256, `${name}: bound artifact digest mismatch`);
  }

  return Object.freeze({
    binding,
    artifactCount: Object.keys(binding.artifactBindings).length,
    latestBinding: n427Binding,
    latestArtifactCount: Object.keys(n427Binding.artifactBindings).length,
    currentBinding: n427sBinding,
    currentArtifactCount: Object.keys(n427sBinding.artifactBindings).length,
  });
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
  console.log(`N4.27 bound artifacts: ${sourceBinding.latestArtifactCount}`);
  console.log(`N4.27S bound artifacts: ${sourceBinding.currentArtifactCount}`);
  console.log('network calls made: 0 external');
  console.log('USDC spent: 0');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`stage4 exit verification: FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
