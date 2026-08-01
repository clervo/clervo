import { hashJson } from './receipt.js';
import {
  liveIntelligenceEvidenceSetHash,
  liveIntelligenceQueryIdentityHash,
} from './live-intelligence-comparison.js';
import type { SearchResponse } from './search.js';
import type { JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export const LIVE_INTELLIGENCE_MONITOR_DEFINITION_SCHEMA_VERSION = 'live-intelligence-monitor-definition.v1' as const;
export const LIVE_INTELLIGENCE_MONITOR_STATE_SCHEMA_VERSION = 'live-intelligence-monitor-state.v1' as const;
export const LIVE_INTELLIGENCE_MONITOR_SNAPSHOT_SCHEMA_VERSION = 'live-intelligence-monitor-snapshot.v1' as const;

export type LiveIntelligenceMonitorStatus = 'active' | 'archived' | 'paused';

export interface LiveIntelligenceMonitorDefinition {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof LIVE_INTELLIGENCE_MONITOR_DEFINITION_SCHEMA_VERSION;
  monitorId: string;
  revision: number;
  query: {
    text: string;
    language: string;
    region: string;
    identityHash: string;
  };
  schedule: {
    anchorAt: string;
    intervalSeconds: number;
  };
  retention: {
    maximumSnapshots: number;
    maximumAgeSeconds: number;
  };
  createdAt: string;
  definitionHash: string;
}

export interface LiveIntelligenceMonitorState {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof LIVE_INTELLIGENCE_MONITOR_STATE_SCHEMA_VERSION;
  monitorId: string;
  definitionRevision: number;
  definitionHash: string;
  stateRevision: number;
  status: LiveIntelligenceMonitorStatus;
  nextRunAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastSnapshotId: string | null;
  lastSnapshotHash: string | null;
  snapshotCount: number;
  consecutiveFailures: number;
  updatedAt: string;
  stateHash: string;
}

export interface LiveIntelligenceMonitorSnapshot {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof LIVE_INTELLIGENCE_MONITOR_SNAPSHOT_SCHEMA_VERSION;
  monitorId: string;
  definitionRevision: number;
  definitionHash: string;
  snapshotId: string;
  sequence: number;
  capturedAt: string;
  searchOperationId: string;
  searchGeneratedAt: string;
  queryIdentityHash: string;
  evidenceSetHash: string;
  previousSnapshotId: string | null;
  previousSnapshotHash: string | null;
  searchResponse: Readonly<SearchResponse>;
  snapshotHash: string;
}

export interface CreateLiveIntelligenceMonitorDefinitionInput {
  monitorId: string;
  query: string;
  language: string;
  region: string;
  anchorAt: string;
  intervalSeconds: number;
  maximumSnapshots: number;
  maximumAgeSeconds: number;
  createdAt: string;
}

export interface LiveIntelligenceMonitorAppendResult {
  snapshot: Readonly<LiveIntelligenceMonitorSnapshot>;
  state: Readonly<LiveIntelligenceMonitorState>;
}

type UnsignedDefinition = Omit<LiveIntelligenceMonitorDefinition, 'definitionHash'>;
type UnsignedState = Omit<LiveIntelligenceMonitorState, 'stateHash'>;
type UnsignedSnapshot = Omit<LiveIntelligenceMonitorSnapshot, 'snapshotHash'>;

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

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError(`invalid_${name}`);
  return parsed;
}

function hash(value: object): string {
  return hashJson(value as unknown as JsonValue);
}

function assertMonitorId(value: string): void {
  if (!/^mon_[A-Za-z0-9]{20,64}$/u.test(value)) throw new TypeError('invalid_monitor_id');
}

function assertDefinition(definition: LiveIntelligenceMonitorDefinition): void {
  assertMonitorId(definition.monitorId);
  if (definition.contractVersion !== CONTRACT_VERSION || definition.schemaVersion !== LIVE_INTELLIGENCE_MONITOR_DEFINITION_SCHEMA_VERSION) throw new TypeError('monitor_definition_version_invalid');
  if (!Number.isInteger(definition.revision) || definition.revision < 1) throw new TypeError('monitor_definition_revision_invalid');
  if (definition.query.text.length === 0 || definition.query.text.length > 2_000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(definition.query.text)) throw new TypeError('monitor_query_invalid');
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(definition.query.language) || !/^[A-Z]{2}$/u.test(definition.query.region)) throw new TypeError('monitor_locale_invalid');
  const expectedIdentityHash = hash({ language: definition.query.language, region: definition.query.region, text: definition.query.text });
  if (definition.query.identityHash !== expectedIdentityHash) throw new TypeError('monitor_query_identity_invalid');
  const createdAt = timestamp(definition.createdAt, 'monitor_created_at');
  const anchorAt = timestamp(definition.schedule.anchorAt, 'monitor_anchor_at');
  if (anchorAt < createdAt) throw new TypeError('monitor_anchor_before_creation');
  if (!Number.isInteger(definition.schedule.intervalSeconds) || definition.schedule.intervalSeconds < 60 || definition.schedule.intervalSeconds > 2_592_000) throw new TypeError('monitor_interval_invalid');
  if (!Number.isInteger(definition.retention.maximumSnapshots) || definition.retention.maximumSnapshots < 2 || definition.retention.maximumSnapshots > 10_000) throw new TypeError('monitor_retention_count_invalid');
  if (!Number.isInteger(definition.retention.maximumAgeSeconds) || definition.retention.maximumAgeSeconds < definition.schedule.intervalSeconds || definition.retention.maximumAgeSeconds > 31_536_000) throw new TypeError('monitor_retention_age_invalid');
  const { definitionHash, ...unsigned } = definition;
  if (definitionHash !== hash(unsigned)) throw new TypeError('monitor_definition_hash_invalid');
}

function assertState(definition: LiveIntelligenceMonitorDefinition, state: LiveIntelligenceMonitorState): void {
  assertDefinition(definition);
  if (state.contractVersion !== CONTRACT_VERSION || state.schemaVersion !== LIVE_INTELLIGENCE_MONITOR_STATE_SCHEMA_VERSION) throw new TypeError('monitor_state_version_invalid');
  if (state.monitorId !== definition.monitorId || state.definitionRevision !== definition.revision || state.definitionHash !== definition.definitionHash) throw new TypeError('monitor_state_definition_mismatch');
  if (!['active', 'archived', 'paused'].includes(state.status)) throw new TypeError('monitor_state_status_invalid');
  if (!Number.isInteger(state.stateRevision) || state.stateRevision < 1 || !Number.isInteger(state.snapshotCount) || state.snapshotCount < 0 || !Number.isInteger(state.consecutiveFailures) || state.consecutiveFailures < 0) throw new TypeError('monitor_state_counter_invalid');
  const updatedAt = timestamp(state.updatedAt, 'monitor_state_updated_at');
  if (updatedAt < Date.parse(definition.createdAt)) throw new TypeError('monitor_state_before_definition');
  const nextRunAt = state.nextRunAt === null ? null : timestamp(state.nextRunAt, 'monitor_next_run_at');
  const lastAttemptAt = state.lastAttemptAt === null ? null : timestamp(state.lastAttemptAt, 'monitor_last_attempt_at');
  const lastSuccessAt = state.lastSuccessAt === null ? null : timestamp(state.lastSuccessAt, 'monitor_last_success_at');
  if (lastAttemptAt !== null && lastAttemptAt > updatedAt) throw new TypeError('monitor_last_attempt_from_future');
  if (lastSuccessAt !== null && (lastAttemptAt === null || lastSuccessAt > lastAttemptAt)) throw new TypeError('monitor_last_success_invalid');
  if (nextRunAt !== null && lastAttemptAt !== null && nextRunAt <= lastAttemptAt) throw new TypeError('monitor_next_run_not_increasing');
  if (state.status === 'active' && state.nextRunAt === null) throw new TypeError('active_monitor_missing_next_run');
  if (state.status !== 'active' && state.nextRunAt !== null) throw new TypeError('inactive_monitor_has_next_run');
  if (state.snapshotCount === 0 && (state.lastSnapshotId !== null || state.lastSnapshotHash !== null || state.lastSuccessAt !== null)) throw new TypeError('empty_monitor_has_snapshot_lineage');
  if (state.snapshotCount > 0 && (state.lastSnapshotId === null || state.lastSnapshotHash === null || state.lastSuccessAt === null)) throw new TypeError('monitor_snapshot_lineage_missing');
  const { stateHash, ...unsigned } = state;
  if (stateHash !== hash(unsigned)) throw new TypeError('monitor_state_hash_invalid');
}

function nextScheduledAt(definition: LiveIntelligenceMonitorDefinition, after: string, inclusive: boolean): string {
  const anchor = timestamp(definition.schedule.anchorAt, 'monitor_anchor_at');
  const afterMs = timestamp(after, 'monitor_schedule_after');
  const intervalMs = definition.schedule.intervalSeconds * 1_000;
  if (afterMs < anchor || (inclusive && afterMs === anchor)) return definition.schedule.anchorAt;
  const elapsed = afterMs - anchor;
  const intervals = Math.floor(elapsed / intervalMs) + (inclusive && elapsed % intervalMs === 0 ? 0 : 1);
  return new Date(anchor + intervals * intervalMs).toISOString();
}

function stateWithHash(unsigned: UnsignedState): Readonly<LiveIntelligenceMonitorState> {
  return freezeDeep({ ...unsigned, stateHash: hash(unsigned) });
}

function unsignedState(
  state: LiveIntelligenceMonitorState,
  changes: Partial<UnsignedState>,
): UnsignedState {
  const { stateHash: _stateHash, ...current } = state;
  return { ...current, ...changes };
}

export function createLiveIntelligenceMonitorDefinition(
  input: CreateLiveIntelligenceMonitorDefinitionInput,
): Readonly<LiveIntelligenceMonitorDefinition> {
  const queryIdentityHash = hash({ language: input.language, region: input.region, text: input.query });
  const unsigned: UnsignedDefinition = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: LIVE_INTELLIGENCE_MONITOR_DEFINITION_SCHEMA_VERSION,
    monitorId: input.monitorId,
    revision: 1,
    query: { text: input.query, language: input.language, region: input.region, identityHash: queryIdentityHash },
    schedule: { anchorAt: input.anchorAt, intervalSeconds: input.intervalSeconds },
    retention: { maximumSnapshots: input.maximumSnapshots, maximumAgeSeconds: input.maximumAgeSeconds },
    createdAt: input.createdAt,
  };
  const definition = { ...unsigned, definitionHash: hash(unsigned) };
  assertDefinition(definition);
  return freezeDeep(definition);
}

export function verifyLiveIntelligenceMonitorDefinition(definition: LiveIntelligenceMonitorDefinition): boolean {
  try { assertDefinition(definition); return true; } catch { return false; }
}

export function createLiveIntelligenceMonitorState(
  definition: LiveIntelligenceMonitorDefinition,
): Readonly<LiveIntelligenceMonitorState> {
  assertDefinition(definition);
  return stateWithHash({
    contractVersion: CONTRACT_VERSION,
    schemaVersion: LIVE_INTELLIGENCE_MONITOR_STATE_SCHEMA_VERSION,
    monitorId: definition.monitorId,
    definitionRevision: definition.revision,
    definitionHash: definition.definitionHash,
    stateRevision: 1,
    status: 'active',
    nextRunAt: definition.schedule.anchorAt,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastSnapshotId: null,
    lastSnapshotHash: null,
    snapshotCount: 0,
    consecutiveFailures: 0,
    updatedAt: definition.createdAt,
  });
}

export function verifyLiveIntelligenceMonitorState(
  definition: LiveIntelligenceMonitorDefinition,
  state: LiveIntelligenceMonitorState,
): boolean {
  try { assertState(definition, state); return true; } catch { return false; }
}

export function liveIntelligenceMonitorDue(
  definition: LiveIntelligenceMonitorDefinition,
  state: LiveIntelligenceMonitorState,
  at: string,
): boolean {
  assertState(definition, state);
  const atMs = timestamp(at, 'monitor_due_at');
  return state.status === 'active' && state.nextRunAt !== null && atMs >= Date.parse(state.nextRunAt);
}

export function transitionLiveIntelligenceMonitorStatus(input: {
  definition: LiveIntelligenceMonitorDefinition;
  state: LiveIntelligenceMonitorState;
  expectedStateHash: string;
  status: LiveIntelligenceMonitorStatus;
  at: string;
}): Readonly<LiveIntelligenceMonitorState> {
  assertState(input.definition, input.state);
  if (input.expectedStateHash !== input.state.stateHash) throw new TypeError('monitor_state_compare_and_swap_failed');
  const atMs = timestamp(input.at, 'monitor_transition_at');
  if (atMs < Date.parse(input.state.updatedAt)) throw new TypeError('monitor_state_time_not_increasing');
  if (input.state.status === 'archived') throw new TypeError('archived_monitor_terminal');
  if (input.status === input.state.status) return input.state;
  return stateWithHash(unsignedState(input.state, {
    stateRevision: input.state.stateRevision + 1,
    status: input.status,
    nextRunAt: input.status === 'active' ? nextScheduledAt(input.definition, input.at, true) : null,
    updatedAt: input.at,
  }));
}

export function recordLiveIntelligenceMonitorFailure(input: {
  definition: LiveIntelligenceMonitorDefinition;
  state: LiveIntelligenceMonitorState;
  expectedStateHash: string;
  failedAt: string;
}): Readonly<LiveIntelligenceMonitorState> {
  assertState(input.definition, input.state);
  if (input.expectedStateHash !== input.state.stateHash) throw new TypeError('monitor_state_compare_and_swap_failed');
  if (timestamp(input.failedAt, 'monitor_failure_at') < Date.parse(input.state.updatedAt)) throw new TypeError('monitor_state_time_not_increasing');
  if (!liveIntelligenceMonitorDue(input.definition, input.state, input.failedAt)) throw new TypeError('monitor_attempt_not_due');
  return stateWithHash(unsignedState(input.state, {
    stateRevision: input.state.stateRevision + 1,
    nextRunAt: nextScheduledAt(input.definition, input.failedAt, false),
    lastAttemptAt: input.failedAt,
    consecutiveFailures: input.state.consecutiveFailures + 1,
    updatedAt: input.failedAt,
  }));
}

export function appendLiveIntelligenceMonitorSnapshot(input: {
  definition: LiveIntelligenceMonitorDefinition;
  state: LiveIntelligenceMonitorState;
  expectedStateHash: string;
  response: SearchResponse;
  capturedAt: string;
}): Readonly<LiveIntelligenceMonitorAppendResult> {
  assertState(input.definition, input.state);
  if (input.expectedStateHash !== input.state.stateHash) throw new TypeError('monitor_state_compare_and_swap_failed');
  if (!liveIntelligenceMonitorDue(input.definition, input.state, input.response.generatedAt)) throw new TypeError('monitor_attempt_not_due');
  const capturedAtMs = timestamp(input.capturedAt, 'monitor_snapshot_captured_at');
  if (capturedAtMs < Date.parse(input.response.generatedAt)) throw new TypeError('monitor_snapshot_captured_before_search');
  if (capturedAtMs < Date.parse(input.state.updatedAt)) throw new TypeError('monitor_state_time_not_increasing');
  const queryIdentityHash = liveIntelligenceQueryIdentityHash(input.response);
  if (queryIdentityHash !== input.definition.query.identityHash) throw new TypeError('monitor_snapshot_query_mismatch');
  const evidenceSetHash = liveIntelligenceEvidenceSetHash(input.response);
  const sequence = input.state.snapshotCount + 1;
  const snapshotSeed = hash({
    definitionHash: input.definition.definitionHash,
    evidenceSetHash,
    monitorId: input.definition.monitorId,
    previousSnapshotHash: input.state.lastSnapshotHash,
    searchOperationId: input.response.operationId,
    sequence,
  });
  const unsigned: UnsignedSnapshot = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: LIVE_INTELLIGENCE_MONITOR_SNAPSHOT_SCHEMA_VERSION,
    monitorId: input.definition.monitorId,
    definitionRevision: input.definition.revision,
    definitionHash: input.definition.definitionHash,
    snapshotId: `snap_${snapshotSeed.slice('sha256:'.length, 'sha256:'.length + 32)}`,
    sequence,
    capturedAt: input.capturedAt,
    searchOperationId: input.response.operationId,
    searchGeneratedAt: input.response.generatedAt,
    queryIdentityHash,
    evidenceSetHash,
    previousSnapshotId: input.state.lastSnapshotId,
    previousSnapshotHash: input.state.lastSnapshotHash,
    searchResponse: input.response,
  };
  const snapshot = freezeDeep({ ...unsigned, snapshotHash: hash(unsigned) });
  const state = stateWithHash(unsignedState(input.state, {
    stateRevision: input.state.stateRevision + 1,
    nextRunAt: nextScheduledAt(input.definition, input.response.generatedAt, false),
    lastAttemptAt: input.response.generatedAt,
    lastSuccessAt: input.response.generatedAt,
    lastSnapshotId: snapshot.snapshotId,
    lastSnapshotHash: snapshot.snapshotHash,
    snapshotCount: sequence,
    consecutiveFailures: 0,
    updatedAt: input.capturedAt,
  }));
  return freezeDeep({ snapshot, state });
}

export function verifyLiveIntelligenceMonitorSnapshot(snapshot: LiveIntelligenceMonitorSnapshot): boolean {
  try {
    assertMonitorId(snapshot.monitorId);
    timestamp(snapshot.capturedAt, 'monitor_snapshot_captured_at');
    timestamp(snapshot.searchGeneratedAt, 'monitor_snapshot_search_generated_at');
    if (Date.parse(snapshot.capturedAt) < Date.parse(snapshot.searchGeneratedAt)) return false;
    if (snapshot.contractVersion !== CONTRACT_VERSION || snapshot.schemaVersion !== LIVE_INTELLIGENCE_MONITOR_SNAPSHOT_SCHEMA_VERSION) return false;
    if (!Number.isInteger(snapshot.definitionRevision) || snapshot.definitionRevision < 1 || !Number.isInteger(snapshot.sequence) || snapshot.sequence < 1) return false;
    if (!/^snap_[A-Za-z0-9]{32}$/u.test(snapshot.snapshotId) || !/^op_[A-Za-z0-9]{20,64}$/u.test(snapshot.searchOperationId)) return false;
    if (snapshot.searchOperationId !== snapshot.searchResponse.operationId || snapshot.searchGeneratedAt !== snapshot.searchResponse.generatedAt) return false;
    if (snapshot.queryIdentityHash !== liveIntelligenceQueryIdentityHash(snapshot.searchResponse) || snapshot.evidenceSetHash !== liveIntelligenceEvidenceSetHash(snapshot.searchResponse)) return false;
    if (snapshot.sequence === 1 && (snapshot.previousSnapshotId !== null || snapshot.previousSnapshotHash !== null)) return false;
    if (snapshot.sequence > 1 && (snapshot.previousSnapshotId === null || snapshot.previousSnapshotHash === null)) return false;
    const { snapshotHash, ...unsigned } = snapshot;
    return snapshotHash === hash(unsigned);
  } catch { return false; }
}

export function verifyLiveIntelligenceMonitorLineage(
  definition: LiveIntelligenceMonitorDefinition,
  snapshots: readonly LiveIntelligenceMonitorSnapshot[],
): boolean {
  if (!verifyLiveIntelligenceMonitorDefinition(definition)) return false;
  for (const [index, snapshot] of snapshots.entries()) {
    if (!verifyLiveIntelligenceMonitorSnapshot(snapshot)) return false;
    if (snapshot.monitorId !== definition.monitorId || snapshot.definitionHash !== definition.definitionHash || snapshot.definitionRevision !== definition.revision || snapshot.queryIdentityHash !== definition.query.identityHash) return false;
    if (snapshot.sequence !== index + 1) return false;
    const previous = snapshots[index - 1];
    if (previous === undefined) {
      if (snapshot.previousSnapshotId !== null || snapshot.previousSnapshotHash !== null) return false;
    } else if (snapshot.previousSnapshotId !== previous.snapshotId || snapshot.previousSnapshotHash !== previous.snapshotHash || Date.parse(snapshot.searchGeneratedAt) <= Date.parse(previous.searchGeneratedAt)) return false;
  }
  return true;
}
