import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ReceiverAccountingJournal,
  verifyReceiverAccountingEntry,
} from '../../dist/packages/contracts/src/index.js';

const amount = (asset, amountAtomic, decimals = 6) => ({ asset, amountAtomic, decimals });
const first = {
  settlementId: 'settle_receiver_0001',
  operationId: 'op_receiver_accounting_0001',
  authorizationId: 'auth_receiver_accounting_0001',
  receiptHash: `sha256:${'a'.repeat(64)}`,
  settlementReferenceHash: `sha256:${'b'.repeat(64)}`,
  customerCharge: amount('mock:usdc', '2500'),
  supplierCost: amount('mock:usd', '400'),
  occurredAt: '2026-08-02T15:00:00.000Z',
};

test('receiver accounting records each settlement and operation once with balanced separate revenue and supplier cost', () => {
  const journal = new ReceiverAccountingJournal();
  const recorded = journal.record(first);
  assert.equal(recorded.kind, 'recorded');
  assert.equal(verifyReceiverAccountingEntry(recorded.entry), true);
  assert.deepEqual(recorded.entry.postings.map(({ account, direction, amount: value }) => [
    account,
    direction,
    value.asset,
    value.amountAtomic,
  ]), [
    ['settlement_clearing', 'debit', 'mock:usdc', '2500'],
    ['receiver_available', 'credit', 'mock:usdc', '2500'],
    ['supplier_expense', 'debit', 'mock:usd', '400'],
    ['supplier_payable', 'credit', 'mock:usd', '400'],
  ]);

  const replay = journal.record(first);
  assert.equal(replay.kind, 'replay');
  assert.equal(replay.entry.entryHash, recorded.entry.entryHash);
  assert.equal(journal.entries().length, 1);
});

test('receiver accounting rejects settlement conflicts and a second charge for one operation', () => {
  const journal = new ReceiverAccountingJournal();
  journal.record(first);
  assert.throws(
    () => journal.record({ ...first, customerCharge: amount('mock:usdc', '2501') }),
    /receiver_accounting_settlement_conflict/u,
  );
  assert.throws(
    () => journal.record({
      ...first,
      settlementId: 'settle_receiver_0002',
      receiptHash: `sha256:${'c'.repeat(64)}`,
      settlementReferenceHash: `sha256:${'d'.repeat(64)}`,
    }),
    /receiver_accounting_operation_already_recorded/u,
  );
});

test('receiver reconciliation verifies the append-only chain and totals by exact asset and decimals', () => {
  const journal = new ReceiverAccountingJournal();
  const one = journal.record(first).entry;
  const two = journal.record({
    ...first,
    settlementId: 'settle_receiver_0002',
    operationId: 'op_receiver_accounting_0002',
    authorizationId: 'auth_receiver_accounting_0002',
    receiptHash: `sha256:${'c'.repeat(64)}`,
    settlementReferenceHash: `sha256:${'d'.repeat(64)}`,
    customerCharge: amount('mock:usdc', '1000'),
    supplierCost: amount('mock:usd', '250'),
    occurredAt: '2026-08-02T15:01:00.000Z',
  }).entry;
  assert.equal(two.previousEntryHash, one.entryHash);
  assert.deepEqual(journal.reconcile(), {
    schemaVersion: 'clervo.receiver-accounting.v1',
    entryCount: 2,
    uniqueOperationCount: 2,
    uniqueSettlementCount: 2,
    headHash: two.entryHash,
    balanced: true,
    totals: {
      'mock:usd/6': { customerChargeAtomic: '0', supplierCostAtomic: '650' },
      'mock:usdc/6': { customerChargeAtomic: '3500', supplierCostAtomic: '0' },
    },
  });
  assert.equal(verifyReceiverAccountingEntry({ ...two, operationId: 'op_receiver_accounting_tampered' }), false);
});

test('PostgreSQL receiver ledger is unique, hash-bound, and rejects sensitive customer fields', async () => {
  const migration = await readFile('infra/storage/postgres/0004-receiver-accounting.sql', 'utf8');
  assert.match(migration, /UNIQUE \(environment_namespace, settlement_id\)/u);
  assert.match(migration, /UNIQUE \(environment_namespace, operation_id\)/u);
  assert.match(migration, /UNIQUE \(environment_namespace, receipt_hash\)/u);
  assert.match(migration, /jsonb_array_length\(entry_json -> 'postings'\) = 4/u);
  assert.match(migration, /clervo_receiver_accounting_no_sensitive_fields_check/u);
  for (const field of ['walletAddress', 'privateKey', 'secret', 'credential', 'authorization']) {
    assert.match(migration, new RegExp(`'${field}'`, 'u'));
  }
});
