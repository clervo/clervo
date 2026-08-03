#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const policy = JSON.parse(await readFile(
  new URL('../../infra/production/gcp/deployment.v1.json', import.meta.url),
  'utf8',
));
const action = process.argv[2] ?? 'plan';
const { project, region, resources, leastPrivilege } = policy;
const runtimeEmail = `${resources.runtimeServiceAccount}@${project}.iam.gserviceaccount.com`;
const builderEmail = `${resources.buildServiceAccount}@${project}.iam.gserviceaccount.com`;

function die(message) {
  throw new Error(`production_iam_refused:${message}`);
}

function gcloud(args, { allowMissing = false, capture = false } = {}) {
  const result = spawnSync('gcloud', args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) die('gcloud_unavailable');
  if (result.status !== 0 && !allowMissing) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    die(`gcloud_failed_${args.slice(0, 3).join('_').replaceAll(/[^a-z0-9]+/giu, '_').toLowerCase()}`);
  }
  return { found: result.status === 0, stdout: capture ? result.stdout : '' };
}

function accountExists(email) {
  return gcloud([
    'iam', 'service-accounts', 'describe', email,
    '--project', project,
    '--format=value(email)',
  ], { allowMissing: true, capture: true }).found;
}

function createAccount(id, displayName) {
  if (accountExists(`${id}@${project}.iam.gserviceaccount.com`)) return false;
  gcloud([
    'iam', 'service-accounts', 'create', id,
    '--project', project,
    '--display-name', displayName,
    '--description', 'Dedicated Clervo production identity; managed by the repository production IAM control.',
    '--quiet',
  ]);
  return true;
}

function addProjectBinding(member, role) {
  gcloud([
    'projects', 'add-iam-policy-binding', project,
    '--member', member,
    '--role', role,
    '--condition=None',
    '--quiet',
  ]);
}

function addSecretBinding(secret, member) {
  gcloud([
    'secrets', 'add-iam-policy-binding', secret,
    '--project', project,
    '--member', member,
    '--role', leastPrivilege.runtimeSecretRole,
    '--condition=None',
    '--quiet',
  ]);
}

function addRepositoryBinding(member) {
  gcloud([
    'artifacts', 'repositories', 'add-iam-policy-binding', resources.artifactRepository,
    '--project', project,
    '--location', region,
    '--member', member,
    '--role', leastPrivilege.builderRepositoryRole,
    '--condition=None',
    '--quiet',
  ]);
}

const plan = {
  action: 'plan',
  project,
  region,
  accounts: [resources.runtimeServiceAccount, resources.buildServiceAccount],
  runtime: {
    projectRoles: leastPrivilege.runtimeProjectRoles,
    secretRole: leastPrivilege.runtimeSecretRole,
    secrets: leastPrivilege.runtimeSecretAccess,
  },
  builder: {
    projectRoles: leastPrivilege.builderProjectRoles,
    repositoryRole: leastPrivilege.builderRepositoryRole,
    repository: resources.artifactRepository,
  },
  forbiddenRoles: leastPrivilege.runtimeForbiddenRoles,
  protectedResources: policy.protectedResources,
};

if (action === 'plan') {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else if (action === 'reconcile') {
  process.stdout.write(`${JSON.stringify({
    action: 'reconciled',
    runtimeServiceAccountCreated: accountExists(runtimeEmail),
    buildServiceAccountCreated: accountExists(builderEmail),
  }, null, 2)}\n`);
} else if (action === 'apply') {
  if (process.env.CLERVO_GCP_IAM_CONFIRM !== `apply:clervo-production-iam:${project}`) {
    die('owner_confirmation_mismatch');
  }
  assert.ok(!leastPrivilege.runtimeProjectRoles.some((role) => leastPrivilege.runtimeForbiddenRoles.includes(role)));
  assert.ok(!leastPrivilege.builderProjectRoles.some((role) => leastPrivilege.runtimeForbiddenRoles.includes(role)));

  const created = {
    runtime: createAccount(resources.runtimeServiceAccount, 'Clervo production API runtime'),
    builder: createAccount(resources.buildServiceAccount, 'Clervo production image builder'),
  };
  const runtimeMember = `serviceAccount:${runtimeEmail}`;
  const builderMember = `serviceAccount:${builderEmail}`;
  for (const role of leastPrivilege.runtimeProjectRoles) addProjectBinding(runtimeMember, role);
  for (const secret of leastPrivilege.runtimeSecretAccess) addSecretBinding(secret, runtimeMember);
  for (const role of leastPrivilege.builderProjectRoles) addProjectBinding(builderMember, role);
  addRepositoryBinding(builderMember);

  process.stdout.write(`${JSON.stringify({
    action: 'applied',
    created,
    runtimeServiceAccountCreated: accountExists(runtimeEmail),
    buildServiceAccountCreated: accountExists(builderEmail),
    scope: 'documented-least-privilege-only',
  }, null, 2)}\n`);
} else {
  die('usage_plan_reconcile_apply');
}
