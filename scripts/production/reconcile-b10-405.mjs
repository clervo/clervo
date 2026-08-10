#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(`${process.cwd()}/package.json`);
const { Pool } = require('pg');

const currentKeys = Object.freeze({
  search: 'idem_b10_search_proof_20260810f',
  sandbox: 'idem_b10_sandbox_proof_20260810d',
});
const priorFailedSandboxKey = 'idem_b10_sandbox_proof_20260810c';

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

  const sandboxProof = await pool.query(
    `SELECT operation_id, state,
            response_json #>> '{receipt,receiptId}' AS receipt_id,
            response_json #>> '{receipt,customerCharge,amountAtomic}' AS charge_atomic,
            response_json #>> '{receipt,supplierCost,amountAtomic}' AS supplier_cost_atomic,
            response_json #>> '{receipt,settlement,status}' AS settlement_status,
            response_json #>> '{result,output,kind}' AS output_kind,
            response_json #>> '{result,output,exitCode}' AS exit_code,
            response_json #>> '{result,output,stdoutBase64}' AS stdout_base64,
            response_json #>> '{result,output,sessionState}' AS session_state,
            response_json #>> '{execution,classId}' AS class_id,
            response_json #>> '{execution,cleanup,state}' AS cleanup_state,
            response_json #> '{execution,requestedLimits}' AS requested_limits,
            response_json #>> '{execution,runtime,routeId}' AS runtime_route_id,
            response_json #>> '{execution,runtime,isolation}' AS runtime_isolation,
            response_json #>> '{execution,runtime,imageDigest}' AS runtime_image_digest,
            response_json #>> '{execution,runtime,qualificationId}' AS runtime_qualification_id,
            response_json #>> '{receipt,provenance,0,adapterId}' AS receipt_adapter_id,
            response_json #>> '{receipt,provenance,0,qualificationId}' AS receipt_qualification_id,
            response_json #>> '{receipt,provenance,0,routeId}' AS receipt_route_id,
            response_json #>> '{receipt,provenance,0,degraded}' AS receipt_degraded
       FROM clervo_x402_operations
      WHERE environment_namespace = 'production'
        AND idempotency_key = ANY($1::text[])
      ORDER BY idempotency_key`,
    [[priorFailedSandboxKey, currentKeys.sandbox]],
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

  const currentAccounting = await pool.query(
    `SELECT entry_id, operation_id, settlement_id, authorization_id,
            entry_hash, previous_entry_hash, entry_json #> '{postings}' AS postings,
            occurred_at
       FROM clervo_receiver_accounting_entries
      WHERE environment_namespace = 'production'
        AND operation_id = ANY($1::text[])
      ORDER BY occurred_at`,
    [Object.values(current).filter(Boolean).map(({ operationId }) => operationId)],
  );

  console.log(JSON.stringify({
    section: 'current',
    schemaVersion: 'clervo.b10-current-reconciliation.v1',
    verifiedAt: new Date().toISOString(),
    databaseIdentityVerified: true,
    currentIdempotencyKeys: currentKeys,
    current,
    x402RowCount: targetRows.length,
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
    receiverAccountingHead: {
      entryCount: accountingHead.rows[0].entry_count,
      headHash: accountingHead.rows[0].head_hash,
      latestOccurredAt: accountingHead.rows[0].latest_occurred_at,
    },
    ambiguousRows: ambiguous.map(({ idempotencyKey, state, operationId }) => ({ idempotencyKey, state, operationId })),
    credentialsLogged: false,
    customerPayloadsLogged: false,
  }));
  console.log(JSON.stringify({
    section: 'sandbox-proof',
    rows: sandboxProof.rows,
  }));
  console.log(JSON.stringify({
    section: 'current-accounting',
    rows: currentAccounting.rows.map((row) => ({
      entryId: row.entry_id,
      operationId: row.operation_id,
      settlementId: row.settlement_id,
      authorizationId: row.authorization_id,
      entryHash: row.entry_hash,
      previousEntryHash: row.previous_entry_hash,
      postings: row.postings,
      occurredAt: row.occurred_at,
    })),
  }));
} finally {
  await pool.end();
}
