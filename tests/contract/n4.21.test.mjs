import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertRetrievalExecutionProofClaim,
  createRetrievalExecutionProofDecision,
} from '../../dist/packages/contracts/src/index.js';

const fixture = JSON.parse(await readFile(new URL('../../packages/contracts/fixtures/retrieval-execution-proof-valid.json', import.meta.url), 'utf8'));
const cases = JSON.parse(await readFile(new URL('../fixtures/n4.21-retrieval-execution-cases.json', import.meta.url), 'utf8'));

function assessment() {
  const value = structuredClone(fixture.value);
  delete value.contractVersion;
  delete value.brokerReady;
  delete value.archiveReady;
  delete value.developmentReady;
  delete value.productionReady;
  delete value.status;
  delete value.failureCodes;
  delete value.productionBlockers;
  return value;
}

test('live N4.21 fixture recomputes one loopback broker and one exact Common Crawl range as development-ready only', () => {
  const decision = createRetrievalExecutionProofDecision(assessment());
  assert.deepEqual(decision, fixture.value);
  assert.equal(decision.brokerReady, true);
  assert.equal(decision.archiveReady, true);
  assert.equal(decision.developmentReady, true);
  assert.equal(decision.productionReady, false);
  assert.equal(decision.status, 'verified');
  assert.deepEqual(decision.broker.upstreams.map((item) => item.engineName), ['wikipedia', 'openstreetmap']);
  assert.equal(decision.archive.index.length, decision.archive.range.responseBytes);
});

test('broker unavailable fails closed without changing production authorization', () => {
  const value = assessment();
  Object.assign(value.broker, cases.brokerUnavailable.brokerPatch);
  const decision = createRetrievalExecutionProofDecision(value);
  assert.equal(decision.brokerReady, false);
  assert.equal(decision.developmentReady, false);
  assert.equal(decision.productionReady, false);
  assert.equal(decision.status, 'degraded');
  assert.ok(decision.failureCodes.includes('broker_unavailable'));
});

test('one unavailable upstream degrades independently and cannot leave the broker ready', () => {
  const value = assessment();
  Object.assign(value.broker.upstreams[cases.oneUpstreamUnavailable.upstreamIndex], cases.oneUpstreamUnavailable.upstreamPatch);
  const decision = createRetrievalExecutionProofDecision(value);
  assert.equal(decision.brokerReady, false);
  assert.equal(decision.archiveReady, true);
  assert.equal(decision.status, 'degraded');
  assert.ok(decision.failureCodes.includes('upstream_unavailable_openstreetmap'));
});

test('duplicate failure domains and exact-identity substitution are rejected', () => {
  const duplicate = assessment();
  const duplicateCase = cases.duplicateFailureDomain;
  duplicate.broker.upstreams[duplicateCase.upstreamIndex][duplicateCase.field]
    = duplicate.broker.upstreams[duplicateCase.copyFromUpstreamIndex][duplicateCase.field];
  const duplicateDecision = createRetrievalExecutionProofDecision(duplicate);
  assert.equal(duplicateDecision.developmentReady, false);
  assert.ok(duplicateDecision.failureCodes.includes('duplicate_failure_domain'));

  const substituted = assessment();
  Object.assign(substituted.broker.upstreams[cases.identitySubstitution.upstreamIndex], cases.identitySubstitution.upstreamPatch);
  const substitutedDecision = createRetrievalExecutionProofDecision(substituted);
  assert.equal(substitutedDecision.brokerReady, false);
  assert.ok(substitutedDecision.failureCodes.includes('upstream_identity_substitution'));
});

test('stale execution evidence cannot remain ready', () => {
  const value = assessment();
  value.evaluatedAt = cases.staleEvidence.evaluatedAt;
  const decision = createRetrievalExecutionProofDecision(value);
  assert.equal(decision.brokerReady, false);
  assert.equal(decision.archiveReady, false);
  assert.equal(decision.developmentReady, false);
  assert.ok(decision.failureCodes.includes('evidence_stale'));
});

test('a Common Crawl index miss never authorizes a range or archive readiness', () => {
  const value = assessment();
  Object.assign(value.archive.index, cases.commonCrawlIndexMiss.indexPatch);
  Object.assign(value.archive.range, cases.commonCrawlIndexMiss.rangePatch);
  const decision = createRetrievalExecutionProofDecision(value);
  assert.equal(decision.archiveReady, false);
  assert.equal(decision.developmentReady, false);
  assert.ok(decision.failureCodes.includes('common_crawl_index_miss'));
  assert.ok(decision.failureCodes.includes('common_crawl_range_retrieval_failed'));
});

test('invalid and excessive Common Crawl ranges fail before a ready claim', () => {
  const invalid = assessment();
  Object.assign(invalid.archive.range, cases.invalidRange.rangePatch);
  const invalidDecision = createRetrievalExecutionProofDecision(invalid);
  assert.equal(invalidDecision.archiveReady, false);
  assert.ok(invalidDecision.failureCodes.includes('common_crawl_range_invalid_or_excessive'));

  const excessive = assessment();
  Object.assign(excessive.archive.index, cases.excessiveRange.indexPatch);
  Object.assign(excessive.archive.range, cases.excessiveRange.rangePatch);
  const excessiveDecision = createRetrievalExecutionProofDecision(excessive);
  assert.equal(excessiveDecision.archiveReady, false);
  assert.ok(excessiveDecision.failureCodes.includes('common_crawl_range_invalid_or_excessive'));
});

test('a Common Crawl compressed-content hash mismatch fails closed', () => {
  const value = assessment();
  Object.assign(value.archive.range, cases.contentHashMismatch.rangePatch);
  const decision = createRetrievalExecutionProofDecision(value);
  assert.equal(decision.archiveReady, false);
  assert.equal(decision.developmentReady, false);
  assert.ok(decision.failureCodes.includes('common_crawl_content_hash_mismatch'));
});

test('a dishonest ready status is rejected even when supplied by a caller', () => {
  const value = assessment();
  Object.assign(value.broker, cases.dishonestReadyStatus.brokerPatch);
  const decision = createRetrievalExecutionProofDecision(value);
  assert.equal(decision.developmentReady, false);
  assert.throws(
    () => assertRetrievalExecutionProofClaim(decision, cases.dishonestReadyStatus.claimedDevelopmentReady),
    /dishonest_retrieval_execution_ready_status/u,
  );
  assert.doesNotThrow(() => assertRetrievalExecutionProofClaim(decision, false));
});
