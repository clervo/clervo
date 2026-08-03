#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { getAddress, isAddress } from 'viem';

const proof = JSON.parse(await readFile(new URL('../../infra/production/gcp/x402-proof.v1.json', import.meta.url), 'utf8'));
const deployment = JSON.parse(await readFile(new URL('../../infra/production/gcp/deployment.v1.json', import.meta.url), 'utf8'));
const preflight = JSON.parse(await readFile(new URL('../../infra/production/gcp/x402-preflight.v1.json', import.meta.url), 'utf8'));
const action = process.argv[2] ?? 'plan';

function refuse(code) { throw new Error(`production_x402_proof_deploy_refused:${code}`); }
function gcloud(args, { capture = false } = {}) {
  const result = spawnSync('gcloud', args, {
    encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) refuse('gcloud_failed');
  return capture ? result.stdout.trim() : '';
}
function normalized(value, code) {
  if (!isAddress(String(value ?? ''), { strict: true })) refuse(code);
  return getAddress(String(value));
}
function fingerprint(value) { return `sha256:${createHash('sha256').update(value.toLowerCase()).digest('hex')}`; }
function secret(name, version) {
  return gcloud(['secrets', 'versions', 'access', String(version), '--secret', name, '--project', proof.project], { capture: true });
}
function verifyReceiverRoles() {
  const payer = normalized(secret(preflight.secrets.payTo, proof.secretVersions.payerSourceReceiver), 'payer_source_invalid');
  const receiver = normalized(secret(preflight.secrets.payTo, proof.secretVersions.payTo), 'receiver_invalid');
  assert.notEqual(payer.toLowerCase(), receiver.toLowerCase(), 'payer and receiver must differ');
  assert.equal(fingerprint(receiver), proof.receiverFingerprint, 'receiver fingerprint mismatch');
  return true;
}
function verifyArtifact() {
  const result = spawnSync(process.execPath, ['scripts/production/gcp-release.mjs', 'verify-artifact'], {
    cwd: new URL('../..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
    env: { PATH: process.env.PATH, CLERVO_PRODUCTION_IMAGE: proof.image },
  });
  if (result.error || result.status !== 0) refuse('artifact_verification_failed');
  return JSON.parse(result.stdout).artifact;
}
function service() {
  return JSON.parse(gcloud(['run', 'services', 'describe', proof.service, '--project', proof.project, '--region', proof.region, '--format=json'], { capture: true }));
}
function servingTraffic(document) {
  return (document.spec?.traffic ?? []).filter(({ percent }) => Number(percent ?? 0) > 0).map(({ revisionName, percent }) => ({ revisionName, percent }));
}
function assertPrivate() {
  const policy = JSON.parse(gcloud(['run', 'services', 'get-iam-policy', proof.service, '--project', proof.project, '--region', proof.region, '--format=json'], { capture: true }));
  const publicInvoker = (policy.bindings ?? []).some(({ role, members = [] }) => role === 'roles/run.invoker' && members.some((member) => member === 'allUsers' || member === 'allAuthenticatedUsers'));
  assert.equal(publicInvoker, false, 'public invoker must remain disabled');
}

const plan = {
  action: 'plan', state: proof.state, project: proof.project, region: proof.region, service: proof.service,
  image: proof.image, tag: proof.deployment.tag, receiverSecretVersion: proof.secretVersions.payTo,
  receiverFingerprint: proof.receiverFingerprint, private: true, trafficPercent: 0,
  settlementEnabledOnlyOnProofRevision: true, browserSignatureRequired: true,
  paymentAuthorized: false, paymentEffects: 0, mutation: false,
};

let result;
if (action === 'plan') result = plan;
else if (action === 'deploy') {
  assert.equal(process.env.CLERVO_X402_PROOF_DEPLOY_CONFIRM, `deploy:private-x402-proof:${proof.releaseCommit}:${proof.receiverFingerprint}`, 'owner confirmation mismatch');
  verifyReceiverRoles();
  const artifact = verifyArtifact();
  const before = service();
  const trafficBefore = servingTraffic(before);
  const environment = [
    'CLERVO_ENV=production', `CLERVO_RELEASE_ID=${proof.releaseCommit}`, `CLERVO_PUBLIC_ORIGIN=${proof.publicOrigin}`,
    'CLERVO_STATE_BACKEND=postgres', 'CLERVO_STATE_NAMESPACE=production', 'CLERVO_MAX_CONCURRENT_EXECUTIONS=16',
    'CLERVO_TRAFFIC_MODE=open', 'CLERVO_MONITORING_DRIVER=sentry', 'CLERVO_X402_MODE=settlement_enabled',
    `CLERVO_X402_FACILITATOR_URL=${proof.facilitatorUrl}`, `CLERVO_X402_NETWORK=${proof.network}`,
    `CLERVO_X402_ASSET=${proof.asset}`, 'CLERVO_SANDBOX_MODE=disabled', 'CLERVO_RELEASE_CHANNEL=x402-proof',
  ];
  const secrets = [
    `CLERVO_DATABASE_URL=${deployment.runtime.secretEnvironment.CLERVO_DATABASE_URL}:${proof.secretVersions.database}`,
    `CLERVO_SENTRY_DSN=${deployment.runtime.secretEnvironment.CLERVO_SENTRY_DSN}:${proof.secretVersions.sentry}`,
    `CLERVO_X402_FACILITATOR_KEY_ID=${preflight.secrets.keyId}:${proof.secretVersions.facilitatorKeyId}`,
    `CLERVO_X402_FACILITATOR_KEY_SECRET=${preflight.secrets.keySecret}:${proof.secretVersions.facilitatorKeySecret}`,
    `CLERVO_X402_PAY_TO=${preflight.secrets.payTo}:${proof.secretVersions.payTo}`,
  ];
  gcloud([
    'run', 'deploy', proof.service, '--project', proof.project, '--region', proof.region, '--image', proof.image,
    '--service-account', proof.runtimeServiceAccount, '--execution-environment', 'gen2', '--ingress', 'all',
    '--no-allow-unauthenticated', '--no-traffic', '--tag', proof.deployment.tag, '--cpu', '1', '--memory', '512Mi',
    '--concurrency', '16', '--min-instances', '0', '--max-instances', '1', '--timeout', '20s', '--no-cpu-throttling',
    '--no-session-affinity', '--port', '8080', '--set-cloudsql-instances', `${proof.project}:${proof.region}:${deployment.resources.databaseInstance}`,
    '--set-env-vars', environment.join(','), '--set-secrets', secrets.join(','),
    '--startup-probe', 'httpGet.path=/readyz,httpGet.port=8080,periodSeconds=2,timeoutSeconds=1,failureThreshold=30',
    '--liveness-probe', 'httpGet.path=/v1/health,httpGet.port=8080,periodSeconds=10,timeoutSeconds=1,failureThreshold=3',
    '--readiness-probe', 'httpGet.path=/readyz,httpGet.port=8080,periodSeconds=5,timeoutSeconds=1,failureThreshold=2,successThreshold=1',
    '--labels', `clervo-release=${proof.releaseCommit.slice(0, 12)},clervo-candidate=true,clervo-x402-proof=true`, '--quiet',
  ]);
  const after = service();
  assert.deepEqual(servingTraffic(after), trafficBefore, 'serving traffic changed during proof deploy');
  assertPrivate();
  const revision = after.status?.latestReadyRevisionName;
  assert.match(revision ?? '', /^clervo-api-production-[a-z0-9-]+$/u);
  const baseOrigin = new URL(after.status?.url ?? after.status?.address?.url);
  const targetOrigin = `${baseOrigin.protocol}//${proof.deployment.tag}---${baseOrigin.hostname}`;
  result = { action: 'private-proof-revision-deployed', revision, tag: proof.deployment.tag, targetOrigin, trafficPercent: 0, publicInvoker: false, paymentAuthorized: false, paymentEffects: 0, artifact };
} else if (action === 'disable') {
  assert.equal(process.env.CLERVO_X402_PROOF_DISABLE_CONFIRM, `disable:private-x402-proof:${proof.deployment.tag}`, 'owner confirmation mismatch');
  const before = service();
  const trafficBefore = servingTraffic(before);
  gcloud(['run', 'services', 'update-traffic', proof.service, '--project', proof.project, '--region', proof.region, '--remove-tags', proof.deployment.tag, '--quiet']);
  const after = service();
  assert.deepEqual(servingTraffic(after), trafficBefore, 'serving traffic changed while disabling proof tag');
  assertPrivate();
  result = { action: 'private-proof-tag-disabled', tag: proof.deployment.tag, servingTrafficUnchanged: true, publicInvoker: false };
} else refuse('usage_plan_deploy_disable');

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
