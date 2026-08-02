import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policy = JSON.parse(await readFile('infra/production/postgres-qualification.v1.json', 'utf8'));
const evidence = JSON.parse(await readFile('docs/evidence/production/postgres-recovery-qualification.v1.json', 'utf8'));
const script = await readFile('scripts/production/qualify-postgres-recovery.mjs', 'utf8');

test('PostgreSQL recovery qualification is digest-pinned, isolated, and disposable', () => {
  assert.equal(policy.postgresVersion, '18.4');
  assert.match(policy.image, /^postgres:18\.4-bookworm@sha256:[a-f0-9]{64}$/u);
  assert.equal(policy.productionDataAllowed, false);
  assert.equal(policy.cloudResourcesAllowed, false);
  assert.equal(policy.realPaymentsAllowed, false);
  assert.match(script, /postgres_recovery_qualification_requires_clean_worktree/u);
  assert.match(script, /127\.0\.0\.1::5432/u);
  assert.match(script, /--single-transaction/u);
  assert.match(script, /--no-owner/u);
  assert.match(script, /removeContainer\(sourceName\)/u);
  assert.match(script, /removeVolume\(sourceVolume\)/u);
});

test('live local evidence proves restart, backup, isolated restore, replay, retention, and cleanup', () => {
  assert.equal(evidence.postgresVersion, policy.postgresVersion);
  assert.equal(evidence.image, policy.image);
  assert.deepEqual(evidence.migrations, [
    '0001-retrieval-cache.sql',
    '0002-live-intelligence-monitoring.sql',
    '0003-search-http-state.sql',
  ]);
  assert.equal(evidence.checks.exactImageDigest, true);
  assert.equal(evidence.checks.migrationsApplied, true);
  assert.equal(evidence.checks.atomicClaimCompleteReplay, true);
  assert.equal(evidence.checks.conflictRejected, true);
  assert.deepEqual(evidence.checks.quotaAllowedThenRejected, [true, true, true, false]);
  assert.equal(evidence.checks.processRestartReplay, true);
  assert.equal(evidence.checks.backupArchiveNonEmpty, true);
  assert.match(evidence.checks.backupArchiveHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(evidence.checks.isolatedRestoreReady, true);
  assert.equal(evidence.checks.restoredReplayMatched, true);
  assert.equal(evidence.checks.retentionPlanCountOnly, true);
  assert.equal(evidence.checks.expiredRetentionApplied, true);
  assert.equal(evidence.checks.queueDuplicateIdRejected, true);
  assert.equal(evidence.checks.queueActiveJobRecoveredAfterWorkerLoss, true);
  assert.equal(evidence.checks.queueRetryCompleted, true);
  assert.equal(evidence.checks.queueDeadLettered, true);
  assert.equal(evidence.checks.queueStateRestoredFromBackup, true);
  assert.deepEqual(evidence.cleanup, {
    sourceContainerRemoved: true,
    restoreContainerRemoved: true,
    sourceVolumeRemoved: true,
    restoreVolumeRemoved: true,
    temporaryArchiveRemoved: true,
  });
  assert.deepEqual(evidence.externalEffects, {
    cloudResourcesChanged: false,
    productionDataRead: false,
    productionDataChanged: false,
    providerCalls: 0,
    payments: 0,
    ownerCashSpentUsd: 0,
  });
  assert.equal(evidence.productionReady, false);
});
