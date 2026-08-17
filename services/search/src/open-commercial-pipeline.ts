import { createHash } from 'node:crypto';

import {
  CROSSREF_ADAPTER_ID,
  WIKIMEDIA_ADAPTER_ID,
  createSearchResponse,
  type ConnectedRouteEvidence,
  type SearchCitation,
  type SearchEvidence,
  type SearchExecutionOutput,
  type SearchExecutor,
  type SearchExecutorInput,
} from '../../../packages/contracts/src/index.js';
import {
  createCrossrefOpenDataAdapter,
  createWikimediaOpenDataAdapter,
  type OpenDataTransport,
} from '../../../adapters/search/src/open-data.js';
import { LiveFederationRoute } from './live-federation.js';

const MAXIMUM_UPSTREAM_BYTES = 1_000_000;
const USER_AGENT = 'Clervo-Search/1.0 (mo@clervo.dev)';
const COST_BASIS_ID = 'search-open-federation-2026-08-09.1';
const COST_AMOUNT_ATOMIC = '2000';

const routeDefinitions = Object.freeze({
  primary: Object.freeze({
    routeId: 'clervo.search.open.wikimedia.v1',
    adapterId: WIKIMEDIA_ADAPTER_ID,
    qualificationId: qualification('wikimedia|2026-08-09|CC-BY-SA-4.0|api-etiquette'),
  }),
  fallback: Object.freeze({
    routeId: 'clervo.search.open.crossref.v1',
    adapterId: CROSSREF_ADAPTER_ID,
    qualificationId: qualification('crossref|2026-08-09|metadata-reuse|polite-pool'),
  }),
});

function qualification(value: string): string {
  return `qual_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

function identifier(prefix: 'sr' | 'cite', value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

export function createOpenDataTransport(): OpenDataTransport {
  return async (request) => {
    const remaining = Math.max(1, Date.parse(request.deadlineAt) - Date.now());
    const timeout = AbortSignal.timeout(Math.min(4_000, remaining));
    const response = await fetch(request.url, {
      headers: request.headers,
      redirect: 'error',
      signal: AbortSignal.any([request.signal, timeout]),
    });
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAXIMUM_UPSTREAM_BYTES) throw new Error('open_search_response_too_large');
    const body = await response.text();
    if (Buffer.byteLength(body) > MAXIMUM_UPSTREAM_BYTES) throw new Error('open_search_response_too_large');
    return Object.freeze({ status: response.status, headers: Object.freeze(Object.fromEntries(response.headers)), body });
  };
}

function noUnlicensedPageFetch(): never {
  throw new Error('open_search_unlicensed_page_fetch_refused');
}

const queryStopWords = new Set(['a', 'an', 'and', 'are', 'about', 'current', 'documentation', 'for', 'from', 'how', 'is', 'latest', 'of', 'on', 'the', 'to', 'what', 'where', 'which', 'with']);
function primaryQuery(value: string): string {
  const tokens = value.normalize('NFKC').match(/[\p{L}\p{N}]+(?:[-_.][\p{L}\p{N}]+)*/gu) ?? [];
  const meaningful = tokens.filter((token) => token.length > 1 && !queryStopWords.has(token.toLocaleLowerCase('en-US')));
  return meaningful.slice(0, 2).join(' ') || value;
}

function evidence(input: SearchExecutorInput, routeEvidence: readonly Readonly<ConnectedRouteEvidence>[]): readonly SearchEvidence[] {
  return Object.freeze(routeEvidence.map((item, index) => Object.freeze({
    resultId: identifier('sr', `${input.operationId}\n${item.adapterId}\n${item.url}`),
    sourceId: item.adapterId,
    url: item.url,
    title: item.title,
    snippet: item.evidenceText.slice(0, 2_000),
    evidenceText: item.evidenceText,
    retrievedAt: item.retrievedAt,
    ...(item.publishedAt === undefined ? {} : { publishedAt: item.publishedAt }),
    authorityScore: item.authorityScore,
    relevanceScore: Math.max(item.relevanceScore, 100 - index * 5),
    attribution: Object.freeze({
      sourceName: item.attribution.sourceName,
      sourceUrl: item.attribution.sourceUrl,
      license: item.attribution.license,
      notice: item.attribution.notice,
    }),
  })));
}

export interface OpenCommercialSearchExecutor extends SearchExecutor {
  readonly calls: Readonly<{ primary: number; fallback: number }>;
  health(checkedAt: string): Readonly<{ status: 'healthy' | 'degraded' | 'unavailable'; primary: unknown; fallback: unknown }>;
}

export function createOpenCommercialSearchExecutor(options: Readonly<{
  transport?: OpenDataTransport;
  now?: () => string;
  primaryCallCeiling?: number;
  fallbackCallCeiling?: number;
}> = {}): OpenCommercialSearchExecutor {
  const transport = options.transport ?? createOpenDataTransport();
  const now = options.now ?? (() => new Date().toISOString());
  const primaryCallCeiling = options.primaryCallCeiling ?? 1_000;
  const fallbackCallCeiling = options.fallbackCallCeiling ?? 1_000;
  if (!Number.isSafeInteger(primaryCallCeiling) || primaryCallCeiling < 1 || primaryCallCeiling > 100_000
    || !Number.isSafeInteger(fallbackCallCeiling) || fallbackCallCeiling < 1 || fallbackCallCeiling > 100_000) throw new TypeError('open_search_call_ceiling_invalid');
  const primary = new LiveFederationRoute({
    adapters: [createWikimediaOpenDataAdapter({ transport, userAgent: USER_AGENT, sourceUseStatus: 'qualified' })],
    fetch: noUnlicensedPageFetch,
    perSourceDeadlineMs: 2_000,
    perPageDeadlineMs: 600,
  });
  const fallback = new LiveFederationRoute({
    adapters: [createCrossrefOpenDataAdapter({ transport, userAgent: USER_AGENT, mailto: 'mo@clervo.dev', sourceUseStatus: 'qualified' })],
    fetch: noUnlicensedPageFetch,
    perSourceDeadlineMs: 2_000,
    perPageDeadlineMs: 600,
  });
  let primaryCalls = 0;
  let fallbackCalls = 0;

  return Object.freeze({
    get calls() { return Object.freeze({ primary: primaryCalls, fallback: fallbackCalls }); },
    health(checkedAt: string) {
      const primaryHealth = primary.health(checkedAt);
      const fallbackHealth = fallback.health(checkedAt);
      const status = primaryHealth.status === 'healthy' ? 'healthy' : fallbackHealth.status === 'healthy' ? 'degraded' : 'unavailable';
      return Object.freeze({ status, primary: primaryHealth, fallback: fallbackHealth });
    },
    async execute(input: Readonly<SearchExecutorInput>): Promise<SearchExecutionOutput> {
      if (input.synthesize) throw new Error('search_synthesis_unavailable');
      const observedAt = now();
      const suppliedDeadline = Date.parse((input as SearchExecutorInput & { deadlineAt?: string }).deadlineAt ?? '');
      const deadlineAt = new Date(Number.isFinite(suppliedDeadline) ? Math.min(Date.parse(observedAt) + 4_000, suppliedDeadline) : Date.parse(observedAt) + 4_000).toISOString();
      const suppliedSignal = (input as SearchExecutorInput & { signal?: AbortSignal }).signal;
      const request = Object.freeze({
        query: input.query,
        language: input.language,
        region: input.region,
        maximumResults: input.maxResults,
        generatedAt: observedAt,
        deadlineAt,
        signal: suppliedSignal ?? new AbortController().signal,
      });
      let route: (typeof routeDefinitions)[keyof typeof routeDefinitions] = routeDefinitions.primary;
      let fallbackServed = false;
      let found: readonly Readonly<ConnectedRouteEvidence>[] = Object.freeze([]);
      try {
        if (primaryCalls >= primaryCallCeiling) throw new Error('open_search_primary_call_ceiling_reached');
        primaryCalls += 1;
        found = await primary.search(Object.freeze({ ...request, query: primaryQuery(request.query) }));
      } catch { /* A real primary health failure is eligible for the independent fallback. */ }
      if (found.length === 0) {
        if (fallbackCalls >= fallbackCallCeiling) throw new Error('open_search_fallback_call_ceiling_reached');
        fallbackServed = true;
        route = routeDefinitions.fallback;
        fallbackCalls += 1;
        found = await fallback.search(request);
      }
      if (found.length === 0) throw new Error('open_search_no_results');

      const sourceEvidence = evidence(input, found);
      const ranked = createSearchResponse({ operationId: input.operationId, query: input.query, language: input.language, region: input.region, now: observedAt, evidence: sourceEvidence, maxResults: input.maxResults });
      const citations: readonly SearchCitation[] = Object.freeze(ranked.results.map((result) => {
        const endOffset = Math.min(result.evidenceText.length, 800);
        return Object.freeze({
          citationId: identifier('cite', `${input.operationId}\n${result.resultId}`),
          resultId: result.resultId,
          canonicalUrl: result.canonicalUrl,
          quote: result.evidenceText.slice(0, endOffset),
          startOffset: 0,
          endOffset,
        });
      }));
      const searchResponse = createSearchResponse({ operationId: input.operationId, query: input.query, language: input.language, region: input.region, now: observedAt, evidence: sourceEvidence, maxResults: input.maxResults, citations });
      const servingAdapters = Object.freeze([...new Set(found.map((item) => item.adapterId))]);
      if (!servingAdapters.includes(route.adapterId)) throw new Error('open_search_route_identity_mismatch');
      return Object.freeze({
        searchResponse,
        route: Object.freeze({
          routeId: route.routeId,
          qualificationId: route.qualificationId,
          servingAdapters,
          degraded: fallbackServed,
          fallback: fallbackServed,
          observedAt,
          cost: Object.freeze({
            semantics: 'documented_cost_basis' as const,
            basisId: COST_BASIS_ID,
            amount: Object.freeze({ asset: 'usd' as const, amountAtomic: COST_AMOUNT_ATOMIC, decimals: 6 as const }),
          }),
        }),
      });
    },
  });
}

export const OPEN_COMMERCIAL_SEARCH_ROUTES = routeDefinitions;
