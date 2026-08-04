import assert from 'node:assert/strict';
import test from 'node:test';

import { createRpcOperationResult, hashJson } from '../../dist/packages/contracts/src/index.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';
import { normalizeRpcHttpRequest, rpcPublicPricing } from '../../apps/api/src/x402-paid-rpc.mjs';

const observedAt = '2026-08-04T12:00:00.000Z';

test('RPC HTTP normalization is strict and prices batches by bounded call count', () => {
  assert.equal(rpcPublicPricing(normalizeRpcHttpRequest({ chainId: 'eip155:1', call: { method: 'eth_chainId', params: [] } })).maximumCharge.amountAtomic, '1');
  assert.equal(rpcPublicPricing(normalizeRpcHttpRequest({ chainId: 'eip155:1', calls: [{ method: 'eth_chainId', params: [] }, { method: 'eth_blockNumber', params: [] }] })).maximumCharge.amountAtomic, '2');
  assert.throws(() => normalizeRpcHttpRequest({ chainId: 'eip155:1', call: { method: 'eth_chainId', params: [] }, calls: [] }), /rpc_http_calls_invalid/u);
  assert.throws(() => normalizeRpcHttpRequest({ chainId: 'eip155:1', call: { method: 'eth_chainId', params: [] }, endpoint: 'https:\/\/attacker.invalid' }), /rpc_http_request_additional_property/u);
});

test('public RPC route is edge-only, challenges before body validation, returns useful output, and replays without another execution', async (context) => {
  const calls = { challenge: 0, authorize: 0, settle: 0, execute: 0 };
  const service = {
    mode: 'settlement_enabled',
    async challenge({ quote, resourcePath }) {
      calls.challenge += 1;
      return { status: 402, headers: { 'PAYMENT-REQUIRED': 'rpc-http', 'WWW-Authenticate': 'Payment id="rpc"' }, body: { x402Version: 2, accepts: [{ amount: quote.maximumCharge.amountAtomic }], resource: { url: `https://api.clervo.dev${resourcePath}` } } };
    },
    async authorize() { calls.authorize += 1; return { fingerprint: `sha256:${'7'.repeat(64)}` }; },
    async settle() { calls.settle += 1; return { kind: 'settled', headers: { 'PAYMENT-RESPONSE': 'rpc-settled' }, settlement: { network: 'eip155:8453', transaction: `0x${'8'.repeat(64)}` } }; },
  };
  const runtime = {
    durable: true,
    async execute(request) {
      calls.execute += 1;
      return {
        qualificationId: `qual_${'q'.repeat(24)}`,
        result: createRpcOperationResult({
          request,
          completedAt: observedAt,
          meteredCharge: { asset: 'USD', amountAtomic: '0', decimals: 6 },
          output: {
            kind: 'rpc', chainId: request.input.chainId,
            outcomes: [{ id: 1, ok: true, result: '0x1' }],
            cache: 'miss', quorum: 1, observedAt,
            requestHash: hashJson({ chainId: request.input.chainId, calls: [request.input.call] }),
          },
        }),
      };
    },
  };
  const server = createSearchServer({
    executor: { async execute() { throw new Error('search_not_called'); } },
    now: () => observedAt,
    edgeAuthorization: 'edge-authorization-at-least-32-characters',
    x402Service: service,
    x402StateStore: new InMemoryX402OperationStore({ environmentNamespace: 'rpc_http' }),
    rpcRuntime: runtime,
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const body = JSON.stringify({ chainId: 'eip155:1', call: { method: 'eth_chainId', params: [] } });
  const edge = { 'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters' };
  assert.equal((await fetch(`${origin}/v1/rpc/execute`, { method: 'POST', body })).status, 401);

  const probe = await fetch(`${origin}/v1/rpc/execute`, { method: 'POST', headers: edge });
  assert.equal(probe.status, 402);
  assert.equal(probe.headers.has('payment-required'), true);
  assert.equal(probe.headers.has('www-authenticate'), true);
  const probeBody = await probe.json();
  assert.equal(probeBody.accepts[0].amount, '1');
  assert.equal(probeBody.resource.url, 'https://api.clervo.dev/v1/rpc/execute');

  const headers = { ...edge, 'content-type': 'application/json', 'idempotency-key': 'idem_rpc_http_001' };
  const challenge = await fetch(`${origin}/v1/rpc/execute`, { method: 'POST', headers, body });
  assert.equal(challenge.status, 402);
  assert.equal((await challenge.json()).quote.productId, 'rpc.call');
  assert.equal(calls.execute, 0);

  const paid = await fetch(`${origin}/v1/rpc/execute`, { method: 'POST', headers: { ...headers, 'payment-signature': 'opaque-payment' }, body });
  assert.equal(paid.status, 200);
  const result = await paid.json();
  assert.equal(result.result.output.outcomes[0].result, '0x1');
  assert.equal(result.receipt.productId, 'rpc.call');

  const replay = await fetch(`${origin}/v1/rpc/execute`, { method: 'POST', headers, body });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).replayed, true);
  assert.deepEqual(calls, { challenge: 2, authorize: 1, settle: 1, execute: 1 });
});
