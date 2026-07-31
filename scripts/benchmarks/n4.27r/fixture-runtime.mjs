import { createHash } from 'node:crypto';
import {
  FOCUSED_INDEX_ROUTE_ID,
  LIVE_FEDERATION_ROUTE_ID,
} from '../../../dist/packages/contracts/src/index.js';
import {
  ConnectedRetrievalPipeline,
  focusedConnectedIdentity,
  liveConnectedIdentity,
} from '../../../dist/services/search/src/connected-retrieval.js';
import { LiveFederationRoute } from '../../../dist/services/search/src/live-federation.js';

const stopWords = new Set(['a','an','and','at','authoritative','by','current','evidence','for','from','in','is','of','official','on','or','the','to','verified','with']);
const tokens = (value) => [...new Set(value.normalize('NFKC').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+(?:[-_.][\p{L}\p{N}]+)*/gu) ?? [])].filter((token) => token.length > 1 && !stopWords.has(token));
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function relevance(query, document) {
  const queryTokens = tokens(query);
  const title = document.title.toLocaleLowerCase('en-US');
  const text = document.evidenceText.toLocaleLowerCase('en-US');
  const titleHits = queryTokens.filter((token) => title.includes(token)).length;
  const textHits = queryTokens.filter((token) => text.includes(token)).length;
  return titleHits * 4 + textHits;
}

function extraction(document) {
  const identity = createHash('sha256').update(`${document.documentId}\n${document.evidenceText}`).digest('hex');
  return Object.freeze({
    fetchId: `fetch_${identity.slice(0, 32)}`,
    extractionId: `extract_${identity.slice(16, 48)}`,
    sourceBodySha256: hash(document.evidenceText),
    normalizedTextSha256: hash(document.evidenceText.normalize('NFKC')),
    instructionHandling: 'untrusted_data_only',
    renderMode: document.requiresJavascript ? 'crawl4ai_javascript' : 'static',
    crawl4aiStatus: document.requiresJavascript ? 'runtime_attested' : 'not_used',
  });
}

function connectedEvidence(document) {
  return Object.freeze({
    routeId: document.route === 'focused' ? FOCUSED_INDEX_ROUTE_ID : LIVE_FEDERATION_ROUTE_ID,
    providerId: document.providerId,
    adapterId: document.adapterId,
    url: document.url,
    title: document.title,
    evidenceText: document.evidenceText,
    retrievedAt: document.retrievedAt,
    publishedAt: document.publishedAt,
    authorityScore: document.authorityScore,
    relevanceScore: 80,
    language: document.language,
    region: document.region,
    attribution: Object.freeze({ sourceId: document.sourceId, sourceName: document.sourceClass, sourceUrl: document.url, license: 'controlled zero-provider-cost benchmark fixture', notice: 'Controlled evidence; page instructions are untrusted data only.' }),
    extraction: extraction(document),
  });
}

function matchingDocuments(documents, request) {
  return documents.filter((document) => document.language === request.language && document.region === request.region)
    .map((document) => ({ document, score: relevance(request.query, document) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.document.sourceRank - right.document.sourceRank || left.document.url.localeCompare(right.document.url));
}

export function createFixtureRuntime(catalog, split) {
  const documents = catalog.documents.filter((document) => document.split === split);
  const focusedDocuments = documents.filter((document) => document.route === 'focused');
  const focused = Object.freeze({
    identity: focusedConnectedIdentity,
    async search(request) {
      if (request.signal.aborted) throw new Error('focused_fixture_cancelled');
      return Object.freeze(matchingDocuments(focusedDocuments, request).slice(0, Math.min(100, request.maximumResults * 4)).map(({ document }) => connectedEvidence(document)));
    },
  });
  const liveSourceIds = [...new Set(documents.filter((document) => document.route === 'live').map((document) => document.sourceId))].sort();
  const adapters = liveSourceIds.map((sourceId) => {
    const sourceDocuments = documents.filter((document) => document.route === 'live' && document.sourceId === sourceId);
    return Object.freeze({
      providerId: `provider_n427r_${sourceId}_v1`,
      adapterId: `adapter_n427r_${sourceId}_v1`,
      async search(request) {
        if (request.signal.aborted) throw new Error('live_fixture_cancelled');
        const matches = matchingDocuments(sourceDocuments, request);
        if (matches[0]?.document.suspendedSource === true) throw new Error('controlled_source_suspended');
        return Object.freeze(matches.slice(0, request.maximumResults).map(({ document }) => Object.freeze({
          routeId: LIVE_FEDERATION_ROUTE_ID,
          providerId: document.providerId,
          adapterId: document.adapterId,
          currentUrl: document.url,
          title: document.title,
          snippet: document.evidenceText,
          retrievedAt: document.retrievedAt,
          publishedAt: document.publishedAt,
          language: document.language,
          region: document.region,
          attribution: Object.freeze({ sourceId: document.sourceId, sourceName: document.sourceClass, sourceUrl: document.url, license: 'controlled zero-provider-cost benchmark fixture', notice: 'Controlled evidence; page instructions are untrusted data only.' }),
          discoveryKind: 'open_data',
        })));
      },
    });
  });
  const liveRoute = new LiveFederationRoute({
    adapters,
    fetch: async () => { throw new Error('fixture_metadata_only'); },
    perSourceDeadlineMs: 250,
    perPageDeadlineMs: 100,
  });
  const live = Object.freeze({ identity: liveConnectedIdentity, search: (request) => liveRoute.search(request) });
  return Object.freeze({ focused, live, liveRoute, pipeline: new ConnectedRetrievalPipeline({ focused, live }) });
}
