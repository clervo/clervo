import assert from 'node:assert/strict';
import test from 'node:test';

import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';
import { SANDBOX_PAID_PATH } from '../../apps/api/src/x402-paid-sandbox.mjs';
import { hashJson } from '../../dist/packages/contracts/src/index.js';

const edgeAuthorization = 'test-edge-authorization-value-over-thirty-two-bytes';
const runnerDigest = `sha256:${'a'.repeat(64)}`;

async function withServer(run) {
  const calls = { challenge: [], authorize: 0, settle: 0, execute: 0 };
  const service = {
    mode: 'settlement_enabled',
    async challenge(input) {
      calls.challenge.push(input);
      return { status: 402, headers: { 'PAYMENT-REQUIRED': 'sandbox-required', 'WWW-Authenticate': 'Payment test' }, body: { x402Version: 2, resource: { url: `https://api.clervo.dev${input.resourcePath}` }, accepts: [{}] } };
    },
    async authorize() { calls.authorize += 1; return { fingerprint: `sha256:${'b'.repeat(64)}`, verification: { payer: `0x${'c'.repeat(40)}` } }; },
    async settle() { calls.settle += 1; return { kind: 'settled', headers: { 'PAYMENT-RESPONSE': 'settled' }, settlement: { network: 'eip155:8453', transaction: `0x${'d'.repeat(64)}` } }; },
  };
  const sandboxGateway = {
    durable: true,
    async ready() { return true; },
    async close() {},
    async run({ request }) {
      calls.execute += 1;
      const unsigned = { operationId: request.operationId, productId: request.productId, output: { kind: 'execution', exitCode: 0, stdoutBase64: 'cmVhZHk=' } };
      return { replayed: false, result: { ...unsigned, resultHash: hashJson(unsigned) } };
    },
  };
  const server = createSearchServer({
    executor: { async execute() { throw new Error('search_not_expected'); } },
    x402Service: service,
    x402StateStore: new InMemoryX402OperationStore({ environmentNamespace: 'sandbox_http' }),
    sandboxGateway,
    sandboxApiToken: 'test-private-sandbox-token-over-thirty-two-bytes',
    sandboxPublicRunnerDigest: runnerDigest,
    edgeAuthorization,
    now: () => '2026-08-04T13:00:00.000Z',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`, calls); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

function post(origin, headers = {}, body) {
  return fetch(`${origin}${SANDBOX_PAID_PATH}`, {
    method: 'POST',
    headers: { 'x-clervo-edge-authorization': `Bearer ${edgeAuthorization}`, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('public Sandbox challenges before validation, executes once after payment, and replays without charge', async () => {
  await withServer(async (origin, calls) => {
    const probe = await post(origin);
    assert.equal(probe.status, 402);
    assert.equal((await probe.json()).resource.url, `https://api.clervo.dev${SANDBOX_PAID_PATH}`);
    assert.equal(calls.challenge[0].discovery.input.command[0], 'node');

    const request = { command: ['node', '-e', "process.stdout.write('ready')"], limits: { wallTimeMs: 5_000 } };
    const headers = { 'content-type': 'application/json', 'idempotency-key': 'idem_sandbox_http_001' };
    const challenge = await post(origin, headers, request);
    assert.equal(challenge.status, 402);
    assert.equal(calls.execute, 0);

    const paid = await post(origin, { ...headers, 'payment-signature': 'opaque-payment' }, request);
    assert.equal(paid.status, 200);
    const completed = await paid.json();
    assert.equal(completed.productId, 'sandbox.run');
    assert.equal(completed.result.output.stdoutBase64, 'cmVhZHk=');
    assert.equal(completed.receipt.customerCharge.amountAtomic, '120000');

    const replay = await post(origin, headers, request);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replayed, true);
    assert.deepEqual({ authorize: calls.authorize, settle: calls.settle, execute: calls.execute }, { authorize: 1, settle: 1, execute: 1 });
  });
});

test('public Sandbox remains edge-only and rejects unsafe input before execution', async () => {
  await withServer(async (origin, calls) => {
    const denied = await fetch(`${origin}${SANDBOX_PAID_PATH}`, { method: 'POST' });
    assert.equal(denied.status, 401);
    const invalid = await post(origin, { 'content-type': 'application/json', 'idempotency-key': 'idem_sandbox_http_002' }, { command: ['true'], network: true });
    assert.equal(invalid.status, 400);
    assert.equal(calls.execute, 0);
  });
});
