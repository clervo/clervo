import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createSandboxOperationResult } from '../../dist/packages/contracts/src/sandbox.js';
import { createSandboxPrivateGateway } from '../../apps/api/src/sandbox-private-gateway.mjs';
import { InMemorySandboxOperationStore } from '../../apps/api/src/sandbox-operation-store.mjs';

const request = {
  contractVersion: '2026-07-29.1', schemaVersion: 'sandbox-operation-request.v1', operationId: 'op_0123456789ABCDEFGHIJ', productId: 'sandbox.run',
  input: { kind: 'run', executionId: 'exec_0123456789ABCDEFGHIJ', imageDigest: `sha256:${'7'.repeat(64)}`, command: ['node', '-e', 'process.stdout.write("ok")'], limits: { cpuMillis: 5000, memoryBytes: 268435456, processes: 64, diskBytes: 10485760, outputBytes: 65536, artifactBytes: 4096, wallTimeMs: 10000 } },
  maximumCharge: { asset: 'USD', amountAtomic: '1000', decimals: 6 }, deadlineAt: '2026-08-03T15:00:00.000Z',
};
const result = createSandboxOperationResult({ request, completedAt: '2026-08-03T14:00:01.000Z', meteredCharge: { asset: 'USD', amountAtomic: '0', decimals: 6 }, output: { kind: 'execution', sessionId: 'sbx_0123456789ABCDEFGHIJ', executionId: request.input.executionId, sessionState: 'destroyed', exitCode: 0, stdoutBase64: Buffer.from('ok').toString('base64'), stderrBase64: '', cpuMillis: 3, durationMs: 9, artifacts: [] } });
const token = 'sandbox-private-gateway-token-0123456789';
const tenantId = 'tenant_0123456789ABCDEFGHIJ';

test('private Sandbox gateway durably binds one request and replays without another control call', async () => {
  let calls = 0;
  const gateway = createSandboxPrivateGateway({
    controlOrigin: 'http://127.0.0.1:8080', controlToken: token, stateStore: new InMemorySandboxOperationStore(),
    now: (() => { let tick = 0; return () => new Date(Date.parse('2026-08-03T14:00:00.000Z') + tick++).toISOString(); })(),
    fetchImpl: async (_url, options) => {
      calls += 1; assert.equal(options.redirect, 'error'); assert.equal(options.headers['x-clervo-tenant-id'], tenantId);
      return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const first = await gateway.run({ tenantId, request }); assert.equal(first.replayed, false); assert.deepEqual(first.result, result);
  const replay = await gateway.run({ tenantId, request }); assert.equal(replay.replayed, true); assert.deepEqual(replay.result, result); assert.equal(calls, 1);
  await assert.rejects(gateway.run({ tenantId, request: { ...request, deadlineAt: '2026-08-03T15:00:01.000Z' } }), /sandbox_idempotency_conflict/u);
});

test('ambiguous control failure is permanently quarantined instead of re-executed', async () => {
  let calls = 0;
  const gateway = createSandboxPrivateGateway({
    controlOrigin: 'http://127.0.0.1:8080', controlToken: token, stateStore: new InMemorySandboxOperationStore(),
    now: () => '2026-08-03T14:00:00.000Z', fetchImpl: async () => { calls += 1; throw new Error('socket_closed'); },
  });
  await assert.rejects(gateway.run({ tenantId, request }), /sandbox_execution_unknown/u);
  await assert.rejects(gateway.run({ tenantId, request }), /sandbox_execution_unknown/u);
  assert.equal(calls, 1);
});

test('production rejects memory state and public or path-substituted control targets', () => {
  assert.throws(() => createSandboxPrivateGateway({ controlOrigin: 'http://127.0.0.1:8080', controlToken: token, stateStore: new InMemorySandboxOperationStore(), environment: 'production' }), /durable state/u);
  assert.throws(() => createSandboxPrivateGateway({ controlOrigin: 'https://example.com', controlToken: token, stateStore: new InMemorySandboxOperationStore() }), /control_url_invalid/u);
  assert.throws(() => createSandboxPrivateGateway({ controlOrigin: 'http://10.0.0.5/substituted', controlToken: token, stateStore: new InMemorySandboxOperationStore() }), /control_url_invalid/u);
});

test('PostgreSQL migration keeps tenant identity hashed and makes expired execution permanently unknown', async () => {
  const migration = await readFile('infra/storage/postgres/0006-sandbox-operation-state.sql', 'utf8');
  const store = await readFile('apps/api/src/sandbox-operation-store.mjs', 'utf8');
  assert.match(migration, /tenant_hash text NOT NULL/u);
  assert.doesNotMatch(migration, /tenant_id text/u);
  assert.match(migration, /'executing', 'execution_unknown', 'completed'/u);
  assert.match(migration, /PRIMARY KEY \(environment_namespace, operation_id\)/u);
  assert.match(store, /state = 'execution_unknown'/u);
  assert.doesNotMatch(store, /DELETE FROM clervo_sandbox_operations/u);
});
