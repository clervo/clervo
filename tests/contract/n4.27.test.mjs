import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  FOCUSED_INDEX_ADAPTER_ID, FOCUSED_INDEX_PROVIDER_ID, FOCUSED_INDEX_ROUTE_ID,
  LIVE_FEDERATION_ROUTE_ID, connectedRankingProfiles, rankConnectedEvidence,
} from '../../dist/packages/contracts/src/index.js';
import { ConnectedRetrievalPipeline, focusedConnectedIdentity, liveConnectedIdentity } from '../../dist/services/search/src/connected-retrieval.js';
import { LiveFederationCircuit } from '../../dist/services/search/src/live-federation.js';
import { loadStage4ExitInputs } from '../../scripts/verify-stage4-exit.mjs';

const root = new URL('../../', import.meta.url);
const now = '2026-07-31T18:30:00.000Z';
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
function evidence(routeId, url, title, text, relevanceScore = 50, authorityScore = 80) {
  const focused = routeId === FOCUSED_INDEX_ROUTE_ID;
  return { routeId, providerId: focused ? FOCUSED_INDEX_PROVIDER_ID : 'provider_wikimedia_action_api_v1', adapterId: focused ? FOCUSED_INDEX_ADAPTER_ID : 'adapter_wikimedia_action_api_v1', url, title, evidenceText: text, retrievedAt: now,
    authorityScore, relevanceScore, language: 'en', region: 'US', attribution: { sourceId: focused ? 'focused_index' : 'wikimedia', sourceName: 'source', sourceUrl: url, license: 'approved', notice: 'retain' },
    extraction: { fetchId: `fetch_${hash(url).slice(7, 39)}`, extractionId: `extract_${hash(text).slice(7, 39)}`, sourceBodySha256: hash(text), normalizedTextSha256: hash(text), instructionHandling: 'untrusted_data_only', renderMode: 'static', crawl4aiStatus: 'not_used' } };
}
function adapter(identity, outputs, calls = []) { return { identity, async search(request) { calls.push(request.query); return outputs; } }; }

test('holdout corpus, labels, rules and source dates remain frozen before tuning', async () => {
  const manifest = JSON.parse(await readFile(new URL('benchmarks/n4.27/freeze-manifest.v1.json', root)));
  for (const artifact of Object.values(manifest.artifacts)) assert.equal(hash(await readFile(new URL(artifact.path, root))), artifact.sha256);
  const corpus = JSON.parse(await readFile(new URL('benchmarks/n4.27/holdout-corpus.v1.json', root)));
  const labels = JSON.parse(await readFile(new URL('benchmarks/n4.27/holdout-labels.v1.json', root)));
  assert.equal(corpus.tasks.length, 50); assert.equal(labels.labels.length, 50);
  assert.deepEqual(Object.fromEntries(Object.entries(Object.groupBy(corpus.tasks, (task) => task.family)).map(([family, tasks]) => [family, tasks.length]).sort()), { commerce_marketplaces:10, company_competitive:10, developer_agent_retrieval:10, property_local_markets:10, research_evidence:10 });
  assert.equal(corpus.tasks.filter((task) => task.features.includes('javascript_required')).length >= 5, true);
  assert.equal(corpus.tasks.some((task) => task.features.includes('hostile_instruction')), true);
  assert.equal(manifest.querySpecificTuningAllowed, false);
});

test('N4.26 loss ledger explains every simple-to-combined relevant-result loss', async () => {
  const ledger = JSON.parse(await readFile(new URL('docs/evidence/n4.27/n426-regression-loss-ledger.v1.json', root)));
  assert.equal(ledger.lossCount, 28); assert.equal(ledger.unexplainedLosses, 0);
  assert.deepEqual(ledger.classifications, { extraction_failure: 3, relevance_score_too_low: 25 });
  assert.ok(ledger.losses.every((loss) => loss.deduplication.decision === 'retained_not_removed' && loss.expectedDisposition.startsWith('retain')));
});

test('calibrated ranking is query-sensitive and no longer favors canonical URL order', () => {
  const ranked = rankConnectedEvidence({ query: 'model context protocol tools', verticalProfile: 'developer_documentation', now, maximumResults: 3, nearDuplicateThresholdBasisPoints: 8_500, evidence: [
    evidence(FOCUSED_INDEX_ROUTE_ID, 'https://a.example/irrelevant', 'Alphabetically first', 'unrelated generic page', 80),
    evidence(FOCUSED_INDEX_ROUTE_ID, 'https://z.example/mcp', 'Model Context Protocol tools', 'Official model context protocol tools specification', 80, 95),
  ] });
  assert.equal(ranked.results[0].canonicalUrl, 'https://z.example/mcp');
  assert.ok(ranked.results[0].score.relevance > ranked.results[1].score.relevance);
});

test('dedup retains the strongest representative and preserves distinct sellers', () => {
  const weak = evidence(FOCUSED_INDEX_ROUTE_ID, 'https://shop.example/canonical?utm_source=x', 'Generic product', 'same exact normalized product body', 30, 60);
  const strong = evidence(LIVE_FEDERATION_ROUTE_ID, 'https://shop.example/canonical', 'Exact Product Official', 'same exact normalized product body', 90, 95);
  const seller = evidence(LIVE_FEDERATION_ROUTE_ID, 'https://seller.example/offer', 'Exact Product Seller B', 'same exact normalized product body', 85, 80);
  const ranked = rankConnectedEvidence({ query: 'exact product', verticalProfile: 'commerce', now, maximumResults: 10, nearDuplicateThresholdBasisPoints: 8_500, evidence: [weak, strong, seller] });
  assert.equal(ranked.exactDuplicateCount, 1);
  assert.equal(ranked.results.some((result) => result.providerId === strong.providerId && result.hostname === 'shop.example'), true);
  assert.equal(ranked.results.some((result) => result.hostname === 'seller.example'), true);
});

test('six vertical profiles are explicit, version-stable and sum to 100 percent', () => {
  assert.deepEqual(Object.keys(connectedRankingProfiles).sort(), ['commerce','companies','developer_documentation','generic_fallback','property','research']);
  for (const profile of Object.values(connectedRankingProfiles)) assert.equal(profile.relevanceWeight + profile.authorityWeight + profile.freshnessWeight + profile.diversityWeight, 100);
});

test('fast, balanced and thorough operating profiles have deterministic route behavior', async () => {
  const focusedCalls = [], liveCalls = [];
  const pipeline = new ConnectedRetrievalPipeline({ focused: adapter(focusedConnectedIdentity, [evidence(FOCUSED_INDEX_ROUTE_ID, 'https://focused.example/a', 'Focused result', 'focused result')], focusedCalls), live: adapter(liveConnectedIdentity, [evidence(LIVE_FEDERATION_ROUTE_ID, 'https://live.example/a', 'Live result', 'live result')], liveCalls) });
  const common = { operationId:'op_01K1N427PROFILE0000001', query:'profile retrieval', language:'en', region:'US', maximumResults:10, generatedAt:now, deadlineMs:10_000 };
  const fast = await pipeline.searchWeb({ ...common, operatingProfile:'fast' });
  assert.equal(fast.status, 'degraded'); assert.equal(fast.attempts[1].failureCode, 'fast_profile_live_route_skipped'); assert.equal(liveCalls.length, 0);
  await pipeline.searchWeb({ ...common, operatingProfile:'balanced' }); assert.equal(liveCalls.length, 1);
  await pipeline.searchWeb({ ...common, operatingProfile:'thorough' }); assert.equal(liveCalls.length, 3); assert.equal(focusedCalls.length, 4);
});

test('live circuit performs one half-open probe and restores after success', () => {
  let clock = 0; const circuit = new LiveFederationCircuit(2, 1_000, () => clock);
  circuit.failure(); circuit.failure(); assert.equal(circuit.state.status, 'open'); assert.throws(() => circuit.acquire(), /circuit_open/u);
  clock = 1_000; assert.equal(circuit.state.status, 'half_open'); circuit.acquire(); assert.throws(() => circuit.acquire(), /probe_in_flight/u);
  circuit.success(); assert.equal(circuit.state.status, 'closed'); assert.equal(circuit.state.consecutiveFailures, 0);
});

test('single final holdout run is frozen and truthfully fails mandatory gates', async () => {
  const marker = JSON.parse(await readFile(new URL('benchmarks/n4.27/holdout-final-run.v1.json', root)));
  const scorecard = JSON.parse(await readFile(new URL('docs/evidence/n4.27/holdout-final/scorecard.v1.json', root)));
  assert.equal(marker.runCount, 1); assert.equal(marker.mandatoryGatePass, false);
  assert.equal(scorecard.mandatoryGatePass, false);
  assert.equal(scorecard.scorecards.repaired_balanced.recall, 0.04);
  assert.equal(scorecard.scorecards.repaired_balanced.nDCG10, 0);
  assert.equal(scorecard.scorecards.repaired_balanced.latencyMs.runs, 3);
});

test('browser, commerce and claim evidence fail closed after prerequisite failures', async () => {
  const browser = JSON.parse(await readFile(new URL('docs/evidence/n4.27/browser-runtime-qualification.v1.json', root)));
  const commerce = JSON.parse(await readFile(new URL('docs/evidence/n4.27/mock-x402-gate.v1.json', root)));
  const claim = JSON.parse(await readFile(new URL('docs/evidence/n4.27/claim-decision.v1.json', root)));
  assert.equal(browser.qualification.attemptedConsecutiveRuns, 20);
  assert.equal(browser.qualification.successfulJavascriptRuns, 18);
  assert.equal(browser.mandatoryGatePass, false);
  assert.equal(commerce.executionStarted, false); assert.equal(commerce.realUsdcSpent, 0);
  assert.equal(claim.ticketResult, 'blocked'); assert.equal(claim.stage5Authorized, false);
  assert.equal(claim.referencePatternAuthorized, false);
});

test('N4.27 closure hash-binds the blocked result without promoting a Stage 4 check', async () => {
  const inputs = await loadStage4ExitInputs(new URL('../..', import.meta.url).pathname);
  assert.equal(inputs.sourceBinding.latestArtifactCount, 23);
  assert.equal(inputs.sourceBinding.latestBinding.remainingBlockers.length, 10);
  assert.equal(inputs.sourceBinding.latestBinding.holdoutFinalRunCount, 1);
  assert.equal(inputs.sourceBinding.latestBinding.mockX402Executed, false);
  assert.equal(inputs.sourceBinding.latestBinding.activeComputeUsdPerDay, 0);
  assert.equal(inputs.sourceBinding.latestBinding.usdcSpent, 0);
  assert.equal(inputs.evidence.decision, 'blocked');
  assert.equal(inputs.evidence.referencePatternAuthorized, false);
  assert.equal(inputs.evidence.stage5Authorized, false);
});
