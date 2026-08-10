import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import worker from '../../apps/b10-proof-worker/src/index.js';

const searchRequest = Object.freeze({ query: 'Python programming', maxResults: 3, synthesize: false, language: 'en', region: 'US' });
const searchPath = 'https://clervo.dev/proof/b10-search';
const payer = '0x1ada6E2EACb799f16bfC1A395c06D7fb52369207';
const workerConfiguration = JSON.parse(await readFile('apps/b10-proof-worker/wrangler.jsonc', 'utf8'));

function request(path, options = {}) {
  return new Request(`${searchPath}${path}`, options);
}

const assets = { ASSETS: { fetch: () => { throw new Error('assets_not_expected'); } } };

test('B10 hosted proof pins the payer, facilitator, proxy boundary, and reconciled key', async () => {
  assert.deepEqual(workerConfiguration.compatibility_flags, ['global_fetch_strictly_public']);
  const response = await worker.fetch(request('/config'), assets);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    network: 'eip155:8453',
    chainIdHex: '0x2105',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    amountAtomic: '6000',
    amountDisplay: '0.006 USDC',
    payTo: '0xBd11d82d8Dbd01Ba3eed279d3bACf74659fFca28',
    payer,
    facilitator: 'https://api.cdp.coinbase.com/platform/v2/x402',
    payerBalanceCapAtomic: '32000',
    supplierCostCeilingAtomic: '0',
    productId: 'search.web',
    resource: 'https://api.clervo.dev/v1/search/paid',
    idempotencyKey: 'idem_b10_search_proof_20260810e',
    request: searchRequest,
  });
});

test('B10 hosted proof forwards an unsigned challenge as an exact guarded POST', async () => {
  const original = globalThis.fetch;
  let observed;
  globalThis.fetch = async (input, init) => {
    observed = new Request(input, init);
    return new Response(JSON.stringify({ quote: { productId: 'search.web' } }), {
      status: 402,
      headers: { 'content-type': 'application/json', 'payment-required': 'bounded' },
    });
  };
  try {
    const response = await worker.fetch(request('/api/paid-operation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'idem_b10_search_proof_20260810e' },
      body: JSON.stringify(searchRequest),
    }), assets);
    assert.equal(response.status, 402);
    assert.equal(response.headers.get('payment-required'), 'bounded');
    assert.equal(observed.url, 'https://api.clervo.dev/v1/search/paid');
    assert.equal(observed.method, 'POST');
    assert.equal(observed.headers.get('idempotency-key'), 'idem_b10_search_proof_20260810e');
    assert.deepEqual(await observed.json(), searchRequest);
  } finally {
    globalThis.fetch = original;
  }
});

test('B10 hosted proof refuses a signed payload from any payer except the approved owner', async () => {
  const original = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => { upstreamCalls += 1; return new Response('{}'); };
  const payment = Buffer.from(JSON.stringify({
    x402Version: 2,
    accepted: { scheme: 'exact', network: 'eip155:8453' },
    payload: { authorization: { from: '0x0000000000000000000000000000000000000001' } },
  }), 'utf8').toString('base64');
  try {
    const response = await worker.fetch(request('/api/paid-operation', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'idem_b10_search_proof_20260810e',
        'payment-signature': payment,
      },
      body: JSON.stringify(searchRequest),
    }), assets);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: 'payment_payer_refused' });
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('B10 hosted proof forwards the actual x402 v2 signed-header shape for the approved payer', async () => {
  const original = globalThis.fetch;
  let observed;
  globalThis.fetch = async (input, init) => {
    observed = new Request(input, init);
    return new Response(JSON.stringify({ operationId: 'op_test' }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'payment-response': 'bounded' },
    });
  };
  const payment = Buffer.from(JSON.stringify({
    x402Version: 2,
    accepted: { scheme: 'exact', network: 'eip155:8453' },
    payload: { authorization: { from: payer }, signature: '0xtest' },
  }), 'utf8').toString('base64');
  try {
    const response = await worker.fetch(request('/api/paid-operation', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'idem_b10_search_proof_20260810e',
        'payment-signature': payment,
      },
      body: JSON.stringify(searchRequest),
    }), assets);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('payment-response'), 'bounded');
    assert.equal(observed.headers.get('payment-signature'), payment);
    assert.equal(observed.headers.get('idempotency-key'), 'idem_b10_search_proof_20260810e');
  } finally {
    globalThis.fetch = original;
  }
});

test('B10 hosted proof never accepts a non-POST paid-operation request', async () => {
  const response = await worker.fetch(request('/api/paid-operation'), assets);
  assert.equal(response.status, 404);
});
