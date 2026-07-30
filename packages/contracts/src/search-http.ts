import { canonicalRequestHash } from './canonical-request.js';
import type { RetrievalSynthesisReport } from './retrieval-synthesis.js';
import { verifySearchCitation, type SearchResponse } from './search.js';
import { verifySearchCacheDisclosure } from './search-cache.js';
import { normalizeSearchLocaleOptions } from './search-locale.js';
import { CONTRACT_VERSION, type JsonValue } from './types.js';

export const SEARCH_PRODUCT_ID = 'search.query' as const;
export const SEARCH_FREE_PATH = '/v1/search/free' as const;
export const SEARCH_PAID_PATH = '/v1/search/paid' as const;
export const SEARCH_MAX_BODY_BYTES = 16_384;
export const SEARCH_MAX_QUERY_CHARACTERS = 2_000;
export const SEARCH_MAX_RESULTS = 10;

export interface SearchHttpRequest {
  query: string;
  maxResults?: number;
  synthesize?: boolean;
  language?: string;
  region?: string;
}

export interface SearchExecutionOutput {
  searchResponse: SearchResponse;
  synthesisReport?: RetrievalSynthesisReport;
}

export interface SearchExecutorInput extends Required<SearchHttpRequest> {
  operationId: string;
  requestHash: string;
  fundingMode: 'free' | 'paid';
}

export interface SearchExecutor {
  execute(input: Readonly<SearchExecutorInput>): SearchExecutionOutput | Promise<SearchExecutionOutput>;
}

export interface SearchHttpResult {
  contractVersion: typeof CONTRACT_VERSION;
  operationId: string;
  operation: typeof SEARCH_PRODUCT_ID;
  state: 'RECEIPTED';
  replayed: boolean;
  fundingMode: 'free' | 'paid';
  requestHash: string;
  output: SearchExecutionOutput;
  receipt?: JsonValue;
}

export interface FreeQuotaDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
}

export class InMemoryFreeSearchQuota {
  readonly #records = new Map<string, { count: number; windowStart: number }>();

  constructor(readonly limit = 3, readonly windowMs = 60_000) {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1_000) throw new TypeError('invalid_free_search_quota');
  }

  consume(subject: string, now: string): Readonly<FreeQuotaDecision> {
    if (subject.length < 1 || subject.length > 200) throw new TypeError('invalid_quota_subject');
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs)) throw new TypeError('invalid_quota_time');
    const current = this.#records.get(subject);
    const record = current === undefined || nowMs - current.windowStart >= this.windowMs
      ? { count: 0, windowStart: nowMs }
      : current;
    const resetAt = new Date(record.windowStart + this.windowMs).toISOString();
    if (record.count >= this.limit) return Object.freeze({ allowed: false, limit: this.limit, remaining: 0, resetAt });
    record.count += 1;
    this.#records.set(subject, record);
    return Object.freeze({ allowed: true, limit: this.limit, remaining: this.limit - record.count, resetAt });
  }
}

export function normalizeSearchHttpRequest(value: unknown): Readonly<Required<SearchHttpRequest>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('invalid_search_request');
  const record = value as Record<string, unknown>;
  const allowed = new Set(['query', 'maxResults', 'synthesize', 'language', 'region']);
  if (Object.keys(record).some((key) => !allowed.has(key))) throw new TypeError('search_request_additional_property');
  if (typeof record.query !== 'string') throw new TypeError('invalid_search_query');
  const query = record.query.trim();
  if (query.length < 1 || query.length > SEARCH_MAX_QUERY_CHARACTERS || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(query)) throw new TypeError('invalid_search_query');
  const maxResults = record.maxResults ?? SEARCH_MAX_RESULTS;
  if (!Number.isInteger(maxResults) || (maxResults as number) < 1 || (maxResults as number) > SEARCH_MAX_RESULTS) throw new TypeError('invalid_search_max_results');
  const synthesize = record.synthesize ?? true;
  if (typeof synthesize !== 'boolean') throw new TypeError('invalid_search_synthesize');
  const locale = normalizeSearchLocaleOptions({ language: record.language, region: record.region });
  return Object.freeze({ query, maxResults: maxResults as number, synthesize, ...locale });
}

export function searchHttpRequestHash(request: Readonly<Required<SearchHttpRequest>>, target: typeof SEARCH_FREE_PATH | typeof SEARCH_PAID_PATH = SEARCH_FREE_PATH): string {
  return canonicalRequestHash({
    contractVersion: CONTRACT_VERSION,
    operation: SEARCH_PRODUCT_ID,
    method: 'POST',
    target,
    contentType: 'application/json',
    body: request,
  });
}

export function assertSearchExecutionOutput(output: SearchExecutionOutput, input: Readonly<SearchExecutorInput>): void {
  if (output === null || typeof output !== 'object') throw new TypeError('invalid_search_execution_output');
  const response = output.searchResponse;
  const locale = normalizeSearchLocaleOptions(input);
  if (response.contractVersion !== CONTRACT_VERSION || response.operationId !== input.operationId || response.query !== input.query || response.language !== locale.language || response.region !== locale.region) throw new TypeError('search_execution_binding_invalid');
  if (response.results.length > input.maxResults) throw new TypeError('search_execution_result_limit_exceeded');
  if (!verifySearchCacheDisclosure(response, input.maxResults)) throw new TypeError('search_execution_cache_disclosure_invalid');
  if (!response.citations.every((citation) => verifySearchCitation(citation, response.results).valid)) throw new TypeError('search_execution_citation_invalid');
  if (output.synthesisReport !== undefined) {
    const synthesis = output.synthesisReport;
    if (!input.synthesize || synthesis.operationId !== input.operationId || synthesis.query !== input.query) throw new TypeError('search_synthesis_binding_invalid');
    if (!synthesis.citations.every((citation) => verifySearchCitation(citation, response.results).valid)) throw new TypeError('search_synthesis_citation_invalid');
    const responseCitationIds = new Set(response.citations.map((citation) => citation.citationId));
    if (synthesis.citations.some((citation) => !responseCitationIds.has(citation.citationId))) throw new TypeError('search_synthesis_citation_unbound');
  }
}

export function createSearchHttpResult(input: SearchExecutorInput, output: SearchExecutionOutput, replayed: boolean, receipt?: JsonValue): Readonly<SearchHttpResult> {
  assertSearchExecutionOutput(output, input);
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    operationId: input.operationId,
    operation: SEARCH_PRODUCT_ID,
    state: 'RECEIPTED',
    replayed,
    fundingMode: input.fundingMode,
    requestHash: input.requestHash,
    output: Object.freeze({ ...output }),
    ...(receipt === undefined ? {} : { receipt }),
  });
}