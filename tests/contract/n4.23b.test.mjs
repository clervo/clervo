import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  FOCUSED_INDEX_ROUTE_ID,
  focusedIndexRuntimeIdentity,
  createFocusedIndexDocument,
  projectFocusedIndexFreshness,
  freshnessAt,
} from '../../dist/packages/contracts/src/index.js';
import {
  FocusedIndexFrontier,
  FocusedIndexRoute,
  discoverFocusedLinks,
  rankFocusedIndexDocuments,
} from '../../dist/services/search/src/focused-index.js';
import { createMeilisearchFocusedIndexAdapter } from '../../dist/adapters/search/src/meilisearch-focused-index.js';

const now = '2026-07-31T12:00:00.000Z';
const publicAddress = '93.184.216.34';

function config(overrides = {}) {
  return {
    approvedDomains: ['example.test'],
    explicitSeeds: ['https://example.test/sitemap.xml'],
    policies: [{ domain: 'example.test', contentUse: 'approved', language: 'en' }],
    denylist: [],
    maximumPages: 8,
    maximumPagesPerDomain: 8,
    maximumConcurrencyPerDomain: 2,
    minimumDelayMsPerDomain: 0,
    maximumFrontierItems: 100,
    staleAfterMs: 60_000,
    expireAfterMs: 600_000,
    recrawlAfterMs: 120_000,
    nearDuplicateThresholdBasisPoints: 8_000,
    ...overrides,
  };
}

function body(value) { return Buffer.from(value); }

function result(url, contentType, value, failureCode) {
  const bytes = body(value);
  if (failureCode) return { receipt: { outcome: 'rejected', requestedUrl: url, startedAt: now, completedAt: now, hops: [], robots: [{ status: 'disallowed', cacheHit: false }], failureCode } };
  return {
    body: bytes,
    receipt: {
      contractVersion: '2026-07-29.1', fetchId: `fetch_${'a'.repeat(24)}`, outcome: 'succeeded', requestedUrl: url, finalUrl: url,
      startedAt: now, completedAt: now, hops: [{ kind: 'content', url, resolvedAddresses: [publicAddress], connectedAddress: publicAddress, status: 200 }],
      robots: [{ status: 'allowed', cacheHit: true }], contentType, contentLengthBytes: bytes.byteLength, bodySha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    },
  };
}

function worker(overrides = {}) {
  return {
    workerId: 'worker_scrapling_0_4_12', version: '0.4.12',
    async extract(receipt) { return { workerId: 'worker_scrapling_0_4_12', version: '0.4.12', title: 'Example article', text: 'Fresh deterministic evidence for focused indexing.', language: 'en', discoveredLinks: [], configuration: { networkAccess: false, adaptive: false, impersonation: false, stealth: false, proxy: false, captcha: false }, ...overrides, canonicalUrl: receipt.finalUrl }; },
  };
}

function memoryIndex(seed = []) {
  const documents = new Map(seed.map((document) => [document.documentId, document]));
  return {
    identity: focusedIndexRuntimeIdentity,
    async health() { return { identity: focusedIndexRuntimeIdentity, status: 'healthy', checkedAt: now }; },
    async upsert(document) { documents.set(document.documentId, document); },
    async searchCandidates(query) { return [...documents.values()].map((document) => ({ document })).filter(({ document }) => document.content.includes(query) || document.title.includes(query)); },
    async listDocuments() { return [...documents.values()]; },
    async deleteDocument(id) { documents.delete(id); },
    async deleteDomain(domain) { let count = 0; for (const [id, document] of documents) if (document.provenance.domain === domain) { documents.delete(id); count += 1; } return count; },
    async rebuild(next) { documents.clear(); for (const document of next) documents.set(document.documentId, document); },
  };
}

test('explicit seeds, sitemap and RSS/Atom discovery remain bounded and deterministic', () => {
  const frontier = new FocusedIndexFrontier(config(), now);
  assert.equal(frontier.state.items[0].source, 'explicit_seed');
  assert.deepEqual(discoverFocusedLinks(body('<urlset><url><loc>https://example.test/a?utm_source=x</loc></url></urlset>'), 'application/xml', 'https://example.test/sitemap.xml'), ['https://example.test/a']);
  assert.deepEqual(discoverFocusedLinks(body('<rss><channel><item><link>https://example.test/news</link></item></channel></rss>'), 'application/rss+xml', 'https://example.test/feed.xml'), ['https://example.test/news']);
  assert.deepEqual(discoverFocusedLinks(body('<feed><entry><link href="https://example.test/atom" /></entry></feed>'), 'application/atom+xml', 'https://example.test/feed.xml'), ['https://example.test/atom']);
});

test('route fetches sitemap then indexes deterministic content through exact identities', async () => {
  const index = memoryIndex();
  const calls = [];
  const route = new FocusedIndexRoute(config(), { index, worker: worker(), fetch: async (url) => { calls.push(url); return url.endsWith('sitemap.xml') ? result(url, 'application/xml', '<urlset><url><loc>https://example.test/article</loc></url></urlset>') : result(url, 'text/html', '<html/>'); }, now: () => new Date(now), sleep: async () => {} }, now);
  const report = await route.crawl();
  assert.equal(report.outcome, 'complete');
  assert.equal(report.fetched, 2);
  assert.equal(report.indexed, 1);
  assert.deepEqual(calls, ['https://example.test/sitemap.xml', 'https://example.test/article']);
  const results = await route.query('deterministic', now);
  assert.equal(results.length, 1);
  assert.equal(results[0].routeId, FOCUSED_INDEX_ROUTE_ID);
});

test('robots denial, domain denylist/removal, private targets, and unresolved use policy fail closed', async () => {
  const denied = new FocusedIndexRoute(config({ explicitSeeds: ['https://example.test/private'], denylist: [] }), { index: memoryIndex(), worker: worker(), fetch: async (url) => result(url, 'text/html', '', 'robots_disallowed') }, undefined, now);
  const deniedReport = await denied.crawl();
  assert.equal(deniedReport.rejected, 1);
  const removable = new FocusedIndexFrontier(config({ explicitSeeds: ['https://example.test/a', 'https://example.test/b'] }), now);
  assert.equal(removable.removeDomain('example.test'), 2);
  assert.equal(removable.state.items.every((item) => item.status === 'removed'), true);
  assert.throws(() => new FocusedIndexFrontier(config({ explicitSeeds: ['https://127.0.0.1/metadata'] }), now), /unsafe_url/u);
  assert.throws(() => new FocusedIndexFrontier(config({ policies: [{ domain: 'example.test', contentUse: 'unresolved', language: 'en' }] }), now), /source_use_policy_unresolved/u);
});

test('exact and near duplicates suppress, while stale and expired documents are disclosed', async () => {
  const existing = createFocusedIndexDocument({ title: 'Existing', content: 'Fresh deterministic evidence for focused indexing.', sourceUrl: 'https://example.test/old', canonicalUrl: 'https://example.test/old', mime: 'text/html', language: 'en', fetchedAt: now, staleAt: '2026-07-31T12:01:00.000Z', expiresAt: '2026-07-31T12:10:00.000Z', recrawlAt: '2026-07-31T12:02:00.000Z' });
  const index = memoryIndex([existing]);
  const route = new FocusedIndexRoute(config({ explicitSeeds: ['https://example.test/article'] }), { index, worker: worker(), fetch: async (url) => result(url, 'text/html', '<html/>') }, undefined, now);
  const report = await route.crawl();
  assert.equal(report.suppressedDuplicates, 1);
  assert.equal(freshnessAt(existing, '2026-07-31T12:01:00.000Z'), 'stale');
  assert.equal(freshnessAt(existing, '2026-07-31T12:10:00.000Z'), 'expired');
  assert.equal(projectFocusedIndexFreshness(existing, '2026-07-31T12:01:00.000Z').provenance.freshnessState, 'stale');
});

test('pause/resume, concurrency, per-domain quota, and corrupted frontier state are bounded', () => {
  const frontier = new FocusedIndexFrontier(config({ explicitSeeds: ['https://example.test/a', 'https://example.test/b', 'https://example.test/c'], maximumPagesPerDomain: 2 }), now);
  frontier.pause();
  assert.equal(frontier.claim(now), undefined);
  frontier.resume();
  assert.ok(frontier.claim(now));
  assert.ok(frontier.claim(now));
  assert.equal(frontier.claim(now), undefined);
  const snapshot = frontier.snapshot();
  assert.throws(() => FocusedIndexFrontier.restore(config(), `${snapshot.serialized.slice(0, -2)}xx`), /corrupted_focused_index_frontier|JSON/u);
  const delayed = new FocusedIndexFrontier(config({ explicitSeeds: ['https://example.test/delayed'], maximumPages: 2, maximumPagesPerDomain: 2, minimumDelayMsPerDomain: 1_000 }), now);
  const claimed = delayed.claim(now);
  assert.ok(claimed);
  delayed.complete(claimed.url, now, 'succeeded', undefined, [{ url: 'https://example.test/delayed-2', source: 'page_link' }]);
  assert.equal(delayed.claim(now), undefined);
  assert.ok(delayed.claim('2026-07-31T12:00:01.000Z'));
});

test('worker/index unavailability, redirect/MIME/size rejection, identity substitution, and honest health fail closed', async () => {
  const unavailableWorker = new FocusedIndexRoute(config({ explicitSeeds: ['https://example.test/article'] }), { index: memoryIndex(), worker: { workerId: 'worker_scrapling_0_4_12', version: '0.4.12', async extract() { throw new Error('down'); } }, fetch: async (url) => result(url, 'text/html', '<html/>') }, undefined, now);
  assert.equal((await unavailableWorker.crawl()).rejected, 1);
  const unavailableIndex = new FocusedIndexRoute(config({ explicitSeeds: ['https://example.test/article'] }), { index: { ...memoryIndex(), async listDocuments() { throw new Error('down'); } }, worker: worker(), fetch: async (url) => result(url, 'text/html', '<html/>') }, undefined, now);
  assert.equal((await unavailableIndex.crawl()).outcome, 'unavailable');
  for (const code of ['redirect_limit_exceeded', 'content_type_not_allowed', 'response_too_large']) {
    const route = new FocusedIndexRoute(config({ explicitSeeds: ['https://example.test/article'] }), { index: memoryIndex(), worker: worker(), fetch: async (url) => result(url, 'text/html', '', code) }, undefined, now);
    assert.equal((await route.crawl()).rejected, 1);
  }
  assert.throws(() => new FocusedIndexRoute(config(), { index: { ...memoryIndex(), identity: { ...focusedIndexRuntimeIdentity, providerId: 'provider_substituted' } }, worker: worker(), fetch: async () => result('https://example.test/a', 'text/html', '<html/>') }), /focused_index_runtime_identity_substitution/u);
});

test('Meilisearch community adapter requires master key, disabled analytics, exact version, and honest health', async () => {
  const requests = [];
  const adapter = createMeilisearchFocusedIndexAdapter({ endpoint: 'http://127.0.0.1:7700/', masterKey: 'local-master-key-1234', indexUid: 'focused_index', analyticsDisabled: true, expectedVersion: '1.51.0', communityFeaturesOnly: true, providerId: 'provider_meilisearch_1_51_0', adapterId: 'adapter_meilisearch_focused_1_51_0', healthIdentity: 'clervo.health.focused_index', failureDomain: 'clervo.focused_index' }, async (request) => { requests.push(request); return request.path === '/health' ? { status: 200, body: { status: 'available' } } : { status: 200, body: { pkgVersion: '1.51.0' } }; }, focusedIndexRuntimeIdentity);
  assert.equal((await adapter.health(now)).status, 'healthy');
  assert.equal(requests[0].headers.authorization, 'Bearer local-master-key-1234');
  const down = createMeilisearchFocusedIndexAdapter({ endpoint: 'http://127.0.0.1:7700/', masterKey: 'local-master-key-1234', indexUid: 'focused_index', analyticsDisabled: true, expectedVersion: '1.51.0', communityFeaturesOnly: true, providerId: 'provider_meilisearch_1_51_0', adapterId: 'adapter_meilisearch_focused_1_51_0', healthIdentity: 'clervo.health.focused_index', failureDomain: 'clervo.focused_index' }, async () => { throw new Error('down'); }, focusedIndexRuntimeIdentity);
  assert.equal((await down.health(now)).status, 'unavailable');
  assert.throws(() => createMeilisearchFocusedIndexAdapter({ endpoint: 'http://127.0.0.1:7700/', masterKey: 'local-master-key-1234', indexUid: 'focused_index', analyticsDisabled: false, expectedVersion: '1.51.0', communityFeaturesOnly: true, providerId: 'provider_meilisearch_1_51_0', adapterId: 'adapter_meilisearch_focused_1_51_0', healthIdentity: 'clervo.health.focused_index', failureDomain: 'clervo.focused_index' }, async () => ({ status: 200, body: {} }), focusedIndexRuntimeIdentity), /analytics/u);
});

test('ranking is Clervo-owned and deterministic across replay', () => {
  const first = createFocusedIndexDocument({ title: 'Ranking target', content: 'alpha beta deterministic', sourceUrl: 'https://example.test/ranking', canonicalUrl: 'https://example.test/ranking', mime: 'text/html', language: 'en', fetchedAt: now, staleAt: '2026-08-01T12:00:00.000Z', expiresAt: '2026-08-07T12:00:00.000Z', recrawlAt: '2026-08-02T12:00:00.000Z' });
  const second = createFocusedIndexDocument({ title: 'Other', content: 'alpha', sourceUrl: 'https://example.test/other', canonicalUrl: 'https://example.test/other', mime: 'text/html', language: 'en', fetchedAt: now, staleAt: '2026-08-01T12:00:00.000Z', expiresAt: '2026-08-07T12:00:00.000Z', recrawlAt: '2026-08-02T12:00:00.000Z' });
  assert.deepEqual(rankFocusedIndexDocuments('deterministic', [second, first], now, 10), rankFocusedIndexDocuments('deterministic', [first, second], now, 10));
  assert.equal(rankFocusedIndexDocuments('deterministic', [second, first], now, 10)[0].documentId, first.documentId);
});
