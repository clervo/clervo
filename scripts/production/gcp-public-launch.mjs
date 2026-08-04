#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const root = new URL('../..', import.meta.url);
const policy = JSON.parse(await readFile(new URL('../../infra/production/gcp/public-launch.v1.json', import.meta.url), 'utf8'));
const deployment = JSON.parse(await readFile(new URL('../../infra/production/gcp/deployment.v1.json', import.meta.url), 'utf8'));
const x402 = JSON.parse(await readFile(new URL('../../infra/production/gcp/x402-preflight.v1.json', import.meta.url), 'utf8'));
const sandbox = JSON.parse(await readFile(new URL('../../infra/production/gcp/sandbox-connectivity.v1.json', import.meta.url), 'utf8'));
const action = process.argv[2] ?? 'plan';

function refuse(code) { throw new Error(`production_public_launch_refused:${code}`); }
function env(name) { const value = process.env[name]; if (!value) refuse(`missing_${name.toLowerCase()}`); return value; }
function version(name) { const value = env(name); if (!/^[1-9][0-9]*$/u.test(value)) refuse(`invalid_${name.toLowerCase()}`); return value; }
function release() { const value = env('CLERVO_RELEASE_ID'); if (!/^[a-f0-9]{40}$/u.test(value)) refuse('invalid_release_id'); return value; }
function image() { const value = env('CLERVO_PRODUCTION_IMAGE'); if (!/^us-central1-docker\.pkg\.dev\/bloxsniper-prod\/clervo-production\/clervo-api@sha256:[a-f0-9]{64}$/u.test(value)) refuse('invalid_image'); return value; }
function revision() { const value = env('CLERVO_CANDIDATE_REVISION'); if (!/^clervo-api-production-[0-9]{5}-[a-z0-9]{3}$/u.test(value)) refuse('invalid_revision'); return value; }
function gcloud(args, capture = false) {
  const result = spawnSync('gcloud', args, { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) { if (capture && result.stderr) process.stderr.write(result.stderr); refuse(`gcloud_${args.slice(0, 3).join('_').replaceAll(/[^a-z0-9]+/giu, '_').toLowerCase()}`); }
  return capture ? result.stdout.trim() : '';
}
function service() { return JSON.parse(gcloud(['run', 'services', 'describe', policy.service, '--project', policy.project, '--region', policy.region, '--format=json'], true)); }
function traffic(document) { return (document.status?.traffic ?? []).filter(({ percent }) => Number(percent ?? 0) > 0).map(({ revisionName, percent }) => ({ revisionName, percent })); }
function publicInvoker() {
  const iam = JSON.parse(gcloud(['run', 'services', 'get-iam-policy', policy.service, '--project', policy.project, '--region', policy.region, '--format=json'], true));
  return (iam.bindings ?? []).some(({ role, members = [] }) => role === 'roles/run.invoker' && members.includes('allUsers'));
}
function verifyArtifact(candidateImage) {
  const result = spawnSync(process.execPath, ['scripts/production/gcp-release.mjs', 'verify-artifact'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
    env: { PATH: process.env.PATH, CLERVO_PRODUCTION_IMAGE: candidateImage },
  });
  if (result.error || result.status !== 0) refuse('artifact_verification_failed');
  return JSON.parse(result.stdout).artifact;
}
function describedImage(candidateRevision) {
  const described = JSON.parse(gcloud(['run', 'revisions', 'describe', candidateRevision, '--project', policy.project, '--region', policy.region, '--format=json'], true));
  return described.spec?.containers?.[0]?.image ?? described.status?.imageDigest;
}

const plan = Object.freeze({
  action: 'plan', state: policy.state, project: policy.project, region: policy.region, service: policy.service,
  publicOrigin: policy.publicOrigin, searchMode: policy.search.mode, synthesisEnabled: policy.search.synthesisEnabled,
  x402Mode: policy.commerce.mode, sandboxMode: policy.sandbox.mode, deployTrafficPercent: 0,
  publicInvokerAddedOnlyAfterPromotion: true, protectedResources: policy.protectedResources,
});

let result;
if (action === 'plan') result = plan;
else if (action === 'observe') {
  const current = service();
  result = { action: 'observed', latestReadyRevision: current.status?.latestReadyRevisionName, traffic: traffic(current), publicInvoker: publicInvoker(), serviceUrl: current.status?.url };
} else if (action === 'deploy') {
  const releaseId = release();
  const candidateImage = image();
  assert.equal(env('CLERVO_PUBLIC_LAUNCH_CONFIRM'), `deploy-zero-traffic:${releaseId}`, 'confirmation mismatch');
  const versions = {
    database: version('CLERVO_DATABASE_SECRET_VERSION'), sentry: version('CLERVO_SENTRY_DSN_SECRET_VERSION'),
    x402KeyId: version('CLERVO_X402_KEY_ID_SECRET_VERSION'), x402KeySecret: version('CLERVO_X402_KEY_SECRET_SECRET_VERSION'),
    x402PayTo: version('CLERVO_X402_PAY_TO_SECRET_VERSION'), sandboxControl: version('CLERVO_SANDBOX_CONTROL_SECRET_VERSION'),
    sandboxApi: version('CLERVO_SANDBOX_API_SECRET_VERSION'), searchPrimary: version('CLERVO_SEARCH_PRIMARY_SECRET_VERSION'),
    searchFallback: version('CLERVO_SEARCH_FALLBACK_SECRET_VERSION'),
  };
  const artifact = verifyArtifact(candidateImage);
  const before = service();
  const beforeTraffic = traffic(before);
  assert.equal(publicInvoker(), false, 'zero-traffic candidate requires private origin');
  const tag = `public-${releaseId.slice(0, 12)}`;
  const environment = [
    'CLERVO_ENV=production', `CLERVO_RELEASE_ID=${releaseId}`, `CLERVO_PUBLIC_ORIGIN=${policy.publicOrigin}`,
    'CLERVO_STATE_BACKEND=postgres', 'CLERVO_STATE_NAMESPACE=production', 'CLERVO_MAX_CONCURRENT_EXECUTIONS=16',
    'CLERVO_TRAFFIC_MODE=open', 'CLERVO_MONITORING_DRIVER=sentry', `CLERVO_SEARCH_MODE=${policy.search.mode}`,
    `CLERVO_SEARCH_PRIMARY_CALL_CEILING=${policy.search.primaryCallCeiling}`, `CLERVO_SEARCH_FALLBACK_CALL_CEILING=${policy.search.fallbackCallCeiling}`,
    `CLERVO_X402_MODE=${policy.commerce.mode}`, `CLERVO_X402_FACILITATOR_URL=${policy.commerce.facilitatorUrl}`,
    `CLERVO_X402_NETWORK=${policy.commerce.network}`, `CLERVO_X402_ASSET=${policy.commerce.asset}`,
    `CLERVO_SANDBOX_MODE=${policy.sandbox.mode}`, `CLERVO_SANDBOX_CONTROL_ORIGIN=${sandbox.cloudRun.controlOrigin}`,
    'CLERVO_RELEASE_CHANNEL=public-live-candidate',
  ];
  const secrets = [
    `CLERVO_DATABASE_URL=${deployment.runtime.secretEnvironment.CLERVO_DATABASE_URL}:${versions.database}`,
    `CLERVO_SENTRY_DSN=${deployment.runtime.secretEnvironment.CLERVO_SENTRY_DSN}:${versions.sentry}`,
    `CLERVO_X402_FACILITATOR_KEY_ID=${x402.secrets.keyId}:${versions.x402KeyId}`,
    `CLERVO_X402_FACILITATOR_KEY_SECRET=${x402.secrets.keySecret}:${versions.x402KeySecret}`,
    `CLERVO_X402_PAY_TO=${x402.secrets.payTo}:${versions.x402PayTo}`,
    `CLERVO_SANDBOX_CONTROL_TOKEN=${sandbox.cloudRun.controlTokenSecret}:${versions.sandboxControl}`,
    `CLERVO_SANDBOX_API_TOKEN=${sandbox.cloudRun.apiTokenSecret}:${versions.sandboxApi}`,
    `CLERVO_SEARCH_PRIMARY_KEY=${policy.search.primarySecret}:${versions.searchPrimary}`,
    `CLERVO_SEARCH_FALLBACK_KEY=${policy.search.fallbackSecret}:${versions.searchFallback}`,
  ];
  gcloud([
    'run', 'deploy', policy.service, '--project', policy.project, '--region', policy.region, '--image', candidateImage,
    '--service-account', `${deployment.resources.runtimeServiceAccount}@${policy.project}.iam.gserviceaccount.com`, '--execution-environment', 'gen2',
    '--ingress', 'all', '--no-allow-unauthenticated', '--no-traffic', '--tag', tag, '--cpu', '1', '--memory', '512Mi',
    '--concurrency', '16', '--min-instances', '0', '--max-instances', '1', '--timeout', `${sandbox.cloudRun.requestTimeoutSeconds}s`,
    '--no-cpu-throttling', '--no-session-affinity', '--port', '8080', '--set-cloudsql-instances', `${policy.project}:${policy.region}:${deployment.resources.databaseInstance}`,
    '--network', sandbox.network, '--subnet', sandbox.serverlessSubnet.name, '--vpc-egress', sandbox.cloudRun.directVpcEgress, '--network-tags', sandbox.cloudRun.networkTag,
    '--set-env-vars', environment.join(','), '--set-secrets', secrets.join(','),
    '--startup-probe', 'httpGet.path=/readyz,httpGet.port=8080,periodSeconds=2,timeoutSeconds=1,failureThreshold=30',
    '--liveness-probe', 'httpGet.path=/v1/health,httpGet.port=8080,periodSeconds=10,timeoutSeconds=1,failureThreshold=3',
    '--readiness-probe', 'httpGet.path=/readyz,httpGet.port=8080,periodSeconds=5,timeoutSeconds=1,failureThreshold=2,successThreshold=1',
    '--labels', `clervo-release=${releaseId.slice(0, 12)},clervo-candidate=true,clervo-public-live=true`, '--quiet',
  ]);
  const after = service();
  assert.deepEqual(traffic(after), beforeTraffic, 'serving traffic changed during zero-traffic deploy');
  assert.equal(publicInvoker(), false, 'public invoker changed during zero-traffic deploy');
  const candidateRevision = after.status?.latestReadyRevisionName;
  if (!/^clervo-api-production-[0-9]{5}-[a-z0-9]{3}$/u.test(candidateRevision ?? '')) refuse('candidate_revision_missing');
  const serviceUrl = new URL(after.status.url);
  result = { action: 'public-live-candidate-deployed', revision: candidateRevision, tag, targetOrigin: `${serviceUrl.protocol}//${tag}---${serviceUrl.hostname}`, trafficPercent: 0, publicInvoker: false, artifact };
} else if (action === 'promote') {
  const releaseId = release();
  const candidateImage = image();
  const candidateRevision = revision();
  assert.equal(env('CLERVO_PUBLIC_LAUNCH_CONFIRM'), `promote-public:${releaseId}:${candidateRevision}`, 'confirmation mismatch');
  assert.equal(env('CLERVO_LIVE_SEARCH_SMOKE'), 'passed', 'live search smoke missing');
  assert.equal(env('CLERVO_X402_CHALLENGE_SMOKE'), 'passed', 'x402 challenge smoke missing');
  assert.equal(env('CLERVO_MONITORING_DELIVERY'), 'acknowledged', 'monitoring delivery missing');
  assert.equal(describedImage(candidateRevision), candidateImage, 'candidate image mismatch');
  verifyArtifact(candidateImage);
  gcloud(['run', 'services', 'update-traffic', policy.service, '--project', policy.project, '--region', policy.region, '--to-revisions', `${candidateRevision}=100`, '--quiet']);
  gcloud(['run', 'services', 'add-iam-policy-binding', policy.service, '--project', policy.project, '--region', policy.region, '--member', 'allUsers', '--role', 'roles/run.invoker', '--quiet']);
  assert.equal(publicInvoker(), true, 'public invoker missing after promotion');
  result = { action: 'public-origin-promoted', revision: candidateRevision, image: candidateImage, trafficPercent: 100, publicInvoker: true };
} else if (action === 'privatize') {
  const releaseId = release();
  assert.equal(env('CLERVO_PUBLIC_LAUNCH_CONFIRM'), `privatize:${releaseId}`, 'confirmation mismatch');
  gcloud(['run', 'services', 'remove-iam-policy-binding', policy.service, '--project', policy.project, '--region', policy.region, '--member', 'allUsers', '--role', 'roles/run.invoker', '--quiet']);
  assert.equal(publicInvoker(), false, 'public invoker remained after privatize');
  result = { action: 'public-origin-privatized', publicInvoker: false };
} else refuse('usage_plan_observe_deploy_promote_privatize');

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
