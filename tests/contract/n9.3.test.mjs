import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryPredictionHistoryStore, verifyPredictionHistory } from '../../dist/services/prediction/src/history.js';
import { normalizePredictionMarket } from '../../dist/services/prediction/src/normalization.js';
import {
  aggregatePredictionVenues,
  derivePredictionDisagreementSignals,
  derivePredictionMovementSignals,
} from '../../dist/services/prediction/src/signals.js';

function venue(overrides = {}) {
  return {
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
    outcomes: [{ venueOutcomeId: 'yes', label: 'Yes', price: '0.55' }, { venueOutcomeId: 'no', label: 'No', price: '0.45' }],
    liquidityMicrousd: 100_000_000,
    volumeMicrousd: 500_000_000,
    feeBps: 20,
    observedAt: '2026-08-02T12:00:00.000Z',
    staleAfterMs: 60_000,
    ...overrides,
  };
}

function market(overrides = {}, now = '2026-08-02T12:00:30.000Z') {
  return normalizePredictionMarket(venue(overrides), Date.parse(now));
}

test('prediction history is append-only, hash-linked, replay-safe, bounded, and gated by source history terms', async () => {
  const store = new InMemoryPredictionHistoryStore({ maximumSnapshotsPerMarket: 3, historyAllowedVenues: ['polymarket'] });
  const first = market();
  const second = market({ observedAt: '2026-08-02T12:00:30.000Z', outcomes: [{ venueOutcomeId: 'yes', label: 'Yes', price: '0.60' }, { venueOutcomeId: 'no', label: 'No', price: '0.40' }] }, '2026-08-02T12:00:45.000Z');
  assert.equal((await store.append(first)).replayed, false);
  assert.equal((await store.append(first)).replayed, true);
  assert.equal((await store.append(second)).record.sequence, 2);
  const records = await store.list(first.marketRef);
  assert.equal(verifyPredictionHistory(records), true);
  assert.equal(records[1].previousHash, records[0].recordHash);
  await assert.rejects(store.append(market({ observedAt: '2026-08-02T11:59:59.000Z' })), /out_of_order/u);
  const forbidden = market({ venueId: 'kalshi', venueMarketId: 'KXTEST' });
  await assert.rejects(store.append(forbidden), /terms_unqualified/u);
  assert.equal(verifyPredictionHistory([{ ...records[0], payloadHash: '0'.repeat(64) }]), false);
});

test('movement and liquidity signals require ordered fresh evidence and retain source provenance', () => {
  const previous = market();
  const current = market({
    observedAt: '2026-08-02T12:00:30.000Z',
    outcomes: [{ venueOutcomeId: 'yes', label: 'Yes', price: '0.60' }, { venueOutcomeId: 'no', label: 'No', price: '0.40' }],
    liquidityMicrousd: 125_000_000,
  }, '2026-08-02T12:00:45.000Z');
  const report = derivePredictionMovementSignals(previous, current);
  assert.equal(report.usable, true);
  assert.deepEqual(report.signals.map(({ kind }) => kind), ['probability_movement', 'probability_movement', 'liquidity_change']);
  assert.equal(report.provenance.length, 2);
  const stale = market({ observedAt: '2026-08-02T11:00:00.000Z' }, '2026-08-02T12:00:00.000Z');
  assert.deepEqual(derivePredictionMovementSignals(stale, current).signals, []);
  assert.equal(derivePredictionMovementSignals(stale, current).reason, 'stale');
});

test('cross-venue disagreement signals fail closed on stale or uncertain entity matches', () => {
  const left = market();
  const right = market({
    venueId: 'kalshi',
    venueMarketId: 'KXTEST',
    outcomes: [{ venueOutcomeId: 'yes', label: 'Yes', price: '0.65' }, { venueOutcomeId: 'no', label: 'No', price: '0.35' }],
  });
  const report = derivePredictionDisagreementSignals(left, right);
  assert.equal(report.usable, true);
  assert.equal(report.signals.filter(({ kind }) => kind === 'venue_disagreement').length, 2);
  const unrelated = market({ venueId: 'kalshi', venueMarketId: 'OTHER', question: 'Will something unrelated happen?', resolutionRules: 'Unrelated resolution rules.' });
  assert.equal(derivePredictionDisagreementSignals(left, unrelated).reason, 'identity_mismatch');
});

test('venue outages degrade independently without hiding healthy market data', () => {
  const healthy = market();
  const degraded = aggregatePredictionVenues([
    { venueId: 'polymarket', state: 'available', markets: [healthy] },
    { venueId: 'kalshi', state: 'unavailable', failureCode: 'source_timeout' },
  ]);
  assert.equal(degraded.state, 'degraded');
  assert.equal(degraded.markets.length, 1);
  assert.equal(degraded.venues[1].failureCode, 'source_timeout');
  assert.equal(aggregatePredictionVenues([
    { venueId: 'polymarket', state: 'unavailable', failureCode: 'source_timeout' },
    { venueId: 'kalshi', state: 'unavailable', failureCode: 'source_http_failed' },
  ]).state, 'unavailable');
});
