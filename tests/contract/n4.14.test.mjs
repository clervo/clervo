import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryFreeSearchQuota,
  SEARCH_FREE_PATH,
  assertSearchExecutionOutput,
  createSearchResponse,
  searchCacheRequestSha256,
  verifySearchCacheDisclosure,
} from '../../dist/packages/contracts/src/index.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';

const operationId = 'op_01JZ8Q5Y4QFD48Q24H6M5F4K9P';
const now = '2026-07-30T19:00:00.000Z';

function response(overrides = {}) {
  return createSearchResponse({
    operationId,
    query: 'cache freshness disclosure',
    now,
    maxResults: 3,
    evidence: [],
    ...overrides,
  });
}

test('uncached search responses disclose an immutable response-bound miss', () => {
  const value = response();
  assert.deepEqual(value.cache, {
    policyId: 'search_cache_disclosure_v1',
    outcome: 'miss',
    requestSha256: searchCacheRequestSha256(value.query, 3),
    responseSha256: value.cache.responseSha256,
    observedAt: now,
    maximumResults: 3,
    freshnessLifetimeSeconds: 0,
    ageSeconds: 0,
    residentAgeSeconds: 0,
    freshnessRemainingSeconds: 0,
    revalidationPerformed: false,
  });
  assert.equal(verifySearchCacheDisclosure(value, 3), true);
  assert.equal(Object.isFrozen(value.cache), true);
});

test('fresh hits disclose exact age and reject the expiration boundary', () => {
  const value = response({ cache: { outcome: 'fresh_hit', storedAt: '2026-07-30T18:58:00.000Z', validatedAt: '2026-07-30T18:59:01.000Z', freshnessLifetimeSeconds: 60 } });
  assert.equal(value.cache.outcome, 'fresh_hit');
  assert.equal(value.cache.ageSeconds, 59);
  assert.equal(value.cache.residentAgeSeconds, 120);
  assert.equal(value.cache.freshnessRemainingSeconds, 1);
  assert.equal(value.cache.revalidationPerformed, false);
  assert.equal(verifySearchCacheDisclosure(value, 3), true);
  assert.throws(() => response({ cache: { outcome: 'fresh_hit', storedAt: '2026-07-30T18:58:00.000Z', validatedAt: '2026-07-30T18:59:00.000Z', freshnessLifetimeSeconds: 60 } }), /search_cache_entry_not_fresh/u);
});

test('stale entries are reusable only after current successful revalidation', () => {
  const value = response({ cache: { outcome: 'stale_revalidated', storedAt: '2026-07-30T18:57:00.000Z', previousValidatedAt: '2026-07-30T18:58:30.000Z', validatedAt: now, freshnessLifetimeSeconds: 60 } });
  assert.equal(value.cache.outcome, 'stale_revalidated');
  assert.equal(value.cache.ageSeconds, 0);
  assert.equal(value.cache.residentAgeSeconds, 180);
  assert.equal(value.cache.freshnessRemainingSeconds, 60);
  assert.equal(value.cache.revalidationPerformed, true);
  assert.equal(verifySearchCacheDisclosure(value, 3), true);
  assert.throws(() => response({ cache: { outcome: 'stale_revalidated', storedAt: '2026-07-30T18:58:00.000Z', previousValidatedAt: '2026-07-30T18:59:30.000Z', validatedAt: now, freshnessLifetimeSeconds: 60 } }), /search_cache_entry_was_not_stale/u);
  assert.throws(() => response({ cache: { outcome: 'stale_revalidated', storedAt: '2026-07-30T18:57:00.000Z', previousValidatedAt: '2026-07-30T18:58:00.000Z', validatedAt: '2026-07-30T18:59:59.000Z', freshnessLifetimeSeconds: 60 } }), /search_cache_revalidation_not_current/u);
});

test('future timestamps, response substitution, request-bound changes, and derived-field tampering fail closed', () => {
  assert.throws(() => response({ cache: { outcome: 'fresh_hit', storedAt: '2026-07-30T18:58:00.000Z', validatedAt: '2026-07-30T19:00:01.000Z', freshnessLifetimeSeconds: 60 } }), /invalid_search_cache_timeline/u);
  const value = response();
  assert.equal(verifySearchCacheDisclosure({ ...value, query: 'substituted query' }, 3), false);
  assert.equal(verifySearchCacheDisclosure({ ...value, generatedAt: '2026-07-30T19:00:01.000Z' }, 3), false);
  assert.equal(verifySearchCacheDisclosure({ ...value, cache: { ...value.cache, ageSeconds: 1 } }, 3), false);
  assert.equal(verifySearchCacheDisclosure(value, 2), false);
  assert.throws(() => assertSearchExecutionOutput({ searchResponse: { ...value, cache: { ...value.cache, responseSha256: `sha256:${'f'.repeat(64)}` } } }, { operationId, requestHash: `sha256:${'a'.repeat(64)}`, fundingMode: 'free', query: value.query, maxResults: 3, synthesize: false }), /search_execution_cache_disclosure_invalid/u);
});

test('the public free route returns explicit miss provenance while disabling transport caches', async () => {
  const executor = { execute(input) { return { searchResponse: response({ operationId: input.operationId, query: input.query, maxResults: input.maxResults }) }; } };
  const server = createSearchServer({ executor, now: () => now, freeQuota: new InMemoryFreeSearchQuota(1, 60_000) });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const address = server.address();
    assert.equal(typeof address, 'object');
    const result = await fetch(`http://127.0.0.1:${address.port}${SEARCH_FREE_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'idem_n414_public_cache_001' }, body: JSON.stringify({ query: 'public cache evidence', maxResults: 2, synthesize: false }) });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    const body = await result.json();
    assert.equal(body.output.searchResponse.cache.outcome, 'miss');
    assert.equal(body.output.searchResponse.cache.maximumResults, 2);
    assert.equal(verifySearchCacheDisclosure(body.output.searchResponse, 2), true);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});