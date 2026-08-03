#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const policy = JSON.parse(await readFile(
  new URL('../../infra/production/gcp/deployment.v1.json', import.meta.url),
  'utf8',
));
const action = process.argv[2] ?? 'plan';
const releaseSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' }).trim();
assert.match(releaseSha, /^[a-f0-9]{40}$/u, 'release commit must be exact');

const serviceAccount = `projects/${policy.project}/serviceAccounts/${policy.resources.buildServiceAccount}@${policy.project}.iam.gserviceaccount.com`;
const tag = `${policy.region}-docker.pkg.dev/${policy.project}/${policy.resources.artifactRepository}/${policy.resources.image}:${releaseSha}`;
const plan = {
  action: 'plan',
  project: policy.project,
  region: policy.region,
  releaseSha,
  cleanWorktree: status === '',
  tag,
  serviceAccount,
  config: policy.build.config,
};

if (action === 'plan') {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else if (action === 'submit') {
  assert.equal(status, '', 'production build requires a clean worktree');
  assert.equal(process.env.CLERVO_CLOUD_BUILD_CONFIRM, `build:${releaseSha}`, 'production build confirmation mismatch');
  const result = spawnSync('gcloud', [
    'builds', 'submit', '.',
    '--project', policy.project,
    '--region', policy.region,
    '--config', policy.build.config,
    '--service-account', serviceAccount,
    '--substitutions', `_RELEASE_SHA=${releaseSha}`,
    '--format=json',
    '--quiet',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Cloud Build failed');
  const build = JSON.parse(result.stdout);
  assert.equal(build.status, 'SUCCESS', 'Cloud Build did not succeed');
  const image = build.results?.images?.find(({ name }) => name === tag);
  assert.match(image?.digest ?? '', /^sha256:[a-f0-9]{64}$/u, 'Cloud Build digest missing');
  process.stdout.write(`${JSON.stringify({
    action: 'built',
    buildId: build.id,
    releaseSha,
    tag,
    image: `${tag.slice(0, tag.lastIndexOf(':'))}@${image.digest}`,
    status: build.status,
  }, null, 2)}\n`);
} else {
  throw new Error('usage: gcp-build.mjs [plan|submit]');
}
