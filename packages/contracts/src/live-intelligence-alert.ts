import {
  comparisonChangedFields,
  verifyLiveIntelligenceComparison,
  type ComparisonChangedField,
  type ComparisonEventType,
  type LiveIntelligenceComparisonReport,
} from './live-intelligence-comparison.js';
import {
  verifyLiveIntelligenceMonitorSnapshot,
  type LiveIntelligenceMonitorSnapshot,
} from './live-intelligence-monitor.js';
import { hashJson } from './receipt.js';
import type { JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export const LIVE_INTELLIGENCE_ALERT_POLICY_SCHEMA_VERSION = 'live-intelligence-alert-policy.v1' as const;
export const LIVE_INTELLIGENCE_CHANGE_ALERT_SCHEMA_VERSION = 'live-intelligence-change-alert.v1' as const;

export const liveIntelligenceAlertSeverities = ['info', 'warning', 'critical'] as const;
export type LiveIntelligenceAlertSeverity = (typeof liveIntelligenceAlertSeverities)[number];

export interface LiveIntelligenceAlertPolicy {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof LIVE_INTELLIGENCE_ALERT_POLICY_SCHEMA_VERSION;
  policyId: string;
  monitorId: string;
  eventTypes: readonly ComparisonEventType[];
  changedFields: readonly ComparisonChangedField[];
  minimumMatchingEvents: number;
  severity: LiveIntelligenceAlertSeverity;
  deliveryMode: 'record_only';
  createdAt: string;
  policyHash: string;
}

export interface LiveIntelligenceChangeAlert {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof LIVE_INTELLIGENCE_CHANGE_ALERT_SCHEMA_VERSION;
  alertId: string;
  policyId: string;
  policyHash: string;
  monitorId: string;
  comparisonId: string;
  comparisonHash: string;
  baselineSnapshotId: string;
  currentSnapshotId: string;
  triggeredAt: string;
  severity: LiveIntelligenceAlertSeverity;
  matchingChangeIds: readonly string[];
  deliveryState: 'not_delivered';
  alertHash: string;
}

export interface CreateLiveIntelligenceAlertPolicyInput {
  policyId: string;
  monitorId: string;
  eventTypes: readonly ComparisonEventType[];
  changedFields: readonly ComparisonChangedField[];
  minimumMatchingEvents: number;
  severity: LiveIntelligenceAlertSeverity;
  createdAt: string;
}

type UnsignedPolicy = Omit<LiveIntelligenceAlertPolicy, 'policyHash'>;
type UnsignedAlert = Omit<LiveIntelligenceChangeAlert, 'alertHash'>;

const eventTypeOrder: readonly ComparisonEventType[] = ['added', 'modified', 'removed'];

function freezeDeep<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    for (const entry of value) freezeDeep(entry);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) freezeDeep(entry);
    return Object.freeze(value);
  }
  return value;
}

function hash(value: object): string {
  return hashJson(value as unknown as JsonValue);
}

function timestamp(value: string, name: string): void {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError(`invalid_${name}`);
}

function normalizedSubset<T extends string>(values: readonly T[], allowed: readonly T[], name: string): T[] {
  const unique = [...new Set(values)];
  if (unique.length === 0 || unique.some((value) => !allowed.includes(value))) throw new TypeError(`invalid_${name}`);
  return allowed.filter((value) => unique.includes(value));
}

function assertPolicy(policy: LiveIntelligenceAlertPolicy): void {
  if (policy.contractVersion !== CONTRACT_VERSION || policy.schemaVersion !== LIVE_INTELLIGENCE_ALERT_POLICY_SCHEMA_VERSION) throw new TypeError('alert_policy_version_invalid');
  if (!/^alpol_[A-Za-z0-9]{20,64}$/u.test(policy.policyId) || !/^mon_[A-Za-z0-9]{20,64}$/u.test(policy.monitorId)) throw new TypeError('alert_policy_identity_invalid');
  if (JSON.stringify(policy.eventTypes) !== JSON.stringify(normalizedSubset(policy.eventTypes, eventTypeOrder, 'alert_event_types'))) throw new TypeError('alert_event_types_not_canonical');
  if (JSON.stringify(policy.changedFields) !== JSON.stringify(normalizedSubset(policy.changedFields, comparisonChangedFields, 'alert_changed_fields'))) throw new TypeError('alert_changed_fields_not_canonical');
  if (!Number.isInteger(policy.minimumMatchingEvents) || policy.minimumMatchingEvents < 1 || policy.minimumMatchingEvents > 100) throw new TypeError('alert_minimum_events_invalid');
  if (!liveIntelligenceAlertSeverities.includes(policy.severity) || policy.deliveryMode !== 'record_only') throw new TypeError('alert_policy_delivery_invalid');
  timestamp(policy.createdAt, 'alert_policy_created_at');
  const { policyHash, ...unsigned } = policy;
  if (policyHash !== hash(unsigned)) throw new TypeError('alert_policy_hash_invalid');
}

export function createLiveIntelligenceAlertPolicy(
  input: CreateLiveIntelligenceAlertPolicyInput,
): Readonly<LiveIntelligenceAlertPolicy> {
  const unsigned: UnsignedPolicy = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: LIVE_INTELLIGENCE_ALERT_POLICY_SCHEMA_VERSION,
    policyId: input.policyId,
    monitorId: input.monitorId,
    eventTypes: normalizedSubset(input.eventTypes, eventTypeOrder, 'alert_event_types'),
    changedFields: normalizedSubset(input.changedFields, comparisonChangedFields, 'alert_changed_fields'),
    minimumMatchingEvents: input.minimumMatchingEvents,
    severity: input.severity,
    deliveryMode: 'record_only',
    createdAt: input.createdAt,
  };
  const policy = { ...unsigned, policyHash: hash(unsigned) };
  assertPolicy(policy);
  return freezeDeep(policy);
}

export function verifyLiveIntelligenceAlertPolicy(policy: LiveIntelligenceAlertPolicy): boolean {
  try { assertPolicy(policy); return true; } catch { return false; }
}

function assertComparisonLineage(
  policy: LiveIntelligenceAlertPolicy,
  comparison: LiveIntelligenceComparisonReport,
  baseline: LiveIntelligenceMonitorSnapshot,
  current: LiveIntelligenceMonitorSnapshot,
): void {
  assertPolicy(policy);
  if (!verifyLiveIntelligenceComparison(comparison) || !verifyLiveIntelligenceMonitorSnapshot(baseline) || !verifyLiveIntelligenceMonitorSnapshot(current)) throw new TypeError('alert_evidence_invalid');
  if (policy.monitorId !== baseline.monitorId || policy.monitorId !== current.monitorId) throw new TypeError('alert_monitor_mismatch');
  if (current.previousSnapshotId !== baseline.snapshotId || current.previousSnapshotHash !== baseline.snapshotHash || current.sequence !== baseline.sequence + 1) throw new TypeError('alert_snapshot_lineage_invalid');
  if (comparison.baseline.operationId !== baseline.searchOperationId || comparison.baseline.generatedAt !== baseline.searchGeneratedAt || comparison.baseline.evidenceSetHash !== baseline.evidenceSetHash) throw new TypeError('alert_baseline_mismatch');
  if (comparison.current.operationId !== current.searchOperationId || comparison.current.generatedAt !== current.searchGeneratedAt || comparison.current.evidenceSetHash !== current.evidenceSetHash) throw new TypeError('alert_current_mismatch');
}

export function evaluateLiveIntelligenceChangeAlert(input: {
  policy: LiveIntelligenceAlertPolicy;
  comparison: LiveIntelligenceComparisonReport;
  baseline: LiveIntelligenceMonitorSnapshot;
  current: LiveIntelligenceMonitorSnapshot;
}): Readonly<LiveIntelligenceChangeAlert> | null {
  assertComparisonLineage(input.policy, input.comparison, input.baseline, input.current);
  const matching = input.comparison.events.filter((event) => input.policy.eventTypes.includes(event.type)
    && event.changedFields.some((field) => input.policy.changedFields.includes(field)));
  if (matching.length < input.policy.minimumMatchingEvents) return null;
  const matchingChangeIds = matching.map(({ changeId }) => changeId);
  const alertSeed = hash({ comparisonHash: input.comparison.reportHash, matchingChangeIds, policyHash: input.policy.policyHash });
  const unsigned: UnsignedAlert = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: LIVE_INTELLIGENCE_CHANGE_ALERT_SCHEMA_VERSION,
    alertId: `lialert_${alertSeed.slice('sha256:'.length, 'sha256:'.length + 32)}`,
    policyId: input.policy.policyId,
    policyHash: input.policy.policyHash,
    monitorId: input.policy.monitorId,
    comparisonId: input.comparison.comparisonId,
    comparisonHash: input.comparison.reportHash,
    baselineSnapshotId: input.baseline.snapshotId,
    currentSnapshotId: input.current.snapshotId,
    triggeredAt: input.current.capturedAt,
    severity: input.policy.severity,
    matchingChangeIds,
    deliveryState: 'not_delivered',
  };
  return freezeDeep({ ...unsigned, alertHash: hash(unsigned) });
}

export function verifyLiveIntelligenceChangeAlert(alert: LiveIntelligenceChangeAlert): boolean {
  try {
    timestamp(alert.triggeredAt, 'change_alert_triggered_at');
    if (alert.contractVersion !== CONTRACT_VERSION || alert.schemaVersion !== LIVE_INTELLIGENCE_CHANGE_ALERT_SCHEMA_VERSION) return false;
    if (!/^lialert_[A-Za-z0-9]{32}$/u.test(alert.alertId) || alert.deliveryState !== 'not_delivered' || !liveIntelligenceAlertSeverities.includes(alert.severity)) return false;
    if (!/^alpol_[A-Za-z0-9]{20,64}$/u.test(alert.policyId) || !/^mon_[A-Za-z0-9]{20,64}$/u.test(alert.monitorId) || !/^cmp_[A-Za-z0-9]{32}$/u.test(alert.comparisonId)) return false;
    if (!/^snap_[A-Za-z0-9]{32}$/u.test(alert.baselineSnapshotId) || !/^snap_[A-Za-z0-9]{32}$/u.test(alert.currentSnapshotId) || !/^sha256:[a-f0-9]{64}$/u.test(alert.policyHash) || !/^sha256:[a-f0-9]{64}$/u.test(alert.comparisonHash)) return false;
    if (alert.matchingChangeIds.length === 0 || new Set(alert.matchingChangeIds).size !== alert.matchingChangeIds.length || alert.matchingChangeIds.some((id) => !/^chg_[A-Za-z0-9]{32}$/u.test(id))) return false;
    const { alertHash, ...unsigned } = alert;
    return alertHash === hash(unsigned);
  } catch { return false; }
}
