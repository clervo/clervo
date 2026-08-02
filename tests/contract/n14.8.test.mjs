import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policy = JSON.parse(await readFile('infra/production/load-qualification.v1.json', 'utf8'));
const evidence = JSON.parse(await readFile('docs/evidence/production/load-qualification.v1.json', 'utf8'));
const script = await readFile('scripts/production/qualify-load.mjs', 'utf8');

test('load policy is bounded and qualification is local-only', () => {
  assert.equal(policy.burstRequests, 1000);
  assert.equal(policy.maximumConcurrentExecutions, 16);
  assert.equal(policy.steadyRequests, 256);
  assert.equal(policy.steadyClientConcurrency, 8);
  assert.equal(policy.providerCallsAllowed, false);
  assert.equal(policy.cloudResourcesAllowed, false);
  assert.equal(policy.paymentsAllowed, false);
  assert.match(script, /load_qualification_requires_clean_worktree/u);
  assert.doesNotMatch(script, /https:\/\/api\.clervo\.dev|ai\.clervo\.dev/u);
});

test('burst shedding, steady traffic, replay, recovery, latency, and memory pass', () => {
  assert.equal(evidence.burst.requests, policy.burstRequests);
  assert.equal(evidence.burst.admitted, policy.maximumConcurrentExecutions);
  assert.equal(evidence.burst.overloaded, policy.burstRequests - policy.maximumConcurrentExecutions);
  assert.equal(evidence.burst.unexpectedStatuses, 0);
  assert.equal(evidence.burst.replayedWithoutExecution, policy.maximumConcurrentExecutions);
  assert.equal(evidence.steady.requests, policy.steadyRequests);
  assert.equal(evidence.steady.succeeded, policy.steadyRequests);
  assert.ok(evidence.steady.p95Ms <= policy.maximumSteadyP95Ms);
  assert.ok(evidence.runtime.maximumActiveExecutions <= policy.maximumConcurrentExecutions);
  assert.ok(evidence.runtime.rssGrowthBytes <= policy.maximumRssGrowthBytes);
  assert.equal(evidence.recovery.usefulTrafficAfterBurst, true);
  assert.equal(evidence.recovery.replayCausedDuplicateExecution, false);
  assert.deepEqual(evidence.externalEffects, {
    cloudResourcesChanged: false,
    providerCalls: 0,
    payments: 0,
    ownerCashSpentUsd: 0,
  });
  assert.equal(evidence.productionReady, false);
});
