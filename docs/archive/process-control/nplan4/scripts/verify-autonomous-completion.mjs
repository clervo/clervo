#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const REQUIRED_OWNER_INPUT_IDS = Object.freeze([
  'ai_model_license_compute_and_terms',
  'autonomous_external_authority_trust_root',
  'brand_domain_and_trademark_rights',
  'business_owner_and_legal_identity',
  'cloud_project_identity_and_budget_envelope',
  'commercial_legal_tax_and_refund_policy',
  'crypto_source_terms_and_risk_language_policy',
  'external_customer_payer_and_consent',
  'git_ci_package_registry_accounts',
  'interactive_mfa_oauth_and_terms_acceptance',
  'legacy_asset_migration_or_sunset_decisions',
  'monitoring_alert_channels_and_on_call',
  'prediction_source_terms_and_resolution_policy',
  'pricing_sla_support_and_launch_decisions',
  'privacy_data_retention_and_residency_policy',
  'production_database_queue_and_secret_store',
  'public_domain_dns_tls_and_email',
  'public_support_security_and_incident_contacts',
  'rpc_network_provider_and_broadcast_policy',
  'sandbox_abuse_execution_and_artifact_policy',
  'search_source_seed_content_rights_and_takedown',
  'x402_network_asset_facilitator_and_limits',
  'x402_receipt_signing_identity',
  'x402_receiver_public_pay_to',
  'x402_separate_payer_signer_and_funding',
]);

const pillarIds = Object.freeze(['search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto_intelligence']);
const stageOrder = Object.freeze([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
const completionGateDefinitions = Object.freeze([
  Object.freeze({ id: 'stage4_search_reference_pattern', minimumStage: 4, verifierId: 'stage4-exit', evidencePath: 'docs/evidence/completion-gates/stage4_search_reference_pattern.json' }),
  Object.freeze({ id: 'six_product_cores_qualified', minimumStage: 10, verifierId: 'product-core-gate', evidencePath: 'docs/evidence/completion-gates/six_product_cores_qualified.json' }),
  Object.freeze({ id: 'combined_private_stability', minimumStage: 11, verifierId: 'combined-stability-gate', evidencePath: 'docs/evidence/completion-gates/combined_private_stability.json' }),
  Object.freeze({ id: 'cross_pillar_contract_freeze', minimumStage: 12, verifierId: 'cross-pillar-freeze', evidencePath: 'docs/evidence/completion-gates/cross_pillar_contract_freeze.json' }),
  Object.freeze({ id: 'shared_access_design_distribution', minimumStage: 13, verifierId: 'shared-release-system', evidencePath: 'docs/evidence/completion-gates/shared_access_design_distribution.json' }),
  Object.freeze({ id: 'production_release', minimumStage: 14, verifierId: 'production-release', evidencePath: 'docs/evidence/completion-gates/production_release.json' }),
  Object.freeze({ id: 'bounded_real_settlement', minimumStage: 15, verifierId: 'x402-settlement-proof', evidencePath: 'docs/evidence/completion-gates/bounded_real_settlement.json' }),
  Object.freeze({ id: 'external_useful_paid_result', minimumStage: 16, verifierId: 'external-paid-result', evidencePath: 'docs/evidence/completion-gates/external_useful_paid_result.json' }),
]);
const ticketIdPattern = /^N(?:PLAN\.)?\d+(?:\.\d+)*(?:[A-Z]\d*)?$/u;
const sha256Pattern = /^(?:sha256:)?[a-f0-9]{64}$/u;
const restrictedSignerPattern = /^(?:wallet-signer|managed-wallet|kms-signer|hsm-signer|hardware-wallet|unix-signer):\/\/[A-Za-z0-9._~:/@!$&'()*+,;=%-]+$/u;

function assertNonEmptyString(value, label) {
  assert.equal(typeof value, 'string', `${label}: must be a string`);
  assert.ok(value.trim().length > 0, `${label}: must not be empty`);
}

function assertNonNegativeNumber(value, label) {
  assert.equal(typeof value, 'number', `${label}: must be a number`);
  assert.ok(Number.isFinite(value) && value >= 0, `${label}: must be finite and non-negative`);
}

function assertOpaqueSecretReference(value, label) {
  assert.equal(typeof value, 'string', `${label}: secret reference must be a string`);
  assert.match(value, /^(?:\/run\/secrets\/clervo\/[A-Za-z0-9._/-]+|[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+)$/u, `${label}: use an opaque secret-manager or /run/secrets/clervo reference`);
  assert.doesNotMatch(value, /(?:BEGIN [A-Z ]*PRIVATE KEY|seed phrase|mnemonic|bearer\s+|\bsk-[A-Za-z0-9])/iu, `${label}: possible secret value`);
}

function assertRestrictedSignerReference(value, label) {
  assert.equal(typeof value, 'string', `${label}: restricted signer reference must be a string`);
  assert.match(value, restrictedSignerPattern, `${label}: use a wallet/KMS/HSM/hardware/unix signer service reference, never a raw key file`);
}

function walkSecretReferences(value, keyPath = []) {
  if (value === null) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkSecretReferences(entry, [...keyPath, String(index)]));
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = [...keyPath, key];
    if (keyPath.at(-1) === 'secretRefs' && entry !== null) {
      assertOpaqueSecretReference(entry, nextPath.join('.'));
    }
    walkSecretReferences(entry, nextPath);
  }
}

export function validateCompletionPolicy(policy) {
  assert.equal(policy.schemaVersion, 'clervo.autonomous-completion-policy.v1');
  assert.equal(policy.authorityTicket, 'NPLAN.4');
  assert.equal(policy.program.firstRevenueReleaseProductId, 'clervo.platform');
  assert.deepEqual(policy.program.requiredPillars, pillarIds);
  assert.deepEqual(policy.program.orderedStages, stageOrder);
  assert.deepEqual(policy.program.completionGates, completionGateDefinitions);
  assert.equal(policy.dispatcher.standingProgramAuthority, true);
  assert.equal(policy.dispatcher.ownerApprovalRequiredForEachTicket, false);
  assert.equal(policy.dispatcher.exactTicketRequiredBeforeImplementation, true);
  assert.equal(policy.dispatcher.oneActiveTicketLease, true);
  assert.equal(policy.dispatcher.workerExecutesOneTicketPerCycle, true);
  assert.equal(policy.dispatcher.freshDispatchCycleRequiredAfterCommit, true);
  assert.equal(new Set(policy.dispatcher.allowedStates).size, policy.dispatcher.allowedStates.length);
  assert.ok(policy.dispatcher.admissionChecks.length >= 12, 'admission gate is incomplete');
  assert.ok(policy.dispatcher.closeoutChecks.length >= 8, 'closeout gate is incomplete');
  assert.equal(policy.dispatcher.automaticRepair.enabled, true);
  assert.equal(policy.dispatcher.automaticRepair.trigger, 'terminal_closeout_failure_postcommit_regression_or_failed_qualification');
  assert.equal(policy.dispatcher.automaticRepair.ordinaryInScopeDevelopmentFixesStayInActiveTicket, true);
  assert.equal(policy.dispatcher.automaticRepair.preserveFailedEvidence, true);
  assert.equal(policy.dispatcher.automaticRepair.reuseOrTuneAgainstSealedFinalEvidence, false);
  assert.equal(policy.dispatcher.automaticRepair.newIndependentProcedureRequiredAfterFinalFailure, true);
  assert.equal(policy.dispatcher.automaticRepair.maximumConsecutiveSameCauseRepairs, 2);
  assert.equal(policy.dispatcher.ownerBlockedBehavior.inventOwnerInput, false);
  assert.equal(policy.dispatcher.ownerBlockedBehavior.skipOrderedGate, false);

  assert.equal(policy.costPolicy.mandatoryThirdPartyApiCashSpendUsd, 0);
  assert.equal(policy.costPolicy.paidOrTrialToBillApiAllowed, false);
  assert.equal(policy.costPolicy.hiddenModelTokenSpendAllowed, false);
  assert.equal(policy.costPolicy.defaultUnmanifestedExternalSpendUsd, 0);
  assert.equal(policy.costPolicy.infrastructureIsStillARealCost, true);
  assert.equal(policy.costPolicy.billableInfrastructureRequiresExactOwnerPreparedInputs, true);
  assert.equal(policy.costPolicy.billableInfrastructureRequiresSeparateExplicitOwnerAuthorityUntilTrustedVerifier, true);
  assert.equal(policy.externalEffects.host_or_unrelated_destructive_action, 'forbidden');
  assert.match(policy.externalEffects.real_wallet_or_usdc_action, /separate_explicit_owner_action/u);

  assert.equal(policy.trustedExternalAuthorityEnforcement.status, 'not_implemented_fail_closed');
  assert.equal(policy.trustedExternalAuthorityEnforcement.workspaceManifestAloneAuthorizesExternalAction, false);
  assert.equal(policy.trustedExternalAuthorityEnforcement.authorizedStatusAcceptedByCurrentValidator, false);
  assert.equal(policy.trustedExternalAuthorityEnforcement.ownerControlledReadOnlyTrustRootRequired, true);
  assert.equal(policy.trustedExternalAuthorityEnforcement.detachedEd25519SignatureRequired, true);
  assert.equal(policy.trustedExternalAuthorityEnforcement.independentSignedRevocationStateRequired, true);
  assert.equal(policy.trustedExternalAuthorityEnforcement.actualRepositoryTicketAndAuthorityBindingRequired, true);
  assert.equal(policy.trustedExternalAuthorityEnforcement.mediatedResourceCommandCostAndCleanupEnforcementRequired, true);

  assert.equal(policy.paymentPolicy.realSettlementStage, 15);
  assert.equal(policy.paymentPolicy.realPaymentAuthorizedNow, false);
  assert.equal(policy.paymentPolicy.separatePayerAndReceiverRequired, true);
  assert.equal(policy.paymentPolicy.receiverPublicPayToRequired, true);
  assert.equal(policy.paymentPolicy.receiverPrivateKeyRequired, false);
  assert.equal(policy.paymentPolicy.payerRestrictedSignerReferenceRequired, true);
  assert.equal(policy.paymentPolicy.payerSignerMayBeSharedInChatOrGit, false);
  assert.equal(policy.paymentPolicy.maximumExecutionCount, 1);
  assert.equal(policy.paymentPolicy.totalOwnerReserveUsdc, 0.03);
  assert.equal(policy.paymentPolicy.minimumUntouchedContingencyUsdc, 0.02);
  assert.ok(policy.paymentPolicy.maximumProofSpendUsdc <= 0.01);
  assert.equal(policy.paymentPolicy.ownerFundedProofCountsAsDemandOrRevenue, false);
  assert.equal(policy.paymentPolicy.unknownSettlementAction, 'quarantine_and_reconcile_without_new_authorization');
  assert.equal(policy.truthPolicy.revenueOrWealthGuaranteeAllowed, false);
  return policy;
}

export function validateDispatchState(state, policy, { root = repositoryRoot } = {}) {
  assert.equal(state.schemaVersion, 'clervo.autonomous-dispatch-state.v1');
  assert.equal(state.policy, 'infra/control-plane/autonomous-completion-policy.v1.json');
  assert.ok(policy.program.orderedStages.includes(state.currentStage));
  assert.ok(['active', 'blocked_owner', 'complete'].includes(state.programStatus));
  assert.match(state.evaluatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  const stateEvaluatedAt = Date.parse(state.evaluatedAt);
  assert.ok(Number.isFinite(stateEvaluatedAt) && stateEvaluatedAt <= Date.now(), 'dispatch evaluation time is in the future');
  assert.match(state.activeTicket.id, ticketIdPattern);
  assert.ok(policy.dispatcher.allowedStates.includes(state.activeTicket.state));
  assertNonEmptyString(state.activeTicket.scope, 'activeTicket.scope');

  if (state.nextTicket !== null) {
    assert.match(state.nextTicket.id, ticketIdPattern);
    assertNonEmptyString(state.nextTicket.title, 'nextTicket.title');
    assertNonEmptyString(state.nextTicket.scopeSource, 'nextTicket.scopeSource');
    assertNonEmptyString(state.nextTicket.ownerAuthority, 'nextTicket.ownerAuthority');
    assert.ok(['candidate', 'ready_after_current_closeout', 'ready_fresh_dispatch_cycle', 'blocked_gate', 'blocked_owner'].includes(state.nextTicket.localAdmission));
    assert.ok(['not_in_scope', 'blocked_owner_input_and_authority', 'ready_trusted_exact_authority'].includes(state.nextTicket.cloudAdmission));
    assert.ok(['not_in_scope', 'blocked_stage_15', 'blocked_owner_input_and_authority', 'ready_trusted_exact_authority'].includes(state.nextTicket.paymentAdmission));
    if (policy.trustedExternalAuthorityEnforcement.status === 'not_implemented_fail_closed') {
      assert.notEqual(state.nextTicket.cloudAdmission, 'ready_trusted_exact_authority', 'cloud cannot be ready while trusted external authority enforcement is unavailable');
      assert.notEqual(state.nextTicket.paymentAdmission, 'ready_trusted_exact_authority', 'payment cannot be ready while trusted external authority enforcement is unavailable');
    }
    assertNonEmptyString(state.nextTicket.sealedBoundary, 'nextTicket.sealedBoundary');
  } else {
    assert.equal(state.programStatus, 'complete', 'only a complete program may omit the next ticket');
  }

  if (state.activeTicket.state === 'completed' && state.nextTicket !== null) {
    assert.equal(state.nextTicket.localAdmission, 'ready_fresh_dispatch_cycle', 'completed ticket must hand off to a fresh cycle');
  }
  assert.ok(Array.isArray(state.immediateOwnerBlockers));
  for (const blocker of state.immediateOwnerBlockers) {
    assert.ok(REQUIRED_OWNER_INPUT_IDS.includes(blocker.inputId), `${blocker.inputId}: unknown owner input`);
    assertNonEmptyString(blocker.blocks, `${blocker.inputId}.blocks`);
    assertNonEmptyString(blocker.doesNotBlock, `${blocker.inputId}.doesNotBlock`);
  }

  const gateIds = policy.program.completionGates.map(({ id }) => id);
  assert.deepEqual(Object.keys(state.completionGateEvidence), gateIds, 'completion gate evidence drift');
  let everyEarlierGatePassed = true;
  for (const { id, minimumStage, verifierId, evidencePath } of policy.program.completionGates) {
    const binding = state.completionGateEvidence[id];
    assert.equal(typeof binding.passed, 'boolean', `${id}.passed must be boolean`);
    if (binding.passed) {
      assert.equal(everyEarlierGatePassed, true, `${id}: an earlier completion gate has not passed`);
      assert.ok(state.currentStage >= minimumStage, `${id}: current stage is before the gate`);
      assertNonEmptyString(binding.evidenceRef, `${id}.evidenceRef`);
      assert.equal(binding.evidenceRef, evidencePath, `${id}: non-canonical evidence path`);
      assert.match(binding.evidenceSha256, sha256Pattern, `${id}.evidenceSha256`);
      assert.equal(binding.verifierId, verifierId, `${id}: verifier mismatch`);
      assert.match(binding.subjectCommit, /^[a-f0-9]{40}$/u, `${id}.subjectCommit`);
      const gateVerifiedAt = Date.parse(binding.verifiedAt);
      assert.ok(Number.isFinite(gateVerifiedAt) && gateVerifiedAt <= stateEvaluatedAt, `${id}.verifiedAt invalid or after dispatch evaluation`);
      const subjectCommitCheck = spawnSync('git', ['merge-base', '--is-ancestor', binding.subjectCommit, 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      assert.equal(subjectCommitCheck.status, 0, `${id}: subject commit is missing or not an ancestor of HEAD`);
      const evidenceBytes = readFileSync(path.resolve(root, evidencePath));
      const actualEvidenceSha256 = createHash('sha256').update(evidenceBytes).digest('hex');
      assert.equal(binding.evidenceSha256.replace(/^sha256:/u, ''), actualEvidenceSha256, `${id}: evidence hash mismatch`);
      const evidence = JSON.parse(evidenceBytes.toString('utf8'));
      assert.equal(evidence.schemaVersion, 'clervo.completion-gate-evidence.v1', `${id}: evidence schema mismatch`);
      assert.equal(evidence.gateId, id, `${id}: evidence gate mismatch`);
      assert.equal(evidence.verifierId, verifierId, `${id}: evidence verifier mismatch`);
      assert.equal(evidence.result, 'passed', `${id}: evidence result is not passed`);
      assert.equal(evidence.subjectCommit, binding.subjectCommit, `${id}: evidence subject commit mismatch`);
      assert.equal(evidence.verifiedAt, binding.verifiedAt, `${id}: evidence verification time mismatch`);
    } else {
      assert.equal(binding.evidenceRef, null, `${id}: failed gate cannot cite passing evidence`);
      assert.equal(binding.evidenceSha256, null, `${id}: failed gate cannot cite a passing hash`);
      assert.equal(binding.verifierId, null, `${id}: failed gate cannot cite a passing verifier`);
      assert.equal(binding.subjectCommit, null, `${id}: failed gate cannot cite a passing subject commit`);
      assert.equal(binding.verifiedAt, null, `${id}: failed gate cannot have a passing timestamp`);
    }
    everyEarlierGatePassed = binding.passed;
  }

  assert.equal(state.activeAuthorityBindings.trustedExternalManifestAdmission, policy.trustedExternalAuthorityEnforcement.status);
  const paymentAuthority = state.activeAuthorityBindings.realPayment;
  assert.equal(typeof paymentAuthority.authorized, 'boolean');
  if (paymentAuthority.authorized) {
    assert.notEqual(policy.trustedExternalAuthorityEnforcement.status, 'not_implemented_fail_closed', 'real payment cannot be admitted without trusted external authority enforcement');
    assert.ok(state.currentStage >= policy.paymentPolicy.realSettlementStage);
    assert.match(paymentAuthority.ticketId, ticketIdPattern);
    assertNonEmptyString(paymentAuthority.manifestRef, 'realPayment.manifestRef');
    assert.match(paymentAuthority.manifestSha256, sha256Pattern);
    assert.ok(Number.isFinite(Date.parse(paymentAuthority.expiresAt)) && Date.parse(paymentAuthority.expiresAt) > Date.now(), 'real-payment authority expired');
  } else {
    for (const key of ['ticketId', 'manifestRef', 'manifestSha256', 'expiresAt']) {
      assert.equal(paymentAuthority[key], null, `inactive real-payment authority must clear ${key}`);
    }
  }

  assert.ok(['preview', 'degraded', 'available'].includes(state.currentTruth.searchLifecycle));
  assert.ok(['unavailable', 'preview', 'degraded', 'available'].includes(state.currentTruth.otherFivePillarLifecycle));
  assert.ok(Number.isInteger(state.currentTruth.stage4BlockerCount) && state.currentTruth.stage4BlockerCount >= 0);
  for (const key of ['searchReferencePatternAuthorized', 'stage5Authorized', 'firstRevenueReleaseReady', 'realPaymentAuthorized']) {
    assert.equal(typeof state.currentTruth[key], 'boolean', `currentTruth.${key}: must be boolean`);
  }
  const stage4GatePassed = state.completionGateEvidence.stage4_search_reference_pattern.passed;
  if (stage4GatePassed) assert.equal(state.currentTruth.stage4BlockerCount, 0, 'Stage 4 cannot pass with blockers');
  assert.equal(state.currentTruth.searchReferencePatternAuthorized, stage4GatePassed, 'reference-pattern truth must derive from Stage 4 evidence');
  assert.equal(state.currentTruth.stage5Authorized, stage4GatePassed, 'Stage 5 authority must derive from Stage 4 evidence');
  assert.equal(state.currentTruth.realPaymentAuthorized, paymentAuthority.authorized, 'payment truth must derive from its active authority binding');
  assertNonNegativeNumber(state.currentTruth.activeIncrementalExposureUsdPerDay, 'currentTruth.activeIncrementalExposureUsdPerDay');
  assertNonNegativeNumber(state.currentTruth.usdcSpent, 'currentTruth.usdcSpent');
  const completionExpected = Object.values(state.completionGateEvidence).every(({ passed }) => passed)
    && state.currentStage === 16
    && state.currentTruth.searchLifecycle === 'available'
    && state.currentTruth.otherFivePillarLifecycle === 'available';
  assert.equal(state.currentTruth.firstRevenueReleaseReady, completionExpected, 'First Revenue Release truth must derive from every evidence-bound gate');
  if (completionExpected) {
    assert.equal(state.programStatus, 'complete');
    assert.equal(state.nextTicket, null);
  }
  if (state.programStatus === 'complete') assert.equal(completionExpected, true, 'program cannot be complete before every evidence-bound gate passes');
  return state;
}

export function validateOwnerInputsTemplate(owner) {
  validateOwnerInputsManifest(owner, { template: true });
  return owner;
}

function hasSuppliedLeaf(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(hasSuppliedLeaf);
  if (typeof value === 'object') return Object.values(value).some(hasSuppliedLeaf);
  return true;
}

function assertNoNullDecision(value, label) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoNullDecision(entry, `${label}.${index}`));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, entry] of Object.entries(value)) assertNoNullDecision(entry, `${label}.${key}`);
    return;
  }
  assert.notEqual(value, null, `${label}: ready input still has an undecided null field`);
}

export function validateOwnerInputsManifest(owner, { template = false } = {}) {
  assert.equal(owner.schemaVersion, 'clervo.owner-inputs.v1');
  assert.equal(owner.instructions.copyToIgnoredPath, 'private/clervo-owner-inputs.json');
  assert.equal(owner.instructions.secretMountRoot, '/run/secrets/clervo');
  assert.ok(owner.instructions.neverInclude.includes('private keys'));
  assert.ok(owner.instructions.neverInclude.includes('customer payloads'));
  assert.ok(['missing', 'ready'].includes(owner.programAuthorization.status));
  if (template) assert.equal(owner.programAuthorization.status, 'missing');
  if (owner.programAuthorization.status === 'ready') {
    assert.equal(owner.programAuthorization.standingExactTicketDispatcherAccepted, true);
    assert.equal(owner.programAuthorization.zeroPaidThirdPartyApiCashPolicyAccepted, true);
    assert.equal(owner.programAuthorization.truthfulNoRevenueGuaranteeAccepted, true);
  }
  assert.deepEqual(Object.keys(owner.inputs).sort(), [...REQUIRED_OWNER_INPUT_IDS]);
  assert.ok(owner.redactedAssetRegistry.requiredEntryFields.length >= 10);
  for (const [id, input] of Object.entries(owner.inputs)) {
    assert.ok(['missing', 'ready', 'not_required'].includes(input.status), `${id}: invalid status`);
    if (template) assert.equal(input.status, 'missing', `${id}: template status must fail closed`);
    assert.equal(typeof input.requiredBy, 'string', `${id}: requiredBy missing`);
    assert.ok(input.requiredBy.length >= 7, `${id}: requiredBy is not explicit`);
    assert.equal(typeof input.nonSecret, 'object', `${id}: nonSecret map missing`);
    assert.equal(typeof input.secretRefs, 'object', `${id}: secretRefs map missing`);
    if (input.status === 'ready') {
      assert.ok(hasSuppliedLeaf(input.nonSecret) || hasSuppliedLeaf(input.secretRefs), `${id}: ready input has no supplied value or reference`);
      assertNoNullDecision(input.nonSecret, id);
    }
  }
  for (const [index, entry] of owner.redactedAssetRegistry.entries.entries()) {
    assert.deepEqual(Object.keys(entry).sort(), [...owner.redactedAssetRegistry.requiredEntryFields].sort(), `asset ${index}: field drift`);
    for (const key of owner.redactedAssetRegistry.requiredEntryFields) assertNoNullDecision(entry[key], `asset.${index}.${key}`);
    assertOpaqueSecretReference(entry.secretOrIdentityRef, `asset.${index}.secretOrIdentityRef`);
  }
  walkSecretReferences(owner);
  assert.deepEqual(owner.inputs.x402_receiver_public_pay_to.secretRefs, {}, 'receiver wallet must not have a secret input');

  const receiver = owner.inputs.x402_receiver_public_pay_to;
  if (receiver.status === 'ready') {
    assert.equal(typeof receiver.nonSecret.receiverPublicAddress, 'string');
    assert.equal(receiver.nonSecret.ownerControlsReceiver, true);
    assert.equal(receiver.nonSecret.receiverMayBePublishedAsPayTo, true);
    assert.equal(receiver.nonSecret.receiverPrivateKeyWillNotBeShared, true);
  }
  const payer = owner.inputs.x402_separate_payer_signer_and_funding;
  if (payer.status === 'ready') {
    assert.equal(typeof payer.nonSecret.payerPublicAddress, 'string');
    assert.equal(payer.nonSecret.payerDiffersFromReceiver, true);
    assert.equal(payer.nonSecret.ownerControlsPayer, true);
    assert.equal(payer.nonSecret.restrictedSignerPolicyAttestation, true);
    assertRestrictedSignerReference(payer.secretRefs.oneShotRestrictedSignerRef, 'x402 payer signer');
    if (receiver.status === 'ready') assert.notEqual(payer.nonSecret.payerPublicAddress, receiver.nonSecret.receiverPublicAddress);
  }

  const alerts = owner.inputs.monitoring_alert_channels_and_on_call;
  if (alerts.status === 'ready') {
    for (const key of ['primaryAlertChannelType', 'primaryAlertChannelResource', 'secondaryAlertChannelType', 'secondaryAlertChannelResource', 'onCallOwner']) {
      assertNonEmptyString(alerts.nonSecret[key], `monitoring.${key}`);
    }
    assert.equal(alerts.nonSecret.testNotificationApproved, true);
  }

  const cloud = owner.inputs.cloud_project_identity_and_budget_envelope;
  if (cloud.status === 'ready') {
    assertNonEmptyString(cloud.nonSecret.cloudProvider, 'cloud.cloudProvider');
    assertNonEmptyString(cloud.nonSecret.projectOrAccountId, 'cloud.projectOrAccountId');
    assert.ok(cloud.nonSecret.allowedRegions.length > 0, 'cloud.allowedRegions missing');
    assertNonEmptyString(cloud.nonSecret.deployerPrincipal, 'cloud.deployerPrincipal');
    assertNonEmptyString(cloud.nonSecret.runtimeIdentity, 'cloud.runtimeIdentity');
    assert.ok(cloud.nonSecret.allowedResourceTypesAndNamePrefixes.length > 0, 'cloud resource allowlist missing');
    for (const key of ['maximumGrossTicketCostUsd', 'maximumConfiguredExposureUsdPerDay', 'maximumConfiguredExposureUsdPerMonth', 'maximumResidualExposureUsdPerDay']) {
      assertNonNegativeNumber(cloud.nonSecret[key], `cloud.${key}`);
    }
    assert.equal(cloud.nonSecret.mandatoryCleanup, true);
    assert.equal(cloud.nonSecret.unknownOutcomeProcedureApproved, true);
    assertOpaqueSecretReference(cloud.secretRefs.workloadIdentityCredentialFileRef, 'cloud workload identity');
  }

  const trust = owner.inputs.autonomous_external_authority_trust_root;
  if (trust.status === 'ready') {
    assert.match(trust.nonSecret.ownerSigningPublicKeyFingerprint, sha256Pattern);
    assertNonEmptyString(trust.nonSecret.ownerControlledReadOnlyTrustRootLocation, 'owner trust-root location');
    assert.doesNotMatch(trust.nonSecret.ownerControlledReadOnlyTrustRootLocation, /^\/workspace\/clervo-next(?:\/|$)/u, 'owner trust root cannot live in the agent-writable repository');
    for (const key of [
      'detachedEd25519ManifestSigningProcedureReference',
      'independentlySignedMonotonicRevocationProcedureReference',
      'trustRootRecoveryAndRotationProcedureReference',
    ]) assertNonEmptyString(trust.nonSecret[key], `owner trust.${key}`);
    assert.equal(trust.nonSecret.agentWorkspaceCannotModifyTrustRootOrRevocationsAttested, true);
    assertOpaqueSecretReference(trust.secretRefs.ownerExternalSigningServiceRef, 'owner external signing service');
  }
  return owner;
}

export function validateExternalActionTemplate(external) {
  validateExternalActionManifest(external, { template: true });
  return external;
}

export function validateExternalActionManifest(external, { template = false, now = Date.now() } = {}) {
  assert.equal(external.schemaVersion, 'clervo.external-action-authority.v1');
  assert.ok(['not_authorized', 'prepared_non_authoritative', 'authorized', 'revoked', 'expired'].includes(external.authorizationStatus));
  if (template) assert.equal(external.authorizationStatus, 'not_authorized');
  assert.equal(external.authorityEffect, 'none_without_trusted_external_verifier_or_separate_explicit_owner_action');
  assert.equal(external.integrity.canonicalization, 'RFC8785');
  assert.equal(external.integrity.verificationStatus, 'not_verified_non_authoritative');
  if (external.authorizationStatus === 'revoked') assert.equal(external.integrity.revoked, true);
  else assert.equal(external.integrity.revoked, false);
  assert.equal(external.cost.mandatoryThirdPartyApiCashSpendUsd, 0);
  assert.equal(external.cost.maximumResidualExposureUsdPerDay, 0);
  assert.equal(external.cost.trialToBillOrAutomaticOverageAllowed, false);
  assert.equal(external.evidence.materialCostRecordRequired, true);
  assert.equal(external.evidence.resourceInventoryBeforeAndAfterRequired, true);
  assert.equal(external.cleanup.zeroResourceVerificationRequired, true);
  assert.equal(external.repositoryBinding.cleanTreeRequired, true);
  assert.ok(external.forbiddenOperations.includes('billing_account_change'));
  assert.ok(external.forbiddenOperations.includes('legacy_or_unrelated_resource_change'));
  if (external.identity.credentialOrWorkloadIdentityRef !== null) {
    assertOpaqueSecretReference(external.identity.credentialOrWorkloadIdentityRef, 'external identity reference');
  }

  if (['prepared_non_authoritative', 'authorized'].includes(external.authorizationStatus)) {
    assertNonEmptyString(external.manifestId, 'external.manifestId');
    assertNonEmptyString(external.ownerApprovalReference, 'external.ownerApprovalReference');
    assert.match(external.integrity.sha256, sha256Pattern);
    assert.equal(external.integrity.revocationReference, null);
    const validFrom = Date.parse(external.validFrom);
    const expiresAt = Date.parse(external.expiresAt);
    assert.ok(Number.isFinite(validFrom), 'external.validFrom invalid');
    assert.ok(validFrom <= now, 'external input is not valid yet');
    assert.ok(Number.isFinite(expiresAt) && expiresAt > validFrom && expiresAt > now, 'external input is expired or inverted');
    for (const key of ['effectClass', 'environment', 'purpose']) assertNonEmptyString(external[key], `external.${key}`);
    for (const key of ['allowedTicketsOrStage', 'allowedResources', 'allowedOperations', 'stopConditions']) {
      assert.ok(Array.isArray(external[key]) && external[key].length > 0, `external.${key} missing`);
      for (const value of external[key]) {
        assertNonEmptyString(value, `external.${key}`);
        assert.doesNotMatch(value, /[*?\[\]{}]/u, `external.${key}: wildcard forbidden`);
      }
    }
    for (const key of ['expectedBranch', 'expectedHead', 'ticketDocumentSha256']) {
      assertNonEmptyString(external.repositoryBinding[key], `repositoryBinding.${key}`);
    }
    assert.match(external.repositoryBinding.expectedHead, /^[a-f0-9]{40}$/u);
    assert.match(external.repositoryBinding.ticketDocumentSha256, sha256Pattern);
    assert.ok(external.repositoryBinding.authoritySha256.length > 0, 'authority hash bindings missing');
    for (const hash of external.repositoryBinding.authoritySha256) assert.match(hash, sha256Pattern);
    assert.ok(external.repositoryBinding.allowedPathPrefixes.length > 0, 'allowed path prefixes missing');
    assert.ok(external.repositoryBinding.allowedCommandIds.length > 0, 'allowed command IDs missing');
    for (const value of [...external.repositoryBinding.allowedPathPrefixes, ...external.repositoryBinding.allowedCommandIds]) {
      assertNonEmptyString(value, 'external repository allowlist entry');
      assert.doesNotMatch(value, /[*?\[\]{}]/u, 'external repository allowlist wildcard forbidden');
    }
    assertNonEmptyString(external.identity.principal, 'external.identity.principal');
    assertNonEmptyString(external.identity.runtimeIdentity, 'external.identity.runtimeIdentity');
    assertOpaqueSecretReference(external.identity.credentialOrWorkloadIdentityRef, 'external identity reference');
    assert.equal(external.identity.mfaOrInteractiveOwnerActionComplete, true);
    for (const key of ['maximumGrossTicketCostUsd', 'maximumConfiguredExposureUsdPerDay', 'maximumConfiguredExposureUsdPerMonth', 'maximumResidualExposureUsdPerDay']) {
      assertNonNegativeNumber(external.cost[key], `external.cost.${key}`);
    }
    if (external.cost.maximumGrossTicketCostUsd > 0 || external.cost.maximumConfiguredExposureUsdPerDay > 0) {
      assert.equal(external.cost.billingAlertsConfigured, true);
    }
    assert.ok(external.evidence.requiredOutputs.length > 0, 'external evidence outputs missing');
    assert.ok(external.evidence.redactionRules.length > 0, 'external redaction rules missing');
    const cleanupDeadline = Date.parse(external.cleanup.deadline);
    assert.ok(Number.isFinite(cleanupDeadline), 'external cleanup deadline invalid');
    assert.ok(cleanupDeadline > now && cleanupDeadline <= expiresAt, 'external cleanup deadline must be active and inside the input envelope');
    assertNonEmptyString(external.cleanup.exactProcedureRef, 'external.cleanup.exactProcedureRef');
    assertNonEmptyString(external.cleanup.unknownOutcomeProcedureRef, 'external.cleanup.unknownOutcomeProcedureRef');
  }
  if (external.authorizationStatus === 'authorized') {
    assert.fail('workspace external manifest cannot authorize an action: trusted owner-controlled signature and enforcement context is not implemented');
  }
  if (external.authorizationStatus === 'expired') {
    assert.ok(Number.isFinite(Date.parse(external.expiresAt)) && Date.parse(external.expiresAt) <= now, 'expired authority must have elapsed');
  }
  return external;
}

export function validateX402Template(x402) {
  validateX402Manifest(x402, { template: true });
  return x402;
}

export function validateX402Manifest(x402, { template = false, now = Date.now() } = {}) {
  assert.equal(x402.schemaVersion, 'clervo.x402-proof-authority.v1');
  assert.ok(['not_authorized', 'prepared_non_authoritative', 'authorized', 'revoked', 'expired'].includes(x402.authorizationStatus));
  if (template) assert.equal(x402.authorizationStatus, 'not_authorized');
  assert.equal(x402.authorityEffect, 'none_without_trusted_external_verifier_or_separate_explicit_owner_action');
  assert.equal(x402.integrity.canonicalization, 'RFC8785');
  assert.equal(x402.integrity.verificationStatus, 'not_verified_non_authoritative');
  if (x402.authorizationStatus === 'revoked') assert.equal(x402.integrity.revoked, true);
  else assert.equal(x402.integrity.revoked, false);
  assert.equal(x402.receiver.privateKeyRequiredOrAccepted, false);
  assert.equal(x402.payment.protocolVersion, 'x402-v2');
  assert.equal(x402.payment.scheme, 'exact');
  assert.equal(x402.payment.assetName, 'USDC');
  assert.equal(x402.payment.maximumExecutionCount, 1);
  assert.ok(x402.payment.maximumTotalUsdc <= 0.01);
  assert.ok(x402.payment.minimumUntouchedContingencyUsdc >= 0.02);
  for (const key of [
    'obtainAndCompare402BeforeSigning',
    'safeTransactionIdentifierOnly',
    'verifyUsefulResult',
    'verifySettlementAndBalancedLedger',
    'verifyReceiptAndExplorerEvidence',
    'replaySameIdempotencyKeyWithoutCharge',
    'recordExactSpendAndRemainingBalance',
    'ownerFundedProofIsNotDemandOrRevenue',
  ]) assert.equal(x402.evidence[key], true, `x402 evidence.${key} must remain enabled`);
  assert.equal(x402.safety.unknownSettlementAction, 'quarantine_and_reconcile_without_new_authorization');
  assert.equal(x402.safety.newAuthorizationAfterUnknownSettlementAllowed, false);
  if (x402.facilitator.credentialRef !== null) assertOpaqueSecretReference(x402.facilitator.credentialRef, 'x402 facilitator credential');

  if (['prepared_non_authoritative', 'authorized'].includes(x402.authorizationStatus)) {
    assert.match(x402.ticketId, ticketIdPattern);
    for (const key of ['environment', 'ownerApprovalReference']) assertNonEmptyString(x402[key], `x402.${key}`);
    assert.match(x402.integrity.sha256, sha256Pattern);
    assert.equal(x402.integrity.revocationReference, null);
    const validFrom = Date.parse(x402.validFrom);
    const expiresAt = Date.parse(x402.expiresAt);
    assert.ok(Number.isFinite(validFrom), 'x402.validFrom invalid');
    assert.ok(validFrom <= now, 'x402 input is not valid yet');
    assert.ok(Number.isFinite(expiresAt) && expiresAt > validFrom && expiresAt > now, 'x402 input is expired or inverted');
    for (const key of ['releaseId', 'origin', 'productId', 'operationId', 'route', 'usefulResultAcceptanceRef']) {
      assertNonEmptyString(x402.deployment[key], `x402.deployment.${key}`);
    }
    assertNonEmptyString(x402.receiver.publicPayToAddress, 'x402.receiver.publicPayToAddress');
    assert.equal(x402.receiver.ownerControlAttested, true);
    assertNonEmptyString(x402.payer.publicAddress, 'x402.payer.publicAddress');
    assert.equal(x402.payer.differentFromReceiver, true);
    assert.notEqual(x402.payer.publicAddress, x402.receiver.publicPayToAddress);
    assertRestrictedSignerReference(x402.payer.oneShotRestrictedSignerRef, 'x402 payer signer');
    assertNonEmptyString(x402.payer.signerPolicyAttestationRef, 'x402.payer.signerPolicyAttestationRef');
    assert.match(x402.payer.balanceCapAtomic, /^\d+$/u);

    assert.match(x402.payment.networkCaip2, /^[a-z0-9-]+:[A-Za-z0-9-]+$/u);
    assertNonEmptyString(x402.payment.assetContractOrMint, 'x402.payment.assetContractOrMint');
    assert.equal(x402.payment.assetDecimals, 6, 'USDC proof must declare six atomic decimals');
    assert.match(x402.payment.exactAmountAtomic, /^[1-9]\d*$/u);
    assert.match(x402.payment.maximumTotalAmountAtomic, /^[1-9]\d*$/u);
    assert.ok(BigInt(x402.payment.exactAmountAtomic) <= BigInt(x402.payment.maximumTotalAmountAtomic));
    assert.ok(BigInt(x402.payer.balanceCapAtomic) >= BigInt(x402.payment.maximumTotalAmountAtomic), 'payer balance cap is below total authorization');
    const atomicCeiling = BigInt(Math.round(x402.payment.maximumTotalUsdc * (10 ** x402.payment.assetDecimals)));
    assert.ok(BigInt(x402.payment.maximumTotalAmountAtomic) <= atomicCeiling, 'x402 atomic total exceeds USDC ceiling');
    for (const key of ['maximumNetworkFeeUsd', 'maximumFacilitatorFeeUsd', 'maximumInfrastructureCostUsd']) {
      assertNonNegativeNumber(x402.payment[key], `x402.payment.${key}`);
    }
    assert.ok(Number.isInteger(x402.payment.quoteExpiryLimitSeconds) && x402.payment.quoteExpiryLimitSeconds > 0);

    assertNonEmptyString(x402.facilitator.identity, 'x402.facilitator.identity');
    assert.match(x402.facilitator.url, /^https:\/\//u);
    assert.ok(Number.isFinite(Date.parse(x402.facilitator.supportedSchemeNetworkAssetVerifiedAt)), 'facilitator verification date invalid');
    assertNonEmptyString(x402.facilitator.termsAcceptedReference, 'x402.facilitator.termsAcceptedReference');
    for (const key of ['requestHashProcedureRef', 'idempotencyKeyProcedureRef', 'nonceProcedureRef', 'operationStateAndLedgerRef']) {
      assertNonEmptyString(x402.requestIdentity[key], `x402.requestIdentity.${key}`);
    }
    for (const key of ['killSwitchRef', 'alertReadinessRef', 'reconciliationProcedureRef']) {
      assertNonEmptyString(x402.safety[key], `x402.safety.${key}`);
    }
    assert.ok(Array.isArray(x402.stopConditions) && x402.stopConditions.length > 0, 'x402 stop conditions missing');
  }
  if (x402.authorizationStatus === 'authorized') {
    assert.fail('workspace x402 manifest cannot authorize payment: trusted owner-controlled signature and enforcement context is not implemented');
  }
  if (x402.authorizationStatus === 'expired') {
    assert.ok(Number.isFinite(Date.parse(x402.expiresAt)) && Date.parse(x402.expiresAt) <= now, 'expired x402 authority must have elapsed');
  }
  return x402;
}

export function validateAuthoritySources(sources) {
  const required = [sources.agents, sources.autonomy, sources.productAuthority, sources.master];
  for (const source of required) assert.match(source, /NPLAN\.4/u, 'NPLAN.4 authority missing');
  assert.match(sources.agents, /fresh\s+dispatch cycle/iu);
  assert.match(sources.agents, /exact ticket/iu);
  assert.match(sources.autonomy, /USD 0/iu);
  assert.match(sources.autonomy, /workspace JSON is non-authoritative/iu);
  assert.match(sources.productAuthority, /receiver[\s\S]{0,100}public/iu);
  assert.match(sources.productAuthority, /validators reject `authorized`/iu);
  assert.match(sources.master, /without repeated owner approval/iu);
  assert.match(sources.master, /workspace manifests are non-authoritative/iu);
  return sources;
}

export async function loadAutonomousCompletionInputs(root = repositoryRoot) {
  const read = (relative) => readFile(path.join(root, relative), 'utf8');
  const readJson = async (relative) => JSON.parse(await read(relative));
  const [policy, state, owner, external, x402, agents, autonomy, productAuthority, master] = await Promise.all([
    readJson('infra/control-plane/autonomous-completion-policy.v1.json'),
    readJson('infra/control-plane/autonomous-dispatch-state.json'),
    readJson('docs/templates/CLERVO-OWNER-INPUTS.template.json'),
    readJson('docs/templates/CLERVO-EXTERNAL-ACTION-AUTHORITY.template.json'),
    readJson('docs/templates/CLERVO-X402-PROOF-AUTHORITY.template.json'),
    read('AGENTS.md'),
    read('.codex-autonomy-policy.md'),
    read('docs/product/CLERVO-LIVE-INTELLIGENCE-LAUNCH-AUTHORITY.md'),
    readFile('/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md', 'utf8'),
  ]);
  return { policy, state, owner, external, x402, sources: { agents, autonomy, productAuthority, master } };
}

async function main() {
  const { policy, state, owner, external, x402, sources } = await loadAutonomousCompletionInputs();
  validateCompletionPolicy(policy);
  validateDispatchState(state, policy);
  validateOwnerInputsTemplate(owner);
  validateExternalActionTemplate(external);
  validateX402Template(x402);
  validateAuthoritySources(sources);
  console.log('autonomous completion authority: PASS');
  console.log(`owner-only intake groups: ${Object.keys(owner.inputs).length}`);
  console.log('per-ticket owner approval: false');
  console.log('mandatory third-party API cash spend: USD 0');
  console.log(`trusted external manifest admission: ${policy.trustedExternalAuthorityEnforcement.status}`);
  console.log(`real payment authorized: ${state.currentTruth.realPaymentAuthorized}`);
  console.log(`next local ticket: ${state.nextTicket?.id ?? 'none'}`);

  const args = process.argv.slice(2);
  const manifestKind = args[0]?.startsWith('--') ? args[0] : '--owner-manifest';
  const manifestPath = args[0]?.startsWith('--') ? args[1] : args[0];
  if (args[0]?.startsWith('--') && !manifestPath) throw new Error(`${manifestKind}: manifest path required`);
  if (manifestPath && manifestKind === '--owner-manifest') {
    const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'));
    validateOwnerInputsManifest(manifest);
    const statuses = Object.values(manifest.inputs).map(({ status }) => status);
    console.log(`owner manifest groups ready: ${statuses.filter((status) => status === 'ready').length}`);
    console.log(`owner manifest groups missing: ${statuses.filter((status) => status === 'missing').length}`);
    console.log(`owner manifest groups not required: ${statuses.filter((status) => status === 'not_required').length}`);
  }
  if (manifestPath && manifestKind === '--external-manifest') {
    const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'));
    validateExternalActionManifest(manifest);
    console.log(`external input status: ${manifest.authorizationStatus}`);
  }
  if (manifestPath && manifestKind === '--x402-manifest') {
    const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'));
    validateX402Manifest(manifest);
    console.log(`x402 input status: ${manifest.authorizationStatus}`);
  }
  if (manifestPath && !['--owner-manifest', '--external-manifest', '--x402-manifest'].includes(manifestKind)) {
    throw new Error(`unknown manifest kind: ${manifestKind}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`autonomous completion authority: FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
