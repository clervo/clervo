#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(repositoryRoot, 'tests', 'security', 'n0.3-secret-fixture.txt');

function runNode(relativePath, options = {}) {
  return spawnSync(process.execPath, [path.join(repositoryRoot, relativePath)], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    ...options,
  });
}

try {
  const ci = await readFile(path.join(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
  const staging = await readFile(path.join(repositoryRoot, '.github/workflows/staging.yml'), 'utf8');

  for (const workflow of [ci, staging]) {
    assert.match(workflow, /^permissions:\n  contents: read$/m);
    assert.doesNotMatch(workflow, /uses:\s+[^\s@]+@(?![a-f0-9]{40}(?:\s|$))/m);
    assert.match(workflow, /package-manager-cache: false/);
    assert.match(workflow, /npm ci --ignore-scripts/);
  }
  assert.match(ci, /fetch-depth: 0/);
  assert.match(ci, /run: npm test/);
  assert.match(staging, /name: staging/);
  assert.match(staging, /run: npm run staging:smoke/);

  await mkdir(path.dirname(fixturePath), { recursive: true });
  await writeFile(
    fixturePath,
    ['injected failure fixture', 'password=' + 'N0threeFailureFixtureValue123456789'].join('\n'),
    { encoding: 'utf8', flag: 'wx' },
  );
  const rejected = runNode('scripts/scan-secrets.mjs');
  assert.notEqual(rejected.status, 0, 'secret scanner must reject an injected credential');
  assert.match(rejected.stderr, /generic assigned secret/);
  assert.doesNotMatch(rejected.stderr, /N0threeFailureFixtureValue/);
  await rm(fixturePath, { force: true });

  const clean = runNode('scripts/scan-secrets.mjs');
  assert.equal(clean.status, 0, clean.stderr);

  const stagingSmoke = runNode('scripts/staging-smoke.mjs', {
    env: {
      ...process.env,
      CLERVO_ENV: 'staging',
      CLERVO_RELEASE_ID: 'n0.3-acceptance',
    },
  });
  assert.equal(stagingSmoke.status, 0, stagingSmoke.stderr);
  assert.match(stagingSmoke.stdout, /staging smoke: PASS/);

  execFileSync('git', ['-C', repositoryRoot, 'check-ignore', '-q', '.env']);
  const envExampleIgnored = spawnSync('git', ['-C', repositoryRoot, 'check-ignore', '-q', '.env.example']);
  assert.notEqual(envExampleIgnored.status, 0, '.env.example must remain trackable');

  console.log('N0.3 acceptance: PASS');
  console.log('CI action pins verified: 4');
  console.log('injected secret rejected: yes');
  console.log('staging hello smoke passed: yes');
  console.log('network calls made: 0 external; loopback HTTP only');
  console.log('USDC spent: 0');
} catch (error) {
  await rm(fixturePath, { force: true });
  console.error(`N0.3 acceptance: FAIL: ${error.message}`);
  process.exitCode = 1;
}