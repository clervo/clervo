import { createHash } from 'node:crypto';
import { canonicalize } from './canonical-request.js';
import type { AssetAmount, JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export interface OperationReceipt {
  contractVersion: typeof CONTRACT_VERSION;
  receiptId: string;
  operationId: string;
  productId: string;
  requestHash: string;
  quoteId: string;
  quoteHash: string;
  fundingMode: 'free' | 'sponsored' | 'paid';
  customerCharge: AssetAmount;
  supplierCost: AssetAmount;
  settlement: {
    status: 'not_required' | 'settled';
    referenceHash?: string;
  };
  resultHash: string;
  provenance: readonly {
    adapterId: string;
    qualificationId: string;
    providerReferenceHash: string;
  }[];
  completedAt: string;
  previousReceiptHash?: string;
  receiptHash: string;
}

export type UnsignedOperationReceipt = Omit<OperationReceipt, 'receiptHash'>;

export function hashJson(value: JsonValue): string {
  return `sha256:${createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')}`;
}

export function receiptHash(receipt: UnsignedOperationReceipt): string {
  return hashJson(receipt as unknown as JsonValue);
}

export function sealReceipt(receipt: UnsignedOperationReceipt): Readonly<OperationReceipt> {
  return Object.freeze({ ...receipt, receiptHash: receiptHash(receipt) });
}

export function verifyReceipt(receipt: OperationReceipt): boolean {
  const { receiptHash: claimed, ...unsigned } = receipt;
  return claimed === receiptHash(unsigned);
}