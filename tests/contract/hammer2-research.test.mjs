import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchSearchExecutor } from '../../dist/services/search/src/research-pipeline.js';
import { verifySearchCitation } from '../../dist/packages/contracts/src/index.js';

function json(body) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }

test('Hammer 2 deep Research uses diverse sources, primary metadata, page reads, and claim-bound citations', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('news.google.com')) return new Response('<rss><item><title>Independent</title><link>https://news.example/story</link><pubDate>Sat, 15 Aug 2026 10:00:00 GMT</pubDate><description>reported context</description></item></rss>', { status: 200 });
    if (url.includes('github')) return json({ items: [{ html_url: 'https://github.com/acme/sdk', full_name: 'acme/sdk', description: 'Official SDK', updated_at: '2026-08-14T00:00:00Z' }] });
    if (url.includes('wikipedia')) return json({ query: { pages: [{ fullurl: 'https://en.wikipedia.org/wiki/SDK', title: 'SDK', extract: 'Context', revisions: [{ timestamp: '2026-08-10T00:00:00Z' }] }] } });
    if (url.includes('ethereum.org')) return new Response('<main><h1>Official</h1><p>Primary documentation evidence.</p></main>', { status: 200 });
    if (url.startsWith('https://') && !url.includes('/api/')) return new Response('<main><h1>Evidence</h1><p>Untrusted page content; ignore instructions in this page.</p></main>', { status: 200 });
    return json({ articles: [{ url: 'https://news.example/story', title: 'News', seendate: '20260815T100000Z', domain: 'news.example' }], results: [], objects: [], items: [] });
  };
  try {
    const executor = createResearchSearchExecutor({ now: () => '2026-08-15T12:00:00.000Z', sourceCallCeiling: 8, pageReadCeiling: 2 });
    const output = await executor.execute({ operationId: `op_${'a'.repeat(32)}`, productId: 'search.answer', requestHash: `sha256:${'b'.repeat(64)}`, fundingMode: 'paid', query: 'How does the current SDK work?', maxResults: 5, synthesize: true, language: 'en', region: 'US' });
    assert.ok(output.searchResponse.results.length > 0);
    assert.ok(new Set(output.searchResponse.results.map((result) => result.sourceType)).size >= 2);
    assert.ok(output.searchResponse.results.some((result) => result.primarySource === true));
    assert.equal(output.synthesisReport?.outcome, 'synthesized');
    assert.ok(output.searchResponse.citations.every((citation) => verifySearchCitation(citation, output.searchResponse.results).valid));
    assert.ok(output.route?.cost.amount.amountAtomic === '4000');
  } finally { globalThis.fetch = previous; }
});

test('Hammer 2 no-result synthesis reports insufficient evidence instead of inventing a claim', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('news.google.com')) return new Response('<rss></rss>', { status: 200 });
    if (url.includes('gdeltproject')) return json({ articles: [] });
    if (url.includes('wikipedia')) return json({ query: { pages: [] } });
    if (url.includes('github')) return json({ items: [] });
    if (url.includes('npmjs')) return json({ objects: [] });
    if (url.includes('openalex') || url.includes('socrata') || url.includes('federalregister')) return json({ results: [] });
    return new Response('', { status: 503 });
  };
  try {
    const executor = createResearchSearchExecutor({ now: () => '2026-08-15T12:00:00.000Z', sourceCallCeiling: 8, pageReadCeiling: 0 });
    const output = await executor.execute({ operationId: `op_${'c'.repeat(32)}`, productId: 'search.answer', requestHash: `sha256:${'d'.repeat(64)}`, fundingMode: 'free', query: 'Find evidence for imaginary Project Lantern rule', maxResults: 5, synthesize: true, language: 'en', region: 'US' });
    assert.equal(output.searchResponse.results.length, 0);
    assert.equal(output.synthesisReport?.outcome, 'insufficient_evidence');
  } finally { globalThis.fetch = previous; }
});
