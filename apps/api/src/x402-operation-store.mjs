import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { ReceiverAccountingJournal } from '../../../dist/packages/contracts/src/index.js';

const LEASE_MS = 30_000;
const TERMINAL_UNKNOWN = new Set(['execution_unknown', 'settlement_unknown']);

function leaseId() {
  return `lease_${randomBytes(16).toString('hex')}`;
}

function assertNamespace(value) {
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/u.test(value ?? '')) throw new TypeError('invalid_x402_state_namespace');
}

function assertHash(value, code = 'invalid_x402_state_hash') {
  if (!/^sha256:[a-f0-9]{64}$/u.test(value ?? '')) throw new TypeError(code);
}

function assertTrafficClass(value) {
  if (value !== undefined && !['external', 'internal', 'unknown'].includes(value)) throw new TypeError('invalid_x402_traffic_class');
}

function assertOperation(input) {
  if (!/^[!-~]{8,128}$/u.test(input.idempotencyKey ?? '')) throw new TypeError('invalid_x402_idempotency_key');
  assertHash(input.requestHash, 'invalid_x402_request_hash');
  if (!/^op_[a-f0-9]{32}$/u.test(input.operationId ?? '')) throw new TypeError('invalid_x402_operation_id');
}

function publicRecord(record) {
  return Object.freeze({
    kind: record.state === 'completed' ? 'replay' : TERMINAL_UNKNOWN.has(record.state) ? 'unknown' : record.state,
    operationId: record.operationId,
    state: record.state,
    quote: record.quote,
    challenge: record.challenge,
    ...(record.paymentFingerprint ? { paymentFingerprint: record.paymentFingerprint } : {}),
    ...(record.execution ? { execution: record.execution } : {}),
    ...(record.settlement ? { settlement: record.settlement } : {}),
    ...(record.response ? { response: record.response } : {}),
  });
}

export class InMemoryX402OperationStore {
  kind = 'memory';
  durable = false;
  #operations = new Map();
  #fingerprints = new Map();
  #accounting = new ReceiverAccountingJournal();

  constructor({ environmentNamespace = 'local' } = {}) {
    assertNamespace(environmentNamespace);
    this.environmentNamespace = environmentNamespace;
  }

  async ready() { return true; }

  async lookup({ idempotencyKey, requestHash, now: observedAtRaw }) {
    const current = this.#operations.get(idempotencyKey);
    if (!current) return Object.freeze({ kind: 'missing' });
    if (current.requestHash !== requestHash) return Object.freeze({ kind: 'conflict', operationId: current.operationId });
    const observedAt = observedAtRaw === undefined ? undefined : Date.parse(observedAtRaw);
    if (Number.isFinite(observedAt) && ['executing', 'settling'].includes(current.state) && Date.parse(current.leaseExpiresAt) <= observedAt) {
      current.state = current.state === 'executing' ? 'execution_unknown' : 'settlement_unknown';
      current.leaseId = undefined;
      current.leaseExpiresAt = undefined;
      if (current.state === 'settlement_unknown' && current.settlement === undefined) {
        current.settlement = { kind: 'unknown', reason: 'settlement_process_interrupted' };
      }
    }
    return publicRecord(current);
  }

  async challenge(input) {
    assertOperation(input);
    assertTrafficClass(input.trafficClass);
    const existing = await this.lookup(input);
    if (existing.kind !== 'missing') return existing;
    const record = {
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      operationId: input.operationId,
      state: 'challenged',
      quote: structuredClone(input.quote),
      challenge: structuredClone(input.challenge),
      customerRef: input.customerRef,
      trafficClass: input.trafficClass ?? 'external',
    };
    this.#operations.set(input.idempotencyKey, record);
    return publicRecord(record);
  }

  async claimExecution(input) {
    assertOperation(input);
    assertHash(input.paymentFingerprint, 'invalid_x402_payment_fingerprint');
    const current = this.#operations.get(input.idempotencyKey);
    if (!current || current.requestHash !== input.requestHash || current.operationId !== input.operationId) return this.lookup(input);
    const claimedBy = this.#fingerprints.get(input.paymentFingerprint);
    if (claimedBy !== undefined && claimedBy !== input.idempotencyKey) return Object.freeze({ kind: 'payment_conflict' });
    if (current.state !== 'challenged') return publicRecord(current);
    const claimedLeaseId = leaseId();
    current.state = 'executing';
    current.paymentFingerprint = input.paymentFingerprint;
    current.leaseId = claimedLeaseId;
    current.leaseExpiresAt = new Date(Date.parse(input.now) + LEASE_MS).toISOString();
    this.#fingerprints.set(input.paymentFingerprint, input.idempotencyKey);
    return Object.freeze({ ...publicRecord(current), kind: 'claimed', leaseId: claimedLeaseId });
  }

  async recordExecution(input) {
    const current = this.#operations.get(input.idempotencyKey);
    if (current?.state !== 'executing' || current.leaseId !== input.leaseId) throw new Error('x402_execution_claim_lost');
    current.state = 'executed';
    current.execution = structuredClone(input.execution);
    current.leaseId = undefined;
    current.leaseExpiresAt = undefined;
    return publicRecord(current);
  }

  async markExecutionUnknown(input) {
    const current = this.#operations.get(input.idempotencyKey);
    if (current?.state !== 'executing' || current.leaseId !== input.leaseId) throw new Error('x402_execution_claim_lost');
    current.state = 'execution_unknown';
    current.leaseId = undefined;
    current.leaseExpiresAt = undefined;
    return publicRecord(current);
  }

  async claimSettlement(input) {
    const current = this.#operations.get(input.idempotencyKey);
    if (current?.state !== 'executed' || current.paymentFingerprint !== input.paymentFingerprint) return current ? publicRecord(current) : Object.freeze({ kind: 'missing' });
    const claimedLeaseId = leaseId();
    current.state = 'settling';
    current.leaseId = claimedLeaseId;
    current.leaseExpiresAt = new Date(Date.parse(input.now) + LEASE_MS).toISOString();
    return Object.freeze({ ...publicRecord(current), kind: 'claimed', leaseId: claimedLeaseId });
  }

  async complete(input) {
    assertTrafficClass(input.trafficClass);
    const current = this.#operations.get(input.idempotencyKey);
    if (current?.state !== 'settling' || current.leaseId !== input.leaseId) throw new Error('x402_settlement_claim_lost');
    const accounting = input.accountingInput === undefined ? undefined : this.#accounting.record(input.accountingInput);
    current.state = 'completed';
    current.settlement = structuredClone(input.settlement);
    current.response = structuredClone(input.response);
    current.completedAt = input.now;
    current.customerRef = input.customerRef ?? current.customerRef;
    current.trafficClass = input.trafficClass ?? current.trafficClass;
    current.leaseId = undefined;
    current.leaseExpiresAt = undefined;
    return Object.freeze({ ...publicRecord(current), ...(accounting ? { accounting } : {}) });
  }

  async markSettlementUnknown(input) {
    const current = this.#operations.get(input.idempotencyKey);
    if (current?.state !== 'settling' || current.leaseId !== input.leaseId) throw new Error('x402_settlement_claim_lost');
    current.state = 'settlement_unknown';
    current.settlement = structuredClone(input.settlement);
    current.leaseId = undefined;
    current.leaseExpiresAt = undefined;
    return publicRecord(current);
  }
}

export class PostgresX402OperationStore {
  kind = 'postgres';
  durable = true;

  constructor(client, { environmentNamespace } = {}) {
    if (!client || typeof client.query !== 'function') throw new TypeError('invalid_x402_state_sql_client');
    assertNamespace(environmentNamespace);
    this.client = client;
    this.environmentNamespace = environmentNamespace;
  }

  async ready() {
    const result = await this.client.query("SELECT to_regclass('public.clervo_x402_operations') AS operations", []);
    return result.rows[0]?.operations === 'clervo_x402_operations';
  }

  async lookup({ idempotencyKey, requestHash, now: observedAt }) {
    if (observedAt !== undefined) {
      await this.client.query(
        `UPDATE clervo_x402_operations
            SET state = CASE WHEN state = 'executing' THEN 'execution_unknown' ELSE 'settlement_unknown' END,
                settlement_json = CASE WHEN state = 'settling' THEN '{"kind":"unknown","reason":"settlement_process_interrupted"}'::jsonb ELSE settlement_json END,
                lease_id = NULL, lease_expires_at = NULL, updated_at = $3::timestamptz
          WHERE environment_namespace = $1 AND idempotency_key = $2
            AND state IN ('executing', 'settling') AND lease_expires_at <= $3::timestamptz`,
        [this.environmentNamespace, idempotencyKey, observedAt],
      );
    }
    const result = await this.client.query(
      `SELECT * FROM clervo_x402_operations
        WHERE environment_namespace = $1 AND idempotency_key = $2`,
      [this.environmentNamespace, idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) return Object.freeze({ kind: 'missing' });
    if (row.request_hash !== requestHash) return Object.freeze({ kind: 'conflict', operationId: row.operation_id });
    return rowRecord(row);
  }

  async challenge(input) {
    assertOperation(input);
    assertTrafficClass(input.trafficClass);
    await this.client.query(
      `INSERT INTO clervo_x402_operations (
        environment_namespace, idempotency_key, request_hash, operation_id, state,
        quote_json, challenge_json, traffic_class, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'challenged', $5::jsonb, $6::jsonb, $7, $8::timestamptz, $8::timestamptz)
      ON CONFLICT (environment_namespace, idempotency_key) DO NOTHING`,
      [this.environmentNamespace, input.idempotencyKey, input.requestHash, input.operationId, JSON.stringify(input.quote), JSON.stringify(input.challenge), input.trafficClass ?? 'external', input.now],
    );
    return this.lookup(input);
  }

  async claimExecution(input) {
    assertOperation(input);
    assertHash(input.paymentFingerprint, 'invalid_x402_payment_fingerprint');
    const claimedLeaseId = leaseId();
    let result;
    try {
      result = await this.client.query(
        `UPDATE clervo_x402_operations
            SET state = 'executing', payment_fingerprint = $5, lease_id = $6,
                lease_expires_at = $7::timestamptz, updated_at = $8::timestamptz
          WHERE environment_namespace = $1 AND idempotency_key = $2
            AND request_hash = $3 AND operation_id = $4 AND state = 'challenged'
        RETURNING *`,
        [this.environmentNamespace, input.idempotencyKey, input.requestHash, input.operationId, input.paymentFingerprint, claimedLeaseId, new Date(Date.parse(input.now) + LEASE_MS).toISOString(), input.now],
      );
    } catch (error) {
      if (error?.code === '23505') return Object.freeze({ kind: 'payment_conflict' });
      throw error;
    }
    if (result.rows[0]) return Object.freeze({ ...rowRecord(result.rows[0]), kind: 'claimed', leaseId: claimedLeaseId });
    return this.lookup(input);
  }

  async recordExecution(input) {
    return this.#transition({
      input,
      from: 'executing',
      to: 'executed',
      assignments: 'execution_json = $4::jsonb, lease_id = NULL, lease_expires_at = NULL',
      values: [JSON.stringify(input.execution)],
      error: 'x402_execution_claim_lost',
    });
  }

  async markExecutionUnknown(input) {
    const result = await this.client.query(
      `UPDATE clervo_x402_operations
          SET state = 'execution_unknown', lease_id = NULL, lease_expires_at = NULL, updated_at = $4::timestamptz
        WHERE environment_namespace = $1 AND idempotency_key = $2 AND state = 'executing' AND lease_id = $3
      RETURNING *`,
      [this.environmentNamespace, input.idempotencyKey, input.leaseId, input.now],
    );
    if (!result.rows[0]) throw new Error('x402_execution_claim_lost');
    return rowRecord(result.rows[0]);
  }

  async claimSettlement(input) {
    const claimedLeaseId = leaseId();
    const result = await this.client.query(
      `UPDATE clervo_x402_operations
          SET state = 'settling', lease_id = $4, lease_expires_at = $5::timestamptz, updated_at = $6::timestamptz
        WHERE environment_namespace = $1 AND idempotency_key = $2
          AND payment_fingerprint = $3 AND state = 'executed'
      RETURNING *`,
      [this.environmentNamespace, input.idempotencyKey, input.paymentFingerprint, claimedLeaseId, new Date(Date.parse(input.now) + LEASE_MS).toISOString(), input.now],
    );
    if (result.rows[0]) return Object.freeze({ ...rowRecord(result.rows[0]), kind: 'claimed', leaseId: claimedLeaseId });
    return this.lookup(input);
  }

  async complete(input) {
    const client = typeof this.client.connect === 'function' ? await this.client.connect() : this.client;
    const release = typeof client.release === 'function' ? () => client.release() : () => {};
    try {
      await client.query('BEGIN');
      let accounting;
      if (input.accountingInput !== undefined) accounting = await recordAccounting(client, this.environmentNamespace, input.accountingInput);
      const result = await client.query(
        `UPDATE clervo_x402_operations
            SET state = 'completed', settlement_json = $4::jsonb, response_json = $5::jsonb,
                customer_ref = $7, traffic_class = $8,
                lease_id = NULL, lease_expires_at = NULL, completed_at = $6::timestamptz, updated_at = $6::timestamptz
          WHERE environment_namespace = $1 AND idempotency_key = $2 AND state = 'settling' AND lease_id = $3
        RETURNING *`,
        [this.environmentNamespace, input.idempotencyKey, input.leaseId, JSON.stringify(input.settlement), JSON.stringify(input.response), input.now, input.customerRef ?? null, input.trafficClass ?? 'external'],
      );
      if (!result.rows[0]) throw new Error('x402_settlement_claim_lost');
      await client.query('COMMIT');
      return Object.freeze({ ...rowRecord(result.rows[0]), ...(accounting ? { accounting } : {}) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      release();
    }
  }

  async markSettlementUnknown(input) {
    const result = await this.client.query(
      `UPDATE clervo_x402_operations
          SET state = 'settlement_unknown', settlement_json = $4::jsonb,
              lease_id = NULL, lease_expires_at = NULL, updated_at = $5::timestamptz
        WHERE environment_namespace = $1 AND idempotency_key = $2 AND state = 'settling' AND lease_id = $3
      RETURNING *`,
      [this.environmentNamespace, input.idempotencyKey, input.leaseId, JSON.stringify(input.settlement), input.now],
    );
    if (!result.rows[0]) throw new Error('x402_settlement_claim_lost');
    return rowRecord(result.rows[0]);
  }

  async #transition({ input, from, to, assignments, values, error }) {
    const result = await this.client.query(
      `UPDATE clervo_x402_operations SET state = '${to}', ${assignments}, updated_at = $5::timestamptz
        WHERE environment_namespace = $1 AND idempotency_key = $2 AND state = '${from}' AND lease_id = $3
      RETURNING *`,
      [this.environmentNamespace, input.idempotencyKey, input.leaseId, ...values, input.now],
    );
    if (!result.rows[0]) throw new Error(error);
    return rowRecord(result.rows[0]);
  }
}

async function recordAccounting(client, environmentNamespace, input) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('clervo_receiver_accounting_entries:' || $1))", [environmentNamespace]);
  const existing = await client.query(
    `SELECT entry_json FROM clervo_receiver_accounting_entries
      WHERE environment_namespace = $1`,
    [environmentNamespace],
  );
  const journal = new ReceiverAccountingJournal();
  const remaining = new Map(existing.rows.map(({ entry_json: entry }) => [entry.entryHash, entry]));
  let previous;
  while (remaining.size > 0) {
    const entry = [...remaining.values()].find((candidate) => candidate.previousEntryHash === previous);
    if (!entry) throw new Error('receiver_accounting_chain_failure');
    const replayed = journal.record({
      settlementId: entry.settlementId,
      operationId: entry.operationId,
      authorizationId: entry.authorizationId,
      receiptHash: entry.receiptHash,
      settlementReferenceHash: entry.settlementReferenceHash,
      customerCharge: entry.postings[0].amount,
      supplierCost: entry.postings[2].amount,
      occurredAt: entry.occurredAt,
    }).entry;
    if (replayed.entryHash !== entry.entryHash) throw new Error('receiver_accounting_chain_failure');
    remaining.delete(entry.entryHash);
    previous = entry.entryHash;
  }
  const accounting = journal.record(input);
  if (accounting.kind === 'recorded') {
    const entry = accounting.entry;
    await client.query(
      `INSERT INTO clervo_receiver_accounting_entries (
        environment_namespace, entry_id, settlement_id, operation_id, authorization_id,
        receipt_hash, settlement_reference_hash, input_hash, entry_hash,
        previous_entry_hash, entry_json, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::timestamptz)`,
      [environmentNamespace, entry.entryId, entry.settlementId, entry.operationId, entry.authorizationId, entry.receiptHash, entry.settlementReferenceHash, entry.inputHash, entry.entryHash, entry.previousEntryHash ?? null, JSON.stringify(entry), entry.occurredAt],
    );
  }
  return accounting;
}

function rowRecord(row) {
  return publicRecord({
    operationId: row.operation_id,
    state: row.state,
    quote: row.quote_json,
    challenge: row.challenge_json,
    paymentFingerprint: row.payment_fingerprint ?? undefined,
    execution: row.execution_json ?? undefined,
    settlement: row.settlement_json ?? undefined,
    response: row.response_json ?? undefined,
    customerRef: row.customer_ref ?? undefined,
    trafficClass: row.traffic_class ?? 'unknown',
  });
}

export function createPostgresX402OperationStoreFromEnvironment() {
  const connectionString = process.env.CLERVO_DATABASE_URL;
  if (!connectionString) throw new Error('CLERVO_DATABASE_URL is required');
  const environmentNamespace = process.env.CLERVO_STATE_NAMESPACE;
  assertNamespace(environmentNamespace);
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 10_000, allowExitOnIdle: true });
  const store = new PostgresX402OperationStore(pool, { environmentNamespace });
  store.close = () => pool.end();
  return store;
}
