import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policy = JSON.parse(await readFile('infra/production/supply-chain-qualification.v1.json', 'utf8'));
const evidence = JSON.parse(await readFile('docs/evidence/production/supply-chain-qualification.v1.json', 'utf8'));
const sbomBytes = await readFile('docs/evidence/production/clervo-api.sbom.spdx.json');
const sbom = JSON.parse(sbomBytes);
const script = await readFile('scripts/production/qualify-supply-chain.mjs', 'utf8');

test('scanner is immutable, isolated from the Docker socket, and gated', () => {
  assert.equal(policy.scanner.version, '0.72.0');
  assert.match(policy.scanner.image, /^ghcr\.io\/aquasecurity\/trivy:0\.72\.0@sha256:[a-f0-9]{64}$/u);
  assert.equal(policy.scanner.dockerSocketAllowed, false);
  assert.equal(policy.scanner.scanNetwork, 'none');
  assert.equal(policy.dependencyAudit.maximumHigh, 0);
  assert.equal(policy.dependencyAudit.maximumCritical, 0);
  assert.equal(policy.containerVulnerabilityGate.maximumHigh, 0);
  assert.equal(policy.containerVulnerabilityGate.maximumCritical, 0);
  assert.doesNotMatch(script, /var\/run\/docker\.sock/u);
  assert.match(script, /--download-db-only/u);
  assert.match(script, /--skip-db-update/u);
  assert.match(script, /supply_chain_qualification_requires_clean_worktree/u);
});

test('dependency, container, and SBOM evidence bind the exact qualified image', () => {
  assert.equal(evidence.scanner.version, policy.scanner.version);
  assert.equal(evidence.scanner.image, policy.scanner.image);
  assert.equal(evidence.scanner.dockerSocketMounted, false);
  assert.equal(evidence.scanner.scanNetwork, 'none');
  assert.equal(evidence.dependencyAudit.vulnerabilities.high, 0);
  assert.equal(evidence.dependencyAudit.vulnerabilities.critical, 0);
  assert.equal(evidence.dependencyAudit.gatePassed, true);
  assert.equal(evidence.containerScan.high, 0);
  assert.equal(evidence.containerScan.critical, 0);
  assert.equal(evidence.containerScan.gatePassed, true);
  assert.equal(evidence.sbom.format, 'spdx-json');
  assert.equal(evidence.sbom.packageCount, sbom.packages.length);
  assert.equal(evidence.sbom.hash, `sha256:${createHash('sha256').update(sbomBytes).digest('hex')}`);
  assert.equal(sbom.spdxVersion, 'SPDX-2.3');
  assert.ok(sbom.packages.length > 0);
  assert.deepEqual(evidence.cleanup, {
    savedImageArchiveRemoved: true,
    scannerCacheRemoved: true,
  });
  assert.deepEqual(evidence.externalEffects, {
    vulnerabilityDatabaseDownloads: 1,
    cloudResourcesChanged: false,
    productionDataRead: false,
    providerCalls: 0,
    payments: 0,
    ownerCashSpentUsd: 0,
  });
  assert.equal(evidence.productionReady, false);
});
