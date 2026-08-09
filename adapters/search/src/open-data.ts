import {
  COMMON_CRAWL_ADAPTER_ID,
  COMMON_CRAWL_PROVIDER_ID,
  CROSSREF_ADAPTER_ID,
  CROSSREF_PROVIDER_ID,
  LIVE_FEDERATION_ROUTE_ID,
  WIKIMEDIA_ADAPTER_ID,
  WIKIMEDIA_PROVIDER_ID,
  canonicalizeSearchUrl,
  type LiveDiscoveryCandidate,
} from '../../../packages/contracts/src/index.js';

export interface OpenDataTransportRequest {
  url: URL;
  headers: Readonly<Record<string, string>>;
  deadlineAt: string;
  signal: AbortSignal;
}

export interface OpenDataTransportResponse {
  status: number;
  headers: Readonly<Record<string, string | undefined>>;
  body: string;
}

export type OpenDataTransport = (request: Readonly<OpenDataTransportRequest>) => Promise<Readonly<OpenDataTransportResponse>>;

export interface OpenDataSearchRequest {
  query: string;
  language: string;
  region: string;
  maximumResults: number;
  deadlineAt: string;
  signal: AbortSignal;
  retrievedAt: string;
}

export interface OpenDataDiscoveryAdapter {
  readonly adapterId: string;
  readonly providerId: string;
  readonly sourceId: 'wikimedia' | 'crossref' | 'common_crawl';
  search(request: Readonly<OpenDataSearchRequest>): Promise<readonly Readonly<LiveDiscoveryCandidate>[]>;
}

function requireRequest(request: OpenDataSearchRequest): void {
  if (request.query.trim() === '' || request.query.length > 2_000 || !Number.isInteger(request.maximumResults) || request.maximumResults < 1 || request.maximumResults > 50) throw new Error('invalid_open_data_request');
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/u.test(request.language) || !/^[A-Z]{2}$/u.test(request.region)) throw new Error('invalid_open_data_locale');
  if (!Number.isFinite(Date.parse(request.deadlineAt)) || !Number.isFinite(Date.parse(request.retrievedAt))) throw new Error('invalid_open_data_time');
}

function requireSuccess(response: OpenDataTransportResponse, name: string): void {
  if (response.status !== 200 || response.body.length > 1_000_000) throw new Error(`${name}_unavailable`);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`invalid_${name}_response`);
  return value as Record<string, unknown>;
}

function clean(value: unknown, fallback: string, maximum = 2_000): string {
  const text = typeof value === 'string' ? value.replace(/<[^>]*>/gu, ' ').normalize('NFKC').replace(/\s+/gu, ' ').trim() : '';
  return (text === '' ? fallback : text).slice(0, maximum);
}

export function createWikimediaOpenDataAdapter(options: {
  transport: OpenDataTransport;
  userAgent: string;
  sourceUseStatus: 'qualified' | 'unresolved' | 'blocked';
}): OpenDataDiscoveryAdapter {
  if (options.sourceUseStatus !== 'qualified') throw new Error('wikimedia_source_use_unresolved');
  if (!/Clervo.+\(.+@.+\)/u.test(options.userAgent)) throw new Error('wikimedia_meaningful_user_agent_required');
  return Object.freeze({
    adapterId: WIKIMEDIA_ADAPTER_ID,
    providerId: WIKIMEDIA_PROVIDER_ID,
    sourceId: 'wikimedia' as const,
    async search(request: Readonly<OpenDataSearchRequest>) {
      requireRequest(request);
      const language = request.language.split('-', 1)[0]!;
      const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
      url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrsearch: request.query, gsrlimit: String(request.maximumResults), prop: 'info|extracts|revisions', inprop: 'url', exintro: '1', explaintext: '1', exchars: '1800', rvprop: 'timestamp', maxlag: '5', origin: '*' }).toString();
      const response = await options.transport({ url, headers: Object.freeze({ accept: 'application/json', 'user-agent': options.userAgent }), deadlineAt: request.deadlineAt, signal: request.signal });
      requireSuccess(response, 'wikimedia');
      const query = record(record(JSON.parse(response.body), 'wikimedia').query, 'wikimedia_query');
      const pages = Array.isArray(query.pages) ? query.pages : [];
      return Object.freeze(pages.slice(0, request.maximumResults).map((value) => {
        const page = record(value, 'wikimedia_page');
        const title = clean(page.title, 'Untitled Wikimedia page', 512);
        const currentUrl = canonicalizeSearchUrl(typeof page.fullurl === 'string' ? page.fullurl : `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /gu, '_'))}`);
        const revision = Array.isArray(page.revisions) ? record(page.revisions[0], 'wikimedia_revision') : undefined;
        const publishedAt = revision === undefined || typeof revision.timestamp !== 'string' || !Number.isFinite(Date.parse(revision.timestamp))
          ? undefined
          : new Date(Date.parse(revision.timestamp)).toISOString();
        return Object.freeze({
          routeId: LIVE_FEDERATION_ROUTE_ID, providerId: WIKIMEDIA_PROVIDER_ID, adapterId: WIKIMEDIA_ADAPTER_ID,
          currentUrl, title, snippet: clean(page.extract, title), retrievedAt: request.retrievedAt, ...(publishedAt === undefined ? {} : { publishedAt }), language: request.language, region: request.region,
          attribution: Object.freeze({ sourceId: 'wikimedia' as const, sourceName: 'Wikimedia contributors', sourceUrl: currentUrl, license: 'CC BY-SA 4.0; page-specific notices may also apply', notice: 'Excerpt attributed by page URL to Wikimedia contributors; modified to plain text and distributed under CC BY-SA 4.0.' }),
          discoveryKind: 'open_data' as const,
        });
      }));
    },
  });
}

function crossrefPublishedAt(value: unknown): string | undefined {
  if (!Array.isArray(value) || !Array.isArray(value[0])) return undefined;
  const [year, month = 1, day = 1] = value[0] as unknown[];
  if (![year, month, day].every(Number.isInteger)) return undefined;
  const date = new Date(Date.UTC(year as number, (month as number) - 1, day as number));
  return date.getUTCFullYear() === year && date.getUTCMonth() === (month as number) - 1 && date.getUTCDate() === day ? date.toISOString() : undefined;
}

export function createCrossrefOpenDataAdapter(options: {
  transport: OpenDataTransport;
  userAgent: string;
  mailto: string;
  sourceUseStatus: 'qualified' | 'unresolved' | 'blocked';
}): OpenDataDiscoveryAdapter {
  if (options.sourceUseStatus !== 'qualified') throw new Error('crossref_source_use_unresolved');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(options.mailto) || !/Clervo/u.test(options.userAgent)) throw new Error('crossref_polite_pool_identity_required');
  return Object.freeze({
    adapterId: CROSSREF_ADAPTER_ID,
    providerId: CROSSREF_PROVIDER_ID,
    sourceId: 'crossref' as const,
    async search(request: Readonly<OpenDataSearchRequest>) {
      requireRequest(request);
      const url = new URL('https://api.crossref.org/works');
      url.search = new URLSearchParams({ query: request.query, rows: String(request.maximumResults), mailto: options.mailto, select: 'DOI,title,URL,published,issued,publisher' }).toString();
      const response = await options.transport({ url, headers: Object.freeze({ accept: 'application/json', 'user-agent': options.userAgent }), deadlineAt: request.deadlineAt, signal: request.signal });
      requireSuccess(response, 'crossref');
      const root = record(JSON.parse(response.body), 'crossref');
      const items = Array.isArray(record(root.message, 'crossref_message').items) ? record(root.message, 'crossref_message').items as unknown[] : [];
      return Object.freeze(items.slice(0, request.maximumResults).map((value) => {
        const item = record(value, 'crossref_item');
        if ('abstract' in item) throw new Error('crossref_abstract_reuse_rejected');
        const title = clean(Array.isArray(item.title) ? item.title[0] : item.title, 'Untitled Crossref work', 512);
        const doi = typeof item.DOI === 'string' ? item.DOI.trim().toLowerCase() : undefined;
        const candidateUrl = typeof item.URL === 'string' ? item.URL : doi === undefined ? undefined : `https://doi.org/${doi}`;
        if (candidateUrl === undefined) throw new Error('crossref_current_url_missing');
        const currentUrl = canonicalizeSearchUrl(candidateUrl);
        const publishedAt = crossrefPublishedAt(record(item.published ?? item.issued ?? {}, 'crossref_date')['date-parts']);
        return Object.freeze({
          routeId: LIVE_FEDERATION_ROUTE_ID, providerId: CROSSREF_PROVIDER_ID, adapterId: CROSSREF_ADAPTER_ID,
          currentUrl, title, snippet: clean(item.publisher, title), retrievedAt: request.retrievedAt, ...(publishedAt === undefined ? {} : { publishedAt }), language: request.language, region: request.region,
          attribution: Object.freeze({ sourceId: 'crossref' as const, sourceName: 'Crossref', sourceUrl: currentUrl, license: 'Crossref bibliographic metadata; abstracts excluded because publisher/author copyright may apply', notice: 'Metadata supplied by Crossref; retain DOI/publisher landing URL.' }),
          discoveryKind: 'open_data' as const,
        });
      }));
    },
  });
}

const archivedBodyKeys = new Set(['body', 'content', 'payload', 'warcBody', 'watBody', 'wetBody']);

export function createCommonCrawlMetadataAdapter(options: {
  transport: OpenDataTransport;
  indexName: string;
  userAgent: string;
  sourceUseStatus: 'metadata_approved' | 'unresolved' | 'blocked';
}): OpenDataDiscoveryAdapter {
  if (options.sourceUseStatus !== 'metadata_approved') throw new Error('common_crawl_source_use_unresolved');
  if (!/^CC-MAIN-\d{4}-\d{2}$/u.test(options.indexName) || options.userAgent.trim() === '') throw new Error('invalid_common_crawl_metadata_configuration');
  return Object.freeze({
    adapterId: COMMON_CRAWL_ADAPTER_ID,
    providerId: COMMON_CRAWL_PROVIDER_ID,
    sourceId: 'common_crawl' as const,
    async search(request: Readonly<OpenDataSearchRequest>) {
      requireRequest(request);
      const url = new URL(`https://index.commoncrawl.org/${options.indexName}-index`);
      url.search = new URLSearchParams({ url: `*${request.query.replace(/[^\p{L}\p{N}.-]+/gu, '*')}*`, output: 'json', filter: 'status:200', collapse: 'urlkey', pageSize: String(request.maximumResults) }).toString();
      const response = await options.transport({ url, headers: Object.freeze({ accept: 'application/x-ndjson, application/json', 'user-agent': options.userAgent }), deadlineAt: request.deadlineAt, signal: request.signal });
      requireSuccess(response, 'common_crawl');
      const records = response.body.split(/\r?\n/u).filter((line) => line.trim() !== '').slice(0, request.maximumResults).map((line) => record(JSON.parse(line), 'common_crawl_cdxj'));
      return Object.freeze(records.map((entry) => {
        if ([...archivedBodyKeys].some((key) => key in entry)) throw new Error('archived_warc_body_rejected');
        if (typeof entry.url !== 'string' || typeof entry.timestamp !== 'string' || !/^\d{14}$/u.test(entry.timestamp)) throw new Error('invalid_common_crawl_cdxj_response');
        const currentUrl = canonicalizeSearchUrl(entry.url);
        const captureTimestamp = `${entry.timestamp.slice(0, 4)}-${entry.timestamp.slice(4, 6)}-${entry.timestamp.slice(6, 8)}T${entry.timestamp.slice(8, 10)}:${entry.timestamp.slice(10, 12)}:${entry.timestamp.slice(12, 14)}.000Z`;
        return Object.freeze({
          routeId: LIVE_FEDERATION_ROUTE_ID, providerId: COMMON_CRAWL_PROVIDER_ID, adapterId: COMMON_CRAWL_ADAPTER_ID,
          currentUrl, title: clean(entry.url, 'Common Crawl URL'), snippet: 'Historical capture metadata; current publisher page must be fetched directly.', retrievedAt: request.retrievedAt,
          language: request.language, region: request.region,
          attribution: Object.freeze({ sourceId: 'common_crawl' as const, sourceName: 'Common Crawl URL Index', sourceUrl: 'https://index.commoncrawl.org/', license: 'metadata discovery only; archived body use is not qualified', notice: 'Common Crawl capture metadata only. No archived body content is included.' }),
          discoveryKind: 'common_crawl_metadata' as const, captureTimestamp,
        });
      }));
    },
  });
}
