import { aiCapabilities, aiProductIds, type AiCapability, type AiProductId } from './ai-model.js';
import type { AiRoutePricing } from './ai-routing.js';
import { hashJson } from './receipt.js';
import type { JsonValue } from './types.js';

export const QUALIFIED_AI_SUPPLY_CATALOG_SCHEMA_VERSION = 'qualified-ai-supply-catalog.v1' as const;
export const AI_CUSTOMER_IDENTITY_REGISTRY_SCHEMA_VERSION = 'ai-customer-identity-registry.v1' as const;

export const aiSupplyModalities = ['chat', 'embedding', 'image', 'speech', 'video', 'music', 'virtual_try_on'] as const;
export type AiSupplyModality = (typeof aiSupplyModalities)[number];

export const aiSupplyInputTypes = ['text', 'image', 'audio'] as const;
export type AiSupplyInputType = (typeof aiSupplyInputTypes)[number];

export const aiSupplyOutputTypes = ['text', 'embedding', 'image', 'audio', 'video'] as const;
export type AiSupplyOutputType = (typeof aiSupplyOutputTypes)[number];

export interface QualifiedAiSupplyModel {
  gatewaySupplyId: string;
  runtimeModelId: string;
  marketModelId?: string;
  display: {
    name: string;
    description?: string;
  };
  modalities: readonly AiSupplyModality[];
  inputTypes: readonly AiSupplyInputType[];
  outputTypes: readonly AiSupplyOutputType[];
  capabilities: readonly AiCapability[];
  limits: {
    contextTokens?: number;
    maximumOutputTokens?: number;
  };
  qualification: {
    state: 'qualified' | 'pending' | 'failed';
    checkedAt: string;
    expiresAt: string;
    evidenceRef: string;
  };
  availability: {
    state: 'available' | 'degraded' | 'unavailable' | 'withdrawn';
    reason: string | null;
    observedAt: string;
  };
  upstreamCost: {
    state: 'known' | 'unknown';
    pricing: Readonly<AiRoutePricing> | null;
    authorityRef: string | null;
    observedAt: string | null;
    validUntil: string | null;
  };
  quality?: {
    score: number;
    evidenceRef: string;
  };
}

export interface QualifiedAiSupplyCatalog {
  schemaVersion: typeof QUALIFIED_AI_SUPPLY_CATALOG_SCHEMA_VERSION;
  catalogRevision: string;
  generatedAt: string;
  sourceObservedAt: string;
  validUntil: string;
  models: readonly Readonly<QualifiedAiSupplyModel>[];
}

export interface AiCustomerIdentityEntry {
  gatewaySupplyId: string;
  customerModelId: string;
  routeId: string;
  assignedAt: string;
  assignment: 'compatibility' | 'automatic' | 'owner_assigned';
  aliases: readonly string[];
}

export interface AiCustomerIdentityRegistry {
  schemaVersion: typeof AI_CUSTOMER_IDENTITY_REGISTRY_SCHEMA_VERSION;
  revision: string;
  entries: readonly Readonly<AiCustomerIdentityEntry>[];
}

const modalityProduct: Readonly<Record<AiSupplyModality, AiProductId>> = Object.freeze({
  chat: 'ai.chat',
  embedding: 'ai.embed',
  image: 'ai.image',
  speech: 'ai.speech',
  video: 'ai.video',
  music: 'ai.music',
  virtual_try_on: 'ai.virtual_try_on',
});

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

function record(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], code: string): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) throw new TypeError(code);
}

function text(value: unknown, code: string, maximum = 512): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum || /[\u0000-\u001F\u007F]/u.test(value)) throw new TypeError(code);
  return value;
}

function timestamp(value: unknown, code: string): string {
  const result = text(value, code, 64);
  const parsed = Date.parse(result);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== result) throw new TypeError(code);
  return result;
}

function optionalInteger(value: unknown, code: string, maximum: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) throw new TypeError(code);
  return value as number;
}

function uniqueEnum<T extends string>(value: unknown, allowed: readonly T[], code: string): T[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || !allowed.includes(entry as T)) || new Set(value).size !== value.length) throw new TypeError(code);
  return allowed.filter((entry) => value.includes(entry));
}

function pricing(value: unknown): Readonly<AiRoutePricing> {
  const input = record(value, 'qualified_ai_supply_pricing_invalid');
  const keys = ['currency', 'decimals', 'inputTokenMicrosPerMillion', 'cachedInputTokenMicrosPerMillion', 'outputTokenMicrosPerMillion', 'reasoningTokenMicrosPerMillion', 'imageMicrosEach', 'audioMicrosPerThousandCharacters', 'videoMicrosPerSecond', 'musicMicrosPerGeneration', 'virtualTryOnMicrosPerImage'];
  const addedRates = new Set(['videoMicrosPerSecond', 'musicMicrosPerGeneration', 'virtualTryOnMicrosPerImage']);
  exactKeys(input, keys, 'qualified_ai_supply_pricing_additional_property');
  if (input.currency !== 'USD' || input.decimals !== 6) throw new TypeError('qualified_ai_supply_pricing_currency_invalid');
  for (const key of keys.slice(2)) {
    const amount = input[key] ?? (addedRates.has(key) ? 0 : undefined);
    if (!Number.isSafeInteger(amount) || (amount as number) < 0 || (amount as number) > 1_000_000_000_000) throw new TypeError('qualified_ai_supply_pricing_amount_invalid');
  }
  return freezeDeep({
    ...structuredClone(input),
    videoMicrosPerSecond: input.videoMicrosPerSecond ?? 0,
    musicMicrosPerGeneration: input.musicMicrosPerGeneration ?? 0,
    virtualTryOnMicrosPerImage: input.virtualTryOnMicrosPerImage ?? 0,
  } as unknown as AiRoutePricing);
}

function parseModel(value: unknown): Readonly<QualifiedAiSupplyModel> {
  const input = record(value, 'qualified_ai_supply_model_invalid');
  exactKeys(input, ['gatewaySupplyId', 'runtimeModelId', 'marketModelId', 'display', 'modalities', 'inputTypes', 'outputTypes', 'capabilities', 'limits', 'qualification', 'availability', 'upstreamCost', 'quality'], 'qualified_ai_supply_model_additional_property');
  const gatewaySupplyId = text(input.gatewaySupplyId, 'qualified_ai_supply_identity_invalid', 160);
  if (!/^aisupply_[a-z0-9][a-z0-9._-]{7,151}$/u.test(gatewaySupplyId)) throw new TypeError('qualified_ai_supply_identity_invalid');
  const runtimeModelId = text(input.runtimeModelId, 'qualified_ai_runtime_model_invalid', 160);
  const marketModelId = input.marketModelId === undefined ? undefined : text(input.marketModelId, 'qualified_ai_market_model_invalid', 160);

  const displayInput = record(input.display, 'qualified_ai_supply_display_invalid');
  exactKeys(displayInput, ['name', 'description'], 'qualified_ai_supply_display_additional_property');
  const display = {
    name: text(displayInput.name, 'qualified_ai_supply_display_name_invalid', 160),
    ...(displayInput.description === undefined ? {} : { description: text(displayInput.description, 'qualified_ai_supply_display_description_invalid', 2_000) }),
  };

  const modalities = uniqueEnum(input.modalities, aiSupplyModalities, 'qualified_ai_supply_modalities_invalid');
  const inputTypes = uniqueEnum(input.inputTypes, aiSupplyInputTypes, 'qualified_ai_supply_input_types_invalid');
  const outputTypes = uniqueEnum(input.outputTypes, aiSupplyOutputTypes, 'qualified_ai_supply_output_types_invalid');
  const capabilities = uniqueEnum(input.capabilities, aiCapabilities, 'qualified_ai_supply_capabilities_invalid');
  if (modalities.includes('chat') && (!capabilities.includes('text_input') || !capabilities.includes('text_output'))) throw new TypeError('qualified_ai_supply_chat_capabilities_invalid');
  if (modalities.includes('embedding') && !capabilities.includes('embedding_output')) throw new TypeError('qualified_ai_supply_embedding_capabilities_invalid');
  if (modalities.includes('image') && !capabilities.includes('image_output')) throw new TypeError('qualified_ai_supply_image_capabilities_invalid');
  if (modalities.includes('speech') && !capabilities.includes('audio_output')) throw new TypeError('qualified_ai_supply_speech_capabilities_invalid');
  if (modalities.includes('video') && !capabilities.includes('video_output')) throw new TypeError('qualified_ai_supply_video_capabilities_invalid');
  if (modalities.includes('music') && (!capabilities.includes('audio_output') || !capabilities.includes('music_output'))) throw new TypeError('qualified_ai_supply_music_capabilities_invalid');
  if (modalities.includes('virtual_try_on') && (!capabilities.includes('image_input') || !capabilities.includes('image_output'))) throw new TypeError('qualified_ai_supply_virtual_try_on_capabilities_invalid');

  const limitsInput = record(input.limits, 'qualified_ai_supply_limits_invalid');
  exactKeys(limitsInput, ['contextTokens', 'maximumOutputTokens'], 'qualified_ai_supply_limits_additional_property');
  const contextTokens = optionalInteger(limitsInput.contextTokens, 'qualified_ai_supply_context_invalid', 20_000_000);
  const maximumOutputTokens = optionalInteger(limitsInput.maximumOutputTokens, 'qualified_ai_supply_output_limit_invalid', 2_000_000);
  if (contextTokens !== undefined && maximumOutputTokens !== undefined && maximumOutputTokens > contextTokens) throw new TypeError('qualified_ai_supply_output_exceeds_context');

  const qualificationInput = record(input.qualification, 'qualified_ai_supply_qualification_invalid');
  exactKeys(qualificationInput, ['state', 'checkedAt', 'expiresAt', 'evidenceRef'], 'qualified_ai_supply_qualification_additional_property');
  if (!['qualified', 'pending', 'failed'].includes(qualificationInput.state as string)) throw new TypeError('qualified_ai_supply_qualification_state_invalid');
  const checkedAt = timestamp(qualificationInput.checkedAt, 'qualified_ai_supply_qualification_checked_at_invalid');
  const expiresAt = timestamp(qualificationInput.expiresAt, 'qualified_ai_supply_qualification_expires_at_invalid');
  if (Date.parse(expiresAt) <= Date.parse(checkedAt)) throw new TypeError('qualified_ai_supply_qualification_window_invalid');
  const qualification = {
    state: qualificationInput.state as QualifiedAiSupplyModel['qualification']['state'],
    checkedAt,
    expiresAt,
    evidenceRef: text(qualificationInput.evidenceRef, 'qualified_ai_supply_qualification_evidence_invalid', 512),
  };

  const availabilityInput = record(input.availability, 'qualified_ai_supply_availability_invalid');
  exactKeys(availabilityInput, ['state', 'reason', 'observedAt'], 'qualified_ai_supply_availability_additional_property');
  if (!['available', 'degraded', 'unavailable', 'withdrawn'].includes(availabilityInput.state as string)) throw new TypeError('qualified_ai_supply_availability_state_invalid');
  const availabilityState = availabilityInput.state as QualifiedAiSupplyModel['availability']['state'];
  const availabilityReason = availabilityInput.reason === null ? null : text(availabilityInput.reason, 'qualified_ai_supply_availability_reason_invalid', 160);
  if (availabilityState === 'available' ? availabilityReason !== null : availabilityReason === null) throw new TypeError('qualified_ai_supply_availability_reason_mismatch');
  const availability = { state: availabilityState, reason: availabilityReason, observedAt: timestamp(availabilityInput.observedAt, 'qualified_ai_supply_availability_observed_at_invalid') };

  const costInput = record(input.upstreamCost, 'qualified_ai_supply_cost_invalid');
  exactKeys(costInput, ['state', 'pricing', 'authorityRef', 'observedAt', 'validUntil'], 'qualified_ai_supply_cost_additional_property');
  if (!['known', 'unknown'].includes(costInput.state as string)) throw new TypeError('qualified_ai_supply_cost_state_invalid');
  const costKnown = costInput.state === 'known';
  if (costKnown && (costInput.pricing === null || costInput.authorityRef === null || costInput.observedAt === null || costInput.validUntil === null)) throw new TypeError('qualified_ai_supply_cost_authority_missing');
  if (!costKnown && (costInput.pricing !== null || costInput.authorityRef !== null || costInput.observedAt !== null || costInput.validUntil !== null)) throw new TypeError('qualified_ai_supply_unknown_cost_not_empty');
  const costObservedAt = costInput.observedAt === null ? null : timestamp(costInput.observedAt, 'qualified_ai_supply_cost_observed_at_invalid');
  const costValidUntil = costInput.validUntil === null ? null : timestamp(costInput.validUntil, 'qualified_ai_supply_cost_valid_until_invalid');
  if (costObservedAt !== null && costValidUntil !== null && Date.parse(costValidUntil) <= Date.parse(costObservedAt)) throw new TypeError('qualified_ai_supply_cost_window_invalid');
  const upstreamCost = {
    state: costInput.state as 'known' | 'unknown',
    pricing: costInput.pricing === null ? null : pricing(costInput.pricing),
    authorityRef: costInput.authorityRef === null ? null : text(costInput.authorityRef, 'qualified_ai_supply_cost_authority_invalid', 512),
    observedAt: costObservedAt,
    validUntil: costValidUntil,
  };

  let quality: QualifiedAiSupplyModel['quality'];
  if (input.quality !== undefined) {
    const qualityInput = record(input.quality, 'qualified_ai_supply_quality_invalid');
    exactKeys(qualityInput, ['score', 'evidenceRef'], 'qualified_ai_supply_quality_additional_property');
    if (typeof qualityInput.score !== 'number' || !Number.isFinite(qualityInput.score) || qualityInput.score < 0 || qualityInput.score > 1) throw new TypeError('qualified_ai_supply_quality_score_invalid');
    quality = { score: qualityInput.score, evidenceRef: text(qualityInput.evidenceRef, 'qualified_ai_supply_quality_evidence_invalid', 512) };
  }

  return freezeDeep({
    gatewaySupplyId,
    runtimeModelId,
    ...(marketModelId === undefined ? {} : { marketModelId }),
    display,
    modalities,
    inputTypes,
    outputTypes,
    capabilities,
    limits: { ...(contextTokens === undefined ? {} : { contextTokens }), ...(maximumOutputTokens === undefined ? {} : { maximumOutputTokens }) },
    qualification,
    availability,
    upstreamCost,
    ...(quality === undefined ? {} : { quality }),
  });
}

export function parseQualifiedAiSupplyCatalog(value: unknown): Readonly<QualifiedAiSupplyCatalog> {
  const input = record(value, 'qualified_ai_supply_catalog_invalid');
  exactKeys(input, ['schemaVersion', 'catalogRevision', 'generatedAt', 'sourceObservedAt', 'validUntil', 'models'], 'qualified_ai_supply_catalog_additional_property');
  if (input.schemaVersion !== QUALIFIED_AI_SUPPLY_CATALOG_SCHEMA_VERSION) throw new TypeError('qualified_ai_supply_catalog_version_invalid');
  const catalogRevision = text(input.catalogRevision, 'qualified_ai_supply_catalog_revision_invalid', 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u.test(catalogRevision)) throw new TypeError('qualified_ai_supply_catalog_revision_invalid');
  const generatedAt = timestamp(input.generatedAt, 'qualified_ai_supply_catalog_generated_at_invalid');
  const sourceObservedAt = timestamp(input.sourceObservedAt, 'qualified_ai_supply_catalog_observed_at_invalid');
  const validUntil = timestamp(input.validUntil, 'qualified_ai_supply_catalog_valid_until_invalid');
  if (Date.parse(sourceObservedAt) > Date.parse(generatedAt) || Date.parse(validUntil) <= Date.parse(generatedAt)) throw new TypeError('qualified_ai_supply_catalog_window_invalid');
  if (!Array.isArray(input.models)) throw new TypeError('qualified_ai_supply_models_invalid');
  const models = input.models.map(parseModel);
  if (new Set(models.map(({ gatewaySupplyId }) => gatewaySupplyId)).size !== models.length) throw new TypeError('qualified_ai_supply_identity_duplicate');
  if (new Set(models.map(({ runtimeModelId }) => runtimeModelId)).size !== models.length) throw new TypeError('qualified_ai_runtime_binding_conflict');
  for (const model of models) {
    if (Date.parse(model.qualification.checkedAt) > Date.parse(generatedAt) || Date.parse(model.availability.observedAt) > Date.parse(generatedAt)) throw new TypeError('qualified_ai_supply_model_observation_from_future');
    if (model.upstreamCost.observedAt !== null && Date.parse(model.upstreamCost.observedAt) > Date.parse(generatedAt)) throw new TypeError('qualified_ai_supply_cost_from_future');
  }
  return freezeDeep({ schemaVersion: QUALIFIED_AI_SUPPLY_CATALOG_SCHEMA_VERSION, catalogRevision, generatedAt, sourceObservedAt, validUntil, models });
}

function parseIdentityEntry(value: unknown): Readonly<AiCustomerIdentityEntry> {
  const input = record(value, 'ai_customer_identity_entry_invalid');
  exactKeys(input, ['gatewaySupplyId', 'customerModelId', 'routeId', 'assignedAt', 'assignment', 'aliases'], 'ai_customer_identity_entry_additional_property');
  const gatewaySupplyId = text(input.gatewaySupplyId, 'ai_customer_identity_supply_invalid', 160);
  if (!/^aisupply_[a-z0-9][a-z0-9._-]{7,151}$/u.test(gatewaySupplyId)) throw new TypeError('ai_customer_identity_supply_invalid');
  const customerModelId = text(input.customerModelId, 'ai_customer_model_id_invalid', 160);
  const routeId = text(input.routeId, 'ai_customer_route_id_invalid', 160);
  if (!/^ai\.route\.[a-z0-9_]+$/u.test(routeId)) throw new TypeError('ai_customer_route_id_invalid');
  if (!['compatibility', 'automatic', 'owner_assigned'].includes(input.assignment as string)) throw new TypeError('ai_customer_identity_assignment_invalid');
  if (!Array.isArray(input.aliases) || input.aliases.some((alias) => typeof alias !== 'string' || alias.length === 0 || alias.length > 160) || new Set(input.aliases).size !== input.aliases.length) throw new TypeError('ai_customer_identity_aliases_invalid');
  return freezeDeep({ gatewaySupplyId, customerModelId, routeId, assignedAt: timestamp(input.assignedAt, 'ai_customer_identity_assigned_at_invalid'), assignment: input.assignment as AiCustomerIdentityEntry['assignment'], aliases: [...input.aliases].sort() });
}

export function parseAiCustomerIdentityRegistry(value: unknown): Readonly<AiCustomerIdentityRegistry> {
  const input = record(value, 'ai_customer_identity_registry_invalid');
  exactKeys(input, ['schemaVersion', 'revision', 'entries'], 'ai_customer_identity_registry_additional_property');
  if (input.schemaVersion !== AI_CUSTOMER_IDENTITY_REGISTRY_SCHEMA_VERSION) throw new TypeError('ai_customer_identity_registry_version_invalid');
  const revision = text(input.revision, 'ai_customer_identity_registry_revision_invalid', 160);
  if (!Array.isArray(input.entries)) throw new TypeError('ai_customer_identity_entries_invalid');
  const entries = input.entries.map(parseIdentityEntry).sort((left, right) => left.gatewaySupplyId.localeCompare(right.gatewaySupplyId));
  for (const key of ['gatewaySupplyId', 'routeId'] as const) if (new Set(entries.map((entry) => entry[key])).size !== entries.length) throw new TypeError(`ai_customer_identity_${key}_duplicate`);
  return freezeDeep({ schemaVersion: AI_CUSTOMER_IDENTITY_REGISTRY_SCHEMA_VERSION, revision, entries });
}

export function productIdsForSupplyModel(model: Readonly<QualifiedAiSupplyModel>): readonly AiProductId[] {
  const result = model.modalities.map((modality) => modalityProduct[modality]);
  if (result.some((productId) => !aiProductIds.includes(productId))) throw new TypeError('qualified_ai_supply_product_invalid');
  return Object.freeze([...new Set(result)]);
}

function automaticIdentity(model: Readonly<QualifiedAiSupplyModel>, assignedAt: string): Readonly<AiCustomerIdentityEntry> {
  const product = productIdsForSupplyModel(model)[0]?.split('.')[1] ?? 'model';
  const productDigest = hashJson(model.marketModelId === undefined ? { gatewaySupplyId: model.gatewaySupplyId } : { marketModelId: model.marketModelId } as unknown as JsonValue).slice('sha256:'.length);
  const routeDigest = hashJson({ gatewaySupplyId: model.gatewaySupplyId } as unknown as JsonValue).slice('sha256:'.length);
  return freezeDeep({
    gatewaySupplyId: model.gatewaySupplyId,
    customerModelId: `clervo/${product}-${productDigest.slice(0, 10)}`,
    routeId: `ai.route.dynamic_${routeDigest.slice(0, 20)}`,
    assignedAt,
    assignment: 'automatic' as const,
    aliases: [],
  });
}

export function assignAiCustomerIdentities(input: {
  catalog: Readonly<QualifiedAiSupplyCatalog>;
  registry: Readonly<AiCustomerIdentityRegistry>;
  assignedAt: string;
}): Readonly<{ bySupplyId: ReadonlyMap<string, Readonly<AiCustomerIdentityEntry>>; registry: Readonly<AiCustomerIdentityRegistry> }> {
  timestamp(input.assignedAt, 'ai_customer_identity_assignment_time_invalid');
  const existing = new Map(input.registry.entries.map((entry) => [entry.gatewaySupplyId, entry]));
  for (const model of input.catalog.models) if (!existing.has(model.gatewaySupplyId)) existing.set(model.gatewaySupplyId, automaticIdentity(model, input.assignedAt));
  const entries = [...existing.values()].sort((left, right) => left.gatewaySupplyId.localeCompare(right.gatewaySupplyId));
  if (new Set(entries.map(({ routeId }) => routeId)).size !== entries.length) throw new TypeError('ai_customer_identity_routeId_duplicate');
  const revisionHash = hashJson(entries as unknown as JsonValue).slice('sha256:'.length, 'sha256:'.length + 24);
  const registry = freezeDeep({ schemaVersion: AI_CUSTOMER_IDENTITY_REGISTRY_SCHEMA_VERSION, revision: `aiid_${revisionHash}`, entries });
  return Object.freeze({ bySupplyId: new Map(entries.map((entry) => [entry.gatewaySupplyId, entry])), registry });
}
