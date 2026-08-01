import { liveIntelligenceEvidenceSetHash, liveIntelligenceQueryIdentityHash } from './live-intelligence-comparison.js';
import { hashJson } from './receipt.js';
import { verifySearchCitation, type SearchResponse } from './search.js';
import type { JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export const LIVE_INTELLIGENCE_SOLUTION_PACK_SCHEMA_VERSION = 'live-intelligence-solution-pack-result.v1' as const;

export const liveIntelligenceSolutionPackIds = [
  'search.pack.commerce_marketplace',
  'search.pack.property_local_market',
  'search.pack.company_competitive',
  'search.pack.research_evidence',
  'search.pack.developer_agent_context',
] as const;

export type LiveIntelligenceSolutionPackId = (typeof liveIntelligenceSolutionPackIds)[number];

export const liveIntelligenceSolutionPackDefinitions = Object.freeze({
  'search.pack.commerce_marketplace': Object.freeze({
    requiredFields: Object.freeze(['product_name', 'price', 'currency', 'availability']),
    optionalFields: Object.freeze(['seller', 'sku', 'brand']),
    identityFields: Object.freeze(['product_name', 'seller']),
  }),
  'search.pack.property_local_market': Object.freeze({
    requiredFields: Object.freeze(['listing_address', 'price', 'currency', 'locality']),
    optionalFields: Object.freeze(['bedrooms', 'bathrooms', 'property_type', 'agency']),
    identityFields: Object.freeze(['listing_address']),
  }),
  'search.pack.company_competitive': Object.freeze({
    requiredFields: Object.freeze(['organization', 'signal_type', 'observed_value']),
    optionalFields: Object.freeze(['product', 'effective_date']),
    identityFields: Object.freeze(['organization', 'signal_type']),
  }),
  'search.pack.research_evidence': Object.freeze({
    requiredFields: Object.freeze(['claim', 'source_kind']),
    optionalFields: Object.freeze(['publisher', 'publication_date', 'jurisdiction']),
    identityFields: Object.freeze(['claim']),
  }),
  'search.pack.developer_agent_context': Object.freeze({
    requiredFields: Object.freeze(['package_name', 'version', 'ecosystem']),
    optionalFields: Object.freeze(['release_date', 'advisory', 'repository']),
    identityFields: Object.freeze(['package_name', 'ecosystem']),
  }),
} as const);

export type LiveIntelligenceSolutionPackFieldName =
  | 'advisory' | 'agency' | 'availability' | 'bathrooms' | 'bedrooms' | 'brand'
  | 'claim' | 'currency' | 'ecosystem' | 'effective_date' | 'jurisdiction'
  | 'listing_address' | 'locality' | 'observed_value' | 'organization'
  | 'package_name' | 'price' | 'product' | 'product_name' | 'property_type'
  | 'publication_date' | 'publisher' | 'release_date' | 'repository' | 'seller'
  | 'signal_type' | 'sku' | 'source_kind' | 'version';

export interface LiveIntelligenceSolutionPackObservation {
  label: string;
  fields: readonly {
    name: LiveIntelligenceSolutionPackFieldName;
    value: string;
    citationId: string;
  }[];
}

export interface LiveIntelligenceSolutionPackRecord {
  recordId: string;
  entityKey: string;
  label: string;
  fields: readonly {
    name: LiveIntelligenceSolutionPackFieldName;
    value: string;
    citationId: string;
    resultId: string;
    canonicalUrl: string;
    observedAt: string;
  }[];
}

export interface LiveIntelligenceSolutionPackResult {
  contractVersion: typeof CONTRACT_VERSION;
  schemaVersion: typeof LIVE_INTELLIGENCE_SOLUTION_PACK_SCHEMA_VERSION;
  packId: LiveIntelligenceSolutionPackId;
  searchOperationId: string;
  searchGeneratedAt: string;
  queryIdentityHash: string;
  evidenceSetHash: string;
  summary: {
    records: number;
    fields: number;
    citations: number;
  };
  records: readonly Readonly<LiveIntelligenceSolutionPackRecord>[];
  resultHash: string;
}

type UnsignedResult = Omit<LiveIntelligenceSolutionPackResult, 'resultHash'>;

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

function normalizedText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertText(value: string, name: string, maximum: number): void {
  if (value.length === 0 || value.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) throw new TypeError(`invalid_solution_pack_${name}`);
}

export function assembleLiveIntelligenceSolutionPack(input: {
  packId: LiveIntelligenceSolutionPackId;
  searchResponse: SearchResponse;
  observations: readonly LiveIntelligenceSolutionPackObservation[];
}): Readonly<LiveIntelligenceSolutionPackResult> {
  if (!liveIntelligenceSolutionPackIds.includes(input.packId)) throw new TypeError('solution_pack_id_invalid');
  const definition = liveIntelligenceSolutionPackDefinitions[input.packId];
  const evidenceSetHash = liveIntelligenceEvidenceSetHash(input.searchResponse);
  const queryIdentityHash = liveIntelligenceQueryIdentityHash(input.searchResponse);
  if (input.observations.length === 0 || input.observations.length > 100) throw new TypeError('solution_pack_observation_count_invalid');
  const citations = new Map(input.searchResponse.citations.map((citation) => [citation.citationId, citation]));
  const results = new Map(input.searchResponse.results.map((result) => [result.resultId, result]));
  const allowedFields = new Set<string>([...definition.requiredFields, ...definition.optionalFields]);

  const records = input.observations.map((observation) => {
    assertText(observation.label, 'label', 512);
    if (observation.fields.length === 0 || observation.fields.length > allowedFields.size) throw new TypeError('solution_pack_field_count_invalid');
    const names = new Set<string>();
    const fields = observation.fields.map((field) => {
      if (!allowedFields.has(field.name)) throw new TypeError(`solution_pack_field_not_allowed:${field.name}`);
      if (names.has(field.name)) throw new TypeError(`solution_pack_field_duplicate:${field.name}`);
      names.add(field.name);
      assertText(field.value, 'field_value', 4_000);
      const citation = citations.get(field.citationId);
      if (citation === undefined || !verifySearchCitation(citation, input.searchResponse.results).valid) throw new TypeError('solution_pack_citation_invalid');
      const result = results.get(citation.resultId);
      if (result === undefined) throw new TypeError('solution_pack_result_missing');
      if (!normalizedText(citation.quote).includes(normalizedText(field.value))) throw new TypeError(`solution_pack_value_not_cited:${field.name}`);
      return {
        name: field.name,
        value: field.value,
        citationId: citation.citationId,
        resultId: result.resultId,
        canonicalUrl: result.canonicalUrl,
        observedAt: result.publishedAt ?? result.retrievedAt,
      };
    }).sort((left, right) => compareCodePoints(left.name, right.name));
    for (const required of definition.requiredFields) if (!names.has(required)) throw new TypeError(`solution_pack_required_field_missing:${required}`);
    const byName = new Map<string, string>(fields.map((field) => [field.name, field.value]));
    const identity = definition.identityFields.map((name) => `${name}:${normalizedText(byName.get(name) ?? '')}`);
    const entityHash = hash({ identity, packId: input.packId });
    const recordHash = hash({ entityHash, evidence: fields.map(({ name, value, citationId }) => ({ name, value, citationId })) });
    return freezeDeep({
      recordId: `lipack_${recordHash.slice('sha256:'.length, 'sha256:'.length + 32)}`,
      entityKey: entityHash,
      label: observation.label,
      fields,
    });
  }).sort((left, right) => compareCodePoints(left.entityKey, right.entityKey));

  if (new Set(records.map(({ entityKey }) => entityKey)).size !== records.length) throw new TypeError('solution_pack_entity_duplicate');
  const citationCount = new Set(records.flatMap(({ fields }) => fields.map(({ citationId }) => citationId))).size;
  const unsigned: UnsignedResult = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: LIVE_INTELLIGENCE_SOLUTION_PACK_SCHEMA_VERSION,
    packId: input.packId,
    searchOperationId: input.searchResponse.operationId,
    searchGeneratedAt: input.searchResponse.generatedAt,
    queryIdentityHash,
    evidenceSetHash,
    summary: { records: records.length, fields: records.reduce((total, record) => total + record.fields.length, 0), citations: citationCount },
    records,
  };
  return freezeDeep({ ...unsigned, resultHash: hash(unsigned) });
}

export function verifyLiveIntelligenceSolutionPackResult(result: LiveIntelligenceSolutionPackResult): boolean {
  try {
    if (result.contractVersion !== CONTRACT_VERSION || result.schemaVersion !== LIVE_INTELLIGENCE_SOLUTION_PACK_SCHEMA_VERSION || !liveIntelligenceSolutionPackIds.includes(result.packId)) return false;
    if (!/^op_[A-Za-z0-9]{20,64}$/u.test(result.searchOperationId) || !/^sha256:[a-f0-9]{64}$/u.test(result.queryIdentityHash) || !/^sha256:[a-f0-9]{64}$/u.test(result.evidenceSetHash)) return false;
    const generatedAt = Date.parse(result.searchGeneratedAt);
    if (!Number.isFinite(generatedAt) || new Date(generatedAt).toISOString() !== result.searchGeneratedAt || result.records.length === 0 || result.records.length > 100) return false;
    const definition = liveIntelligenceSolutionPackDefinitions[result.packId];
    const allowedFields = new Set<string>([...definition.requiredFields, ...definition.optionalFields]);
    const entityKeys = new Set<string>();
    for (const record of result.records) {
      if (!/^lipack_[A-Za-z0-9]{32}$/u.test(record.recordId) || !/^sha256:[a-f0-9]{64}$/u.test(record.entityKey) || entityKeys.has(record.entityKey)) return false;
      entityKeys.add(record.entityKey);
      assertText(record.label, 'label', 512);
      const names = new Set<string>();
      for (const field of record.fields) {
        if (!allowedFields.has(field.name) || names.has(field.name) || !/^cite_[A-Za-z0-9]{20,64}$/u.test(field.citationId) || !/^sr_[A-Za-z0-9]{20,64}$/u.test(field.resultId)) return false;
        names.add(field.name);
        assertText(field.value, 'field_value', 4_000);
        const url = new URL(field.canonicalUrl);
        if (!['http:', 'https:'].includes(url.protocol)) return false;
        const observedAt = Date.parse(field.observedAt);
        if (!Number.isFinite(observedAt) || new Date(observedAt).toISOString() !== field.observedAt) return false;
      }
      for (const required of definition.requiredFields) if (!names.has(required)) return false;
      const byName = new Map<string, string>(record.fields.map((field) => [field.name, field.value]));
      const identity = definition.identityFields.map((name) => `${name}:${normalizedText(byName.get(name) ?? '')}`);
      if (record.entityKey !== hash({ identity, packId: result.packId })) return false;
      const recordHash = hash({ entityHash: record.entityKey, evidence: record.fields.map(({ name, value, citationId }) => ({ name, value, citationId })) });
      if (record.recordId !== `lipack_${recordHash.slice('sha256:'.length, 'sha256:'.length + 32)}`) return false;
    }
    if (result.summary.records !== result.records.length || result.summary.fields !== result.records.reduce((total, record) => total + record.fields.length, 0) || result.summary.citations !== new Set(result.records.flatMap(({ fields }) => fields.map(({ citationId }) => citationId))).size) return false;
    const { resultHash, ...unsigned } = result;
    return resultHash === hash(unsigned);
  } catch { return false; }
}
