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
function previousRevision() { const value = env('CLERVO_PREVIOUS_REVISION'); if (!/^clervo-api-production-[0-9]{5}-[a-z0-9]{3}$/u.test(value)) refuse('invalid_previous_revision'); return value; }
function previousImage() { const value = env('CLERVO_PREVIOUS_IMAGE'); if (!/^us-central1-docker\.pkg\.dev\/bloxsniper-prod\/clervo-production\/clervo-api@sha256:[a-f0-9]{64}$/u.test(value)) refuse('invalid_previous_image'); return value; }
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
function invokerIamDisabled() {
  const current = service();
  return current.metadata?.annotations?.['run.googleapis.com/invoker-iam-disabled'] === 'true';
}
function publicAccess() { return publicInvoker() || invokerIamDisabled(); }
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
  x402Mode: policy.commerce.mode, sandboxMode: policy.sandbox.mode, sandboxPublicMode: policy.sandbox.publicMode, deployTrafficPercent: 0,
  predictionMode: policy.prediction.mode, predictionQualifiedAdapter: policy.prediction.qualifiedAdapter,
  rpcMode: policy.rpc.mode, rpcSupportedChains: policy.rpc.supportedChains,
  cryptoMode: policy.crypto.mode, cryptoQualifiedAdapter: policy.crypto.qualifiedAdapter,
  publicAccessEnabledOnlyAfterPromotion: true, publicAccessMethod: policy.rollout.publicAccessMethod, protectedResources: policy.protectedResources,
  mutationActions: ['deploy', 'promote', 'rollback', 'privatize'],
});

let result;
if (action === 'plan') result = plan;
else if (action === 'observe') {
  const current = service();
  result = { action: 'observed', latestReadyRevision: current.status?.latestReadyRevisionName, traffic: traffic(current), publicInvoker: publicInvoker(), invokerIamDisabled: invokerIamDisabled(), publicAccess: publicAccess(), serviceUrl: current.status?.url };
} else if (action === 'deploy') {
  const releaseId = release();
  const candidateImage = image();
  assert.equal(env('CLERVO_PUBLIC_LAUNCH_CONFIRM'), `deploy-zero-traffic:${releaseId}`, 'confirmation mismatch');
  const versions = {
    database: version('CLERVO_DATABASE_SECRET_VERSION'), sentry: version('CLERVO_SENTRY_DSN_SECRET_VERSION'),
    x402KeyId: version('CLERVO_X402_KEY_ID_SECRET_VERSION'), x402KeySecret: version('CLERVO_X402_KEY_SECRET_SECRET_VERSION'),
    x402PayTo: version('CLERVO_X402_PAY_TO_SECRET_VERSION'), sandboxControl: version('CLERVO_SANDBOX_CONTROL_SECRET_VERSION'),
    sandboxApi: version('CLERVO_SANDBOX_API_SECRET_VERSION'), searchPrimary: policy.search.mode === 'live_external' ? version('CLERVO_SEARCH_PRIMARY_SECRET_VERSION') : null,
    searchFallback: policy.search.mode === 'live_external' ? version('CLERVO_SEARCH_FALLBACK_SECRET_VERSION') : null, edge: version('CLERVO_EDGE_AUTHORIZATION_SECRET_VERSION'),
    aiClervo: version('CLERVO_AI_CLERVO_SECRET_VERSION'), aiGroq: version('CLERVO_AI_GROQ_SECRET_VERSION'), r2Access: version('CLERVO_R2_ACCESS_KEY_SECRET_VERSION'),
    r2Secret: version('CLERVO_R2_SECRET_ACCESS_KEY_SECRET_VERSION'), artifactSigning: version('CLERVO_ARTIFACT_SIGNING_SECRET_VERSION'),
    mpp: version('CLERVO_MPP_SECRET_VERSION'), blockscout: version('CLERVO_BLOCKSCOUT_SECRET_VERSION'),
    rpcDrpc: version('CLERVO_RPC_DRPC_SECRET_VERSION'), rpcHelius: version('CLERVO_RPC_HELIUS_SECRET_VERSION'),
  };
  const artifact = verifyArtifact(candidateImage);
  const before = service();
  const beforeTraffic = traffic(before);
  const beforePublicAccess = publicAccess();
  const tag = `public-${releaseId.slice(0, 12)}`;
  const environment = [
    'CLERVO_ENV=production', `CLERVO_RELEASE_ID=${releaseId}`, `CLERVO_PUBLIC_ORIGIN=${policy.publicOrigin}`,
    'CLERVO_STATE_BACKEND=postgres', 'CLERVO_STATE_NAMESPACE=production', 'CLERVO_MAX_CONCURRENT_EXECUTIONS=16',
    'CLERVO_TRAFFIC_MODE=open', 'CLERVO_MONITORING_DRIVER=sentry', `CLERVO_SEARCH_MODE=${policy.search.mode}`,
    ...(policy.search.mode !== 'recorded' ? [`CLERVO_SEARCH_PRIMARY_CALL_CEILING=${policy.search.primaryCallCeiling}`, `CLERVO_SEARCH_FALLBACK_CALL_CEILING=${policy.search.fallbackCallCeiling}`] : []),
    `CLERVO_X402_MODE=${policy.commerce.mode}`, `CLERVO_X402_FACILITATOR_URL=${policy.commerce.facilitatorUrl}`,
    `CLERVO_X402_NETWORK=${policy.commerce.network}`, `CLERVO_X402_ASSET=${policy.commerce.asset}`,
    `CLERVO_SANDBOX_MODE=${policy.sandbox.mode}`, `CLERVO_SANDBOX_PUBLIC_MODE=${policy.sandbox.publicMode}`,
    `CLERVO_SANDBOX_RUNNER_DIGEST=${policy.sandbox.runnerDigest}`, `CLERVO_SANDBOX_CONTROL_ORIGIN=${sandbox.cloudRun.controlOrigin}`,
    'CLERVO_RELEASE_CHANNEL=public-live-candidate',
    `CLERVO_AI_MODE=${policy.ai.mode}`, `CLERVO_AI_RUNTIME_MODE=${policy.ai.runtimeMode}`,
    `CLERVO_AI_ROUTE_FAMILIES=${policy.ai.routeFamilies}`, `CLERVO_AI_BASE_URL=${policy.ai.baseUrl}`,
    `CLERVO_AI_ARTIFACT_MODE=${policy.ai.artifacts.mode}`, `R2_S3_ENDPOINT=${env('CLERVO_R2_S3_ENDPOINT')}`,
    `R2_BUCKET_NAME=${policy.ai.artifacts.bucket}`, `CLERVO_ARTIFACT_RETENTION_SECONDS=${policy.ai.artifacts.retentionSeconds}`,
    `CLERVO_ARTIFACT_MAXIMUM_OBJECT_BYTES=${policy.ai.artifacts.maximumObjectBytes}`,
    `CLERVO_PREDICTION_MODE=${policy.prediction.mode}`,
    `CLERVO_RPC_MODE=${policy.rpc.mode}`, `CLERVO_RPC_DAILY_CALL_CEILING=${policy.rpc.dailyCallCeilingPerInstance}`,
    `CLERVO_CRYPTO_MODE=${policy.crypto.mode}`, `CLERVO_CRYPTO_DAILY_CALL_CEILING=${policy.crypto.dailyCallCeiling}`,
  ];
  const secrets = [
    `CLERVO_DATABASE_URL=${deployment.runtime.secretEnvironment.CLERVO_DATABASE_URL}:${versions.database}`,
    `CLERVO_SENTRY_DSN=${deployment.runtime.secretEnvironment.CLERVO_SENTRY_DSN}:${versions.sentry}`,
    `CLERVO_X402_FACILITATOR_KEY_ID=${x402.secrets.keyId}:${versions.x402KeyId}`,
    `CLERVO_X402_FACILITATOR_KEY_SECRET=${x402.secrets.keySecret}:${versions.x402KeySecret}`,
    `CLERVO_X402_PAY_TO=${x402.secrets.payTo}:${versions.x402PayTo}`,
    `CLERVO_MPP_SECRET_KEY=${policy.commerce.mppSecret}:${versions.mpp}`,
    `CLERVO_SANDBOX_CONTROL_TOKEN=${sandbox.cloudRun.controlTokenSecret}:${versions.sandboxControl}`,
    `CLERVO_SANDBOX_API_TOKEN=${sandbox.cloudRun.apiTokenSecret}:${versions.sandboxApi}`,
    ...(policy.search.mode === 'live_external' ? [`CLERVO_SEARCH_PRIMARY_KEY=${policy.search.primarySecret}:${versions.searchPrimary}`, `CLERVO_SEARCH_FALLBACK_KEY=${policy.search.fallbackSecret}:${versions.searchFallback}`] : []),
    `CLERVO_EDGE_AUTHORIZATION=${policy.edge.sharedSecret}:${versions.edge}`,
    `CLERVO_AI_API_KEY=${policy.ai.clervoSecret}:${versions.aiClervo}`,
    `GROQ_API_KEY=${policy.ai.groqSecret}:${versions.aiGroq}`,
    `R2_ACCESS_KEY_ID=${policy.ai.artifacts.accessKeyIdSecret}:${versions.r2Access}`,
    `R2_SECRET_ACCESS_KEY=${policy.ai.artifacts.secretAccessKeySecret}:${versions.r2Secret}`,
    `CLERVO_ARTIFACT_SIGNING_SECRET=${policy.ai.artifacts.signingSecret}:${versions.artifactSigning}`,
    `CLERVO_BLOCKSCOUT_API_KEY=${policy.crypto.credentialSecret}:${versions.blockscout}`,
    `CLERVO_RPC_DRPC_API_KEY=${policy.rpc.drpcCredentialSecret}:${versions.rpcDrpc}`,
    `CLERVO_RPC_HELIUS_API_KEY=${policy.rpc.heliusCredentialSecret}:${versions.rpcHelius}`,
  ];
  gcloud([
    'run', 'deploy', policy.service, '--project', policy.project, '--region', policy.region, '--image', candidateImage,
    '--service-account', `${deployment.resources.runtimeServiceAccount}@${policy.project}.iam.gserviceaccount.com`, '--execution-environment', 'gen2',
    '--ingress', 'all', '--no-allow-unauthenticated', '--no-traffic', '--tag', tag, '--cpu', '1', '--memory', '512Mi',
    '--concurrency', '16', '--min-instances', '0', '--max-instances', '5', '--timeout', `${sandbox.cloudRun.requestTimeoutSeconds}s`,
    '--no-cpu-throttling', '--no-session-affinity', '--port', '8080', '--set-cloudsql-instances', `${policy.project}:${policy.region}:${deployment.resources.databaseInstance}`,
    '--network', sandbox.network, '--subnet', sandbox.serverlessSubnet.name, '--vpc-egress', sandbox.cloudRun.directVpcEgress, '--network-tags', sandbox.cloudRun.networkTag,
    '--set-env-vars', `^@^${environment.join('@')}`, '--set-secrets', secrets.join(','),
    '--startup-probe', 'httpGet.path=/readyz,httpGet.port=8080,periodSeconds=2,timeoutSeconds=1,failureThreshold=30',
    '--liveness-probe', 'httpGet.path=/v1/health,httpGet.port=8080,periodSeconds=10,timeoutSeconds=1,failureThreshold=3',
    '--readiness-probe', 'httpGet.path=/readyz,httpGet.port=8080,periodSeconds=5,timeoutSeconds=1,failureThreshold=2,successThreshold=1',
    '--labels', `clervo-release=${releaseId.slice(0, 12)},clervo-candidate=true,clervo-public-live=true`, '--quiet',
  ]);
  const after = service();
  assert.deepEqual(traffic(after), beforeTraffic, 'serving traffic changed during zero-traffic deploy');
  assert.equal(publicAccess(), beforePublicAccess, 'public access changed during zero-traffic deploy');
  const candidateRevision = after.status?.latestReadyRevisionName;
  if (!/^clervo-api-production-[0-9]{5}-[a-z0-9]{3}$/u.test(candidateRevision ?? '')) refuse('candidate_revision_missing');
  const serviceUrl = new URL(after.status.url);
  result = { action: 'public-live-candidate-deployed', revision: candidateRevision, tag, targetOrigin: `${serviceUrl.protocol}//${tag}---${serviceUrl.hostname}`, trafficPercent: 0, publicAccess: beforePublicAccess, artifact };
} else if (action === 'promote') {
  const releaseId = release();
  const candidateImage = image();
  const candidateRevision = revision();
  assert.equal(env('CLERVO_PUBLIC_LAUNCH_CONFIRM'), `promote-public:${releaseId}:${candidateRevision}`, 'confirmation mismatch');
  assert.equal(env('CLERVO_LIVE_SEARCH_SMOKE'), 'passed', 'live search smoke missing');
  assert.equal(env('CLERVO_X402_CHALLENGE_SMOKE'), 'passed', 'x402 challenge smoke missing');
  assert.equal(env('CLERVO_SANDBOX_LIVE_SMOKE'), 'passed', 'Sandbox live smoke missing');
  assert.equal(env('CLERVO_PREDICTION_LIVE_SMOKE'), 'passed', 'Prediction live smoke missing');
  assert.equal(env('CLERVO_CRYPTO_LIVE_SMOKE'), 'passed', 'Crypto live smoke missing');
  assert.equal(env('CLERVO_MONITORING_DELIVERY'), 'acknowledged', 'monitoring delivery missing');
  assert.equal(describedImage(candidateRevision), candidateImage, 'candidate image mismatch');
  verifyArtifact(candidateImage);
  gcloud(['run', 'services', 'update-traffic', policy.service, '--project', policy.project, '--region', policy.region, '--to-revisions', `${candidateRevision}=100`, '--quiet']);
  gcloud(['run', 'services', 'update', policy.service, '--project', policy.project, '--region', policy.region, '--no-invoker-iam-check', '--quiet']);
  assert.equal(invokerIamDisabled(), true, 'invoker IAM check remained enabled after promotion');
  result = { action: 'public-origin-promoted', revision: candidateRevision, image: candidateImage, trafficPercent: 100, publicAccess: true, accessMethod: 'invoker_iam_check_disabled' };
} else if (action === 'rollback') {
  const releaseId = release();
  const targetRevision = previousRevision();
  const targetImage = previousImage();
  assert.equal(env('CLERVO_PUBLIC_LAUNCH_CONFIRM'), `rollback:${releaseId}:${targetRevision}`, 'confirmation mismatch');
  assert.equal(env('CLERVO_DATABASE_READINESS'), 'ready', 'database readiness missing');
  assert.equal(env('CLERVO_MONITORING_DELIVERY'), 'acknowledged', 'monitoring delivery missing');
  assert.equal(env('CLERVO_CURRENT_LIVE_HEALTH'), 'passed', 'current live health missing');
  assert.equal(describedImage(targetRevision), targetImage, 'rollback image mismatch');
  verifyArtifact(targetImage);
  gcloud(['run', 'services', 'update-traffic', policy.service, '--project', policy.project, '--region', policy.region, '--to-revisions', `${targetRevision}=100`, '--quiet']);
  const restored = traffic(service());
  assert.deepEqual(restored, [{ revisionName: targetRevision, percent: 100 }], 'rollback traffic did not converge');
  result = { action: 'public-origin-rolled-back', revision: targetRevision, image: targetImage, trafficPercent: 100, publicAccess: publicAccess() };
} else if (action === 'privatize') {
  const releaseId = release();
  assert.equal(env('CLERVO_PUBLIC_LAUNCH_CONFIRM'), `privatize:${releaseId}`, 'confirmation mismatch');
  gcloud(['run', 'services', 'update', policy.service, '--project', policy.project, '--region', policy.region, '--invoker-iam-check', '--quiet']);
  assert.equal(publicAccess(), false, 'public access remained after privatize');
  result = { action: 'public-origin-privatized', publicAccess: false };
} else refuse('usage_plan_observe_deploy_promote_rollback_privatize');

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
