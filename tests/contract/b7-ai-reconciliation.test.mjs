import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile('scripts/production/reconcile-b7-ai.mjs', 'utf8');

test('B7 reconciliation is read-only and binds exactly chat plus image paid proofs', () => {
  for (const value of [
    "productId: 'ai.chat'", "model: 'clervo/gpt-5.6-luna'", "chargeAtomic: '1000'",
    "productId: 'ai.image'", "model: 'clervo/gemini-3.1-flash-lite-image'", "chargeAtomic: '25500'",
    "network: 'eip155:8453'", "totalChargeAtomic",
  ]) assert.ok(source.includes(value), `missing reconciliation bound ${value}`);
  assert.match(source, /SELECT current_database\(\) AS database, current_user AS username/u);
  assert.match(source, /clervo_receiver_accounting_entries/u);
  assert.match(source, /receiver ledger chain invalid/u);
  assert.match(source, /getTransactionReceipt/u);
  assert.match(source, /exact receiver transfer count mismatch/u);
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/u);
  assert.doesNotMatch(source, /payment-signature|privateKey|mnemonic|seedPhrase/iu);
});

test('B7 reconciliation fails closed on incomplete state, model drift, nonzero supplier cost, and ledger drift', () => {
  for (const guard of [
    "row.state, 'completed'", 'response.exactModelId, proof.model', "response.receipt.supplierCost.amountAtomic, '0'",
    'response.receipt.settlement.referenceHash, referenceHash', 'postingsBalanced(entry.postings)', 'exactTransfers.length, 1',
  ]) assert.ok(source.includes(guard), `missing reconciliation guard ${guard}`);
});

test('B7 reconciliation verify refuses without explicit proof identities and database input', () => {
  const result = spawnSync(process.execPath, ['scripts/production/reconcile-b7-ai.mjs', 'verify'], {
    encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 10_000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /database URL is invalid/u);
});

test('B7 preflight is read-only and refuses identities already observed by durable state', () => {
  for (const guard of [
    "action === 'preflight'", 'guarded proof identity was already observed; rotate and reconcile',
    'receiverLedgerChainValid: true', 'receiverLedgerBalanced: true', 'paymentEffects: 0',
  ]) assert.ok(source.includes(guard), `missing preflight guard ${guard}`);
  const result = spawnSync(process.execPath, ['scripts/production/reconcile-b7-ai.mjs', 'preflight'], {
    encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 10_000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /database URL is invalid/u);
});
