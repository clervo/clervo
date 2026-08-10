#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(`${process.cwd()}/package.json`);
const { Pool } = require('pg');

const currentKeys = Object.freeze({
  search: 'idem_b10_search_proof_20260810f',
  sandbox: 'idem_b10_sandbox_proof_20260810c',
});

const connectionString = process.env.CLERVO_DATABASE_URL;
assert.ok(connectionString, 'CLERVO_DATABASE_URL is required');

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 1_000,
  allowExitOnIdle: true,
});

try {
  const identity = await pool.query('SELECT current_database() AS database, current_user AS username');
  assert.deepEqual(identity.rows[0], { database: 'clervo', username: 'clervo_runtime_20260810' });

  const x402 = await pool.query(
    `SELECT idempotency_key, state, operation_id,
            payment_fingerprint IS NOT NULL AS has_payment_fingerprint,
            execution_json IS NOT NULL AS has_execution,
            settlement_json IS NOT NULL AS has_settlement,
            response_json IS NOT NULL AS has_response,
            response_json #>> '{receipt,receiptId}' AS receipt_id,
            created_at, updated_at, completed_at
       FROM clervo_x402_operations
      WHERE environment_namespace = 'production'
        AND idempotency_key LIKE 'idem_b10_%'
      ORDER BY idempotency_key`,
    [],
  );

  const search = await pool.query(
    `SELECT idempotency_key, state, operation_id,
            response_json IS NOT NULL AS has_response,
            created_at, updated_at, completed_at
       FROM clervo_search_http_operations
      WHERE environment_namespace = 'production'
        AND idempotency_key LIKE 'idem_b10_%'
      ORDER BY idempotency_key`,
    [],
  );

  const operationIds = x402.rows.map(({ operation_id: operationId }) => operationId);
  const sandbox = operationIds.length === 0
    ? { rows: [] }
    : await pool.query(
      `SELECT operation_id, state, response_json IS NOT NULL AS has_response,
              created_at, updated_at, completed_at
         FROM clervo_sandbox_operations
        WHERE environment_namespace = 'production'
          AND operation_id = ANY($1::text[])
        ORDER BY operation_id`,
      [operationIds],
    );

  const accounting = operationIds.length === 0
    ? { rows: [] }
    : await pool.query(
      `SELECT entry_id, operation_id, settlement_id, authorization_id, occurred_at
         FROM clervo_receiver_accounting_entries
        WHERE environment_namespace = 'production'
          AND operation_id = ANY($1::text[])
        ORDER BY operation_id`,
      [operationIds],
    );

  const accountingHead = await pool.query(
    `SELECT COUNT(*)::integer AS entry_count,
            (ARRAY_AGG(entry_hash ORDER BY occurred_at DESC, entry_id DESC))[1] AS head_hash,
            MAX(occurred_at) AS latest_occurred_at
       FROM clervo_receiver_accounting_entries
      WHERE environment_namespace = 'production'`,
  );

  const targetRows = x402.rows.map((row) => ({
    idempotencyKey: row.idempotency_key,
    state: row.state,
    operationId: row.operation_id,
    hasPaymentFingerprint: row.has_payment_fingerprint,
    hasExecution: row.has_execution,
    hasSettlement: row.has_settlement,
    hasResponse: row.has_response,
    receiptId: row.receipt_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }));
  const current = Object.fromEntries(Object.entries(currentKeys).map(([product, key]) => [
    product,
    targetRows.find(({ idempotencyKey }) => idempotencyKey === key) ?? null,
  ]));
  const ambiguous = targetRows.filter(({ state }) => !['challenged', 'completed'].includes(state));

  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'clervo.b10-current-reconciliation.v1',
    verifiedAt: new Date().toISOString(),
    databaseIdentityVerified: true,
    currentIdempotencyKeys: currentKeys,
    current,
    x402Rows: targetRows,
    searchExecutionRows: search.rows.map((row) => ({
      idempotencyKey: row.idempotency_key,
      state: row.state,
      operationId: row.operation_id,
      hasResponse: row.has_response,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    })),
    sandboxExecutionRows: sandbox.rows.map((row) => ({
      operationId: row.operation_id,
      state: row.state,
      hasResponse: row.has_response,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    })),
    receiverAccountingRows: accounting.rows.map((row) => ({
      entryId: row.entry_id,
      operationId: row.operation_id,
      settlementId: row.settlement_id,
      authorizationId: row.authorization_id,
      occurredAt: row.occurred_at,
    })),
    receiverAccountingHead: {
      entryCount: accountingHead.rows[0].entry_count,
      headHash: accountingHead.rows[0].head_hash,
      latestOccurredAt: accountingHead.rows[0].latest_occurred_at,
    },
    ambiguousRows: ambiguous.map(({ idempotencyKey, state, operationId }) => ({ idempotencyKey, state, operationId })),
    credentialsLogged: false,
    customerPayloadsLogged: false,
  }, null, 2)}\n`);
} finally {
  await pool.end();
}
