import assert from 'node:assert/strict';
import test from 'node:test';

import { createOpenCommercialSearchExecutor } from '../../dist/services/search/src/open-commercial-pipeline.js';
import {
  SANDBOX_RUN_PRICE_CLASSES,
  normalizeSandboxHttpRequest,
  sandboxRunPricing,
} from '../../apps/api/src/x402-paid-sandbox.mjs';

const operation = (query) => ({
  operationId: `op_${query.replace(/[^a-z0-9]/giu, '').padEnd(32, '0').slice(0, 32)}`,
  productId: 'search.web', requestHash: `sha256:${'a'.repeat(64)}`, fundingMode: 'paid',
  query, maxResults: 3, synthesize: false, language: 'en', region: 'US',
});

function wikimediaBody(query = 'Kubernetes security') {
  return JSON.stringify({ query: { pages: [{ title: query, fullurl: `https://en.wikipedia.org/wiki/${query}`, extract: `${query} is a useful current reference for bounded search evidence.` }] } });
}

function crossrefBody() {
  return JSON.stringify({ message: { items: [{ DOI: '10.5555/b10', title: ['Bounded Search Evidence'], URL: 'https://doi.org/10.5555/b10', publisher: 'Open research registry', published: { 'date-parts': [[2026, 8, 1]] } }] } });
}

test('B10 Search uses commercially permitted open primary and truthful independent fallback', async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const executor = createOpenCommercialSearchExecutor({ transport: async ({ url }) => {
    if (url.hostname === 'en.wikipedia.org') {
      primaryCalls += 1;
      return { status: 200, headers: {}, body: wikimediaBody('Kubernetes security') };
    }
    fallbackCalls += 1;
    return { status: 200, headers: {}, body: crossrefBody() };
  } });
  const primary = await executor.execute(operation('Kubernetes security'));
  assert.equal(primary.route.routeId, 'clervo.search.open.wikimedia.v1');
  assert.equal(primary.route.degraded, false);
  assert.equal(primary.route.fallback, false);
  assert.equal(primary.searchResponse.results.length, 1);
  assert.equal(primary.searchResponse.results[0].attribution.license.startsWith('CC BY-SA 4.0'), true);
  assert.equal(primary.searchResponse.citations[0].quote.includes('Kubernetes'), true);
  assert.equal(JSON.stringify(primary).includes('credential'), false);
  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 0);

  const fallbackExecutor = createOpenCommercialSearchExecutor({ transport: async ({ url }) => {
    if (url.hostname === 'en.wikipedia.org') return { status: 503, headers: {}, body: '{}' };
    return { status: 200, headers: {}, body: crossrefBody() };
  } });
  const fallback = await fallbackExecutor.execute(operation('bounded search evidence'));
  assert.equal(fallback.route.routeId, 'clervo.search.open.crossref.v1');
  assert.equal(fallback.route.degraded, true);
  assert.equal(fallback.route.fallback, true);
  assert.equal(fallback.searchResponse.results[0].attribution.sourceName, 'Crossref');
  assert.equal(fallbackExecutor.calls.fallback, 1);
});

test('B10 Sandbox derives price class from requested envelope without changing ceilings', () => {
  const short = normalizeSandboxHttpRequest({ command: ['node', '-e', 'process.stdout.write(\'ok\')'], limits: { cpuMillis: 5_000, memoryBytes: 268_435_456, processes: 16, diskBytes: 67_108_864, outputBytes: 65_536, artifactBytes: 1_048_576, wallTimeMs: 10_000 } });
  const standard = normalizeSandboxHttpRequest({ command: ['node', '-e', 'process.stdout.write(\'ok\')'], limits: { wallTimeMs: 10_001 } });
  assert.equal(sandboxRunPricing(short), SANDBOX_RUN_PRICE_CLASSES.short);
  assert.equal(sandboxRunPricing(standard), SANDBOX_RUN_PRICE_CLASSES.standard);
  assert.equal(SANDBOX_RUN_PRICE_CLASSES.short.maximumCharge.amountAtomic, '10000');
  assert.equal(SANDBOX_RUN_PRICE_CLASSES.standard.maximumCharge.amountAtomic, '60000');
  assert.equal(SANDBOX_RUN_PRICE_CLASSES.standard.supplierCost.amountAtomic, '45000');
  assert.equal(standard.limits.memoryBytes, 536_870_912);
  assert.equal(standard.limits.processes, 64);
  assert.equal(standard.limits.wallTimeMs, 10_001);
});
