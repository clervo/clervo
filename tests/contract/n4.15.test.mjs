import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSearchExecutionOutput,
  createSearchResponse,
  normalizeSearchHttpRequest,
  normalizeSearchLocaleOptions,
  searchCacheRequestSha256,
  searchHttpRequestHash,
  verifySearchCacheDisclosure,
} from '../../dist/packages/contracts/src/index.js';
import { createRecordedSearchExecutor } from '../../dist/services/search/src/recorded-pipeline.js';

const operationId = 'op_01JZ8Q5Y4QFD48Q24H6M5F4K9P';
const requestHash = `sha256:${'a'.repeat(64)}`;
const now = '2026-07-30T19:00:00.000Z';

function response(language = 'en', region = 'US') {
  return createSearchResponse({ operationId, query: 'regional evidence', language, region, now, maxResults: 3, evidence: [] });
}

test('search locale options default deterministically and preserve canonical explicit values', () => {
  assert.deepEqual(normalizeSearchHttpRequest({ query: ' evidence ' }), { query: 'evidence', maxResults: 10, synthesize: true, language: 'en', region: 'US' });
  assert.deepEqual(normalizeSearchLocaleOptions({ language: 'fr-CA', region: 'CA' }), { language: 'fr-CA', region: 'CA' });
});

test('non-canonical, malformed, and unknown locale values fail closed', () => {
  assert.throws(() => normalizeSearchHttpRequest({ query: 'x', language: 'EN' }), /search_language_not_canonical/u);
  assert.throws(() => normalizeSearchHttpRequest({ query: 'x', language: 'en_US' }), /invalid_search_language/u);
  assert.throws(() => normalizeSearchHttpRequest({ query: 'x', region: 'us' }), /invalid_search_region/u);
  assert.throws(() => normalizeSearchHttpRequest({ query: 'x', region: 'ZZ' }), /invalid_search_region/u);
});

test('language and region participate in canonical HTTP and cache request identity', () => {
  const us = normalizeSearchHttpRequest({ query: 'evidence', language: 'en', region: 'US' });
  const gb = normalizeSearchHttpRequest({ query: 'evidence', language: 'en', region: 'GB' });
  assert.notEqual(searchHttpRequestHash(us), searchHttpRequestHash(gb));
  assert.notEqual(searchCacheRequestSha256(us.query, us.maxResults, us.language, us.region), searchCacheRequestSha256(gb.query, gb.maxResults, gb.language, gb.region));
});

test('search responses disclose locale and bind it into cache verification', () => {
  const value = response('es', 'MX');
  assert.equal(value.language, 'es');
  assert.equal(value.region, 'MX');
  assert.equal(verifySearchCacheDisclosure(value, 3), true);
  assert.equal(verifySearchCacheDisclosure({ ...value, region: 'ES' }, 3), false);
});

test('executor output locale substitution is rejected before HTTP or receipt construction', () => {
  const value = response('en', 'US');
  const input = { operationId, productId: 'search.web', requestHash, fundingMode: 'free', query: value.query, maxResults: 3, synthesize: false, language: 'en', region: 'GB' };
  assert.throws(() => assertSearchExecutionOutput({ searchResponse: value }, input), /search_execution_binding_invalid/u);
  assert.doesNotThrow(() => assertSearchExecutionOutput({ searchResponse: response('en', 'GB') }, input));
});

test('the recorded pipeline propagates locale through federation, assembly, and public output', async () => {
  const executor = createRecordedSearchExecutor();
  const output = await executor.execute({ operationId, productId: 'search.web', requestHash, fundingMode: 'free', query: 'regional evidence', maxResults: 2, synthesize: false, language: 'fr', region: 'CA' });
  assert.equal(executor.lastRun.federation.language, 'fr');
  assert.equal(executor.lastRun.federation.region, 'CA');
  assert.equal(executor.lastRun.assembly.language, 'fr');
  assert.equal(executor.lastRun.assembly.region, 'CA');
  assert.equal(output.searchResponse.language, 'fr');
  assert.equal(output.searchResponse.region, 'CA');
});
