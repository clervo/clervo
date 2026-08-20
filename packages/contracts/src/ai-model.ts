import { hashJson } from './receipt.js';
import type { AssetAmount, JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export const AI_ROUTE_QUALIFICATION_SCHEMA_VERSION = 'ai-route-qualification.v1' as const;
export const AI_MODEL_CATALOG_SCHEMA_VERSION = 'ai-model-catalog.v1' as const;

export const aiProductIds = [
  'ai.chat', 'ai.embed', 'ai.image', 'ai.speech', 'ai.video', 'ai.music', 'ai.virtual_try_on',
] as const;
export type AiProductId = (typeof aiProductIds)[number];

export const aiCapabilities = [
  'text_input', 'text_output', 'image_input', 'image_output', 'audio_input',
  'audio_output', 'embedding_output', 'video_output', 'music_output', 'streaming',
  'structured_output', 'strict_schema', 'tool_calling', 'parallel_tool_calling',
  'reasoning',
] as const;
export type AiCapability = (typeof aiCapabilities)[number];

export const aiQualificationCheckNames = [
  'authentication', 'exact_identity', 'input_dependence', 'output_shape',
  'usage_reporting', 'latency', 'failure_handling', 'cost_ceiling', 'terms',
] as const;
export type AiQualificationCheckName = (typeof aiQualificationCheckNames)[number]
  | 'streaming' | 'structured_output' | 'strict_schema' | 'tool_calling'
  | 'parallel_tool_calling';

export interface AiRouteQualification {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof AI_ROUTE_QUALIFICATION_SCHEMA_VERSION;
  qualificationId: string;
  routeId: string;
  providerId: string;
  supplyFamilyId: string;
  exactModelId: string;
  productIds: readonly AiProductId[];
  checkedAt: string;
  expiresAt: string;
  status: 'passed' | 'failed' | 'blocked';
  termsStatus: 'approved' | 'restricted' | 'blocked' | 'unreviewed';
  resaleAllowed: boolean;
  checks: readonly {
    name: AiQualificationCheckName;
    status: 'passed' | 'failed' | 'not_run';
    evidenceHash?: string;
    code?: string;
  }[];
  observed: {
    modelIdentity?: string;
    latencyMsP95?: number;
    maximumSupplierCost?: AssetAmount;
  };
  qualificationHash: string;
}

export interface AiRouteDefinition {
  routeId: string;
  providerId: string;
  supplyFamilyId: string;
  exactModelId: string;
  productIds: readonly AiProductId[];
  capabilities: readonly AiCapability[];
  requiredSecretNames: readonly string[];
  quickAiPremium: boolean;
  qualification: Readonly<AiRouteQualification>;
}

export interface AiModelCatalog {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof AI_MODEL_CATALOG_SCHEMA_VERSION;
  catalogId: string;
  evaluatedAt: string;
  routes: readonly Readonly<AiRouteDefinition>[];
  qualifiedSupplyFamilies: readonly string[];
  catalogHash: string;
}

type QualificationInput = Omit<AiRouteQualification, 'contractVersion' | 'schemaVersion' | 'status' | 'qualificationHash'>;
type UnsignedQualification = Omit<AiRouteQualification, 'qualificationHash'>;
type UnsignedCatalog = Omit<AiModelCatalog, 'catalogHash'>;

function freezeDeep<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    for (const entry of value) freezeDeep(entry);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) freezeDeep(entry);
    return Object.freeze(value);
  }
  return value;
}

function hash(value: object): string {
  return hashJson(value as unknown as JsonValue);
}

function milliseconds(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError(`ai_${name}_invalid`);
  return parsed;
}

function uniqueCanonical<T extends string>(values: readonly T[], allowed: readonly T[], name: string): T[] {
  if (values.length === 0 || new Set(values).size !== values.length || values.some((value) => !allowed.includes(value))) throw new TypeError(`ai_${name}_invalid`);
  return allowed.filter((value) => values.includes(value));
}

function assertAmount(value: AssetAmount): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9:._/-]{1,127}$/u.test(value.asset) || !/^(?:0|[1-9][0-9]{0,77})$/u.test(value.amountAtomic) || !Number.isInteger(value.decimals) || value.decimals < 0 || value.decimals > 30) throw new TypeError('ai_cost_invalid');
}

function requiredChecks(capabilities: readonly AiCapability[]): readonly AiQualificationCheckName[] {
  return [
    ...aiQualificationCheckNames,
    ...(capabilities.includes('streaming') ? ['streaming' as const] : []),
    ...(capabilities.includes('structured_output') ? ['structured_output' as const] : []),
    ...(capabilities.includes('strict_schema') ? ['strict_schema' as const] : []),
    ...(capabilities.includes('tool_calling') ? ['tool_calling' as const] : []),
    ...(capabilities.includes('parallel_tool_calling') ? ['parallel_tool_calling' as const] : []),
  ];
}

function validateQualification(value: AiRouteQualification, capabilities?: readonly AiCapability[]): void {
  if (value.contractVersion !== CONTRACT_VERSION || value.schemaVersion !== AI_ROUTE_QUALIFICATION_SCHEMA_VERSION) throw new TypeError('ai_qualification_version_invalid');
  if (!/^aiqual_[A-Za-z0-9]{20,64}$/u.test(value.qualificationId) || !/^ai\.route\.[a-z0-9_]+$/u.test(value.routeId) || !/^provider\.[a-z0-9_]+$/u.test(value.providerId) || !/^supply\.[a-z0-9_]+$/u.test(value.supplyFamilyId)) throw new TypeError('ai_qualification_identity_invalid');
  if (value.exactModelId.length === 0 || value.exactModelId.length > 160 || /[\u0000-\u001F\u007F]/u.test(value.exactModelId)) throw new TypeError('ai_model_identity_invalid');
  if (JSON.stringify(value.productIds) !== JSON.stringify(uniqueCanonical(value.productIds, aiProductIds, 'product_ids'))) throw new TypeError('ai_product_ids_not_canonical');
  const checkedAt = milliseconds(value.checkedAt, 'checked_at');
  const expiresAt = milliseconds(value.expiresAt, 'expires_at');
  if (expiresAt <= checkedAt || expiresAt - checkedAt > 31 * 86_400_000) throw new TypeError('ai_qualification_window_invalid');
  const expectedChecks = requiredChecks(capabilities ?? []);
  if (capabilities !== undefined && JSON.stringify(value.checks.map(({ name }) => name)) !== JSON.stringify(expectedChecks)) throw new TypeError('ai_qualification_checks_incomplete');
  if (new Set(value.checks.map(({ name }) => name)).size !== value.checks.length) throw new TypeError('ai_qualification_checks_duplicate');
  for (const check of value.checks) {
    if (![...aiQualificationCheckNames, 'streaming', 'structured_output', 'strict_schema', 'tool_calling', 'parallel_tool_calling'].includes(check.name)) throw new TypeError('ai_qualification_check_unknown');
    if (!['passed', 'failed', 'not_run'].includes(check.status)) throw new TypeError('ai_qualification_check_status_invalid');
    if (check.evidenceHash !== undefined && !/^sha256:[a-f0-9]{64}$/u.test(check.evidenceHash)) throw new TypeError('ai_qualification_evidence_hash_invalid');
    if (check.code !== undefined && !/^[a-z][a-z0-9_]{2,63}$/u.test(check.code)) throw new TypeError('ai_qualification_code_invalid');
  }
  if (!['approved', 'restricted', 'blocked', 'unreviewed'].includes(value.termsStatus)) throw new TypeError('ai_terms_status_invalid');
  if (value.observed.modelIdentity !== undefined && value.observed.modelIdentity.length > 160) throw new TypeError('ai_observed_identity_invalid');
  if (value.observed.latencyMsP95 !== undefined && (!Number.isFinite(value.observed.latencyMsP95) || value.observed.latencyMsP95 < 0)) throw new TypeError('ai_latency_invalid');
  if (value.observed.maximumSupplierCost !== undefined) {
    assertAmount(value.observed.maximumSupplierCost);
    if (value.observed.maximumSupplierCost.asset !== 'USD' || value.observed.maximumSupplierCost.decimals !== 6) throw new TypeError('ai_cost_normalization_invalid');
  }
  const allPassed = value.checks.length >= aiQualificationCheckNames.length && value.checks.every(({ status }) => status === 'passed');
  const expectedStatus = value.checks.some(({ status }) => status === 'failed') || value.termsStatus === 'blocked' || (value.observed.modelIdentity !== undefined && value.observed.modelIdentity !== value.exactModelId)
    ? 'failed'
    : allPassed && ['approved', 'restricted'].includes(value.termsStatus) && value.resaleAllowed && value.observed.modelIdentity === value.exactModelId && value.observed.maximumSupplierCost !== undefined
      ? 'passed'
      : 'blocked';
  if (value.status !== expectedStatus) throw new TypeError('ai_qualification_status_dishonest');
  const { qualificationHash, ...unsigned } = value;
  if (qualificationHash !== hash(unsigned)) throw new TypeError('ai_qualification_hash_invalid');
}

export function createAiRouteQualification(input: QualificationInput, capabilities: readonly AiCapability[] = []): Readonly<AiRouteQualification> {
  const expectedChecks = requiredChecks(capabilities);
  if (JSON.stringify(input.checks.map(({ name }) => name)) !== JSON.stringify(expectedChecks)) throw new TypeError('ai_qualification_checks_incomplete');
  const hasFailure = input.checks.some(({ status }) => status === 'failed') || input.termsStatus === 'blocked' || (input.observed.modelIdentity !== undefined && input.observed.modelIdentity !== input.exactModelId);
  const allPassed = input.checks.length >= aiQualificationCheckNames.length && input.checks.every(({ status }) => status === 'passed');
  const status = hasFailure ? 'failed' as const
    : allPassed && ['approved', 'restricted'].includes(input.termsStatus) && input.resaleAllowed && input.observed.modelIdentity === input.exactModelId && input.observed.maximumSupplierCost !== undefined ? 'passed' as const : 'blocked' as const;
  const unsigned: UnsignedQualification = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_ROUTE_QUALIFICATION_SCHEMA_VERSION,
    ...input,
    productIds: uniqueCanonical(input.productIds, aiProductIds, 'product_ids'),
    status,
  };
  const result = { ...unsigned, qualificationHash: hash(unsigned) };
  validateQualification(result, capabilities);
  return freezeDeep(result);
}

export function verifyAiRouteQualification(value: AiRouteQualification, capabilities?: readonly AiCapability[]): boolean {
  try { validateQualification(value, capabilities); return true; } catch { return false; }
}

function validateRoute(route: AiRouteDefinition, evaluatedAt: string): void {
  if (!verifyAiRouteQualification(route.qualification, route.capabilities)) throw new TypeError(`ai_route_qualification_invalid:${route.routeId}`);
  if (route.routeId !== route.qualification.routeId || route.providerId !== route.qualification.providerId || route.supplyFamilyId !== route.qualification.supplyFamilyId || route.exactModelId !== route.qualification.exactModelId || JSON.stringify(route.productIds) !== JSON.stringify(route.qualification.productIds)) throw new TypeError(`ai_route_qualification_mismatch:${route.routeId}`);
  if (JSON.stringify(route.capabilities) !== JSON.stringify(uniqueCanonical(route.capabilities, aiCapabilities, 'capabilities'))) throw new TypeError(`ai_route_capabilities_not_canonical:${route.routeId}`);
  if (new Set(route.requiredSecretNames).size !== route.requiredSecretNames.length || route.requiredSecretNames.some((name) => !/^[A-Z][A-Z0-9_]{2,63}$/u.test(name))) throw new TypeError(`ai_route_secret_names_invalid:${route.routeId}`);
  const prohibited = /tongkhokr|mwapi/iu.test(`${route.providerId}/${route.supplyFamilyId}`);
  if (prohibited) throw new TypeError(`ai_route_prohibited:${route.routeId}`);
  if (route.quickAiPremium && (route.providerId !== 'provider.quickai' || !/gpt/iu.test(route.exactModelId))) throw new TypeError(`ai_quickai_route_invalid:${route.routeId}`);
  if (milliseconds(route.qualification.checkedAt, 'checked_at') > milliseconds(evaluatedAt, 'evaluated_at')) throw new TypeError(`ai_route_qualification_from_future:${route.routeId}`);
  if (route.qualification.status === 'passed' && milliseconds(route.qualification.expiresAt, 'expires_at') <= milliseconds(evaluatedAt, 'evaluated_at')) throw new TypeError(`ai_route_qualification_expired:${route.routeId}`);
}

export function createAiModelCatalog(input: {
  catalogId: string;
  evaluatedAt: string;
  routes: readonly AiRouteDefinition[];
}): Readonly<AiModelCatalog> {
  if (!/^aicat_[A-Za-z0-9]{20,64}$/u.test(input.catalogId)) throw new TypeError('ai_catalog_id_invalid');
  milliseconds(input.evaluatedAt, 'evaluated_at');
  if (input.routes.length === 0 || new Set(input.routes.map(({ routeId }) => routeId)).size !== input.routes.length) throw new TypeError('ai_catalog_routes_invalid');
  for (const route of input.routes) validateRoute(route, input.evaluatedAt);
  const routes = [...input.routes].sort((left, right) => left.routeId.localeCompare(right.routeId, 'en-US'));
  const qualifiedSupplyFamilies = [...new Set(routes.filter(({ qualification }) => qualification.status === 'passed').map(({ supplyFamilyId }) => supplyFamilyId))].sort();
  const unsigned: UnsignedCatalog = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_MODEL_CATALOG_SCHEMA_VERSION,
    catalogId: input.catalogId,
    evaluatedAt: input.evaluatedAt,
    routes,
    qualifiedSupplyFamilies,
  };
  return freezeDeep({ ...unsigned, catalogHash: hash(unsigned) });
}

export function verifyAiModelCatalog(value: AiModelCatalog): boolean {
  try {
    const rebuilt = createAiModelCatalog({ catalogId: value.catalogId, evaluatedAt: value.evaluatedAt, routes: value.routes });
    return JSON.stringify(rebuilt) === JSON.stringify(value);
  } catch { return false; }
}
