#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { PgBoss } from 'pg-boss';
import { PostgresSearchStateStore } from '../../apps/api/src/search-state-store.mjs';
import { PostgresX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';
import { PostgresSandboxOperationStore } from '../../apps/api/src/sandbox-operation-store.mjs';
import { ReceiverAccountingJournal } from '../../dist/packages/contracts/src/index.js';

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
const receiverAccountingInput = Object.freeze({
  settlementId: 'settle_postgres_recovery_001',
  operationId: 'op_postgres_receiver_accounting_001',
  authorizationId: 'auth_postgres_receiver_accounting_001',
  receiptHash: `sha256:${'a'.repeat(64)}`,
  settlementReferenceHash: `sha256:${'b'.repeat(64)}`,
  customerCharge: Object.freeze({ asset: 'mock:usdc', amountAtomic: '2500', decimals: 6 }),
  supplierCost: Object.freeze({ asset: 'mock:usd', amountAtomic: '400', decimals: 6 }),
  occurredAt: now,
});
const x402Operation = Object.freeze({
  idempotencyKey: 'idem_postgres_x402_recovery_001',
  requestHash: `sha256:${'1'.repeat(64)}`,
  operationId: `op_${'2'.repeat(32)}`,
  quote: Object.freeze({ quoteId: 'quote_postgres_x402_001', maximumCharge: Object.freeze({ asset: 'USDC', amountAtomic: '6000', decimals: 6 }) }),
  challenge: Object.freeze({ x402Version: 2, accepts: Object.freeze([{ amount: '6000' }]) }),
  now,
});
const x402PaymentFingerprint = `sha256:${'3'.repeat(64)}`;
const sandboxOperation = Object.freeze({
  operationId: 'op_postgres_sandbox_recovery_001',
  tenantId: 'tenant_postgres_sandbox_recovery_001',
  requestHash: `sha256:${'7'.repeat(64)}`,
  now,
});
const sandboxResult = Object.freeze({ operationId: sandboxOperation.operationId, productId: 'sandbox.run', state: 'destroyed' });

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

function bossFor(name, database, options = {}) {
  const errors = [];
  const boss = new PgBoss({
    host: '127.0.0.1',
    port: port(name),
    user: 'clervo',
    password,
    database,
    schema: 'clervo_queue_qualification',
    max: 2,
    connectionTimeoutMillis: 3_000,
    schedule: false,
    supervise: false,
    ...options,
  });
  boss.on('error', (error) => errors.push(error instanceof Error ? error.message : 'queue_error'));
  return { boss, errors };
}

async function migrate(pool) {
  const names = [
    '0001-retrieval-cache.sql',
    '0002-live-intelligence-monitoring.sql',
    '0003-search-http-state.sql',
    '0004-receiver-accounting.sql',
    '0005-x402-operation-state.sql',
    '0006-sandbox-operation-state.sql',
  ];
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
  const receiverJournal = new ReceiverAccountingJournal();
  const receiverEntry = receiverJournal.record(receiverAccountingInput).entry;
  await pool.query(
    `INSERT INTO clervo_receiver_accounting_entries (
      environment_namespace, entry_id, settlement_id, operation_id, authorization_id,
      receipt_hash, settlement_reference_hash, input_hash, entry_hash,
      previous_entry_hash, entry_json, occurred_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
    [
      policy.environmentNamespace,
      receiverEntry.entryId,
      receiverEntry.settlementId,
      receiverEntry.operationId,
      receiverEntry.authorizationId,
      receiverEntry.receiptHash,
      receiverEntry.settlementReferenceHash,
      receiverEntry.inputHash,
      receiverEntry.entryHash,
      receiverEntry.previousEntryHash ?? null,
      JSON.stringify(receiverEntry),
      receiverEntry.occurredAt,
    ],
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO clervo_receiver_accounting_entries (
        environment_namespace, entry_id, settlement_id, operation_id, authorization_id,
        receipt_hash, settlement_reference_hash, input_hash, entry_hash,
        previous_entry_hash, entry_json, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
      [
        policy.environmentNamespace,
        `acct_${'f'.repeat(40)}`,
        receiverEntry.settlementId,
        'op_postgres_receiver_accounting_002',
        receiverEntry.authorizationId,
        `sha256:${'e'.repeat(64)}`,
        receiverEntry.settlementReferenceHash,
        receiverEntry.inputHash,
        `sha256:${'f'.repeat(64)}`,
        receiverEntry.entryHash,
        JSON.stringify({
          ...receiverEntry,
          entryId: `acct_${'f'.repeat(40)}`,
          operationId: 'op_postgres_receiver_accounting_002',
          receiptHash: `sha256:${'e'.repeat(64)}`,
          entryHash: `sha256:${'f'.repeat(64)}`,
        }),
        receiverEntry.occurredAt,
      ],
    ),
    /duplicate key/u,
  );
  const x402Store = new PostgresX402OperationStore(pool, { environmentNamespace: policy.environmentNamespace });
  assert.equal(await x402Store.ready(), true);
  assert.equal((await x402Store.challenge(x402Operation)).kind, 'challenged');
  const x402Execution = await x402Store.claimExecution({ ...x402Operation, paymentFingerprint: x402PaymentFingerprint });
  assert.equal(x402Execution.kind, 'claimed');
  await x402Store.recordExecution({
    idempotencyKey: x402Operation.idempotencyKey,
    leaseId: x402Execution.leaseId,
    execution: { resultHash: `sha256:${'4'.repeat(64)}` },
    now,
  });
  const x402Settlement = await x402Store.claimSettlement({ ...x402Operation, paymentFingerprint: x402PaymentFingerprint });
  assert.equal(x402Settlement.kind, 'claimed');
  await x402Store.complete({
    idempotencyKey: x402Operation.idempotencyKey,
    leaseId: x402Settlement.leaseId,
    settlement: { referenceHash: `sha256:${'5'.repeat(64)}` },
    response: { operationId: x402Operation.operationId, state: 'RECEIPTED' },
    now,
  });
  const x402Replay = await x402Store.lookup(x402Operation);
  assert.equal(x402Replay.kind, 'replay');
  assert.equal((await x402Store.lookup({ ...x402Operation, requestHash: `sha256:${'6'.repeat(64)}` })).kind, 'conflict');
  const sandboxStore = new PostgresSandboxOperationStore(pool, { environmentNamespace: policy.environmentNamespace });
  assert.equal(await sandboxStore.ready(), true);
  const sandboxClaim = await sandboxStore.begin(sandboxOperation);
  assert.equal(sandboxClaim.kind, 'claimed');
  await sandboxStore.complete({ ...sandboxOperation, leaseId: sandboxClaim.leaseId, result: sandboxResult });
  const sandboxReplay = await sandboxStore.begin(sandboxOperation);
  assert.equal(sandboxReplay.kind, 'replay');
  assert.deepEqual(sandboxReplay.result, sandboxResult);
  assert.equal((await sandboxStore.begin({ ...sandboxOperation, requestHash: `sha256:${'8'.repeat(64)}` })).kind, 'conflict');
  const ambiguous = { ...sandboxOperation, operationId: 'op_postgres_sandbox_unknown_001', requestHash: `sha256:${'9'.repeat(64)}` };
  const ambiguousClaim = await sandboxStore.begin(ambiguous);
  await sandboxStore.markUnknown({ ...ambiguous, leaseId: ambiguousClaim.leaseId });
  assert.equal((await sandboxStore.begin(ambiguous)).kind, 'unknown');
  return { replay: replay.response, quota, receiverEntry, x402Replay: x402Replay.response, sandboxReplay: sandboxReplay.result };
}

async function receiverEntryFromDatabase(pool) {
  const result = await pool.query(
    `SELECT entry_json
       FROM clervo_receiver_accounting_entries
      WHERE environment_namespace = $1 AND settlement_id = $2`,
    [policy.environmentNamespace, receiverAccountingInput.settlementId],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0].entry_json;
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

async function proveQueueRecovery(name, database) {
  const queueName = 'clervo-qualification';
  const deadLetterName = 'clervo-qualification-dead-letter';
  const recoverableId = '11111111-1111-4111-8111-111111111111';
  const deadLetterId = '22222222-2222-4222-8222-222222222222';
  let first;
  let second;
  let firstErrors = [];
  try {
    first = bossFor(name, database);
    await first.boss.start();
    await first.boss.createQueue(deadLetterName, {
      retryLimit: 0,
      deleteAfterSeconds: 86_400,
      retentionSeconds: 86_400,
    });
    await first.boss.createQueue(queueName, {
      retryLimit: 1,
      retryDelay: 0,
      expireInSeconds: 1,
      deleteAfterSeconds: 86_400,
      retentionSeconds: 86_400,
      deadLetter: deadLetterName,
    });
    assert.equal(await first.boss.send(queueName, { operationId: operation.operationId }, { id: recoverableId }), recoverableId);
    assert.equal(await first.boss.send(queueName, { operationId: operation.operationId }, { id: recoverableId }), null);
    const active = await first.boss.fetch(queueName, { includeMetadata: true });
    assert.equal(active.length, 1);
    assert.equal(active[0].id, recoverableId);
    assert.equal(active[0].state, 'active');
    await first.boss.stop({ close: true, graceful: false, timeout: 1_000 });
    firstErrors = first.errors;
    first = undefined;

    await new Promise((resolve) => setTimeout(resolve, 1_250));
    second = bossFor(name, database, { migrate: false, createSchema: false });
    await second.boss.start();
    await second.boss.supervise(queueName);
    const recovered = await second.boss.fetch(queueName, { includeMetadata: true });
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].id, recoverableId);
    assert.equal(recovered[0].retryCount, 1);
    assert.equal((await second.boss.complete(queueName, recoverableId, { outcome: 'qualified' })).affected, 1);
    assert.equal((await second.boss.findJobs(queueName, { id: recoverableId }))[0]?.state, 'completed');

    assert.equal(await second.boss.send(queueName, { operationId: 'op_dead_letter' }, { id: deadLetterId, retryLimit: 0, deadLetter: deadLetterName }), deadLetterId);
    assert.equal((await second.boss.fetch(queueName))[0]?.id, deadLetterId);
    assert.equal((await second.boss.fail(queueName, deadLetterId, { code: 'qualification_failure' })).affected, 1);
    const deadLetters = await second.boss.findJobs(deadLetterName);
    assert.ok(deadLetters.some(({ sourceId, sourceName }) => sourceId === deadLetterId && sourceName === queueName));
    assert.deepEqual(firstErrors, []);
    assert.deepEqual(second.errors, []);
    return { queueName, deadLetterName, recoverableId, deadLetterId };
  } finally {
    await first?.boss.stop({ close: true, graceful: false, timeout: 1_000 }).catch(() => {});
    await second?.boss.stop({ close: true, graceful: true, timeout: 1_000 }).catch(() => {});
  }
}

async function proveRestoredQueue(name, database, queue) {
  const value = bossFor(name, database, { migrate: false, createSchema: false });
  try {
    await value.boss.start();
    const completed = await value.boss.findJobs(queue.queueName, { id: queue.recoverableId });
    const deadLetters = await value.boss.findJobs(queue.deadLetterName);
    assert.equal(completed[0]?.state, 'completed');
    assert.ok(deadLetters.some(({ sourceId }) => sourceId === queue.deadLetterId));
    assert.deepEqual(value.errors, []);
    return true;
  } finally {
    await value.boss.stop({ close: true, graceful: true, timeout: 1_000 }).catch(() => {});
  }
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
  const queue = await proveQueueRecovery(sourceName, policy.database);
  await sourcePool.end();
  sourcePool = undefined;

  docker(['stop', '--time', '10', sourceName]);
  docker(['start', sourceName]);
  await waitReady(sourceName);
  sourcePool = poolFor(sourceName, policy.database);
  const restartedStore = new PostgresSearchStateStore(sourcePool, { environmentNamespace: policy.environmentNamespace });
  const restartReplay = await restartedStore.begin({ ...operation, now });
  assert.equal(restartReplay.kind, 'replay');
  const restartedReceiverEntry = await receiverEntryFromDatabase(sourcePool);
  assert.deepEqual(restartedReceiverEntry, initial.receiverEntry);
  const restartedX402 = await new PostgresX402OperationStore(sourcePool, { environmentNamespace: policy.environmentNamespace }).lookup(x402Operation);
  assert.deepEqual(restartedX402.response, initial.x402Replay);
  const restartedSandbox = await new PostgresSandboxOperationStore(sourcePool, { environmentNamespace: policy.environmentNamespace }).begin(sandboxOperation);
  assert.deepEqual(restartedSandbox.result, initial.sandboxReplay);
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
  const restoredReceiverEntry = await receiverEntryFromDatabase(restorePool);
  assert.deepEqual(restoredReceiverEntry, initial.receiverEntry);
  const restoredX402 = await new PostgresX402OperationStore(restorePool, { environmentNamespace: policy.environmentNamespace }).lookup(x402Operation);
  assert.deepEqual(restoredX402.response, initial.x402Replay);
  const restoredSandbox = await new PostgresSandboxOperationStore(restorePool, { environmentNamespace: policy.environmentNamespace }).begin(sandboxOperation);
  assert.deepEqual(restoredSandbox.result, initial.sandboxReplay);
  const restoredQueue = await proveRestoredQueue(restoreName, policy.restoreDatabase, queue);
  const retention = await proveRetention(restorePool);
  outcome = {
    migrations,
    initial,
    restartReplay,
    restartedReceiverEntry,
    restoredReceiverEntry,
    restartedX402,
    restoredX402,
    restartedSandbox,
    restoredSandbox,
    archiveHash,
    retention,
    queue,
    restoredQueue,
  };
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
    queueDuplicateIdRejected: true,
    queueActiveJobRecoveredAfterWorkerLoss: true,
    queueRetryCompleted: true,
    queueDeadLettered: true,
    queueStateRestoredFromBackup: outcome.restoredQueue,
    receiverAccountingInserted: true,
    receiverAccountingDuplicateSettlementRejected: true,
    receiverAccountingSurvivedRestart: outcome.restartedReceiverEntry.entryHash === outcome.initial.receiverEntry.entryHash,
    receiverAccountingRestoredFromBackup: outcome.restoredReceiverEntry.entryHash === outcome.initial.receiverEntry.entryHash,
    x402ExactlyOnceStateInserted: outcome.initial.x402Replay.operationId === x402Operation.operationId,
    x402StateSurvivedRestart: outcome.restartedX402.kind === 'replay',
    x402StateRestoredFromBackup: outcome.restoredX402.kind === 'replay',
    sandboxExactlyOnceStateInserted: outcome.initial.sandboxReplay.operationId === sandboxOperation.operationId,
    sandboxStateSurvivedRestart: outcome.restartedSandbox.kind === 'replay',
    sandboxStateRestoredFromBackup: outcome.restoredSandbox.kind === 'replay',
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
