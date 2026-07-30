import type { AssetAmount, JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export interface AdapterManifest {
  contractVersion: typeof CONTRACT_VERSION;
  adapterId: string;
  adapterVersion: string;
  providerId: string;
  failureDomain: string;
  productIds: readonly string[];
  requiredSecretNames: readonly string[];
  dataResidency: readonly string[];
}

export interface AdapterCapabilities {
  adapterId: string;
  productIds: readonly string[];
  features: readonly string[];
  deliveryModes: readonly ('sync' | 'async')[];
}

export interface QualificationRequest {
  qualificationId: string;
  adapterId: string;
  productId: string;
  fixtureSet: string;
  requestedAt: string;
}

export interface QualificationResult {
  contractVersion: typeof CONTRACT_VERSION;
  qualificationId: string;
  adapterId: string;
  productId: string;
  status: 'passed' | 'failed' | 'blocked';
  checkedAt: string;
  expiresAt: string;
  termsStatus: 'approved' | 'restricted' | 'blocked' | 'unreviewed';
  checks: readonly {
    name: string;
    status: 'passed' | 'failed' | 'not_run';
    evidenceHash?: string;
    code?: string;
  }[];
  observed: {
    latencyMsP95?: number;
    maximumSupplierCost?: AssetAmount;
    identity?: string;
  };
}

export interface AdapterHealth {
  adapterId: string;
  status: 'healthy' | 'degraded' | 'unavailable' | 'unknown';
  checkedAt: string;
  latencyMs?: number;
  code?: string;
}

export interface AdapterRequest<TInput extends JsonValue = JsonValue> {
  operationId: string;
  productId: string;
  requestHash: string;
  input: TInput;
  deadlineAt: string;
}

export interface CostEstimate {
  adapterId: string;
  maximumSupplierCost: AssetAmount;
  basis: string;
  expiresAt: string;
}

export interface AdapterExecution<TRaw extends JsonValue = JsonValue> {
  adapterId: string;
  providerRequestReferenceHash: string;
  outcome: 'succeeded' | 'failed' | 'unknown';
  raw?: TRaw;
  usage?: Readonly<Record<string, number>>;
  startedAt: string;
  completedAt: string;
}

export interface AdapterErrorClassification {
  code: string;
  retryability: 'never' | 'safe_before_consumption' | 'reconcile';
  providerMayHaveConsumed: boolean;
  safeDetail: string;
}

export interface ClervoAdapter<TInput extends JsonValue = JsonValue, TRaw extends JsonValue = JsonValue, TOutput extends JsonValue = JsonValue> {
  readonly manifest: AdapterManifest;
  capabilities(): Promise<AdapterCapabilities>;
  qualify(request: QualificationRequest): Promise<QualificationResult>;
  health(): Promise<AdapterHealth>;
  estimateCost(request: AdapterRequest<TInput>): Promise<CostEstimate>;
  execute(request: AdapterRequest<TInput>): Promise<AdapterExecution<TRaw>>;
  normalize(execution: AdapterExecution<TRaw>): Promise<TOutput>;
  classifyError(error: unknown): AdapterErrorClassification;
}

export function qualificationFailures(result: QualificationResult): readonly string[] {
  const failures: string[] = [];
  if (result.status !== 'passed') failures.push('qualification_not_passed');
  if (result.termsStatus !== 'approved' && result.termsStatus !== 'restricted') failures.push('terms_not_approved');
  if (result.checks.length === 0) failures.push('no_checks');
  if (result.checks.some((check) => check.status !== 'passed')) failures.push('checks_incomplete');
  return failures;
}