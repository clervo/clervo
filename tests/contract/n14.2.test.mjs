import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  InMemoryFreeSearchQuota,
  SEARCH_FREE_PATH,
  createSearchResponse,
} from '../../dist/packages/contracts/src/index.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import {
  InMemorySearchStateStore,
  PostgresSearchStateStore,
} from '../../apps/api/src/search-state-store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const now = '2026-08-02T07:00:00.000Z';

function executor() {
  let calls = 0;
  return {
    get calls() { return calls; },
    execute(input) {
      calls += 1;
      const evidenceText = 'Durable replay returns the original verified result.';
      return {
        searchResponse: createSearchResponse({
          operationId: input.operationId,
          query: input.query,
          now,
          maxResults: input.maxResults,
          evidence: [{
            resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
            sourceId: 'adapter_mock.search',
            url: 'https://example.com/durable',
            title: 'Durable evidence',
            snippet: evidenceText,
            evidenceText,
            retrievedAt: now,
            publishedAt: '2026-08-02T06:00:00.000Z',
            authorityScore: 90,
            relevanceScore: 95,
          }],
          citations: [{
            citationId: 'cite_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
            resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
            canonicalUrl: 'https://example.com/durable',
            quote: evidenceText,
            startOffset: 0,
            endOffset: evidenceText.length,
          }],
        }),
      };
    },
  };
}

async function start(options) {
  const server = createSearchServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function post(origin, key, query = 'durable state') {
  return fetch(`${origin}${SEARCH_FREE_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify({ query, maxResults: 1, synthesize: false }),
  });
}

test('shared state replays a completed response after process-local state is replaced', async () => {
  const stateStore = new InMemorySearchStateStore({
    environmentNamespace: 'test',
    freeQuota: new InMemoryFreeSearchQuota(1, 60_000),
  });
  const firstExecutor = executor();
  const first = await start({ executor: firstExecutor, stateStore, now: () => now });
  const original = await post(first.origin, 'idem_n142_restart_001');
  assert.equal(original.status, 200);
  const originalBody = await original.json();
  await first.close();

  const secondExecutor = executor();
  const second = await start({ executor: secondExecutor, stateStore, now: () => now });
  try {
    const replay = await post(second.origin, 'idem_n142_restart_001');
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get('idempotency-replayed'), 'true');
    assert.deepEqual({ ...(await replay.json()), replayed: false }, originalBody);
    assert.equal(firstExecutor.calls, 1);
    assert.equal(secondExecutor.calls, 0);

    const health = await (await fetch(`${second.origin}/v1/health`)).json();
    const readiness = await fetch(`${second.origin}/readyz`);
    assert.equal(health.stateBackend, 'memory');
    assert.equal(health.durableState, false);
    assert.equal(readiness.status, 200);
  } finally {
    await second.close();
  }
});

test('Postgres state adapter claims, completes, replays, and consumes quota with atomic statements', async () => {
  const queries = [];
  const responses = [
    { rows: [{ operations: 'clervo_search_http_operations', quota: 'clervo_search_free_quota' }] },
    { rows: [{ operation_id: 'op_0123456789abcdef0123456789abcdef' }] },
    { rows: [{ operation_id: 'op_0123456789abcdef0123456789abcdef' }] },
    { rows: [{ window_started_at: now, request_count: 1, last_consumed_token: '__TOKEN__' }] },
    { rows: [] },
    { rows: [{
      request_hash: `sha256:${'a'.repeat(64)}`,
      operation_id: 'op_0123456789abcdef0123456789abcdef',
      state: 'completed',
      response_json: { operationId: 'op_0123456789abcdef0123456789abcdef', replayed: false },
      lease_expires_at: null,
    }] },
  ];
  const client = {
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      const response = responses.shift();
      if (response?.rows[0]?.last_consumed_token === '__TOKEN__') {
        response.rows[0].last_consumed_token = parameters[3];
      }
      return response;
    },
  };
  const store = new PostgresSearchStateStore(client, {
    environmentNamespace: 'production',
    freeQuotaLimit: 3,
    freeQuotaWindowMs: 60_000,
  });
  assert.equal(await store.ready(), true);
  const requestHash = `sha256:${'a'.repeat(64)}`;
  const operationId = 'op_0123456789abcdef0123456789abcdef';
  const claimed = await store.begin({ idempotencyKey: 'idem_n142_postgres_001', requestHash, operationId, now });
  assert.equal(claimed.kind, 'claimed');
  await store.complete({
    idempotencyKey: 'idem_n142_postgres_001',
    requestHash,
    operationId,
    leaseId: claimed.leaseId,
    response: { operationId, replayed: false },
    now,
  });
  const quota = await store.consumeFreeQuota('203.0.113.1', now);
  assert.deepEqual(quota, {
    allowed: true,
    limit: 3,
    remaining: 2,
    resetAt: '2026-08-02T07:01:00.000Z',
  });
  const replay = await store.begin({ idempotencyKey: 'idem_n142_postgres_001', requestHash, operationId, now });
  assert.equal(replay.kind, 'replay');

  assert.match(queries[1].sql, /ON CONFLICT \(environment_namespace, idempotency_key\) DO NOTHING/u);
  assert.match(queries[2].sql, /state = 'completed'/u);
  assert.match(queries[3].sql, /ON CONFLICT \(environment_namespace, subject_hash\) DO UPDATE/u);
  assert.match(queries[3].parameters[1], /^sha256:[a-f0-9]{64}$/u);
  assert.equal(queries[3].parameters.includes('203.0.113.1'), false);
});

test('migration and production entrypoint fail closed around durable state', async () => {
  const migration = await readFile(path.join(root, 'infra/storage/postgres/0003-search-http-state.sql'), 'utf8');
  for (const fragment of [
    'PRIMARY KEY (environment_namespace, idempotency_key)',
    "state IN ('in_progress', 'completed')",
    'lease_expires_at',
    'response_json',
    'subject_hash',
    'clervo_search_operation_retention_idx',
    'clervo_search_quota_retention_idx',
  ]) assert.match(migration, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(migration, /remote_address|ip_address/u);

  const result = spawnSync(process.execPath, ['apps/api/src/staging-search-main.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLERVO_ENV: 'production',
      CLERVO_RELEASE_ID: 'n14.2-test',
      CLERVO_STATE_BACKEND: 'memory',
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production requires CLERVO_STATE_BACKEND=postgres/u);
  assert.doesNotMatch(result.stderr, /DATABASE_URL|password|secret/iu);
});
