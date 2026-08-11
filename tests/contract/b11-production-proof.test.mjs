import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const proofPath = 'infra/production/gcp/connect-x402-proof.v1.json';
const proof = JSON.parse(await readFile(proofPath, 'utf8'));

test('B11 closure binds the published Connect surfaces to clean registry-only acceptance', () => {
  assert.equal(proof.schemaVersion, 'clervo.connect-x402-proof.v1');
  assert.equal(proof.milestone, 'B11');
  assert.equal(proof.state, 'closed');
  assert.equal(proof.source.authoritativeBranch, 'main');
  assert.equal(proof.production.runtimeTruth.durableState, true);
  assert.equal(proof.production.runtimeTruth.rpcPaidEnabled, false);
  assert.deepEqual(proof.packages.map(({ name, version, provenance }) => ({ name, version, provenance })), [
    { name: '@clervo/router', version: '0.3.1', provenance: 'slsa_v1_verified' },
    { name: '@clervo/sdk', version: '0.5.2', provenance: 'slsa_v1_verified' },
    { name: '@clervo/mcp', version: '0.5.2', provenance: 'slsa_v1_verified' },
    { name: 'clervo-sdk', version: '0.4.2', provenance: 'pypi_trusted_publisher_verified' },
  ]);
  assert.equal(proof.cleanMachine.sourceTreeConsumed, false);
  assert.equal(proof.cleanMachine.registryOnly, true);
  assert.deepEqual(proof.cleanMachine.freeFirst, {
    walletBefore: false,
    usefulResult: true,
    walletAfter: false,
    fundingRequired: false,
    paymentAuthorizationCreated: false,
    operationId: 'op_d840e0212520b67ba475c0b9d36b8a38',
  });
  assert.equal(proof.cleanMachine.sameWalletAcrossSurfaces, true);
  assert.deepEqual(proof.cleanMachine.surfaces, [
    'router_cli', 'mcp', 'typescript_sdk', 'python_sdk', 'openai_proxy',
  ]);
  assert.deepEqual(proof.cleanMachine.openAiCompatibility, {
    modelsEndpoint: true,
    nonStreaming: true,
    sseStreaming: true,
    standardClientSourceModified: false,
    onlyBaseUrlAndPlaceholderKeyConfigured: true,
  });
  assert.equal(proof.distribution.mcpRegistry.active, true);
  assert.equal(proof.distribution.mcpRegistry.version, '0.5.2');
  assert.equal(proof.distribution.documentation.public, true);
});

test('B11 has exactly three bounded owner-funded effects with idempotent no-charge replay', () => {
  assert.equal(proof.commerce.maximumApprovedAtomic, '5000');
  assert.equal(proof.commerce.paymentEffects, 3);
  assert.equal(proof.commerce.automaticBlindRetry, false);
  assert.equal(proof.operations.length, 3);
  assert.deepEqual(proof.operations.map(({ surface, customerChargeAtomic }) => ({ surface, customerChargeAtomic })), [
    { surface: 'mcp', customerChargeAtomic: '2000' },
    { surface: 'typescript', customerChargeAtomic: '2000' },
    { surface: 'openai', customerChargeAtomic: '1000' },
  ]);
  assert.equal(proof.operations.reduce((total, operation) => total + BigInt(operation.customerChargeAtomic), 0n), 5000n);
  assert.equal(new Set(proof.operations.map(({ operationId }) => operationId)).size, 3);
  assert.equal(new Set(proof.operations.map(({ receiptId }) => receiptId)).size, 3);
  assert.equal(new Set(proof.operations.map(({ transactionHash }) => transactionHash)).size, 3);
  for (const operation of proof.operations) {
    assert.equal(operation.supplierCostAtomic, '0');
    assert.ok(operation.usefulResult);
    assert.deepEqual(operation.replay, {
      sameOperation: true,
      sameReceipt: true,
      sameResult: true,
      paymentHeaderSent: false,
      secondAuthorization: false,
      secondSettlement: false,
      secondCharge: false,
    });
  }
  assert.equal(proof.operations[2].usefulResult.canonicalModelSubstituted, false);
  assert.equal(proof.operations[2].usefulResult.model, 'clervo/gpt-5.6-luna');
  assert.equal(proof.operations[2].nonStreaming, true);
  assert.equal(proof.operations[2].sseStreaming.contentMatched, true);
});

test('B11 shared reconciliation freezes every paid surface and accounting closes exactly', () => {
  assert.equal(proof.spendControls.limitRefusal.authorizationCreated, false);
  assert.equal(proof.spendControls.limitRefusal.operationRecordsBefore, proof.spendControls.limitRefusal.operationRecordsAfter);
  assert.deepEqual(proof.reconciliation.sharedFreeze.blockedSurfaces, [
    'router_cli', 'mcp', 'typescript_sdk', 'python_sdk', 'openai_proxy',
  ]);
  assert.equal(proof.reconciliation.sharedFreeze.authorizationSent, false);
  assert.equal(proof.reconciliation.sharedFreeze.settlementEffect, false);
  assert.equal(proof.reconciliation.sharedFreeze.retrievalPaymentHeaderSent, false);
  assert.equal(proof.reconciliation.sharedFreeze.resolved, 'not_settled');
  assert.equal(proof.reconciliation.sharedFreeze.chargedAtomic, '0');
  assert.equal(proof.reconciliation.settledResponseLoss.retryAttempted, false);
  assert.equal(proof.reconciliation.settledResponseLoss.retrievalPaymentHeaderSent, false);
  assert.equal(proof.reconciliation.settledResponseLoss.secondSettlement, false);
  assert.deepEqual(
    [proof.accounting.localSettledAtomic, proof.accounting.durableSettlementAtomic, proof.accounting.chainTransferAtomic],
    ['5000', '5000', '5000'],
  );
  assert.equal(proof.accounting.chainTransferCount, 3);
  assert.equal(proof.accounting.duplicateCharges, 0);
  assert.equal(proof.accounting.unexplainedEffectsAtomic, '0');
  assert.equal(proof.accounting.durableReconciliation.receiverLedgerChainValid, true);
  assert.equal(proof.accounting.durableReconciliation.receiverLedgerBalanced, true);
  assert.equal(proof.accounting.durableReconciliation.ambiguousOperations, 0);
  assert.equal(proof.accounting.durableReconciliation.readOnly, true);
  assert.equal(proof.accounting.durableReconciliation.paymentEffects, 0);
  assert.equal(proof.accounting.durableReconciliation.temporaryJobRemoved, true);
});

test('B11 proof is non-secret and classifies owner funding without revenue or demand claims', () => {
  assert.deepEqual(proof.proofClassification, {
    level: 'paid_outcome_verified',
    ownerFunded: true,
    commercialMechanismVerified: true,
    revenueEvidence: false,
    demandEvidence: false,
    unrelatedCustomerEvidence: false,
  });
  assert.equal(proof.wallet.privateKeyLogged, false);
  assert.equal(proof.wallet.recoveryPhraseLogged, false);
  const serialized = JSON.stringify(proof);
  assert.doesNotMatch(serialized, /\b(?:privateKey|recoveryPhrase|mnemonic|payment-signature|authorizationPayload)"\s*:\s*"[^"]+"/iu);
  assert.equal(proof.proofWorker.fundingRouteRetired, true);
  assert.equal(proof.continuation, 'B12');
});
