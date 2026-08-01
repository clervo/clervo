import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  assertPlatformRegistry,
  assertSchemaVisibilityManifest,
  compareLiveIntelligenceEvidence,
  createSearchResponse,
  verifyLiveIntelligenceComparison,
} from '../../dist/packages/contracts/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaDirectory = path.join(root, 'packages/contracts/schemas');

async function json(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}

function evidence({ id, url, title, text, retrievedAt, sourceId = 'adapter_test.search', authority = 90, relevance = 90 }) {
  return {
    resultId: id,
    sourceId,
    url,
    title,
    snippet: `${title} summary`,
    evidenceText: text,
    retrievedAt,
    publishedAt: '2026-08-01T08:00:00.000Z',
    authorityScore: authority,
    relevanceScore: relevance,
  };
}

function snapshots() {
  const baseline = createSearchResponse({
    operationId: 'op_01K0BASELINE000000000000',
    query: 'clervo evidence change',
    language: 'en',
    region: 'US',
    now: '2026-08-01T10:00:00.000Z',
    maxResults: 10,
    evidence: [
      evidence({ id: 'sr_01K0UNCHANGEDBASE000001', url: 'https://unchanged.example/item', title: 'Stable', text: 'Stable evidence.', retrievedAt: '2026-08-01T09:00:00.000Z', authority: 100, relevance: 100 }),
      evidence({ id: 'sr_01K0MODIFIEDBASE0000001', url: 'https://modified.example/item', title: 'Old', text: 'Old evidence.', retrievedAt: '2026-08-01T09:00:00.000Z', authority: 90, relevance: 90 }),
      evidence({ id: 'sr_01K0REMOVEDBASE00000001', url: 'https://removed.example/item', title: 'Removed', text: 'Removed evidence.', retrievedAt: '2026-08-01T09:00:00.000Z', authority: 80, relevance: 80 }),
    ],
  });
  const current = createSearchResponse({
    operationId: 'op_01K0CURRENT0000000000000',
    query: 'clervo evidence change',
    language: 'en',
    region: 'US',
    now: '2026-08-01T11:00:00.000Z',
    maxResults: 10,
    evidence: [
      evidence({ id: 'sr_01K0UNCHANGEDCURR000001', url: 'https://unchanged.example/item', title: 'Stable', text: 'Stable evidence.', retrievedAt: '2026-08-01T10:59:00.000Z', authority: 100, relevance: 100 }),
      evidence({ id: 'sr_01K0ADDEDCURRENT00000001', url: 'https://added.example/item', title: 'Added', text: 'Added evidence.', retrievedAt: '2026-08-01T10:59:00.000Z', authority: 95, relevance: 95 }),
      evidence({ id: 'sr_01K0MODIFIEDCURR000001', url: 'https://modified.example/item', title: 'New', text: 'New evidence.', retrievedAt: '2026-08-01T10:59:00.000Z', sourceId: 'adapter_test.changed', authority: 90, relevance: 85 }),
    ],
  });
  return { baseline, current };
}

test('comparison emits deterministic typed add, modify, and remove events while ignoring retrieval-only churn', () => {
  const input = snapshots();
  const report = compareLiveIntelligenceEvidence(input);
  assert.deepEqual(report.summary, {
    baselineEntities: 3,
    currentEntities: 3,
    added: 1,
    removed: 1,
    modified: 1,
    unchanged: 1,
  });
  assert.deepEqual(report.events.map(({ type, canonicalUrl }) => ({ type, canonicalUrl })), [
    { type: 'added', canonicalUrl: 'https://added.example/item' },
    { type: 'modified', canonicalUrl: 'https://modified.example/item' },
    { type: 'removed', canonicalUrl: 'https://removed.example/item' },
  ]);
  assert.deepEqual(report.events[0].changedFields, ['presence']);
  assert.deepEqual(report.events[1].changedFields, ['title', 'snippet', 'evidenceText', 'sourceId', 'relevanceScore', 'rank']);
  assert.deepEqual(report.events[2].changedFields, ['presence']);
  assert.equal(report.events.some(({ canonicalUrl }) => canonicalUrl.includes('unchanged')), false);
  assert.equal(verifyLiveIntelligenceComparison(report), true);
  assert.deepEqual(compareLiveIntelligenceEvidence(input), report);
  assert.deepEqual(compareLiveIntelligenceEvidence({
    baseline: { ...input.baseline, results: [...input.baseline.results].reverse() },
    current: { ...input.current, results: [...input.current.results].reverse() },
  }), report);
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.query) && Object.isFrozen(report.events) && Object.isFrozen(report.events[0]));
});

test('comparison output validates against the strict contract and remains internal-only', async () => {
  const schemas = (await readdir(schemaDirectory)).filter((file) => file.endsWith('.schema.json')).sort();
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  for (const file of schemas) ajv.addSchema(await json(`packages/contracts/schemas/${file}`));
  const validate = ajv.getSchema('https://api.clervo.dev/schemas/2026-07-29.1/live-intelligence-comparison.schema.json');
  const report = compareLiveIntelligenceEvidence(snapshots());
  assert.equal(validate(report), true, ajv.errorsText(validate.errors));

  const registry = await json('packages/catalog/platform-registry.v1.json');
  const visibility = await json('packages/catalog/schema-visibility.v1.json');
  assert.doesNotThrow(() => assertSchemaVisibilityManifest(visibility, schemas));
  assert.doesNotThrow(() => assertPlatformRegistry(registry, visibility));
  const operation = registry.operations.find(({ operationId }) => operationId === 'search.compare');
  assert.deepEqual(operation, {
    operationId: 'search.compare',
    capabilityId: 'search.web',
    productId: 'search.web',
    route: null,
    deliveryModes: ['sync'],
    accessModes: ['open_web', 'official_api', 'customer_supplied_data', 'unsupported'],
    inputSchema: 'https://api.clervo.dev/schemas/2026-07-29.1/live-intelligence-compare-request.schema.json',
    outputSchema: 'https://api.clervo.dev/schemas/2026-07-29.1/live-intelligence-comparison.schema.json',
    lifecycle: 'preview',
    visibility: 'internal',
  });
  for (const file of ['live-intelligence-compare-request.schema.json', 'live-intelligence-comparison.schema.json']) {
    assert.equal(visibility.schemas.find((entry) => entry.file === file)?.visibility, 'internal_control');
  }
});

test('comparison fails closed on identity, chronology, URL, duplicate, and citation violations', () => {
  const { baseline, current } = snapshots();
  assert.throws(() => compareLiveIntelligenceEvidence({ baseline, current: { ...current, query: 'different query' } }), /comparison_query_identity_mismatch/u);
  assert.throws(() => compareLiveIntelligenceEvidence({ baseline: { ...baseline, generatedAt: current.generatedAt }, current }), /comparison_time_not_increasing/u);

  const badUrl = structuredClone(current);
  badUrl.results[0].canonicalUrl = 'https://wrong.example/item';
  assert.throws(() => compareLiveIntelligenceEvidence({ baseline, current: badUrl }), /current_canonical_url_invalid/u);

  const duplicate = structuredClone(current);
  duplicate.results.push({ ...duplicate.results[0], resultId: 'sr_01K0DUPLICATECURRENT001', rank: 4 });
  assert.throws(() => compareLiveIntelligenceEvidence({ baseline, current: duplicate }), /current_canonical_url_duplicate/u);

  const badCitation = structuredClone(current);
  badCitation.citations.push({ citationId: 'cite_01K0MISSINGRESULT00001', resultId: 'sr_01K0MISSINGRESULT000001', canonicalUrl: 'https://missing.example/item', quote: 'x', startOffset: 0, endOffset: 1 });
  assert.throws(() => compareLiveIntelligenceEvidence({ baseline, current: badCitation }), /current_citation_result_missing/u);
});

test('comparison hash detects any post-production mutation', () => {
  const report = compareLiveIntelligenceEvidence(snapshots());
  const tampered = structuredClone(report);
  tampered.summary.modified = 0;
  assert.equal(verifyLiveIntelligenceComparison(tampered), false);
});
