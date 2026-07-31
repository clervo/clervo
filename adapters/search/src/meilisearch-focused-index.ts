import {
  FOCUSED_INDEX_ADAPTER_ID,
  FOCUSED_INDEX_FAILURE_DOMAIN,
  FOCUSED_INDEX_HEALTH_IDENTITY,
  FOCUSED_INDEX_PROVIDER_ID,
  MEILISEARCH_VERSION,
  assertFocusedIndexDocument,
  type FocusedIndexDocument,
  type FocusedIndexRuntimeIdentity,
} from '../../../packages/contracts/src/index.js';

export interface MeilisearchTransportRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  headers: Readonly<Record<string, string>>;
  body?: unknown;
}

export interface MeilisearchTransportResponse {
  status: number;
  body: unknown;
}

export interface MeilisearchFocusedIndexConfig {
  endpoint: string;
  masterKey: string;
  indexUid: string;
  analyticsDisabled: true;
  expectedVersion: typeof MEILISEARCH_VERSION;
  communityFeaturesOnly: true;
  providerId: typeof FOCUSED_INDEX_PROVIDER_ID;
  adapterId: typeof FOCUSED_INDEX_ADAPTER_ID;
  healthIdentity: typeof FOCUSED_INDEX_HEALTH_IDENTITY;
  failureDomain: typeof FOCUSED_INDEX_FAILURE_DOMAIN;
}

export interface FocusedIndexAdapterHealth {
  identity: FocusedIndexRuntimeIdentity;
  status: 'healthy' | 'unavailable';
  checkedAt: string;
  code?: string;
}

export interface FocusedIndexSearchCandidate {
  document: FocusedIndexDocument;
  meilisearchRankingScore?: number;
}

export interface PersistedFocusedIndexAdapter {
  readonly identity: FocusedIndexRuntimeIdentity;
  health(now: string): Promise<Readonly<FocusedIndexAdapterHealth>>;
  upsert(document: FocusedIndexDocument): Promise<void>;
  searchCandidates(query: string, limit: number): Promise<readonly Readonly<FocusedIndexSearchCandidate>[]>;
  listDocuments(): Promise<readonly Readonly<FocusedIndexDocument>[]>;
  deleteDocument(documentId: string): Promise<void>;
  deleteDomain(domain: string): Promise<number>;
  rebuild(documents: readonly FocusedIndexDocument[]): Promise<void>;
}

type Transport = (request: MeilisearchTransportRequest) => Promise<MeilisearchTransportResponse>;

function validateConfig(config: MeilisearchFocusedIndexConfig): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(config.endpoint);
  } catch {
    throw new Error('invalid_meilisearch_endpoint');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username !== '' || endpoint.password !== '' || endpoint.pathname !== '/') throw new Error('invalid_meilisearch_endpoint');
  if (config.masterKey.length < 16 || /\s/u.test(config.masterKey)) throw new Error('meilisearch_master_key_required');
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/u.test(config.indexUid)) throw new Error('invalid_meilisearch_index_uid');
  if (!config.analyticsDisabled) throw new Error('meilisearch_analytics_must_be_disabled');
  if (!config.communityFeaturesOnly || config.expectedVersion !== MEILISEARCH_VERSION) throw new Error('meilisearch_configuration_substitution');
  if (config.providerId !== FOCUSED_INDEX_PROVIDER_ID || config.adapterId !== FOCUSED_INDEX_ADAPTER_ID
    || config.healthIdentity !== FOCUSED_INDEX_HEALTH_IDENTITY || config.failureDomain !== FOCUSED_INDEX_FAILURE_DOMAIN) throw new Error('focused_index_provider_identity_substitution');
  return endpoint;
}

function encodeFilter(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

function documentsFromBody(body: unknown): FocusedIndexDocument[] {
  if (typeof body !== 'object' || body === null) throw new Error('meilisearch_invalid_response');
  const hits = 'hits' in body ? (body as { hits?: unknown }).hits : 'results' in body ? (body as { results?: unknown }).results : undefined;
  if (!Array.isArray(hits)) throw new Error('meilisearch_invalid_response');
  return hits.map((value) => {
    assertFocusedIndexDocument(value as FocusedIndexDocument);
    return value as FocusedIndexDocument;
  });
}

export function createMeilisearchFocusedIndexAdapter(
  config: MeilisearchFocusedIndexConfig,
  transport: Transport,
  identity: FocusedIndexRuntimeIdentity,
): PersistedFocusedIndexAdapter {
  validateConfig(config);
  if (identity.providerId !== config.providerId || identity.adapterId !== config.adapterId
    || identity.healthIdentity !== config.healthIdentity || identity.failureDomain !== config.failureDomain
    || identity.meilisearchVersion !== config.expectedVersion) throw new Error('focused_index_provider_identity_substitution');
  const headers = Object.freeze({ authorization: `Bearer ${config.masterKey}`, 'content-type': 'application/json' });
  const request = async (method: MeilisearchTransportRequest['method'], path: string, body?: unknown): Promise<unknown> => {
    let response: MeilisearchTransportResponse;
    try {
      response = await transport({ method, path, headers, ...(body === undefined ? {} : { body }) });
    } catch {
      throw new Error('focused_index_unavailable');
    }
    if (response.status < 200 || response.status >= 300) throw new Error('focused_index_unavailable');
    return response.body;
  };
  const deleteByFilter = async (filter: string): Promise<void> => {
    await request('POST', `/indexes/${config.indexUid}/documents/delete`, { filter });
  };
  const adapter: PersistedFocusedIndexAdapter = {
    identity,
    async health(now) {
      try {
        const health = await request('GET', '/health');
        const version = await request('GET', '/version');
        if (typeof health !== 'object' || health === null || (health as { status?: unknown }).status !== 'available'
          || typeof version !== 'object' || version === null || (version as { pkgVersion?: unknown }).pkgVersion !== MEILISEARCH_VERSION) throw new Error('meilisearch_identity_mismatch');
        return Object.freeze({ identity, status: 'healthy' as const, checkedAt: now });
      } catch (error) {
        return Object.freeze({ identity, status: 'unavailable' as const, checkedAt: now, code: error instanceof Error ? error.message : 'focused_index_unavailable' });
      }
    },
    async upsert(document) {
      assertFocusedIndexDocument(document);
      await request('POST', `/indexes/${config.indexUid}/documents?primaryKey=documentId`, [document]);
    },
    async searchCandidates(query, limit) {
      if (query.trim() === '' || !Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error('invalid_focused_index_search');
      const body = await request('POST', `/indexes/${config.indexUid}/search`, { q: query, limit, showRankingScore: true });
      if (typeof body !== 'object' || body === null || !Array.isArray((body as { hits?: unknown }).hits)) throw new Error('meilisearch_invalid_response');
      return Object.freeze((body as { hits: Array<FocusedIndexDocument & { _rankingScore?: number }> }).hits.map((hit) => {
        const { _rankingScore, ...document } = hit;
        assertFocusedIndexDocument(document);
        return Object.freeze({ document, ...(typeof _rankingScore === 'number' ? { meilisearchRankingScore: _rankingScore } : {}) });
      }));
    },
    async listDocuments() {
      const body = await request('GET', `/indexes/${config.indexUid}/documents?limit=1000`);
      return Object.freeze(documentsFromBody(body));
    },
    async deleteDocument(documentId) {
      if (!/^fid_[a-f0-9]{64}$/u.test(documentId)) throw new Error('invalid_focused_index_document_id');
      await request('DELETE', `/indexes/${config.indexUid}/documents/${documentId}`);
    },
    async deleteDomain(domain) {
      const documents = (await this.listDocuments()).filter((document) => document.provenance.domain === domain);
      if (documents.length > 0) await deleteByFilter(`provenance.domain = "${encodeFilter(domain)}"`);
      return documents.length;
    },
    async rebuild(documents) {
      const ordered = [...documents].sort((left, right) => left.documentId.localeCompare(right.documentId));
      for (const document of ordered) assertFocusedIndexDocument(document);
      await request('DELETE', `/indexes/${config.indexUid}`);
      await request('POST', '/indexes', { uid: config.indexUid, primaryKey: 'documentId' });
      await request('PATCH', `/indexes/${config.indexUid}/settings`, {
        searchableAttributes: ['title', 'content'],
        filterableAttributes: ['provenance.domain', 'provenance.freshnessState'],
        displayedAttributes: ['*'],
        rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
      });
      if (ordered.length > 0) await request('POST', `/indexes/${config.indexUid}/documents?primaryKey=documentId`, ordered);
    },
  };
  return Object.freeze(adapter);
}
