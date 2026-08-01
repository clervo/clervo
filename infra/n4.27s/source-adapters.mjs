import { LIVE_FEDERATION_ROUTE_ID } from '../../dist/packages/contracts/src/index.js';

export const sourceQualifications = Object.freeze([
  { sourceClass: 'public_catalog', adapterId: 'adapter_woocommerce_store_api_n427s_v1', providerId: 'provider_woocommerce_public_store_n427s_v1', healthIdentity: 'clervo.health.live_source.adapter_woocommerce_store_api_n427s_v1', circuitIdentity: 'clervo.circuit.live_source.adapter_woocommerce_store_api_n427s_v1', officialDocumentationUrl: 'https://developer.woocommerce.com/docs/category/store-api', officialTermsUrl: 'https://woocommerce.com/terms-conditions/', quota: 250, localeMode: 'region_currency_only_disclosed', providerApiCostUsd: 0 },
  { sourceClass: 'government_open_data', adapterId: 'adapter_socrata_catalog_n427s_v1', providerId: 'provider_socrata_public_catalog_n427s_v1', healthIdentity: 'clervo.health.live_source.adapter_socrata_catalog_n427s_v1', circuitIdentity: 'clervo.circuit.live_source.adapter_socrata_catalog_n427s_v1', officialDocumentationUrl: 'https://dev.socrata.com/docs/other/catalog/', officialTermsUrl: 'https://socrata.com/terms-of-service/', quota: 250, localeMode: 'regional_catalog_filter_disclosed', providerApiCostUsd: 0 },
  { sourceClass: 'corporate_disclosure', adapterId: 'adapter_sec_edgar_n427s_v1', providerId: 'provider_sec_edgar_public_n427s_v1', healthIdentity: 'clervo.health.live_source.adapter_sec_edgar_n427s_v1', circuitIdentity: 'clervo.circuit.live_source.adapter_sec_edgar_n427s_v1', officialDocumentationUrl: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces', officialTermsUrl: 'https://www.sec.gov/about/developer-resources', quota: 250, localeMode: 'us_filings_english_unsupported_disclosed', providerApiCostUsd: 0 },
  { sourceClass: 'research_registry', adapterId: 'adapter_crossref_research_n427s_v1', providerId: 'provider_crossref_public_n427s_v1', healthIdentity: 'clervo.health.live_source.adapter_crossref_research_n427s_v1', circuitIdentity: 'clervo.circuit.live_source.adapter_crossref_research_n427s_v1', officialDocumentationUrl: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/', officialTermsUrl: 'https://www.crossref.org/terms/', quota: 250, localeMode: 'metadata_language_unfiltered_disclosed', providerApiCostUsd: 0 },
  { sourceClass: 'developer_registry', adapterId: 'adapter_developer_registries_n427s_v1', providerId: 'provider_developer_registries_n427s_v1', healthIdentity: 'clervo.health.live_source.adapter_developer_registries_n427s_v1', circuitIdentity: 'clervo.circuit.live_source.adapter_developer_registries_n427s_v1', officialDocumentationUrl: 'https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md', officialTermsUrl: 'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service', quota: 250, localeMode: 'global_registry_locale_unsupported_disclosed', providerApiCostUsd: 0 },
  { sourceClass: 'wikimedia', adapterId: 'adapter_wikimedia_action_api_n427s_v1', providerId: 'provider_wikimedia_action_api_n427s_v1', healthIdentity: 'clervo.health.live_source.adapter_wikimedia_action_api_n427s_v1', circuitIdentity: 'clervo.circuit.live_source.adapter_wikimedia_action_api_n427s_v1', officialDocumentationUrl: 'https://www.mediawiki.org/wiki/API:Etiquette', officialTermsUrl: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use', quota: 250, localeMode: 'language_subdomain_honored_region_not_supported_disclosed', providerApiCostUsd: 0 },
]);

const clean = (value, maximum = 2_000) => String(value ?? '').replace(/<[^>]*>/gu, ' ').normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, maximum);
const words = (value) => value.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+(?:[-_.][\p{L}\p{N}]+)*/gu) ?? [];
const qualification = (sourceClass) => sourceQualifications.find((item) => item.sourceClass === sourceClass);

function candidate(sourceClass, request, input) {
  const source = qualification(sourceClass);
  return Object.freeze({
    routeId: LIVE_FEDERATION_ROUTE_ID,
    providerId: source.providerId,
    adapterId: source.adapterId,
    currentUrl: input.url,
    title: clean(input.title, 512),
    snippet: clean(input.snippet),
    retrievedAt: request.retrievedAt,
    ...(input.publishedAt === undefined ? {} : { publishedAt: input.publishedAt }),
    language: request.language,
    region: request.region,
    attribution: Object.freeze({ sourceId: sourceClass, sourceName: input.sourceName, sourceUrl: input.url, license: input.license, notice: `${input.notice} Locale mode: ${source.localeMode}.` }),
    discoveryKind: 'open_data',
  });
}

function bounded(sourceClass, search) {
  const source = qualification(sourceClass);
  let used = 0;
  let active = 0;
  let suspended = false;
  let circuitState = 'closed';
  let consecutiveFailures = 0;
  const observations = [];
  return Object.freeze({
    adapterId: source.adapterId,
    providerId: source.providerId,
    sourceClass,
    localeMode: source.localeMode,
    quotaLimit: source.quota,
    quotaUsed: () => used,
    suspend: () => { suspended = true; circuitState = 'open'; },
    restore: () => { suspended = false; circuitState = 'half_open'; },
    resetQuota: () => { used = 0; },
    telemetry: () => Object.freeze({ sourceClass, adapterId: source.adapterId, healthIdentity: source.healthIdentity, circuitIdentity: source.circuitIdentity, circuitState, quotaUsed: used, quotaLimit: source.quota, suspended, active, maximumConcurrency: 2, observations: Object.freeze(observations.slice(-100)) }),
    async search(request) {
      if (used >= source.quota) throw new Error(`${sourceClass}_quota_exhausted`);
      if (suspended || circuitState === 'open') throw new Error(`${sourceClass}_circuit_open`);
      if (active >= 2 || (circuitState === 'half_open' && active > 0)) throw new Error(`${sourceClass}_concurrency_exhausted`);
      used += 1;
      active += 1;
      const started = performance.now();
      let outcome = 'succeeded';
      try {
        const results = Object.freeze(await search(request));
        consecutiveFailures = 0;
        circuitState = 'closed';
        return results;
      } catch (error) {
        outcome = request.signal.aborted ? 'cancelled' : 'failed';
        if (outcome === 'failed') {
          consecutiveFailures += 1;
          if (circuitState === 'half_open' || consecutiveFailures >= 3) circuitState = 'open';
        }
        throw error;
      } finally {
        active -= 1;
        observations.push(Object.freeze({ observedAt: new Date().toISOString(), durationMs: Number((performance.now() - started).toFixed(3)), outcome }));
        if (observations.length > 100) observations.shift();
      }
    },
  });
}

function responseObject(response, name) {
  if (response.status !== 200 || typeof response.body !== 'string' || response.body.length > 2_000_000) throw new Error(`${name}_unavailable`);
  const parsed = JSON.parse(response.body);
  if (parsed === null || typeof parsed !== 'object') throw new Error(`${name}_invalid_response`);
  return parsed;
}

export function createN427sSourceAdapters({ transport, userAgent, mailto }) {
  if (!/Clervo.+\(.+@.+\)/u.test(userAgent) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(mailto)) throw new Error('n427s_source_identity_required');

  const commerce = bounded('public_catalog', async (request) => {
    const url = new URL('https://woocommerce.com/wp-json/wc/store/v1/products');
    url.search = new URLSearchParams({ search: request.query.replace(/\b(?:current|marketplace|offer|usd|woocommerce)\b/giu, ' ').replace(/\s+/gu, ' ').trim(), per_page: String(Math.min(10, request.maximumResults)) }).toString();
    const products = responseObject(await transport({ url, headers: { accept: 'application/json', 'user-agent': userAgent }, deadlineAt: request.deadlineAt, signal: request.signal }), 'woocommerce');
    if (!Array.isArray(products)) throw new Error('woocommerce_invalid_response');
    return products.slice(0, request.maximumResults).map((product) => {
      const name = clean(product.name, 256);
      const prices = product.prices ?? {};
      const currency = clean(prices.currency_code, 8);
      const price = clean(prices.price, 32);
      return candidate('public_catalog', request, { url: product.permalink, title: `WooCommerce ${name} ${currency} offer`, snippet: `${name} current public catalog offer ${currency} minor-unit price ${price}. ${clean(product.summary ?? product.short_description)}`, sourceName: 'WooCommerce public Store API', license: 'public merchant catalog metadata; publisher terms apply', notice: 'Unauthenticated read-only product metadata; no cart, checkout, account, or payment action.' });
    });
  });

  const government = bounded('government_open_data', async (request) => {
    const url = new URL('https://api.us.socrata.com/api/catalog/v1');
    url.search = new URLSearchParams({ q: request.query.replace(/\bopen data\b/giu, '').trim(), limit: String(Math.min(12, request.maximumResults * 2)), only: 'datasets' }).toString();
    const root = responseObject(await transport({ url, headers: { accept: 'application/json', 'user-agent': userAgent }, deadlineAt: request.deadlineAt, signal: request.signal }), 'socrata');
    const results = Array.isArray(root.results) ? root.results : [];
    return results.slice(0, request.maximumResults).map((entry) => {
      const resource = entry.resource ?? {};
      const metadata = entry.metadata ?? {};
      const domain = clean(metadata.domain ?? entry.permalink?.split('/')[2], 128);
      const link = typeof entry.permalink === 'string' ? entry.permalink : `https://${domain}/resource/${clean(resource.id, 32)}`;
      return candidate('government_open_data', request, { url: link, title: `${clean(resource.name, 256)} ${domain} government open data`, snippet: `${clean(resource.description)} Updated ${clean(resource.updatedAt ?? resource.updated_at)}.`, sourceName: 'Socrata Open Data Catalog', license: clean(metadata.license ?? 'dataset-specific public terms', 256), notice: 'Catalog metadata only; dataset publisher and license retained.' });
    });
  });

  let secTickers;
  const corporate = bounded('corporate_disclosure', async (request) => {
    if (secTickers === undefined) {
      const tickersUrl = new URL('https://www.sec.gov/files/company_tickers.json');
      const root = responseObject(await transport({ url: tickersUrl, headers: { accept: 'application/json', 'user-agent': userAgent }, deadlineAt: request.deadlineAt, signal: request.signal }), 'sec_tickers');
      secTickers = Object.values(root);
    }
    const queryWords = new Set(words(request.query).filter((word) => !['recent','annual','report','10-k','20-f'].includes(word)));
    const scored = secTickers.map((entry) => ({ entry, score: words(`${entry.title} ${entry.ticker}`).filter((word) => queryWords.has(word)).length })).sort((left, right) => right.score - left.score);
    if ((scored[0]?.score ?? 0) === 0) return [];
    const matches = scored.filter((item) => item.score === scored[0].score).slice(0, Math.min(2, request.maximumResults));
    const candidates = [];
    for (const { entry } of matches) {
      const cik = String(entry.cik_str).padStart(10, '0');
      const submissionsUrl = new URL(`https://data.sec.gov/submissions/CIK${cik}.json`);
      const root = responseObject(await transport({ url: submissionsUrl, headers: { accept: 'application/json', 'user-agent': userAgent }, deadlineAt: request.deadlineAt, signal: request.signal }), 'sec_submissions');
      const recent = root.filings?.recent ?? {};
      const requestedForm = request.query.toLocaleLowerCase('en-US').includes('20-f') ? '20-F' : '10-K';
      const forms = Array.isArray(recent.form) ? recent.form : [];
      const index = forms.findIndex((form) => form === requestedForm);
      if (index < 0) continue;
      const accession = String(recent.accessionNumber[index]).replace(/-/gu, '');
      const primary = String(recent.primaryDocument[index]);
      const archiveCik = String(Number(entry.cik_str));
      const filingUrl = `https://www.sec.gov/Archives/edgar/data/${archiveCik}/${accession}/${primary}`;
      candidates.push(candidate('corporate_disclosure', request, { url: filingUrl, title: `${root.name} recent annual report ${requestedForm} corporate disclosure`, snippet: `${root.name} ${entry.ticker} filed ${requestedForm} on ${recent.filingDate[index]} accession ${recent.accessionNumber[index]}.`, publishedAt: `${recent.filingDate[index]}T00:00:00.000Z`, sourceName: 'SEC EDGAR submissions API', license: 'United States government public filing metadata', notice: 'Read-only official filing metadata under SEC fair-access limits.' }));
    }
    return candidates;
  });

  const research = bounded('research_registry', async (request) => {
    const url = new URL('https://api.crossref.org/works');
    url.search = new URLSearchParams({ query: request.query.replace(/\bDOI\b/giu, '').trim(), rows: String(Math.min(10, request.maximumResults)), mailto, select: 'DOI,title,URL,published,issued,publisher' }).toString();
    const root = responseObject(await transport({ url, headers: { accept: 'application/json', 'user-agent': userAgent }, deadlineAt: request.deadlineAt, signal: request.signal }), 'crossref');
    const items = Array.isArray(root.message?.items) ? root.message.items : [];
    return items.slice(0, request.maximumResults).map((item) => {
      if ('abstract' in item) delete item.abstract;
      const title = clean(Array.isArray(item.title) ? item.title[0] : item.title, 512);
      const doi = clean(item.DOI, 256).toLocaleLowerCase('en-US');
      const parts = item.published?.['date-parts'] ?? item.issued?.['date-parts'];
      const date = Array.isArray(parts?.[0]) ? parts[0] : undefined;
      const publishedAt = date === undefined ? undefined : new Date(Date.UTC(date[0], (date[1] ?? 1) - 1, date[2] ?? 1)).toISOString();
      return candidate('research_registry', request, { url: doi ? `https://doi.org/${doi}` : item.URL, title: `${title} DOI research registry`, snippet: `${title}. DOI ${doi}. Publisher ${clean(item.publisher, 256)}.`, publishedAt, sourceName: 'Crossref REST API', license: 'Crossref bibliographic metadata; abstracts excluded', notice: 'DOI and publisher metadata only; no publisher body or abstract retained.' });
    });
  });

  const developer = bounded('developer_registry', async (request) => {
    const github = /\bgithub\b/iu.test(request.query);
    if (github) {
      const url = new URL('https://api.github.com/search/repositories');
      url.search = new URLSearchParams({ q: request.query.replace(/\b(?:github|repository|current|release)\b/giu, ' ').replace(/\s+/gu, ' ').trim(), per_page: String(Math.min(10, request.maximumResults)) }).toString();
      const root = responseObject(await transport({ url, headers: { accept: 'application/vnd.github+json', 'user-agent': userAgent, 'x-github-api-version': '2022-11-28' }, deadlineAt: request.deadlineAt, signal: request.signal }), 'github');
      const items = Array.isArray(root.items) ? root.items : [];
      return items.slice(0, request.maximumResults).map((item) => candidate('developer_registry', request, { url: item.html_url, title: `${item.full_name} GitHub repository current developer SDK`, snippet: `${item.full_name}. ${clean(item.description)} Default branch ${clean(item.default_branch)}. Updated ${clean(item.updated_at)}.`, publishedAt: item.updated_at, sourceName: 'GitHub REST API', license: 'public repository metadata; repository license applies to code', notice: 'Read-only public repository metadata; no authentication or repository mutation.' }));
    }
    const url = new URL('https://registry.npmjs.org/-/v1/search');
    url.search = new URLSearchParams({ text: request.query.replace(/\b(?:npm|package|current|version)\b/giu, ' ').replace(/\s+/gu, ' ').trim(), size: String(Math.min(10, request.maximumResults)) }).toString();
    const root = responseObject(await transport({ url, headers: { accept: 'application/json', 'user-agent': userAgent }, deadlineAt: request.deadlineAt, signal: request.signal }), 'npm');
    const objects = Array.isArray(root.objects) ? root.objects : [];
    return objects.slice(0, request.maximumResults).map(({ package: item }) => candidate('developer_registry', request, { url: `https://www.npmjs.com/package/${encodeURIComponent(item.name)}`, title: `${item.name} npm package current version ${item.version} developer registry`, snippet: `${item.name} ${item.version}. ${clean(item.description)}. Published ${clean(item.date)}.`, publishedAt: item.date, sourceName: 'npm public registry API', license: 'public package metadata; package license applies to code', notice: 'Abbreviated public registry metadata only; no tarball or credentials.' }));
  });

  const wikimedia = bounded('wikimedia', async (request) => {
    const language = request.language.split('-', 1)[0];
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
    url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrsearch: request.query, gsrlimit: String(Math.min(5, request.maximumResults)), prop: 'info', inprop: 'url', maxlag: '5', origin: '*' }).toString();
    const root = responseObject(await transport({ url, headers: { accept: 'application/json', 'user-agent': userAgent }, deadlineAt: request.deadlineAt, signal: request.signal }), 'wikimedia');
    const pages = Array.isArray(root.query?.pages) ? root.query.pages : [];
    return pages.slice(0, request.maximumResults).map((page) => candidate('wikimedia', request, { url: page.fullurl, title: `${clean(page.title, 256)} Wikimedia`, snippet: `${clean(page.title)} public encyclopedia result.`, sourceName: 'Wikimedia Action API', license: 'page-specific; generally CC BY-SA 4.0/GFDL for Wikipedia text', notice: 'Page URL retained; page-level attribution and license apply.' }));
  });

  return Object.freeze([commerce, government, corporate, research, developer, wikimedia]);
}
