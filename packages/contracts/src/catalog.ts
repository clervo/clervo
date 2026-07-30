import type { AssetAmount } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export const catalogStatuses = [
  'draft',
  'qualified',
  'active',
  'degraded',
  'disabled',
  'blocked_by_terms',
  'retired',
] as const;

export type CatalogStatus = (typeof catalogStatuses)[number];
export type DeliveryMode = 'sync' | 'async';

export interface ProductIdentity {
  kind: 'exact' | 'alias';
  name: string;
  substitutionPolicy: 'none' | 'qualified_equivalent';
}

export interface CatalogPricing {
  model: 'free' | 'fixed' | 'metered' | 'quoted';
  displayPrice?: AssetAmount;
  maximumChargeRequired: boolean;
  priceVersion: string;
}

export interface TermsReview {
  status: 'approved' | 'restricted' | 'blocked' | 'unreviewed';
  reviewedAt?: string;
  reference: string;
  notes?: string;
}

export interface CatalogEntry {
  contractVersion: typeof CONTRACT_VERSION;
  catalogVersion: string;
  productId: string;
  title: string;
  summary: string;
  status: CatalogStatus;
  identity: ProductIdentity;
  capabilities: readonly string[];
  deliveryModes: readonly DeliveryMode[];
  inputSchema: string;
  outputSchema: string;
  pricing: CatalogPricing;
  qualifiedAdapterIds: readonly string[];
  terms: TermsReview;
  dataPolicy: {
    classification: 'public' | 'customer_confidential' | 'sensitive';
    payloadRetention: 'none' | 'bounded';
    maximumRetentionSeconds: number;
  };
  updatedAt: string;
}

export function catalogActivationFailures(entry: CatalogEntry): readonly string[] {
  if (entry.status !== 'active' && entry.status !== 'degraded') return [];
  const failures: string[] = [];
  if (entry.terms.status !== 'approved' && entry.terms.status !== 'restricted') failures.push('terms_not_approved');
  if (entry.qualifiedAdapterIds.length === 0) failures.push('no_qualified_adapter');
  if (entry.identity.kind === 'exact' && entry.identity.substitutionPolicy !== 'none') failures.push('exact_identity_may_not_substitute');
  if (entry.pricing.model !== 'free' && !entry.pricing.maximumChargeRequired) failures.push('paid_product_requires_maximum_charge');
  return failures;
}

export function assertCatalogActivatable(entry: CatalogEntry): void {
  const failures = catalogActivationFailures(entry);
  if (failures.length > 0) throw new TypeError(`catalog entry is not activatable: ${failures.join(', ')}`);
}