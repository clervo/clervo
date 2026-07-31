import { createHash } from 'node:crypto';
import {
  CONTRACT_VERSION,
  FOCUSED_INDEX_ADAPTER_ID,
  FOCUSED_INDEX_CIRCUIT_IDENTITY,
  FOCUSED_INDEX_FAILURE_DOMAIN,
  FOCUSED_INDEX_HEALTH_IDENTITY,
  FOCUSED_INDEX_PROVIDER_ID,
  FOCUSED_INDEX_ROUTE_ID,
  LIVE_FEDERATION_RESPONSE_SCHEMA,
  assertConnectedRetrievalResponse,
  assertLiveFederationRuntimeIdentity,
  createQueryRewritePlan,
  createUntrustedEvidenceBoundary,
  liveFederationRuntimeIdentity,
  rankConnectedEvidence,
  type ConnectedCitation,
  type ConnectedRetrievalResponse,
  type ConnectedRouteAttempt,
  type ConnectedRouteEvidence,
  type RetrievalRouteId,
  verifyUntrustedEvidenceBoundary,
} from '../../../packages/contracts/src/index.js';
import type { FocusedIndexRoute } from './focused-index.js';
import type { LiveFederationRoute, LiveExtractResult } from './live-federation.js';
import { extractCurrentPage, type DirectCurrentPageFetch } from './live-federation.js';
import type { Crawl4AiRenderer } from '../../../adapters/search/src/crawl4ai-js-fallback.js';

export interface ConnectedRouteIdentity {
  routeId: RetrievalRouteId;
  providerId: string;
  adapterId: string;
  healthIdentity: string;
  circuitIdentity: string;
  failureDomain: string;
}

export interface ConnectedRouteAdapter {
  readonly identity: Readonly<ConnectedRouteIdentity>;
  search(request: Readonly<{ query: string; language: string; region: string; maximumResults: number; generatedAt: string; deadlineAt: string; signal: AbortSignal }>): Promise<readonly Readonly<ConnectedRouteEvidence>[]>;
}

export const focusedConnectedIdentity: Readonly<ConnectedRouteIdentity> = Object.freeze({
  routeId: FOCUSED_INDEX_ROUTE_ID, providerId: FOCUSED_INDEX_PROVIDER_ID, adapterId: FOCUSED_INDEX_ADAPTER_ID,
  healthIdentity: FOCUSED_INDEX_HEALTH_IDENTITY, circuitIdentity: FOCUSED_INDEX_CIRCUIT_IDENTITY, failureDomain: FOCUSED_INDEX_FAILURE_DOMAIN,
});

export const liveConnectedIdentity: Readonly<ConnectedRouteIdentity> = Object.freeze({
  routeId: liveFederationRuntimeIdentity.routeId, providerId: liveFederationRuntimeIdentity.providerId, adapterId: liveFederationRuntimeIdentity.adapterId,
  healthIdentity: liveFederationRuntimeIdentity.healthIdentity, circuitIdentity: liveFederationRuntimeIdentity.circuitIdentity, failureDomain: liveFederationRuntimeIdentity.failureDomain,
});

function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }

function validateIdentity(identity: ConnectedRouteIdentity, expected: ConnectedRouteIdentity): void {
  if (JSON.stringify(identity) !== JSON.stringify(expected)) throw new Error('connected_route_identity_substitution');
}

export function createFocusedConnectedRoute(route: FocusedIndexRoute): ConnectedRouteAdapter {
  return Object.freeze({
    identity: focusedConnectedIdentity,
    async search(request: Readonly<{ query: string; language: string; region: string; maximumResults: number; generatedAt: string; deadlineAt: string; signal: AbortSignal }>) {
      const documents = await route.query(request.query, request.generatedAt, Math.min(100, request.maximumResults * 3));
      return Object.freeze(documents.filter((document) => document.provenance.language.split('-', 1)[0] === request.language.split('-', 1)[0]).map((document) => Object.freeze({
        routeId: FOCUSED_INDEX_ROUTE_ID, providerId: FOCUSED_INDEX_PROVIDER_ID, adapterId: FOCUSED_INDEX_ADAPTER_ID,
        url: document.provenance.canonicalUrl, title: document.title, evidenceText: document.content,
        retrievedAt: document.fetchedAt, authorityScore: 88, relevanceScore: 80, language: request.language, region: request.region,
        attribution: Object.freeze({ sourceId: 'focused_index' as const, sourceName: 'Clervo focused index', sourceUrl: document.provenance.sourceUrl, license: 'source-policy approved at index admission', notice: 'Current-page evidence indexed by Clervo under the recorded source policy.' }),
        extraction: Object.freeze({ fetchId: `fetch_${document.documentId.slice(4, 36)}`, extractionId: `extract_${document.documentId.slice(4, 36)}`, sourceBodySha256: document.provenance.contentHash, normalizedTextSha256: document.contentFingerprint, instructionHandling: 'untrusted_data_only' as const, renderMode: 'static' as const, crawl4aiStatus: 'not_used' as const }),
      })));
    },
  });
}

export function createLiveConnectedRoute(route: LiveFederationRoute): ConnectedRouteAdapter {
  assertLiveFederationRuntimeIdentity(route.identity);
  return Object.freeze({ identity: liveConnectedIdentity, search: (request: Readonly<{ query: string; language: string; region: string; maximumResults: number; generatedAt: string; deadlineAt: string; signal: AbortSignal }>) => route.search(request) });
}

interface AttemptResult {
  attempt: Readonly<ConnectedRouteAttempt>;
  evidence: readonly Readonly<ConnectedRouteEvidence>[];
}

async function attemptRoute(adapter: ConnectedRouteAdapter, query: string, input: SearchWebInput, startedAt: string, deadlineAt: string, signal?: AbortSignal): Promise<AttemptResult> {
  if (signal?.aborted) return { attempt: Object.freeze({ routeId: adapter.identity.routeId, providerId: adapter.identity.providerId, healthIdentity: adapter.identity.healthIdentity, circuitIdentity: adapter.identity.circuitIdentity, failureDomain: adapter.identity.failureDomain, startedAt, completedAt: startedAt, outcome: 'cancelled', resultCount: 0, failureCode: 'cancelled' }), evidence: Object.freeze([]) };
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const remaining = Math.max(0, Date.parse(deadlineAt) - Date.parse(startedAt));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const terminal = new Promise<'deadline_exceeded' | 'cancelled'>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve('deadline_exceeded'); }, remaining);
    signal?.addEventListener('abort', () => resolve('cancelled'), { once: true });
  });
  const execution = Promise.resolve().then(() => adapter.search({ query, language: input.language, region: input.region, maximumResults: input.maximumResults, generatedAt: startedAt, deadlineAt, signal: controller.signal }))
    .then((evidence) => ({ kind: 'succeeded' as const, evidence }), (error: unknown) => ({ kind: 'failed' as const, error }));
  const settled = await Promise.race([execution, terminal.then((kind) => ({ kind }))]);
  if (timer !== undefined) clearTimeout(timer);
  signal?.removeEventListener('abort', cancel);
  const common = { routeId: adapter.identity.routeId, providerId: adapter.identity.providerId, healthIdentity: adapter.identity.healthIdentity, circuitIdentity: adapter.identity.circuitIdentity, failureDomain: adapter.identity.failureDomain, startedAt };
  if (settled.kind === 'succeeded') return { attempt: Object.freeze({ ...common, completedAt: startedAt, outcome: 'succeeded', resultCount: settled.evidence.length }), evidence: settled.evidence };
  const timed = settled.kind === 'deadline_exceeded' || settled.kind === 'cancelled';
  const failureCode = timed ? settled.kind : settled.kind === 'failed' && settled.error instanceof Error ? settled.error.message : 'route_failed';
  return { attempt: Object.freeze({ ...common, completedAt: timed && settled.kind === 'deadline_exceeded' ? deadlineAt : startedAt, outcome: timed ? settled.kind : 'failed', resultCount: 0, failureCode }), evidence: Object.freeze([]) };
}

export interface SearchWebInput {
  operationId: string;
  query: string;
  language: string;
  region: string;
  maximumResults: number;
  generatedAt: string;
  deadlineMs: number;
  signal?: AbortSignal;
}

export class ConnectedRetrievalPipeline {
  constructor(readonly dependencies: Readonly<{
    focused: ConnectedRouteAdapter;
    live: ConnectedRouteAdapter;
    directFetch?: DirectCurrentPageFetch;
    crawl4ai?: Crawl4AiRenderer;
  }>) {
    validateIdentity(dependencies.focused.identity, focusedConnectedIdentity);
    validateIdentity(dependencies.live.identity, liveConnectedIdentity);
    if (dependencies.focused.identity.failureDomain === dependencies.live.identity.failureDomain
      || dependencies.focused.identity.healthIdentity === dependencies.live.identity.healthIdentity
      || dependencies.focused.identity.circuitIdentity === dependencies.live.identity.circuitIdentity) throw new Error('connected_routes_not_independent');
  }

  async searchWeb(input: Readonly<SearchWebInput>): Promise<Readonly<ConnectedRetrievalResponse>> {
    if (!/^op_[A-Za-z0-9]{20,64}$/u.test(input.operationId) || input.query.trim() === '' || !Number.isInteger(input.maximumResults) || input.maximumResults < 1 || input.maximumResults > 100
      || !Number.isInteger(input.deadlineMs) || input.deadlineMs < 1 || input.deadlineMs > 30_000) throw new Error('invalid_connected_search_request');
    const rewrite = createQueryRewritePlan({ rewriteId: `rewrite_${digest(input.operationId).slice(0, 32)}`, operationId: input.operationId, query: input.query, createdAt: input.generatedAt });
    const deadlineAt = new Date(Date.parse(input.generatedAt) + input.deadlineMs).toISOString();
    const [focused, live] = await Promise.all([
      attemptRoute(this.dependencies.focused, rewrite.variants[0]!.query, input, input.generatedAt, deadlineAt, input.signal),
      attemptRoute(this.dependencies.live, rewrite.variants[1]!.query, input, input.generatedAt, deadlineAt, input.signal),
    ]);
    const attempts = Object.freeze([focused.attempt, live.attempt]);
    const succeeded = [focused, live].filter((attempt) => attempt.attempt.outcome === 'succeeded');
    if (succeeded.length === 0) throw new Error('connected_retrieval_both_routes_unavailable');
    for (const item of succeeded.flatMap((attempt) => attempt.evidence)) {
      if (item.routeId !== FOCUSED_INDEX_ROUTE_ID && item.routeId !== liveFederationRuntimeIdentity.routeId) throw new Error('connected_result_route_identity_substitution');
      const expected = item.routeId === FOCUSED_INDEX_ROUTE_ID ? focusedConnectedIdentity : liveConnectedIdentity;
      if (item.routeId === FOCUSED_INDEX_ROUTE_ID && item.providerId !== expected.providerId) throw new Error('connected_result_provider_identity_substitution');
      if (item.language !== input.language || item.region !== input.region) throw new Error('connected_result_locale_substitution');
      const boundary = createUntrustedEvidenceBoundary(item.routeId, item.evidenceText, item.extraction);
      if (!verifyUntrustedEvidenceBoundary(boundary)) throw new Error('connected_result_prompt_injection_boundary_failed');
    }
    const ranked = rankConnectedEvidence({ evidence: succeeded.flatMap((attempt) => attempt.evidence), now: input.generatedAt, maximumResults: input.maximumResults, nearDuplicateThresholdBasisPoints: 8_500 });
    const citations: readonly Readonly<ConnectedCitation>[] = Object.freeze(ranked.results.map((result) => {
      const endOffset = Math.min(result.evidenceText.length, 280);
      return Object.freeze({ citationId: `ccite_${digest(`${result.resultId}\n${result.extraction.extractionId}`).slice(0, 36)}`, resultId: result.resultId, routeId: result.routeId, canonicalUrl: result.canonicalUrl, quote: result.evidenceText.slice(0, endOffset), startOffset: 0, endOffset, extractionId: result.extraction.extractionId });
    }));
    const degradedRoutes = Object.freeze(attempts.filter((attempt) => attempt.outcome !== 'succeeded').map((attempt) => attempt.routeId));
    const response = Object.freeze({
      contractVersion: CONTRACT_VERSION, schemaVersion: LIVE_FEDERATION_RESPONSE_SCHEMA, operationId: input.operationId, productId: 'search.web' as const,
      query: rewrite.normalizedQuery, rewriteQueries: Object.freeze([rewrite.variants[0]!.query, rewrite.variants[1]!.query]) as readonly [string, string],
      language: input.language, region: input.region, generatedAt: input.generatedAt, status: degradedRoutes.length === 0 ? 'ready' as const : 'degraded' as const,
      degradedRoutes, attempts, exactDuplicateCount: ranked.exactDuplicateCount, nearDuplicateCount: ranked.nearDuplicateCount, results: ranked.results, citations,
    });
    assertConnectedRetrievalResponse(response);
    return response;
  }

  async webFetch(url: string, signal?: AbortSignal) {
    if (this.dependencies.directFetch === undefined) throw new Error('web_fetch_unavailable');
    return this.dependencies.directFetch(url, signal);
  }

  async webExtract(fetch: Awaited<ReturnType<DirectCurrentPageFetch>>, deadlineAt: string, signal = new AbortController().signal): Promise<Readonly<LiveExtractResult>> {
    return extractCurrentPage({ fetch, deadlineAt, signal, ...(this.dependencies.crawl4ai === undefined ? {} : { crawl4ai: this.dependencies.crawl4ai }) });
  }

  executeProduct(productId: 'search.answer' | 'research.report'): never {
    throw new Error(productId === 'search.answer' ? 'search_answer_preview_unqualified' : 'research_report_unavailable');
  }
}
