import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../../apps/worker/src/api-edge.js';
import {
  SharedCapacityController,
  SupplierCircuitBreaker,
  requestDeadline,
} from '../../apps/api/src/shared-boundary.mjs';

const env = Object.freeze({
  CLERVO_AI_PUBLIC_ENABLED: 'true',
  CLERVO_SANDBOX_PUBLIC_ENABLED: 'true',
  CLERVO_RPC_PUBLIC_ENABLED: 'true',
  CLERVO_PREDICTION_PUBLIC_ENABLED: 'true',
  CLERVO_CRYPTO_PUBLIC_ENABLED: 'true',
  CLERVO_EDGE_AUTHORIZATION: 'edge-authorization-at-least-32-characters',
});

function productRequest(pathname, body, headers = {}) {
  return new Request(`https://api.clervo.dev${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.10', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('edge rejects malformed, complex, oversized, and incorrectly typed bodies before origin work', async (context) => {
  let originCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { originCalls += 1; return Response.json({ unexpected: true }); };
  context.after(() => { globalThis.fetch = originalFetch; });

  const malformed = await worker.fetch(productRequest('/v1/search/free', '{"query":'), env);
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, 'invalid_json');

  let deep = { value: true };
  for (let index = 0; index < 33; index += 1) deep = { nested: deep };
  const nested = await worker.fetch(productRequest('/v1/search/free', deep), env);
  assert.equal(nested.status, 422);
  assert.equal((await nested.json()).code, 'request_structure_too_complex');

  const wide = await worker.fetch(productRequest('/v1/search/free', { values: Array.from({ length: 1_001 }, () => 1) }), env);
  assert.equal(wide.status, 422);
  assert.equal((await wide.json()).code, 'request_array_too_large');

  const typed = await worker.fetch(new Request('https://api.clervo.dev/v1/search/free', {
    method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"query":"x"}',
  }), env);
  assert.equal(typed.status, 415);

  const oversized = await worker.fetch(productRequest('/v1/search/free', { query: 'x'.repeat(17_000) }), env);
  assert.equal(oversized.status, 413);
  assert.equal(originCalls, 0);
});

test('edge strips untrusted and sensitive headers, propagates one deadline, and filters origin leakage', async (context) => {
  let forwarded;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (request) => {
    forwarded = request;
    return Response.json({ code: 'payment_required' }, {
      status: 402,
      headers: {
        'payment-required': 'challenge',
        'set-cookie': 'secret=session',
        'x-internal-debug': 'provider-key-material',
      },
    });
  };
  context.after(() => { globalThis.fetch = originalFetch; });

  const before = Date.now();
  const response = await worker.fetch(productRequest('/v1/search/paid', { query: 'bounded' }, {
    'idempotency-key': 'idem_hammer1_edge_001',
    cookie: 'ambient=session',
    'x-clervo-edge-authorization': 'attacker-controlled',
    'x-forwarded-for': '127.0.0.1',
  }), env);
  assert.equal(response.status, 402);
  assert.equal(forwarded.headers.get('cookie'), null);
  assert.equal(forwarded.headers.get('x-forwarded-for'), null);
  assert.equal(forwarded.headers.get('x-clervo-edge-authorization'), `Bearer ${env.CLERVO_EDGE_AUTHORIZATION}`);
  assert.match(forwarded.headers.get('x-clervo-quota-subject') ?? '', /^sha256:[a-f0-9]{64}$/u);
  const deadline = Date.parse(forwarded.headers.get('x-clervo-deadline-at'));
  assert.ok(deadline >= before + 14_000 && deadline <= Date.now() + 15_100);
  assert.equal(response.headers.get('payment-required'), 'challenge');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-internal-debug'), null);
});

test('capacity reserves paid room from free floods and isolates product families', () => {
  const capacity = new SharedCapacityController({
    maximumExecutions: 8,
    maximumFreeExecutions: 2,
    maximumConcurrentQuotes: 2,
    productLimits: { search: 3, ai: 2, sandbox: 1, rpc: 2, prediction: 2, crypto: 2 },
  });
  const freeA = capacity.acquireExecution({ productId: 'search.web', fundingMode: 'free' });
  const freeB = capacity.acquireExecution({ productId: 'search.web', fundingMode: 'free' });
  assert.ok(freeA && freeB);
  assert.equal(capacity.acquireExecution({ productId: 'search.web', fundingMode: 'free' }), undefined);

  const rpcA = capacity.acquireExecution({ productId: 'rpc.proxy', fundingMode: 'paid' });
  const rpcB = capacity.acquireExecution({ productId: 'rpc.proxy', fundingMode: 'paid' });
  assert.ok(rpcA && rpcB);
  assert.equal(capacity.acquireExecution({ productId: 'rpc.proxy', fundingMode: 'paid' }), undefined);
  const ai = capacity.acquireExecution({ productId: 'ai.chat', fundingMode: 'paid' });
  assert.ok(ai, 'RPC saturation must not consume AI product capacity');

  const quoteA = capacity.acquireQuote();
  const quoteB = capacity.acquireQuote();
  assert.ok(quoteA && quoteB);
  assert.equal(capacity.acquireQuote(), undefined);
  freeA(); freeB(); rpcA(); rpcB(); ai(); quoteA(); quoteB();
  assert.deepEqual(capacity.snapshot().products, {});
  assert.equal(capacity.snapshot().activeExecutions, 0);
});

test('per-subject rates reset deterministically and absolute deadlines only shrink', () => {
  let now = 1_000;
  const capacity = new SharedCapacityController({
    maximumExecutions: 4,
    rateLimits: { free: { limit: 2, windowMs: 1_000 }, quote: { limit: 2, windowMs: 1_000 }, paid: { limit: 3, windowMs: 1_000 } },
    clock: () => now,
  });
  const subject = `sha256:${'a'.repeat(64)}`;
  assert.equal(capacity.rate({ kind: 'free', subject }).allowed, true);
  assert.equal(capacity.rate({ kind: 'free', subject }).allowed, true);
  assert.equal(capacity.rate({ kind: 'free', subject }).allowed, false);
  now = 2_000;
  assert.equal(capacity.rate({ kind: 'free', subject }).allowed, true);

  const local = requestDeadline({ pathname: '/v1/search/paid', now: 10_000 });
  assert.equal(Date.parse(local.deadlineAt), 25_000);
  const upstream = requestDeadline({ pathname: '/v1/search/paid', now: 10_000, supplied: new Date(20_000).toISOString() });
  assert.equal(Date.parse(upstream.deadlineAt), 20_000);
});

test('supplier circuit opens, rejects cheaply, and admits one successful recovery probe', async () => {
  let now = 0;
  let calls = 0;
  const circuit = new SupplierCircuitBreaker({ threshold: 2, cooldownMs: 1_000, clock: () => now });
  const failing = async () => { calls += 1; throw new Error('supplier_down'); };
  await assert.rejects(circuit.execute('prediction:pdata', failing), /supplier_down/u);
  await assert.rejects(circuit.execute('prediction:pdata', failing), /supplier_down/u);
  assert.equal(circuit.snapshot().open, 1);
  await assert.rejects(circuit.execute('prediction:pdata', async () => { calls += 1; }), /supplier_circuit_open/u);
  assert.equal(calls, 2, 'an open circuit must not call the supplier');

  now = 1_001;
  const recovered = await circuit.execute('prediction:pdata', async () => { calls += 1; return 'healthy'; });
  assert.equal(recovered, 'healthy');
  assert.equal(circuit.snapshot().open, 0);
  assert.equal(calls, 3);
});
