import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadStage4ExitInputs } from '../../scripts/verify-stage4-exit.mjs';

const root = new URL('../../', import.meta.url);
const corpus = JSON.parse(await readFile(new URL('benchmarks/n4.26/corpus.v1.json', root), 'utf8'));
const staging = await readFile(new URL('infra/n4.26/staging.yaml', root), 'utf8');
const browserJob = await readFile(new URL('infra/n4.26/browser-job.yaml', root), 'utf8');
const server = await readFile(new URL('apps/api/src/n426-staging-main.mjs', root), 'utf8');
const evaluator = await readFile(new URL('scripts/benchmarks/n4.26/evaluate-n4.26.mjs', root), 'utf8');
const scorecard = JSON.parse(await readFile(new URL('docs/evidence/n4.26/quality-scorecard.v1.json', root), 'utf8'));
const costModel = JSON.parse(await readFile(new URL('docs/evidence/n4.26/cost-model.v1.json', root), 'utf8'));
const infrastructure = JSON.parse(await readFile(new URL('docs/evidence/n4.26/infrastructure-evidence.v1.json', root), 'utf8'));
const monitoring = JSON.parse(await readFile(new URL('docs/evidence/n4.26/monitoring-delivery.v1.json', root), 'utf8'));

test('N4.26 corpus has ten tasks in every authorized use-case family', () => {
  assert.equal(corpus.schemaVersion, 'clervo.n4.26.benchmark-corpus.v1');
  assert.equal(corpus.taskCount, 50);
  assert.equal(corpus.tasks.length, 50);
  assert.equal(new Set(corpus.tasks.map((task) => task.id)).size, 50);
  const counts = Object.groupBy(corpus.tasks, (task) => task.family);
  assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([family, tasks]) => [family, tasks.length]).sort()), {
    commerce_marketplaces: 10,
    company_competitive: 10,
    developer_agent_retrieval: 10,
    property_local_markets: 10,
    research_evidence: 10,
  });
  assert.ok(corpus.tasks.some((task) => task.features.includes('prompt_injection')));
  assert.ok(corpus.tasks.some((task) => task.features.includes('javascript_required')));
  assert.ok(corpus.tasks.some((task) => task.features.includes('no_result')));
  assert.ok(corpus.tasks.some((task) => task.accessMode === 'unsupported'));
  assert.ok(corpus.tasks.every((task) => !task.query.toLowerCase().includes('unrestricted anonymous inventory') || task.accessMode === 'unsupported'));
});

test('N4.26 staging has immutable images, fixed cost limits and no public service', () => {
  assert.doesNotMatch(`${staging}\n${browserJob}`, /:latest\b|REPLACE_AFTER_BUILD/u);
  assert.match(staging, /requests\.cpu: "1600m"/u);
  assert.match(staging, /limits\.cpu: "2"/u);
  assert.match(staging, /clervo-n426-default-deny/u);
  assert.match(staging, /automountServiceAccountToken: false/u);
  assert.match(staging, /except: \[0\.0\.0\.0\/8, 10\.0\.0\.0\/8/u);
  assert.match(browserJob, /readOnlyRootFilesystem: true/u);
  assert.match(browserJob, /activeDeadlineSeconds: 60/u);
  assert.match(browserJob, /backoffLimit: 0/u);
  assert.doesNotMatch(staging, /type: (?:LoadBalancer|NodePort)/u);
});

test('N4.26 runtime fixes route identities, zero provider cost and hard traffic controls', () => {
  assert.match(server, /clervo\.focused-index\.v1/u);
  assert.match(server, /createLiveConnectedRoute/u);
  assert.match(server, /providerGeneralWebSearchCostUsd: 0/u);
  assert.match(server, /global_search_traffic_stopped/u);
  assert.match(server, /daily_operation_budget_exhausted/u);
  assert.match(server, /operation_cost_not_bounded/u);
  assert.match(server, /citation_verifier_unavailable/u);
  assert.match(server, /containsSecret: false/u);
  assert.match(server, /payment: 'mock_only'/u);
  assert.doesNotMatch(server, /facilitator|settle(?:ment)?|payerPrivateKey|receiverWallet/iu);
});

test('N4.26 evaluator measures required quality and cost dimensions', () => {
  for (const token of ['recall', 'precision', 'freshness', 'structuredFieldAccuracy', 'exactCitationValidity', 'duplicateSuppression', 'domainDiversity', 'localeCorrectness', 'successfulExtraction', 'p95LatencyMs', 'operationCostUsd']) assert.match(evaluator, new RegExp(token, 'u'));
  assert.match(evaluator, /not_yet_commercially_competitive/u);
  assert.match(evaluator, /thirdPartyGeneralWebSearchProviderProductionUsd: 0/u);
  assert.match(evaluator, /unavailable_no_charge_free_entitlement/u);
});

test('N4.26 scorecard covers all families and preserves missing proof honestly', () => {
  assert.equal(scorecard.corpus.tasks, 50);
  assert.equal(Object.keys(scorecard.families).length, 5);
  for (const family of Object.values(scorecard.families)) {
    assert.equal(family.corpusTasks, 10);
    assert.equal(family.changeDetectionAccuracy.status, 'unavailable_not_implemented');
    assert.equal(family.promptInjectionResistance.status, 'not_proven_in_staging');
  }
  assert.equal(scorecard.baselines.raw_scrapling.status, 'historical_component_observation_not_rerun_in_n426_staging');
  assert.equal(scorecard.baselines.raw_crawl4ai.n426RuntimeStatus, 'unavailable_worker_never_started');
  assert.equal(scorecard.baselines.simple_meilisearch.status, 'historical_component_observation_plus_n426_focused_route');
  assert.equal(scorecard.claimDecision.classification, 'not_yet_commercially_competitive');
  assert.equal(scorecard.claimDecision.advancedLiveIntelligenceAuthorized, false);
});

test('N4.26 teardown and economic boundaries are explicit', () => {
  assert.equal(infrastructure.cleanup.cluster, 'deleted');
  assert.equal(infrastructure.cleanup.dataDisk, 'deleted');
  assert.equal(infrastructure.cleanup.activeDailyGrossEstimateAfterCleanup, 0.01);
  assert.equal(costModel.infrastructure.activeComputeDailyGrossEstimateAfterCleanup, 0);
  assert.equal(costModel.infrastructure.retainedArtifactAndMonitoringDailyUpperBound, 0.01);
  assert.equal(costModel.infrastructure.thirdPartyGeneralWebSearchProviderProductionCost, 0);
  assert.equal(costModel.ticketCost.usdcSpent, 0);
});

test('N4.26 monitoring evidence binds the delivered primary route without payload leakage', () => {
  assert.equal(monitoring.destination.address, 'mo@clervo.dev');
  assert.equal(monitoring.destination.enabled, true);
  assert.equal(monitoring.destination.verificationCodeDeliveryRequestHttpStatus, 200);
  assert.ok(monitoring.metric.observedPoints.length >= 2);
  assert.equal(monitoring.alertPolicy.enabled, true);
  assert.equal(monitoring.alertPolicy.notificationChannelBound, true);
  assert.equal(monitoring.secondChannel.status, 'remaining_blocker_no_qualified_second_channel');
  assert.deepEqual(monitoring.payloadSafety, { secrets: false, customerPayloads: false, queries: false, urls: false, wallets: false });
  assert.equal(monitoring.triggerEvidence.length, 8);
  assert.ok(monitoring.triggerEvidence.every((value) => value.observed === true));
});

test('N4.26 Stage 4 artifacts are hash-bound before blocker promotion', async () => {
  const inputs = await loadStage4ExitInputs(new URL('../..', import.meta.url).pathname);
  assert.equal(inputs.sourceBinding.artifactCount, 9);
  assert.equal(inputs.sourceBinding.binding.closedCheckIds.length, 11);
  assert.equal(inputs.sourceBinding.binding.remainingBlockers.length, 10);
});
