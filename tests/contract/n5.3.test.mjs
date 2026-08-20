import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  appendLiveIntelligenceMonitorSnapshot,
  assertSchemaVisibilityManifest,
  compareLiveIntelligenceEvidence,
  createLiveIntelligenceMonitorDefinition,
  createLiveIntelligenceMonitorState,
  createSearchResponse,
  liveIntelligenceMonitorDue,
  recordLiveIntelligenceMonitorFailure,
  transitionLiveIntelligenceMonitorStatus,
  verifyLiveIntelligenceComparison,
  verifyLiveIntelligenceMonitorDefinition,
  verifyLiveIntelligenceMonitorLineage,
  verifyLiveIntelligenceMonitorSnapshot,
  verifyLiveIntelligenceMonitorState,
} from '../../dist/packages/contracts/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaDirectory = path.join(root, 'packages/contracts/schemas');

async function json(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}

function definition() {
  return createLiveIntelligenceMonitorDefinition({
    monitorId: 'mon_01K0MONITOR000000000001',
    query: 'clervo product changes',
    language: 'en',
    region: 'US',
    createdAt: '2026-08-01T11:00:00.000Z',
    anchorAt: '2026-08-01T12:00:00.000Z',
    intervalSeconds: 3_600,
    maximumSnapshots: 168,
    maximumAgeSeconds: 604_800,
  });
}

function response({ operationId, now, title, evidenceText }) {
  return createSearchResponse({
    operationId,
    query: 'clervo product changes',
    language: 'en',
    region: 'US',
    now,
    maxResults: 10,
    evidence: [{
      resultId: `sr_${operationId.slice(3)}`,
      sourceId: 'adapter_test.search',
      url: 'https://example.com/clervo',
      title,
      snippet: `${title} summary`,
      evidenceText,
      retrievedAt: now,
      authorityScore: 90,
      relevanceScore: 95,
    }],
  });
}

test('monitor definition and initial state are deterministic, hash-bound, and scheduled from one UTC anchor', () => {
  const monitor = definition();
  const same = definition();
  const state = createLiveIntelligenceMonitorState(monitor);
  assert.deepEqual(same, monitor);
  assert.equal(verifyLiveIntelligenceMonitorDefinition(monitor), true);
  assert.equal(verifyLiveIntelligenceMonitorState(monitor, state), true);
  assert.equal(liveIntelligenceMonitorDue(monitor, state, '2026-08-01T11:59:59.999Z'), false);
  assert.equal(liveIntelligenceMonitorDue(monitor, state, '2026-08-01T12:00:00.000Z'), true);
  assert.ok(Object.isFrozen(monitor) && Object.isFrozen(monitor.query) && Object.isFrozen(state));
});

test('successful snapshots retain payloads, advance without schedule drift, and compose with comparison', () => {
  const monitor = definition();
  const initial = createLiveIntelligenceMonitorState(monitor);
  const baseline = response({ operationId: 'op_01K0MONITORRUN0000000001', now: '2026-08-01T12:04:00.000Z', title: 'Old title', evidenceText: 'Old evidence.' });
  const first = appendLiveIntelligenceMonitorSnapshot({ definition: monitor, state: initial, expectedStateHash: initial.stateHash, response: baseline, capturedAt: '2026-08-01T12:04:01.000Z' });
  assert.equal(first.state.nextRunAt, '2026-08-01T13:00:00.000Z');
  assert.equal(first.snapshot.sequence, 1);
  assert.equal(first.snapshot.previousSnapshotHash, null);

  const current = response({ operationId: 'op_01K0MONITORRUN0000000002', now: '2026-08-01T13:47:00.000Z', title: 'New title', evidenceText: 'New evidence.' });
  const second = appendLiveIntelligenceMonitorSnapshot({ definition: monitor, state: first.state, expectedStateHash: first.state.stateHash, response: current, capturedAt: '2026-08-01T13:47:01.000Z' });
  assert.equal(second.state.nextRunAt, '2026-08-01T14:00:00.000Z');
  assert.equal(second.snapshot.sequence, 2);
  assert.equal(second.snapshot.previousSnapshotId, first.snapshot.snapshotId);
  assert.equal(second.snapshot.previousSnapshotHash, first.snapshot.snapshotHash);
  assert.equal(verifyLiveIntelligenceMonitorLineage(monitor, [first.snapshot, second.snapshot]), true);

  const comparison = compareLiveIntelligenceEvidence({ baseline: first.snapshot.searchResponse, current: second.snapshot.searchResponse });
  assert.equal(comparison.summary.modified, 1);
  assert.equal(verifyLiveIntelligenceComparison(comparison), true);
});

test('failures advance the anchored schedule and a later success resets only consecutive failures', () => {
  const monitor = definition();
  const initial = createLiveIntelligenceMonitorState(monitor);
  const failed = recordLiveIntelligenceMonitorFailure({ definition: monitor, state: initial, expectedStateHash: initial.stateHash, failedAt: '2026-08-01T12:17:00.000Z' });
  assert.equal(failed.nextRunAt, '2026-08-01T13:00:00.000Z');
  assert.equal(failed.consecutiveFailures, 1);
  assert.equal(failed.snapshotCount, 0);
  assert.throws(() => recordLiveIntelligenceMonitorFailure({ definition: monitor, state: failed, expectedStateHash: failed.stateHash, failedAt: '2026-08-01T12:16:00.000Z' }), /monitor_state_time_not_increasing/u);

  const current = response({ operationId: 'op_01K0MONITORRUN0000000003', now: '2026-08-01T13:00:00.000Z', title: 'Recovered', evidenceText: 'Recovered evidence.' });
  const recovered = appendLiveIntelligenceMonitorSnapshot({ definition: monitor, state: failed, expectedStateHash: failed.stateHash, response: current, capturedAt: '2026-08-01T13:00:01.000Z' });
  assert.equal(recovered.state.consecutiveFailures, 0);
  assert.equal(recovered.state.lastAttemptAt, '2026-08-01T13:00:00.000Z');
  assert.equal(recovered.state.lastSuccessAt, '2026-08-01T13:00:00.000Z');
});

test('state transitions and append operations fail closed on stale state, early runs, identity drift, and archive reuse', () => {
  const monitor = definition();
  const initial = createLiveIntelligenceMonitorState(monitor);
  assert.throws(() => recordLiveIntelligenceMonitorFailure({ definition: monitor, state: initial, expectedStateHash: initial.stateHash, failedAt: '2026-08-01T11:59:00.000Z' }), /monitor_attempt_not_due/u);
  assert.throws(() => transitionLiveIntelligenceMonitorStatus({ definition: monitor, state: initial, expectedStateHash: 'sha256:bad', status: 'paused', at: '2026-08-01T11:30:00.000Z' }), /compare_and_swap/u);

  const paused = transitionLiveIntelligenceMonitorStatus({ definition: monitor, state: initial, expectedStateHash: initial.stateHash, status: 'paused', at: '2026-08-01T11:30:00.000Z' });
  assert.equal(paused.nextRunAt, null);
  const resumed = transitionLiveIntelligenceMonitorStatus({ definition: monitor, state: paused, expectedStateHash: paused.stateHash, status: 'active', at: '2026-08-01T12:30:00.000Z' });
  assert.equal(resumed.nextRunAt, '2026-08-01T13:00:00.000Z');
  const archived = transitionLiveIntelligenceMonitorStatus({ definition: monitor, state: resumed, expectedStateHash: resumed.stateHash, status: 'archived', at: '2026-08-01T12:31:00.000Z' });
  assert.throws(() => transitionLiveIntelligenceMonitorStatus({ definition: monitor, state: archived, expectedStateHash: archived.stateHash, status: 'active', at: '2026-08-01T12:32:00.000Z' }), /archived_monitor_terminal/u);

  const wrongQuery = createSearchResponse({
    operationId: 'op_01K0MONITORRUN0000000004', query: 'different', language: 'en', region: 'US', now: '2026-08-01T12:00:00.000Z', maxResults: 10, evidence: [],
  });
  assert.throws(() => appendLiveIntelligenceMonitorSnapshot({ definition: monitor, state: initial, expectedStateHash: initial.stateHash, response: wrongQuery, capturedAt: '2026-08-01T12:00:01.000Z' }), /monitor_snapshot_query_mismatch/u);
});

test('snapshot and lineage verification detect payload, parent, and hash tampering', () => {
  const monitor = definition();
  const initial = createLiveIntelligenceMonitorState(monitor);
  const search = response({ operationId: 'op_01K0MONITORRUN0000000005', now: '2026-08-01T12:00:00.000Z', title: 'Stable', evidenceText: 'Stable evidence.' });
  const appended = appendLiveIntelligenceMonitorSnapshot({ definition: monitor, state: initial, expectedStateHash: initial.stateHash, response: search, capturedAt: '2026-08-01T12:00:01.000Z' });
  assert.equal(verifyLiveIntelligenceMonitorSnapshot(appended.snapshot), true);

  const payloadTamper = structuredClone(appended.snapshot);
  payloadTamper.searchResponse.results[0].title = 'Tampered';
  assert.equal(verifyLiveIntelligenceMonitorSnapshot(payloadTamper), false);
  const parentTamper = structuredClone(appended.snapshot);
  parentTamper.previousSnapshotHash = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  assert.equal(verifyLiveIntelligenceMonitorSnapshot(parentTamper), false);
});

test('monitor contracts validate strictly and remain internal', async () => {
  const schemas = (await readdir(schemaDirectory)).filter((file) => file.endsWith('.schema.json')).sort();
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  for (const file of schemas) ajv.addSchema(await json(`packages/contracts/schemas/${file}`));

  const monitor = definition();
  const state = createLiveIntelligenceMonitorState(monitor);
  assert.equal(ajv.getSchema('https://api.clervo.dev/schemas/2026-07-29.1/live-intelligence-monitor-definition.schema.json')(monitor), true);
  assert.equal(ajv.getSchema('https://api.clervo.dev/schemas/2026-07-29.1/live-intelligence-monitor-state.schema.json')(state), true);

  const visibility = await json('packages/catalog/schema-visibility.v1.json');
  assert.doesNotThrow(() => assertSchemaVisibilityManifest(visibility, schemas));
  for (const file of ['live-intelligence-monitor-definition.schema.json', 'live-intelligence-monitor-snapshot.schema.json', 'live-intelligence-monitor-state.schema.json']) {
    assert.equal(visibility.schemas.find((entry) => entry.file === file)?.visibility, 'internal_control');
  }
});
