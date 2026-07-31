#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = ['development', 'test', 'staging', 'production'];

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), 'utf8'));
}

try {
  const environments = await Promise.all(
    names.map((name) => readJson(`infra/environments/${name}.json`)),
  );
  const manifest = await readJson('infra/staging/release-manifest.json');
  const envExample = await readFile(path.join(repositoryRoot, '.env.example'), 'utf8');

  for (const [index, environment] of environments.entries()) {
    assert.equal(environment.schemaVersion, 1, `${names[index]} schema version drift`);
    assert.equal(environment.name, names[index], `${names[index]} name drift`);
    assert.equal(environment.productionDataAllowed, environment.name === 'production');
    assert.match(environment.databaseBoundary, new RegExp(environment.name));
    assert.match(environment.queueBoundary, new RegExp(environment.name));
    assert.equal(environment.service.healthPath, environment.name === 'staging' ? '/v1/health' : '/healthz');
  }

  assert.equal(new Set(environments.map((item) => item.databaseBoundary)).size, names.length);
  assert.equal(new Set(environments.map((item) => item.queueBoundary)).size, names.length);

  const staging = environments.find((item) => item.name === 'staging');
  const production = environments.find((item) => item.name === 'production');
  assert.equal(staging.deploymentApprovalRequired, true);
  assert.equal(production.deploymentApprovalRequired, true);
  assert.notEqual(staging.secretSource, production.secretSource);
  assert.notEqual(staging.databaseBoundary, production.databaseBoundary);
  assert.notEqual(staging.queueBoundary, production.queueBoundary);

  assert.equal(manifest.environment, 'staging');
  assert.equal(manifest.healthPath, staging.service.healthPath);
  assert.equal(manifest.service, 'clervo-stage4-slice-staging');
  assert.equal(manifest.releaseId, '2f6fd6c');
  assert.equal(manifest.revision, 'clervo-stage4-slice-staging-00001-7fn');
  assert.match(manifest.artifact, /@sha256:16bcfbf77f874c0e323a67b18712df4d92318b71227838de141a0bbca0e72354$/u);
  assert.equal(manifest.access, 'private-authenticated');
  assert.equal(manifest.retrievalMode, 'recorded');
  assert.equal(manifest.paidExecutionEnabled, false);
  assert.equal(manifest.rollback.strategy, 'restore-previous-revision-or-delete-first-deployment');
  assert.equal(manifest.rollback.requiredInput, '.staging-state/previous-revision');
  assert.equal(manifest.liveDeploymentStatus, 'verified-private-recorded-only');

  assert.match(envExample, /^CLERVO_ENV=development$/m);
  assert.match(envExample, /^DATABASE_URL=$/m);
  assert.match(envExample, /^QUEUE_DATABASE_URL=$/m);
  assert.doesNotMatch(envExample, /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/i);

  console.log('environment contract: PASS');
  console.log(`environments: ${names.join(', ')}`);
  console.log('staging/production shared database boundaries: 0');
  console.log('staging/production shared queue boundaries: 0');
  console.log('network calls made: 0');
  console.log('USDC spent: 0');
} catch (error) {
  console.error(`environment contract: FAIL: ${error.message}`);
  process.exitCode = 1;
}