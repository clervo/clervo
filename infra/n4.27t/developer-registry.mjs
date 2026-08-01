const source = Object.freeze({
  sourceClass: 'developer_registry',
  adapterId: 'adapter_developer_registries_n427t_v1',
  providerId: 'provider_developer_registries_n427t_v1',
  healthIdentity: 'clervo.health.live_source.adapter_developer_registries_n427t_v1',
  circuitIdentity: 'clervo.circuit.live_source.adapter_developer_registries_n427t_v1',
  quota: 250,
  maximumConcurrency: 2,
  providerApiCostUsd: 0,
  localeMode: 'global_registry_locale_unsupported_disclosed',
  npmDocumentationUrl: 'https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md',
  githubDocumentationUrl: 'https://docs.github.com/en/rest',
});

export const developerRegistryQualification = source;

const clean = (value, maximum = 2_000) => String(value ?? '')
  .replace(/<[^>]*>/gu, ' ')
  .normalize('NFKC')
  .replace(/\s+/gu, ' ')
  .trim()
  .slice(0, maximum);

const packagePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/u;
const repositoryPattern = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/u;

function responseObject(response, name) {
  if (response?.status !== 200 || typeof response.body !== 'string' || response.body.length > 2_000_000) {
    throw new Error(`${name}_unavailable`);
  }
  const parsed = JSON.parse(response.body);
  if (parsed === null || typeof parsed !== 'object') throw new Error(`${name}_invalid_response`);
  return parsed;
}

function normalizedQuery(query) {
  const value = clean(query, 512);
  if (value.length < 3 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('developer_registry_query_invalid');
  return value;
}

export function planDeveloperRegistryLookup(query, maximumResults = 5) {
  const normalized = normalizedQuery(query);
  if (!Number.isInteger(maximumResults) || maximumResults < 1 || maximumResults > 10) throw new Error('developer_registry_result_limit_invalid');

  const npmExact = normalized.match(/\bnpm\s+package\s+(@?[a-z0-9][a-z0-9._/-]*)\s+(?:current\s+)?version\b/iu)?.[1]?.toLocaleLowerCase('en-US');
  if (npmExact !== undefined && packagePattern.test(npmExact)) {
    const url = new URL(`https://registry.npmjs.org/${encodeURIComponent(npmExact)}`);
    return Object.freeze({ mode: 'npm_exact', identity: npmExact, url, maximumResults: 1 });
  }

  const githubExact = normalized.match(/\bgithub\s+repository\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\s|$)/iu)?.[1];
  if (githubExact !== undefined && repositoryPattern.test(githubExact)) {
    const [owner, repository] = githubExact.split('/');
    const identity = `${owner}/${repository}`;
    return Object.freeze({ mode: 'github_exact', identity, url: new URL(`https://api.github.com/repos/${identity}`), maximumResults: 1 });
  }

  const github = /\b(?:github|repository)\b/iu.test(normalized);
  if (github) {
    const terms = normalized
      .replace(/\b(?:github|repository|current|release|sdk)\b/giu, ' ')
      .replace(/\bin\s*:\s*(?:name|description)(?:\s*,\s*(?:name|description))?/giu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    if (terms.length < 2) throw new Error('developer_registry_search_terms_missing');
    const url = new URL('https://api.github.com/search/repositories');
    url.search = new URLSearchParams({ q: `${terms} in:name,description archived:false`, per_page: String(maximumResults) }).toString();
    return Object.freeze({ mode: 'github_search', identity: null, url, maximumResults });
  }

  const terms = normalized
    .replace(/\b(?:npm|package|current|version)\b/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (terms.length < 2) throw new Error('developer_registry_search_terms_missing');
  const url = new URL('https://registry.npmjs.org/-/v1/search');
  url.search = new URLSearchParams({ text: terms, size: String(maximumResults), quality: '0.4', popularity: '0.2', maintenance: '0.4' }).toString();
  return Object.freeze({ mode: 'npm_search', identity: null, url, maximumResults });
}

function candidate(request, input) {
  return Object.freeze({
    routeId: 'clervo.live-federation.v1',
    providerId: source.providerId,
    adapterId: source.adapterId,
    currentUrl: input.url,
    title: clean(input.title, 512),
    snippet: clean(input.snippet),
    retrievedAt: request.retrievedAt,
    ...(input.publishedAt === undefined ? {} : { publishedAt: input.publishedAt }),
    language: request.language,
    region: request.region,
    attribution: Object.freeze({
      sourceId: source.sourceClass,
      sourceName: input.sourceName,
      sourceUrl: input.url,
      license: input.license,
      notice: `${input.notice} Locale mode: ${source.localeMode}.`,
    }),
    discoveryKind: 'open_data',
  });
}

function normalizeNpmExact(root, request) {
  const name = clean(root.name, 256).toLocaleLowerCase('en-US');
  if (!packagePattern.test(name)) throw new Error('npm_exact_identity_invalid');
  const version = clean(root['dist-tags']?.latest, 64);
  if (!version) throw new Error('npm_exact_latest_missing');
  const publishedAt = typeof root.time?.[version] === 'string' ? root.time[version] : undefined;
  const versionMetadata = root.versions?.[version] ?? {};
  return candidate(request, {
    url: `https://www.npmjs.com/package/${encodeURIComponent(name)}`,
    title: `${name} npm package current version ${version} developer registry`,
    snippet: `${name} ${version}. ${clean(versionMetadata.description ?? root.description)}.`,
    publishedAt,
    sourceName: 'npm public registry API',
    license: 'public package metadata; package license applies to code',
    notice: 'Exact package metadata only; no tarball, readme body or credentials.',
  });
}

function normalizeNpmSearch(root, request, maximumResults) {
  const objects = Array.isArray(root.objects) ? root.objects : [];
  return objects.slice(0, maximumResults).flatMap(({ package: item } = {}) => {
    const name = clean(item?.name, 256).toLocaleLowerCase('en-US');
    if (!packagePattern.test(name)) return [];
    return [candidate(request, {
      url: `https://www.npmjs.com/package/${encodeURIComponent(name)}`,
      title: `${name} npm package current version ${clean(item.version, 64)} developer registry`,
      snippet: `${name} ${clean(item.version, 64)}. ${clean(item.description)}.`,
      publishedAt: typeof item.date === 'string' ? item.date : undefined,
      sourceName: 'npm public registry API',
      license: 'public package metadata; package license applies to code',
      notice: 'Bounded public registry search metadata only; no tarball or credentials.',
    })];
  });
}

function normalizeGithubItem(item, request) {
  const identity = clean(item?.full_name, 256);
  const url = clean(item?.html_url, 512);
  if (!repositoryPattern.test(identity) || url !== `https://github.com/${identity}` || item.archived === true) return null;
  return candidate(request, {
    url,
    title: `${identity} GitHub repository current developer SDK`,
    snippet: `${identity}. ${clean(item.description)} Default branch ${clean(item.default_branch)}. Updated ${clean(item.updated_at)}.`,
    publishedAt: typeof item.updated_at === 'string' ? item.updated_at : undefined,
    sourceName: 'GitHub REST API',
    license: 'public repository metadata; repository license applies to code',
    notice: 'Read-only public repository metadata; no code download, authentication or mutation.',
  });
}

export function createDeveloperRegistryAdapter({ transport, userAgent, quota = source.quota } = {}) {
  if (typeof transport !== 'function' || !/Clervo.+\(.+@.+\)/u.test(userAgent ?? '') || !Number.isInteger(quota) || quota < 1 || quota > source.quota) {
    throw new Error('developer_registry_runtime_identity_required');
  }
  let used = 0;
  let active = 0;
  let circuitState = 'closed';
  let consecutiveFailures = 0;
  const observations = [];

  return Object.freeze({
    ...source,
    quota,
    quotaUsed: () => used,
    resetQuota: () => { used = 0; },
    telemetry: () => Object.freeze({ circuitState, quotaUsed: used, quota, active, observations: Object.freeze(observations.slice(-100)) }),
    suspend: () => { circuitState = 'open'; },
    restore: () => { circuitState = 'half_open'; },
    async search(request) {
      if (used >= quota) throw new Error('developer_registry_quota_exhausted');
      if (circuitState === 'open') throw new Error('developer_registry_circuit_open');
      if (active >= source.maximumConcurrency || (circuitState === 'half_open' && active > 0)) throw new Error('developer_registry_concurrency_exhausted');
      const plan = planDeveloperRegistryLookup(request.query, request.maximumResults);
      used += 1;
      active += 1;
      const started = performance.now();
      let outcome = 'succeeded';
      try {
        const root = responseObject(await transport({
          url: plan.url,
          headers: plan.mode.startsWith('github')
            ? { accept: 'application/vnd.github+json', 'user-agent': userAgent, 'x-github-api-version': '2022-11-28' }
            : { accept: 'application/json', 'user-agent': userAgent },
          deadlineAt: request.deadlineAt,
          signal: request.signal,
        }), plan.mode);
        const results = plan.mode === 'npm_exact'
          ? [normalizeNpmExact(root, request)]
          : plan.mode === 'npm_search'
            ? normalizeNpmSearch(root, request, plan.maximumResults)
            : plan.mode === 'github_exact'
              ? [normalizeGithubItem(root, request)].filter(Boolean)
              : (Array.isArray(root.items) ? root.items : []).slice(0, plan.maximumResults).map((item) => normalizeGithubItem(item, request)).filter(Boolean);
        consecutiveFailures = 0;
        circuitState = 'closed';
        return Object.freeze(results);
      } catch (error) {
        outcome = request.signal?.aborted ? 'cancelled' : 'failed';
        if (outcome === 'failed') {
          consecutiveFailures += 1;
          if (circuitState === 'half_open' || consecutiveFailures >= 3) circuitState = 'open';
        }
        throw error;
      } finally {
        active -= 1;
        observations.push(Object.freeze({ mode: plan.mode, outcome, durationMs: Number((performance.now() - started).toFixed(3)) }));
        if (observations.length > 100) observations.shift();
      }
    },
  });
}
