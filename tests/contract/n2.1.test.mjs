import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTRACT_VERSION,
  PAYMENT_REQUIRED_HEADER,
  assertMockPaymentRequired,
  createMockChallengeResponse,
  createMockPaymentRequired,
  encodePaymentRequired,
  sealQuote,
  verifyQuote,
} from '../../dist/packages/contracts/src/index.js';

const unsignedQuote = {
  contractVersion: CONTRACT_VERSION,
  quoteId: 'quote_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  operationId: 'op_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  productId: 'search.web',
  requestHash: `sha256:${'1'.repeat(64)}`,
  priceVersion: '2026-07-30.1',
  maximumCharge: { asset: 'mock:usdc', amountAtomic: '1000', decimals: 6 },
  issuedAt: '2026-07-30T12:00:00.000Z',
  expiresAt: '2026-07-30T12:05:00.000Z',
};

const challengeInput = (quote = sealQuote(unsignedQuote)) => ({
  quote,
  resourceUrl: 'https://api.clervo.dev/operations/search.web',
  description: 'Mock payment challenge for search.web',
  network: 'mock:local',
  asset: 'mock:usdc',
  payTo: 'mock:nonpayable-test-only',
  maxTimeoutSeconds: 60,
  now: '2026-07-30T12:01:00.000Z',
});

test('quotes deterministically bind request, product, price version, ceiling, and expiry', () => {
  const quote = sealQuote(unsignedQuote);
  assert.equal(verifyQuote(quote), true);
  assert.equal(sealQuote({ ...unsignedQuote, maximumCharge: { ...unsignedQuote.maximumCharge } }).quoteHash, quote.quoteHash);
  assert.equal(verifyQuote({ ...quote, requestHash: `sha256:${'9'.repeat(64)}` }), false);
  assert.equal(verifyQuote({ ...quote, maximumCharge: { ...quote.maximumCharge, amountAtomic: '1001' } }), false);
});

test('quote construction rejects invalid or non-increasing timestamps', () => {
  assert.throws(() => sealQuote({ ...unsignedQuote, expiresAt: unsignedQuote.issuedAt }), /expiry must be after issuance/);
  assert.throws(() => sealQuote({ ...unsignedQuote, issuedAt: 'not-a-date' }), /RFC 3339/);
});

test('mock challenge is x402 v2, maximum-charge bound, and explicitly non-payable', () => {
  const quote = sealQuote(unsignedQuote);
  const challenge = createMockPaymentRequired(challengeInput(quote));
  assert.equal(challenge.x402Version, 2);
  assert.equal(challenge.accepts[0].amount, quote.maximumCharge.amountAtomic);
  assert.equal(challenge.accepts[0].extra.clervo.quoteHash, quote.quoteHash);
  assert.equal(challenge.accepts[0].extra.payable, false);
  assert.deepEqual(challenge.extensions.clervo, {
    mode: 'mock',
    paymentSignatureAccepted: false,
    verificationImplemented: false,
    facilitatorConfigured: false,
    authorizationImplemented: false,
    settlementImplemented: false,
    executionAllowed: false,
  });
});

test('HTTP mock response uses canonical 402 header with deterministic base64 JSON', () => {
  const response = createMockChallengeResponse(challengeInput());
  assert.equal(response.status, 402);
  assert.deepEqual(JSON.parse(Buffer.from(response.headers[PAYMENT_REQUIRED_HEADER], 'base64').toString('utf8')), response.body);
  assert.equal(response.headers[PAYMENT_REQUIRED_HEADER], encodePaymentRequired(response.body));
});

test('expired quotes and timeouts beyond quote expiry fail closed', () => {
  assert.throws(() => createMockPaymentRequired({ ...challengeInput(), now: unsignedQuote.expiresAt }), /quote_expired/);
  assert.throws(() => createMockPaymentRequired({ ...challengeInput(), maxTimeoutSeconds: 241 }), /timeout_exceeds_quote_expiry/);
  const longQuote = sealQuote({ ...unsignedQuote, expiresAt: '2026-07-30T14:00:00.000Z' });
  assert.throws(() => createMockPaymentRequired({ ...challengeInput(longQuote), maxTimeoutSeconds: 3601 }), /timeout_exceeds_quote_expiry/);
});

test('asset mismatch and non-mock payee fail before a challenge is emitted', () => {
  assert.throws(() => createMockPaymentRequired({ ...challengeInput(), asset: 'mock:other' }), /asset_differs_from_quote/);
  assert.throws(() => createMockPaymentRequired({ ...challengeInput(), payTo: '0xreal-looking-address' }), /mock_pay_to_required/);
});

test('injected payment readiness or altered bindings are rejected', () => {
  const quote = sealQuote(unsignedQuote);
  const challenge = structuredClone(createMockPaymentRequired(challengeInput(quote)));
  challenge.extensions.clervo.verificationImplemented = true;
  assert.throws(() => assertMockPaymentRequired(challenge, quote, challengeInput().now), /must_not_claim_payment_readiness/);

  const altered = structuredClone(createMockPaymentRequired(challengeInput(quote)));
  altered.accepts[0].extra.clervo.requestHash = `sha256:${'8'.repeat(64)}`;
  assert.throws(() => assertMockPaymentRequired(altered, quote, challengeInput().now), /request_binding_invalid/);
});