import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);

test('production cloud contract is bounded, recoverable, and leaves the protected gateway outside scope', async () => {
  const policy = JSON.parse(await readFile('infra/production/gcp/deployment.v1.json', 'utf8'));
  assert.equal(policy.state, 'repository_ready_cloud_unapplied');
  assert.equal(policy.project, 'bloxsniper-prod');
  assert.equal(policy.region, 'us-central1');
  assert.equal(policy.database.engine, 'POSTGRES_18');
  assert.equal(policy.database.observedSupportedMinor, '18.4');
  assert.equal(policy.database.availability, 'regional');
  assert.equal(policy.database.deletionProtection, true);
  assert.equal(policy.database.pointInTimeRecovery, true);
  assert.equal(policy.database.transactionLogRetentionDays, 7);
  assert.equal(policy.runtime.authentication, 'required_until_public_launch');
  assert.equal(policy.runtime.minimumInstances, 0);
  assert.equal(policy.runtime.maximumInstances, 5);
  assert.equal(policy.runtime.containerConcurrency, 16);
  assert.equal(policy.runtime.secretVersionsMustBePinned, true);
  assert.equal(policy.runtime.environment.CLERVO_STATE_BACKEND, 'postgres');
  assert.equal(policy.runtime.environment.CLERVO_TRAFFIC_MODE, 'open');
  assert.equal(policy.rollout.candidateReceivesTrafficOnDeploy, false);
  assert.equal(policy.rollout.paidExecutionEnabled, false);
  assert.equal(policy.rollout.previousVerifiedRevisionRequired, true);
  assert.equal(policy.rollout.previousVerifiedImageDigestRequired, true);
  assert.equal(policy.rollout.ownerConfirmationRequiredForMutation, true);
  assert.equal(policy.externalEffectsPerformed, false);
  assert.ok(policy.protectedResources.includes('ai.clervo.dev'));
  assert.ok(policy.leastPrivilege.runtimeForbiddenRoles.includes('roles/owner'));
  assert.ok(policy.leastPrivilege.runtimeForbiddenRoles.includes('roles/editor'));
});

test('Cloud Build is immutable, acceptance-gated, and requests verified provenance without an explicit push', async () => {
  const build = await readFile('infra/production/gcp/cloudbuild.yaml', 'utf8');
  assert.match(build, /node:24\.18\.1-bookworm-slim@sha256:[a-f0-9]{64}/u);
  assert.match(build, /gcr\.io\/cloud-builders\/docker@sha256:[a-f0-9]{64}/u);
  assert.match(build, /requestedVerifyOption: VERIFIED/u);
  assert.match(build, /images:\n  - us-central1-docker\.pkg\.dev\/\$PROJECT_ID\/clervo-production\/clervo-api:\$COMMIT_SHA/u);
  assert.match(build, /tests\/contract\/n14\.10\.test\.mjs/u);
  assert.match(build, /npm audit --omit=dev --audit-level=high/u);
  assert.doesNotMatch(build, /docker push/u);
  assert.doesNotMatch(build, /:latest/u);
  const release = await readFile('scripts/production/gcp-release.mjs', 'utf8');
  assert.match(release, /slsa_build_level < 3/u);
  assert.match(release, /analysisStatus === 'FINISHED_SUCCESS'/u);
  assert.match(release, /\['OS', 'NPM', 'SECRET'\]/u);
  assert.match(release, /artifact_analysis_incomplete/u);
});

test('release control is inspectable without credentials and mutations fail before gcloud without exact inputs', async () => {
  const { stdout } = await execute(process.execPath, ['scripts/production/gcp-release.mjs', 'plan'], {
    env: { PATH: process.env.PATH },
  });
  const plan = JSON.parse(stdout);
  assert.equal(plan.state, 'repository_ready_cloud_unapplied');
  assert.equal(plan.candidateReceivesTrafficOnDeploy, false);
  assert.equal(plan.paymentEnabled, false);
  assert.equal(plan.ownerConfirmationRequired, true);
  assert.ok(plan.protectedResources.includes('ai.clervo.dev'));

  await assert.rejects(
    execute(process.execPath, ['scripts/production/gcp-release.mjs', 'deploy-candidate'], {
      env: { PATH: process.env.PATH },
    }),
    /production_release_refused:missing_clervo_release_id/u,
  );
});

test('release control rejects the protected gateway origin before any cloud command', async () => {
  const sha = 'a'.repeat(40);
  const digest = `us-central1-docker.pkg.dev/bloxsniper-prod/clervo-production/clervo-api@sha256:${'b'.repeat(64)}`;
  await assert.rejects(
    execute(process.execPath, ['scripts/production/gcp-release.mjs', 'validate'], {
      env: {
        PATH: process.env.PATH,
        CLERVO_RELEASE_ID: sha,
        CLERVO_PRODUCTION_IMAGE: digest,
        CLERVO_CLOUD_SQL_CONNECTION: 'bloxsniper-prod:us-central1:clervo-production-postgres',
        CLERVO_PRODUCTION_ORIGIN: 'https://ai.clervo.dev/',
        CLERVO_DATABASE_SECRET_VERSION: '1',
        CLERVO_MONITORING_ENDPOINT_SECRET_VERSION: '1',
        CLERVO_MONITORING_AUTHORIZATION_SECRET_VERSION: '1',
      },
    }),
    /production_release_refused:protected_gateway_origin/u,
  );
});
