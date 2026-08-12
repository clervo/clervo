#!/usr/bin/env node

// Read-only reconciliation for one explicitly identified paid prediction
// operation. This script never signs, settles, retries, or mutates production.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createPublicClient, getAddress, http, parseEventLogs } from 'viem';
import { base } from 'viem/chains';
import { hashJson } from '../../dist/packages/contracts/src/index.js';
import { normalizeProductionDatabaseUrl } from './postgres-connection-url.mjs';

const require = createRequire(`${process.cwd()}/package.json`);
const { Pool } = require('pg');
const receiver = getAddress('0xBd11d82d8Dbd01Ba3eed279d3bACf74659fFca28');
const usdc = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
const idempotencyKey = process.env.CLERVO_PREDICTION_PROOF_IDEMPOTENCY_KEY;
const transactionHash = process.env.CLERVO_PREDICTION_PROOF_TRANSACTION?.toLowerCase();
const expectedChargeAtomic = '2000';
const transferEvent = [{ type: 'event', name: 'Transfer', inputs: [{ indexed: true, name: 'from', type: 'address' }, { indexed: true, name: 'to', type: 'address' }, { indexed: false, name: 'value', type: 'uint256' }] }];

assert.match(idempotencyKey ?? '', /^idem_[a-z0-9_]{16,96}$/u, 'idempotency key invalid');
assert.match(transactionHash ?? '', /^0x[a-f0-9]{64}$/u, 'transaction hash invalid');

function postingsBalanced(postings) {
  const totals = new Map();
  for (const posting of postings ?? []) {
    const key = `${posting.amount.asset}:${posting.amount.decimals}`;
    const current = totals.get(key) ?? { debit: 0n, credit: 0n };
    current[posting.direction] += BigInt(posting.amount.amountAtomic);
    totals.set(key, current);
  }
  return totals.size > 0 && [...totals.values()].every(({ debit, credit }) => debit === credit);
}

const pool = new Pool({
  connectionString: normalizeProductionDatabaseUrl(process.env.CLERVO_DATABASE_URL),
  max: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 1_000,
  allowExitOnIdle: true,
});

try {
  const identity = (await pool.query('SELECT current_database() AS database, current_user AS username')).rows[0];
  assert.equal(identity.database, 'clervo');
  assert.match(identity.username, /^clervo_runtime_[0-9]{8}$/u, 'reconciliation must use least-privilege runtime identity');

  const operations = await pool.query(
    `SELECT idempotency_key, request_hash, operation_id, state, settlement_json, response_json, completed_at
       FROM clervo_x402_operations
      WHERE environment_namespace = 'production' AND idempotency_key = $1`,
    [idempotencyKey],
  );
  assert.equal(operations.rows.length, 1, 'exactly one durable proof operation required');
  const row = operations.rows[0];
  assert.equal(row.state, 'completed', 'operation incomplete');
  assert.match(row.request_hash, /^sha256:[a-f0-9]{64}$/u);
  assert.match(row.operation_id, /^op_[a-f0-9]{32}$/u);
  assert.ok(row.completed_at, 'completion time missing');

  const response = row.response_json;
  assert.equal(response.productId, 'prediction.markets');
  assert.equal(response.state, 'RECEIPTED');
  assert.equal(response.requestHash, row.request_hash);
  assert.equal(response.result?.output?.kind, 'markets');
  assert.ok(response.result.output.markets?.length > 0, 'useful market output missing');
  assert.equal(response.receipt?.customerCharge?.asset, 'USDC');
  assert.equal(response.receipt.customerCharge.amountAtomic, expectedChargeAtomic);
  assert.equal(response.receipt.supplierCost.amountAtomic, '0');
  assert.equal(response.receipt.settlement.status, 'settled');
  assert.match(response.receipt.receiptHash, /^sha256:[a-f0-9]{64}$/u);

  const referenceHash = hashJson({ network: 'eip155:8453', transaction: transactionHash });
  assert.equal(row.settlement_json.network, 'eip155:8453');
  assert.equal(row.settlement_json.referenceHash, referenceHash);
  assert.equal(response.receipt.settlement.referenceHash, referenceHash);

  const accounting = await pool.query(
    `SELECT entry_id, receipt_hash, settlement_reference_hash, entry_hash,
            entry_json #> '{postings}' AS postings
       FROM clervo_receiver_accounting_entries
      WHERE environment_namespace = 'production' AND operation_id = $1`,
    [row.operation_id],
  );
  assert.equal(accounting.rows.length, 1, 'exactly one accounting entry required');
  const entry = accounting.rows[0];
  assert.equal(entry.receipt_hash, response.receipt.receiptHash);
  assert.equal(entry.settlement_reference_hash, referenceHash);
  assert.equal(postingsBalanced(entry.postings), true, 'operation accounting is unbalanced');

  const ledger = await pool.query(
    `SELECT entry_hash, previous_entry_hash, entry_json #> '{postings}' AS postings
       FROM clervo_receiver_accounting_entries
      WHERE environment_namespace = 'production'
      ORDER BY occurred_at, entry_id`,
  );
  assert.equal(ledger.rows.every((item, index, rows) => index === 0 ? item.previous_entry_hash === null : item.previous_entry_hash === rows[index - 1].entry_hash), true, 'receiver ledger chain invalid');
  assert.equal(ledger.rows.every(({ postings }) => postingsBalanced(postings)), true, 'receiver ledger unbalanced');

  const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org', { timeout: 30_000 }) });
  const chainReceipt = await client.getTransactionReceipt({ hash: transactionHash });
  assert.equal(chainReceipt.status, 'success', 'transaction reverted');
  const transfers = parseEventLogs({
    abi: transferEvent,
    logs: chainReceipt.logs.filter(({ address }) => address.toLowerCase() === usdc.toLowerCase()),
    eventName: 'Transfer',
    strict: true,
  });
  const exactTransfers = transfers.filter(({ args }) => getAddress(args.to) === receiver && args.value === BigInt(expectedChargeAtomic));
  assert.equal(exactTransfers.length, 1, 'exact receiver transfer count mismatch');

  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'clervo.prediction-current-reconciliation.v1',
    verifiedAt: new Date().toISOString(),
    databaseIdentityVerified: true,
    operation: {
      productId: response.productId,
      idempotencyKey,
      operationId: row.operation_id,
      requestHash: row.request_hash,
      resultHash: response.result.resultHash,
      receiptId: response.receipt.receiptId,
      receiptHash: response.receipt.receiptHash,
      settlementReferenceHash: referenceHash,
      transactionHash,
      blockNumber: chainReceipt.blockNumber.toString(),
      logIndex: Number(exactTransfers[0].logIndex),
      customerChargeAtomic: expectedChargeAtomic,
      supplierCostAtomic: '0',
      completedAt: row.completed_at.toISOString(),
      marketCount: response.result.output.markets.length,
      resultState: response.result.output.state,
      freshnessState: response.result.output.freshness?.state,
      adapterIds: response.result.output.provenance?.servingAdapters ?? [],
      sourceIds: response.result.output.provenance?.sources?.map(({ sourceId }) => sourceId) ?? [],
      accountingEntryId: entry.entry_id,
      accountingEntryHash: entry.entry_hash,
    },
    receiverLedgerEntryCount: ledger.rows.length,
    receiverLedgerHeadHash: ledger.rows.at(-1)?.entry_hash ?? null,
    receiverLedgerChainValid: true,
    receiverLedgerBalanced: true,
    credentialsLogged: false,
    customerPayloadsLogged: false,
    readOnly: true,
    paymentEffects: 0,
  }, null, 2)}\n`);
} finally {
  await pool.end();
}
