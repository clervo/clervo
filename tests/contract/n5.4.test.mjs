import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  createLiveIntelligenceAlertPolicy,
  createLiveIntelligenceMonitorDefinition,
  createLiveIntelligenceMonitorState,
  createSearchResponse,
  evaluateLiveIntelligenceChangeAlert,
  verifyLiveIntelligenceAlertPolicy,
  verifyLiveIntelligenceChangeAlert,
} from '../../dist/packages/contracts/src/index.js';
import { runLiveIntelligenceMonitor } from '../../dist/services/search/src/live-intelligence-monitor-runner.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

function policy() {
  return createLiveIntelligenceAlertPolicy({
    policyId: 'alpol_01K0ALERTPOLICY00000001',
    monitorId: 'mon_01K0MONITOR000000000001',
    eventTypes: ['removed', 'modified', 'added'],
    changedFields: ['title', 'presence'],
    minimumMatchingEvents: 1,
    severity: 'warning',
    createdAt: '2026-08-01T11:00:00.000Z',
  });
}

function response({ operationId, now, title }) {
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
      evidenceText: `${title} evidence.`,
      retrievedAt: now,
      authorityScore: 90,
      relevanceScore: 95,
    }],
  });
}

class MemoryMonitorRepository {
  constructor(initialState) {
    this.stateHash = initialState.stateHash;
    this.snapshots = [];
    this.commits = [];
  }

  async latestSnapshot() {
    return this.snapshots.at(-1);
  }

  async commit(input) {
    if (input.expectedStateHash !== this.stateHash) return false;
    this.stateHash = input.state.stateHash;
    if (input.snapshot !== undefined) this.snapshots.push(input.snapshot);
    this.commits.push(input);
    return true;
  }
}

test('change-alert policy canonicalizes selection and remains record-only', () => {
  const value = policy();
  assert.deepEqual(value.eventTypes, ['added', 'modified', 'removed']);
  assert.deepEqual(value.changedFields, ['presence', 'title']);
  assert.equal(value.deliveryMode, 'record_only');
  assert.equal(verifyLiveIntelligenceAlertPolicy(value), true);
  assert.deepEqual(policy(), value);
  assert.ok(Object.isFrozen(value) && Object.isFrozen(value.eventTypes));
});

test('transactional monitor runner persists snapshots, comparison, and deterministic undelivered alerts', async () => {
  const monitor = definition();
  const initial = createLiveIntelligenceMonitorState(monitor);
  const repository = new MemoryMonitorRepository(initial);
  const alertPolicy = policy();
  const firstResponse = response({ operationId: 'op_01K0ALERTRUN000000000001', now: '2026-08-01T12:00:00.000Z', title: 'Old' });
  const first = await runLiveIntelligenceMonitor({
    definition: monitor,
    state: initial,
    expectedStateHash: initial.stateHash,
    dueAt: '2026-08-01T12:00:00.000Z',
    capturedAt: '2026-08-01T12:00:01.000Z',
    policies: [alertPolicy],
    repository,
    execute: async () => firstResponse,
  });
  assert.equal(first.outcome, 'completed');
  assert.equal(first.comparison, undefined);
  assert.deepEqual(first.alerts, []);

  const secondResponse = response({ operationId: 'op_01K0ALERTRUN000000000002', now: '2026-08-01T13:00:00.000Z', title: 'New' });
  const second = await runLiveIntelligenceMonitor({
    definition: monitor,
    state: first.state,
    expectedStateHash: first.state.stateHash,
    dueAt: '2026-08-01T13:00:00.000Z',
    capturedAt: '2026-08-01T13:00:01.000Z',
    policies: [alertPolicy],
    repository,
    execute: async () => secondResponse,
  });
  assert.equal(second.outcome, 'completed');
  assert.equal(second.comparison.summary.modified, 1);
  assert.equal(second.alerts.length, 1);
  assert.equal(second.alerts[0].deliveryState, 'not_delivered');
  assert.equal(verifyLiveIntelligenceChangeAlert(second.alerts[0]), true);
  assert.equal(repository.commits.length, 2);
  assert.equal(repository.snapshots.length, 2);
  assert.equal(repository.commits[1].deleteSnapshotsBeforeSequence, 1);
  assert.equal(repository.commits[1].deleteSnapshotsBeforeTime, '2026-07-25T13:00:00.000Z');

  const repeated = evaluateLiveIntelligenceChangeAlert({ policy: alertPolicy, comparison: second.comparison, baseline: first.snapshot, current: second.snapshot });
  assert.deepEqual(repeated, second.alerts[0]);
});

test('runner records bounded execution failure state without leaking the thrown error', async () => {
  const monitor = definition();
  const initial = createLiveIntelligenceMonitorState(monitor);
  const repository = new MemoryMonitorRepository(initial);
  const result = await runLiveIntelligenceMonitor({
    definition: monitor,
    state: initial,
    expectedStateHash: initial.stateHash,
    dueAt: '2026-08-01T12:00:00.000Z',
    capturedAt: '2026-08-01T12:00:01.000Z',
    policies: [policy()],
    repository,
    execute: async () => { throw new Error('credential-value-must-not-escape'); },
  });
  assert.deepEqual({ outcome: result.outcome, failureCode: result.failureCode }, { outcome: 'execution_failed', failureCode: 'search_execution_failed' });
  assert.equal(JSON.stringify(result).includes('credential-value'), false);
  assert.equal(result.state.consecutiveFailures, 1);
  assert.equal(repository.snapshots.length, 0);
});

test('runner fails closed on repository lineage drift and commit races', async () => {
  const monitor = definition();
  const initial = createLiveIntelligenceMonitorState(monitor);
  const unexpected = new MemoryMonitorRepository(initial);
  unexpected.snapshots.push({ snapshotId: 'invalid' });
  await assert.rejects(() => runLiveIntelligenceMonitor({
    definition: monitor, state: initial, expectedStateHash: initial.stateHash, dueAt: '2026-08-01T12:00:00.000Z', capturedAt: '2026-08-01T12:00:01.000Z', policies: [], repository: unexpected,
    execute: async () => response({ operationId: 'op_01K0ALERTRUN000000000003', now: '2026-08-01T12:00:00.000Z', title: 'Ignored' }),
  }), /monitor_repository_unexpected_snapshot/u);

  const raced = new MemoryMonitorRepository(initial);
  raced.stateHash = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  await assert.rejects(() => runLiveIntelligenceMonitor({
    definition: monitor, state: initial, expectedStateHash: initial.stateHash, dueAt: '2026-08-01T12:00:00.000Z', capturedAt: '2026-08-01T12:00:01.000Z', policies: [], repository: raced,
    execute: async () => response({ operationId: 'op_01K0ALERTRUN000000000004', now: '2026-08-01T12:00:00.000Z', title: 'Race' }),
  }), /monitor_repository_compare_and_swap_failed/u);
});

test('alert schemas and registry remain internal while PostgreSQL storage binds identities and blocks delivery claims', async () => {
  const schemaDirectory = path.join(root, 'packages/contracts/schemas');
  const schemas = (await readdir(schemaDirectory)).filter((file) => file.endsWith('.schema.json')).sort();
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  for (const file of schemas) ajv.addSchema(await json(`packages/contracts/schemas/${file}`));
  const alertPolicy = policy();
  assert.equal(ajv.getSchema('https://api.clervo.dev/schemas/2026-07-29.1/live-intelligence-alert-policy.schema.json')(alertPolicy), true);

  const registry = await json('packages/catalog/platform-registry.v1.json');
  const operation = registry.operations.find(({ operationId }) => operationId === 'search.alert.evaluate');
  assert.equal(operation.route, null);
  assert.equal(operation.visibility, 'internal');
  assert.equal(registry.skus.some(({ operationId }) => operationId === 'search.alert.evaluate'), false);

  const migration = await readFile(path.join(root, 'infra/storage/postgres/0002-live-intelligence-monitoring.sql'), 'utf8');
  for (const fragment of ['UNIQUE (environment_namespace, monitor_id, sequence)', 'previous_snapshot_hash', 'state_hash', "deliveryState' = 'not_delivered'", 'FOREIGN KEY (environment_namespace, current_snapshot_id)']) assert.match(migration, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
});
