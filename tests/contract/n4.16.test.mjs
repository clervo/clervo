import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SEARCH_PAID_PATH,
  SEARCH_PRODUCT_PRICING,
  createDiscoveryDocument,
  normalizeSearchHttpRequest,
  searchHttpRequestHash,
  searchProductId,
} from '../../dist/packages/contracts/src/index.js';
import { createRecordedSearchExecutor } from '../../dist/services/search/src/recorded-pipeline.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';

const now = '2026-07-30T23:58:00.000Z';

async function withServer(options, run) {
  const server = createSearchServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function post(origin, key, body, payment) {
  return fetch(`${origin}${SEARCH_PAID_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      ...(payment === undefined ? {} : { 'x-clervo-mock-payment': Buffer.from(JSON.stringify(payment)).toString('base64') }),
    },
    body: JSON.stringify(body),
  });
}

function payment(quote, paymentId) {
  return { mode: 'mock', paymentId, quoteId: quote.quoteId, quoteHash: quote.quoteHash, requestHash: quote.requestHash, amount: quote.maximumCharge };
}

test('synthesis mode selects an exact product identity with a distinct fixed price and request hash', () => {
  const raw = normalizeSearchHttpRequest({ query: 'pricing evidence', synthesize: false });
  const synthesis = normalizeSearchHttpRequest({ query: 'pricing evidence', synthesize: true });
  assert.equal(searchProductId(raw), 'search.web');
  assert.equal(searchProductId(synthesis), 'search.answer');
  assert.deepEqual(SEARCH_PRODUCT_PRICING['search.web'], { priceVersion: 'search-web-candidate-2', maximumCharge: { asset: 'mock:usdc', amountAtomic: '6000', decimals: 6 } });
  assert.deepEqual(SEARCH_PRODUCT_PRICING['search.answer'], { priceVersion: 'search-answer-candidate-2', maximumCharge: { asset: 'mock:usdc', amountAtomic: '12000', decimals: 6 } });
  assert.notEqual(searchHttpRequestHash(raw, SEARCH_PAID_PATH), searchHttpRequestHash(synthesis, SEARCH_PAID_PATH));
});

test('discovery publishes raw retrieval and synthesis as separate price-bound products', () => {
  const discovery = createDiscoveryDocument();
  assert.deepEqual(discovery.products.map((product) => ({
    productId: product.productId,
    synthesize: product.selection.synthesize,
    amountAtomic: product.pricing.displayPrice.amountAtomic,
    priceVersion: product.pricing.priceVersion,
  })), [
    { productId: 'search.web', synthesize: false, amountAtomic: '6000', priceVersion: 'search-web-candidate-2' },
    { productId: 'search.answer', synthesize: true, amountAtomic: '12000', priceVersion: 'search-answer-candidate-2' },
  ]);
});

test('paid challenges bind exact product, price version, maximum charge, and canonical request identity', async () => {
  await withServer({ executor: createRecordedSearchExecutor(), now: () => now }, async (origin) => {
    const rawResponse = await post(origin, 'idem_n416_quote_raw', { query: 'priced evidence', synthesize: false });
    const synthesisResponse = await post(origin, 'idem_n416_quote_syn', { query: 'priced evidence', synthesize: true });
    assert.equal(rawResponse.status, 402);
    assert.equal(synthesisResponse.status, 402);
    const raw = await rawResponse.json();
    const synthesis = await synthesisResponse.json();
    assert.deepEqual([raw.quote.productId, raw.quote.priceVersion, raw.quote.maximumCharge.amountAtomic], ['search.web', 'search-web-candidate-2', '6000']);
    assert.deepEqual([synthesis.quote.productId, synthesis.quote.priceVersion, synthesis.quote.maximumCharge.amountAtomic], ['search.answer', 'search-answer-candidate-2', '12000']);
    assert.notEqual(raw.quote.requestHash, synthesis.quote.requestHash);
    assert.equal(raw.accepts[0].amount, '6000');
    assert.equal(synthesis.accepts[0].amount, '12000');
  });
});

test('completed raw and synthesis operations receipt the exact selected catalog identity and charge', async () => {
  await withServer({ executor: createRecordedSearchExecutor(), now: () => now, allowMockPaidExecution: true }, async (origin) => {
    for (const [suffix, body, expected] of [
      ['raw', { query: 'receipt pricing', synthesize: false }, ['search.web', '6000']],
      ['syn', { query: 'receipt pricing', synthesize: true }, ['search.answer', '12000']],
    ]) {
      const key = `idem_n416_receipt_${suffix}`;
      const challenged = await post(origin, key, body);
      const { quote } = await challenged.json();
      const completed = await post(origin, key, body, payment(quote, `mock:payment-n416-${suffix}`));
      assert.equal(completed.status, 200);
      const result = await completed.json();
      assert.deepEqual([result.productId, result.receipt.productId, result.receipt.customerCharge.amountAtomic], [expected[0], expected[0], expected[1]]);
      assert.equal(result.receipt.requestHash, quote.requestHash);
      assert.equal(result.receipt.quoteHash, quote.quoteHash);
    }
  });
});

test('a quote or payment from one product cannot authorize the other product', async () => {
  const executor = createRecordedSearchExecutor();
  await withServer({ executor, now: () => now, allowMockPaidExecution: true }, async (origin) => {
    const rawChallenge = await post(origin, 'idem_n416_cross_quote', { query: 'cross product', synthesize: false });
    const { quote } = await rawChallenge.json();
    const rejected = await post(origin, 'idem_n416_cross_payment', { query: 'cross product', synthesize: true }, payment(quote, 'mock:payment-n416-cross'));
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).code, /payment_(?:request|quote)_binding_invalid/u);
    assert.equal(executor.calls, 0);
  });
});

test('a completed idempotency key cannot replay across raw and synthesis products', async () => {
  const executor = createRecordedSearchExecutor();
  await withServer({ executor, now: () => now, allowMockPaidExecution: true }, async (origin) => {
    const key = 'idem_n416_cross_idem';
    const rawBody = { query: 'idempotent product', synthesize: false };
    const challenged = await post(origin, key, rawBody);
    const { quote } = await challenged.json();
    assert.equal((await post(origin, key, rawBody, payment(quote, 'mock:payment-n416-idem'))).status, 200);
    const conflict = await post(origin, key, { query: 'idempotent product', synthesize: true });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).code, 'idempotency_conflict');
    assert.equal(executor.calls, 1);
  });
});
