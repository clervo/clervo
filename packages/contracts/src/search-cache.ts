import { hashJson } from './receipt.js';
import { CONTRACT_VERSION, type JsonValue } from './types.js';

export const searchCachePolicyId = 'search_cache_disclosure_v1' as const;
export const searchCacheOutcomes = ['miss', 'fresh_hit', 'stale_revalidated'] as const;

export type SearchCacheOutcome = typeof searchCacheOutcomes[number];

export interface SearchCacheDisclosure {
  policyId: typeof searchCachePolicyId;
  outcome: SearchCacheOutcome;
  requestSha256: string;
  responseSha256: string;
  observedAt: string;
  maximumResults: number;
  freshnessLifetimeSeconds: number;
  ageSeconds: number;
  residentAgeSeconds: number;
  freshnessRemainingSeconds: number;
  revalidationPerformed: boolean;
  storedAt?: string;
  validatedAt?: string;
  previousValidatedAt?: string;
}

export type SearchCacheEvidence =
  | { outcome: 'miss' }
  | { outcome: 'fresh_hit'; storedAt: string; validatedAt: string; freshnessLifetimeSeconds: number }
  | { outcome: 'stale_revalidated'; storedAt: string; previousValidatedAt: string; validatedAt: string; freshnessLifetimeSeconds: number };

export interface SearchCacheResponseMaterial {
  contractVersion: typeof CONTRACT_VERSION;
  operationId: string;
  query: string;
  language: string;
  region: string;
  generatedAt: string;
  deduplicatedCount: number;
  results: readonly unknown[];
  citations: readonly unknown[];
}

const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;
const maximumFreshnessLifetimeSeconds = 31_536_000;

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid_${name}`);
  return parsed;
}

function secondsBetween(laterMs: number, earlierMs: number): number {
  return Math.floor((laterMs - earlierMs) / 1_000);
}

function assertMaximumResults(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('invalid_search_cache_maximum_results');
}

function assertFreshnessLifetime(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > maximumFreshnessLifetimeSeconds) throw new Error('invalid_search_cache_freshness_lifetime');
}

export function searchCacheRequestSha256(query: string, maximumResults: number, language = 'en', region = 'US'): string {
  assertMaximumResults(maximumResults);
  return hashJson({ contractVersion: CONTRACT_VERSION, operation: 'search.query', query, language, region, maximumResults });
}

export function searchCacheResponseSha256(response: SearchCacheResponseMaterial): string {
  return hashJson(response as unknown as JsonValue);
}

export function createSearchCacheDisclosure(
  response: SearchCacheResponseMaterial,
  maximumResults: number,
  evidence: SearchCacheEvidence = { outcome: 'miss' },
): Readonly<SearchCacheDisclosure> {
  assertMaximumResults(maximumResults);
  const observedMs = timestamp(response.generatedAt, 'search_cache_observed_at');
  const common = {
    policyId: searchCachePolicyId,
    requestSha256: searchCacheRequestSha256(response.query, maximumResults, response.language, response.region),
    responseSha256: searchCacheResponseSha256(response),
    observedAt: response.generatedAt,
    maximumResults,
  };
  if (evidence.outcome === 'miss') {
    return Object.freeze({ ...common, outcome: 'miss', freshnessLifetimeSeconds: 0, ageSeconds: 0, residentAgeSeconds: 0, freshnessRemainingSeconds: 0, revalidationPerformed: false });
  }
  assertFreshnessLifetime(evidence.freshnessLifetimeSeconds);
  const storedMs = timestamp(evidence.storedAt, 'search_cache_stored_at');
  const validatedMs = timestamp(evidence.validatedAt, 'search_cache_validated_at');
  if (storedMs > validatedMs || validatedMs > observedMs) throw new Error('invalid_search_cache_timeline');
  const ageSeconds = secondsBetween(observedMs, validatedMs);
  const residentAgeSeconds = secondsBetween(observedMs, storedMs);
  if (evidence.outcome === 'fresh_hit') {
    if (ageSeconds >= evidence.freshnessLifetimeSeconds) throw new Error('search_cache_entry_not_fresh');
    return Object.freeze({ ...common, outcome: 'fresh_hit', freshnessLifetimeSeconds: evidence.freshnessLifetimeSeconds, ageSeconds, residentAgeSeconds, freshnessRemainingSeconds: evidence.freshnessLifetimeSeconds - ageSeconds, revalidationPerformed: false, storedAt: evidence.storedAt, validatedAt: evidence.validatedAt });
  }
  const previousValidatedMs = timestamp(evidence.previousValidatedAt, 'search_cache_previous_validated_at');
  if (previousValidatedMs < storedMs || previousValidatedMs > validatedMs || secondsBetween(validatedMs, previousValidatedMs) < evidence.freshnessLifetimeSeconds) throw new Error('search_cache_entry_was_not_stale');
  if (validatedMs !== observedMs) throw new Error('search_cache_revalidation_not_current');
  return Object.freeze({ ...common, outcome: 'stale_revalidated', freshnessLifetimeSeconds: evidence.freshnessLifetimeSeconds, ageSeconds: 0, residentAgeSeconds, freshnessRemainingSeconds: evidence.freshnessLifetimeSeconds, revalidationPerformed: true, storedAt: evidence.storedAt, validatedAt: evidence.validatedAt, previousValidatedAt: evidence.previousValidatedAt });
}

export function verifySearchCacheDisclosure(
  response: SearchCacheResponseMaterial & { cache: SearchCacheDisclosure },
  expectedMaximumResults?: number,
): boolean {
  try {
    const disclosure = response.cache;
    if (disclosure.policyId !== searchCachePolicyId || !searchCacheOutcomes.includes(disclosure.outcome) || !sha256Pattern.test(disclosure.requestSha256) || !sha256Pattern.test(disclosure.responseSha256)) return false;
    if (expectedMaximumResults !== undefined && disclosure.maximumResults !== expectedMaximumResults) return false;
    const { cache: _cache, ...material } = response as SearchCacheResponseMaterial & { cache: SearchCacheDisclosure };
    const evidence: SearchCacheEvidence = disclosure.outcome === 'miss'
      ? { outcome: 'miss' }
      : disclosure.outcome === 'fresh_hit'
        ? { outcome: 'fresh_hit', storedAt: disclosure.storedAt ?? '', validatedAt: disclosure.validatedAt ?? '', freshnessLifetimeSeconds: disclosure.freshnessLifetimeSeconds }
        : { outcome: 'stale_revalidated', storedAt: disclosure.storedAt ?? '', previousValidatedAt: disclosure.previousValidatedAt ?? '', validatedAt: disclosure.validatedAt ?? '', freshnessLifetimeSeconds: disclosure.freshnessLifetimeSeconds };
    const expected = createSearchCacheDisclosure(material, disclosure.maximumResults, evidence);
    return hashJson(disclosure as unknown as JsonValue) === hashJson(expected as unknown as JsonValue);
  } catch {
    return false;
  }
}