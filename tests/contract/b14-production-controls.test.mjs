import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

test('current production policy describes the serving system without historical qualification IDs', async () => {
  const deployment = await json('infra/production/gcp/deployment.v1.json');
  assert.equal(deployment.state, 'active_production_policy');
  assert.equal(deployment.database.availability, 'regional');
  assert.equal(deployment.database.deletionProtection, true);
  assert.equal(deployment.database.pointInTimeRecovery, true);
  assert.equal(deployment.runtime.authentication, 'edge_authorization_required');
  assert.equal(deployment.runtime.environment.CLERVO_STATE_BACKEND, 'postgres');
  assert.equal(deployment.runtime.environment.CLERVO_TRAFFIC_MODE, 'open');
  assert.equal(deployment.runtime.environment.CLERVO_X402_MODE, 'settlement_enabled');
  assert.equal(deployment.runtime.secretVersionsMustBePinned, true);
  assert.equal(deployment.rollout.candidateReceivesTrafficOnDeploy, false);
  assert.equal(deployment.rollout.liveHealthRequired, true);
  assert.equal(deployment.rollout.previousVerifiedRevisionRequired, true);
  assert.equal(deployment.rollout.previousVerifiedImageDigestRequired, true);
  assert.equal(deployment.rollout.ownerConfirmationRequiredForMutation, true);
  assert.equal(deployment.observedBootstrap, undefined);
  assert.equal(deployment.externalEffectsPerformed, undefined);
});

test('container and security policy stay immutable, non-root, and fail closed', async () => {
  const [dockerfile, release, supply] = await Promise.all([
    readFile('Dockerfile', 'utf8'),
    json('infra/production/release-policy.v1.json'),
    json('infra/production/supply-chain-qualification.v1.json'),
  ]);
  assert.match(release.container.buildBaseImage, /@sha256:[a-f0-9]{64}$/u);
  assert.match(release.container.baseImage, /@sha256:[a-f0-9]{64}$/u);
  assert.match(dockerfile, /^USER 65532:65532$/mu);
  assert.match(dockerfile, /^STOPSIGNAL SIGTERM$/mu);
  assert.match(dockerfile, /^HEALTHCHECK /mu);
  assert.doesNotMatch(dockerfile, /\b(?:latest|curl|wget|apt-get)\b/u);
  assert.equal(supply.dependencyAudit.maximumHigh, 0);
  assert.equal(supply.dependencyAudit.maximumCritical, 0);
  assert.equal(supply.containerVulnerabilityGate.maximumHigh, 0);
  assert.equal(supply.containerVulnerabilityGate.maximumCritical, 0);
  assert.equal(supply.scanner.dockerSocketAllowed, false);
  assert.equal(supply.productionDataAllowed, false);
  assert.equal(supply.paymentsAllowed, false);
});

test('Cloud Build runs the one current production gate before immutable images are published', async () => {
  const [build, rootPackage] = await Promise.all([
    readFile('infra/production/gcp/cloudbuild.yaml', 'utf8'),
    json('package.json'),
  ]);
  assert.match(build, /node:24\.18\.1-bookworm-slim@sha256:[a-f0-9]{64}/u);
  assert.match(build, /requestedVerifyOption: VERIFIED/u);
  assert.match(build, /npm run test:b14/u);
  assert.doesNotMatch(build, /test:stage14|release-candidate|:latest/u);
  assert.equal(rootPackage.scripts['test:stage14'], undefined);
  assert.equal(rootPackage.scripts['test:b14'], 'node ./scripts/verify-runtime.mjs && node ./scripts/production/verify-production.mjs');
});

test('current release control exposes guarded deploy, promotion, rollback, and containment', async () => {
  const { stdout } = await execute(process.execPath, ['scripts/production/gcp-public-launch.mjs', 'plan'], {
    env: { PATH: process.env.PATH },
  });
  const plan = JSON.parse(stdout);
  assert.equal(plan.state, 'active_production_policy');
  assert.equal(plan.x402Mode, 'settlement_enabled');
  assert.equal(plan.deployTrafficPercent, 0);
  assert.deepEqual(plan.mutationActions, ['deploy', 'promote', 'rollback', 'privatize']);
  await assert.rejects(
    execute(process.execPath, ['scripts/production/gcp-public-launch.mjs', 'rollback'], { env: { PATH: process.env.PATH } }),
    /production_public_launch_refused:missing_clervo_release_id/u,
  );
  const source = await readFile('scripts/production/gcp-public-launch.mjs', 'utf8');
  assert.match(source, /CLERVO_PREVIOUS_REVISION/u);
  assert.match(source, /CLERVO_PREVIOUS_IMAGE/u);
  assert.match(source, /CLERVO_DATABASE_READINESS/u);
  assert.match(source, /CLERVO_MONITORING_DELIVERY/u);
  assert.match(source, /CLERVO_CURRENT_LIVE_HEALTH/u);
  assert.match(source, /verifyArtifact\(targetImage\)/u);
});
