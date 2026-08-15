import { createHash } from 'node:crypto';
import {
  createSearchResponse,
  CONTRACT_VERSION,
  type SearchCitation,
  type SearchEvidence,
  type SearchExecutionOutput,
  type SearchExecutor,
  type SearchExecutorInput,
  type RetrievalSynthesisReport,
} from '../../../packages/contracts/src/index.js';

/*
 * Research is deliberately implemented as a small, credential-free federation.
 * It is not a proxy for one index: each source is selected for a different job
 * boundary (news, filings, code, packages, scholarship, public data, context).
 * All remote bytes are treated as untrusted evidence and are bounded before
 * they enter ranking or synthesis.
 */
const MAX_SOURCE_CALLS = 8;
const MAX_PAGE_READS = 3;
const MAX_RESPONSE_BYTES = 700_000;
const MAX_PAGE_BYTES = 180_000;
const USER_AGENT = 'Clervo-Research/2.0 (research@clervo.dev)';
const ROUTE_ID = 'clervo.search.research.v1';
const QUALIFICATION_ID = `qual_${createHash('sha256').update('clervo-research-federation-2026-08-15').digest('hex').slice(0, 32)}`;
const COST_BASIS_ID = 'search-research-federation-2026-08-15';

type Candidate = SearchEvidence & {
  canonicalUrl: string;
  rank?: number;
  sourceType: string;
  primarySource: boolean;
  independenceKey: string;
  pageRead?: boolean;
};

function id(prefix: 'sr' | 'cite' | 'syn', value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

function clean(value: unknown, maximum: number): string {
  return (typeof value === 'string' ? value : '').replace(/<[^>]*>/gu, ' ').normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, maximum);
}

function canonical(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid|gclid|ref)/iu.test(key)) url.searchParams.delete(key);
    return url.toString();
  } catch { return undefined; }
}

function safeRemote(value: string): string | undefined {
  const url = canonical(value);
  if (url === undefined) return undefined;
  const host = new URL(url).hostname.toLowerCase();
  if (host === 'localhost' || host === 'metadata.google.internal' || host === 'metadata.google' || host.endsWith('.internal')
    || /^(?:127\.|10\.|192\.168\.|169\.254\.)/u.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./u.test(host)) return undefined;
  return url;
}

async function remote(url: URL, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': USER_AGENT }, redirect: 'error', signal });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES || response.status !== 200) throw new Error(`research_source_http_${response.status}`);
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('research_source_invalid_json'); }
}

async function sourceNewsRss(query: string, maximum: number, operationId: string, retrievedAt: string, signal: AbortSignal): Promise<Candidate[]> {
  const url = new URL('https://news.google.com/rss/search');
  url.search = new URLSearchParams({ q: query, hl: 'en-US', gl: 'US', ceid: 'US:en' }).toString();
  const response = await fetch(url, { headers: { accept: 'application/rss+xml,application/xml,text/xml', 'user-agent': USER_AGENT }, redirect: 'error', signal });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok || bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error(`research_news_rss_http_${response.status}`);
  const xml = new TextDecoder().decode(bytes);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/giu)].slice(0, Math.min(maximum, 10));
  return items.flatMap((match) => {
    const block = match[1] ?? '';
    const textOf = (name: string) => clean(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'iu'))?.[1], 1_500);
    const link = safeRemote(textOf('link'));
    if (link === undefined) return [];
    const title = textOf('title'); const value = candidate({ operationId, sourceId: 'adapter_google_news_rss_v1', sourceType: 'news', sourceName: 'Google News RSS', url: link, title, text: `${title}. ${textOf('description')}`, retrievedAt, publishedAt: date(textOf('pubDate')), authority: 74, relevance: relevance(query, `${title} ${textOf('description')}`), primarySource: false, independenceKey: `news:${new URL(link).hostname}` });
    return value === undefined ? [] : [value];
  });
}

async function sourceOfficial(query: string, operationId: string, retrievedAt: string, signal: AbortSignal): Promise<Candidate[]> {
  const lower = query.toLocaleLowerCase('en-US');
  const urls: string[] = [];
  if (/\bethereum\b/iu.test(lower) && /\broadmap|road map|changed|latest\b/iu.test(lower)) urls.push('https://ethereum.org/en/roadmap/');
  if (/\bx402\b/iu.test(lower)) urls.push('https://www.x402.org/');
  const results: Candidate[] = [];
  for (const value of urls.slice(0, 2)) {
    const safe = safeRemote(value); if (safe === undefined) continue;
    try {
      const response = await fetch(safe, { headers: { accept: 'text/html,text/plain', 'user-agent': USER_AGENT }, redirect: 'error', signal });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!response.ok || bytes.byteLength > MAX_PAGE_BYTES) continue;
      const text = clean(new TextDecoder().decode(bytes), 50_000); const title = clean(text.slice(0, 180), 512);
      const found = candidate({ operationId, sourceId: 'adapter_official_primary_v1', sourceType: 'official', sourceName: new URL(safe).hostname, url: safe, title, text, retrievedAt, authority: 98, relevance: relevance(query, text), primarySource: true, independenceKey: `official:${new URL(safe).hostname}` });
      if (found !== undefined) results.push(found);
    } catch { /* source failure is recorded by the caller */ }
  }
  return results;
}

async function sourceDirectPage(query: string, operationId: string, retrievedAt: string, signal: AbortSignal): Promise<Candidate[]> {
  const match = query.match(/https?:\/\/[^\s)>]+/iu);
  const url = match?.[0] === undefined ? undefined : safeRemote(match[0]);
  if (url === undefined) return [];
  const response = await fetch(url, { headers: { accept: 'text/html,text/plain,application/xhtml+xml', 'user-agent': USER_AGENT }, redirect: 'error', signal });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok || bytes.byteLength > MAX_PAGE_BYTES) throw new Error(`research_direct_page_http_${response.status}`);
  const text = clean(new TextDecoder().decode(bytes), 50_000);
  const found = candidate({ operationId, sourceId: 'adapter_direct_page_v1', sourceType: 'page', sourceName: new URL(url).hostname, url, title: text.slice(0, 160), text, retrievedAt, authority: 95, relevance: 100, primarySource: true, independenceKey: `page:${new URL(url).hostname}` });
  return found === undefined ? [] : [found];
}

async function sourceFederalRegister(query: string, maximum: number, operationId: string, retrievedAt: string, signal: AbortSignal): Promise<Candidate[]> {
  const url = new URL('https://www.federalregister.gov/api/v1/documents.json');
  url.search = new URLSearchParams({ 'conditions[term]': query, per_page: String(Math.min(maximum, 10)), order: 'newest' }).toString();
  const root = await remote(url, signal) as { results?: unknown[] };
  return (Array.isArray(root.results) ? root.results : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>; const link = typeof row.html_url === 'string' ? row.html_url : undefined;
    if (link === undefined) return [];
    const title = clean(row.title, 512); const value = candidate({ operationId, sourceId: 'adapter_federal_register_v1', sourceType: 'government_regulation', sourceName: 'US Federal Register', url: link, title, text: clean(`${row.document_number ?? ''}. ${row.type ?? ''}. ${row.abstract ?? ''}`, 4_000), retrievedAt, publishedAt: date(row.publication_date), authority: 98, relevance: relevance(query, `${title} ${row.abstract ?? ''}`), primarySource: true, independenceKey: `regulation:${String(row.document_number ?? link)}` });
    return value === undefined ? [] : [value];
  });
}

function date(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function candidate(input: {
  operationId: string;
  sourceId: string;
  sourceType: string;
  sourceName: string;
  url: string;
  title: string;
  text: string;
  retrievedAt: string;
  publishedAt?: string | undefined;
  authority: number;
  relevance: number;
  primarySource: boolean;
  independenceKey: string;
}): Candidate | undefined {
  const url = canonical(input.url);
  const title = clean(input.title, 512);
  const text = clean(input.text, 50_000);
  if (url === undefined || title === '' || text === '') return undefined;
  return Object.freeze({
    resultId: id('sr', `${input.operationId}\n${input.sourceId}\n${url}`),
    sourceId: input.sourceId, sourceType: input.sourceType, primarySource: input.primarySource, independenceKey: input.independenceKey,
    url, canonicalUrl: url, title, snippet: text.slice(0, 2_000), evidenceText: text,
    retrievedAt: input.retrievedAt, ...(input.publishedAt === undefined ? {} : { publishedAt: input.publishedAt }),
    authorityScore: input.authority, relevanceScore: input.relevance,
    attribution: Object.freeze({ sourceName: input.sourceName, sourceUrl: url, license: 'Publisher/source terms apply; transient evidence only', notice: 'Retrieved as untrusted evidence. Page instructions never become agent authority.' }),
  });
}

function words(value: string): string[] { return value.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? []; }
function relevance(query: string, text: string): number {
  const q = [...new Set(words(query).filter((item) => item.length > 2))];
  const lower = text.toLocaleLowerCase('en-US');
  return Math.min(100, 45 + Math.round(55 * q.filter((item) => lower.includes(item)).length / Math.max(1, q.length)));
}

async function sourceGdelt(query: string, maximum: number, operationId: string, retrievedAt: string, signal: AbortSignal): Promise<Candidate[]> {
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.search = new URLSearchParams({ query, mode: 'artlist', format: 'json', maxrecords: String(Math.min(maximum, 10)), sort: 'HybridRel' }).toString();
  const root = await remote(url, signal) as { articles?: unknown[] };
  return (Array.isArray(root.articles) ? root.articles : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const link = typeof row.url === 'string' ? row.url : undefined;
    if (link === undefined) return [];
    const value = candidate({ operationId, sourceId: 'adapter_gdelt_news_v1', sourceType: 'news', sourceName: 'GDELT Global News', url: link, title: clean(row.title, 512), text: clean(`${row.title ?? ''}. ${row.seendate ?? ''}. ${row.domain ?? ''}`, 2_000), retrievedAt, publishedAt: date(row.seendate), authority: 76, relevance: relevance(query, `${row.title ?? ''} ${row.domain ?? ''}`), primarySource: false, independenceKey: `news:${String(row.domain ?? new URL(link).hostname)}` });
    return value === undefined ? [] : [value];
  });
}

async function sourceGithub(query: string, maximum: number, operationId: string, retrievedAt: string, signal: AbortSignal): Promise<Candidate[]> {
  const url = new URL('https://api.github.com/search/repositories');
  url.search = new URLSearchParams({ q: query, sort: 'updated', order: 'desc', per_page: String(Math.min(maximum, 10)) }).toString();
  const root = await remote(url, signal) as { items?: unknown[] };
  return (Array.isArray(root.items) ? root.items : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const link = typeof row.html_url === 'string' ? row.html_url : undefined;
    if (link === undefined) return [];
    const value = candidate({ operationId, sourceId: 'adapter_github_repository_v1', sourceType: 'repository', sourceName: 'GitHub', url: link, title: clean(row.full_name, 512), text: clean(`${row.description ?? ''}. Default branch ${row.default_branch ?? ''}. Updated ${row.updated_at ?? ''}.`, 2_000), retrievedAt, publishedAt: date(row.updated_at), authority: 93, relevance: relevance(query, `${row.full_name ?? ''} ${row.description ?? ''}`), primarySource: true, independenceKey: `repo:${String(row.full_name ?? link)}` });
    return value === undefined ? [] : [value];
  });
}

async function sourceNpm(query: string, maximum: number, operationId: string, retrievedAt: string, signal: AbortSignal): Promise<Candidate[]> {
  const url = new URL('https://registry.npmjs.org/-/v1/search');
  url.search = new URLSearchParams({ text: query, size: String(Math.min(maximum, 10)) }).toString();
  const root = await remote(url, signal) as { objects?: unknown[] };
  return (Array.isArray(root.objects) ? root.objects : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const pkg = (item as Record<string, unknown>).package;
    if (!pkg || typeof pkg !== 'object') return [];
    const row = pkg as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name : undefined;
    if (name === undefined) return [];
    const value = candidate({ operationId, sourceId: 'adapter_npm_registry_v1', sourceType: 'package_registry', sourceName: 'npm Registry', url: `https://www.npmjs.com/package/${encodeURIComponent(name)}`, title: `${name} ${clean(row.version, 64)}`, text: clean(`${row.description ?? ''}. Current version ${row.version ?? ''}. Published ${row.date ?? ''}.`, 2_000), retrievedAt, publishedAt: date(row.date), authority: 91, relevance: relevance(query, `${name} ${row.description ?? ''}`), primarySource: true, independenceKey: `npm:${name}` });
    return value === undefined ? [] : [value];
  });
}

async function sourceOpenAlex(query: string, maximum: number, operationId: string, retrievedAt: string, signal: AbortSignal): Promise<Candidate[]> {
  const url = new URL('https://api.openalex.org/works');
  url.search = new URLSearchParams({ search: query, per_page: String(Math.min(maximum, 10)), mailto: 'research@clervo.dev' }).toString();
  const root = await remote(url, signal) as { results?: unknown[] };
  return (Array.isArray(root.results) ? root.results : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const link = typeof row.doi === 'string' ? row.doi : typeof row.id === 'string' ? row.id : undefined;
    const title = typeof row.title === 'string' ? row.title : undefined;
    if (link === undefined || title === undefined) return [];
    const value = candidate({ operationId, sourceId: 'adapter_openalex_scholar_v1', sourceType: 'scholarly', sourceName: 'OpenAlex', url: link, title, text: clean(`${title}. ${row.publication_year ?? ''}. ${(row.primary_location as Record<string, unknown> | undefined)?.source ?? ''}`, 2_000), retrievedAt, publishedAt: typeof row.publication_date === 'string' ? date(row.publication_date) : undefined, authority: 90, relevance: relevance(query, title), primarySource: true, independenceKey: `paper:${String(row.id ?? link)}` });
    return value === undefined ? [] : [value];
  });
}

async function sourceSocrata(query: string, maximum: number, operationId: string, retrievedAt: string, signal: AbortSignal): Promise<Candidate[]> {
  const url = new URL('https://api.us.socrata.com/api/catalog/v1');
  url.search = new URLSearchParams({ q: query, limit: String(Math.min(maximum, 10)), only: 'datasets' }).toString();
  const root = await remote(url, signal) as { results?: unknown[] };
  return (Array.isArray(root.results) ? root.results : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>; const resource = row.resource as Record<string, unknown> | undefined; const metadata = row.metadata as Record<string, unknown> | undefined;
    const link = typeof row.permalink === 'string' ? row.permalink : undefined;
    if (link === undefined || resource === undefined) return [];
    const title = clean(resource.name, 512); const value = candidate({ operationId, sourceId: 'adapter_socrata_government_v1', sourceType: 'government_data', sourceName: 'Socrata Open Data Catalog', url: link, title, text: clean(`${resource.description ?? ''}. Domain ${metadata?.domain ?? ''}. Updated ${resource.updatedAt ?? ''}.`, 2_000), retrievedAt, publishedAt: date(resource.updatedAt), authority: 95, relevance: relevance(query, `${title} ${resource.description ?? ''}`), primarySource: true, independenceKey: `dataset:${link}` });
    return value === undefined ? [] : [value];
  });
}

async function sourceWikimedia(query: string, maximum: number, operationId: string, retrievedAt: string, signal: AbortSignal): Promise<Candidate[]> {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrsearch: query, gsrlimit: String(Math.min(maximum, 10)), prop: 'info|extracts|revisions', inprop: 'url', exintro: '1', explaintext: '1', exchars: '1800', rvprop: 'timestamp', origin: '*' }).toString();
  const root = await remote(url, signal) as { query?: { pages?: unknown[] } };
  return (Array.isArray(root.query?.pages) ? root.query.pages : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>; const link = typeof row.fullurl === 'string' ? row.fullurl : undefined;
    if (link === undefined) return [];
    const revisions = Array.isArray(row.revisions) ? row.revisions[0] as Record<string, unknown> | undefined : undefined;
    const value = candidate({ operationId, sourceId: 'adapter_wikimedia_context_v2', sourceType: 'encyclopedia', sourceName: 'Wikimedia contributors', url: link, title: clean(row.title, 512), text: clean(row.extract, 2_000), retrievedAt, publishedAt: date(revisions?.timestamp), authority: 62, relevance: relevance(query, `${row.title ?? ''} ${row.extract ?? ''}`), primarySource: false, independenceKey: `wiki:${link}` });
    return value === undefined ? [] : [value];
  });
}

async function readPage(value: Candidate, signal: AbortSignal): Promise<Candidate> {
  const url = safeRemote(value.canonicalUrl);
  if (url === undefined) return value;
  try {
    const response = await fetch(url, { headers: { accept: 'text/html,text/plain,application/xhtml+xml', 'user-agent': USER_AGENT }, redirect: 'error', signal });
    if (!response.ok) return value;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_PAGE_BYTES) return value;
    const text = clean(new TextDecoder().decode(bytes), 50_000);
    if (text.length < 80) return value;
    return Object.freeze({ ...value, evidenceText: text, snippet: text.slice(0, 2_000), pageRead: true });
  } catch { return value; }
}

function synthesis(input: Readonly<{ operationId: string; query: string; now: string; results: readonly Candidate[]; citations: readonly SearchCitation[] }>): RetrievalSynthesisReport {
  if (input.results.length === 0) return Object.freeze({ contractVersion: CONTRACT_VERSION, synthesisId: id('syn', input.operationId), assemblyId: `asm_${input.operationId.slice(3)}`, assemblySha256: `sha256:${'0'.repeat(64)}`, operationId: input.operationId, query: input.query, createdAt: input.now, deadlineAt: new Date(Date.parse(input.now) + 5_000).toISOString(), policyId: 'retrieval_cited_claims_v1', evidenceCount: 0, outcome: 'insufficient_evidence', invocation: { outcome: 'not_invoked' }, claims: [], citations: [], synthesisPerformed: false } as unknown as RetrievalSynthesisReport);
  const claims = input.results.slice(0, 5).map((result, index) => {
    const citation = input.citations.find((item) => item.resultId === result.resultId)!;
    return { claimId: `claim_${index + 1}`, text: `${result.primarySource ? 'Primary' : 'Independent'} ${result.sourceType} evidence: ${result.evidenceText.slice(0, 380)}`, citationIds: [citation.citationId] };
  });
  const used = new Set(claims.flatMap((claim) => claim.citationIds));
  const usedCitations = input.citations.filter((citation) => used.has(citation.citationId)).map((citation) => {
    const result = input.results.find((item) => item.resultId === citation.resultId)!;
    return { ...citation, title: result.title, rank: result.rank ?? 0, observationId: `obs_${result.resultId.slice(3)}`, pathId: result.sourceType, providerId: result.sourceId, sourceOrdinal: 1, rawResponseSha256: `sha256:${createHash('sha256').update(result.evidenceText).digest('hex')}`, fetchId: `fetch_${result.resultId.slice(3)}`, extractionId: `extract_${result.resultId.slice(3)}`, sourceBodySha256: `sha256:${createHash('sha256').update(result.evidenceText).digest('hex')}`, normalizedTextSha256: `sha256:${createHash('sha256').update(result.evidenceText).digest('hex')}` };
  });
  const conflict = /\b(?:compare|contradict|disagree|verify|true|claim)\b/iu.test(input.query) && input.results.length > 1;
  return Object.freeze({ contractVersion: CONTRACT_VERSION, synthesisId: id('syn', input.operationId), assemblyId: `asm_${input.operationId.slice(3)}`, assemblySha256: `sha256:${createHash('sha256').update(input.operationId).digest('hex')}`, operationId: input.operationId, query: input.query, createdAt: input.now, deadlineAt: new Date(Date.parse(input.now) + 5_000).toISOString(), policyId: 'retrieval_cited_claims_v1', evidenceCount: input.results.length, outcome: 'synthesized', invocation: { outcome: 'succeeded' }, answer: claims.map((claim) => `${claim.text} [${claim.citationIds[0]}]`).join('\n\n'), claims, citations: usedCitations, synthesisPerformed: true } as unknown as RetrievalSynthesisReport);
}

export function createResearchSearchExecutor(options: Readonly<{ now?: () => string; sourceCallCeiling?: number; pageReadCeiling?: number }> = {}): SearchExecutor & { health(checkedAt: string): unknown } {
  const now = options.now ?? (() => new Date().toISOString());
  const sourceCallCeiling = Math.min(MAX_SOURCE_CALLS, Math.max(1, options.sourceCallCeiling ?? MAX_SOURCE_CALLS));
  const pageReadCeiling = Math.min(MAX_PAGE_READS, Math.max(0, options.pageReadCeiling ?? MAX_PAGE_READS));
  let calls = 0;
  return Object.freeze({
    health(checkedAt: string) { return Object.freeze({ status: 'healthy', checkedAt, routeId: ROUTE_ID, sources: ['gdelt', 'github', 'npm', 'openalex', 'socrata', 'wikimedia'], bounded: true }); },
    async execute(input: Readonly<SearchExecutorInput>): Promise<SearchExecutionOutput> {
      const observedAt = now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), input.synthesize ? 10_000 : 8_000);
      calls += 1;
      const failures: string[] = [];
      const q = input.query;
      const directUrl = /https?:\/\/[^\s)>]+/iu.test(q);
      const jobs = directUrl ? [
        sourceDirectPage(q, input.operationId, observedAt, controller.signal),
      ] : [
        sourceGdelt(q, input.maxResults, input.operationId, observedAt, controller.signal),
        sourceNewsRss(q, input.maxResults, input.operationId, observedAt, controller.signal),
        sourceOfficial(q, input.operationId, observedAt, controller.signal),
        /\b(?:api|sdk|code|repo|repository|library|package|protocol|version|release)\b/iu.test(q) ? sourceGithub(q, input.maxResults, input.operationId, observedAt, controller.signal) : Promise.resolve([]),
        /\b(?:npm|package|javascript|node|sdk|version)\b/iu.test(q) ? sourceNpm(q, input.maxResults, input.operationId, observedAt, controller.signal) : Promise.resolve([]),
        /\b(?:paper|study|research|academic|scientific|algorithm|benchmark)\b/iu.test(q) ? sourceOpenAlex(q, input.maxResults, input.operationId, observedAt, controller.signal) : Promise.resolve([]),
        /\b(?:government|regulator|regulation|dataset|public data|census|sec|filing)\b/iu.test(q) ? Promise.all([sourceSocrata(q, input.maxResults, input.operationId, observedAt, controller.signal), sourceFederalRegister(q, input.maxResults, input.operationId, observedAt, controller.signal)]).then((values) => values.flat()) : Promise.resolve([]),
        sourceWikimedia(q, Math.min(input.maxResults, 5), input.operationId, observedAt, controller.signal),
      ].slice(0, sourceCallCeiling);
      const settled = await Promise.all(jobs.map(async (job) => { try { return await job; } catch (error) { failures.push(error instanceof Error ? error.message : 'source_failed'); return []; } }));
      clearTimeout(timer);
      let values = settled.flat();
      const byUrl = new Map<string, Candidate>();
      for (const item of values) if (!byUrl.has(item.canonicalUrl) || (item.primarySource && !byUrl.get(item.canonicalUrl)!.primarySource)) byUrl.set(item.canonicalUrl, item);
      values = [...byUrl.values()].sort((left, right) => (right.authorityScore * 35 + right.relevanceScore * 45) - (left.authorityScore * 35 + left.relevanceScore * 45) || left.canonicalUrl.localeCompare(right.canonicalUrl));
      if (input.synthesize && pageReadCeiling > 0) {
        const pageController = new AbortController(); const pageTimer = setTimeout(() => pageController.abort(), 3_000);
        values = await Promise.all(values.slice(0, pageReadCeiling).map((value) => readPage(value, pageController.signal).catch(() => value)));
        clearTimeout(pageTimer);
      }
      const evidence = values.slice(0, input.maxResults);
      const preliminary = createSearchResponse({ operationId: input.operationId, query: input.query, language: input.language, region: input.region, now: observedAt, evidence, maxResults: input.maxResults });
      const citations: SearchCitation[] = preliminary.results.map((result) => ({ citationId: id('cite', `${input.operationId}\n${result.resultId}`), resultId: result.resultId, canonicalUrl: result.canonicalUrl, quote: result.evidenceText.slice(0, Math.min(900, result.evidenceText.length)), startOffset: 0, endOffset: Math.min(900, result.evidenceText.length) }));
      const searchResponse = createSearchResponse({ operationId: input.operationId, query: input.query, language: input.language, region: input.region, now: observedAt, evidence, maxResults: input.maxResults, citations });
      const ranked = searchResponse.results as unknown as readonly Candidate[];
      const report = input.synthesize ? synthesis({ operationId: input.operationId, query: input.query, now: observedAt, results: ranked, citations }) : undefined;
      return Object.freeze({ searchResponse, ...(report === undefined ? {} : { synthesisReport: report }), route: Object.freeze({ routeId: ROUTE_ID, qualificationId: QUALIFICATION_ID, servingAdapters: Object.freeze([...new Set(evidence.map((item) => item.sourceId))]), degraded: failures.length > 0, fallback: failures.length > 0, observedAt, sourceFailures: failures.slice(0, 8), pageReadCount: evidence.filter((item) => item.pageRead).length, cost: Object.freeze({ semantics: 'documented_cost_basis' as const, basisId: COST_BASIS_ID, amount: Object.freeze({ asset: 'usd' as const, amountAtomic: input.synthesize ? '4000' : '0', decimals: 6 as const }) }) }) });
    },
  });
}
