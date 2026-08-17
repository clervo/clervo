#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const component = process.env.CLERVO_SANDBOX_COMPONENT ?? 'runner';
if (!['runner', 'control'].includes(component)) throw new Error('sandbox_component_invalid');
const defaultPolicyPath = component === 'control'
  ? path.join(root, 'infra/sandbox/control-service.v1.json')
  : path.join(root, 'infra/sandbox/production-plane.v1.json');
const defaultPolicy = JSON.parse(await readFile(defaultPolicyPath, 'utf8'));
const defaultRepository = component === 'control' ? defaultPolicy.imageRepository : defaultPolicy.runner?.repository;
const defaultDigest = component === 'control' ? defaultPolicy.imageDigest : defaultPolicy.runner?.imageDigest;
const image = process.env.CLERVO_SANDBOX_IMAGE ?? `${defaultRepository}@${defaultDigest}`;
const expected = new RegExp(`^us-central1-docker\\.pkg\\.dev/bloxsniper-prod/clervo-sandbox/${component}@sha256:[a-f0-9]{64}$`, 'u');
if (!expected.test(image ?? '')) throw new Error('sandbox_runner_exact_image_required');
const scannerUser = `${process.getuid()}:${process.getgid()}`;
const syftImage = 'anchore/syft@sha256:86fde6445b483d902fe011dd9f68c4987dd94e07da1e9edc004e3c2422650de6';
const clamImage = 'clamav/clamav@sha256:1b6443c4a7b456baa1abfaf9796815f8d21e2fb558dbaed5b682fd4552d8b0c3';
const temporary = await mkdtemp(path.join(os.tmpdir(), 'clervo-sandbox-supply-'));
const rootfsArchive = path.join(temporary, 'rootfs.tar');
const rootfs = path.join(temporary, 'rootfs');
const generated = path.join(temporary, 'generated');
const clamDatabase = path.join(temporary, 'clam-database');
const freshclamConfig = path.join(root, 'infra/sandbox/runner/freshclam-qualification.conf');
const sbomPath = path.join(root, `docs/evidence/sandbox/${component === 'runner' ? 'runner-sbom-hammer3' : 'control-sbom'}.spdx.json`);
const reportPath = path.join(root, `docs/evidence/sandbox/${component}-supply-chain.v5.json`);
let containerId;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 128 * 1024 * 1024,
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function hash(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function isolatedScanner(imageReference, mounts, command, entrypoint) {
  return run('docker', [
    'run', '--rm', '--user', scannerUser, '--network', 'none', '--read-only',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true', '--pids-limit', '64',
    '--memory', '2g', '--cpus', '1', '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777',
    '--env', 'SYFT_CHECK_FOR_APP_UPDATE=false', '--env', 'XDG_CACHE_HOME=/tmp',
    ...mounts.flatMap(([source, target, mode]) => ['--volume', `${source}:${target}:${mode}`]),
    ...(entrypoint ? ['--entrypoint', entrypoint] : []),
    imageReference, ...command,
  ]);
}

let report;
try {
  await mkdir(rootfs); await mkdir(generated); await mkdir(clamDatabase);
  run('gcloud', ['auth', 'configure-docker', 'us-central1-docker.pkg.dev', '--quiet']);
  run('docker', ['pull', image]);
  let metadata;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    metadata = JSON.parse(run('gcloud', [
      'artifacts', 'docker', 'images', 'describe', image,
      '--project', 'bloxsniper-prod', '--show-provenance', '--show-package-vulnerability', '--format=json',
    ]));
    const completed = metadata.discovery_summary?.discovery?.some((entry) => entry.discovery?.analysisStatus === 'FINISHED_SUCCESS'
      && ['OS', 'NPM', 'SECRET'].every((type) => entry.discovery?.analysisCompleted?.analysisType?.includes(type)));
    if (completed) break;
    if (attempt === 39) throw new Error('sandbox_artifact_analysis_timeout');
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  assert.equal(metadata.image_summary?.fully_qualified_digest, image);
  assert.ok(metadata.image_summary?.slsa_build_level >= 3);
  const discovery = metadata.discovery_summary?.discovery ?? [];
  assert.ok(discovery.some((entry) => entry.discovery?.analysisStatus === 'FINISHED_SUCCESS'
    && ['OS', 'NPM', 'SECRET'].every((type) => entry.discovery?.analysisCompleted?.analysisType?.includes(type))));
  const vulnerabilities = metadata.package_vulnerability_summary?.vulnerabilities ?? {};
  assert.equal((vulnerabilities.CRITICAL ?? []).length, 0);
  assert.equal((vulnerabilities.HIGH ?? []).length, 0);

  containerId = run('docker', ['create', image]);
  run('docker', ['export', '--output', rootfsArchive, containerId]);
  run('docker', ['rm', containerId]); containerId = undefined;
  run('tar', ['--extract', '--file', rootfsArchive, '--directory', rootfs, '--no-same-owner', '--no-same-permissions']);
  const syftVersion = JSON.parse(isolatedScanner(syftImage, [], ['version', '-o', 'json'])).version;
  assert.equal(syftVersion, '1.44.0');
  isolatedScanner(syftImage, [[rootfs, '/scan/rootfs', 'ro'], [generated, '/out', 'rw']], [
    'dir:/scan/rootfs', '-o', 'spdx-json=/out/runner-sbom.spdx.json',
  ]);
  const sbomBytes = await readFile(path.join(generated, 'runner-sbom.spdx.json'));
  const sbom = JSON.parse(sbomBytes);
  assert.equal(sbom.spdxVersion, 'SPDX-2.3');
  assert.ok(sbom.packages.length > 0);
  run('docker', [
    'run', '--rm', '--user', scannerUser, '--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges=true', '--pids-limit', '64', '--memory', '1g', '--cpus', '1',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777',
    '--volume', `${clamDatabase}:/db:rw`, '--volume', `${freshclamConfig}:/qualification/freshclam.conf:ro`,
    '--entrypoint', '/usr/bin/freshclam', clamImage, '--config-file=/qualification/freshclam.conf',
  ]);
  const clamMounts = [[clamDatabase, '/db', 'ro']];
  const clamVersion = isolatedScanner(clamImage, clamMounts, ['--database=/db', '--version'], '/usr/bin/clamscan').split('\n')[0];
  const clamOutput = isolatedScanner(clamImage, [[rootfs, '/scan', 'ro'], ...clamMounts], ['--database=/db', '--recursive', '--infected', '/scan'], '/usr/bin/clamscan');
  const scanned = Number(clamOutput.match(/Scanned files:\s+(\d+)/u)?.[1] ?? 0);
  const infected = Number(clamOutput.match(/Infected files:\s+(\d+)/u)?.[1] ?? -1);
  assert.ok(scanned > 0); assert.equal(infected, 0);

  await writeFile(sbomPath, `${JSON.stringify(sbom)}\n`);
  const finalSbom = await readFile(sbomPath);
  report = {
    schemaVersion: 'clervo.sandbox-runner-supply-chain.v1',
    component,
    evaluatedAt: new Date().toISOString(),
    image,
    digest: image.slice(image.indexOf('@') + 1),
    build: { status: 'passed', builder: 'google-cloud-build', slsaBuildLevel: metadata.image_summary.slsa_build_level, provenanceAttestations: metadata.provenance_summary?.provenance?.length ?? 0 },
    artifactAnalysis: { status: 'passed', analysisStatus: 'FINISHED_SUCCESS', effectiveCritical: 0, effectiveHigh: 0, secretAnalysisComplete: true },
    malwareScan: { status: 'passed', scanner: 'clamav', version: clamVersion, databaseDownloadedBeforeIsolation: true, scanNetwork: 'none', filesScanned: scanned, infectedFiles: infected, scannerImage: clamImage },
    sbom: { format: 'SPDX-2.3', generator: `syft-${syftVersion}`, path: path.relative(root, sbomPath), sha256: hash(finalSbom), packageCount: sbom.packages.length, generatorImage: syftImage },
    isolation: { dockerSocketMountedToScanner: false, scannerNetwork: 'none', scannerReadOnly: true, scannerCapabilitiesDropped: 'ALL' },
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
} finally {
  if (containerId) {
    try { run('docker', ['rm', '--force', containerId]); } catch {}
  }
  try { run('docker', ['image', 'rm', image]); } catch {}
  await rm(temporary, { recursive: true, force: true });
}

process.stdout.write(`sandbox ${component} supply chain: PASS (${report.sbom.packageCount} SPDX packages, ${report.malwareScan.filesScanned} files)\n`);
