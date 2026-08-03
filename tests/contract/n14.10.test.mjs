import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);

test('production cloud contract is bounded, recoverable, and leaves the protected gateway outside scope', async () => {
  const policy = JSON.parse(await readFile('infra/production/gcp/deployment.v1.json', 'utf8'));
  assert.equal(policy.state, 'private_candidate_verified');
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
    observedAt: '2026-08-03T14:32:23.747Z',
    artifactRepositoryCreated: true,
    artifactScanningActive: true,
    databaseInstanceCreated: true,
    databaseCreated: true,
    databaseSecretVersion: 2,
    secretContainersCreated: true,
    runtimeServiceAccountCreated: true,
    buildServiceAccountCreated: true,
    monitoringSecretVersionsCreated: true,
    cloudRunServiceCreated: true,
    iamApplied: true,
    monitoringSecretVersion: 1,
    cloudBuildId: '45301f8c-60b9-4935-be82-e9285821d8cb',
    releaseCommit: 'cf7110271c81b337ce14943d2f570d85196b305f',
    imageDigest: 'sha256:68d1ba96e04ac0c48c9a98f374470be67bc7f8994e90ab75a78b591de4662ba4',
    slsaBuildLevel: 3,
    effectiveCriticalVulnerabilities: 0,
    effectiveHighVulnerabilities: 0,
    managedMigrationsApplied: 5,
    managedBackupId: '1785755198118',
    managedRecoveryVerified: true,
    recoveryInstanceRemoved: true,
    authenticatedSmokePassed: true,
    monitoringDeliveryAcknowledged: true,
    rollbackDrillPassed: true,
    servingRevision: 'clervo-api-production-00001-yaf',
    candidateRevision: 'clervo-api-production-00002-seh',
    candidateTrafficPercent: 0,
    x402PreflightRevision: 'clervo-api-production-00005-ruv',
    x402PreflightTrafficPercent: 0,
    x402ChallengeVerified: true,
    x402SettlementEnabled: false,
    sandboxPrivateConnectivityQualified: true,
    sandboxServerlessSubnet: 'clervo-run-sandbox-uscentral1',
    sandboxInternalLoadBalancerIp: '10.128.40.250',
    sandboxConnectivityProbeStatus: 200,
    sandboxControlSecretVersion: 1,
    sandboxApiSecretVersion: 1,
    sandboxRuntimeIamApplied: true,
    sandboxCandidateCloudBuildId: '1fe05a3a-9e4f-49a4-8a40-791d983187d7',
    sandboxCandidateReleaseCommit: 'ed30dfef9dd06465a5610c256ad58585d013f53c',
    sandboxCandidateImageDigest: 'sha256:07473b2d698536367b196df026f47037f8da3a80910ef3080aaf99a344bd8800',
    sandboxCandidateSlsaBuildLevel: 3,
    sandboxCandidateEffectiveCriticalVulnerabilities: 0,
    sandboxCandidateEffectiveHighVulnerabilities: 0,
    sandboxCandidateDeployed: false,
    trafficChanged: true,
    publicInvokerEnabled: false,
    publicTrafficEnabled: false,
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
    'clervo-production-x402-key-id',
    'clervo-production-x402-key-secret',
    'clervo-production-x402-pay-to',
    'clervo-sandbox-control-token',
    'clervo-sandbox-api-token',
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
  for (let index = 1; index <= 14; index += 1) {
    assert.match(rootPackage.scripts['test:stage14'], new RegExp(`tests/contract/n14\\.${index}\\.test\\.mjs`, 'u'));
  }
  assert.match(rootPackage.scripts['test:stage14'], /npm audit --omit=dev --audit-level=high/u);
  assert.match(rootPackage.scripts['test:stage14'], /npm run scan:secrets/u);
  assert.match(build, /SECRET_SCAN_SOURCE_ARCHIVE=1/u);
  assert.match(rootPackage.scripts['test:stage14'], /verify-clean-room-boundary/u);
  const boundary = await readFile('scripts/verify-clean-room-boundary.sh', 'utf8');
  assert.match(boundary, /CLERVO_CLOUD_ACCEPTANCE/u);
  assert.doesNotMatch(build, /docker push/u);
  assert.doesNotMatch(build, /:latest/u);
  assert.doesNotMatch(build, /\$COMMIT_SHA/u);
  const release = await readFile('scripts/production/gcp-release.mjs', 'utf8');
  assert.match(release, /slsa_build_level < 3/u);
  assert.match(release, /analysisStatus === 'FINISHED_SUCCESS'/u);
  assert.match(release, /\['OS', 'NPM', 'SECRET'\]/u);
  assert.match(release, /artifact_analysis_incomplete/u);
  assert.match(release, /vulnerabilities\.CRITICAL/u);
  assert.match(release, /vulnerabilities\.HIGH/u);
  assert.match(release, /verify-artifact/u);
  assert.match(release, /private_bootstrap_requires_absent_service/u);
  assert.match(release, /candidate_requires_private_bootstrap/u);
  assert.doesNotMatch(release, /valuesForKey\(metadata, 'severity'/u);
  assert.doesNotMatch(release, /--no-automatic-updates/u);
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
  assert.equal(plan.state, 'private_candidate_verified');
  assert.equal(plan.candidateReceivesTrafficOnDeploy, false);
  assert.equal(plan.paymentEnabled, false);
  assert.equal(plan.ownerConfirmationRequired, true);
  assert.deepEqual(plan.mutationActions, ['bootstrap-private', 'deploy-candidate', 'deploy-x402-preflight', 'deploy-sandbox-private', 'promote', 'rollback']);
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

test('production Sentry delivery control is bounded and confirmation guarded', async () => {
  const { stdout } = await execute(process.execPath, ['scripts/production/qualify-sentry-delivery.mjs', 'plan'], {
    env: { PATH: process.env.PATH },
  });
  const plan = JSON.parse(stdout);
  assert.equal(plan.project, 'bloxsniper-prod');
  assert.equal(plan.secret, 'clervo-production-monitoring-endpoint');
  assert.equal(plan.customerPayloadsIncluded, false);
  assert.equal(plan.deliveryCount, 1);
  assert.equal(plan.paymentEffects, 0);
  const source = await readFile('scripts/production/qualify-sentry-delivery.mjs', 'utf8');
  assert.match(source, /deliver:sentry:/u);
  assert.doesNotMatch(source, /console\.log\([^)]*dsn/iu);
});

test('managed recovery verifier is read-only, loopback-bound, and payload-safe', async () => {
  const { stdout } = await execute(process.execPath, ['scripts/production/verify-managed-recovery.mjs', 'plan'], {
    env: { PATH: process.env.PATH },
  });
  const plan = JSON.parse(stdout);
  assert.equal(plan.mutation, false);
  assert.equal(plan.customerPayloadsRead, false);
  assert.equal(plan.credentialInput, 'stdin');
  const source = await readFile('scripts/production/verify-managed-recovery.mjs', 'utf8');
  assert.match(source, /recovery proxy must be loopback/u);
  assert.match(source, /customerPayloadsPrinted: false/u);
  assert.doesNotMatch(source, /SELECT \*/u);
});
