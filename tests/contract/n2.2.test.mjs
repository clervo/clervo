import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTRACT_VERSION,
  MockCommerceKernel,
  sealMockSettlement,
  sealQuote,
  verifyLedgerTransaction,
  verifyMockSettlement,
  verifyReceipt,
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

const payment = (quote) => ({
  mode: 'mock',
  paymentId: 'mock:payment-01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  quoteId: quote.quoteId,
  quoteHash: quote.quoteHash,
  requestHash: quote.requestHash,
  amount: quote.maximumCharge,
});

const settled = (authorization, settlementId) => ({
  settlementId,
  outcome: 'settled',
  referenceHash: `sha256:${'7'.repeat(64)}`,
  observedAt: '2026-07-30T12:01:02.000Z',
});

const executionEvidence = {
  output: { answer: 'mock useful result' },
  supplierCost: { asset: 'mock:usd', amountAtomic: '400', decimals: 6 },
  provenance: [{
    adapterId: 'adapter_mock.search',
    qualificationId: 'qual_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
    providerReferenceHash: `sha256:${'8'.repeat(64)}`,
  }],
};

function paidInput(overrides = {}) {
  const quote = overrides.quote ?? sealQuote(unsignedQuote);
  return {
    idempotencyKey: 'idem_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
    requestHash: quote.requestHash,
    quote,
    payment: payment(quote),
    now: '2026-07-30T12:01:00.000Z',
    authorizationId: 'auth_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
    settlementId: 'settle_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
    ledgerTransactionId: 'ledger_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
    receiptId: 'rcpt_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
    execute: () => executionEvidence,
    settle: (authorization) => settled(authorization, 'settle_01JZ8Q5Y4QFD48Q24H6M5F4K9P'),
    ...overrides,
  };
}

test('complete mock-paid flow verifies, executes, settles, balances, and receipts once', () => {
  const kernel = new MockCommerceKernel();
  let executions = 0;
  const result = kernel.process(paidInput({ execute: () => { executions += 1; return executionEvidence; } }));

  assert.equal(result.kind, 'completed');
  assert.equal(result.replayed, false);
  assert.equal(executions, 1);
  assert.equal(kernel.ledger().length, 1);
  assert.equal(verifyMockSettlement(result.settlement, result.authorization), true);
  assert.equal(verifyLedgerTransaction(result.ledgerTransaction), true);
  assert.equal(verifyReceipt(result.receipt), true);
  assert.equal(result.receipt.customerCharge.amountAtomic, '1000');
  assert.deepEqual(result.ledgerTransaction.postings.map(({ direction, amount }) => [direction, amount.amountAtomic]), [['debit', '1000'], ['credit', '1000']]);
});

test('same idempotency key and request replay stored output without charge or execution', () => {
  const kernel = new MockCommerceKernel();
  let executions = 0;
  const input = paidInput({ execute: () => { executions += 1; return executionEvidence; } });
  const first = kernel.process(input);
  const replay = kernel.process({ ...input, execute: () => { throw new Error('must not execute'); } });

  assert.equal(first.kind, 'completed');
  assert.equal(replay.kind, 'completed');
  assert.equal(replay.replayed, true);
  assert.equal(executions, 1);
  assert.equal(kernel.ledger().length, 1);
  assert.equal(replay.receipt.receiptHash, first.receipt.receiptHash);
});

test('same idempotency key with a different request fails closed', () => {
  const kernel = new MockCommerceKernel();
  const input = paidInput();
  kernel.process(input);
  assert.throws(() => kernel.process({ ...input, requestHash: `sha256:${'9'.repeat(64)}` }), /idempotency_conflict/);
  assert.equal(kernel.ledger().length, 1);
});

test('same mock payment or settlement identity cannot execute under another idempotency key', () => {
  const kernel = new MockCommerceKernel();
  const input = paidInput();
  kernel.process(input);
  let executions = 0;
  assert.throws(() => kernel.process({
    ...input,
    idempotencyKey: 'idem_11JZ8Q5Y4QFD48Q24H6M5F4K9P',
    execute: () => { executions += 1; return executionEvidence; },
  }), /duplicate_payment/);
  assert.equal(executions, 0);
  assert.equal(kernel.ledger().length, 1);
});

test('tampered, expired, over-ceiling, or real-looking payment payloads are rejected before execution', () => {
  for (const mutate of [
    (input) => ({ ...input, payment: { ...input.payment, quoteHash: `sha256:${'9'.repeat(64)}` } }),
    (input) => ({ ...input, now: unsignedQuote.expiresAt }),
    (input) => ({ ...input, payment: { ...input.payment, amount: { ...input.payment.amount, amountAtomic: '1001' } } }),
    (input) => ({ ...input, payment: { ...input.payment, paymentId: '0xreal-payment' } }),
  ]) {
    const kernel = new MockCommerceKernel();
    let executions = 0;
    const input = mutate(paidInput({ execute: () => { executions += 1; return executionEvidence; } }));
    assert.throws(() => kernel.process(input));
    assert.equal(executions, 0);
    assert.equal(kernel.ledger().length, 0);
  }
});

test('unknown settlement is quarantined and retries do not execute or charge again', () => {
  const kernel = new MockCommerceKernel();
  let executions = 0;
  const input = paidInput({
    execute: () => { executions += 1; return executionEvidence; },
    settle: () => ({
      settlementId: 'settle_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
      outcome: 'unknown',
      observedAt: '2026-07-30T12:01:02.000Z',
    }),
  });
  const first = kernel.process(input);
  const retry = kernel.process({ ...input, execute: () => { throw new Error('must not execute'); } });

  assert.equal(first.kind, 'quarantined');
  assert.equal(retry.kind, 'quarantined');
  assert.equal(retry.replayed, true);
  assert.equal(executions, 1);
  assert.equal(kernel.ledger().length, 0);
});

test('definitive reconciliation completes quarantined operation without re-execution', () => {
  const kernel = new MockCommerceKernel();
  const input = paidInput({
    settle: () => ({
      settlementId: 'settle_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
      outcome: 'unknown',
      observedAt: '2026-07-30T12:01:02.000Z',
    }),
  });
  const quarantined = kernel.process(input);
  assert.equal(quarantined.kind, 'quarantined');
  const evidence = sealMockSettlement({
    settlementId: quarantined.settlement.settlementId,
    outcome: 'settled',
    referenceHash: `sha256:${'7'.repeat(64)}`,
    observedAt: '2026-07-30T12:02:00.000Z',
  }, quarantined.authorization);
  const reconciled = kernel.reconcile(input.idempotencyKey, evidence);

  assert.equal(reconciled.kind, 'completed');
  assert.equal(kernel.ledger().length, 1);
  const replay = kernel.process(input);
  assert.equal(replay.kind, 'completed');
  assert.equal(replay.replayed, true);
});

test('reconciliation rejects unknown, mismatched, or tampered evidence and leaves ledger empty', () => {
  const kernel = new MockCommerceKernel();
  const input = paidInput({
    settle: () => ({
      settlementId: 'settle_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
      outcome: 'unknown',
      observedAt: '2026-07-30T12:01:02.000Z',
    }),
  });
  const quarantined = kernel.process(input);
  assert.equal(quarantined.kind, 'quarantined');
  assert.throws(() => kernel.reconcile(input.idempotencyKey, quarantined.settlement), /definitive/);

  const settledEvidence = sealMockSettlement({
    settlementId: quarantined.settlement.settlementId,
    outcome: 'settled',
    referenceHash: `sha256:${'7'.repeat(64)}`,
    observedAt: '2026-07-30T12:02:00.000Z',
  }, quarantined.authorization);
  assert.throws(() => kernel.reconcile(input.idempotencyKey, { ...settledEvidence, settlementHash: `sha256:${'0'.repeat(64)}` }), /settlement_hash_invalid/);
  assert.equal(kernel.ledger().length, 0);
});