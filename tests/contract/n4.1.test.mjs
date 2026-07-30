import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalizeSearchUrl,
  createSearchResponse,
  rankSearchEvidence,
  verifySearchCitation,
} from '../../dist/packages/contracts/src/index.js';

const now = '2026-07-30T19:00:00.000Z';
const operationId = 'op_01JZ8Q5Y4QFD48Q24H6M5F4K9P';

function evidence(resultId, overrides = {}) {
  return {
    resultId,
    sourceId: 'adapter_mock.search',
    url: `https://example.com/${resultId}`,
    title: 'Evidence title',
    snippet: 'Evidence snippet.',
    evidenceText: 'Search citations must quote exact evidence text.',
    retrievedAt: '2026-07-30T18:59:00.000Z',
    publishedAt: '2026-07-30T18:00:00.000Z',
    authorityScore: 80,
    relevanceScore: 80,
    ...overrides,
  };
}

const firstId = 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P';
const secondId = 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K8Q';
const thirdId = 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K7R';

test('URL canonicalization removes fragments, default ports, tracking parameters, and unstable query ordering', () => {
  assert.equal(
    canonicalizeSearchUrl('HTTPS://Example.COM:443/path/?z=2&utm_source=test&a=1#section'),
    'https://example.com/path?a=1&z=2',
  );
  assert.throws(() => canonicalizeSearchUrl('file:///etc/passwd'), /invalid_search_url/);
  assert.throws(() => canonicalizeSearchUrl('https://user:secret@example.com/'), /invalid_search_url/);
});

test('exact canonical URL duplicates collapse to the strongest deterministic evidence', () => {
  const weak = evidence(firstId, { url: 'https://example.com/article?utm_campaign=x', relevanceScore: 50 });
  const strong = evidence(secondId, { url: 'https://EXAMPLE.com:443/article/', relevanceScore: 95 });
  const results = rankSearchEvidence({ now, maxResults: 10, evidence: [weak, strong] });
  assert.equal(results.length, 1);
  assert.equal(results[0].resultId, secondId);
  assert.equal(results[0].canonicalUrl, 'https://example.com/article');
});

test('ranking is input-order independent with stable tie-breaking and explicit components', () => {
  const high = evidence(firstId, { url: 'https://alpha.example/current', relevanceScore: 95, authorityScore: 90 });
  const lower = evidence(secondId, { url: 'https://beta.example/current', relevanceScore: 70, authorityScore: 70 });
  const first = rankSearchEvidence({ now, maxResults: 10, evidence: [lower, high] });
  const second = rankSearchEvidence({ now, maxResults: 10, evidence: [high, lower] });
  assert.deepEqual(first, second);
  assert.equal(first[0].resultId, firstId);
  assert.deepEqual(first[0].score, { freshness: 100, authority: 90, relevance: 95, diversity: 100, totalBasisPoints: 9575 });
});

test('freshness and hostname diversity affect scores without hiding their basis', () => {
  const current = evidence(firstId, { url: 'https://same.example/current' });
  const sameHost = evidence(secondId, { url: 'https://same.example/other', relevanceScore: 79 });
  const old = evidence(thirdId, { url: 'https://other.example/old', publishedAt: '2024-01-01T00:00:00.000Z', relevanceScore: 79 });
  const results = rankSearchEvidence({ now, maxResults: 10, evidence: [old, sameHost, current] });
  assert.equal(results.find((result) => result.resultId === sameHost.resultId).score.diversity, 40);
  assert.equal(results.find((result) => result.resultId === old.resultId).score.freshness, 10);
});

test('ranking rejects malformed evidence, future timestamps, duplicate IDs, and invalid bounds', () => {
  assert.throws(() => rankSearchEvidence({ now, maxResults: 0, evidence: [] }), /invalid_search_max_results/);
  assert.throws(() => rankSearchEvidence({ now, maxResults: 10, evidence: [evidence(firstId, { authorityScore: 101 })] }), /invalid_search_authority_score/);
  assert.throws(() => rankSearchEvidence({ now, maxResults: 10, evidence: [evidence(firstId, { retrievedAt: '2026-07-30T20:00:00.000Z' })] }), /search_evidence_from_future/);
  assert.throws(() => rankSearchEvidence({ now, maxResults: 10, evidence: [evidence(firstId), evidence(firstId)] }), /duplicate_search_result_id/);
});

test('citation verifier accepts only exact text offsets on the cited canonical result', () => {
  const [result] = rankSearchEvidence({ now, maxResults: 10, evidence: [evidence(firstId, { url: 'https://example.com/evidence' })] });
  const citation = { citationId: 'cite_01JZ8Q5Y4QFD48Q24H6M5F4K9P', resultId: firstId, canonicalUrl: result.canonicalUrl, quote: 'Search citations', startOffset: 0, endOffset: 16 };
  assert.deepEqual(verifySearchCitation(citation, [result]), { valid: true });
  assert.equal(verifySearchCitation({ ...citation, quote: 'Search citationz' }, [result]).code, 'citation_quote_mismatch');
  assert.equal(verifySearchCitation({ ...citation, canonicalUrl: 'https://attacker.example/' }, [result]).code, 'citation_url_mismatch');
});

test('response construction fails closed on missing, truncated, or mismatched citation evidence', () => {
  const base = { operationId, query: 'citation test', now, maxResults: 10, evidence: [evidence(firstId, { url: 'https://example.com/evidence' })] };
  assert.throws(() => createSearchResponse({ ...base, citations: [{ citationId: 'cite_01JZ8Q5Y4QFD48Q24H6M5F4K9P', resultId: secondId, canonicalUrl: 'https://example.com/evidence', quote: 'Search', startOffset: 0, endOffset: 6 }] }), /citation_result_missing/);
  assert.throws(() => createSearchResponse({ ...base, citations: [{ citationId: 'cite_01JZ8Q5Y4QFD48Q24H6M5F4K9P', resultId: firstId, canonicalUrl: 'https://example.com/evidence', quote: 'Search', startOffset: 0, endOffset: 999 }] }), /citation_range_invalid/);
});

test('response reports deduplication and returns immutable ranked evidence and citations', () => {
  const duplicate = evidence(secondId, { url: 'https://example.com/evidence?utm_source=duplicate', relevanceScore: 10 });
  const response = createSearchResponse({
    operationId,
    query: 'citation test',
    now,
    maxResults: 10,
    evidence: [evidence(firstId, { url: 'https://example.com/evidence' }), duplicate],
    citations: [{ citationId: 'cite_01JZ8Q5Y4QFD48Q24H6M5F4K9P', resultId: firstId, canonicalUrl: 'https://example.com/evidence', quote: 'Search citations', startOffset: 0, endOffset: 16 }],
  });
  assert.equal(response.deduplicatedCount, 1);
  assert.equal(response.results[0].rank, 1);
  assert.equal(Object.isFrozen(response.results), true);
  assert.equal(Object.isFrozen(response.citations[0]), true);
});

test('result limits do not inflate the canonical-URL deduplication count', () => {
  const response = createSearchResponse({
    operationId,
    query: 'limited results',
    now,
    maxResults: 1,
    evidence: [evidence(firstId, { url: 'https://one.example/' }), evidence(secondId, { url: 'https://two.example/' })],
  });
  assert.equal(response.results.length, 1);
  assert.equal(response.deduplicatedCount, 0);
});