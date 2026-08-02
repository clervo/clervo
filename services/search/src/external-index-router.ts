export interface ExternalIndexResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ExternalIndexRequest {
  query: string;
  maximumResults: number;
  language: string;
  region: string;
  signal?: AbortSignal;
}

export interface ExternalIndexResponse {
  source: 'independent_web_index';
  degraded: boolean;
  results: readonly Readonly<ExternalIndexResult>[];
}

export interface ExternalIndexTransportResponse {
  status: number;
  body: unknown;
}

export type ExternalIndexTransport = (request: Readonly<{
  url: URL;
  method: 'GET' | 'POST';
  headers: Readonly<Record<string, string>>;
  body?: string;
  signal: AbortSignal;
}>) => Promise<Readonly<ExternalIndexTransportResponse>>;

interface ExternalIndexAdapter {
  readonly identity: string;
  search(request: Readonly<ExternalIndexRequest>): Promise<readonly Readonly<ExternalIndexResult>[]>;
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function clean(value: unknown, maximum: number): string {
  return (typeof value === 'string' ? value : '').normalize('NFKC').replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, maximum);
}

function normalizedResult(value: unknown): ExternalIndexResult | undefined {
  const item = record(value, 'external_index_invalid_result');
  const urlValue = typeof item.url === 'string' ? item.url : typeof item.link === 'string' ? item.link : '';
  let url: URL;
  try { url = new URL(urlValue); } catch { return undefined; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  url.username = '';
  url.password = '';
  url.hash = '';
  const title = clean(item.title, 512);
  const snippet = clean(item.description ?? item.snippet, 2_000);
  if (title === '' || snippet === '') return undefined;
  return Object.freeze({ title, url: url.toString(), snippet });
}

function requireRequest(request: ExternalIndexRequest): void {
  if (request.query.trim() === '' || request.query.length > 2_000 || !Number.isInteger(request.maximumResults) || request.maximumResults < 1 || request.maximumResults > 20) throw new Error('invalid_external_index_request');
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/u.test(request.language) || !/^[A-Z]{2}$/u.test(request.region)) throw new Error('invalid_external_index_locale');
}

export function createBraveExternalIndexAdapter(options: Readonly<{ credential: string; transport: ExternalIndexTransport }>): ExternalIndexAdapter {
  if (options.credential.trim() === '') throw new Error('external_index_primary_credential_missing');
  return Object.freeze({
    identity: 'external_index_primary_v1',
    async search(request: Readonly<ExternalIndexRequest>) {
      requireRequest(request);
      const controller = new AbortController();
      const cancel = (): void => controller.abort();
      request.signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => controller.abort(), 4_000);
      try {
        const url = new URL('https://api.search.brave.com/res/v1/web/search');
        url.search = new URLSearchParams({ q: request.query, count: String(request.maximumResults), country: request.region.toLowerCase(), search_lang: request.language.split('-', 1)[0]!, safesearch: 'moderate' }).toString();
        const response = await options.transport({ url, method: 'GET', headers: Object.freeze({ accept: 'application/json', 'X-Subscription-Token': options.credential }), signal: controller.signal });
        if (response.status !== 200) throw new Error(`external_index_primary_http_${response.status}`);
        const web = record(record(response.body, 'external_index_primary_invalid_response').web, 'external_index_primary_invalid_web');
        const results = Array.isArray(web.results) ? web.results : [];
        return Object.freeze(results.flatMap((item) => normalizedResult(item) ?? []).slice(0, request.maximumResults));
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', cancel);
      }
    },
  });
}

export function createSerperExternalIndexAdapter(options: Readonly<{ credential: string; transport: ExternalIndexTransport }>): ExternalIndexAdapter {
  if (options.credential.trim() === '') throw new Error('external_index_fallback_credential_missing');
  return Object.freeze({
    identity: 'external_index_fallback_v1',
    async search(request: Readonly<ExternalIndexRequest>) {
      requireRequest(request);
      const controller = new AbortController();
      const cancel = (): void => controller.abort();
      request.signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => controller.abort(), 4_000);
      try {
        const response = await options.transport({
          url: new URL('https://google.serper.dev/search'),
          method: 'POST',
          headers: Object.freeze({ accept: 'application/json', 'content-type': 'application/json', 'X-API-KEY': options.credential }),
          body: JSON.stringify({ q: request.query, gl: request.region.toLowerCase(), hl: request.language.split('-', 1)[0], num: request.maximumResults }),
          signal: controller.signal,
        });
        if (response.status !== 200) throw new Error(`external_index_fallback_http_${response.status}`);
        const root = record(response.body, 'external_index_fallback_invalid_response');
        const results = Array.isArray(root.organic) ? root.organic : [];
        return Object.freeze(results.flatMap((item) => normalizedResult(item) ?? []).slice(0, request.maximumResults));
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', cancel);
      }
    },
  });
}

class HardCallCeiling {
  private used = 0;
  constructor(readonly ceiling: number) {
    if (!Number.isInteger(ceiling) || ceiling < 0) throw new Error('invalid_external_index_call_ceiling');
  }
  acquire(): void {
    if (this.used >= this.ceiling) throw new Error('external_index_call_ceiling_reached');
    this.used += 1;
  }
  get remaining(): number { return this.ceiling - this.used; }
}

export class ExternalIndexRouter {
  private readonly primaryCeiling: HardCallCeiling;
  private readonly fallbackCeiling: HardCallCeiling;

  constructor(readonly dependencies: Readonly<{
    primary: ExternalIndexAdapter;
    fallback: ExternalIndexAdapter;
    primaryCallCeiling: number;
    fallbackCallCeiling: number;
  }>) {
    if (dependencies.primary.identity === dependencies.fallback.identity) throw new Error('external_index_routes_not_independent');
    this.primaryCeiling = new HardCallCeiling(dependencies.primaryCallCeiling);
    this.fallbackCeiling = new HardCallCeiling(dependencies.fallbackCallCeiling);
  }

  get remaining(): Readonly<{ primary: number; fallback: number }> {
    return Object.freeze({ primary: this.primaryCeiling.remaining, fallback: this.fallbackCeiling.remaining });
  }

  async search(request: Readonly<ExternalIndexRequest>): Promise<Readonly<ExternalIndexResponse>> {
    requireRequest(request);
    try {
      this.primaryCeiling.acquire();
      const results = await this.dependencies.primary.search(request);
      return Object.freeze({ source: 'independent_web_index', degraded: false, results });
    } catch {
      this.fallbackCeiling.acquire();
      const results = await this.dependencies.fallback.search(request);
      return Object.freeze({ source: 'independent_web_index', degraded: true, results });
    }
  }
}
