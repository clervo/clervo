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

test('bounded verification names every §7.1 check and closes Stage 4 only after every check passes', async () => {
  const { evidence, actualSourceState } = await loadStage4ExitInputs();
  const result = evaluateStage4Exit(evidence, actualSourceState);
  assert.equal(result.decision, 'passed');
  assert.equal(result.blockingCheckIds.length, 0);
  assert.equal(evidence.checks.length, REQUIRED_STAGE4_CHECK_IDS.length);
  assert.equal(evidence.referencePatternAuthorized, true);
  assert.equal(evidence.stage5Authorized, true);
});

test('a forged blocked decision cannot demote complete staging evidence', async () => {
  const { evidence, actualSourceState } = await loadStage4ExitInputs();
  const forged = clone(evidence);
  forged.decision = 'blocked';
  forged.referencePatternAuthorized = false;
  forged.stage5Authorized = false;
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
