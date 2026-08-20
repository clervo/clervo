import type { JsonValue } from '../../../packages/contracts/src/index.js';

type Schema = Record<string, unknown>;

const supportedKeywords = new Set([
  'type', 'description', 'title', 'enum', 'const', 'properties', 'required',
  'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems',
  'minLength', 'maxLength', 'pattern', 'minimum', 'maximum',
  'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'oneOf', 'anyOf',
  'allOf',
]);
const supportedTypes = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

function schemaRecord(value: unknown, code = 'ai_json_schema_invalid'): Schema {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value as Schema;
}

function integer(value: unknown, minimum: number, maximum: number, code: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new TypeError(code);
  return value as number;
}

function numberValue(value: unknown, code: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(code);
  return value;
}

function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'integer') return Number.isSafeInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return valueType(value) === type;
}

function inspect(value: unknown, depth: number, count: { value: number }): Schema {
  if (depth > 32 || ++count.value > 2_000) throw new TypeError('ai_json_schema_too_complex');
  const schema = schemaRecord(value);
  for (const key of Object.keys(schema)) if (!supportedKeywords.has(key)) throw new TypeError(`ai_json_schema_keyword_unsupported:${key}`);
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length === 0 || types.some((type) => typeof type !== 'string' || !supportedTypes.has(type)) || new Set(types).size !== types.length) throw new TypeError('ai_json_schema_type_invalid');
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0 || schema.enum.length > 1_000)) throw new TypeError('ai_json_schema_enum_invalid');
  if (schema.const !== undefined && schema.enum !== undefined && !(schema.enum as unknown[]).some((item) => JSON.stringify(item) === JSON.stringify(schema.const))) throw new TypeError('ai_json_schema_impossible');
  if (schema.const !== undefined && !types.some((type) => matchesType(schema.const, type))) throw new TypeError('ai_json_schema_impossible');
  if (schema.enum !== undefined && !(schema.enum as unknown[]).some((item) => types.some((type) => matchesType(item, type)))) throw new TypeError('ai_json_schema_impossible');

  const minimum = numberValue(schema.minimum, 'ai_json_schema_numeric_bound_invalid');
  const maximum = numberValue(schema.maximum, 'ai_json_schema_numeric_bound_invalid');
  const exclusiveMinimum = numberValue(schema.exclusiveMinimum, 'ai_json_schema_numeric_bound_invalid');
  const exclusiveMaximum = numberValue(schema.exclusiveMaximum, 'ai_json_schema_numeric_bound_invalid');
  if (minimum !== undefined && maximum !== undefined && minimum > maximum || exclusiveMinimum !== undefined && exclusiveMaximum !== undefined && exclusiveMinimum >= exclusiveMaximum) throw new TypeError('ai_json_schema_impossible');
  if (schema.multipleOf !== undefined && (typeof schema.multipleOf !== 'number' || !Number.isFinite(schema.multipleOf) || schema.multipleOf <= 0)) throw new TypeError('ai_json_schema_multiple_of_invalid');

  for (const [lowKey, highKey] of [['minLength', 'maxLength'], ['minItems', 'maxItems']] as const) {
    const low = integer(schema[lowKey], 0, 1_000_000, 'ai_json_schema_bound_invalid');
    const high = integer(schema[highKey], 0, 1_000_000, 'ai_json_schema_bound_invalid');
    if (low !== undefined && high !== undefined && low > high) throw new TypeError('ai_json_schema_impossible');
  }
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== 'string' || schema.pattern.length > 1_000) throw new TypeError('ai_json_schema_pattern_invalid');
    try { new RegExp(schema.pattern, 'u'); } catch { throw new TypeError('ai_json_schema_pattern_invalid'); }
  }
  if (schema.uniqueItems !== undefined && typeof schema.uniqueItems !== 'boolean') throw new TypeError('ai_json_schema_unique_items_invalid');

  if (types.includes('object')) {
    const properties = schema.properties === undefined ? {} : schemaRecord(schema.properties);
    if (Object.keys(properties).length > 256) throw new TypeError('ai_json_schema_too_complex');
    for (const child of Object.values(properties)) inspect(child, depth + 1, count);
    const required = schema.required ?? [];
    if (!Array.isArray(required) || required.some((key) => typeof key !== 'string') || new Set(required).size !== required.length) throw new TypeError('ai_json_schema_required_invalid');
    if ((required as string[]).some((key) => !Object.hasOwn(properties, key))) throw new TypeError('ai_json_schema_impossible');
    if (schema.additionalProperties !== false) throw new TypeError('ai_json_schema_additional_properties_must_be_false');
  }
  if (types.includes('array')) {
    if (schema.items === undefined) throw new TypeError('ai_json_schema_items_required');
    inspect(schema.items, depth + 1, count);
  }
  for (const keyword of ['oneOf', 'anyOf', 'allOf'] as const) if (schema[keyword] !== undefined) {
    const alternatives = schema[keyword];
    if (!Array.isArray(alternatives) || alternatives.length < 1 || alternatives.length > 32) throw new TypeError('ai_json_schema_composition_invalid');
    for (const alternative of alternatives) inspect(alternative, depth + 1, count);
  }
  return schema;
}

export function assertSupportedStrictJsonSchema(value: unknown): void {
  let encoded: string;
  try { encoded = JSON.stringify(value); } catch { throw new TypeError('ai_json_schema_invalid'); }
  if (encoded.length > 100_000) throw new TypeError('ai_json_schema_too_complex');
  inspect(value, 0, { value: 0 });
}

function validate(schema: Schema, value: unknown): boolean {
  const types = Array.isArray(schema.type) ? schema.type as string[] : [schema.type as string];
  if (!types.some((type) => matchesType(value, type))) return false;
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(value)) return false;
  if (schema.enum !== undefined && !(schema.enum as unknown[]).some((item) => JSON.stringify(item) === JSON.stringify(value))) return false;
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < (schema.minimum as number) || schema.maximum !== undefined && value > (schema.maximum as number)) return false;
    if (schema.exclusiveMinimum !== undefined && value <= (schema.exclusiveMinimum as number) || schema.exclusiveMaximum !== undefined && value >= (schema.exclusiveMaximum as number)) return false;
    if (schema.multipleOf !== undefined && Math.abs(value / (schema.multipleOf as number) - Math.round(value / (schema.multipleOf as number))) > 1e-12) return false;
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < (schema.minLength as number) || schema.maxLength !== undefined && value.length > (schema.maxLength as number)) return false;
    if (schema.pattern !== undefined && !new RegExp(schema.pattern as string, 'u').test(value)) return false;
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < (schema.minItems as number) || schema.maxItems !== undefined && value.length > (schema.maxItems as number)) return false;
    if (schema.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) return false;
    if (schema.items !== undefined && value.some((item) => !validate(schema.items as Schema, item))) return false;
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    if (((schema.required ?? []) as string[]).some((key) => !Object.hasOwn(object, key))) return false;
    if (schema.additionalProperties === false && Object.keys(object).some((key) => !Object.hasOwn(properties, key))) return false;
    for (const [key, child] of Object.entries(properties)) if (Object.hasOwn(object, key) && !validate(child, object[key])) return false;
  }
  if (schema.allOf !== undefined && !(schema.allOf as Schema[]).every((item) => validate(item, value))) return false;
  if (schema.anyOf !== undefined && !(schema.anyOf as Schema[]).some((item) => validate(item, value))) return false;
  if (schema.oneOf !== undefined && (schema.oneOf as Schema[]).filter((item) => validate(item, value)).length !== 1) return false;
  return true;
}

export function validateStrictJsonSchema(schema: unknown, value: unknown): value is JsonValue {
  assertSupportedStrictJsonSchema(schema);
  return validate(schema as Schema, value);
}
