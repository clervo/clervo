#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const policy = JSON.parse(await readFile(
  new URL('../../infra/production/gcp/deployment.v1.json', import.meta.url),
  'utf8',
));
const x402Policy = JSON.parse(await readFile(
  new URL('../../infra/production/gcp/x402-preflight.v1.json', import.meta.url),
  'utf8',
));
const action = process.argv[2] ?? 'plan';
const resources = policy.resources;
const imagePrefix = `${policy.region}-docker.pkg.dev/${policy.project}/${resources.artifactRepository}/${resources.image}`;
const digestPattern = new RegExp(`^${imagePrefix.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}@sha256:[a-f0-9]{64}$`, 'u');
const revisionPattern = new RegExp(`^${resources.service}-[a-z0-9-]{3,48}$`, 'u');

function die(message) {
  throw new Error(`production_release_refused:${message}`);
}

function env(name) {
  const value = process.env[name];
  if (!value) die(`missing_${name.toLowerCase()}`);
  return value;
}

function exactDigest(name) {
  const value = env(name);
  if (!digestPattern.test(value)) die(`invalid_${name.toLowerCase()}`);
  return value;
}

function exactRevision(name) {
  const value = env(name);
  if (!revisionPattern.test(value)) die(`invalid_${name.toLowerCase()}`);
  return value;
}

function positiveInteger(name) {
  const value = env(name);
  if (!/^[1-9][0-9]*$/u.test(value)) die(`invalid_${name.toLowerCase()}`);
  return value;
}

function checkedOrigin() {
  const value = env('CLERVO_PRODUCTION_ORIGIN');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    die('invalid_clervo_production_origin');
  }
  if (parsed.hostname === 'ai.clervo.dev') die('protected_gateway_origin');
  return parsed.origin;
}

function releaseInputs() {
  const releaseId = env('CLERVO_RELEASE_ID');
  if (!/^[a-f0-9]{40}$/u.test(releaseId)) die('invalid_clervo_release_id');
  const image = exactDigest('CLERVO_PRODUCTION_IMAGE');
  const cloudSqlConnection = env('CLERVO_CLOUD_SQL_CONNECTION');
  const expectedConnection = `${policy.project}:${policy.region}:${resources.databaseInstance}`;
  if (cloudSqlConnection !== expectedConnection) die('invalid_clervo_cloud_sql_connection');
  return {
    releaseId,
    image,
    cloudSqlConnection,
    origin: checkedOrigin(),
    databaseSecretVersion: positiveInteger('CLERVO_DATABASE_SECRET_VERSION'),
    sentryDsnSecretVersion: positiveInteger('CLERVO_SENTRY_DSN_SECRET_VERSION'),
    candidateTag: `candidate-${releaseId.slice(0, 12)}`,
  };
}

function runGcloud(args, { capture = false } = {}) {
  const result = spawnSync('gcloud', args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) die('gcloud_unavailable');
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    die(`gcloud_failed_${args.slice(0, 3).join('_').replaceAll(/[^a-z0-9]+/giu, '_').toLowerCase()}`);
  }
  return capture ? result.stdout : undefined;
}

function serviceExists() {
  const result = spawnSync('gcloud', [
    'run', 'services', 'describe', resources.service,
    '--project', policy.project,
    '--region', policy.region,
    '--format=value(metadata.name)',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) die('gcloud_unavailable');
  if (result.status === 0) return true;
  if (/not found|could not find|cannot find/iu.test(result.stderr)) return false;
  if (result.stderr) process.stderr.write(result.stderr);
  die('gcloud_failed_run_services_describe');
}

function describeImage(image) {
  const raw = runGcloud([
    'artifacts', 'docker', 'images', 'describe', image,
    '--project', policy.project,
    '--show-provenance',
    '--show-package-vulnerability',
    '--format=json',
  ], { capture: true });
  return JSON.parse(raw);
}

function verifyArtifact(image) {
  const metadata = describeImage(image);
  const serialized = JSON.stringify(metadata);
  if (metadata?.image_summary?.fully_qualified_digest !== image) die('artifact_digest_metadata_mismatch');
  if (metadata?.image_summary?.slsa_build_level < 3) die('slsa_build_level_too_low');
  if (!serialized.includes('cloudbuild.googleapis.com')) die('verified_cloud_build_provenance_missing');
  const discoveries = metadata?.discovery_summary?.discovery;
  const finishedDiscovery = Array.isArray(discoveries) && discoveries.some((entry) => (
    entry?.resourceUri === `https://${image}`
    && entry?.discovery?.analysisStatus === 'FINISHED_SUCCESS'
    && ['OS', 'NPM', 'SECRET'].every((type) => entry.discovery.analysisCompleted?.analysisType?.includes(type))
  ));
  if (!finishedDiscovery) die('artifact_analysis_incomplete');
  const vulnerabilities = metadata?.package_vulnerability_summary?.vulnerabilities
    ?? metadata?.packageVulnerabilitySummary?.vulnerabilities
    ?? {};
  const critical = Array.isArray(vulnerabilities.CRITICAL) ? vulnerabilities.CRITICAL.length : 0;
  const high = Array.isArray(vulnerabilities.HIGH) ? vulnerabilities.HIGH.length : 0;
  if (critical > policy.build.maximumCriticalVulnerabilities || high > policy.build.maximumHighVulnerabilities) {
    die(`artifact_vulnerability_gate_failed_critical_${critical}_high_${high}`);
  }
  return { provenance: 'cloud-build-observed', critical, high };
}

function deploymentArgs(input, { channel, noTraffic, tag, x402Preflight = false, x402SecretVersions } = {}) {
  const x402Mode = x402Preflight ? x402Policy.paymentMode : policy.runtime.environment.CLERVO_X402_MODE;
  if (x402Preflight && (x402Mode !== 'challenge_only' || x402Policy.settlementEnabled !== false)) die('x402_preflight_must_be_challenge_only');
  const environmentVariables = [
    `CLERVO_ENV=${policy.runtime.environment.CLERVO_ENV}`,
    `CLERVO_RELEASE_ID=${input.releaseId}`,
    `CLERVO_PUBLIC_ORIGIN=${input.origin}`,
    `CLERVO_STATE_BACKEND=${policy.runtime.environment.CLERVO_STATE_BACKEND}`,
    `CLERVO_STATE_NAMESPACE=${policy.runtime.environment.CLERVO_STATE_NAMESPACE}`,
    `CLERVO_MAX_CONCURRENT_EXECUTIONS=${policy.runtime.environment.CLERVO_MAX_CONCURRENT_EXECUTIONS}`,
    `CLERVO_TRAFFIC_MODE=${policy.runtime.environment.CLERVO_TRAFFIC_MODE}`,
    `CLERVO_MONITORING_DRIVER=${policy.runtime.environment.CLERVO_MONITORING_DRIVER}`,
    `CLERVO_X402_MODE=${x402Mode}`,
    `CLERVO_RELEASE_CHANNEL=${channel}`,
  ];
  const secretVariables = [
    `CLERVO_DATABASE_URL=${policy.runtime.secretEnvironment.CLERVO_DATABASE_URL}:${input.databaseSecretVersion}`,
    `CLERVO_SENTRY_DSN=${policy.runtime.secretEnvironment.CLERVO_SENTRY_DSN}:${input.sentryDsnSecretVersion}`,
  ];
  if (x402Preflight) {
    environmentVariables.push(
      `CLERVO_X402_FACILITATOR_URL=${x402Policy.facilitatorUrl}`,
      `CLERVO_X402_NETWORK=${x402Policy.network}`,
      `CLERVO_X402_ASSET=${x402Policy.asset}`,
    );
    secretVariables.push(
      `CLERVO_X402_FACILITATOR_KEY_ID=${x402Policy.secrets.keyId}:${x402SecretVersions.keyId}`,
      `CLERVO_X402_FACILITATOR_KEY_SECRET=${x402Policy.secrets.keySecret}:${x402SecretVersions.keySecret}`,
      `CLERVO_X402_PAY_TO=${x402Policy.secrets.payTo}:${x402SecretVersions.payTo}`,
    );
  }
  const args = [
    'run', 'deploy', resources.service,
    '--project', policy.project,
    '--region', policy.region,
    '--image', input.image,
    '--service-account', `${resources.runtimeServiceAccount}@${policy.project}.iam.gserviceaccount.com`,
    '--execution-environment', policy.runtime.executionEnvironment,
    '--ingress', policy.runtime.ingress,
    '--no-allow-unauthenticated',
    '--tag', tag,
    '--cpu', String(policy.runtime.cpu),
    '--memory', policy.runtime.memory,
    '--concurrency', String(policy.runtime.containerConcurrency),
    '--min-instances', String(policy.runtime.minimumInstances),
    '--max-instances', String(policy.runtime.maximumInstances),
    '--timeout', `${policy.runtime.requestTimeoutSeconds}s`,
    '--no-cpu-throttling',
    '--no-session-affinity',
    '--port', String(policy.runtime.port),
    '--set-cloudsql-instances', input.cloudSqlConnection,
    '--set-env-vars', environmentVariables.join(','),
    '--set-secrets', secretVariables.join(','),
    '--startup-probe', 'httpGet.path=/readyz,httpGet.port=8080,periodSeconds=2,timeoutSeconds=1,failureThreshold=30',
    '--liveness-probe', 'httpGet.path=/v1/health,httpGet.port=8080,periodSeconds=10,timeoutSeconds=1,failureThreshold=3',
    '--readiness-probe', 'httpGet.path=/readyz,httpGet.port=8080,periodSeconds=5,timeoutSeconds=1,failureThreshold=2,successThreshold=1',
    '--labels', `clervo-release=${input.releaseId.slice(0, 12)},clervo-candidate=true`,
    '--quiet',
  ];
  if (noTraffic) args.push('--no-traffic');
  return args;
}

function bootstrapPrivate(input) {
  const confirmation = env('CLERVO_PRODUCTION_CONFIRM');
  if (confirmation !== `bootstrap-private:${input.releaseId}`) die('owner_confirmation_mismatch');
  if (serviceExists()) die('private_bootstrap_requires_absent_service');
  const artifact = verifyArtifact(input.image);
  const tag = `bootstrap-${input.releaseId.slice(0, 12)}`;
  runGcloud(deploymentArgs(input, { channel: 'bootstrap', noTraffic: false, tag }));
  return { action: 'private-bootstrap-created', image: input.image, tag, artifact };
}

function deployCandidate(input) {
  const confirmation = env('CLERVO_PRODUCTION_CONFIRM');
  if (confirmation !== `deploy-candidate:${input.releaseId}`) die('owner_confirmation_mismatch');
  if (!serviceExists()) die('candidate_requires_private_bootstrap');
  const artifact = verifyArtifact(input.image);
  runGcloud(deploymentArgs(input, { channel: 'candidate', noTraffic: true, tag: input.candidateTag }));
  return { action: 'candidate-deployed-with-zero-traffic', image: input.image, candidateTag: input.candidateTag, artifact };
}

function deployX402Preflight(input) {
  const confirmation = env('CLERVO_PRODUCTION_CONFIRM');
  if (confirmation !== `deploy-x402-preflight:${input.releaseId}`) die('owner_confirmation_mismatch');
  if (!serviceExists()) die('x402_preflight_requires_private_service');
  const x402SecretVersions = {
    keyId: positiveInteger('CLERVO_X402_KEY_ID_SECRET_VERSION'),
    keySecret: positiveInteger('CLERVO_X402_KEY_SECRET_SECRET_VERSION'),
    payTo: positiveInteger('CLERVO_X402_PAY_TO_SECRET_VERSION'),
  };
  const artifact = verifyArtifact(input.image);
  const tag = `x402-${input.releaseId.slice(0, 12)}`;
  runGcloud(deploymentArgs(input, {
    channel: 'x402-preflight',
    noTraffic: true,
    tag,
    x402Preflight: true,
    x402SecretVersions,
  }));
  return {
    action: 'x402-preflight-deployed-with-zero-traffic',
    image: input.image,
    tag,
    paymentMode: 'challenge_only',
    settlementEnabled: false,
    artifact,
  };
}

function revisionDescription(revision) {
  const raw = runGcloud([
    'run', 'revisions', 'describe', revision,
    '--project', policy.project,
    '--region', policy.region,
    '--format=json',
  ], { capture: true });
  return JSON.parse(raw);
}

function revisionImage(description) {
  return description?.spec?.containers?.[0]?.image
    ?? description?.spec?.container?.image
    ?? description?.status?.imageDigest;
}

function promote(input) {
  const confirmation = env('CLERVO_PRODUCTION_CONFIRM');
  if (confirmation !== `promote-candidate:${input.releaseId}`) die('owner_confirmation_mismatch');
  if (env('CLERVO_CANDIDATE_SMOKE') !== 'passed') die('candidate_smoke_missing');
  if (env('CLERVO_MONITORING_DELIVERY') !== 'acknowledged') die('monitoring_delivery_missing');
  const revision = exactRevision('CLERVO_CANDIDATE_REVISION');
  const described = revisionDescription(revision);
  if (revisionImage(described) !== input.image) die('candidate_revision_image_mismatch');
  verifyArtifact(input.image);
  runGcloud([
    'run', 'services', 'update-traffic', resources.service,
    '--project', policy.project,
    '--region', policy.region,
    '--to-revisions', `${revision}=100`,
    '--quiet',
  ]);
  return { action: 'candidate-promoted', revision, image: input.image };
}

function rollback() {
  const releaseId = env('CLERVO_RELEASE_ID');
  if (!/^[a-f0-9]{40}$/u.test(releaseId)) die('invalid_clervo_release_id');
  const confirmation = env('CLERVO_PRODUCTION_CONFIRM');
  if (confirmation !== `rollback-production:${releaseId}`) die('owner_confirmation_mismatch');
  const previousRevision = exactRevision('CLERVO_PREVIOUS_REVISION');
  const previousImage = exactDigest('CLERVO_PREVIOUS_IMAGE');
  const described = revisionDescription(previousRevision);
  if (revisionImage(described) !== previousImage) die('previous_revision_image_mismatch');
  verifyArtifact(previousImage);
  runGcloud([
    'run', 'services', 'update-traffic', resources.service,
    '--project', policy.project,
    '--region', policy.region,
    '--to-revisions', `${previousRevision}=100`,
    '--quiet',
  ]);
  return { action: 'production-rolled-back', revision: previousRevision, image: previousImage };
}

const safePlan = {
  schemaVersion: policy.schemaVersion,
  state: policy.state,
  project: policy.project,
  region: policy.region,
  resources,
  mutationActions: ['bootstrap-private', 'deploy-candidate', 'deploy-x402-preflight', 'promote', 'rollback'],
  candidateReceivesTrafficOnDeploy: false,
  paymentEnabled: false,
  ownerConfirmationRequired: true,
  protectedResources: policy.protectedResources,
};

let result;
if (action === 'plan') result = safePlan;
else if (action === 'verify-artifact') {
  const image = exactDigest('CLERVO_PRODUCTION_IMAGE');
  result = { action: 'artifact-verified', image, artifact: verifyArtifact(image) };
}
else if (action === 'validate') {
  const input = releaseInputs();
  result = { action: 'validated', releaseId: input.releaseId, image: input.image, candidateTag: input.candidateTag };
} else if (action === 'bootstrap-private') result = bootstrapPrivate(releaseInputs());
else if (action === 'deploy-candidate') result = deployCandidate(releaseInputs());
else if (action === 'deploy-x402-preflight') result = deployX402Preflight(releaseInputs());
else if (action === 'promote') result = promote(releaseInputs());
else if (action === 'rollback') result = rollback();
else die('usage_plan_verify_artifact_validate_bootstrap_private_deploy_candidate_deploy_x402_preflight_promote_rollback');

assert.equal(policy.rollout.paidExecutionEnabled, false);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
