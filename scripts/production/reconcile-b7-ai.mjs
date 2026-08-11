#!/usr/bin/env node

// Read-only B7 paid-proof reconciliation. It verifies the two allowlisted AI
// operations against durable state, the append-only receiver ledger, and Base
// receipts. It never signs, settles, retries, or mutates production data.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createPublicClient, getAddress, http, parseEventLogs } from 'viem';
import { base } from 'viem/chains';
import { hashJson } from '../../dist/packages/contracts/src/index.js';
import { normalizeProductionDatabaseUrl } from './postgres-connection-url.mjs';

const require = createRequire(`${process.cwd()}/package.json`);
const { Pool } = require('pg');
const action = process.argv[2] ?? 'plan';
const receiver = getAddress('0xBd11d82d8Dbd01Ba3eed279d3bACf74659fFca28');
const usdc = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
const expected = Object.freeze([
  Object.freeze({ slot: 'chat', keyEnvironment: 'CLERVO_B7_AI_CHAT_IDEMPOTENCY_KEY', transactionEnvironment: 'CLERVO_B7_AI_CHAT_TRANSACTION', productId: 'ai.chat', model: 'clervo/gpt-5.6-luna', chargeAtomic: '1000', outputKind: 'chat' }),
  Object.freeze({ slot: 'image', keyEnvironment: 'CLERVO_B7_AI_IMAGE_IDEMPOTENCY_KEY', transactionEnvironment: 'CLERVO_B7_AI_IMAGE_TRANSACTION', productId: 'ai.image', model: 'clervo/gemini-3.1-flash-lite-image', chargeAtomic: '25500', outputKind: 'image' }),
]);
const transferEvent = [{ type: 'event', name: 'Transfer', inputs: [{ indexed: true, name: 'from', type: 'address' }, { indexed: true, name: 'to', type: 'address' }, { indexed: false, name: 'value', type: 'uint256' }] }];

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

function proofInput(item) {
  const identity = identityInput(item);
  const transactionHash = process.env[item.transactionEnvironment];
  assert.match(transactionHash ?? '', /^0x[a-fA-F0-9]{64}$/u, `${item.slot} transaction invalid`);
  return { ...identity, transactionHash: transactionHash.toLowerCase() };
}

function identityInput(item) {
  const idempotencyKey = process.env[item.keyEnvironment];
  assert.match(idempotencyKey ?? '', /^idem_b7_ai_paid_[a-z0-9_]{8,80}$/u, `${item.slot} idempotency key invalid`);
  return { ...item, idempotencyKey };
}

if (action === 'plan') {
  process.stdout.write(`${JSON.stringify({
    action: 'plan', environment: 'production', network: 'eip155:8453', asset: usdc, receiver,
    operations: expected.map(({ slot, productId, model, chargeAtomic, outputKind }) => ({ slot, productId, model, chargeAtomic, outputKind })),
    checks: ['completed durable operation', 'useful exact-model result', 'settled receipt', 'one accounting entry', 'balanced append-only ledger', 'confirmed exact Base USDC transfer'],
    readOnly: true, paymentAuthorized: false, paymentEffects: 0,
  }, null, 2)}\n`);
  process.exit(0);
}
assert.ok(['preflight', 'verify-chat', 'verify-image', 'verify'].includes(action), 'usage: reconcile-b7-ai.mjs plan|preflight|verify-chat|verify-image|verify');

const connectionString = normalizeProductionDatabaseUrl(process.env.CLERVO_DATABASE_URL);
const verificationTargets = action === 'verify-chat'
  ? expected.filter(({ slot }) => slot === 'chat')
  : action === 'verify-image'
    ? expected.filter(({ slot }) => slot === 'image')
    : expected;
const identities = (action === 'preflight' ? expected : verificationTargets).map(identityInput);
assert.equal(new Set(identities.map(({ idempotencyKey }) => idempotencyKey)).size, identities.length, 'proof keys must differ');

if (action === 'preflight') {
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 1_000, allowExitOnIdle: true });
  try {
    const identity = (await pool.query('SELECT current_database() AS database, current_user AS username')).rows[0];
    assert.equal(identity.database, 'clervo');
    assert.match(identity.username, /^clervo_runtime_[0-9]{8}$/u, 'preflight must use least-privilege runtime identity');
    const operations = await pool.query(
      `SELECT idempotency_key, state
         FROM clervo_x402_operations
        WHERE environment_namespace = 'production' AND idempotency_key = ANY($1::text[])
        ORDER BY idempotency_key`,
      [identities.map(({ idempotencyKey }) => idempotencyKey)],
    );
    assert.equal(operations.rows.length, 0, 'guarded proof identity was already observed; rotate and reconcile');
    const ledger = await pool.query(
      `SELECT entry_hash, previous_entry_hash, entry_json #> '{postings}' AS postings
         FROM clervo_receiver_accounting_entries
        WHERE environment_namespace = 'production'
        ORDER BY occurred_at, entry_id`,
    );
    assert.equal(ledger.rows.every((row, index, rows) => index === 0 ? row.previous_entry_hash === null : row.previous_entry_hash === rows[index - 1].entry_hash), true, 'receiver ledger chain invalid');
    assert.equal(ledger.rows.every(({ postings }) => postingsBalanced(postings)), true, 'receiver ledger unbalanced');
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 'clervo.b7-ai-preflight.v1', checkedAt: new Date().toISOString(),
      environment: 'production', databaseIdentityVerified: true, guardedIdentities: identities.map(({ slot }) => ({ slot, unused: true })),
      receiverLedgerEntries: ledger.rows.length, receiverLedgerChainValid: true, receiverLedgerBalanced: true,
      credentialsLogged: false, customerPayloadsLogged: false, readOnly: true, paymentEffects: 0,
    }, null, 2)}\n`);
  } finally {
    await pool.end();
  }
  process.exit(0);
}

const proofs = verificationTargets.map(proofInput);
assert.equal(new Set(proofs.map(({ transactionHash }) => transactionHash)).size, proofs.length, 'proof transactions must differ');

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 1_000, allowExitOnIdle: true });
try {
  const identity = (await pool.query('SELECT current_database() AS database, current_user AS username')).rows[0];
  assert.equal(identity.database, 'clervo');
  assert.match(identity.username, /^clervo_runtime_[0-9]{8}$/u, 'reconciliation must use least-privilege runtime identity');
  const operations = await pool.query(
    `SELECT idempotency_key, request_hash, operation_id, state, settlement_json, response_json, completed_at
       FROM clervo_x402_operations
      WHERE environment_namespace = 'production' AND idempotency_key = ANY($1::text[])
      ORDER BY idempotency_key`,
    [proofs.map(({ idempotencyKey }) => idempotencyKey)],
  );
  assert.equal(operations.rows.length, proofs.length, 'durable proof operation missing');
  const operationIds = operations.rows.map(({ operation_id: operationId }) => operationId);
  const accounting = await pool.query(
    `SELECT entry_id, operation_id, settlement_id, authorization_id, receipt_hash,
            settlement_reference_hash, entry_hash, previous_entry_hash,
            entry_json #> '{postings}' AS postings, occurred_at
       FROM clervo_receiver_accounting_entries
      WHERE environment_namespace = 'production' AND operation_id = ANY($1::text[])
      ORDER BY operation_id`,
    [operationIds],
  );
  assert.equal(accounting.rows.length, proofs.length, 'one accounting entry per proof operation required');
  const ledger = await pool.query(
    `SELECT entry_hash, previous_entry_hash, entry_json #> '{postings}' AS postings
       FROM clervo_receiver_accounting_entries
      WHERE environment_namespace = 'production'
      ORDER BY occurred_at, entry_id`,
  );
  assert.equal(ledger.rows.every((row, index, rows) => index === 0 ? row.previous_entry_hash === null : row.previous_entry_hash === rows[index - 1].entry_hash), true, 'receiver ledger chain invalid');
  assert.equal(ledger.rows.every(({ postings }) => postingsBalanced(postings)), true, 'receiver ledger unbalanced');

  const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org', { timeout: 30_000 }) });
  const reconciled = [];
  for (const proof of proofs) {
    const row = operations.rows.find(({ idempotency_key: key }) => key === proof.idempotencyKey);
    assert.equal(row.state, 'completed', `${proof.slot} operation incomplete`);
    assert.match(row.request_hash, /^sha256:[a-f0-9]{64}$/u);
    assert.match(row.operation_id, /^op_[a-f0-9]{32}$/u);
    assert.ok(row.completed_at, `${proof.slot} completion time missing`);
    const response = row.response_json;
    assert.equal(response.productId, proof.productId);
    assert.equal(response.model, proof.model);
    assert.equal(response.exactModelId, proof.model);
    assert.equal(response.fundingMode, 'paid');
    assert.equal(response.state, 'RECEIPTED');
    assert.equal(response.requestHash, row.request_hash);
    assert.equal(response.result?.output?.kind, proof.outputKind);
    if (proof.outputKind === 'chat') assert.ok(response.result.output.content.trim().length > 0, 'chat output empty');
    if (proof.outputKind === 'image') {
      assert.equal(response.result.output.artifacts?.length, 1, 'image artifact count mismatch');
      assert.equal(response.result.usage?.images, 1, 'image usage mismatch');
      assert.match(response.result.output.artifacts[0].sha256, /^sha256:[a-f0-9]{64}$/u);
    }
    assert.equal(response.receipt?.customerCharge?.asset, 'USDC');
    assert.equal(response.receipt.customerCharge.amountAtomic, proof.chargeAtomic);
    assert.equal(response.receipt.supplierCost.amountAtomic, '0');
    assert.equal(response.receipt.settlement.status, 'settled');
    assert.match(response.receipt.receiptHash, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(row.settlement_json.network, 'eip155:8453');
    const referenceHash = hashJson({ network: 'eip155:8453', transaction: proof.transactionHash });
    assert.equal(row.settlement_json.referenceHash, referenceHash);
    assert.equal(response.receipt.settlement.referenceHash, referenceHash);

    const entry = accounting.rows.find(({ operation_id: operationId }) => operationId === row.operation_id);
    assert.ok(entry, `${proof.slot} accounting missing`);
    assert.equal(entry.receipt_hash, response.receipt.receiptHash);
    assert.equal(entry.settlement_reference_hash, referenceHash);
    assert.equal(postingsBalanced(entry.postings), true);

    const chainReceipt = await client.getTransactionReceipt({ hash: proof.transactionHash });
    assert.equal(chainReceipt.status, 'success', `${proof.slot} transaction reverted`);
    const transfers = parseEventLogs({ abi: transferEvent, logs: chainReceipt.logs.filter(({ address }) => address.toLowerCase() === usdc.toLowerCase()), eventName: 'Transfer', strict: true });
    const exactTransfers = transfers.filter(({ args }) => getAddress(args.to) === receiver && args.value === BigInt(proof.chargeAtomic));
    assert.equal(exactTransfers.length, 1, `${proof.slot} exact receiver transfer count mismatch`);
    reconciled.push({
      slot: proof.slot, productId: proof.productId, model: proof.model, idempotencyKey: proof.idempotencyKey,
      operationId: row.operation_id, requestHash: row.request_hash, resultHash: response.result.resultHash,
      receiptId: response.receipt.receiptId, receiptHash: response.receipt.receiptHash,
      transactionHash: proof.transactionHash, blockNumber: chainReceipt.blockNumber.toString(),
      customerChargeAtomic: proof.chargeAtomic, supplierCostAtomic: '0', completedAt: row.completed_at.toISOString(),
      outputSummary: proof.outputKind === 'chat'
        ? { kind: 'chat', contentNonEmpty: true }
        : {
            kind: 'image', artifactCount: response.result.output.artifacts.length,
            artifactSha256: response.result.output.artifacts[0].sha256,
            width: response.result.output.artifacts[0].width, height: response.result.output.artifacts[0].height,
            images: response.result.usage.images,
          },
      accountingEntryId: entry.entry_id, accountingEntryHash: entry.entry_hash,
    });
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'clervo.b7-ai-reconciliation.v1', verifiedAt: new Date().toISOString(),
    scope: reconciled.map(({ slot }) => slot), databaseIdentityVerified: true, operations: reconciled,
    totalChargeAtomic: reconciled.reduce((sum, item) => sum + BigInt(item.customerChargeAtomic), 0n).toString(),
    receiverLedgerEntryCount: ledger.rows.length, receiverLedgerHeadHash: ledger.rows.at(-1)?.entry_hash ?? null,
    receiverLedgerChainValid: true, receiverLedgerBalanced: true, ambiguousOperations: 0,
    credentialsLogged: false, customerPayloadsLogged: false, readOnly: true, paymentEffects: 0,
  }, null, 2)}\n`);
} finally {
  await pool.end();
}
