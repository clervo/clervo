import { createHash } from 'node:crypto';
import type { ComposedAiProductCatalog } from './product-catalog.js';

export interface AiFreeTierPolicy {
  revision: string;
  enabled: boolean;
  zeroUpstreamCostRequired: true;
  automaticPaidOverageAllowed: false;
  perWalletDailyRequests: number;
  globalDailyRequests: number;
  validUntil: string;
}

export interface AiFreeTierQuotaDecision {
  allowed: boolean;
  subjectRemaining: number;
  globalRemaining: number;
  resetAt: string;
}

export interface AiFreeTierQuotaStore {
  readonly durable: boolean;
  consume(input: Readonly<{ subject: string; now: string; subjectLimit: number; globalLimit: number }>): Promise<Readonly<AiFreeTierQuotaDecision>>;
}

function dayWindow(now: string): Readonly<{ day: string; resetAt: string }> {
  const parsed = Date.parse(now);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== now) throw new TypeError('ai_free_tier_time_invalid');
  const day = now.slice(0, 10);
  return Object.freeze({ day, resetAt: new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString() });
}

function limits(subjectLimit: number, globalLimit: number): void {
  if (!Number.isSafeInteger(subjectLimit) || subjectLimit < 1 || !Number.isSafeInteger(globalLimit) || globalLimit < subjectLimit) throw new TypeError('ai_free_tier_limits_invalid');
}

export class InMemoryAiFreeTierQuotaStore implements AiFreeTierQuotaStore {
  readonly durable = false;
  readonly #subjects = new Map<string, number>();
  readonly #global = new Map<string, number>();

  async consume(input: Readonly<{ subject: string; now: string; subjectLimit: number; globalLimit: number }>): Promise<Readonly<AiFreeTierQuotaDecision>> {
    if (input.subject.length < 1 || input.subject.length > 200) throw new TypeError('ai_free_tier_subject_invalid');
    limits(input.subjectLimit, input.globalLimit);
    const { day, resetAt } = dayWindow(input.now);
    const subjectKey = `${day}\0${input.subject}`;
    const subjectCount = this.#subjects.get(subjectKey) ?? 0;
    const globalCount = this.#global.get(day) ?? 0;
    if (subjectCount >= input.subjectLimit || globalCount >= input.globalLimit) return Object.freeze({ allowed: false, subjectRemaining: Math.max(0, input.subjectLimit - subjectCount), globalRemaining: Math.max(0, input.globalLimit - globalCount), resetAt });
    this.#subjects.set(subjectKey, subjectCount + 1);
    this.#global.set(day, globalCount + 1);
    return Object.freeze({ allowed: true, subjectRemaining: input.subjectLimit - subjectCount - 1, globalRemaining: input.globalLimit - globalCount - 1, resetAt });
  }
}

export class PostgresAiFreeTierQuotaStore implements AiFreeTierQuotaStore {
  readonly durable = true;
  readonly #client: Readonly<{ query(sql: string, values: readonly unknown[]): Promise<Readonly<{ rows: readonly Record<string, unknown>[] }>> }>;
  readonly #namespace: string;

  constructor(client: Readonly<{ query(sql: string, values: readonly unknown[]): Promise<Readonly<{ rows: readonly Record<string, unknown>[] }>> }>, namespace: string) {
    if (typeof client?.query !== 'function' || !/^[a-z0-9][a-z0-9_-]{2,31}$/u.test(namespace)) throw new TypeError('ai_free_tier_store_configuration_invalid');
    this.#client = client;
    this.#namespace = namespace;
  }

  async consume(input: Readonly<{ subject: string; now: string; subjectLimit: number; globalLimit: number }>): Promise<Readonly<AiFreeTierQuotaDecision>> {
    if (input.subject.length < 1 || input.subject.length > 200) throw new TypeError('ai_free_tier_subject_invalid');
    limits(input.subjectLimit, input.globalLimit);
    const { day, resetAt } = dayWindow(input.now);
    const subjectHash = `sha256:${createHash('sha256').update(`${this.#namespace}\0${input.subject}`).digest('hex')}`;
    const result = await this.#client.query(
      `WITH locked AS (
         SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))
       ), counts AS (
         SELECT
           coalesce(max(request_count) FILTER (WHERE subject_hash = $3), 0)::integer AS subject_count,
           coalesce(max(request_count) FILTER (WHERE subject_hash = '__global__'), 0)::integer AS global_count
         FROM clervo_ai_free_tier_quota, locked
         WHERE environment_namespace = $1 AND quota_day = $2::date
       ), decision AS (
         SELECT subject_count < $4 AND global_count < $5 AS allowed, subject_count, global_count FROM counts
       ), subject_write AS (
         INSERT INTO clervo_ai_free_tier_quota (environment_namespace, quota_day, subject_hash, request_count, updated_at)
         SELECT $1, $2::date, $3, 1, $6::timestamptz FROM decision WHERE allowed
         ON CONFLICT (environment_namespace, quota_day, subject_hash) DO UPDATE SET request_count = clervo_ai_free_tier_quota.request_count + 1, updated_at = $6::timestamptz
       ), global_write AS (
         INSERT INTO clervo_ai_free_tier_quota (environment_namespace, quota_day, subject_hash, request_count, updated_at)
         SELECT $1, $2::date, '__global__', 1, $6::timestamptz FROM decision WHERE allowed
         ON CONFLICT (environment_namespace, quota_day, subject_hash) DO UPDATE SET request_count = clervo_ai_free_tier_quota.request_count + 1, updated_at = $6::timestamptz
       )
       SELECT allowed, subject_count, global_count FROM decision`,
      [this.#namespace, day, subjectHash, input.subjectLimit, input.globalLimit, input.now],
    );
    const row = result.rows[0];
    if (row === undefined || typeof row.allowed !== 'boolean' || !Number.isSafeInteger(Number(row.subject_count)) || !Number.isSafeInteger(Number(row.global_count))) throw new TypeError('ai_free_tier_store_result_invalid');
    const subjectCount = Number(row.subject_count) + (row.allowed ? 1 : 0);
    const globalCount = Number(row.global_count) + (row.allowed ? 1 : 0);
    return Object.freeze({ allowed: row.allowed, subjectRemaining: Math.max(0, input.subjectLimit - subjectCount), globalRemaining: Math.max(0, input.globalLimit - globalCount), resetAt });
  }
}

function allRatesZero(pricing: Readonly<Record<string, string | number>> | null): boolean {
  return pricing !== null && Object.entries(pricing).every(([key, value]) => ['currency', 'decimals'].includes(key) || value === 0);
}

export async function authorizeAiFreeTierRequest(input: {
  catalog: Readonly<ComposedAiProductCatalog>;
  modelId: string;
  walletSubject: string;
  now: string;
  policy: Readonly<AiFreeTierPolicy>;
  store: AiFreeTierQuotaStore;
}): Promise<Readonly<{ outcome: 'allowed' | 'not_eligible' | 'quota_exceeded'; quota: Readonly<AiFreeTierQuotaDecision> | null; automaticPaidOverageAllowed: false }>> {
  const validUntil = Date.parse(input.policy.validUntil);
  if (!Number.isFinite(validUntil) || new Date(validUntil).toISOString() !== input.policy.validUntil) throw new TypeError('ai_free_tier_policy_time_invalid');
  limits(input.policy.perWalletDailyRequests, input.policy.globalDailyRequests);
  if (input.policy.zeroUpstreamCostRequired !== true || input.policy.automaticPaidOverageAllowed !== false) throw new TypeError('ai_free_tier_policy_unsafe');
  const now = Date.parse(input.now);
  if (!input.policy.enabled || validUntil <= now) return Object.freeze({ outcome: 'not_eligible', quota: null, automaticPaidOverageAllowed: false });
  const publicModel = input.catalog.publicModels.find(({ modelId }) => modelId === input.modelId);
  const eligibleSupply = input.catalog.internalModels.filter(({ identity, publicSellable, productIds, pricing }) => identity.customerModelId === input.modelId && publicSellable && productIds.includes('ai.chat') && allRatesZero(pricing.upstreamCost as unknown as Record<string, string | number> | null) && allRatesZero(pricing.customerPricing as unknown as Record<string, string | number> | null));
  if (publicModel?.publicSellable !== true || eligibleSupply.length === 0) return Object.freeze({ outcome: 'not_eligible', quota: null, automaticPaidOverageAllowed: false });
  const quota = await input.store.consume({ subject: input.walletSubject, now: input.now, subjectLimit: input.policy.perWalletDailyRequests, globalLimit: input.policy.globalDailyRequests });
  return Object.freeze({ outcome: quota.allowed ? 'allowed' : 'quota_exceeded', quota, automaticPaidOverageAllowed: false });
}
