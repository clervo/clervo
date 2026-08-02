import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePrivateStabilityCampaign,
  evaluatePrivateStabilityDrill,
  runPrivateStabilityDrills,
} from '../../dist/services/workflows/src/stability.js';

test('shared private stability campaign passes every required commerce, routing, cost, replay, cleanup, security, and recovery drill', async () => {
  const observations = await runPrivateStabilityDrills();
  const campaign = evaluatePrivateStabilityCampaign(observations);
  assert.equal(campaign.passed, true);
  assert.equal(campaign.results.length, 8);
  assert.ok(campaign.results.every(({ passed, failureCodes }) => passed && failureCodes.length === 0));
  assert.deepEqual(campaign.missingDrills, []);
});

test('unknown settlement never retries, executes, or clears without reconciliation', () => {
  const base = { drillId: 'settlement_unknown_quarantine', authorizations: 1, retries: 0, downstreamExecutions: 0, reconciliationRequired: true };
  assert.equal(evaluatePrivateStabilityDrill(base).passed, true);
  assert.deepEqual(evaluatePrivateStabilityDrill({ ...base, retries: 1 }).failureCodes, ['unknown_settlement_retried']);
  assert.deepEqual(evaluatePrivateStabilityDrill({ ...base, downstreamExecutions: 1 }).failureCodes, ['unknown_settlement_executed']);
  assert.deepEqual(evaluatePrivateStabilityDrill({ ...base, reconciliationRequired: false }).failureCodes, ['reconciliation_not_required']);
});

test('outage, replay, ceiling, cleanup, secret, recovery, and tamper regressions each fail visibly', async () => {
  const observations = await runPrivateStabilityDrills();
  const broken = [
    { ...observations[0], falseSuccesses: 1 },
    { ...observations[1], executions: 2 },
    { ...observations[3], observedCostMicrousd: 100_001 },
    { ...observations[4], remaining: 1 },
    { ...observations[5], leakedMarkers: 1 },
    { ...observations[6], duplicateExecutions: 1 },
    { ...observations[7], downstreamExecutions: 1 },
  ];
  assert.ok(broken.every((observation) => !evaluatePrivateStabilityDrill(observation).passed));
});

test('campaign rejects missing or duplicate drills instead of silently reducing coverage', async () => {
  const observations = await runPrivateStabilityDrills();
  assert.throws(() => evaluatePrivateStabilityCampaign(observations.slice(1)), /campaign_invalid/u);
  assert.throws(() => evaluatePrivateStabilityCampaign([...observations.slice(0, -1), observations[0]]), /campaign_invalid/u);
});
