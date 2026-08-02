import assert from 'node:assert/strict';
import test from 'node:test';
import { createBraveExternalIndexAdapter, createSerperExternalIndexAdapter, ExternalIndexRouter } from '../../dist/services/search/src/external-index-router.js';

const request = Object.freeze({ query: 'Clervo search', maximumResults: 2, language: 'en', region: 'US' });

test('external search routing normalizes the primary result without exposing upstream identity or credentials', async () => {
  let observed;
  const primary = createBraveExternalIndexAdapter({ credential: 'test-primary-secret', transport: async (value) => {
    observed = value;
    return { status: 200, body: { web: { results: [{ title: '<b>Clervo</b>', url: 'https://clervo.dev/#fragment', description: '  value-added   search  ' }] } } };
  } });
  const fallback = createSerperExternalIndexAdapter({ credential: 'test-fallback-secret', transport: async () => { throw new Error('must_not_run'); } });
  const router = new ExternalIndexRouter({ primary, fallback, primaryCallCeiling: 1, fallbackCallCeiling: 1 });
  const response = await router.search(request);
  assert.deepEqual(response, { source: 'independent_web_index', degraded: false, results: [{ title: 'Clervo', url: 'https://clervo.dev/', snippet: 'value-added search' }] });
  assert.equal(observed.url.origin, 'https://api.search.brave.com');
  assert.equal(JSON.stringify(response).includes('Brave'), false);
  assert.equal(JSON.stringify(response).includes('secret'), false);
  assert.deepEqual(router.remaining, { primary: 0, fallback: 1 });
});

test('external search routing fails over independently and enforces hard no-overage ceilings', async () => {
  const primary = createBraveExternalIndexAdapter({ credential: 'test-primary-secret', transport: async () => ({ status: 429, body: {} }) });
  let fallbackRequest;
  const fallback = createSerperExternalIndexAdapter({ credential: 'test-fallback-secret', transport: async (value) => {
    fallbackRequest = JSON.parse(value.body);
    return { status: 200, body: { organic: [{ title: 'Fallback', link: 'https://example.com/', snippet: 'Independent route' }] } };
  } });
  const router = new ExternalIndexRouter({ primary, fallback, primaryCallCeiling: 1, fallbackCallCeiling: 1 });
  const response = await router.search(request);
  assert.equal(response.degraded, true);
  assert.deepEqual(fallbackRequest, { q: 'Clervo search', gl: 'us', hl: 'en', num: 2 });
  assert.deepEqual(router.remaining, { primary: 0, fallback: 0 });
  await assert.rejects(router.search(request), /external_index_call_ceiling_reached/u);
});
