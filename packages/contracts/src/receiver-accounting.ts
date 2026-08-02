import { hashJson } from './receipt.js';
import type { AssetAmount, JsonValue } from './types.js';

export const RECEIVER_ACCOUNTING_VERSION = 'clervo.receiver-accounting.v1' as const;

export type ReceiverAccount =
  | 'settlement_clearing'
  | 'receiver_available'
  | 'supplier_expense'
  | 'supplier_payable';

export interface ReceiverAccountingPosting {
  account: ReceiverAccount;
  direction: 'debit' | 'credit';
  amount: AssetAmount;
}

export interface ReceiverAccountingInput {
  settlementId: string;
  operationId: string;
  authorizationId: string;
  receiptHash: string;
  settlementReferenceHash: string;
  customerCharge: AssetAmount;
  supplierCost: AssetAmount;
  occurredAt: string;
}

export interface ReceiverAccountingEntry {
  schemaVersion: typeof RECEIVER_ACCOUNTING_VERSION;
  entryId: string;
  settlementId: string;
  operationId: string;
  authorizationId: string;
  receiptHash: string;
  settlementReferenceHash: string;
  postings: readonly [
    ReceiverAccountingPosting,
    ReceiverAccountingPosting,
    ReceiverAccountingPosting,
    ReceiverAccountingPosting,
  ];
  occurredAt: string;
  previousEntryHash?: string;
  inputHash: string;
  entryHash: string;
}

export interface ReceiverAccountingReconciliation {
  schemaVersion: typeof RECEIVER_ACCOUNTING_VERSION;
  entryCount: number;
  uniqueOperationCount: number;
  uniqueSettlementCount: number;
  headHash: string | null;
  balanced: true;
  totals: Readonly<Record<string, Readonly<{
    customerChargeAtomic: string;
    supplierCostAtomic: string;
  }>>>;
}

type UnsignedEntry = Omit<ReceiverAccountingEntry, 'entryHash'>;

export class ReceiverAccountingJournal {
  readonly #entries: ReceiverAccountingEntry[] = [];
  readonly #bySettlement = new Map<string, ReceiverAccountingEntry>();
  readonly #operationIds = new Set<string>();

  record(input: ReceiverAccountingInput): Readonly<{
    kind: 'recorded' | 'replay';
    entry: Readonly<ReceiverAccountingEntry>;
  }> {
    assertInput(input);
    const inputHash = receiverAccountingInputHash(input);
    const existing = this.#bySettlement.get(input.settlementId);
    if (existing) {
      if (existing.inputHash !== inputHash) throw new TypeError('receiver_accounting_settlement_conflict');
      return Object.freeze({ kind: 'replay', entry: existing });
    }
    if (this.#operationIds.has(input.operationId)) throw new TypeError('receiver_accounting_operation_already_recorded');
    const previousEntryHash = this.#entries.at(-1)?.entryHash;
    const postings = Object.freeze([
      posting('settlement_clearing', 'debit', input.customerCharge),
      posting('receiver_available', 'credit', input.customerCharge),
      posting('supplier_expense', 'debit', input.supplierCost),
      posting('supplier_payable', 'credit', input.supplierCost),
    ]) as ReceiverAccountingEntry['postings'];
    const unsigned: UnsignedEntry = {
      schemaVersion: RECEIVER_ACCOUNTING_VERSION,
      entryId: receiverEntryId(input),
      settlementId: input.settlementId,
      operationId: input.operationId,
      authorizationId: input.authorizationId,
      receiptHash: input.receiptHash,
      settlementReferenceHash: input.settlementReferenceHash,
      postings,
      occurredAt: input.occurredAt,
      ...(previousEntryHash ? { previousEntryHash } : {}),
      inputHash,
    };
    const entry = Object.freeze({ ...unsigned, entryHash: hashJson(unsigned as unknown as JsonValue) });
    if (!verifyReceiverAccountingEntry(entry)) throw new TypeError('receiver_accounting_entry_invalid');
    this.#entries.push(entry);
    this.#bySettlement.set(input.settlementId, entry);
    this.#operationIds.add(input.operationId);
    return Object.freeze({ kind: 'recorded', entry });
  }

  entries(): readonly Readonly<ReceiverAccountingEntry>[] {
    return Object.freeze([...this.#entries]);
  }

  reconcile(): Readonly<ReceiverAccountingReconciliation> {
    const totals = new Map<string, { customerChargeAtomic: bigint; supplierCostAtomic: bigint }>();
    let previousEntryHash: string | undefined;
    for (const entry of this.#entries) {
      if (!verifyReceiverAccountingEntry(entry)) throw new TypeError('receiver_accounting_integrity_failure');
      if (entry.previousEntryHash !== previousEntryHash) throw new TypeError('receiver_accounting_chain_failure');
      previousEntryHash = entry.entryHash;
      const customer = entry.postings[0].amount;
      const supplier = entry.postings[2].amount;
      const customerKey = assetKey(customer);
      const supplierKey = assetKey(supplier);
      const customerTotals = totals.get(customerKey) ?? { customerChargeAtomic: 0n, supplierCostAtomic: 0n };
      customerTotals.customerChargeAtomic += BigInt(customer.amountAtomic);
      totals.set(customerKey, customerTotals);
      const supplierTotals = totals.get(supplierKey) ?? { customerChargeAtomic: 0n, supplierCostAtomic: 0n };
      supplierTotals.supplierCostAtomic += BigInt(supplier.amountAtomic);
      totals.set(supplierKey, supplierTotals);
    }
    return Object.freeze({
      schemaVersion: RECEIVER_ACCOUNTING_VERSION,
      entryCount: this.#entries.length,
      uniqueOperationCount: this.#operationIds.size,
      uniqueSettlementCount: this.#bySettlement.size,
      headHash: previousEntryHash ?? null,
      balanced: true,
      totals: Object.freeze(Object.fromEntries([...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [
        key,
        Object.freeze({
          customerChargeAtomic: value.customerChargeAtomic.toString(),
          supplierCostAtomic: value.supplierCostAtomic.toString(),
        }),
      ]))),
    });
  }
}

export function receiverAccountingInputHash(input: ReceiverAccountingInput): string {
  assertInput(input);
  return hashJson(input as unknown as JsonValue);
}

export function verifyReceiverAccountingEntry(entry: ReceiverAccountingEntry): boolean {
  try {
    assertIdentifier(entry.entryId, /^acct_[a-f0-9]{40}$/u, 'receiver_accounting_entry_id_invalid');
    assertIdentifier(entry.settlementId, /^[A-Za-z0-9][A-Za-z0-9:._-]{7,127}$/u, 'receiver_accounting_settlement_id_invalid');
    assertIdentifier(entry.operationId, /^[A-Za-z0-9][A-Za-z0-9:._-]{7,127}$/u, 'receiver_accounting_operation_id_invalid');
    assertIdentifier(entry.authorizationId, /^[A-Za-z0-9][A-Za-z0-9:._-]{7,127}$/u, 'receiver_accounting_authorization_id_invalid');
    assertHash(entry.receiptHash, 'receiver_accounting_receipt_hash_invalid');
    assertHash(entry.settlementReferenceHash, 'receiver_accounting_settlement_reference_invalid');
    assertHash(entry.inputHash, 'receiver_accounting_input_hash_invalid');
    if (entry.previousEntryHash !== undefined) assertHash(entry.previousEntryHash, 'receiver_accounting_previous_hash_invalid');
    if (!Number.isFinite(Date.parse(entry.occurredAt))) throw new TypeError('receiver_accounting_time_invalid');
    assertBalanced(entry.postings);
    const { entryHash, ...unsigned } = entry;
    return entry.schemaVersion === RECEIVER_ACCOUNTING_VERSION
      && entryHash === hashJson(unsigned as unknown as JsonValue);
  } catch {
    return false;
  }
}

function receiverEntryId(input: ReceiverAccountingInput): string {
  return `acct_${hashJson({
    settlementId: input.settlementId,
    operationId: input.operationId,
    receiptHash: input.receiptHash,
  }).slice('sha256:'.length, 'sha256:'.length + 40)}`;
}

function posting(account: ReceiverAccount, direction: 'debit' | 'credit', amount: AssetAmount): Readonly<ReceiverAccountingPosting> {
  assertAmount(amount);
  return Object.freeze({ account, direction, amount: Object.freeze({ ...amount }) });
}

function assertInput(input: ReceiverAccountingInput): void {
  assertIdentifier(input.settlementId, /^[A-Za-z0-9][A-Za-z0-9:._-]{7,127}$/u, 'receiver_accounting_settlement_id_invalid');
  assertIdentifier(input.operationId, /^[A-Za-z0-9][A-Za-z0-9:._-]{7,127}$/u, 'receiver_accounting_operation_id_invalid');
  assertIdentifier(input.authorizationId, /^[A-Za-z0-9][A-Za-z0-9:._-]{7,127}$/u, 'receiver_accounting_authorization_id_invalid');
  assertHash(input.receiptHash, 'receiver_accounting_receipt_hash_invalid');
  assertHash(input.settlementReferenceHash, 'receiver_accounting_settlement_reference_invalid');
  assertAmount(input.customerCharge);
  assertAmount(input.supplierCost);
  if (!Number.isFinite(Date.parse(input.occurredAt))) throw new TypeError('receiver_accounting_time_invalid');
}

function assertIdentifier(value: string, pattern: RegExp, error: string): void {
  if (typeof value !== 'string' || !pattern.test(value)) throw new TypeError(error);
}

function assertHash(value: string, error: string): void {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) throw new TypeError(error);
}

function assertAmount(value: AssetAmount): void {
  if (!/^[a-z][a-z0-9:._-]{2,63}$/u.test(value.asset)) throw new TypeError('receiver_accounting_asset_invalid');
  if (!/^(0|[1-9][0-9]*)$/u.test(value.amountAtomic)) throw new TypeError('receiver_accounting_amount_invalid');
  if (!Number.isInteger(value.decimals) || value.decimals < 0 || value.decimals > 18) throw new TypeError('receiver_accounting_decimals_invalid');
}

function assertBalanced(postings: ReceiverAccountingEntry['postings']): void {
  if (!Array.isArray(postings) || postings.length !== 4) throw new TypeError('receiver_accounting_postings_invalid');
  const expected = [
    ['settlement_clearing', 'debit'],
    ['receiver_available', 'credit'],
    ['supplier_expense', 'debit'],
    ['supplier_payable', 'credit'],
  ];
  const balances = new Map<string, bigint>();
  for (const [index, item] of postings.entries()) {
    assertAmount(item.amount);
    if (item.account !== expected[index]?.[0] || item.direction !== expected[index]?.[1]) throw new TypeError('receiver_accounting_posting_order_invalid');
    const key = assetKey(item.amount);
    const signed = BigInt(item.amount.amountAtomic) * (item.direction === 'debit' ? 1n : -1n);
    balances.set(key, (balances.get(key) ?? 0n) + signed);
  }
  if ([...balances.values()].some((amount) => amount !== 0n)) throw new TypeError('receiver_accounting_unbalanced');
}

function assetKey(amount: AssetAmount): string {
  return `${amount.asset}/${amount.decimals}`;
}
