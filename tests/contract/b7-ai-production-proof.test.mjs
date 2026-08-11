import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { hashJson } from '../../dist/packages/contracts/src/index.js';

const proof = JSON.parse(await readFile('infra/production/gcp/ai-x402-proof.v1.json', 'utf8'));
const prober = await readFile('scripts/production/probe-b7-live-ai.mjs', 'utf8');
const worker = await readFile('apps/b10-proof-worker/src/index.js', 'utf8');

test('AI proof binds the exact current-release owner-funded outcome without claiming revenue or demand', () => {
  assert.equal(proof.schemaVersion, 'clervo.ai-x402-proof.v1');
  assert.equal(proof.state, 'settled_reconciled');
  assert.equal(proof.endpoint, 'https://api.clervo.dev/v1/ai/execute');
  assert.equal(proof.network, 'eip155:8453');
  assert.equal(proof.ownerAuthorization.maximumSpendAtomic, '1000');
  assert.equal(proof.ownerAuthorization.payerBalanceCapAtomic, '300000');
  assert.equal(proof.ownerAuthorization.supplierCostCeilingAtomic, '0');
  assert.equal(proof.ownerAuthorization.paymentEffects, 1);
  assert.equal(proof.ownerAuthorization.automaticRetry, false);
  assert.deepEqual(proof.ownerAuthorization.operationsInOrder, ['ai.chat']);
  assert.deepEqual(proof.operations.map(({ productId, model, customerChargeAtomic }) => ({ productId, model, customerChargeAtomic })), [
    { productId: 'ai.chat', model: 'clervo/allam-2-7b', customerChargeAtomic: '1000' },
  ]);
  assert.equal(new Set(proof.operations.map(({ operationId }) => operationId)).size, 1);
  assert.equal(new Set(proof.operations.map(({ receiptId }) => receiptId)).size, 1);
  assert.equal(new Set(proof.operations.map(({ transactionHash }) => transactionHash)).size, 1);
  assert.equal(proof.operations.reduce((sum, operation) => sum + BigInt(operation.customerChargeAtomic), 0n), 1000n);
  for (const operation of proof.operations) {
    assert.equal(operation.supplierCostAtomic, '0');
    assert.equal(operation.settlementStatus, 'settled');
    assert.equal(operation.chainStatus, 'confirmed');
    assert.equal(operation.exactTransferCount, 1);
    assert.equal(operation.usefulResult, true);
    assert.equal(hashJson({ network: proof.network, transaction: operation.transactionHash }), operation.settlementReferenceHash);
    assert.deepEqual(operation.replay, {
      sameOperation: true, sameReceipt: true, sameResult: true, idempotencyReplayed: true,
      paymentHeaderSent: false, secondAuthorization: false, secondUpstreamExecution: false,
      secondSettlement: false, secondCharge: false,
    });
    assert.equal(operation.durable.state, 'completed');
    assert.equal(operation.durable.operationRows, 1);
    assert.equal(operation.durable.accountingRows, 1);
  }
  assert.equal(proof.operations[0].resultSummary.kind, 'chat');
  assert.equal(proof.operations[0].resultSummary.contentNonEmpty, true);
  assert.deepEqual([proof.observedBalances.payerDeltaAtomic, proof.observedBalances.receiverDeltaAtomic, proof.observedBalances.authorizedAllowanceRemainingAtomic], ['-1000', '1000', '0']);
  assert.deepEqual([proof.observedDurability.operationRows, proof.observedDurability.accountingRowsForOperations, proof.observedDurability.receiverLedgerChainValid, proof.observedDurability.receiverLedgerBalanced, proof.observedDurability.ambiguousOperations], [1, 1, true, true, 0]);
  assert.deepEqual(proof.proofClassification, {
    proofLevel: 'paid_outcome_verified', ownerFunded: true, commercialMechanismVerified: true,
    revenueEvidence: false, demandEvidence: false, unrelatedCustomerEvidence: false, externallyRepeatedClaimAllowed: false,
  });
});

test('B7 paid proof can only enter the generated registry after current-release and current-quote validation', () => {
  assert.match(prober, /ai-x402-proof\.v1\.json/u);
  assert.match(prober, /paidProof\.releaseCommit === health\.body\.releaseId/u);
  assert.match(prober, /liveChallenges\.every/u);
  assert.match(prober, /paidOutcome\.accepted \? paidOutcome\.proofLevel : 'quote_observed_unpaid'/u);
  assert.match(prober, /revenueEvidence: false/u);
  assert.match(prober, /externallyRepeated: false/u);
});

test('completed AI proof identities remain quarantined after reconciliation', () => {
  assert.match(worker, /new Set\(\['\/proof\/b7-ai-chat', '\/proof\/b7-ai-image'\]\)/u);
  assert.equal(proof.cleanup.proofSurfacesQuarantined, true);
  assert.equal(proof.cleanup.temporaryReconciliationJobRemoved, true);
});
