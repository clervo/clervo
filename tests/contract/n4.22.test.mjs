import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadStage4CampaignInputs,
  validateStage4Campaign,
} from '../../scripts/verify-stage4-campaign.mjs';

function clone(value) {
  return structuredClone(value);
}

test('N4.22 campaign matrix exactly covers the 21 source-bound staging blockers and stops at the external gate', async () => {
  const inputs = await loadStage4CampaignInputs();
  const result = validateStage4Campaign(inputs.matrix, inputs.stageResult, inputs.packageJson, inputs.tsconfig);
  assert.equal(result.blockerCount, 21);
  assert.equal(result.nextTicket, 'N4.23');
  assert.equal(result.nextTicketStatus, 'blocked_external');
  assert.ok(result.externalReasons.includes('staging_credentials_unavailable'));
  assert.ok(result.externalReasons.includes('lawful_production_supply_decision_missing'));
});

test('missing or substituted blocker identities fail closed', async () => {
  const inputs = await loadStage4CampaignInputs();
  const missing = clone(inputs.matrix);
  missing.blockers.pop();
  assert.throws(
    () => validateStage4Campaign(missing, inputs.stageResult, inputs.packageJson, inputs.tsconfig),
    /describe every blocker exactly once/u,
  );

  const substituted = clone(inputs.matrix);
  substituted.blockers[0].id = 'invented_local_success';
  assert.throws(
    () => validateStage4Campaign(substituted, inputs.stageResult, inputs.packageJson, inputs.tsconfig),
    /must match exact Stage 4 order and identity/u,
  );
});

test('local-only evidence cannot be presented as a staging remediation', async () => {
  const inputs = await loadStage4CampaignInputs();
  const forged = clone(inputs.matrix);
  forged.blockers[0].resolutionBoundary = ['local'];
  assert.throws(
    () => validateStage4Campaign(forged, inputs.stageResult, inputs.packageJson, inputs.tsconfig),
    /local evidence cannot close a staging blocker/u,
  );
});

test('TypeScript editor mismatch cannot force a target downgrade after workspace validation passes', async () => {
  const inputs = await loadStage4CampaignInputs();
  const downgraded = clone(inputs.matrix);
  downgraded.typescript.target = 'ES2022';
  downgraded.typescript.repositoryChangeRequired = true;
  assert.throws(
    () => validateStage4Campaign(downgraded, inputs.stageResult, inputs.packageJson, inputs.tsconfig),
    /TypeScript target drift/u,
  );
});

test('campaign dependencies must be ordered and external gates cannot be silently promoted', async () => {
  const inputs = await loadStage4CampaignInputs();
  const unordered = clone(inputs.matrix);
  unordered.campaignQueue[1].dependsOn = ['N4.28'];
  assert.throws(
    () => validateStage4Campaign(unordered, inputs.stageResult, inputs.packageJson, inputs.tsconfig),
    /dependency must precede ticket/u,
  );

  const promoted = clone(inputs.matrix);
  promoted.campaignQueue.find((item) => item.ticket === 'N4.23').status = 'complete';
  assert.throws(
    () => validateStage4Campaign(promoted, inputs.stageResult, inputs.packageJson, inputs.tsconfig),
    /actual/u,
  );
});
