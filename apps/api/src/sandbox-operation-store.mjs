import { createHash, randomUUID } from 'node:crypto';

const namespacePattern = /^[a-z0-9][a-z0-9_-]{2,31}$/u;
const operationPattern = /^op_[A-Za-z0-9]{20,64}$/u;
const tenantPattern = /^tenant_[A-Za-z0-9]{20,64}$/u;
const hashPattern = /^sha256:[a-f0-9]{64}$/u;
const leaseMilliseconds = 360_000;

function requireInput({ operationId, tenantId, requestHash, now }) {
  if (!operationPattern.test(operationId) || !tenantPattern.test(tenantId) || !hashPattern.test(requestHash)) throw new TypeError('sandbox_operation_state_input_invalid');
  if (!Number.isFinite(Date.parse(now)) || new Date(Date.parse(now)).toISOString() !== now) throw new TypeError('sandbox_operation_state_time_invalid');
}

function leaseId() { return `lease_${randomUUID().replaceAll('-', '')}`; }

function tenantHash(namespace, tenantId) {
  return `sha256:${createHash('sha256').update(namespace).update('\0').update(tenantId).digest('hex')}`;
}

export class InMemorySandboxOperationStore {
  kind = 'memory';
  durable = false;
  #operations = new Map();

  constructor({ environmentNamespace = 'local' } = {}) {
    if (!namespacePattern.test(environmentNamespace)) throw new TypeError('sandbox_operation_namespace_invalid');
    this.environmentNamespace = environmentNamespace;
  }

  async ready() { return true; }

  async begin(input) {
    requireInput(input);
    const boundTenant = tenantHash(this.environmentNamespace, input.tenantId);
    const current = this.#operations.get(input.operationId);
    if (current && (current.requestHash !== input.requestHash || current.tenantHash !== boundTenant)) return Object.freeze({ kind: 'conflict' });
    if (current?.state === 'completed') return Object.freeze({ kind: 'replay', result: current.result });
    if (current?.state === 'execution_unknown') return Object.freeze({ kind: 'unknown' });
    if (current?.state === 'executing') {
      if (Date.parse(current.leaseExpiresAt) > Date.parse(input.now)) return Object.freeze({ kind: 'in_progress' });
      this.#operations.set(input.operationId, { ...current, state: 'execution_unknown', leaseId: undefined, leaseExpiresAt: undefined, updatedAt: input.now });
      return Object.freeze({ kind: 'unknown' });
    }
    const claimedLease = leaseId();
    this.#operations.set(input.operationId, {
      tenantHash: boundTenant, requestHash: input.requestHash, state: 'executing', leaseId: claimedLease,
      leaseExpiresAt: new Date(Date.parse(input.now) + leaseMilliseconds).toISOString(), updatedAt: input.now,
    });
    return Object.freeze({ kind: 'claimed', leaseId: claimedLease });
  }

  async complete({ operationId, tenantId, requestHash, leaseId: claimedLease, result, now }) {
    requireInput({ operationId, tenantId, requestHash, now });
    const current = this.#operations.get(operationId);
    if (current?.state !== 'executing' || current.tenantHash !== tenantHash(this.environmentNamespace, tenantId)
      || current.requestHash !== requestHash || current.leaseId !== claimedLease) throw new Error('sandbox_operation_completion_lost');
    this.#operations.set(operationId, { tenantHash: current.tenantHash, requestHash, state: 'completed', result, updatedAt: now, completedAt: now });
  }

  async markUnknown({ operationId, tenantId, requestHash, leaseId: claimedLease, now }) {
    requireInput({ operationId, tenantId, requestHash, now });
    const current = this.#operations.get(operationId);
    if (current?.state !== 'executing' || current.tenantHash !== tenantHash(this.environmentNamespace, tenantId)
      || current.requestHash !== requestHash || current.leaseId !== claimedLease) throw new Error('sandbox_operation_unknown_transition_lost');
    this.#operations.set(operationId, { tenantHash: current.tenantHash, requestHash, state: 'execution_unknown', updatedAt: now });
  }

  async close() {}
}

export class PostgresSandboxOperationStore {
  kind = 'postgres';
  durable = true;

  constructor(client, { environmentNamespace }) {
    if (!client || typeof client.query !== 'function') throw new TypeError('sandbox_operation_sql_client_invalid');
    if (!namespacePattern.test(environmentNamespace)) throw new TypeError('sandbox_operation_namespace_invalid');
    this.client = client;
    this.environmentNamespace = environmentNamespace;
  }

  async ready() {
    const result = await this.client.query("SELECT to_regclass('public.clervo_sandbox_operations') AS operations", []);
    return result.rows[0]?.operations === 'clervo_sandbox_operations';
  }

  async begin(input) {
    requireInput(input);
    const boundTenant = tenantHash(this.environmentNamespace, input.tenantId);
    const claimedLease = leaseId();
    const leaseExpiresAt = new Date(Date.parse(input.now) + leaseMilliseconds).toISOString();
    const inserted = await this.client.query(
      `INSERT INTO clervo_sandbox_operations
        (environment_namespace, operation_id, tenant_hash, request_hash, state, lease_id, lease_expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'executing', $5, $6::timestamptz, $7::timestamptz, $7::timestamptz)
       ON CONFLICT (environment_namespace, operation_id) DO NOTHING
       RETURNING operation_id`,
      [this.environmentNamespace, input.operationId, boundTenant, input.requestHash, claimedLease, leaseExpiresAt, input.now],
    );
    if (inserted.rows.length === 1) return Object.freeze({ kind: 'claimed', leaseId: claimedLease });
    const selected = await this.client.query(
      `SELECT tenant_hash, request_hash, state, lease_expires_at, response_json
         FROM clervo_sandbox_operations
        WHERE environment_namespace = $1 AND operation_id = $2`,
      [this.environmentNamespace, input.operationId],
    );
    const current = selected.rows[0];
    if (!current) throw new Error('sandbox_operation_state_unavailable');
    if (current.tenant_hash !== boundTenant || current.request_hash !== input.requestHash) return Object.freeze({ kind: 'conflict' });
    if (current.state === 'completed') return Object.freeze({ kind: 'replay', result: current.response_json });
    if (current.state === 'execution_unknown') return Object.freeze({ kind: 'unknown' });
    if (Date.parse(current.lease_expires_at) > Date.parse(input.now)) return Object.freeze({ kind: 'in_progress' });
    const quarantined = await this.client.query(
      `UPDATE clervo_sandbox_operations
          SET state = 'execution_unknown', lease_id = NULL, lease_expires_at = NULL, updated_at = $3::timestamptz
        WHERE environment_namespace = $1 AND operation_id = $2 AND tenant_hash = $4 AND request_hash = $5
          AND state = 'executing' AND lease_expires_at <= $3::timestamptz
       RETURNING operation_id`,
      [this.environmentNamespace, input.operationId, input.now, boundTenant, input.requestHash],
    );
    return Object.freeze({ kind: quarantined.rows.length === 1 ? 'unknown' : 'in_progress' });
  }

  async complete({ operationId, tenantId, requestHash, leaseId: claimedLease, result, now }) {
    requireInput({ operationId, tenantId, requestHash, now });
    const completed = await this.client.query(
      `UPDATE clervo_sandbox_operations
          SET state = 'completed', lease_id = NULL, lease_expires_at = NULL, response_json = $7::jsonb,
              completed_at = $6::timestamptz, updated_at = $6::timestamptz
        WHERE environment_namespace = $1 AND operation_id = $2 AND tenant_hash = $3 AND request_hash = $4
          AND state = 'executing' AND lease_id = $5
       RETURNING operation_id`,
      [this.environmentNamespace, operationId, tenantHash(this.environmentNamespace, tenantId), requestHash, claimedLease, now, JSON.stringify(result)],
    );
    if (completed.rows.length !== 1) throw new Error('sandbox_operation_completion_lost');
  }

  async markUnknown({ operationId, tenantId, requestHash, leaseId: claimedLease, now }) {
    requireInput({ operationId, tenantId, requestHash, now });
    const quarantined = await this.client.query(
      `UPDATE clervo_sandbox_operations
          SET state = 'execution_unknown', lease_id = NULL, lease_expires_at = NULL, updated_at = $6::timestamptz
        WHERE environment_namespace = $1 AND operation_id = $2 AND tenant_hash = $3 AND request_hash = $4
          AND state = 'executing' AND lease_id = $5
       RETURNING operation_id`,
      [this.environmentNamespace, operationId, tenantHash(this.environmentNamespace, tenantId), requestHash, claimedLease, now],
    );
    if (quarantined.rows.length !== 1) throw new Error('sandbox_operation_unknown_transition_lost');
  }

  async close() { await this.client.end?.(); }
}

export async function createPostgresSandboxOperationStoreFromEnvironment(environment = process.env) {
  if (!environment.CLERVO_DATABASE_URL) throw new Error('CLERVO_DATABASE_URL is required');
  if (!environment.CLERVO_STATE_NAMESPACE) throw new Error('CLERVO_STATE_NAMESPACE is required');
  const { Pool } = await import('pg');
  const client = new Pool({
    connectionString: environment.CLERVO_DATABASE_URL, max: 4, connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000, query_timeout: 5_000, statement_timeout: 5_000, allowExitOnIdle: true, application_name: 'clervo-sandbox-api',
  });
  const store = new PostgresSandboxOperationStore(client, { environmentNamespace: environment.CLERVO_STATE_NAMESPACE });
  if (!await store.ready()) { await store.close(); throw new Error('sandbox_operation_migration_required'); }
  return store;
}
