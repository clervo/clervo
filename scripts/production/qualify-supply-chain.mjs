#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(await readFile(path.join(root, 'infra/production/supply-chain-qualification.v1.json'), 'utf8'));
const containerEvidence = JSON.parse(await readFile(path.join(root, 'docs/evidence/production/local-container-qualification.v1.json'), 'utf8'));
const reportPath = path.join(root, 'docs/evidence/production/supply-chain-qualification.v1.json');
const sbomPath = path.join(root, 'docs/evidence/production/clervo-api.sbom.spdx.json');
const worktreeStatus = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(worktreeStatus, '', 'supply_chain_qualification_requires_clean_worktree');
const sourceCommit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'clervo-supply-chain-'));
const cacheDirectory = path.join(temporaryDirectory, 'trivy-cache');
const imageArchive = path.join(temporaryDirectory, 'candidate.tar');
const scannerUser = `${process.getuid()}:${process.getgid()}`;

function hash(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function docker(args, options = {}) {
  return execFileSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 128 * 1024 * 1024,
    stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function scanArguments(format) {
  return [
    'run',
    '--rm',
    '--user',
    scannerUser,
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges=true',
    '--pids-limit',
    '64',
    '--memory',
    '1g',
    '--cpus',
    '1',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,nodev,size=512m',
    '--volume',
    `${cacheDirectory}:/cache`,
    '--volume',
    `${imageArchive}:/scan/candidate.tar:ro`,
    policy.scanner.image,
    'image',
    '--input',
    '/scan/candidate.tar',
    '--cache-dir',
    '/cache',
    '--skip-db-update',
    '--scanners',
    'vuln',
    '--format',
    format,
  ];
}

let result;
try {
  await mkdir(cacheDirectory);
  const imageInspect = JSON.parse(docker(['image', 'inspect', containerEvidence.image.localTag]))[0];
  assert.equal(imageInspect.Id, containerEvidence.image.imageId);
  const scannerDigests = JSON.parse(docker(['image', 'inspect', policy.scanner.image, '--format', '{{json .RepoDigests}}']));
  assert.ok(scannerDigests.includes(policy.scanner.image.replace(':0.72.0@', '@')));

  const npmAuditProcess = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const npmAudit = JSON.parse(npmAuditProcess.stdout);
  const npmCounts = npmAudit.metadata?.vulnerabilities;
  assert.ok(npmCounts);
  assert.ok(npmCounts.high <= policy.dependencyAudit.maximumHigh);
  assert.ok(npmCounts.critical <= policy.dependencyAudit.maximumCritical);

  docker(['save', '--output', imageArchive, containerEvidence.image.localTag]);
  assert.ok((await stat(imageArchive)).size > 0);
  docker([
    'run',
    '--rm',
    '--user',
    scannerUser,
    '--volume',
    `${cacheDirectory}:/cache`,
    policy.scanner.image,
    'image',
    '--download-db-only',
    '--cache-dir',
    '/cache',
  ]);
  const scannerVersion = docker(['run', '--rm', '--user', scannerUser, '--network', 'none', policy.scanner.image, '--version']).split('\n')[0];
  assert.match(scannerVersion, new RegExp(`Version: ${policy.scanner.version.replaceAll('.', '\\.')}$`, 'u'));

  const vulnerabilityJson = docker(scanArguments('json'));
  const vulnerabilityReport = JSON.parse(vulnerabilityJson);
  const vulnerabilities = vulnerabilityReport.Results?.flatMap(({ Vulnerabilities }) => Vulnerabilities ?? []) ?? [];
  const vulnerabilityCounts = vulnerabilities.reduce((counts, item) => {
    const severity = String(item.Severity ?? 'UNKNOWN').toLowerCase();
    counts[severity] = (counts[severity] ?? 0) + 1;
    return counts;
  }, {});
  assert.ok((vulnerabilityCounts.high ?? 0) <= policy.containerVulnerabilityGate.maximumHigh);
  assert.ok((vulnerabilityCounts.critical ?? 0) <= policy.containerVulnerabilityGate.maximumCritical);

  const sbomJson = docker(scanArguments(policy.sbomFormat));
  const sbom = JSON.parse(sbomJson);
  assert.equal(sbom.spdxVersion, 'SPDX-2.3');
  assert.ok(Array.isArray(sbom.packages) && sbom.packages.length > 0);
  await writeFile(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`);
  const sbomBytes = await readFile(sbomPath);

  result = {
    scannerVersion,
    npmAuditHash: hash(npmAuditProcess.stdout),
    npmCounts,
    vulnerabilityReportHash: hash(vulnerabilityJson),
    vulnerabilityCounts,
    sbomHash: hash(sbomBytes),
    sbomPackageCount: sbom.packages.length,
  };
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

assert.ok(result);
await assert.rejects(stat(temporaryDirectory));
const report = {
  schemaVersion: 'clervo.production-supply-chain-qualification.v1',
  qualifiedAt: new Date().toISOString(),
  sourceCommit,
  candidateImage: {
    localTag: containerEvidence.image.localTag,
    imageId: containerEvidence.image.imageId,
    sourceCommit: containerEvidence.sourceCommit,
  },
  scanner: {
    name: policy.scanner.name,
    version: policy.scanner.version,
    runtimeVersion: result.scannerVersion,
    image: policy.scanner.image,
    dockerSocketMounted: false,
    scanNetwork: 'none',
    vulnerabilityDatabaseDownloadedBeforeIsolation: true,
  },
  dependencyAudit: {
    reportHash: result.npmAuditHash,
    vulnerabilities: result.npmCounts,
    gatePassed: true,
  },
  containerScan: {
    reportHash: result.vulnerabilityReportHash,
    vulnerabilities: result.vulnerabilityCounts,
    high: result.vulnerabilityCounts.high ?? 0,
    critical: result.vulnerabilityCounts.critical ?? 0,
    gatePassed: true,
  },
  sbom: {
    format: policy.sbomFormat,
    path: path.relative(root, sbomPath),
    hash: result.sbomHash,
    packageCount: result.sbomPackageCount,
  },
  cleanup: {
    savedImageArchiveRemoved: true,
    scannerCacheRemoved: true,
  },
  externalEffects: {
    vulnerabilityDatabaseDownloads: 1,
    cloudResourcesChanged: false,
    productionDataRead: false,
    providerCalls: 0,
    payments: 0,
    ownerCashSpentUsd: 0,
  },
  productionReady: false,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`supply-chain qualification: PASS (${result.sbomPackageCount} SPDX packages)\n`);
