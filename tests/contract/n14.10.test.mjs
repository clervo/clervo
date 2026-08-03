import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);

test('production cloud contract is bounded, recoverable, and leaves the protected gateway outside scope', async () => {
  const policy = JSON.parse(await readFile('infra/production/gcp/deployment.v1.json', 'utf8'));
  assert.equal(policy.state, 'infrastructure_bootstrap_partial');
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
  assert.equal(policy.runtime.environment.CLERVO_X402_MODE, 'disabled');
  assert.equal(policy.rollout.candidateReceivesTrafficOnDeploy, false);
  assert.equal(policy.rollout.paidExecutionEnabled, false);
  assert.equal(policy.rollout.previousVerifiedRevisionRequired, true);
  assert.equal(policy.rollout.previousVerifiedImageDigestRequired, true);
  assert.equal(policy.rollout.ownerConfirmationRequiredForMutation, true);
  assert.deepEqual(policy.observedBootstrap, {
    observedAt: '2026-08-03T10:38:03.000Z',
    artifactRepositoryCreated: true,
    artifactScanningActive: true,
    databaseInstanceCreated: true,
    databaseCreated: true,
    databaseSecretVersion: 1,
    secretContainersCreated: true,
    runtimeServiceAccountCreated: true,
    buildServiceAccountCreated: true,
    monitoringSecretVersionsCreated: true,
    cloudRunServiceCreated: false,
    trafficChanged: false,
    paidExecutionEnabled: false,
  });
  assert.equal(policy.externalEffectsPerformed, true);
  assert.ok(policy.protectedResources.includes('ai.clervo.dev'));
  assert.ok(policy.leastPrivilege.runtimeForbiddenRoles.includes('roles/owner'));
  assert.ok(policy.leastPrivilege.runtimeForbiddenRoles.includes('roles/editor'));
  assert.deepEqual(policy.leastPrivilege.runtimeProjectRoles, ['roles/cloudsql.client']);
  assert.equal(policy.leastPrivilege.runtimeSecretRole, 'roles/secretmanager.secretAccessor');
  assert.deepEqual(policy.leastPrivilege.builderProjectRoles, ['roles/logging.logWriter']);
  assert.equal(policy.leastPrivilege.builderRepositoryRole, 'roles/artifactregistry.writer');
  assert.equal(policy.resources.cloudBuildSourceBucket, 'bloxsniper-prod_cloudbuild');
  assert.equal(policy.leastPrivilege.builderSourceBucketRole, 'roles/storage.objectViewer');
});

test('production IAM control is exact-project, least-privilege, and confirmation guarded', async () => {
  const { stdout } = await execute(process.execPath, ['scripts/production/gcp-iam.mjs', 'plan'], {
    env: { PATH: process.env.PATH },
  });
  const plan = JSON.parse(stdout);
  assert.equal(plan.project, 'bloxsniper-prod');
  assert.deepEqual(plan.accounts, ['clervo-api-production', 'clervo-production-builder']);
  assert.deepEqual(plan.runtime.projectRoles, ['roles/cloudsql.client']);
  assert.deepEqual(plan.runtime.secrets, [
    'clervo-production-database-url',
    'clervo-production-monitoring-endpoint',
  ]);
  assert.deepEqual(plan.builder.projectRoles, ['roles/logging.logWriter']);
  assert.equal(plan.builder.repositoryRole, 'roles/artifactregistry.writer');
  assert.equal(plan.builder.sourceBucket, 'bloxsniper-prod_cloudbuild');
  assert.equal(plan.builder.sourceBucketRole, 'roles/storage.objectViewer');
  assert.ok(plan.protectedResources.includes('ai.clervo.dev'));
  assert.ok(!plan.runtime.projectRoles.some((role) => plan.forbiddenRoles.includes(role)));
  assert.ok(!plan.builder.projectRoles.some((role) => plan.forbiddenRoles.includes(role)));

  await assert.rejects(
    execute(process.execPath, ['scripts/production/gcp-iam.mjs', 'apply'], {
      env: { PATH: process.env.PATH },
    }),
    /production_iam_refused:owner_confirmation_mismatch/u,
  );
});

test('Cloud Build is immutable, acceptance-gated, and requests verified provenance without an explicit push', async () => {
  const build = await readFile('infra/production/gcp/cloudbuild.yaml', 'utf8');
  const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(build, /node:24\.18\.1-bookworm-slim@sha256:[a-f0-9]{64}/u);
  assert.match(build, /gcr\.io\/cloud-builders\/docker@sha256:[a-f0-9]{64}/u);
  assert.match(build, /requestedVerifyOption: VERIFIED/u);
  assert.match(build, /images:\n  - us-central1-docker\.pkg\.dev\/\$PROJECT_ID\/clervo-production\/clervo-api:\$_RELEASE_SHA/u);
  assert.match(build, /grep -Eq '\^\[a-f0-9\]\{40\}\$'/u);
  assert.match(build, /logging: CLOUD_LOGGING_ONLY/u);
  assert.doesNotMatch(build, /machineType: E2_HIGHCPU_8/u);
  assert.match(build, /npm run test:stage14/u);
  for (let index = 1; index <= 12; index += 1) {
    assert.match(rootPackage.scripts['test:stage14'], new RegExp(`tests/contract/n14\\.${index}\\.test\\.mjs`, 'u'));
  }
  assert.match(rootPackage.scripts['test:stage14'], /npm audit --omit=dev --audit-level=high/u);
  assert.match(rootPackage.scripts['test:stage14'], /npm run scan:secrets/u);
  assert.match(rootPackage.scripts['test:stage14'], /verify-clean-room-boundary/u);
  assert.doesNotMatch(build, /docker push/u);
  assert.doesNotMatch(build, /:latest/u);
  assert.doesNotMatch(build, /\$COMMIT_SHA/u);
  const release = await readFile('scripts/production/gcp-release.mjs', 'utf8');
  assert.match(release, /slsa_build_level < 3/u);
  assert.match(release, /analysisStatus === 'FINISHED_SUCCESS'/u);
  assert.match(release, /\['OS', 'NPM', 'SECRET'\]/u);
  assert.match(release, /artifact_analysis_incomplete/u);
});

test('production build control binds a clean exact commit to the dedicated builder', async () => {
  const { stdout } = await execute(process.execPath, ['scripts/production/gcp-build.mjs', 'plan'], {
    env: {
      PATH: process.env.PATH,
      ...(process.env.CLERVO_CLOUD_ACCEPTANCE === 'true' ? {
        CLERVO_CLOUD_ACCEPTANCE: 'true',
        CLERVO_EXPECTED_RELEASE_SHA: process.env.CLERVO_EXPECTED_RELEASE_SHA,
      } : {}),
    },
  });
  const plan = JSON.parse(stdout);
  assert.match(plan.releaseSha, /^[a-f0-9]{40}$/u);
  assert.equal(typeof plan.cleanWorktree, 'boolean');
  assert.equal(plan.tag.endsWith(`:${plan.releaseSha}`), true);
  assert.equal(plan.serviceAccount, 'projects/bloxsniper-prod/serviceAccounts/clervo-production-builder@bloxsniper-prod.iam.gserviceaccount.com');
  const source = await readFile('scripts/production/gcp-build.mjs', 'utf8');
  assert.match(source, /production build requires a clean worktree/u);
  assert.match(source, /cloud acceptance context is plan-only/u);
  assert.match(source, /CLERVO_CLOUD_BUILD_CONFIRM/u);
  assert.match(source, /_RELEASE_SHA=/u);
});

test('release control is inspectable without credentials and mutations fail before gcloud without exact inputs', async () => {
  const { stdout } = await execute(process.execPath, ['scripts/production/gcp-release.mjs', 'plan'], {
    env: { PATH: process.env.PATH },
  });
  const plan = JSON.parse(stdout);
  assert.equal(plan.state, 'infrastructure_bootstrap_partial');
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
        CLERVO_SENTRY_DSN_SECRET_VERSION: '1',
      },
    }),
    /production_release_refused:protected_gateway_origin/u,
  );
});
