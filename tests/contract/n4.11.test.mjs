import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUIRED_STAGE4_CHECK_IDS,
  evaluateStage4Exit,
  loadStage4ExitInputs,
} from '../../scripts/verify-stage4-exit.mjs';

function clone(value) {
  return structuredClone(value);
}

test('bounded verification names every §7.1 check and blocks Stage 4 exit truthfully', async () => {
  const { evidence, actualSourceState } = await loadStage4ExitInputs();
  const result = evaluateStage4Exit(evidence, actualSourceState);
  assert.equal(result.decision, 'blocked');
  assert.equal(result.blockingCheckIds.length, REQUIRED_STAGE4_CHECK_IDS.length);
  assert.equal(evidence.referencePatternAuthorized, false);
  assert.equal(evidence.stage5Authorized, false);
  assert.ok(result.blockingCheckIds.includes('deployed_free_sample'));
  assert.ok(result.blockingCheckIds.includes('deployed_paid_route'));
  assert.ok(result.blockingCheckIds.includes('monitoring'));
  assert.ok(result.blockingCheckIds.includes('cost_caps'));
});

test('a forged passed decision cannot promote recorded evidence to staging evidence', async () => {
  const { evidence, actualSourceState } = await loadStage4ExitInputs();
  const forged = clone(evidence);
  forged.decision = 'passed';
  forged.referencePatternAuthorized = true;
  forged.stage5Authorized = true;
  assert.throws(
    () => evaluateStage4Exit(forged, actualSourceState),
    /decision must be recomputed from staging evidence/u,
  );
});

test('missing requirement coverage fails closed', async () => {
  const { evidence, actualSourceState } = await loadStage4ExitInputs();
  const incomplete = clone(evidence);
  incomplete.checks = incomplete.checks.filter((check) => check.id !== 'isolated_javascript_retrieval');
  assert.throws(
    () => evaluateStage4Exit(incomplete, actualSourceState),
    /must cover every §7\.1 requirement and gate/u,
  );
});

test('source-state drift or invented deployment evidence fails closed', async () => {
  const { evidence, actualSourceState } = await loadStage4ExitInputs();
  const invented = clone(evidence);
  invented.sourceState.stagingReleaseStatus = 'verified';
  assert.throws(
    () => evaluateStage4Exit(invented, actualSourceState),
    /source-state assertions do not match checked-in artifacts/u,
  );
});