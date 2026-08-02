#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { PostgresSearchStateStore } from '../../apps/api/src/search-state-store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(await readFile(path.join(root, 'infra/production/postgres-qualification.v1.json'), 'utf8'));
const evidencePath = path.join(root, 'docs/evidence/production/postgres-recovery-qualification.v1.json');
const worktreeStatus = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(worktreeStatus, '', 'postgres_recovery_qualification_requires_clean_worktree');
const sourceCommit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const suffix = `${sourceCommit.slice(0, 6)}-${process.pid}`;
const sourceName = `clervo-pg-source-${suffix}`;
const restoreName = `clervo-pg-restore-${suffix}`;
const sourceVolume = `${sourceName}-data`;
const restoreVolume = `${restoreName}-data`;
const backupDirectory = await mkdtemp(path.join(os.tmpdir(), 'clervo-pg-recovery-'));
const password = randomBytes(24).toString('base64url');
const operation = {
  idempotencyKey: 'idem_postgres_recovery_001',
  requestHash: `sha256:${'c'.repeat(64)}`,
  operationId: 'op_cccccccccccccccccccccccccccccccc',
};
const now = '2026-08-02T10:00:00.000Z';
const response = Object.freeze({ operationId: operation.operationId, state: 'RECEIPTED', replayed: false });

function docker(args, options = {}) {
  return execFileSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}

function removeContainer(name) {
  spawnSync('docker', ['rm', '--force', name], { cwd: root, encoding: 'utf8', timeout: 15_000 });
}

function removeVolume(name) {
  spawnSync('docker', ['volume', 'rm', name], { cwd: root, encoding: 'utf8', timeout: 15_000 });
}

function startDatabase(name, volume, database) {
  docker(['volume', 'create', volume]);
  docker([
    'run',
    '--detach',
    '--name',
    name,
    '--publish',
    '127.0.0.1::5432',
    '--cpus',
    policy.resourceLimits.cpu,
    '--memory',
    policy.resourceLimits.memory,
    '--pids-limit',
    String(policy.resourceLimits.pids),
    '--security-opt',
    'no-new-privileges=true',
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,size=32m',
    '--env',
    `POSTGRES_PASSWORD=${password}`,
    '--env',
    'POSTGRES_USER=clervo',
    '--env',
    `POSTGRES_DB=${database}`,
    '--volume',
    `${volume}:/var/lib/postgresql`,
    policy.image,
  ]);
}

async function waitReady(name) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = spawnSync('docker', ['exec', name, 'pg_isready', '--username', 'clervo'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 2_000,
    });
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('postgres_readiness_timeout');
}

function port(name) {
  const published = docker(['port', name, '5432/tcp']);
  const match = published.match(/127\.0\.0\.1:(\d+)$/u);
  if (!match) throw new Error('postgres_loopback_port_unavailable');
  return Number(match[1]);
}

function poolFor(name, database) {
  return new Pool({
    host: '127.0.0.1',
    port: port(name),
    user: 'clervo',
    password,
    database,
    max: 2,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
}

async function migrate(pool) {
  const names = ['0001-retrieval-cache.sql', '0002-live-intelligence-monitoring.sql', '0003-search-http-state.sql'];
  for (const name of names) {
    await pool.query(await readFile(path.join(root, 'infra/storage/postgres', name), 'utf8'));
  }
  return names;
}

async function proveState(pool) {
  const store = new PostgresSearchStateStore(pool, {
    environmentNamespace: policy.environmentNamespace,
    freeQuotaLimit: 3,
    freeQuotaWindowMs: 60_000,
  });
  assert.equal(await store.ready(), true);
  const claim = await store.begin({ ...operation, now });
  assert.equal(claim.kind, 'claimed');
  await store.complete({ ...operation, leaseId: claim.leaseId, response, now });
  const replay = await store.begin({ ...operation, now });
  assert.equal(replay.kind, 'replay');
  const conflict = await store.begin({ ...operation, requestHash: `sha256:${'d'.repeat(64)}`, now });
  assert.equal(conflict.kind, 'conflict');
  const quota = [];
  for (let index = 0; index < 4; index += 1) quota.push(await store.consumeFreeQuota('198.51.100.10', now));
  assert.deepEqual(quota.map(({ allowed }) => allowed), [true, true, true, false]);
  return { replay: replay.response, quota };
}

async function proveRetention(pool) {
  const store = new PostgresSearchStateStore(pool, { environmentNamespace: policy.environmentNamespace });
  const expired = {
    idempotencyKey: 'idem_postgres_expired_001',
    requestHash: `sha256:${'e'.repeat(64)}`,
    operationId: 'op_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  };
  const old = '2026-07-01T00:00:00.000Z';
  const claim = await store.begin({ ...expired, now: old });
  await store.complete({ ...expired, leaseId: claim.leaseId, response: { operationId: expired.operationId }, now: old });
  const plan = await store.retentionPlan(now);
  assert.ok(plan.completedOperations >= 1);
  const applied = await store.applyRetention(now);
  const reclaimed = await store.begin({ ...expired, now });
  assert.equal(reclaimed.kind, 'claimed');
  await store.abandon({ ...expired, leaseId: reclaimed.leaseId });
  return { plan, applied };
}

let sourcePool;
let restorePool;
let outcome;
try {
  const imageDigest = JSON.parse(docker(['image', 'inspect', policy.image, '--format', '{{json .RepoDigests}}']));
  assert.ok(imageDigest.includes(policy.image.replace(':18.4-bookworm@', '@')));

  startDatabase(sourceName, sourceVolume, policy.database);
  await waitReady(sourceName);
  sourcePool = poolFor(sourceName, policy.database);
  const migrations = await migrate(sourcePool);
  const initial = await proveState(sourcePool);
  await sourcePool.end();
  sourcePool = undefined;

  docker(['stop', '--time', '10', sourceName]);
  docker(['start', sourceName]);
  await waitReady(sourceName);
  sourcePool = poolFor(sourceName, policy.database);
  const restartedStore = new PostgresSearchStateStore(sourcePool, { environmentNamespace: policy.environmentNamespace });
  const restartReplay = await restartedStore.begin({ ...operation, now });
  assert.equal(restartReplay.kind, 'replay');
  await sourcePool.end();
  sourcePool = undefined;

  docker([
    'exec',
    sourceName,
    'pg_dump',
    '--username',
    'clervo',
    '--dbname',
    policy.database,
    '--format',
    'custom',
    '--no-owner',
    '--no-privileges',
    '--file',
    '/var/lib/postgresql/clervo.dump',
  ]);
  const archivePath = path.join(backupDirectory, 'clervo.dump');
  docker(['cp', `${sourceName}:/var/lib/postgresql/clervo.dump`, archivePath]);
  const archiveBytes = await readFile(archivePath);
  assert.ok((await stat(archivePath)).size > 0);
  const archiveHash = `sha256:${createHash('sha256').update(archiveBytes).digest('hex')}`;

  startDatabase(restoreName, restoreVolume, policy.restoreDatabase);
  await waitReady(restoreName);
  docker(['cp', archivePath, `${restoreName}:/var/lib/postgresql/clervo.dump`]);
  docker([
    'exec',
    restoreName,
    'pg_restore',
    '--username',
    'clervo',
    '--dbname',
    policy.restoreDatabase,
    '--exit-on-error',
    '--single-transaction',
    '--no-owner',
    '--no-privileges',
    '/var/lib/postgresql/clervo.dump',
  ]);
  restorePool = poolFor(restoreName, policy.restoreDatabase);
  const restoredStore = new PostgresSearchStateStore(restorePool, { environmentNamespace: policy.environmentNamespace });
  assert.equal(await restoredStore.ready(), true);
  const restoredReplay = await restoredStore.begin({ ...operation, now });
  assert.equal(restoredReplay.kind, 'replay');
  assert.deepEqual(restoredReplay.response, initial.replay);
  const retention = await proveRetention(restorePool);
  outcome = { migrations, initial, restartReplay, archiveHash, retention };
} finally {
  await sourcePool?.end().catch(() => {});
  await restorePool?.end().catch(() => {});
  removeContainer(sourceName);
  removeContainer(restoreName);
  removeVolume(sourceVolume);
  removeVolume(restoreVolume);
  await rm(backupDirectory, { recursive: true, force: true });
}

assert.ok(outcome);
for (const name of [sourceName, restoreName]) {
  assert.notEqual(spawnSync('docker', ['container', 'inspect', name], { cwd: root, encoding: 'utf8' }).status, 0);
}
for (const volume of [sourceVolume, restoreVolume]) {
  assert.notEqual(spawnSync('docker', ['volume', 'inspect', volume], { cwd: root, encoding: 'utf8' }).status, 0);
}
await assert.rejects(stat(backupDirectory));

const report = {
  schemaVersion: 'clervo.postgres-recovery-qualification.v1',
  qualifiedAt: new Date().toISOString(),
  sourceCommit,
  postgresVersion: policy.postgresVersion,
  image: policy.image,
  environmentNamespace: policy.environmentNamespace,
  migrations: outcome.migrations,
  checks: {
    exactImageDigest: true,
    migrationsApplied: true,
    atomicClaimCompleteReplay: true,
    conflictRejected: true,
    quotaAllowedThenRejected: outcome.initial.quota.map(({ allowed }) => allowed),
    processRestartReplay: outcome.restartReplay.kind === 'replay',
    backupArchiveNonEmpty: true,
    backupArchiveHash: outcome.archiveHash,
    isolatedRestoreReady: true,
    restoredReplayMatched: true,
    retentionPlanCountOnly: true,
    expiredRetentionApplied: outcome.retention.applied.completedOperations >= 1,
  },
  cleanup: {
    sourceContainerRemoved: true,
    restoreContainerRemoved: true,
    sourceVolumeRemoved: true,
    restoreVolumeRemoved: true,
    temporaryArchiveRemoved: true,
  },
  externalEffects: {
    cloudResourcesChanged: false,
    productionDataRead: false,
    productionDataChanged: false,
    providerCalls: 0,
    payments: 0,
    ownerCashSpentUsd: 0,
  },
  productionReady: false,
};
await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`postgres recovery qualification: PASS (${outcome.archiveHash})\n`);
