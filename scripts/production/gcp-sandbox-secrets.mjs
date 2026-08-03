#!/usr/bin/env node

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const deployment = JSON.parse(await readFile(new URL('../../infra/production/gcp/deployment.v1.json', import.meta.url), 'utf8'));
const connectivity = JSON.parse(await readFile(new URL('../../infra/production/gcp/sandbox-connectivity.v1.json', import.meta.url), 'utf8'));
const action = process.argv[2] ?? 'plan';
const runtimeMember = `serviceAccount:${deployment.resources.runtimeServiceAccount}@${deployment.project}.iam.gserviceaccount.com`;
const secrets = [connectivity.cloudRun.controlTokenSecret, connectivity.cloudRun.apiTokenSecret];

function fail(code) { throw new Error(`sandbox_secret_bootstrap_refused:${code}`); }

function gcloud(args, { allowFailure = false, input } = {}) {
  const result = spawnSync('gcloud', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], timeout: 300_000 });
  if (result.error || result.status !== 0) {
    if (allowFailure) return { ok: false, stdout: result.stdout?.trim() ?? '' };
    fail(`gcloud_${String(args[0] ?? 'command').replaceAll(/[^a-z0-9]+/giu, '_').toLowerCase()}_failed`);
  }
  return { ok: true, stdout: result.stdout.trim() };
}

function secretExists(name) {
  return gcloud(['secrets', 'describe', name, '--project', deployment.project, '--format=value(name)'], { allowFailure: true }).ok;
}

function enabledVersions(name) {
  if (!secretExists(name)) return [];
  return gcloud(['secrets', 'versions', 'list', name, '--project', deployment.project, '--filter=state=ENABLED', '--format=value(name)']).stdout.split('\n').filter(Boolean);
}

function runtimeCanAccess(name) {
  if (!secretExists(name)) return false;
  const members = gcloud([
    'secrets', 'get-iam-policy', name, '--project', deployment.project,
    `--flatten=bindings[].members`,
    `--filter=bindings.role=${deployment.leastPrivilege.runtimeSecretRole} AND bindings.members=${runtimeMember}`,
    '--format=value(bindings.members)',
  ]).stdout.split('\n').filter(Boolean);
  return members.includes(runtimeMember);
}

function ensureApiSecret() {
  const name = connectivity.cloudRun.apiTokenSecret;
  if (!secretExists(name)) {
    const token = randomBytes(48).toString('base64url');
    assert.ok(Buffer.byteLength(token) >= 48);
    gcloud(['secrets', 'create', name, '--project', deployment.project, '--replication-policy=automatic', '--data-file=-', '--quiet'], { input: token });
  }
  if (enabledVersions(name).length !== 1) fail('api_token_requires_exactly_one_enabled_version');
}

function grantRuntimeAccess(name) {
  gcloud(['secrets', 'add-iam-policy-binding', name, '--project', deployment.project, '--member', runtimeMember, '--role', deployment.leastPrivilege.runtimeSecretRole, '--condition=None', '--quiet']);
}

function observe() {
  const states = secrets.map((name) => ({ name, enabledVersions: enabledVersions(name), runtimeAccess: runtimeCanAccess(name) }));
  if (states.some(({ enabledVersions: versions }) => versions.length !== 1)) fail('exactly_one_enabled_version_required');
  if (states.some(({ runtimeAccess }) => !runtimeAccess)) fail('runtime_access_missing');
  return { action: 'observed', project: deployment.project, secrets: states, valuesRead: false, valuesPrinted: false };
}

let result;
if (action === 'plan') {
  result = { action: 'plan', project: deployment.project, secrets, runtimeMember, valuesRead: false, valuesPrinted: false, mutation: false };
} else if (action === 'apply') {
  assert.equal(process.env.CLERVO_SANDBOX_SECRET_CONFIRM, `create:sandbox-api-secret:${deployment.project}`, 'owner confirmation mismatch');
  if (!secretExists(connectivity.cloudRun.controlTokenSecret)) fail('control_token_secret_missing');
  ensureApiSecret();
  for (const name of secrets) grantRuntimeAccess(name);
  result = { ...observe(), action: 'sandbox-secrets-ready' };
} else if (action === 'observe') result = observe();
else fail('usage_plan_apply_observe');

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
