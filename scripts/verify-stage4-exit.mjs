#!/usr/bin/env node

import assert from 'node:assert/strict';
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
  };
}

async function main() {
  const { evidence, actualSourceState } = await loadStage4ExitInputs();
  const result = evaluateStage4Exit(evidence, actualSourceState);
  console.log('stage4 exit verification: PASS');
  console.log(`decision: ${result.decision}`);
  console.log(`blocking checks: ${result.blockingCheckIds.length}`);
  console.log(`reference pattern authorized: ${evidence.referencePatternAuthorized}`);
  console.log(`Stage 5 authorized: ${evidence.stage5Authorized}`);
  console.log('network calls made: 0 external');
  console.log('USDC spent: 0');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`stage4 exit verification: FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}