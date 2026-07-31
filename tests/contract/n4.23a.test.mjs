import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertZeroProviderStage4Claim,
  createZeroProviderSearchSupplyDecision,
} from '../../dist/packages/contracts/src/index.js';

const fixture = JSON.parse(await readFile(new URL('../../packages/contracts/fixtures/zero-provider-search-supply-valid.json', import.meta.url), 'utf8'));
const benchmarkEvidence = JSON.parse(await readFile(new URL('../../docs/evidence/n4.23a-tool-benchmark.json', import.meta.url), 'utf8'));

function assessment() {
  const value = structuredClone(fixture.value);
  for (const field of ['contractVersion', 'routeIdentitiesIndependent', 'benchmarkVerified', 'stage4Ready', 'nextTicket', 'failureCodes']) delete value[field];
  return value;
}

test('zero-provider-cost supply selects two independent Clervo identities without claiming Stage 4 readiness', () => {
  const decision = createZeroProviderSearchSupplyDecision(assessment());
  assert.deepEqual(decision, fixture.value);
  assert.deepEqual(decision.routes.map((route) => route.routeId), [
    'clervo.focused-index.v1',
    'clervo.live-federation.v1',
  ]);
  assert.equal(decision.providerApiCostUsdMicros, 0);
  assert.deepEqual(decision.paidSearchProviderDependencies, []);
  assert.equal(decision.benchmarkVerified, true);
  assert.equal(decision.stage4Ready, false);
});

test('paid or eventually-paid search API dependencies are rejected', () => {
  const paid = assessment();
  paid.paidSearchProviderDependencies = ['hosted_search_api'];
  assert.throws(() => createZeroProviderSearchSupplyDecision(paid), /paid_search_provider_dependency_prohibited/u);
  const nonzero = assessment();
  nonzero.providerApiCostUsdMicros = 1;
  assert.throws(() => createZeroProviderSearchSupplyDecision(nonzero), /paid_search_provider_dependency_prohibited/u);
});

test('route discovery, index, health, and failure-domain identities remain independent', () => {
  for (const field of ['discoveryDependency', 'indexStateIdentity', 'healthIdentity', 'failureDomain']) {
    const duplicate = assessment();
    duplicate.routes[1][field] = duplicate.routes[0][field];
    assert.throws(
      () => createZeroProviderSearchSupplyDecision(duplicate),
      new RegExp(`duplicate_zero_provider_${field}`, 'u'),
    );
  }
});

test('tool identity or digest substitution fails before selection', () => {
  const scrapling = assessment();
  scrapling.tools.scrapling.sdistSha256 = '0'.repeat(64);
  assert.throws(() => createZeroProviderSearchSupplyDecision(scrapling), /zero_provider_tool_digest_mismatch/u);
  const enterprise = assessment();
  enterprise.tools.meilisearch.enterpriseFeaturesSelected = true;
  assert.throws(() => createZeroProviderSearchSupplyDecision(enterprise), /meilisearch_enterprise_feature_not_selected/u);
});

test('public Nominatim, Common Crawl bodies, unrestricted crawling, and credentialed general-Web accounts stay excluded', () => {
  for (const field of [
    'publicNominatimProductionAllowed',
    'commonCrawlBodiesPaidOutputAllowed',
    'unrestrictedCrawlingAllowed',
    'credentialedGeneralWebAccountsAllowed',
  ]) {
    const unlawful = assessment();
    unlawful.lawfulness[field] = true;
    assert.throws(() => createZeroProviderSearchSupplyDecision(unlawful), /unlawful_zero_provider_supply_configuration/u);
  }
});

test('one failed benchmark stays visible and cannot be reported as ready', () => {
  const failed = assessment();
  failed.benchmark.crawl4aiPassed = false;
  const decision = createZeroProviderSearchSupplyDecision(failed);
  assert.equal(decision.benchmarkVerified, false);
  assert.ok(decision.failureCodes.includes('crawl4ai_benchmark_failed'));
  assert.throws(() => assertZeroProviderStage4Claim(decision, true), /dishonest_zero_provider_stage4_ready_status/u);
  assert.doesNotThrow(() => assertZeroProviderStage4Claim(decision, false));
});

test('checked-in benchmark proves strict tool success and current Clervo boundary failures without external calls', () => {
  assert.equal(benchmarkEvidence.ticket, 'N4.23A');
  assert.equal(benchmarkEvidence.corpusSha256, fixture.value.benchmark.corpusSha256);
  assert.equal(benchmarkEvidence.observations.scrapling.every((item) => item.status === 200 && item.markerFound), true);
  assert.equal(benchmarkEvidence.observations.redirect.status, 302);
  assert.equal(benchmarkEvidence.observations.redirect.followed, false);
  assert.equal(benchmarkEvidence.observations.crawl4ai.success, true);
  assert.equal(benchmarkEvidence.observations.crawl4ai.markerFound, true);
  assert.equal(benchmarkEvidence.observations.crawl4ai.stateDestroyed, true);
  assert.equal(benchmarkEvidence.observations.meilisearch.topHitId, 'static_commerce');
  assert.equal(benchmarkEvidence.observations.meilisearch.expectedTopHit, true);
  assert.ok(benchmarkEvidence.observations.clervoBoundary.robots.failureCodes.includes('robots_disallowed'));
  assert.ok(benchmarkEvidence.observations.clervoBoundary.oversized.failureCodes.includes('response_too_large'));
  assert.ok(benchmarkEvidence.observations.clervoBoundary.unsupportedMime.failureCodes.includes('content_type_not_allowed'));
  assert.equal(benchmarkEvidence.observations.clervoBoundary.forbiddenTargets.every((target) => !target.allowed), true);
  assert.equal(benchmarkEvidence.network.externalCallsDuringBenchmark, 0);
  assert.equal(benchmarkEvidence.cost.thirdPartySearchProviderCostUsd, '0.000000');
});
