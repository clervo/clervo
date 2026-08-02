#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(await readFile(path.join(root, 'infra/production/release-policy.v1.json'), 'utf8'));
const output = path.join(root, 'docs/evidence/production/local-container-qualification.v1.json');
const shortCommit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const image = `clervo-production-candidate:local-${shortCommit}`;
let containerId;

function docker(args, options = {}) {
  const value = execFileSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  return typeof value === 'string' ? value.trim() : '';
}

function waitForHealth(id) {
  const program = [
    "const response = await fetch('http://127.0.0.1:8080/v1/health', { signal: AbortSignal.timeout(2000) });",
    'if (!response.ok) process.exit(1);',
    'process.stdout.write(await response.text());',
  ].join(' ');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync('docker', ['exec', id, 'node', '-e', program], {
      cwd: root,
      encoding: 'utf8',
      timeout: 3_000,
    });
    if (result.status === 0) return JSON.parse(result.stdout);
  }
  throw new Error('container_health_timeout');
}

try {
  assert.equal(policy.publicDeploymentEnabled, false);
  assert.equal(policy.paymentEnabled, false);
  docker([
    'build',
    '--file',
    policy.container.dockerfile,
    '--tag',
    image,
    '--label',
    `dev.clervo.release-candidate=${policy.releaseCandidateId}`,
    '.',
  ], { capture: false });

  const imageInspect = JSON.parse(docker(['image', 'inspect', image]))[0];
  assert.match(imageInspect.Id, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(imageInspect.Config.User, policy.container.user);
  assert.deepEqual(imageInspect.Config.Cmd, ['node', './apps/api/src/staging-search-main.mjs']);
  assert.equal(imageInspect.Config.WorkingDir, '/app');
  assert.ok(imageInspect.Config.Healthcheck?.Test.includes('CMD'));
  assert.equal(imageInspect.Config.StopSignal, policy.container.stopSignal);
  assert.ok(imageInspect.Config.Env.every((entry) => !/(?:TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL)=/iu.test(entry)));

  containerId = docker([
    'run',
    '--detach',
    '--read-only',
    '--network',
    policy.localQualification.network,
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges=true',
    '--pids-limit',
    String(policy.localQualification.pids),
    '--memory',
    policy.localQualification.memory,
    '--cpus',
    policy.localQualification.cpu,
    '--tmpfs',
    `${policy.localQualification.temporaryFilesystem}:rw,noexec,nosuid,nodev,size=16m`,
    '--env',
    'CLERVO_ENV=production-local-qualification',
    '--env',
    `CLERVO_RELEASE_ID=${shortCommit}`,
    '--env',
    'CLERVO_PUBLIC_ORIGIN=https://unverified.invalid',
    '--name',
    `clervo-production-qualification-${shortCommit}`,
    image,
  ]);

  const health = waitForHealth(containerId);
  assert.equal(health.status, 'ok');
  assert.equal(health.releaseId, shortCommit);
  assert.equal(health.paidExecutionEnabled, false);

  const uid = docker(['exec', containerId, 'node', '-p', '`${process.getuid()}:${process.getgid()}`']);
  assert.equal(uid, policy.container.user);
  const rootWrite = docker([
    'exec',
    containerId,
    'node',
    '-e',
    "import fs from 'node:fs'; try { fs.writeFileSync('/clervo-write-probe', 'x'); process.exit(1); } catch { process.stdout.write('denied'); }",
  ]);
  assert.equal(rootWrite, 'denied');
  const network = docker([
    'exec',
    containerId,
    'node',
    '-e',
    "try { await fetch('https://example.com', { signal: AbortSignal.timeout(2000) }); process.exit(1); } catch { process.stdout.write('denied'); }",
  ]);
  assert.equal(network, 'denied');

  docker(['stop', '--time', '10', containerId]);
  const stopped = JSON.parse(docker(['container', 'inspect', containerId]))[0];
  assert.equal(stopped.State.Running, false);
  assert.equal(stopped.State.ExitCode, 0);
  assert.equal(stopped.State.OOMKilled, false);

  const report = {
    schemaVersion: 'clervo.production-local-container-qualification.v1',
    qualifiedAt: new Date().toISOString(),
    sourceCommit: shortCommit,
    releaseCandidateId: policy.releaseCandidateId,
    interfaceHash: policy.interfaceHash,
    image: {
      localTag: image,
      imageId: imageInspect.Id,
      baseImage: policy.container.baseImage,
      registryDigest: null,
      signedBuildProvenance: false,
      vulnerabilityScan: 'not_run',
    },
    checks: {
      exactNonRootUser: true,
      readOnlyRootDeniedWrite: true,
      noNewPrivileges: true,
      allCapabilitiesDropped: true,
      boundedCpuMemoryAndPids: true,
      runtimeNetworkDenied: true,
      secretLikeRuntimeEnvironmentEntries: 0,
      healthPassed: true,
      paidExecutionEnabled: false,
      gracefulSigtermExitCode: 0,
      oomKilled: false,
    },
    externalEffects: {
      publicDeploymentChanged: false,
      cloudResourcesChanged: false,
      providerCalls: 0,
      payments: 0,
      ownerCashSpentUsd: 0,
    },
    productionReady: false,
    remainingPrerequisites: policy.deploymentPrerequisites,
  };
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`production container qualification: PASS (${report.image.imageId})`);
} finally {
  if (containerId !== undefined) {
    spawnSync('docker', ['rm', '--force', containerId], {
      cwd: root,
      encoding: 'utf8',
      timeout: 15_000,
    });
  }
}
