import {
  appendLiveIntelligenceMonitorSnapshot,
  compareLiveIntelligenceEvidence,
  evaluateLiveIntelligenceChangeAlert,
  liveIntelligenceMonitorDue,
  recordLiveIntelligenceMonitorFailure,
  verifyLiveIntelligenceAlertPolicy,
  verifyLiveIntelligenceMonitorSnapshot,
  type LiveIntelligenceAlertPolicy,
  type LiveIntelligenceChangeAlert,
  type LiveIntelligenceComparisonReport,
  type LiveIntelligenceMonitorDefinition,
  type LiveIntelligenceMonitorSnapshot,
  type LiveIntelligenceMonitorState,
  type SearchResponse,
} from '../../../packages/contracts/src/index.js';

export interface LiveIntelligenceMonitorCommit {
  expectedStateHash: string;
  state: Readonly<LiveIntelligenceMonitorState>;
  snapshot?: Readonly<LiveIntelligenceMonitorSnapshot>;
  comparison?: Readonly<LiveIntelligenceComparisonReport>;
  alerts: readonly Readonly<LiveIntelligenceChangeAlert>[];
  deleteSnapshotsBeforeSequence?: number;
  deleteSnapshotsBeforeTime?: string;
}

export interface LiveIntelligenceMonitorRepository {
  latestSnapshot(monitorId: string): Promise<Readonly<LiveIntelligenceMonitorSnapshot> | undefined>;
  commit(input: Readonly<LiveIntelligenceMonitorCommit>): Promise<boolean>;
}

export interface LiveIntelligenceMonitorRunResult {
  outcome: 'completed' | 'execution_failed';
  state: Readonly<LiveIntelligenceMonitorState>;
  snapshot?: Readonly<LiveIntelligenceMonitorSnapshot>;
  comparison?: Readonly<LiveIntelligenceComparisonReport>;
  alerts: readonly Readonly<LiveIntelligenceChangeAlert>[];
  failureCode?: 'search_execution_failed';
}

function assertPreviousSnapshot(
  state: LiveIntelligenceMonitorState,
  previous: LiveIntelligenceMonitorSnapshot | undefined,
): void {
  if (state.snapshotCount === 0) {
    if (previous !== undefined) throw new TypeError('monitor_repository_unexpected_snapshot');
    return;
  }
  if (previous === undefined || !verifyLiveIntelligenceMonitorSnapshot(previous)) throw new TypeError('monitor_repository_snapshot_missing_or_invalid');
  if (previous.monitorId !== state.monitorId || previous.snapshotId !== state.lastSnapshotId || previous.snapshotHash !== state.lastSnapshotHash || previous.sequence !== state.snapshotCount) throw new TypeError('monitor_repository_state_lineage_mismatch');
}

function assertPolicies(monitorId: string, policies: readonly LiveIntelligenceAlertPolicy[]): void {
  const identifiers = new Set<string>();
  for (const policy of policies) {
    if (!verifyLiveIntelligenceAlertPolicy(policy) || policy.monitorId !== monitorId) throw new TypeError('monitor_alert_policy_invalid');
    if (identifiers.has(policy.policyId)) throw new TypeError('monitor_alert_policy_duplicate');
    identifiers.add(policy.policyId);
  }
}

export async function runLiveIntelligenceMonitor(input: {
  definition: Readonly<LiveIntelligenceMonitorDefinition>;
  state: Readonly<LiveIntelligenceMonitorState>;
  expectedStateHash: string;
  dueAt: string;
  capturedAt: string;
  policies: readonly Readonly<LiveIntelligenceAlertPolicy>[];
  repository: LiveIntelligenceMonitorRepository;
  execute(): Promise<Readonly<SearchResponse>>;
}): Promise<Readonly<LiveIntelligenceMonitorRunResult>> {
  if (input.expectedStateHash !== input.state.stateHash) throw new TypeError('monitor_state_compare_and_swap_failed');
  if (!liveIntelligenceMonitorDue(input.definition, input.state, input.dueAt)) throw new TypeError('monitor_run_not_due');
  assertPolicies(input.definition.monitorId, input.policies);
  const previous = await input.repository.latestSnapshot(input.definition.monitorId);
  assertPreviousSnapshot(input.state, previous);

  let response: Readonly<SearchResponse>;
  try {
    response = await input.execute();
  } catch {
    const state = recordLiveIntelligenceMonitorFailure({
      definition: input.definition,
      state: input.state,
      expectedStateHash: input.expectedStateHash,
      failedAt: input.capturedAt,
    });
    const committed = await input.repository.commit({ expectedStateHash: input.expectedStateHash, state, alerts: [] });
    if (!committed) throw new TypeError('monitor_repository_compare_and_swap_failed');
    return Object.freeze({ outcome: 'execution_failed', state, alerts: Object.freeze([]), failureCode: 'search_execution_failed' });
  }

  const appended = appendLiveIntelligenceMonitorSnapshot({
    definition: input.definition,
    state: input.state,
    expectedStateHash: input.expectedStateHash,
    response,
    capturedAt: input.capturedAt,
  });
  let comparison: Readonly<LiveIntelligenceComparisonReport> | undefined;
  const alerts: Readonly<LiveIntelligenceChangeAlert>[] = [];
  if (previous !== undefined) {
    comparison = compareLiveIntelligenceEvidence({ baseline: previous.searchResponse, current: appended.snapshot.searchResponse });
    for (const policy of input.policies) {
      const alert = evaluateLiveIntelligenceChangeAlert({ policy, comparison, baseline: previous, current: appended.snapshot });
      if (alert !== null) alerts.push(alert);
    }
  }
  const committed = await input.repository.commit({
    expectedStateHash: input.expectedStateHash,
    state: appended.state,
    snapshot: appended.snapshot,
    ...(comparison === undefined ? {} : { comparison }),
    alerts,
    deleteSnapshotsBeforeSequence: Math.max(1, appended.snapshot.sequence - input.definition.retention.maximumSnapshots + 1),
    deleteSnapshotsBeforeTime: new Date(Date.parse(appended.snapshot.searchGeneratedAt) - input.definition.retention.maximumAgeSeconds * 1_000).toISOString(),
  });
  if (!committed) throw new TypeError('monitor_repository_compare_and_swap_failed');
  return Object.freeze({
    outcome: 'completed',
    state: appended.state,
    snapshot: appended.snapshot,
    ...(comparison === undefined ? {} : { comparison }),
    alerts: Object.freeze([...alerts]),
  });
}
