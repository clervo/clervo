import assert from 'node:assert/strict';
import test from 'node:test';

import { comparePredictionMarkets, normalizePredictionMarket, scorePredictionMarketMatch } from '../../dist/services/prediction/src/normalization.js';

const base = {
  venueId: 'polymarket',
  venueMarketId: 'market-123',
  question: 'Will the example event happen by 2026?',
  description: 'A recorded normalization fixture.',
  category: 'Technology',
  status: 'open',
  openedAt: '2026-01-01T00:00:00.000Z',
  closesAt: '2026-12-31T23:59:59.000Z',
  resolvedAt: null,
  resolvedOutcomeId: null,
  resolutionRules: 'Resolves Yes if the named event occurs before the closing timestamp.',
  resolutionSourceUrl: 'https://official.example/rules/123',
  marketUrl: 'https://markets.example/market-123',
  outcomes: [{ venueOutcomeId: 'yes', label: 'Yes', price: '0.55' }, { venueOutcomeId: 'no', label: 'No', price: '0.50' }],
  liquidityMicrousd: 100_000_000,
  volumeMicrousd: 500_000_000,
  feeBps: 20,
  observedAt: '2026-08-02T12:00:00.000Z',
  staleAfterMs: 60_000,
};

test('prediction normalization preserves rules/provenance/freshness and explicitly normalizes visible-price overround', () => {
  const market = normalizePredictionMarket(base, Date.parse('2026-08-02T12:00:30.000Z'));
  assert.match(market.marketRef, /^pmkt_[a-f0-9]{32}$/u);
  assert.equal(market.probability.rawTotalMicrousd, 1_050_000);
  assert.equal(market.probability.overroundMicrousd, 50_000);
  assert.equal(market.outcomes.reduce((sum, { normalizedProbabilityBps }) => sum + normalizedProbabilityBps, 0), 10_000);
  assert.equal(market.freshness.status, 'fresh');
  assert.equal(market.resolution.rules, base.resolutionRules);
  assert.deepEqual(market.provenance.map(({ fieldGroup }) => fieldGroup), ['identity_and_rules', 'market_state_prices_liquidity']);
});

test('prediction normalization fails closed on invalid prices, timelines, resolution, source URLs, and duplicate outcomes', () => {
  assert.throws(() => normalizePredictionMarket({ ...base, outcomes: [{ ...base.outcomes[0], price: '1.01' }, base.outcomes[1]] }, Date.now()), /price_invalid/u);
  assert.throws(() => normalizePredictionMarket({ ...base, openedAt: base.closesAt }, Date.now()), /timeline_invalid/u);
  assert.throws(() => normalizePredictionMarket({ ...base, status: 'resolved' }, Date.now()), /resolution_invalid/u);
  assert.throws(() => normalizePredictionMarket({ ...base, marketUrl: 'http://127.0.0.1/market' }, Date.now()), /market_url_invalid/u);
  assert.throws(() => normalizePredictionMarket({ ...base, outcomes: [base.outcomes[0], { ...base.outcomes[1], label: 'YES' }] }, Date.now()), /outcomes_invalid/u);
});

test('cross-venue matching prevents false merges and comparison exposes probability disagreement and staleness', () => {
  const left = normalizePredictionMarket(base, Date.parse('2026-08-02T12:00:30.000Z'));
  const right = normalizePredictionMarket({ ...base, venueId: 'kalshi', venueMarketId: 'KX-123', outcomes: [{ venueOutcomeId: 'Y', label: 'Yes', price: '0.60' }, { venueOutcomeId: 'N', label: 'No', price: '0.40' }] }, Date.parse('2026-08-02T12:02:00.000Z'));
  assert.equal(scorePredictionMarketMatch(left, right).decision, 'auto_match');
  const comparison = comparePredictionMarkets(left, right);
  assert.ok(comparison.outcomeComparisons.every(({ disagreementBps }) => disagreementBps > 0));
  assert.equal(comparison.stale, true);
  const ambiguous = normalizePredictionMarket({ ...base, venueId: 'kalshi', venueMarketId: 'KX-OTHER', question: 'Will a different event happen?', resolutionRules: 'Different rules apply.' }, Date.parse('2026-08-02T12:00:30.000Z'));
  assert.notEqual(scorePredictionMarketMatch(left, ambiguous).decision, 'auto_match');
  assert.throws(() => comparePredictionMarkets(left, ambiguous), /match_unconfirmed/u);
});
