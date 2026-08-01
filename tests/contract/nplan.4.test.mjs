import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadAutonomousCompletionInputs,
  validateAuthoritySources,
  validateCompletionPolicy,
  validateDispatchState,
  validateExternalActionManifest,
  validateExternalActionTemplate,
  validateOwnerInputsManifest,
  validateOwnerInputsTemplate,
  validateX402Manifest,
  validateX402Template,
} from '../../scripts/verify-autonomous-completion.mjs';

const clone = (value) => structuredClone(value);

test('standing dispatcher keeps exact one-ticket boundaries without repeated owner approval', async () => {
  const { policy, state, sources } = await loadAutonomousCompletionInputs();
  validateCompletionPolicy(policy);
  validateDispatchState(state, policy);
  validateAuthoritySources(sources);
  assert.equal(policy.dispatcher.ownerApprovalRequiredForEachTicket, false);
  assert.equal(policy.dispatcher.exactTicketRequiredBeforeImplementation, true);
  assert.equal(policy.dispatcher.workerExecutesOneTicketPerCycle, true);
  assert.equal(policy.trustedExternalAuthorityEnforcement.workspaceManifestAloneAuthorizesExternalAction, false);
  assert.equal(Object.keys(state.completionGateEvidence).length, 8);
  assert.ok(Object.values(state.completionGateEvidence).every(({ passed }) => passed === false));
  assert.equal(state.activeTicket.id, 'N4.27T');
  assert.equal(state.activeTicket.state, 'completed');
  assert.equal(state.activeTicket.result, 'isolated_cloud_qualification_failed_preserved_cleanup_complete');
  assert.equal(state.nextTicket.id, 'N4.27U');
  assert.equal(state.nextTicket.localAdmission, 'ready_fresh_dispatch_cycle');
  assert.equal(state.nextTicket.cloudAdmission, 'not_in_scope');
  assert.equal(state.currentTruth.realPaymentAuthorized, false);
  assert.equal(state.currentTruth.stage5Authorized, false);
  assert.equal(state.currentTruth.firstRevenueReleaseReady, false);

  const forgedCloudReady = clone(state);
  forgedCloudReady.nextTicket.cloudAdmission = 'ready_trusted_exact_authority';
  assert.throws(() => validateDispatchState(forgedCloudReady, policy), /cloud cannot be ready/u);

  const forgedPaymentReady = clone(state);
  forgedPaymentReady.nextTicket.paymentAdmission = 'ready_trusted_exact_authority';
  assert.throws(() => validateDispatchState(forgedPaymentReady, policy), /payment cannot be ready/u);
});

test('dispatcher rejects paid API drift, skipped gates and unbounded repairs', async () => {
  const { policy } = await loadAutonomousCompletionInputs();
  const paid = clone(policy);
  paid.costPolicy.mandatoryThirdPartyApiCashSpendUsd = 0.01;
  assert.throws(() => validateCompletionPolicy(paid));

  const skipped = clone(policy);
  skipped.dispatcher.ownerBlockedBehavior.skipOrderedGate = true;
  assert.throws(() => validateCompletionPolicy(skipped));

  const blindRepair = clone(policy);
  blindRepair.dispatcher.automaticRepair.reuseOrTuneAgainstSealedFinalEvidence = true;
  assert.throws(() => validateCompletionPolicy(blindRepair));

  const endlessRepair = clone(policy);
  endlessRepair.dispatcher.automaticRepair.maximumConsecutiveSameCauseRepairs = 3;
  assert.throws(() => validateCompletionPolicy(endlessRepair));
});

test('owner package is exhaustive, redacted and fail closed by default', async () => {
  const { owner, external } = await loadAutonomousCompletionInputs();
  validateOwnerInputsTemplate(owner);
  validateExternalActionTemplate(external);
  assert.equal(owner.inputs.x402_receiver_public_pay_to.secretRefs.constructor, Object);
  assert.equal(owner.inputs.cloud_project_identity_and_budget_envelope.nonSecret.cashBillingMayBeUsed, false);
  assert.equal(external.authorizationStatus, 'not_authorized');
  assert.equal(Object.keys(owner.inputs).length, 25);

  const automaticOverage = clone(external);
  automaticOverage.cost.trialToBillOrAutomaticOverageAllowed = true;
  assert.throws(() => validateExternalActionTemplate(automaticOverage));

  const leakedSigner = clone(owner);
  leakedSigner.inputs.x402_separate_payer_signer_and_funding.status = 'ready';
  Object.assign(leakedSigner.inputs.x402_separate_payer_signer_and_funding.nonSecret, {
    payerPublicAddress: '0x2222222222222222222222222222222222222222',
    payerDiffersFromReceiver: true,
    ownerControlsPayer: true,
    restrictedSignerPolicyAttestation: true,
    testnetFundsAvailable: true,
    realUsdcReserveAvailable: true,
  });
  leakedSigner.inputs.x402_separate_payer_signer_and_funding.secretRefs.oneShotRestrictedSignerRef = '/run/secrets/clervo/payer-private-key';
  assert.throws(() => validateOwnerInputsManifest(leakedSigner));

  const prepared = clone(external);
  Object.assign(prepared, {
    manifestId: 'n427t-isolated-cloud',
    authorizationStatus: 'prepared_non_authoritative',
    ownerApprovalReference: 'owner-record:n427t-cloud-v1',
    validFrom: '2026-08-01T00:00:00.000Z',
    expiresAt: '2099-08-02T00:00:00.000Z',
    effectClass: 'cloud_resource_mutation',
    environment: 'qualification',
    purpose: 'N4.27T isolated qualification',
    allowedTicketsOrStage: ['N4.27T'],
    allowedResources: ['project/example/compute/clervo-n427t-001'],
    allowedOperations: ['create', 'inspect', 'delete'],
    stopConditions: ['cost_ceiling_reached', 'unknown_resource_state'],
  });
  Object.assign(prepared.integrity, { sha256: 'a'.repeat(64) });
  Object.assign(prepared.repositoryBinding, {
    expectedBranch: 'main',
    expectedHead: 'b'.repeat(40),
    ticketDocumentSha256: 'c'.repeat(64),
    authoritySha256: ['d'.repeat(64)],
    allowedPathPrefixes: ['infra/n4.27t'],
    allowedCommandIds: ['cloud.inspect', 'cloud.create', 'cloud.cleanup'],
  });
  Object.assign(prepared.identity, {
    principal: 'n427t-deployer@example.invalid',
    runtimeIdentity: 'n427t-runtime@example.invalid',
    credentialOrWorkloadIdentityRef: 'oidc://clervo/n427t-deployer',
    mfaOrInteractiveOwnerActionComplete: true,
  });
  Object.assign(prepared.cost, {
    maximumGrossTicketCostUsd: 2,
    maximumConfiguredExposureUsdPerDay: 1,
    maximumConfiguredExposureUsdPerMonth: 5,
    billingAlertsConfigured: true,
  });
  Object.assign(prepared.evidence, {
    requiredOutputs: ['before_after_inventory', 'cost_receipt'],
    redactionRules: ['no_secret_values'],
  });
  Object.assign(prepared.cleanup, {
    deadline: '2099-08-01T23:00:00.000Z',
    exactProcedureRef: 'docs/operations/n427t-cleanup',
    unknownOutcomeProcedureRef: 'docs/operations/n427t-reconcile',
  });
  const now = Date.parse('2026-08-01T01:00:00.000Z');
  validateExternalActionManifest(prepared, { now });

  const forgedAuthority = clone(prepared);
  forgedAuthority.authorizationStatus = 'authorized';
  assert.throws(() => validateExternalActionManifest(forgedAuthority, { now }), /cannot authorize/u);

  const futureDated = clone(prepared);
  futureDated.validFrom = '2098-08-01T00:00:00.000Z';
  assert.throws(() => validateExternalActionManifest(futureDated, { now }), /not valid yet/u);

  const invalidCleanup = clone(prepared);
  invalidCleanup.cleanup.deadline = 'not-a-date';
  assert.throws(() => validateExternalActionManifest(invalidCleanup, { now }), /cleanup deadline/u);

  const missingRuntime = clone(prepared);
  missingRuntime.identity.runtimeIdentity = null;
  assert.throws(() => validateExternalActionManifest(missingRuntime, { now }), /runtimeIdentity/u);

  const missingCredential = clone(prepared);
  missingCredential.identity.credentialOrWorkloadIdentityRef = null;
  assert.throws(() => validateExternalActionManifest(missingCredential, { now }), /identity reference/u);

  const wildcard = clone(prepared);
  wildcard.allowedResources = ['*'];
  assert.throws(() => validateExternalActionManifest(wildcard, { now }));
});

test('x402 manifest requires public receiver, separate restricted payer and one fail-closed proof', async () => {
  const { x402 } = await loadAutonomousCompletionInputs();
  validateX402Template(x402);
  assert.equal(x402.receiver.privateKeyRequiredOrAccepted, false);
  assert.equal(x402.payment.maximumExecutionCount, 1);
  assert.equal(x402.safety.newAuthorizationAfterUnknownSettlementAllowed, false);

  const receiverSecret = clone(x402);
  receiverSecret.receiver.privateKeyRequiredOrAccepted = true;
  assert.throws(() => validateX402Template(receiverSecret));

  const repeat = clone(x402);
  repeat.payment.maximumExecutionCount = 2;
  assert.throws(() => validateX402Template(repeat));

  const unknownRetry = clone(x402);
  unknownRetry.safety.newAuthorizationAfterUnknownSettlementAllowed = true;
  assert.throws(() => validateX402Template(unknownRetry));

  const prepared = clone(x402);
  Object.assign(prepared, {
    ticketId: 'N15.1',
    authorizationStatus: 'prepared_non_authoritative',
    environment: 'production-proof',
    ownerApprovalReference: 'owner-record:n15.1-payment-v1',
    validFrom: '2026-08-01T00:00:00.000Z',
    expiresAt: '2099-08-02T00:00:00.000Z',
    stopConditions: ['one_settlement_complete', 'any_unknown_outcome'],
  });
  Object.assign(prepared.integrity, { sha256: 'e'.repeat(64) });
  Object.assign(prepared.deployment, {
    releaseId: 'clervo-platform-rc1',
    origin: 'https://api.example.invalid',
    productId: 'clervo.platform',
    operationId: 'search.web',
    route: 'POST /v1/search/paid',
    usefulResultAcceptanceRef: 'evidence://stage15/useful-result-v1',
  });
  Object.assign(prepared.receiver, {
    publicPayToAddress: '0x1111111111111111111111111111111111111111',
    ownerControlAttested: true,
  });
  Object.assign(prepared.payer, {
    publicAddress: '0x2222222222222222222222222222222222222222',
    differentFromReceiver: true,
    oneShotRestrictedSignerRef: 'wallet-signer://clervo/stage15/one-shot',
    signerPolicyAttestationRef: 'evidence://stage15/signer-policy-v1',
    balanceCapAtomic: '10000',
  });
  Object.assign(prepared.payment, {
    networkCaip2: 'eip155:8453',
    assetContractOrMint: '0x3333333333333333333333333333333333333333',
    assetDecimals: 6,
    exactAmountAtomic: '1000',
    maximumTotalAmountAtomic: '10000',
    maximumNetworkFeeUsd: 0,
    maximumFacilitatorFeeUsd: 0,
    maximumInfrastructureCostUsd: 0,
    quoteExpiryLimitSeconds: 300,
  });
  Object.assign(prepared.facilitator, {
    identity: 'qualified-facilitator-v1',
    url: 'https://facilitator.example.invalid',
    supportedSchemeNetworkAssetVerifiedAt: '2026-08-01T00:00:00.000Z',
    termsAcceptedReference: 'owner-record:facilitator-terms-v1',
  });
  Object.assign(prepared.requestIdentity, {
    requestHashProcedureRef: 'contract://request-hash-v1',
    idempotencyKeyProcedureRef: 'contract://idempotency-v1',
    nonceProcedureRef: 'contract://nonce-v1',
    operationStateAndLedgerRef: 'contract://ledger-v1',
  });
  Object.assign(prepared.safety, {
    killSwitchRef: 'control://stage15/kill-switch',
    alertReadinessRef: 'evidence://stage15/alerts',
    reconciliationProcedureRef: 'runbook://stage15/reconciliation',
  });
  const now = Date.parse('2026-08-01T01:00:00.000Z');
  validateX402Manifest(prepared, { now });

  const forgedAuthority = clone(prepared);
  forgedAuthority.authorizationStatus = 'authorized';
  assert.throws(() => validateX402Manifest(forgedAuthority, { now }), /cannot authorize payment/u);

  const rawKeyFile = clone(prepared);
  rawKeyFile.payer.oneShotRestrictedSignerRef = '/run/secrets/clervo/payer-private-key';
  assert.throws(() => validateX402Manifest(rawKeyFile, { now }));

  const signerQuery = clone(prepared);
  signerQuery.payer.oneShotRestrictedSignerRef = 'wallet-signer://clervo/stage15/one-shot?token=forbidden';
  assert.throws(() => validateX402Manifest(signerQuery, { now }));

  const sameWallet = clone(prepared);
  sameWallet.payer.publicAddress = sameWallet.receiver.publicPayToAddress;
  assert.throws(() => validateX402Manifest(sameWallet, { now }));

  const futureDated = clone(prepared);
  futureDated.validFrom = '2098-08-01T00:00:00.000Z';
  assert.throws(() => validateX402Manifest(futureDated, { now }), /not valid yet/u);

  for (const evidenceFlag of [
    'safeTransactionIdentifierOnly',
    'verifyUsefulResult',
    'verifySettlementAndBalancedLedger',
    'verifyReceiptAndExplorerEvidence',
    'recordExactSpendAndRemainingBalance',
  ]) {
    const disabledEvidence = clone(prepared);
    disabledEvidence.evidence[evidenceFlag] = false;
    assert.throws(() => validateX402Manifest(disabledEvidence, { now }), new RegExp(evidenceFlag, 'u'));
  }
});

test('dispatch state validates future transitions generically and rejects dishonest completion', async () => {
  const { policy, state } = await loadAutonomousCompletionInputs();
  const future = clone(state);
  future.activeTicket = { id: 'N4.99', state: 'active', scope: 'Implement a future exact admitted Stage 4 repository ticket.' };
  future.nextTicket = {
    id: 'N4.100',
    title: 'Next bounded Stage 4 ticket',
    scopeSource: 'docs/tickets/N4.100.md',
    ownerAuthority: 'nplan4_dispatch_admission',
    localAdmission: 'candidate',
    cloudAdmission: 'not_in_scope',
    paymentAdmission: 'not_in_scope',
    sealedBoundary: 'No sealed evidence is in scope.',
  };
  validateDispatchState(future, policy);

  const falseRelease = clone(state);
  falseRelease.currentStage = 16;
  falseRelease.currentTruth.searchLifecycle = 'available';
  falseRelease.currentTruth.otherFivePillarLifecycle = 'available';
  falseRelease.currentTruth.firstRevenueReleaseReady = true;
  assert.throws(() => validateDispatchState(falseRelease, policy));

  const inventedGateEvidence = clone(state);
  inventedGateEvidence.currentStage = 16;
  inventedGateEvidence.programStatus = 'complete';
  inventedGateEvidence.nextTicket = null;
  inventedGateEvidence.currentTruth.stage4BlockerCount = 0;
  inventedGateEvidence.currentTruth.searchReferencePatternAuthorized = true;
  inventedGateEvidence.currentTruth.stage5Authorized = true;
  inventedGateEvidence.currentTruth.searchLifecycle = 'available';
  inventedGateEvidence.currentTruth.otherFivePillarLifecycle = 'available';
  inventedGateEvidence.currentTruth.firstRevenueReleaseReady = true;
  for (const gate of policy.program.completionGates) {
    Object.assign(inventedGateEvidence.completionGateEvidence[gate.id], {
      passed: true,
      evidenceRef: gate.evidencePath,
      evidenceSha256: 'f'.repeat(64),
      verifierId: gate.verifierId,
      subjectCommit: 'e'.repeat(40),
      verifiedAt: '2026-08-01T07:00:00.000Z',
    });
  }
  assert.throws(() => validateDispatchState(inventedGateEvidence, policy), /ENOENT|evidence|subject commit/iu);

  const forgedPaymentAuthority = clone(state);
  forgedPaymentAuthority.currentTruth.realPaymentAuthorized = true;
  assert.throws(() => validateDispatchState(forgedPaymentAuthority, policy));

  const staleCloseout = clone(state);
  staleCloseout.activeTicket.state = 'completed';
  staleCloseout.nextTicket.localAdmission = 'candidate';
  assert.throws(() => validateDispatchState(staleCloseout, policy));
});
