import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  InMemorySearchStateStore,
  PostgresSearchStateStore,
  SEARCH_STATE_RETENTION,
} from '../../apps/api/src/search-state-store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requestHash = `sha256:${'b'.repeat(64)}`;

test('memory retention deletes only expired completed responses and stale leases', async () => {
  const store = new InMemorySearchStateStore({ environmentNamespace: 'retention-test' });
  const completed = await store.begin({
    idempotencyKey: 'idem_n144_completed_001',
    requestHash,
    operationId: 'op_11111111111111111111111111111111',
    now: '2026-08-01T00:00:00.000Z',
  });
  await store.complete({
    idempotencyKey: 'idem_n144_completed_001',
    requestHash,
    operationId: completed.operationId,
    leaseId: completed.leaseId,
    response: { operationId: completed.operationId },
    now: '2026-08-01T00:00:10.000Z',
  });
  await store.begin({
    idempotencyKey: 'idem_n144_stale_00001',
    requestHash,
    operationId: 'op_22222222222222222222222222222222',
    now: '2026-08-01T22:00:00.000Z',
  });
  const fresh = await store.begin({
    idempotencyKey: 'idem_n144_fresh_00001',
    requestHash,
    operationId: 'op_33333333333333333333333333333333',
    now: '2026-08-02T00:00:00.000Z',
  });

  const evaluatedAt = '2026-08-02T00:00:11.000Z';
  assert.deepEqual(await store.retentionPlan(evaluatedAt), {
    completedOperations: 1,
    staleInProgressOperations: 1,
    quotaRecords: 0,
  });
  assert.deepEqual(await store.applyRetention(evaluatedAt), {
    completedOperations: 1,
    staleInProgressOperations: 1,
    quotaRecords: 0,
  });
  assert.equal((await store.begin({
    idempotencyKey: 'idem_n144_completed_001',
    requestHash,
    operationId: 'op_44444444444444444444444444444444',
    now: evaluatedAt,
  })).kind, 'claimed');
  assert.equal((await store.begin({
    idempotencyKey: 'idem_n144_fresh_00001',
    requestHash,
    operationId: fresh.operationId,
    now: evaluatedAt,
  })).kind, 'in_progress');
});

test('Postgres retention uses namespace-bound aggregate planning and bounded deletes', async () => {
  const queries = [];
  const client = {
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      if (sql.includes('SELECT') && sql.includes('completed_operations')) {
        return { rows: [{ completed_operations: 2, stale_in_progress_operations: 1, quota_records: 4 }] };
      }
      return { rows: [] };
    },
  };
  const store = new PostgresSearchStateStore(client, { environmentNamespace: 'production' });
  const now = '2026-08-02T09:00:00.000Z';
  assert.deepEqual(await store.retentionPlan(now), {
    completedOperations: 2,
    staleInProgressOperations: 1,
    quotaRecords: 4,
  });
  assert.deepEqual(await store.applyRetention(now), {
    completedOperations: 2,
    staleInProgressOperations: 1,
    quotaRecords: 4,
  });
  assert.equal(queries.length, 4);
  assert.ok(queries.every(({ parameters }) => parameters[0] === 'production'));
  assert.match(queries[2].sql, /DELETE FROM clervo_search_http_operations/u);
  assert.match(queries[3].sql, /DELETE FROM clervo_search_free_quota/u);
  assert.deepEqual(queries[0].parameters.slice(2), [
    SEARCH_STATE_RETENTION.completedResponseSeconds,
    SEARCH_STATE_RETENTION.staleInProgressSeconds,
    SEARCH_STATE_RETENTION.quotaRecordSeconds,
  ]);
});

test('retention policy and operator fail closed before any apply connection', async () => {
  const policy = JSON.parse(await readFile(path.join(root, 'infra/production/search-state-retention.v1.json'), 'utf8'));
  assert.equal(policy.completedResponseSeconds, SEARCH_STATE_RETENTION.completedResponseSeconds);
  assert.equal(policy.staleInProgressSeconds, SEARCH_STATE_RETENTION.staleInProgressSeconds);
  assert.equal(policy.quotaRecordSeconds, SEARCH_STATE_RETENTION.quotaRecordSeconds);
  assert.equal(policy.storesRawRequestBody, false);
  assert.equal(policy.storesRawNetworkAddress, false);
  assert.equal(policy.productionDeletionRequiresExactOwnerApproval, true);

  const result = spawnSync(process.execPath, ['scripts/production/search-state-retention.mjs', '--apply'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CLERVO_STATE_NAMESPACE: 'production', CLERVO_RETENTION_CONFIRM: '' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exact retention confirmation required/u);
  assert.doesNotMatch(result.stderr, /CLERVO_DATABASE_URL is required/u);
});
