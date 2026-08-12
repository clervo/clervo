import { createHash } from 'node:crypto';
import {
  LIVE_FEDERATION_ROUTE_ID,
  assertLiveFederationRuntimeIdentity,
  canonicalizeSearchUrl,
  extractRetrieval,
  fetchRetrieval,
  InMemoryRetrievalDomainGovernor,
  liveFederationRuntimeIdentity,
  type ConnectedExtractionProvenance,
  type ConnectedRouteEvidence,
  type LiveDiscoveryCandidate,
  type RetrievalFetchDependencies,
  type RetrievalFetchResult,
  type RetrievalDomainGovernor,
} from '../../../packages/contracts/src/index.js';
import type { OpenDataDiscoveryAdapter } from '../../../adapters/search/src/open-data.js';
import {
  assertCrawl4AiRenderResult,
  javascriptRequiredDeterministically,
  type Crawl4AiRenderer,
} from '../../../adapters/search/src/crawl4ai-js-fallback.js';

export interface LiveFederationCircuitState {
  identity: 'clervo.circuit.live_federation';
  status: 'closed' | 'open' | 'half_open';
  consecutiveFailures: number;
  openedAt?: string;
  probeInFlight: boolean;
}

export class LiveFederationCircuit {
  private failures = 0;
  private openedAtMs: number | undefined;
  private probeInFlight = false;
  constructor(readonly threshold = 3, readonly halfOpenAfterMs = 30_000, readonly now = () => Date.now()) {
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20 || !Number.isInteger(halfOpenAfterMs) || halfOpenAfterMs < 1 || halfOpenAfterMs > 3_600_000) throw new Error('invalid_live_federation_circuit_threshold');
  }
  get state(): Readonly<LiveFederationCircuitState> {
    const eligible = this.openedAtMs !== undefined && this.now() - this.openedAtMs >= this.halfOpenAfterMs;
    const status = this.failures < this.threshold ? 'closed' : eligible ? 'half_open' : 'open';
    return Object.freeze({ identity: 'clervo.circuit.live_federation', status, consecutiveFailures: this.failures, ...(this.openedAtMs === undefined ? {} : { openedAt: new Date(this.openedAtMs).toISOString() }), probeInFlight: this.probeInFlight });
  }
  acquire(): void {
    const state = this.state;
    if (state.status === 'open') throw new Error('live_federation_circuit_open');
    if (state.status === 'half_open') {
      if (this.probeInFlight) throw new Error('live_federation_half_open_probe_in_flight');
      this.probeInFlight = true;
    }
  }
  success(): void { this.failures = 0; this.openedAtMs = undefined; this.probeInFlight = false; }
  failure(): void {
    this.probeInFlight = false;
    this.failures = Math.min(this.threshold, this.failures + 1);
    if (this.failures >= this.threshold) this.openedAtMs = this.now();
  }
}

export interface DirectCurrentPageFetchOptions {
  maximumBytes: number;
  maximumCompressedBytes?: number;
  deadlineMs: number;
  userAgent: string;
  dependencies?: RetrievalFetchDependencies;
  domainGovernor?: RetrievalDomainGovernor;
}

export type DirectCurrentPageFetch = (url: string, signal?: AbortSignal) => Promise<Readonly<RetrievalFetchResult>>;

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

const discoveryStopWords = new Set(['a', 'an', 'and', 'at', 'authoritative', 'by', 'current', 'evidence', 'for', 'from', 'in', 'is', 'of', 'official', 'on', 'or', 'the', 'to', 'verified', 'with']);

function discoveryTokens(value: string): readonly string[] {
  return Object.freeze([...new Set(value.normalize('NFKC').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+(?:[-_.][\p{L}\p{N}]+)*/gu) ?? [])].filter((token) => token.length > 1 && !discoveryStopWords.has(token)));
}

function metadataEvidence(candidate: LiveDiscoveryCandidate, query: string): ConnectedRouteEvidence | undefined {
  const tokens = discoveryTokens(query);
  const text = `${candidate.title}\n${candidate.snippet}`.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  const lower = text.toLocaleLowerCase('en-US');
  const hits = tokens.filter((token) => lower.includes(token)).length;
  const title = candidate.title.normalize('NFKC').toLocaleLowerCase('en-US');
  const titleHits = tokens.filter((token) => title.includes(token)).length;
  // A concise title often contains only one of a multi-token query (for
  // example, Wikimedia's “X402” page for “x402 protocol”). Requiring every
  // query token in the title incorrectly discards healthy primary results and
  // forces the Crossref fallback. Keep the relevance floor on the combined
  // evidence, but require only one title token as a disambiguating anchor.
  if (tokens.length > 0 && (hits < Math.max(1, Math.ceil(tokens.length * 0.5)) || titleHits < 1)) return undefined;
  const bodyHash = digest(text);
  const identity = createHash('sha256').update(`${candidate.adapterId}\n${candidate.currentUrl}\n${text}`).digest('hex');
  return Object.freeze({
    routeId: LIVE_FEDERATION_ROUTE_ID,
    providerId: candidate.providerId,
    adapterId: candidate.adapterId,
    url: candidate.currentUrl,
    title: candidate.title,
    evidenceText: text,
    retrievedAt: candidate.retrievedAt,
    ...(candidate.publishedAt === undefined ? {} : { publishedAt: candidate.publishedAt }),
    authorityScore: candidate.attribution.sourceId === 'wikimedia' ? 88 : candidate.attribution.sourceId === 'crossref' ? 92 : candidate.attribution.sourceId === 'common_crawl' ? 60 : 90,
    relevanceScore: Math.min(100, Math.round(45 + 40 * hits / Math.max(1, tokens.length) + 15 * titleHits / Math.max(1, tokens.length))),
    language: candidate.language,
    region: candidate.region,
    attribution: candidate.attribution,
    extraction: Object.freeze({ fetchId: `fetch_${identity.slice(0, 32)}`, extractionId: `extract_${identity.slice(16, 48)}`, sourceBodySha256: bodyHash, normalizedTextSha256: bodyHash, instructionHandling: 'untrusted_data_only' as const, renderMode: 'static' as const, crawl4aiStatus: 'not_used' as const }),
  });
}

export function createDirectCurrentPageFetch(options: DirectCurrentPageFetchOptions): DirectCurrentPageFetch {
  if (!Number.isInteger(options.maximumBytes) || options.maximumBytes < 1 || options.maximumBytes > 16 * 1024 * 1024
    || !Number.isInteger(options.deadlineMs) || options.deadlineMs < 1 || options.deadlineMs > 30_000
    || !/Clervo/u.test(options.userAgent) || !/\(.+@.+\)/u.test(options.userAgent)) throw new Error('invalid_direct_current_page_fetch_options');
  const boundaryNow = options.dependencies?.now ?? (() => new Date());
  const domainGovernor = options.domainGovernor ?? new InMemoryRetrievalDomainGovernor(2, 1_000, 60_000, () => boundaryNow().getTime());
  return async (url, signal) => {
    const canonical = canonicalizeSearchUrl(url);
    const parsed = new URL(canonical);
    if (parsed.hostname === 'data.commoncrawl.org' || /\.(?:warc|wat|wet)(?:\.gz)?$/iu.test(parsed.pathname)) throw new Error('archived_warc_body_rejected');
    if (signal?.aborted) throw new Error('direct_fetch_cancelled');
    const now = options.dependencies?.now ?? (() => new Date());
    const started = now();
    return fetchRetrieval({
      fetchId: `fetch_${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`,
      url: canonical,
      mode: 'retained_evidence',
      providerAllowedContentUse: ['search_metadata', 'transient_extraction', 'retained_evidence'],
      maximumBytes: options.maximumBytes,
      maximumCompressedBytes: options.maximumCompressedBytes ?? Math.min(options.maximumBytes, 1024 * 1024),
      deadlineAt: new Date(started.getTime() + options.deadlineMs).toISOString(),
      userAgent: options.userAgent,
    }, { ...options.dependencies, domainGovernor, ...(signal === undefined ? {} : { signal }) });
  };
}

export interface LiveExtractResult {
  title: string;
  text: string;
  provenance: Readonly<ConnectedExtractionProvenance>;
}

export async function extractCurrentPage(input: {
  fetch: Readonly<RetrievalFetchResult>;
  deadlineAt: string;
  signal: AbortSignal;
  crawl4ai?: Crawl4AiRenderer;
}): Promise<Readonly<LiveExtractResult>> {
  if (input.fetch.receipt.outcome !== 'succeeded' || input.fetch.body === undefined || input.fetch.receipt.finalUrl === undefined || input.fetch.receipt.bodySha256 === undefined) throw new Error('web_extract_requires_successful_fetch');
  if (input.signal.aborted) throw new Error('web_extract_cancelled');
  const extractionId = `extract_${createHash('sha256').update(`${input.fetch.receipt.fetchId}\n${input.fetch.receipt.bodySha256}`).digest('hex').slice(0, 32)}`;
  if (javascriptRequiredDeterministically(input.fetch.receipt, input.fetch.body)) {
    if (input.crawl4ai === undefined) throw new Error('crawl4ai_provisional_unavailable');
    const browserHealth = input.crawl4ai.health?.();
    if (browserHealth !== undefined && (browserHealth.lifecycle !== 'ready' || !browserHealth.isolationProven)) throw new Error('crawl4ai_isolation_unavailable');
    const rendered = await input.crawl4ai.render({ url: input.fetch.receipt.finalUrl, deadlineAt: input.deadlineAt, signal: input.signal });
    assertCrawl4AiRenderResult(rendered);
    return Object.freeze({
      title: rendered.title.normalize('NFKC').replace(/\s+/gu, ' ').trim(),
      text: rendered.text.normalize('NFKC').replace(/\r\n?/gu, '\n').trim(),
      provenance: Object.freeze({ fetchId: input.fetch.receipt.fetchId, extractionId, sourceBodySha256: rendered.sourceBodySha256, normalizedTextSha256: rendered.normalizedTextSha256, instructionHandling: 'untrusted_data_only', renderMode: 'crawl4ai_javascript', crawl4aiStatus: browserHealth === undefined ? 'provisional_n4_25' : 'runtime_attested' }),
    });
  }
  const extraction = await extractRetrieval({ extractionId, receipt: input.fetch.receipt, body: input.fetch.body, maximumOutputCharacters: 100_000, workerTimeoutMs: 2_000 });
  const title = extraction.segments.find((segment) => segment.kind === 'heading')?.text ?? new URL(extraction.finalUrl).hostname;
  return Object.freeze({
    title,
    text: extraction.normalizedText,
    provenance: Object.freeze({ fetchId: extraction.fetchId, extractionId: extraction.extractionId, sourceBodySha256: extraction.sourceBodySha256, normalizedTextSha256: extraction.normalizedTextSha256, instructionHandling: extraction.instructionHandling, renderMode: 'static', crawl4aiStatus: 'not_used' }),
  });
}

export interface LiveFederationSearchRequest {
  query: string;
  language: string;
  region: string;
  maximumResults: number;
  generatedAt: string;
  deadlineAt: string;
  signal: AbortSignal;
}

export class LiveFederationRoute {
  readonly identity = liveFederationRuntimeIdentity;
  readonly circuit: LiveFederationCircuit;
  private readonly sourceFailures = new Map<string, number>();
  private readonly sourceSuspendedAt = new Map<string, number>();

  constructor(readonly dependencies: Readonly<{
    adapters: readonly OpenDataDiscoveryAdapter[];
    fetch: DirectCurrentPageFetch;
    crawl4ai?: Crawl4AiRenderer;
    circuit?: LiveFederationCircuit;
    perSourceDeadlineMs?: number;
    perPageDeadlineMs?: number;
  }>) {
    assertLiveFederationRuntimeIdentity(this.identity);
    if (dependencies.adapters.length < 1 || dependencies.adapters.length > 8 || new Set(dependencies.adapters.map((adapter) => adapter.adapterId)).size !== dependencies.adapters.length) throw new Error('invalid_live_federation_adapter_set');
    if (dependencies.perSourceDeadlineMs !== undefined && (!Number.isInteger(dependencies.perSourceDeadlineMs) || dependencies.perSourceDeadlineMs < 100 || dependencies.perSourceDeadlineMs > 4_000)) throw new Error('invalid_live_source_deadline');
    if (dependencies.perPageDeadlineMs !== undefined && (!Number.isInteger(dependencies.perPageDeadlineMs) || dependencies.perPageDeadlineMs < 100 || dependencies.perPageDeadlineMs > 4_000)) throw new Error('invalid_live_page_deadline');
    this.circuit = dependencies.circuit ?? new LiveFederationCircuit();
  }

  health(checkedAt: string): Readonly<{ identity: 'clervo.health.live_federation'; routeId: typeof LIVE_FEDERATION_ROUTE_ID; status: 'healthy' | 'unavailable'; checkedAt: string }> {
    return Object.freeze({ identity: 'clervo.health.live_federation', routeId: LIVE_FEDERATION_ROUTE_ID, status: this.circuit.state.status === 'closed' ? 'healthy' : 'unavailable', checkedAt });
  }

  sourceHealth(checkedAt: string): readonly Readonly<{ adapterId: string; healthIdentity: string; circuitIdentity: string; status: 'healthy' | 'suspended'; consecutiveFailures: number; checkedAt: string }>[] {
    const now = Date.parse(checkedAt);
    return Object.freeze(this.dependencies.adapters.map((adapter) => {
      const suspendedAt = this.sourceSuspendedAt.get(adapter.adapterId);
      const suspended = suspendedAt !== undefined && now - suspendedAt < 30_000;
      return Object.freeze({ adapterId: adapter.adapterId, healthIdentity: `clervo.health.live_source.${adapter.adapterId}`, circuitIdentity: `clervo.circuit.live_source.${adapter.adapterId}`, status: suspended ? 'suspended' as const : 'healthy' as const, consecutiveFailures: this.sourceFailures.get(adapter.adapterId) ?? 0, checkedAt });
    }));
  }

  async search(request: Readonly<LiveFederationSearchRequest>): Promise<readonly Readonly<ConnectedRouteEvidence>[]> {
    this.circuit.acquire();
    const sourceBudgetMs = Math.min(this.dependencies.perSourceDeadlineMs ?? 1_200, Math.max(1, Date.parse(request.deadlineAt) - Date.parse(request.generatedAt)));
    const sourceHealth = new Map(this.sourceHealth(request.generatedAt).map((source) => [source.adapterId, source]));
    const adapters = this.dependencies.adapters.filter((adapter) => sourceHealth.get(adapter.adapterId)?.status !== 'suspended');
    const searches = await Promise.allSettled(adapters.map(async (adapter) => {
      const controller = new AbortController();
      const cancel = (): void => controller.abort();
      request.signal.addEventListener('abort', cancel, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('live_source_deadline_exceeded')); }, sourceBudgetMs); });
        const candidates = await Promise.race([adapter.search({ query: request.query, language: request.language, region: request.region, maximumResults: Math.max(2, Math.ceil(request.maximumResults * 0.6)),
          deadlineAt: new Date(Date.parse(request.generatedAt) + sourceBudgetMs).toISOString(), signal: controller.signal, retrievedAt: request.generatedAt }), deadline]);
        this.sourceFailures.set(adapter.adapterId, 0);
        this.sourceSuspendedAt.delete(adapter.adapterId);
        return candidates;
      } catch (error) {
        const failures = Math.min(3, (this.sourceFailures.get(adapter.adapterId) ?? 0) + 1);
        this.sourceFailures.set(adapter.adapterId, failures);
        if (failures >= 3) this.sourceSuspendedAt.set(adapter.adapterId, Date.parse(request.generatedAt));
        throw error;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        request.signal.removeEventListener('abort', cancel);
      }
    }));
    const successfulSearches = searches.filter((settled): settled is PromiseFulfilledResult<readonly LiveDiscoveryCandidate[]> => settled.status === 'fulfilled');
    const bySource = successfulSearches.map((settled) => [...settled.value].sort((left, right) => left.currentUrl.localeCompare(right.currentUrl)));
    const candidates: LiveDiscoveryCandidate[] = [];
    const sourceQuota = Math.max(2, Math.ceil(request.maximumResults * 0.6));
    for (let rank = 0; candidates.length < Math.min(40, request.maximumResults * 4) && bySource.some((items) => rank < Math.min(items.length, sourceQuota)); rank += 1) {
      for (const items of bySource) if (rank < Math.min(items.length, sourceQuota)) candidates.push(items[rank]!);
    }
    if (successfulSearches.length === 0) { this.circuit.failure(); throw new Error('live_federation_discovery_unavailable'); }
    if (candidates.length === 0) { this.circuit.success(); return Object.freeze([]); }
    const evidence = (await Promise.all(candidates.map(async (candidate): Promise<ConnectedRouteEvidence | undefined> => {
      if (candidate.routeId !== LIVE_FEDERATION_ROUTE_ID || candidate.language !== request.language || candidate.region !== request.region) throw new Error('live_federation_candidate_identity_substitution');
      const fallback = metadataEvidence(candidate, request.query);
      if (fallback !== undefined) return fallback;
      const controller = new AbortController();
      const cancel = (): void => controller.abort();
      request.signal.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => controller.abort(), this.dependencies.perPageDeadlineMs ?? 600);
      try {
        const fetched = await this.dependencies.fetch(candidate.currentUrl, controller.signal);
        const extracted = await extractCurrentPage({ fetch: fetched, deadlineAt: request.deadlineAt, signal: controller.signal, ...(this.dependencies.crawl4ai === undefined ? {} : { crawl4ai: this.dependencies.crawl4ai }) });
        const terms = discoveryTokens(request.query);
        const lower = `${candidate.title} ${extracted.text}`.toLocaleLowerCase('en-US');
        const hits = terms.filter((term) => lower.includes(term)).length;
        if (terms.length > 0 && hits < Math.max(2, Math.ceil(terms.length * 0.5))) return undefined;
        const relevance = Math.min(100, Math.round(40 + 60 * hits / Math.max(1, terms.length)));
        const authority = candidate.attribution.sourceId === 'wikimedia' ? 92 : candidate.attribution.sourceId === 'crossref' ? 90 : candidate.attribution.sourceId === 'common_crawl' ? 55 : 90;
        return Object.freeze({
          routeId: LIVE_FEDERATION_ROUTE_ID, providerId: candidate.providerId, adapterId: candidate.adapterId,
          url: candidate.currentUrl, title: extracted.title || candidate.title, evidenceText: extracted.text,
          retrievedAt: candidate.retrievedAt, ...(candidate.publishedAt === undefined ? {} : { publishedAt: candidate.publishedAt }),
          authorityScore: authority, relevanceScore: relevance, language: candidate.language, region: candidate.region,
          attribution: candidate.attribution, extraction: extracted.provenance,
        });
      } catch { return fallback; }
      finally { clearTimeout(timer); request.signal.removeEventListener('abort', cancel); }
    }))).filter((item): item is ConnectedRouteEvidence => item !== undefined);
    const orderedEvidence = evidence.sort((left, right) => right.relevanceScore - left.relevanceScore || right.authorityScore - left.authorityScore || left.url.localeCompare(right.url));
    const perSource = new Map<string, number>();
    const rankedEvidence = orderedEvidence.filter((item) => {
      const count = perSource.get(item.adapterId) ?? 0;
      if (count >= sourceQuota) return false;
      perSource.set(item.adapterId, count + 1);
      return true;
    }).slice(0, request.maximumResults);
    if (rankedEvidence.length === 0) { this.circuit.success(); return Object.freeze([]); }
    this.circuit.success();
    return Object.freeze(rankedEvidence);
  }
}

export function commonCrawlMetadataHasNoBody(candidate: LiveDiscoveryCandidate): boolean {
  return candidate.discoveryKind !== 'common_crawl_metadata' || (candidate.attribution.sourceId === 'common_crawl' && candidate.attribution.license.includes('metadata') && candidate.currentUrl !== '' && digest(candidate.currentUrl).startsWith('sha256:'));
}
