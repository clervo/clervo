import type { JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';
import { hashJson } from './receipt.js';

export const QUERY_REWRITE_MAX_CHARACTERS = 2_000;
export const QUERY_REWRITE_MAX_TOKENS = 64;

export type QueryRewriteKind = 'identity' | 'exact_phrase';

export interface QueryRewriteVariant {
  variantId: 'identity' | 'exact_phrase';
  kind: QueryRewriteKind;
  query: string;
  tokenCount: number;
}

export interface QueryRewritePlan {
  contractVersion: typeof CONTRACT_VERSION;
  rewriteId: string;
  operationId: string;
  originalQuery: string;
  normalizedQuery: string;
  createdAt: string;
  policy: 'deterministic_token_preserving_v1';
  variants: readonly Readonly<QueryRewriteVariant>[];
}

function normalizedText(value: string): string {
  if (typeof value !== 'string') throw new TypeError('invalid_query_rewrite_query');
  if (value.length < 1 || value.length > QUERY_REWRITE_MAX_CHARACTERS || /[\u0000-\u001F\u007F]/u.test(value)) throw new TypeError('invalid_query_rewrite_query');
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (normalized.length < 1 || normalized.length > QUERY_REWRITE_MAX_CHARACTERS) throw new TypeError('invalid_query_rewrite_query');
  return normalized;
}

function tokens(value: string): readonly string[] {
  const result = value.split(' ');
  if (result.length > QUERY_REWRITE_MAX_TOKENS) throw new TypeError('query_rewrite_token_limit_exceeded');
  return Object.freeze(result);
}

function exactPhrase(value: string): string {
  const escaped = value.replace(/["\\]/gu, (character) => `\\${character}`);
  const query = `"${escaped}"`;
  if (query.length > QUERY_REWRITE_MAX_CHARACTERS) throw new TypeError('query_rewrite_output_limit_exceeded');
  return query;
}

function timestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError('invalid_query_rewrite_created_at');
  return value;
}

export function createQueryRewritePlan(input: {
  rewriteId: string;
  operationId: string;
  query: string;
  createdAt: string;
}): Readonly<QueryRewritePlan> {
  if (!/^rewrite_[A-Za-z0-9]{20,64}$/u.test(input.rewriteId)) throw new TypeError('invalid_query_rewrite_id');
  if (!/^op_[A-Za-z0-9]{20,64}$/u.test(input.operationId)) throw new TypeError('invalid_query_rewrite_operation_id');
  const normalizedQuery = normalizedText(input.query);
  const queryTokens = tokens(normalizedQuery);
  const variants = Object.freeze([
    Object.freeze({ variantId: 'identity' as const, kind: 'identity' as const, query: normalizedQuery, tokenCount: queryTokens.length }),
    Object.freeze({ variantId: 'exact_phrase' as const, kind: 'exact_phrase' as const, query: exactPhrase(normalizedQuery), tokenCount: queryTokens.length }),
  ]);
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    rewriteId: input.rewriteId,
    operationId: input.operationId,
    originalQuery: input.query,
    normalizedQuery,
    createdAt: timestamp(input.createdAt),
    policy: 'deterministic_token_preserving_v1',
    variants,
  });
}

export function validateQueryRewritePlan(plan: QueryRewritePlan): Readonly<QueryRewritePlan> {
  const rebuilt = createQueryRewritePlan({ rewriteId: plan.rewriteId, operationId: plan.operationId, query: plan.originalQuery, createdAt: plan.createdAt });
  if (hashQueryRewritePlan(rebuilt) !== hashQueryRewritePlan(plan)) throw new TypeError('invalid_query_rewrite_plan');
  return rebuilt;
}

export function hashQueryRewritePlan(plan: QueryRewritePlan): string {
  return hashJson(plan as unknown as JsonValue);
}