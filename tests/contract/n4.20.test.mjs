import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertDevelopmentRetrievalSupplyClaim,
  createDevelopmentRetrievalSupplyDecision,
} from '../../dist/packages/contracts/src/index.js';

const fixture = JSON.parse(await readFile(new URL('../../packages/contracts/fixtures/development-retrieval-supply-provisional.json', import.meta.url), 'utf8'));
const cases = JSON.parse(await readFile(new URL('../fixtures/n4.20-development-supply-cases.json', import.meta.url), 'utf8'));

function sourceAssessment(source) {
  const { developmentEligible, productionEligible, failureCodes, ...assessment } = source;
  return assessment;
}

function concreteAssessment() {
  const value = structuredClone(fixture.value);
  return {
    qualificationId: value.qualificationId,
    n419DecisionId: value.n419DecisionId,
    evaluatedAt: value.evaluatedAt,
    environment: value.environment,
    productionAuthorization: value.productionAuthorization,
    broker: {
      brokerId: value.broker.brokerId,
      softwareId: value.broker.softwareId,
      observedVersion: value.broker.observedVersion,
      deployment: value.broker.deployment,
      endpointScope: value.broker.endpointScope,
      qualificationStatus: value.broker.qualificationStatus,
      healthStatus: value.broker.healthStatus,
      checkedAt: value.broker.checkedAt,
      expiresAt: value.broker.expiresAt,
      evidence: value.broker.evidence,
      upstreams: value.broker.upstreams.map(sourceAssessment),
    },
    archive: sourceAssessment(value.archive),
  };
}

function verifiedAssessment() {
  const assessment = concreteAssessment();
  Object.assign(assessment.broker, cases.success.broker);
  Object.assign(assessment.archive, cases.success.archive);
  return assessment;
}

function patchUpstream(assessment, caseFixture) {
  const source = assessment.broker.upstreams[caseFixture.upstreamIndex];
  assert.ok(source);
  Object.assign(source, caseFixture.patch);
  return source;
}

test('concrete N4.20 composition is immutable, source-bound, and honestly provisional', () => {
  const decision = createDevelopmentRetrievalSupplyDecision(concreteAssessment());
  assert.deepEqual(decision, fixture.value);
  assert.equal(decision.result, 'provisional');
  assert.equal(decision.developmentReady, false);
  assert.equal(decision.productionReady, false);
  assert.deepEqual(decision.broker.upstreams.map((source) => source.providerId), [
    'provider_wikimedia.wikipedia',
    'provider_openstreetmap.nominatim',
  ]);
  assert.equal(decision.archive.providerId, 'provider_commoncrawl');
  assert.equal(decision.archive.role, 'direct_archive');
});

test('deterministic success qualifies development only and never authorizes production', () => {
  const decision = createDevelopmentRetrievalSupplyDecision(verifiedAssessment());
  assert.equal(decision.brokerReady, true);
  assert.equal(decision.archiveReady, true);
  assert.equal(decision.developmentReady, true);
  assert.equal(decision.productionReady, false);
  assert.equal(decision.result, 'verified');
  assert.ok(decision.productionBlockers.includes('production_authorization_absent'));
});

test('fewer than two upstreams and duplicate provider or failure-domain identities fail closed', () => {
  const fewer = verifiedAssessment();
  fewer.broker.upstreams = [fewer.broker.upstreams[0]];
  const fewerDecision = createDevelopmentRetrievalSupplyDecision(fewer);
  assert.equal(fewerDecision.developmentReady, false);
  assert.ok(fewerDecision.failureCodes.includes('metasearch_requires_two_upstreams'));

  for (const name of ['duplicateProvider', 'duplicateFailureDomain']) {
    const assessment = verifiedAssessment();
    const caseFixture = cases[name];
    const target = assessment.broker.upstreams[caseFixture.upstreamIndex];
    const source = assessment.broker.upstreams[caseFixture.copyFromUpstreamIndex];
    for (const field of caseFixture.fields) target[field] = source[field];
    const decision = createDevelopmentRetrievalSupplyDecision(assessment);
    assert.equal(decision.developmentReady, false);
    assert.ok(decision.failureCodes.includes(name === 'duplicateProvider'
      ? 'duplicate_metasearch_upstream_provider'
      : 'duplicate_metasearch_failure_domain'));
  }
});

test('public shared SearXNG and Common Crawl counted as an engine are rejected', () => {
  const shared = verifiedAssessment();
  Object.assign(shared.broker, cases.publicSharedSearxng.broker);
  const sharedDecision = createDevelopmentRetrievalSupplyDecision(shared);
  assert.equal(sharedDecision.result, 'blocked');
  assert.ok(sharedDecision.failureCodes.includes('public_shared_searxng_ineligible'));

  const counted = verifiedAssessment();
  patchUpstream(counted, cases.commonCrawlCountedAsBrokerUpstream);
  const countedDecision = createDevelopmentRetrievalSupplyDecision(counted);
  assert.equal(countedDecision.developmentReady, false);
  assert.ok(countedDecision.failureCodes.includes('common_crawl_counted_as_broker_upstream'));
});

test('stale qualification, missing or prohibited terms, unknown quota, and missing cost ceiling fail closed', () => {
  const stale = verifiedAssessment();
  stale.evaluatedAt = cases.staleQualification.evaluatedAt;
  const staleDecision = createDevelopmentRetrievalSupplyDecision(stale);
  assert.equal(staleDecision.developmentReady, false);
  assert.ok(staleDecision.broker.upstreams[0].failureCodes.includes('qualification_stale'));

  const missingTerms = verifiedAssessment();
  const missingTermsSource = missingTerms.broker.upstreams[cases.missingTerms.upstreamIndex];
  missingTermsSource.evidence = missingTermsSource.evidence.filter((item) => item.name !== cases.missingTerms.removeEvidence);
  const missingTermsDecision = createDevelopmentRetrievalSupplyDecision(missingTerms);
  assert.ok(missingTermsDecision.broker.upstreams[0].failureCodes.includes('evidence_missing_terms'));

  const prohibited = verifiedAssessment();
  patchUpstream(prohibited, cases.prohibitedTerms);
  const prohibitedDecision = createDevelopmentRetrievalSupplyDecision(prohibited);
  assert.equal(prohibitedDecision.result, 'blocked');
  assert.ok(prohibitedDecision.broker.upstreams[0].failureCodes.includes('terms_prohibited'));

  const unknownQuota = verifiedAssessment();
  patchUpstream(unknownQuota, cases.unknownQuota);
  assert.ok(createDevelopmentRetrievalSupplyDecision(unknownQuota).broker.upstreams[0].failureCodes.includes('quota_unknown'));

  const missingCost = verifiedAssessment();
  delete missingCost.broker.upstreams[cases.missingCostCeiling.upstreamIndex][cases.missingCostCeiling.removeField];
  assert.ok(createDevelopmentRetrievalSupplyDecision(missingCost).broker.upstreams[0].failureCodes.includes('cost_ceiling_missing'));
});

test('provider failure degrades safely and identity substitution is never silent', () => {
  const failed = verifiedAssessment();
  patchUpstream(failed, cases.providerFailure);
  const failedDecision = createDevelopmentRetrievalSupplyDecision(failed);
  assert.equal(failedDecision.result, 'degraded');
  assert.equal(failedDecision.developmentReady, false);
  assert.ok(failedDecision.broker.upstreams[0].failureCodes.includes('health_unavailable'));

  const substituted = verifiedAssessment();
  patchUpstream(substituted, cases.identitySubstitution);
  const substitutedDecision = createDevelopmentRetrievalSupplyDecision(substituted);
  assert.equal(substitutedDecision.developmentReady, false);
  assert.ok(substitutedDecision.broker.upstreams[0].failureCodes.includes('provider_identity_substitution'));
});

test('an unavailable upstream cannot be presented with a dishonest ready status', () => {
  const assessment = verifiedAssessment();
  patchUpstream(assessment, cases.dishonestReady);
  const decision = createDevelopmentRetrievalSupplyDecision(assessment);
  assert.equal(decision.developmentReady, false);
  assert.throws(
    () => assertDevelopmentRetrievalSupplyClaim(decision, cases.dishonestReady.claimedDevelopmentReady),
    /dishonest_development_supply_ready_status/u,
  );
  assert.doesNotThrow(() => assertDevelopmentRetrievalSupplyClaim(decision, false));
});
