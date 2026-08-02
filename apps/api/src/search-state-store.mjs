import { createHash, randomUUID } from 'node:crypto';
import { InMemoryFreeSearchQuota } from '../../../dist/packages/contracts/src/index.js';

const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/u;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const LEASE_MS = 30_000;
export const SEARCH_STATE_RETENTION = Object.freeze({
  completedResponseSeconds: 86_400,
  staleInProgressSeconds: 3_600,
  quotaRecordSeconds: 7_200,
});

function assertNamespace(value) {
  if (!NAMESPACE_PATTERN.test(value)) throw new TypeError('invalid_search_state_namespace');
}

function assertHash(value) {
  if (!HASH_PATTERN.test(value)) throw new TypeError('invalid_search_state_hash');
}

function leaseId() {
  return `lease_${randomUUID().replaceAll('-', '')}`;
}

function quotaSubjectHash(namespace, subject) {
  if (typeof subject !== 'string' || subject.length < 1 || subject.length > 200) throw new TypeError('invalid_quota_subject');
  return `sha256:${createHash('sha256').update(`${namespace}\0${subject}`).digest('hex')}`;
}

export class InMemorySearchStateStore {
  kind = 'memory';
  durable = false;
  #operations = new Map();

  constructor({ freeQuota = new InMemoryFreeSearchQuota(), environmentNamespace = 'local' } = {}) {
    assertNamespace(environmentNamespace);
    this.environmentNamespace = environmentNamespace;
    this.freeQuota = freeQuota;
  }

  async ready() {
    return true;
  }

  async begin({ idempotencyKey, requestHash, operationId, now }) {
    assertHash(requestHash);
    const current = this.#operations.get(idempotencyKey);
    if (current?.requestHash !== undefined && current.requestHash !== requestHash) {
      return Object.freeze({ kind: 'conflict', operationId: current.operationId });
    }
    if (current?.response !== undefined) {
      return Object.freeze({ kind: 'replay', operationId: current.operationId, response: current.response });
    }
    if (current?.leaseId !== undefined && Date.parse(current.leaseExpiresAt) > Date.parse(now)) {
      return Object.freeze({ kind: 'in_progress', operationId: current.operationId });
    }
    const claimedLeaseId = leaseId();
    this.#operations.set(idempotencyKey, {
      requestHash,
      operationId: current?.operationId ?? operationId,
      leaseId: claimedLeaseId,
      leaseExpiresAt: new Date(Date.parse(now) + LEASE_MS).toISOString(),
    });
    return Object.freeze({ kind: 'claimed', operationId: current?.operationId ?? operationId, leaseId: claimedLeaseId });
  }

  async complete({ idempotencyKey, requestHash, operationId, leaseId: claimedLeaseId, response, now }) {
    const current = this.#operations.get(idempotencyKey);
    if (
      current?.requestHash !== requestHash
      || current?.operationId !== operationId
      || current?.leaseId !== claimedLeaseId
    ) throw new Error('idempotency_completion_lost');
    this.#operations.set(idempotencyKey, { requestHash, operationId, response, completedAt: now });
  }

  async abandon({ idempotencyKey, requestHash, operationId, leaseId: claimedLeaseId }) {
    const current = this.#operations.get(idempotencyKey);
    if (
      current?.requestHash === requestHash
      && current?.operationId === operationId
      && current?.leaseId === claimedLeaseId
    ) this.#operations.delete(idempotencyKey);
  }

  async consumeFreeQuota(subject, now) {
    return this.freeQuota.consume(subject, now);
  }

  async retentionPlan(now) {
    const completedBefore = Date.parse(now) - SEARCH_STATE_RETENTION.completedResponseSeconds * 1_000;
    const staleBefore = Date.parse(now) - SEARCH_STATE_RETENTION.staleInProgressSeconds * 1_000;
    let completedOperations = 0;
    let staleInProgressOperations = 0;
    for (const value of this.#operations.values()) {
      if (value.response !== undefined && Date.parse(value.completedAt) < completedBefore) completedOperations += 1;
      if (value.leaseExpiresAt !== undefined && Date.parse(value.leaseExpiresAt) < staleBefore) staleInProgressOperations += 1;
    }
    return Object.freeze({ completedOperations, staleInProgressOperations, quotaRecords: 0 });
  }

  async applyRetention(now) {
    const plan = await this.retentionPlan(now);
    const completedBefore = Date.parse(now) - SEARCH_STATE_RETENTION.completedResponseSeconds * 1_000;
    const staleBefore = Date.parse(now) - SEARCH_STATE_RETENTION.staleInProgressSeconds * 1_000;
    for (const [key, value] of this.#operations) {
      if (
        (value.response !== undefined && Date.parse(value.completedAt) < completedBefore)
        || (value.leaseExpiresAt !== undefined && Date.parse(value.leaseExpiresAt) < staleBefore)
      ) this.#operations.delete(key);
    }
    return plan;
  }

  async close() {}
}

export class PostgresSearchStateStore {
  kind = 'postgres';
  durable = true;

  constructor(client, {
    environmentNamespace,
    freeQuotaLimit = 3,
    freeQuotaWindowMs = 60_000,
  }) {
    if (!client || typeof client.query !== 'function') throw new TypeError('invalid_search_state_sql_client');
    assertNamespace(environmentNamespace);
    if (!Number.isInteger(freeQuotaLimit) || freeQuotaLimit < 1) throw new TypeError('invalid_free_search_quota');
    if (!Number.isInteger(freeQuotaWindowMs) || freeQuotaWindowMs < 1_000) throw new TypeError('invalid_free_search_quota');
    this.client = client;
    this.environmentNamespace = environmentNamespace;
    this.freeQuotaLimit = freeQuotaLimit;
    this.freeQuotaWindowMs = freeQuotaWindowMs;
  }

  async ready() {
    const result = await this.client.query(
      'SELECT to_regclass(\'public.clervo_search_http_operations\') AS operations, to_regclass(\'public.clervo_search_free_quota\') AS quota',
      [],
    );
    return result.rows[0]?.operations === 'clervo_search_http_operations'
      && result.rows[0]?.quota === 'clervo_search_free_quota';
  }

  async begin({ idempotencyKey, requestHash, operationId, now }) {
    assertHash(requestHash);
    const claimedLeaseId = leaseId();
    const leaseExpiresAt = new Date(Date.parse(now) + LEASE_MS).toISOString();
    const inserted = await this.client.query(
      `INSERT INTO clervo_search_http_operations
        (environment_namespace, idempotency_key, request_hash, operation_id, state, lease_id, lease_expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'in_progress', $5, $6::timestamptz, $7::timestamptz, $7::timestamptz)
       ON CONFLICT (environment_namespace, idempotency_key) DO NOTHING
       RETURNING operation_id`,
      [this.environmentNamespace, idempotencyKey, requestHash, operationId, claimedLeaseId, leaseExpiresAt, now],
    );
    if (inserted.rows.length === 1) return Object.freeze({ kind: 'claimed', operationId, leaseId: claimedLeaseId });

    const selected = await this.client.query(
      `SELECT request_hash, operation_id, state, response_json, lease_expires_at
         FROM clervo_search_http_operations
        WHERE environment_namespace = $1 AND idempotency_key = $2`,
      [this.environmentNamespace, idempotencyKey],
    );
    const current = selected.rows[0];
    if (current === undefined) throw new Error('idempotency_state_unavailable');
    if (current.request_hash !== requestHash) return Object.freeze({ kind: 'conflict', operationId: current.operation_id });
    if (current.state === 'completed') return Object.freeze({ kind: 'replay', operationId: current.operation_id, response: current.response_json });
    if (Date.parse(current.lease_expires_at) > Date.parse(now)) return Object.freeze({ kind: 'in_progress', operationId: current.operation_id });

    const reclaimed = await this.client.query(
      `UPDATE clervo_search_http_operations
          SET lease_id = $3, lease_expires_at = $4::timestamptz, updated_at = $5::timestamptz
        WHERE environment_namespace = $1 AND idempotency_key = $2
          AND request_hash = $6 AND state = 'in_progress' AND lease_expires_at <= $5::timestamptz
       RETURNING operation_id`,
      [this.environmentNamespace, idempotencyKey, claimedLeaseId, leaseExpiresAt, now, requestHash],
    );
    if (reclaimed.rows.length === 1) return Object.freeze({ kind: 'claimed', operationId: current.operation_id, leaseId: claimedLeaseId });
    return Object.freeze({ kind: 'in_progress', operationId: current.operation_id });
  }

  async complete({ idempotencyKey, requestHash, operationId, leaseId: claimedLeaseId, response, now }) {
    const result = await this.client.query(
      `UPDATE clervo_search_http_operations
          SET state = 'completed', response_json = $6::jsonb, lease_id = NULL,
              lease_expires_at = NULL, completed_at = $7::timestamptz, updated_at = $7::timestamptz
        WHERE environment_namespace = $1 AND idempotency_key = $2 AND request_hash = $3
          AND operation_id = $4 AND state = 'in_progress' AND lease_id = $5
       RETURNING operation_id`,
      [this.environmentNamespace, idempotencyKey, requestHash, operationId, claimedLeaseId, JSON.stringify(response), now],
    );
    if (result.rows.length !== 1) throw new Error('idempotency_completion_lost');
  }

  async abandon({ idempotencyKey, requestHash, operationId, leaseId: claimedLeaseId }) {
    await this.client.query(
      `DELETE FROM clervo_search_http_operations
        WHERE environment_namespace = $1 AND idempotency_key = $2 AND request_hash = $3
          AND operation_id = $4 AND state = 'in_progress' AND lease_id = $5`,
      [this.environmentNamespace, idempotencyKey, requestHash, operationId, claimedLeaseId],
    );
  }

  async consumeFreeQuota(subject, now) {
    const requestToken = leaseId();
    const subjectHash = quotaSubjectHash(this.environmentNamespace, subject);
    const windowSeconds = this.freeQuotaWindowMs / 1_000;
    const result = await this.client.query(
      `INSERT INTO clervo_search_free_quota
        (environment_namespace, subject_hash, window_started_at, request_count, last_consumed_token, updated_at)
       VALUES ($1, $2, $3::timestamptz, 1, $4, $3::timestamptz)
       ON CONFLICT (environment_namespace, subject_hash) DO UPDATE SET
         window_started_at = CASE
           WHEN clervo_search_free_quota.window_started_at + ($5 * interval '1 second') <= $3::timestamptz THEN $3::timestamptz
           ELSE clervo_search_free_quota.window_started_at END,
         request_count = CASE
           WHEN clervo_search_free_quota.window_started_at + ($5 * interval '1 second') <= $3::timestamptz THEN 1
           WHEN clervo_search_free_quota.request_count < $6 THEN clervo_search_free_quota.request_count + 1
           ELSE clervo_search_free_quota.request_count END,
         last_consumed_token = CASE
           WHEN clervo_search_free_quota.window_started_at + ($5 * interval '1 second') <= $3::timestamptz
             OR clervo_search_free_quota.request_count < $6 THEN $4
           ELSE clervo_search_free_quota.last_consumed_token END,
         updated_at = $3::timestamptz
       RETURNING window_started_at, request_count, last_consumed_token`,
      [this.environmentNamespace, subjectHash, now, requestToken, windowSeconds, this.freeQuotaLimit],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('quota_state_unavailable');
    const allowed = row.last_consumed_token === requestToken;
    const count = Number(row.request_count);
    return Object.freeze({
      allowed,
      limit: this.freeQuotaLimit,
      remaining: allowed ? Math.max(0, this.freeQuotaLimit - count) : 0,
      resetAt: new Date(Date.parse(row.window_started_at) + this.freeQuotaWindowMs).toISOString(),
    });
  }

  async retentionPlan(now) {
    const result = await this.client.query(
      `SELECT
         count(*) FILTER (
           WHERE state = 'completed'
             AND completed_at < $2::timestamptz - ($3 * interval '1 second')
         )::integer AS completed_operations,
         count(*) FILTER (
           WHERE state = 'in_progress'
             AND lease_expires_at < $2::timestamptz - ($4 * interval '1 second')
         )::integer AS stale_in_progress_operations,
         (
           SELECT count(*)::integer
             FROM clervo_search_free_quota
            WHERE environment_namespace = $1
              AND updated_at < $2::timestamptz - ($5 * interval '1 second')
         ) AS quota_records
       FROM clervo_search_http_operations
       WHERE environment_namespace = $1`,
      [
        this.environmentNamespace,
        now,
        SEARCH_STATE_RETENTION.completedResponseSeconds,
        SEARCH_STATE_RETENTION.staleInProgressSeconds,
        SEARCH_STATE_RETENTION.quotaRecordSeconds,
      ],
    );
    const row = result.rows[0];
    return Object.freeze({
      completedOperations: Number(row?.completed_operations ?? 0),
      staleInProgressOperations: Number(row?.stale_in_progress_operations ?? 0),
      quotaRecords: Number(row?.quota_records ?? 0),
    });
  }

  async applyRetention(now) {
    const plan = await this.retentionPlan(now);
    await this.client.query(
      `DELETE FROM clervo_search_http_operations
        WHERE environment_namespace = $1
          AND (
            (state = 'completed' AND completed_at < $2::timestamptz - ($3 * interval '1 second'))
            OR
            (state = 'in_progress' AND lease_expires_at < $2::timestamptz - ($4 * interval '1 second'))
          )`,
      [
        this.environmentNamespace,
        now,
        SEARCH_STATE_RETENTION.completedResponseSeconds,
        SEARCH_STATE_RETENTION.staleInProgressSeconds,
      ],
    );
    await this.client.query(
      `DELETE FROM clervo_search_free_quota
        WHERE environment_namespace = $1
          AND updated_at < $2::timestamptz - ($3 * interval '1 second')`,
      [this.environmentNamespace, now, SEARCH_STATE_RETENTION.quotaRecordSeconds],
    );
    return plan;
  }

  async close() {
    await this.client.end?.();
  }
}

export async function createPostgresSearchStateStoreFromEnvironment(environment = process.env) {
  const connectionString = environment.CLERVO_DATABASE_URL;
  const environmentNamespace = environment.CLERVO_STATE_NAMESPACE;
  if (!connectionString) throw new Error('CLERVO_DATABASE_URL is required');
  if (!environmentNamespace) throw new Error('CLERVO_STATE_NAMESPACE is required');
  const { Pool } = await import('pg');
  const client = new Pool({
    connectionString,
    max: 4,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    application_name: 'clervo-search-api',
  });
  const store = new PostgresSearchStateStore(client, { environmentNamespace });
  if (!await store.ready()) {
    await store.close();
    throw new Error('search_state_migrations_required');
  }
  return store;
}
