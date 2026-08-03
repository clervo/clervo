import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const sha256 = async (path) => `sha256:${createHash('sha256').update(await readFile(new URL(path, root))).digest('hex')}`;

test('the only qualified runner is hash-bound to its SBOM and passed live containment evidence', async () => {
  const registry = await json('infra/sandbox/approved-images.v1.json');
  const qualification = await json('docs/evidence/sandbox/runner-image-qualification.v5.json');
  const report = await json('docs/evidence/sandbox/gvisor-production-red-team.v1.json');
  const supply = await json('docs/evidence/sandbox/runner-supply-chain.v5.json');
  const qualified = registry.images.filter(({ lifecycle }) => lifecycle === 'qualified');
  assert.equal(qualified.length, 1);
  assert.equal(qualified[0].imageId, 'sandbox.nodejs-24');
  assert.equal(qualified[0].digest, qualification.digest);
  assert.equal(qualified[0].sbomSha256, await sha256('docs/evidence/sandbox/runner-sbom.spdx.json'));
  assert.equal(qualification.decision, 'qualified');
  assert.equal(qualification.productAvailability, 'unavailable');
  assert.equal(qualification.runtimeChecks.liveRedTeamReportSha256, report.reportSha256);
  assert.equal(qualification.supplyChainReport.sha256, await sha256('docs/evidence/sandbox/runner-supply-chain.v5.json'));
  assert.equal(supply.digest, qualified[0].digest);
  assert.equal(supply.sbom.sha256, qualified[0].sbomSha256);
  assert.equal(supply.malwareScan.status, 'passed');
  assert.equal(supply.malwareScan.databaseDownloadedBeforeIsolation, true);
  assert.equal(supply.malwareScan.scanNetwork, 'none');
  assert.equal(supply.malwareScan.infectedFiles, 0);
  assert.equal(supply.artifactAnalysis.effectiveCritical, 0);
  assert.equal(supply.artifactAnalysis.effectiveHigh, 0);
  assert.equal(report.imageDigest, qualified[0].digest);
  assert.equal(report.status, 'passed');
  assert.equal(report.probeCount, 10);
  assert.equal(report.cleanupVerified, true);
  assert.deepEqual(report.qualificationContext, {
    mode: 'persistent-production',
    clusterName: 'clervo-sandbox-production',
    zone: 'us-central1-a',
    runtimeClass: 'gvisor',
    namespace: 'clervo-sandbox-network-qualification',
  });
  assert.equal(report.runtimeMetrics.forkDenied, true);
  assert.ok(report.runtimeMetrics.maximumProcessesObserved <= 32);
  assert.equal(report.runtimeMetrics.remainingSleeps, 0);
  assert.ok(report.observations.every(({ outcome, runtimeAttested, cleanupVerified, chargedMicrousd, controls }) =>
    outcome === 'contained' && runtimeAttested === true && cleanupVerified === true && chargedMicrousd === 0
      && Object.values(controls).every(Boolean)));
  assert.ok(registry.images.filter(({ lifecycle }) => lifecycle === 'blocked').length >= 4);
});
