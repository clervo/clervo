import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { hashJson } from '../../dist/packages/contracts/src/index.js';

const proof = JSON.parse(await readFile('infra/production/gcp/ai-x402-proof.v1.json', 'utf8'));
const prober = await readFile('scripts/production/probe-b7-live-ai.mjs', 'utf8');
const worker = await readFile('apps/b10-proof-worker/src/index.js', 'utf8');

test('B7 proof binds two exact owner-funded AI outcomes without claiming revenue or demand', () => {
  assert.equal(proof.schemaVersion, 'clervo.ai-x402-proof.v1');
  assert.equal(proof.state, 'settled_reconciled');
  assert.equal(proof.endpoint, 'https://api.clervo.dev/v1/ai/execute');
  assert.equal(proof.network, 'eip155:8453');
  assert.equal(proof.ownerAuthorization.maximumSpendAtomic, '26500');
  assert.equal(proof.ownerAuthorization.payerBalanceCapAtomic, '300000');
  assert.equal(proof.ownerAuthorization.supplierCostCeilingAtomic, '0');
  assert.equal(proof.ownerAuthorization.paymentEffects, 2);
  assert.equal(proof.ownerAuthorization.automaticRetry, false);
  assert.deepEqual(proof.ownerAuthorization.operationsInOrder, ['ai.chat', 'ai.image']);
  assert.deepEqual(proof.operations.map(({ productId, model, customerChargeAtomic }) => ({ productId, model, customerChargeAtomic })), [
    { productId: 'ai.chat', model: 'clervo/gpt-5.6-luna', customerChargeAtomic: '1000' },
    { productId: 'ai.image', model: 'clervo/gemini-3.1-flash-lite-image', customerChargeAtomic: '25500' },
  ]);
  assert.equal(new Set(proof.operations.map(({ operationId }) => operationId)).size, 2);
  assert.equal(new Set(proof.operations.map(({ receiptId }) => receiptId)).size, 2);
  assert.equal(new Set(proof.operations.map(({ transactionHash }) => transactionHash)).size, 2);
  assert.equal(proof.operations.reduce((sum, operation) => sum + BigInt(operation.customerChargeAtomic), 0n), 26500n);
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
  assert.deepEqual(proof.operations[1].resultSummary, {
    kind: 'image', artifactCount: 1, artifactSha256: 'sha256:430b1065c46f32f73ce37e00140a6add113f133d09120999dde4aee5bfe65cd0',
    width: 1024, height: 1024, images: 1,
  });
  assert.deepEqual([proof.observedBalances.payerDeltaAtomic, proof.observedBalances.receiverDeltaAtomic, proof.observedBalances.authorizedAllowanceRemainingAtomic], ['-26500', '26500', '0']);
  assert.deepEqual([proof.observedDurability.operationRows, proof.observedDurability.accountingRowsForOperations, proof.observedDurability.receiverLedgerChainValid, proof.observedDurability.receiverLedgerBalanced, proof.observedDurability.ambiguousOperations], [2, 2, true, true, 0]);
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

test('completed B7 proof identities remain quarantined after reconciliation', () => {
  assert.match(worker, /new Set\(\['\/proof\/b7-ai-chat', '\/proof\/b7-ai-image'\]\)/u);
  assert.equal(proof.cleanup.proofSurfacesQuarantined, true);
  assert.equal(proof.cleanup.temporaryDatabaseProxyStopped, true);
  assert.equal(proof.cleanup.temporaryDatabaseProxyFilesRemoved, true);
});
