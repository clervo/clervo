import type { Quote } from './commerce.js';
import { isQuoteExpired, verifyQuote } from './commerce.js';
import { decideIdempotency, validateIdempotencyKey } from './idempotency.js';
import { hashJson, sealReceipt, type OperationReceipt } from './receipt.js';
import type { AssetAmount, JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export type LedgerDirection = 'debit' | 'credit';

export interface LedgerPosting {
  account: 'mock_customer_funds' | 'merchant_receivable';
  direction: LedgerDirection;
  amount: AssetAmount;
}

export interface LedgerTransaction {
  contractVersion: typeof CONTRACT_VERSION;
  transactionId: string;
  operationId: string;
  settlementId: string;
  occurredAt: string;
  postings: readonly [LedgerPosting, LedgerPosting];
  previousTransactionHash?: string;
  transactionHash: string;
}

export type UnsignedLedgerTransaction = Omit<LedgerTransaction, 'transactionHash'>;

export interface MockPaymentPayload {
  mode: 'mock';
  paymentId: string;
  quoteId: string;
  quoteHash: string;
  requestHash: string;
  amount: AssetAmount;
}

export interface MockAuthorization {
  contractVersion: typeof CONTRACT_VERSION;
  authorizationId: string;
  paymentId: string;
  operationId: string;
  quoteId: string;
  quoteHash: string;
  requestHash: string;
  amount: AssetAmount;
  verifiedAt: string;
  authorizationHash: string;
}

export interface MockSettlement {
  contractVersion: typeof CONTRACT_VERSION;
  settlementId: string;
  operationId: string;
  authorizationHash: string;
  amount: AssetAmount;
  outcome: 'settled' | 'unknown';
  referenceHash?: string;
  observedAt: string;
  settlementHash: string;
}

export interface MockExecutionEvidence {
  output: JsonValue;
  supplierCost: AssetAmount;
  provenance: OperationReceipt['provenance'];
}

export interface MockPaidOperationInput {
  idempotencyKey: string;
  requestHash: string;
  quote: Quote;
  payment: MockPaymentPayload;
  now: string;
  authorizationId: string;
  settlementId: string;
  ledgerTransactionId: string;
  receiptId: string;
  execute: () => MockExecutionEvidence;
  settle: (authorization: MockAuthorization) => Omit<MockSettlement, 'contractVersion' | 'operationId' | 'authorizationHash' | 'amount' | 'settlementHash'>;
}

export interface MockAsyncPaidOperationInput extends Omit<MockPaidOperationInput, 'execute'> {
  execute: () => Promise<MockExecutionEvidence>;
}

export type MockPaidOperationResult =
  | {
      kind: 'completed';
      replayed: boolean;
      output: JsonValue;
      authorization: MockAuthorization;
      settlement: MockSettlement;
      ledgerTransaction: LedgerTransaction;
      receipt: OperationReceipt;
    }
  | {
      kind: 'quarantined';
      replayed: boolean;
      operationId: string;
      reason: 'settlement_unknown';
      authorization: MockAuthorization;
      settlement: MockSettlement;
    };

interface StoredOperation {
  requestHash: string;
  quote: Quote;
  output: JsonValue;
  evidence: MockExecutionEvidence;
  authorization: MockAuthorization;
  settlement: MockSettlement;
  result: MockPaidOperationResult;
  ledgerTransactionId: string;
  receiptId: string;
}

export class MockCommerceKernel {
  readonly #operations = new Map<string, StoredOperation>();
  readonly #ledger: LedgerTransaction[] = [];
  readonly #paymentIds = new Set<string>();
  readonly #settlementIds = new Set<string>();

  process(input: MockPaidOperationInput): MockPaidOperationResult {
    validateIdempotencyKey(input.idempotencyKey);
    const stored = this.#operations.get(input.idempotencyKey);
    const decision = decideIdempotency(input.requestHash, stored && {
      operationId: stored.quote.operationId,
      requestHash: stored.requestHash,
      terminal: stored.result.kind === 'completed',
    });
    if (decision.kind === 'conflict') throw new TypeError('idempotency_conflict');
    if (decision.kind === 'replay') return replayResult(stored!.result);
    if (decision.kind === 'in_progress') return replayResult(stored!.result);

    assertPaidInput(input);
    const authorization = verifyMockPayment(input);
    this.#claimPaymentId(authorization.paymentId);
    this.#claimSettlementId(input.settlementId);
    const evidence = input.execute();
    const settlement = sealMockSettlement(input.settle(authorization), authorization, input.settlementId);

    if (settlement.outcome === 'unknown') {
      const result: MockPaidOperationResult = Object.freeze({
        kind: 'quarantined',
        replayed: false,
        operationId: input.quote.operationId,
        reason: 'settlement_unknown',
        authorization,
        settlement,
      });
      this.#operations.set(input.idempotencyKey, {
        requestHash: input.requestHash,
        quote: input.quote,
        output: evidence.output,
        evidence,
        authorization,
        settlement,
        result,
        ledgerTransactionId: input.ledgerTransactionId,
        receiptId: input.receiptId,
      });
      return result;
    }

    const result = this.#complete(input.quote, input.requestHash, evidence, authorization, settlement, input.ledgerTransactionId, input.receiptId, false);
    this.#operations.set(input.idempotencyKey, {
      requestHash: input.requestHash,
      quote: input.quote,
      output: evidence.output,
      evidence,
      authorization,
      settlement,
      result,
      ledgerTransactionId: input.ledgerTransactionId,
      receiptId: input.receiptId,
    });
    return result;
  }

  async processAsync(input: MockAsyncPaidOperationInput): Promise<MockPaidOperationResult> {
    validateIdempotencyKey(input.idempotencyKey);
    const stored = this.#operations.get(input.idempotencyKey);
    const decision = decideIdempotency(input.requestHash, stored && {
      operationId: stored.quote.operationId,
      requestHash: stored.requestHash,
      terminal: stored.result.kind === 'completed',
    });
    if (decision.kind === 'conflict') throw new TypeError('idempotency_conflict');
    if (decision.kind === 'replay') return replayResult(stored!.result);
    if (decision.kind === 'in_progress') return replayResult(stored!.result);

    assertPaidInput(input);
    const authorization = verifyMockPayment(input);
    this.#claimPaymentId(authorization.paymentId);
    this.#claimSettlementId(input.settlementId);
    let evidence: MockExecutionEvidence;
    try {
      evidence = await input.execute();
    } catch (error) {
      this.#paymentIds.delete(authorization.paymentId);
      this.#settlementIds.delete(input.settlementId);
      throw error;
    }
    const settlement = sealMockSettlement(input.settle(authorization), authorization, input.settlementId);

    if (settlement.outcome === 'unknown') {
      const result: MockPaidOperationResult = Object.freeze({
        kind: 'quarantined',
        replayed: false,
        operationId: input.quote.operationId,
        reason: 'settlement_unknown',
        authorization,
        settlement,
      });
      this.#operations.set(input.idempotencyKey, {
        requestHash: input.requestHash,
        quote: input.quote,
        output: evidence.output,
        evidence,
        authorization,
        settlement,
        result,
        ledgerTransactionId: input.ledgerTransactionId,
        receiptId: input.receiptId,
      });
      return result;
    }

    const result = this.#complete(input.quote, input.requestHash, evidence, authorization, settlement, input.ledgerTransactionId, input.receiptId, false);
    this.#operations.set(input.idempotencyKey, {
      requestHash: input.requestHash,
      quote: input.quote,
      output: evidence.output,
      evidence,
      authorization,
      settlement,
      result,
      ledgerTransactionId: input.ledgerTransactionId,
      receiptId: input.receiptId,
    });
    return result;
  }

  reconcile(idempotencyKey: string, evidence: MockSettlement): MockPaidOperationResult {
    const stored = this.#operations.get(idempotencyKey);
    if (!stored || stored.result.kind !== 'quarantined') throw new TypeError('operation_not_quarantined');
    assertSettlement(evidence, stored.authorization);
    if (evidence.outcome !== 'settled') throw new TypeError('reconciliation_requires_definitive_settlement');
    if (evidence.settlementId !== stored.settlement.settlementId) throw new TypeError('settlement_id_mismatch');

    const result = this.#complete(
      stored.quote,
      stored.requestHash,
      stored.evidence,
      stored.authorization,
      evidence,
      stored.ledgerTransactionId,
      stored.receiptId,
      false,
    );
    stored.settlement = evidence;
    stored.result = result;
    return result;
  }

  ledger(): readonly LedgerTransaction[] {
    return Object.freeze([...this.#ledger]);
  }

  #claimSettlementId(settlementId: string): void {
    if (this.#settlementIds.has(settlementId)) throw new TypeError('duplicate_settlement');
    this.#settlementIds.add(settlementId);
  }

  #claimPaymentId(paymentId: string): void {
    if (this.#paymentIds.has(paymentId)) throw new TypeError('duplicate_payment');
    this.#paymentIds.add(paymentId);
  }

  #complete(
    quote: Quote,
    requestHash: string,
    evidence: MockExecutionEvidence,
    authorization: MockAuthorization,
    settlement: MockSettlement,
    ledgerTransactionId: string,
    receiptId: string,
    replayed: boolean,
  ): Extract<MockPaidOperationResult, { kind: 'completed' }> {
    if (settlement.outcome !== 'settled' || !settlement.referenceHash) throw new TypeError('definitive_settlement_required');
    const ledgerTransaction = sealLedgerTransaction({
      contractVersion: CONTRACT_VERSION,
      transactionId: ledgerTransactionId,
      operationId: quote.operationId,
      settlementId: settlement.settlementId,
      occurredAt: settlement.observedAt,
      postings: [
        { account: 'mock_customer_funds', direction: 'debit', amount: quote.maximumCharge },
        { account: 'merchant_receivable', direction: 'credit', amount: quote.maximumCharge },
      ],
      ...(this.#ledger.at(-1) ? { previousTransactionHash: this.#ledger.at(-1)!.transactionHash } : {}),
    });
    this.#ledger.push(ledgerTransaction);
    const receipt = sealReceipt({
      contractVersion: CONTRACT_VERSION,
      receiptId,
      operationId: quote.operationId,
      productId: quote.productId,
      requestHash,
      quoteId: quote.quoteId,
      quoteHash: quote.quoteHash,
      fundingMode: 'paid',
      customerCharge: quote.maximumCharge,
      supplierCost: evidence.supplierCost,
      settlement: { status: 'settled', referenceHash: settlement.referenceHash },
      resultHash: hashJson(evidence.output),
      provenance: evidence.provenance,
      completedAt: settlement.observedAt,
    });
    return Object.freeze({ kind: 'completed', replayed, output: evidence.output, authorization, settlement, ledgerTransaction, receipt });
  }
}

export function ledgerTransactionHash(transaction: UnsignedLedgerTransaction): string {
  return hashJson(transaction as unknown as JsonValue);
}

export function sealLedgerTransaction(transaction: UnsignedLedgerTransaction): Readonly<LedgerTransaction> {
  assertBalancedPostings(transaction.postings);
  return Object.freeze({ ...transaction, postings: Object.freeze([...transaction.postings]) as unknown as readonly [LedgerPosting, LedgerPosting], transactionHash: ledgerTransactionHash(transaction) });
}

export function verifyLedgerTransaction(transaction: LedgerTransaction): boolean {
  const { transactionHash: claimed, ...unsigned } = transaction;
  try {
    assertBalancedPostings(unsigned.postings);
    return claimed === ledgerTransactionHash(unsigned);
  } catch {
    return false;
  }
}

export function verifyMockPayment(input: Pick<MockPaidOperationInput, 'quote' | 'payment' | 'requestHash' | 'now' | 'authorizationId'>): Readonly<MockAuthorization> {
  const { quote, payment } = input;
  if (!verifyQuote(quote)) throw new TypeError('quote_hash_invalid');
  if (isQuoteExpired(quote, input.now)) throw new TypeError('quote_expired');
  if (input.requestHash !== quote.requestHash || payment.requestHash !== quote.requestHash) throw new TypeError('payment_request_binding_invalid');
  if (payment.mode !== 'mock' || !payment.paymentId.startsWith('mock:')) throw new TypeError('mock_payment_required');
  if (payment.quoteId !== quote.quoteId || payment.quoteHash !== quote.quoteHash) throw new TypeError('payment_quote_binding_invalid');
  if (!sameAmount(payment.amount, quote.maximumCharge)) throw new TypeError('payment_amount_must_equal_quote');
  const unsigned = {
    contractVersion: CONTRACT_VERSION,
    authorizationId: input.authorizationId,
    paymentId: payment.paymentId,
    operationId: quote.operationId,
    quoteId: quote.quoteId,
    quoteHash: quote.quoteHash,
    requestHash: quote.requestHash,
    amount: quote.maximumCharge,
    verifiedAt: input.now,
  };
  return Object.freeze({ ...unsigned, authorizationHash: hashJson(unsigned as unknown as JsonValue) });
}

export function sealMockSettlement(
  settlement: Omit<MockSettlement, 'contractVersion' | 'operationId' | 'authorizationHash' | 'amount' | 'settlementHash'>,
  authorization: MockAuthorization,
  expectedSettlementId = settlement.settlementId,
): Readonly<MockSettlement> {
  if (settlement.settlementId !== expectedSettlementId) throw new TypeError('settlement_id_mismatch');
  const unsigned = {
    contractVersion: CONTRACT_VERSION,
    settlementId: settlement.settlementId,
    operationId: authorization.operationId,
    authorizationHash: authorization.authorizationHash,
    amount: authorization.amount,
    outcome: settlement.outcome,
    ...(settlement.referenceHash ? { referenceHash: settlement.referenceHash } : {}),
    observedAt: settlement.observedAt,
  };
  assertSettlementShape(unsigned);
  return Object.freeze({ ...unsigned, settlementHash: hashJson(unsigned as unknown as JsonValue) });
}

export function verifyMockSettlement(settlement: MockSettlement, authorization: MockAuthorization): boolean {
  try {
    assertSettlement(settlement, authorization);
    return true;
  } catch {
    return false;
  }
}

function assertPaidInput(input: Pick<MockPaidOperationInput, 'requestHash' | 'quote' | 'now'>): void {
  if (input.requestHash !== input.quote.requestHash) throw new TypeError('request_hash_differs_from_quote');
  if (!Number.isFinite(Date.parse(input.now))) throw new TypeError('now_must_be_date_time');
}

function assertBalancedPostings(postings: readonly LedgerPosting[]): void {
  if (postings.length !== 2) throw new TypeError('ledger_transaction_requires_two_postings');
  const [debit, credit] = postings;
  if (!debit || !credit || debit.direction !== 'debit' || credit.direction !== 'credit') throw new TypeError('ledger_requires_debit_and_credit');
  if (!sameAmount(debit.amount, credit.amount)) throw new TypeError('ledger_transaction_unbalanced');
}

function assertSettlement(settlement: MockSettlement, authorization: MockAuthorization): void {
  const { settlementHash: claimed, ...unsigned } = settlement;
  assertSettlementShape(unsigned);
  if (settlement.operationId !== authorization.operationId || settlement.authorizationHash !== authorization.authorizationHash || !sameAmount(settlement.amount, authorization.amount)) {
    throw new TypeError('settlement_authorization_binding_invalid');
  }
  if (claimed !== hashJson(unsigned as unknown as JsonValue)) throw new TypeError('settlement_hash_invalid');
}

function assertSettlementShape(settlement: Omit<MockSettlement, 'settlementHash'>): void {
  if (settlement.outcome === 'settled' && !settlement.referenceHash) throw new TypeError('settled_reference_required');
  if (settlement.outcome === 'unknown' && settlement.referenceHash) throw new TypeError('unknown_settlement_must_not_claim_reference');
  if (!Number.isFinite(Date.parse(settlement.observedAt))) throw new TypeError('settlement_time_invalid');
}

function sameAmount(left: AssetAmount, right: AssetAmount): boolean {
  return left.asset === right.asset && left.amountAtomic === right.amountAtomic && left.decimals === right.decimals;
}

function replayResult(result: MockPaidOperationResult): MockPaidOperationResult {
  return Object.freeze({ ...result, replayed: true });
}