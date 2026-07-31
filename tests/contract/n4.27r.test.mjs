import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  FOCUSED_INDEX_ADAPTER_ID, FOCUSED_INDEX_PROVIDER_ID, FOCUSED_INDEX_ROUTE_ID, LIVE_FEDERATION_ROUTE_ID,
  rankConnectedEvidence,
} from '../../dist/packages/contracts/src/index.js';
import { ConnectedRetrievalPipeline, focusedConnectedIdentity, liveConnectedIdentity } from '../../dist/services/search/src/connected-retrieval.js';
import { LiveFederationRoute } from '../../dist/services/search/src/live-federation.js';
import { robotsAllows, validateBrowserResponse, validateBrowserTarget, validateResolvedAddresses } from '../../infra/n4.27r/browser-boundary.mjs';

const root = new URL('../../', import.meta.url);
const now = '2026-07-31T21:10:00.000Z';
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
function evidence(routeId, url, title, text, adapterId, relevanceScore = 70) {
  const focused = routeId === FOCUSED_INDEX_ROUTE_ID;
  return { routeId, providerId: focused ? FOCUSED_INDEX_PROVIDER_ID : `provider_${adapterId.slice(8)}`, adapterId: focused ? FOCUSED_INDEX_ADAPTER_ID : adapterId, url, title, evidenceText: text, retrievedAt: now, authorityScore: 90, relevanceScore, language: 'en', region: 'US', attribution: { sourceId: focused ? 'focused_index' : 'official_site_feed', sourceName: 'source', sourceUrl: url, license: 'approved', notice: 'untrusted evidence' }, extraction: { fetchId: `fetch_${hash(url).slice(7,39)}`, extractionId: `extract_${hash(text).slice(7,39)}`, sourceBodySha256: hash(text), normalizedTextSha256: hash(text), instructionHandling: 'untrusted_data_only', renderMode: 'static', crawl4aiStatus: 'not_used' } };
}
function adapter(identity, outputs) { return Object.freeze({ identity, async search() { return outputs; } }); }

test('N4.27R corpus was split and hashed before implementation and never reuses the frozen holdout marker', async () => {
  const manifest = JSON.parse(await readFile(new URL('benchmarks/n4.27r/freeze-manifest.v1.json', root)));
  assert.equal(manifest.splitBeforeImplementation, true); assert.equal(manifest.originalN427HoldoutMayRun, false);
  assert.deepEqual(manifest.counts, { total:75, development:50, sealedValidation:25, byFamily:{ commerce_marketplaces:15, property_local_markets:15, company_competitive:15, research_evidence:15, developer_agent_retrieval:15 } });
  for (const artifact of Object.values(manifest.artifacts)) assert.equal(hash(await readFile(new URL(artifact.path, root))), artifact.sha256);
  const originalMarker = JSON.parse(await readFile(new URL('benchmarks/n4.27/holdout-final-run.v1.json', root)));
  assert.equal(originalMarker.runCount, 1); assert.equal(originalMarker.mandatoryGatePass, false);
});

test('rank fusion keeps identifiers intact, applies relevance floor, and exposes every disposition', () => {
  const exact = evidence(FOCUSED_INDEX_ROUTE_ID, 'https://official.example/abc-123', 'ABC-123 official manual', 'ABC-123 current version contract', FOCUSED_INDEX_ADAPTER_ID);
  const weak = evidence(LIVE_FEDERATION_ROUTE_ID, 'https://noise.example/abc-124', 'ABC-124 general manual', 'general version contract', 'adapter_n427r_official_site_feed_v1', 95);
  const ranked = rankConnectedEvidence({ query:'ABC-123 current version contract', verticalProfile:'developer_documentation', now, maximumResults:10, nearDuplicateThresholdBasisPoints:8_500, evidence:[weak, exact] });
  assert.deepEqual(ranked.results.map((result) => result.canonicalUrl), ['https://official.example/abc-123']);
  assert.equal(ranked.candidateFlow.find((item) => item.canonicalUrl.includes('abc-123')).disposition, 'ranked');
  assert.equal(ranked.candidateFlow.find((item) => item.canonicalUrl.includes('abc-124')).disposition, 'below_relevance_floor');
  assert.ok(ranked.results[0].score.reciprocalRankFusion > 0);
});

test('valid empty results remain available and do not poison route or global circuits', async () => {
  const pipeline = new ConnectedRetrievalPipeline({ focused: adapter(focusedConnectedIdentity, []), live: adapter(liveConnectedIdentity, []) });
  const response = await pipeline.searchWeb({ operationId:'op_01K1N427RNORESULT00001', query:'unique absent entity', language:'en', region:'US', maximumResults:10, generatedAt:now, deadlineMs:500, operatingProfile:'balanced' });
  assert.equal(response.status, 'ready'); assert.deepEqual(response.results, []); assert.deepEqual(response.degradedRoutes, []);
  const emptySource = { providerId:'provider_n427r_empty_v1', adapterId:'adapter_n427r_empty_v1', async search() { return []; } };
  const route = new LiveFederationRoute({ adapters:[emptySource], fetch:async()=>{ throw new Error('unused'); }, perSourceDeadlineMs:100 });
  assert.deepEqual(await route.search({ query:'absent', language:'en', region:'US', maximumResults:5, generatedAt:now, deadlineAt:'2026-07-31T21:10:00.500Z', signal:new AbortController().signal }), []);
  assert.equal(route.circuit.state.status, 'closed'); assert.equal(route.circuit.state.consecutiveFailures, 0);
});

test('per-source timeout and suspension are isolated from healthy sources', async () => {
  const stalled = { providerId:'provider_n427r_stalled_v1', adapterId:'adapter_n427r_stalled_v1', async search() { return new Promise(() => {}); } };
  const healthy = { providerId:'provider_n427r_healthy_v1', adapterId:'adapter_n427r_healthy_v1', async search() { return []; } };
  const route = new LiveFederationRoute({ adapters:[stalled, healthy], fetch:async()=>{ throw new Error('unused'); }, perSourceDeadlineMs:100 });
  const started = performance.now();
  for (let count=0; count<3; count+=1) assert.deepEqual(await route.search({ query:'none', language:'en', region:'US', maximumResults:5, generatedAt:now, deadlineAt:'2026-07-31T21:10:00.500Z', signal:new AbortController().signal }), []);
  assert.ok(performance.now()-started < 500);
  assert.equal(route.sourceHealth(now).find((source) => source.adapterId === stalled.adapterId).status, 'suspended');
  assert.equal(route.sourceHealth(now).find((source) => source.adapterId === healthy.adapterId).status, 'healthy');
  assert.equal(route.circuit.state.status, 'closed');
});

test('development scorecard passes corrected quality, live contribution, diversity and latency gates', async () => {
  const scorecard = JSON.parse(await readFile(new URL('docs/evidence/n4.27r/development/scorecard.v1.json', root)));
  assert.equal(scorecard.mandatoryQualityGatePass, true);
  assert.equal(scorecard.scorecards.repaired_balanced.recall, 1); assert.equal(scorecard.scorecards.repaired_balanced.precision, 1);
  assert.equal(scorecard.scorecards.repaired_balanced.retrievalQualityScore - scorecard.scorecards.simple_combination.retrievalQualityScore >= .03, true);
  assert.equal(scorecard.liveContribution.uniqueContributionRate >= .30, true); assert.equal(scorecard.liveContribution.largestSourceShare <= .70, true);
});

test('browser boundary denies private, rebinding, robots, MIME, decompression and output abuse', () => {
  assert.throws(() => validateBrowserTarget('https://169.254.169.254/latest'), /denied/u);
  assert.throws(() => validateResolvedAddresses(['203.0.113.10'], ['127.0.0.1']), /rebinding|address/u);
  assert.equal(robotsAllows('/robots-denied/page', 'User-agent: *\nDisallow: /robots-denied'), false);
  assert.throws(() => validateBrowserResponse({ mime:'application/octet-stream', compressedBytes:10, decodedBytes:10, outputCharacters:10 }), /mime/u);
  assert.throws(() => validateBrowserResponse({ mime:'text/html', compressedBytes:10_000, decodedBytes:300_000, outputCharacters:10 }), /decompression/u);
  assert.throws(() => validateBrowserResponse({ mime:'text/html', compressedBytes:100_001, decodedBytes:100_001, outputCharacters:100_001 }), /output/u);
});

test('browser qualification records 20 clean real Chromium runs and complete hostile security proof', async () => {
  const proof = JSON.parse(await readFile(new URL('docs/evidence/n4.27r/browser-and-security-qualification.v1.json', root)));
  assert.equal(proof.successfulStartups, 20); assert.equal(proof.cleanTeardowns, 20); assert.equal(proof.orphanCount, 0); assert.equal(proof.retainedStateCount, 0);
  assert.equal(proof.javascriptFixtureCount >= 10, true); assert.equal(proof.p95DurationMs <= 6000, true); assert.equal(proof.hostileRuns, 8);
  assert.equal(Object.values(proof.security).every(Boolean), true); assert.equal(proof.mandatoryGatePass, true);
});

test('root-cause ledger accounts for all 50 original balanced tasks without rerun', async () => {
  const ledger = JSON.parse(await readFile(new URL('docs/evidence/n4.27r/root-cause-ledger.v1.json', root)));
  assert.equal(ledger.taskCount, 50); assert.equal(ledger.failedTaskCount, 48); assert.equal(ledger.passedTaskCount, 2);
  assert.deepEqual(ledger.primaryCauseCounts, { controlled_fixture_not_connected_to_retrieval:11, false_positive_on_no_result:3, no_candidates_returned:4, passed_correct_no_result:2, target_source_absent_from_all_returned_candidates:30 });
  assert.equal(ledger.sourceArtifacts.finalRunMarker.runCount, 1);
});
