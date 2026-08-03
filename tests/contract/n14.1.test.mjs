import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policy = JSON.parse(await readFile('infra/production/release-policy.v1.json', 'utf8'));
const report = JSON.parse(await readFile('docs/evidence/production/local-container-qualification.v1.json', 'utf8'));
const dockerfile = await readFile('Dockerfile', 'utf8');
const entrypoint = await readFile('apps/api/src/staging-search-main.mjs', 'utf8');

test('production candidate container is immutable-base, non-root, and fail-closed', () => {
  assert.equal(policy.publicDeploymentEnabled, false);
  assert.equal(policy.paymentEnabled, false);
  assert.match(policy.container.baseImage, /@sha256:[a-f0-9]{64}$/u);
  assert.match(dockerfile, new RegExp(`^FROM ${policy.container.buildBaseImage.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')} AS build$`, 'mu'));
  assert.match(dockerfile, new RegExp(`^FROM ${policy.container.baseImage.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')} AS runtime$`, 'mu'));
  assert.match(dockerfile, /^USER 65532:65532$/mu);
  assert.match(dockerfile, /^STOPSIGNAL SIGTERM$/mu);
  assert.match(dockerfile, /^HEALTHCHECK /mu);
  assert.match(dockerfile, /npm ci --omit=dev --omit=optional/u);
  assert.doesNotMatch(dockerfile, /\b(?:latest|curl|wget|apt-get)\b/u);
  const localRuntimeImports = [...entrypoint.matchAll(/from '\.\/([^']+)'/gu)].map((match) => match[1]);
  assert.ok(localRuntimeImports.length > 0);
  for (const imported of localRuntimeImports) assert.match(dockerfile, new RegExp(`\\b${imported.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'u'));
});

test('exact local image passed bounded runtime qualification without external effects', () => {
  assert.equal(report.releaseCandidateId, policy.releaseCandidateId);
  assert.equal(report.interfaceHash, policy.interfaceHash);
  assert.match(report.image.imageId, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(report.image.baseImage, policy.container.baseImage);
  assert.equal(report.image.registryDigest, null);
  assert.equal(report.image.signedBuildProvenance, false);
  assert.equal(report.image.vulnerabilityScan, 'not_run');
  assert.equal(report.checks.exactNonRootUser, true);
  assert.equal(report.checks.readOnlyRootDeniedWrite, true);
  assert.equal(report.checks.noNewPrivileges, true);
  assert.equal(report.checks.allCapabilitiesDropped, true);
  assert.equal(report.checks.boundedCpuMemoryAndPids, true);
  assert.equal(report.checks.runtimeNetworkDenied, true);
  assert.equal(report.checks.secretLikeRuntimeEnvironmentEntries, 0);
  assert.equal(report.checks.healthPassed, true);
  assert.equal(report.checks.paidExecutionEnabled, false);
  assert.equal(report.checks.gracefulSigtermExitCode, 0);
  assert.equal(report.checks.oomKilled, false);
  assert.deepEqual(report.externalEffects, {
    publicDeploymentChanged: false,
    cloudResourcesChanged: false,
    providerCalls: 0,
    payments: 0,
    ownerCashSpentUsd: 0,
  });
  assert.equal(report.productionReady, false);
  assert.deepEqual(report.remainingPrerequisites, policy.deploymentPrerequisites);
});
