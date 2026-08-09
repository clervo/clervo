import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PredictionPublicMarketClient, createBoundedPredictionHttpTransport } from '../../dist/adapters/prediction/src/public-market-data.js';
import { createCanonicalPredictionEvent, groupCanonicalPredictionEvents } from '../../dist/services/prediction/src/canonical.js';
import { verifyPredictionHistory } from '../../dist/services/prediction/src/history.js';
import { normalizePredictionMarket, scorePredictionMarketMatch } from '../../dist/services/prediction/src/normalization.js';
import { projectDerivedPredictionMarket } from '../../dist/services/prediction/src/projection.js';
import { PostgresPredictionMarketStore } from '../../apps/api/src/prediction-market-store.mjs';
import { createPredictionProductionRuntime } from '../../apps/api/src/prediction-production-runtime.mjs';
import { normalizePredictionHttpRequest, predictionPublicPricing } from '../../apps/api/src/x402-paid-prediction.mjs';
import { sellablePredictionSources } from '../../apps/api/src/prediction-public-policy.mjs';

function market(overrides = {}, nowOffsetMs = 1_000) {
  const input = {
    venueId: 'polymarket', venueMarketId: 'market-123', question: 'Will the Federal Reserve cut rates by 25 bps in September 2026?',
    description: 'A normalized prediction intelligence fixture.', category: 'Economics', status: 'open', openedAt: '2026-01-01T00:00:00.000Z', closesAt: '2026-09-16T18:00:00.000Z', resolvedAt: null, resolvedOutcomeId: null,
    resolutionRules: 'Resolves Yes if the Federal Reserve target range is cut by at least 25 bps at the September 2026 meeting.', resolutionSourceUrl: 'https://federalreserve.gov/monetarypolicy/fomccalendars.htm', marketUrl: 'https://markets.example/market-123',
    outcomes: [{ venueOutcomeId: 'yes', label: 'Yes', price: '0.55' }, { venueOutcomeId: 'no', label: 'No', price: '0.45' }], liquidityMicrousd: 100_000_000, volumeMicrousd: 500_000_000, feeBps: 20, observedAt: '2026-08-09T12:00:00.000Z', staleAfterMs: 60_000,
    ...overrides,
  };
  return normalizePredictionMarket(input, Date.parse(input.observedAt) + nowOffsetMs);
}

test('canonical event identity is stable across price revisions and safe equivalent venues', () => {
  const first = market();
  const revision = market({ observedAt: '2026-08-09T12:00:30.000Z', outcomes: [{ venueOutcomeId: 'yes', label: 'Yes', price: '0.61' }, { venueOutcomeId: 'no', label: 'No', price: '0.39' }] });
  const peer = market({ venueId: 'kalshi', venueMarketId: 'KXFED-26SEP', marketUrl: 'https://kalshi.com/markets/KXFED-26SEP', outcomes: [{ venueOutcomeId: 'Y', label: 'Yes', price: '0.54' }, { venueOutcomeId: 'N', label: 'No', price: '0.46' }], resolutionRules: 'Resolves Yes when the Federal Reserve cuts its target range at least 25 bps at its September 2026 meeting.' });
  assert.equal(first.marketRef, revision.marketRef);
  assert.notEqual(first.marketRef, peer.marketRef);
  assert.equal(scorePredictionMarketMatch(first, peer).decision, 'auto_match');
  const originalEvent = createCanonicalPredictionEvent([first, peer]);
  const revisedEvent = createCanonicalPredictionEvent([revision, peer]);
  assert.equal(originalEvent.eventRef, revisedEvent.eventRef);
  assert.equal(originalEvent.supportingVenueCount, 2);
  assert.equal(originalEvent.matchDecision, 'auto_match');
  assert.ok(originalEvent.matchEvidence[0].reasons.includes('semantic_anchors_exact'));
  assert.deepEqual(groupCanonicalPredictionEvents([first, peer]), groupCanonicalPredictionEvents([peer, first]));
});

test('matching rejects deceptive threshold, close-window, outcome, polarity, and cancellation differences', () => {
  const base = market();
  const cases = [
    market({ venueId: 'kalshi', venueMarketId: 'threshold', question: base.question.replace('25 bps', '50 bps'), resolutionRules: base.resolution.rules.replaceAll('25 bps', '50 bps') }),
    market({ venueId: 'kalshi', venueMarketId: 'close', closesAt: '2026-09-17T18:00:00.000Z' }),
    market({ venueId: 'kalshi', venueMarketId: 'outcome', outcomes: [{ venueOutcomeId: 'up', label: 'Increase', price: '0.55' }, { venueOutcomeId: 'flat', label: 'No increase', price: '0.45' }] }),
    market({ venueId: 'kalshi', venueMarketId: 'polarity', question: `Will the Federal Reserve not cut rates by 25 bps in September 2026?`, resolutionRules: `Resolves Yes if the Federal Reserve does not cut by at least 25 bps at the September 2026 meeting.` }),
    market({ venueId: 'kalshi', venueMarketId: 'cancel', resolutionRules: `${base.resolution.rules} A cancelled meeting voids the market.` }),
  ];
  for (const candidate of cases) assert.equal(scorePredictionMarketMatch(base, candidate).decision, 'reject');
  assert.equal(groupCanonicalPredictionEvents([base, ...cases]).length, cases.length + 1);
});

test('resolution-authority mismatch stays review-only and cannot form a canonical merge', () => {
  const left = market();
  const right = market({ venueId: 'kalshi', venueMarketId: 'authority', resolutionSourceUrl: 'https://example.net/alternate-authority' });
  assert.equal(scorePredictionMarketMatch(left, right).decision, 'review');
  assert.throws(() => createCanonicalPredictionEvent([left, right]), /match_unconfirmed/u);
  assert.deepEqual(groupCanonicalPredictionEvents([left, right]).map(({ matchDecision }) => matchDecision), ['unresolved', 'unresolved']);
});

test('public market projection is materially derived and preserves evidence without raw feed pass-through', () => {
  const projected = projectDerivedPredictionMarket(market());
  assert.equal(projected.outcomes[0].normalizedProbabilityBps, 5500);
  assert.match(projected.resolution.rulesHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(projected.evidence.length, 2);
  for (const rawField of ['description', 'liquidityMicrousd', 'volumeMicrousd', 'feeBps']) assert.equal(rawField in projected, false);
  assert.equal('rules' in projected.resolution, false);
  assert.equal('rawPriceMicrousd' in projected.outcomes[0], false);
});

function persistentClient(state) {
  return {
    async query(sql, params = []) {
      state.queries.push(sql);
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) || sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes("to_regclass('public.clervo_prediction_markets')")) return { rows: [{ markets: 'clervo_prediction_markets', history: 'clervo_prediction_history' }] };
      if (sql.startsWith('INSERT INTO clervo_prediction_markets')) { state.markets.set(params[0], JSON.parse(params[4])); return { rows: [] }; }
      if (sql.startsWith('SELECT snapshot_json FROM clervo_prediction_markets')) return { rows: state.markets.has(params[0]) ? [{ snapshot_json: state.markets.get(params[0]) }] : [] };
      if (sql.startsWith('INSERT INTO clervo_prediction_history')) {
        const rows = state.history.get(params[0]) ?? [];
        rows.push({ sequence: params[1], observed_at: params[2], previous_hash: params[3], payload_hash: params[4], record_hash: params[5], snapshot_json: JSON.parse(params[6]) });
        state.history.set(params[0], rows); return { rows: [] };
      }
      if (sql.startsWith('DELETE FROM clervo_prediction_history')) { state.history.set(params[0], (state.history.get(params[0]) ?? []).filter(({ sequence }) => sequence > params[1])); return { rows: [] }; }
      if (sql.includes('FROM clervo_prediction_history') && sql.includes('ORDER BY sequence DESC LIMIT 1')) return { rows: [...(state.history.get(params[0]) ?? [])].sort((a, b) => b.sequence - a.sequence).slice(0, 1) };
      if (sql.includes('FROM clervo_prediction_history') && sql.includes('ORDER BY sequence DESC LIMIT $2')) return { rows: [...(state.history.get(params[0]) ?? [])].sort((a, b) => b.sequence - a.sequence).slice(0, params[1]) };
      if (sql.includes('FROM clervo_prediction_history') && sql.includes('sequence > $2')) return { rows: (state.history.get(params[0]) ?? []).filter(({ sequence }) => sequence > params[1]).sort((a, b) => a.sequence - b.sequence).slice(0, params[2]) };
      throw new Error(`unexpected_sql:${sql}`);
    },
  };
}

test('PostgreSQL history reconstructs after restart, retains a verifiable bounded segment, and returns the actual latest observations', async () => {
  const state = { markets: new Map(), history: new Map(), queries: [] };
  const firstStore = new PostgresPredictionMarketStore(persistentClient(state), { maximumSnapshotsPerMarket: 2 });
  const snapshots = [
    market(),
    market({ observedAt: '2026-08-09T12:00:30.000Z', outcomes: [{ venueOutcomeId: 'yes', label: 'Yes', price: '0.58' }, { venueOutcomeId: 'no', label: 'No', price: '0.42' }] }),
    market({ observedAt: '2026-08-09T12:01:00.000Z', outcomes: [{ venueOutcomeId: 'yes', label: 'Yes', price: '0.62' }, { venueOutcomeId: 'no', label: 'No', price: '0.38' }] }),
  ];
  for (const snapshot of snapshots) await firstStore.append(snapshot);
  const restarted = new PostgresPredictionMarketStore(persistentClient(state), { maximumSnapshotsPerMarket: 2 });
  assert.equal(await restarted.ready(), true);
  assert.equal((await restarted.get(snapshots[0].marketRef)).observedAt, snapshots[2].observedAt);
  const retained = await restarted.list(snapshots[0].marketRef);
  assert.deepEqual(retained.map(({ sequence }) => sequence), [2, 3]);
  assert.equal(verifyPredictionHistory(retained), true);
  assert.deepEqual((await restarted.latest(snapshots[0].marketRef, 2)).map(({ observedAt }) => observedAt), [snapshots[1].observedAt, snapshots[2].observedAt]);
  assert.ok(state.queries.some((sql) => sql.includes('pg_advisory_xact_lock')));
  assert.equal((await restarted.append(snapshots[2])).replayed, true);
});

test('source and public policy fail closed while commercial permission is unresolved', () => {
  assert.throws(() => sellablePredictionSources({ schemaVersion: 'clervo.prediction-source-routes.v1', customerRoutingEnabled: false, sources: [{ venueId: 'polymarket', technicalQualification: 'qualified', commercialPermission: 'unresolved', publicSellable: false, customerRoutingEnabled: false }] }), /unapproved/u);
  assert.throws(() => sellablePredictionSources({ schemaVersion: 'clervo.prediction-source-routes.v1', customerRoutingEnabled: true, sources: [{ venueId: 'polymarket', technicalQualification: 'qualified', technicalObservedAt: '2026-08-01T00:00:00.000Z', technicalExpiresAt: '2026-08-08T00:00:00.000Z', commercialPermission: 'approved', publicSellable: true, customerRoutingEnabled: true }] }, Date.parse('2026-08-09T00:00:00.000Z')), /unapproved/u);
  assert.throws(() => createPredictionProductionRuntime({ store: { durable: true, ready() {}, put() {}, get() {}, append() {}, list() {} } }), /unapproved/u);
});

test('search is a compatibility alias for prediction.markets and every public amount follows the sustainable floor', () => {
  const search = normalizePredictionHttpRequest({ kind: 'search', query: 'September Fed cut', status: 'open', limit: 3 });
  const markets = normalizePredictionHttpRequest({ kind: 'markets', query: 'September Fed cut', status: 'open', limit: 3 });
  assert.deepEqual(search, markets);
  for (const [kind, input] of Object.entries({ markets: { kind: 'markets', limit: 3 }, market: { kind: 'market', marketRef: `pmkt_${'a'.repeat(32)}` }, compare: { kind: 'compare', marketRefs: [`pmkt_${'a'.repeat(32)}`, `pmkt_${'b'.repeat(32)}`] }, history: { kind: 'history', marketRef: `pmkt_${'a'.repeat(32)}`, limit: 10 }, signal: { kind: 'signal', marketRef: `pmkt_${'a'.repeat(32)}` } })) {
    const pricing = predictionPublicPricing(normalizePredictionHttpRequest(input));
    assert.ok(BigInt(pricing.maximumCharge.amountAtomic) >= 1_000n, kind);
    assert.ok(BigInt(pricing.maximumCharge.amountAtomic) > BigInt(pricing.supplierCost.amountAtomic), kind);
  }
});

test('competitive pricing evidence is dated, confidence-labelled, and supports the implemented price-to-win position', () => {
  const evidence = JSON.parse(readFileSync(new URL('../../packages/catalog/prediction-competitor-price-evidence.v1.json', import.meta.url), 'utf8'));
  assert.equal(evidence.schemaVersion, 'clervo.prediction-competitor-price-evidence.v1');
  assert.ok(Number.isFinite(Date.parse(evidence.observedAt)));
  assert.ok(evidence.evidence.length >= 5);
  for (const item of evidence.evidence) {
    assert.match(item.sourceUrl, /^https:\/\//u);
    assert.ok(['PROVEN', 'INFERRED', 'UNVERIFIED', 'UNKNOWN'].includes(item.confidence));
  }
  const blockRun = evidence.evidence.find(({ competitor, capability, confidence }) => competitor === 'BlockRun / Predexon' && capability.includes('search') && confidence === 'PROVEN');
  assert.equal(blockRun.priceMicrousd, 8_500);
  assert.ok(BigInt(predictionPublicPricing(normalizePredictionHttpRequest({ kind: 'search', query: 'Fed', limit: 1 })).maximumCharge.amountAtomic) < BigInt(blockRun.priceMicrousd));
});

test('bounded source client rejects private origins, credentials, redirects, oversized bodies, timeouts, malformed JSON, and path traversal', async () => {
  const config = { sourceId: 'future_venue', origin: 'https://data.example', allowedPathPrefix: '/markets', maximumResponseBytes: 1_024, timeoutMs: 100, staleAfterMs: 60_000 };
  assert.throws(() => new PredictionPublicMarketClient({ config: { ...config, origin: 'https://127.0.0.1' }, transport: { request() {} } }), /endpoint_invalid/u);
  assert.throws(() => new PredictionPublicMarketClient({ config: { ...config, origin: 'https://user:pass@data.example' }, transport: { request() {} } }), /endpoint_invalid/u);
  const transport = createBoundedPredictionHttpTransport(async (_url, init) => {
    assert.equal(init.redirect, 'error');
    return new Response(new Uint8Array(2_048), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const oversized = new PredictionPublicMarketClient({ config, transport });
  await assert.rejects(oversized.get('/markets'), /transport_failed/u);
  await assert.rejects(oversized.get('/markets/../private'), /endpoint_invalid/u);
  const malformed = new PredictionPublicMarketClient({ config, transport: { async request() { return { status: 200, contentType: 'application/json', body: new TextEncoder().encode('{bad') }; } } });
  await assert.rejects(malformed.get('/markets'), /response_invalid/u);
  const timeout = new PredictionPublicMarketClient({ config, transport: { request({ signal }) { return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); } } });
  await assert.rejects(timeout.get('/markets'), /transport_failed/u);
});

test('query discovery scans bounded pages and returns honest empty or matching canonical projections', async () => {
  const store = { durable: true, maximumSnapshotsPerMarket: 10, values: new Map(), async ready() { return true; }, async put(value) { this.values.set(value.marketRef, value); }, async get(ref) { return this.values.get(ref); }, async append(value) { return { replayed: false, record: { sequence: 1, snapshot: value } }; }, async list() { return []; }, async latest() { return []; } };
  const sourceRegistry = { schemaVersion: 'clervo.prediction-source-routes.v1', customerRoutingEnabled: true, sources: [{ venueId: 'polymarket', qualificationId: 'qual_PolymarketPublicData20260809', technicalQualification: 'qualified', technicalObservedAt: '2026-08-01T00:00:00.000Z', technicalExpiresAt: '2026-08-16T00:00:00.000Z', commercialPermission: 'approved', publicSellable: true, customerRoutingEnabled: true, historyPermission: 'approved' }] };
  let calls = 0;
  const base = { id: 'base', question: 'Unrelated sports market', description: 'Resolves from an official score.', category: 'Sports', active: true, closed: false, startDate: '2026-01-01T00:00:00Z', endDate: '2026-09-16T18:00:00Z', resolutionSource: 'https://official.example/rules', outcomes: '["Yes","No"]', outcomePrices: '["0.5","0.5"]', slug: 'unrelated', umaResolutionStatus: 'proposed' };
  const runtime = createPredictionProductionRuntime({ store, sourceRegistry, now: () => Date.parse('2026-08-09T12:00:00.000Z'), async fetcher(input) {
    calls += 1;
    const offset = Number(new URL(input).searchParams.get('offset'));
    if (offset === 0) return Response.json(Array.from({ length: 20 }, (_, index) => ({ ...base, id: `u${index}`, slug: `u${index}` })));
    return Response.json([{ ...base, id: 'fed', slug: 'fed', question: 'Will the Federal Reserve cut rates in September?', description: 'September Fed cut market.' }]);
  } });
  const completed = await runtime.execute({ operationId: `op_${'a'.repeat(32)}`, productId: 'prediction.markets', input: { kind: 'markets', query: 'September Fed cut', limit: 1 }, deadlineAt: '2026-08-09T12:00:30.000Z' });
  assert.equal(calls, 2);
  assert.equal(completed.result.output.markets.length, 1);
  assert.equal(completed.result.output.events.length, 1);
  assert.equal(completed.result.output.events[0].matchDecision, 'unresolved');
});

test('production discovery obeys the operation deadline and aborts a stalled upstream', async () => {
  const store = { durable: true, async ready() { return true; }, async put() {}, async get() {}, async append() {}, async list() { return []; }, async latest() { return []; } };
  const sourceRegistry = { schemaVersion: 'clervo.prediction-source-routes.v1', customerRoutingEnabled: true, sources: [{ venueId: 'polymarket', qualificationId: 'qual_PolymarketPublicData20260809', technicalQualification: 'qualified', technicalObservedAt: '2026-08-01T00:00:00.000Z', technicalExpiresAt: '2026-08-16T00:00:00.000Z', commercialPermission: 'approved', publicSellable: true, customerRoutingEnabled: true, historyPermission: 'approved' }] };
  const runtime = createPredictionProductionRuntime({ store, sourceRegistry, now: () => Date.parse('2026-08-09T12:00:00.000Z'), fetcher(_input, init) { return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); } });
  const started = performance.now();
  await assert.rejects(runtime.execute({ operationId: `op_${'d'.repeat(32)}`, productId: 'prediction.markets', input: { kind: 'markets', limit: 1 }, deadlineAt: '2026-08-09T12:00:00.020Z' }), /deadline_exceeded/u);
  assert.ok(performance.now() - started < 500);
});
