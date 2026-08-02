import assert from 'node:assert/strict';
import test from 'node:test';

import { PredictionIntelligenceGateway } from '../../dist/services/prediction/src/gateway.js';
import { InMemoryPredictionHistoryStore } from '../../dist/services/prediction/src/history.js';
import { normalizePredictionMarket } from '../../dist/services/prediction/src/normalization.js';

function normalized(venueId, venueMarketId, observedAt, yesPrice) {
  return normalizePredictionMarket({
    venueId,
    venueMarketId,
    question: 'Will the example event happen by 2026?',
    description: 'A recorded gateway fixture.',
    category: 'Technology',
    status: 'open',
    openedAt: '2026-01-01T00:00:00.000Z',
    closesAt: '2026-12-31T23:59:59.000Z',
    resolvedAt: null,
    resolvedOutcomeId: null,
    resolutionRules: 'Resolves Yes if the named event occurs before the closing timestamp.',
    resolutionSourceUrl: 'https://official.example/rules/123',
    marketUrl: `https://markets.example/${venueMarketId}`,
    outcomes: [{ venueOutcomeId: 'yes', label: 'Yes', price: yesPrice }, { venueOutcomeId: 'no', label: 'No', price: (1 - Number(yesPrice)).toFixed(6) }],
    liquidityMicrousd: 100_000_000,
    volumeMicrousd: 500_000_000,
    feeBps: 20,
    observedAt,
    staleAfterMs: 60_000,
  }, Date.parse(observedAt) + 1_000);
}

function source(venueId, values, failure = false) {
  return {
    venueId,
    async discover() {
      if (failure) throw new Error('raw upstream details must not escape');
      return { markets: values, nextCursor: null };
    },
  };
}

test('prediction gateway exposes all five product primitives without introducing trading or custody', async () => {
  const first = normalized('polymarket', 'market-123', '2026-08-02T12:00:00.000Z', '0.55');
  const peer = normalized('kalshi', 'KXTEST', '2026-08-02T12:00:00.000Z', '0.60');
  const history = new InMemoryPredictionHistoryStore({ maximumSnapshotsPerMarket: 10, historyAllowedVenues: ['polymarket'] });
  const gateway = new PredictionIntelligenceGateway({ sources: [source('polymarket', [first]), source('kalshi', [peer])], history });
  const discovered = await gateway.discover({ limit: 10 });
  assert.equal(discovered.state, 'available');
  assert.equal(gateway.market(first.marketRef).venueMarketId, 'market-123');
  assert.equal(gateway.compare(first.marketRef, peer.marketRef).match.decision, 'auto_match');
  assert.equal((await gateway.recordSnapshot(first.marketRef)).sequence, 1);

  const second = normalized('polymarket', 'market-123', '2026-08-02T12:00:30.000Z', '0.65');
  const refreshed = new PredictionIntelligenceGateway({ sources: [source('polymarket', [second])], history });
  await refreshed.discover({ limit: 10 });
  assert.equal((await refreshed.recordSnapshot(second.marketRef)).sequence, 2);
  assert.equal((await refreshed.history(first.marketRef)).length, 2);
  assert.equal((await refreshed.signals(first.marketRef)).usable, true);
  assert.equal((await gateway.signals(first.marketRef, peer.marketRef)).usable, true);
  assert.equal('trade' in gateway || 'sign' in gateway || 'custody' in gateway, false);
});

test('gateway preserves healthy venue data when another venue fails and redacts upstream failures', async () => {
  const market = normalized('polymarket', 'market-123', '2026-08-02T12:00:00.000Z', '0.55');
  const gateway = new PredictionIntelligenceGateway({ sources: [source('polymarket', [market]), source('kalshi', [], true)] });
  const result = await gateway.discover({ query: 'example', limit: 10 });
  assert.equal(result.state, 'degraded');
  assert.equal(result.markets.length, 1);
  assert.equal(result.venues.find(({ venueId }) => venueId === 'kalshi').failureCode, 'source_failed');
  await assert.rejects(gateway.history(market.marketRef), /history_unavailable/u);
});

test('gateway rejects cross-source identity substitution, oversized results, invalid filters, and aborted work', async () => {
  const market = normalized('polymarket', 'market-123', '2026-08-02T12:00:00.000Z', '0.55');
  const substituted = new PredictionIntelligenceGateway({ sources: [source('kalshi', [market])] });
  assert.equal((await substituted.discover({ limit: 10 })).state, 'unavailable');
  const oversized = new PredictionIntelligenceGateway({ sources: [source('polymarket', [market, market])] });
  assert.equal((await oversized.discover({ limit: 1 })).state, 'unavailable');
  await assert.rejects(substituted.discover({ query: '', limit: 10 }), /input_invalid/u);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(substituted.discover({ limit: 10 }, controller.signal), /cancelled/u);
});
