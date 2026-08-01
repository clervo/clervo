import { createHash } from 'node:crypto';

const terminalOperationStates = new Set(['completed', 'not_found']);
const nonBlockingResourceStates = new Set(['absent', 'deleted', 'provider_managed_audit_history']);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};
const canonical = (value) => JSON.stringify(canonicalize(value));
const digest = (value) => `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;

function finiteNonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${label}_invalid`);
  return value;
}

export function evaluateExclusiveResourceAdmission(input, { now = new Date() } = {}) {
  if (input?.schemaVersion !== 'clervo.n4.27t.resource-admission.v1' || input.ticket !== 'N4.27T') throw new Error('resource_admission_schema_invalid');
  const observedAt = Date.parse(input.inventory?.observedAt);
  const expiresAt = Date.parse(input.inventory?.expiresAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(observedAt) || !Number.isFinite(expiresAt) || observedAt > nowMs || expiresAt < nowMs || expiresAt - observedAt > 120_000) {
    throw new Error('resource_inventory_stale_or_invalid');
  }
  if (input.inventory.complete !== true || input.inventory.unknownResourceCount !== 0 || input.inventory.zeroResourceVerification?.proven !== true) {
    throw new Error('resource_inventory_not_zero_and_complete');
  }
  if (!Array.isArray(input.inventory.resources) || !Array.isArray(input.inventory.operations) || !Array.isArray(input.candidateResources)) {
    throw new Error('resource_admission_arrays_required');
  }
  for (const resource of input.inventory.resources) {
    if (resource.ticket !== 'N4.27T' || typeof resource.resourceId !== 'string' || resource.resourceId.length < 3) throw new Error('resource_inventory_identity_invalid');
    finiteNonNegative(resource.dailyExposureUsd, 'resource_daily_exposure');
    if (!nonBlockingResourceStates.has(resource.state)) throw new Error(`resource_overlap_present:${resource.resourceId}`);
    if (resource.state === 'provider_managed_audit_history' && (resource.chargeable !== false || resource.dailyExposureUsd !== 0)) throw new Error('provider_audit_history_must_be_nonchargeable');
  }
  for (const operation of input.inventory.operations) {
    if (operation.ticket !== 'N4.27T' || typeof operation.operationId !== 'string' || !terminalOperationStates.has(operation.state)) {
      throw new Error(`resource_operation_pending_or_unknown:${operation.operationId ?? 'unknown'}`);
    }
  }
  if (input.candidateResources.length === 0) throw new Error('candidate_resource_plan_empty');
  const candidateIds = new Set();
  let candidateDailyExposureUsd = 0;
  for (const candidate of input.candidateResources) {
    if (candidate.ticket !== 'N4.27T' || candidate.environment !== 'isolated_qualification' || candidate.exactlyNamed !== true || candidate.chargeable !== true) {
      throw new Error('candidate_resource_identity_or_label_invalid');
    }
    if (candidateIds.has(candidate.resourceId)) throw new Error('candidate_resource_duplicate');
    candidateIds.add(candidate.resourceId);
    candidateDailyExposureUsd += finiteNonNegative(candidate.dailyExposureUsd, 'candidate_daily_exposure');
  }
  const dailyExposureCeilingUsd = finiteNonNegative(input.dailyExposureCeilingUsd, 'daily_exposure_ceiling');
  if (candidateDailyExposureUsd > dailyExposureCeilingUsd) throw new Error('candidate_daily_exposure_ceiling_exceeded');
  if (input.deleteCommandMayUseAsync !== false || input.createMayBeginBeforeZeroInventory !== false || input.unknownOutcomeAction !== 'stop_reconcile_and_do_not_create') {
    throw new Error('resource_overlap_policy_weakened');
  }
  return Object.freeze({
    schemaVersion: 'clervo.n4.27t.resource-admission-receipt.v1',
    ticket: 'N4.27T',
    decision: 'admitted_for_separately_authorized_external_action_only',
    inventoryObservedAt: input.inventory.observedAt,
    inventoryExpiresAt: input.inventory.expiresAt,
    candidateResourceCount: input.candidateResources.length,
    candidateDailyExposureUsd: Number(candidateDailyExposureUsd.toFixed(6)),
    dailyExposureCeilingUsd,
    inputSha256: digest(input),
    externalActionAuthorized: false,
  });
}
