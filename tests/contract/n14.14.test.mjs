import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policy = JSON.parse(await readFile('infra/production/gcp/migration-job.v1.json', 'utf8'));
const dockerfile = await readFile('infra/production/gcp/Dockerfile.migrations', 'utf8');
const cloudbuild = await readFile('infra/production/gcp/cloudbuild.yaml', 'utf8');
const runner = await readFile('scripts/production/gcp-migration-job.mjs', 'utf8');
const migrator = await readFile('scripts/production/apply-postgres-migrations.mjs', 'utf8');
const evidence = JSON.parse(await readFile('docs/evidence/production/managed-sandbox-candidate-live-smoke.v1.json', 'utf8'));

test('managed migrator is immutable, non-root, and contains only runtime dependencies plus migrations', () => {
  assert.match(dockerfile, /node:24\.18\.1-bookworm-slim@sha256:[a-f0-9]{64}/u);
  assert.match(dockerfile, /distroless\/nodejs24-debian13:nonroot@sha256:[a-f0-9]{64}/u);
  assert.match(dockerfile, /--omit=dev --omit=optional --ignore-scripts/u);
  assert.match(dockerfile, /USER 65532:65532/u);
  assert.match(dockerfile, /apply-postgres-migrations\.mjs/u);
  assert.match(dockerfile, /infra\/storage\/postgres/u);
  assert.doesNotMatch(dockerfile, /COPY \. \./u);
  assert.match(cloudbuild, /clervo-migrator:\$_RELEASE_SHA/u);
});

test('managed migration and zero-traffic Sandbox candidate passed live with durable replay and cleanup', () => {
  assert.deepEqual(evidence.managedMigration.applied, ['0006-sandbox-operation-state.sql']);
  assert.equal(evidence.managedMigration.checksumVerifiedAndSkipped.length, 5);
  assert.equal(evidence.candidate.trafficPercent, 0);
  assert.equal(evidence.candidate.sandboxMode, 'private');
  assert.equal(evidence.candidate.paymentMode, 'disabled');
  assert.equal(evidence.smoke.firstStatus, 200);
  assert.equal(evidence.smoke.firstReplay, false);
  assert.equal(evidence.smoke.secondStatus, 200);
  assert.equal(evidence.smoke.secondReplay, true);
  assert.equal(evidence.smoke.usefulOutput, 'sandbox-api-live');
  assert.equal(evidence.smoke.meteredCharge.amountAtomic, '0');
  assert.equal(evidence.smoke.remainingSandboxClaims, 0);
  assert.equal(evidence.smoke.remainingExecutionPods, 0);
  assert.ok(Object.values(evidence.cleanup).every(Boolean));
  assert.equal(evidence.boundaries.publicInvokerEnabled, false);
  assert.equal(evidence.boundaries.productionServingRevisionChanged, false);
  assert.equal(evidence.boundaries.usdcSpent, 0);
  assert.equal(evidence.boundaries.protectedGatewayTouched, false);
});

test('managed migration job injects its pinned secret without reading it on the VM and always cleans up', () => {
  assert.equal(policy.databaseSecretVersion, 2);
  assert.equal(policy.state, 'prepared_owner_approval');
  assert.equal(policy.targetMigration, '0008-prediction-dynamic-venues.sql');
  assert.deepEqual(policy.expectedPendingMigrations, ['0007-prediction-market-state.sql', '0008-ai-free-tier-quota.sql', '0008-prediction-dynamic-venues.sql']);
  assert.equal(policy.maximumRetries, 0);
  assert.equal(policy.taskCount, 1);
  assert.equal(policy.boundaries.credentialInjectedByPlatform, true);
  assert.equal(policy.boundaries.credentialReadByVm, false);
  assert.equal(policy.boundaries.publicEndpoint, false);
  assert.match(runner, /--set-secrets/u);
  assert.match(runner, /--set-cloudsql-instances/u);
  assert.match(runner, /FINISHED_SUCCESS/u);
  assert.match(runner, /finally \{\s*removeJob\(\)/u);
  assert.match(runner, /job_cleanup_failed/u);
  assert.match(runner, /`apply:\$\{policy\.targetMigration\}:\$\{policy\.project\}`/u);
  assert.match(runner, /CLERVO_DATABASE_MIGRATION_TARGET=\$\{policy\.targetMigration\}/u);
  assert.match(migrator, /records\.slice\(0, targetIndex \+ 1\)/u);
  assert.doesNotMatch(runner, /secrets', 'versions', 'access|console\.log\([^)]*(secret|database)/iu);
});
