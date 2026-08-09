import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PredictionPublicMarketClient,
  parseKalshiMarket,
  parsePdataMarket,
  parsePolymarketGammaMarket,
} from '../../dist/adapters/prediction/src/public-market-data.js';
import { normalizePredictionMarket } from '../../dist/services/prediction/src/normalization.js';

const observedAt = '2026-08-02T12:00:00.000Z';

test('Polymarket Gamma fixture preserves explicit market rules, outcome prices, money fields, and provenance', () => {
  const sourceUrl = 'https://gamma-api.polymarket.com/markets/123';
  const venue = parsePolymarketGammaMarket({
    id: '123',
    question: 'Will the example launch happen?',
    description: 'Resolves Yes if the public launch occurs before the close time.',
    category: 'Technology',
    active: true,
    closed: false,
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    resolutionSource: 'https://official.example/launch',
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.55","0.45"]',
    liquidityNum: 123.456789,
    volumeNum: 4567.89,
    fee: 0.02,
    slug: 'example-launch',
    umaResolutionStatus: 'proposed',
  }, { sourceUrl, observedAt, staleAfterMs: 60_000 });
  const normalized = normalizePredictionMarket(venue, Date.parse('2026-08-02T12:00:30.000Z'));
  assert.equal(normalized.venueId, 'polymarket');
  assert.deepEqual(normalized.outcomes.map(({ rawPriceMicrousd }) => rawPriceMicrousd), [550_000, 450_000]);
  assert.equal(normalized.liquidityMicrousd, 123_456_789);
  assert.equal(normalized.volumeMicrousd, 4_567_890_000);
  assert.equal(normalized.resolution.sourceUrl, 'https://official.example/launch');
});

test('Kalshi fixture derives a visible midpoint without misrepresenting deprecated liquidity or contract volume as USD', () => {
  const sourceUrl = 'https://api.elections.kalshi.com/trade-api/v2/markets/KXTEST-26';
  const venue = parseKalshiMarket({
    ticker: 'KXTEST-26',
    event_ticker: 'KXTEST',
    title: 'Will the example launch happen?',
    subtitle: 'A binary launch market.',
    category: 'Technology',
    rules_primary: 'Resolves Yes if the public launch occurs before the close time.',
    rules_secondary: 'The named official announcement is controlling.',
    status: 'open',
    open_time: '2026-01-01T00:00:00Z',
    close_time: '2026-12-31T23:59:59Z',
    yes_bid_dollars: '0.54',
    yes_ask_dollars: '0.56',
    last_price_dollars: '0.53',
    liquidity_dollars: '9999.00',
    volume_fp: '100000',
  }, { sourceUrl, observedAt, staleAfterMs: 60_000 });
  const normalized = normalizePredictionMarket(venue, Date.parse('2026-08-02T12:00:30.000Z'));
  assert.deepEqual(normalized.outcomes.map(({ rawPriceMicrousd }) => rawPriceMicrousd), [550_000, 450_000]);
  assert.equal(normalized.liquidityMicrousd, null);
  assert.equal(normalized.volumeMicrousd, null);
  assert.match(normalized.resolution.rules, /official announcement/u);
});

test('public market client enforces exact origin/path, bounded JSON, content type, and transport failure isolation', async () => {
  const calls = [];
  const client = new PredictionPublicMarketClient({
    config: {
      sourceId: 'polymarket_gamma',
      origin: 'https://gamma-api.polymarket.com',
      allowedPathPrefix: '/markets',
      maximumResponseBytes: 4096,
      timeoutMs: 1_000,
      staleAfterMs: 60_000,
    },
    transport: {
      async request(input) {
        calls.push(input);
        return { status: 200, contentType: 'application/json; charset=utf-8', body: new TextEncoder().encode('{"ok":true}') };
      },
    },
  });
  assert.deepEqual(await client.get('/markets', { limit: '10', next_cursor: 'abc' }), { ok: true });
  assert.equal(new URL(calls[0].url).hostname, 'gamma-api.polymarket.com');
  await assert.rejects(client.get('/events'), /endpoint_invalid/u);

  const badJson = new PredictionPublicMarketClient({
    config: {
      sourceId: 'kalshi_market_data',
      origin: 'https://api.elections.kalshi.com',
      allowedPathPrefix: '/trade-api/v2/markets',
      maximumResponseBytes: 4096,
      timeoutMs: 1_000,
      staleAfterMs: 60_000,
    },
    transport: { async request() { return { status: 200, contentType: 'text/html', body: new TextEncoder().encode('{}') }; } },
  });
  await assert.rejects(badJson.get('/trade-api/v2/markets'), /http_failed/u);
});

test('source parsing fails closed on missing rules, crossed prices, invalid resolution, and internal source URLs', () => {
  const base = {
    ticker: 'KXTEST-26',
    title: 'Will the example launch happen?',
    rules_primary: 'Public rules.',
    status: 'open',
    close_time: '2026-12-31T23:59:59Z',
    yes_bid_dollars: '0.60',
    yes_ask_dollars: '0.50',
  };
  assert.throws(() => parseKalshiMarket(base, { sourceUrl: 'https://api.elections.kalshi.com/trade-api/v2/markets/KXTEST-26', observedAt, staleAfterMs: 60_000 }), /response_invalid/u);
  assert.throws(() => parseKalshiMarket({ ...base, yes_bid_dollars: '0.50', yes_ask_dollars: '0.60' }, { sourceUrl: 'http://127.0.0.1/market', observedAt, staleAfterMs: 60_000 }), /endpoint_invalid/u);
  assert.throws(() => parseKalshiMarket({ ...base, status: 'settled', yes_bid_dollars: '0.50', yes_ask_dollars: '0.60', result: 'void', settlement_ts: observedAt }, { sourceUrl: 'https://api.elections.kalshi.com/trade-api/v2/markets/KXTEST-26', observedAt, staleAfterMs: 60_000 }), /response_invalid/u);
});

test('pdata fixtures preserve all eight venue identities, actual freshness, upstream provenance, and CC BY attribution without raw pass-through', () => {
  const base = {
    id: 'market-123', event_id: 'event-123', question: 'Will the example launch happen?', description: 'Resolves Yes if https://official.example/launch confirms the launch.',
    outcomes: ['Yes', 'No'], outcome_prices: [0.55, 0.45], active: true, closed: false,
    start_date: '2026-01-01T00:00:00Z', end_date: '2026-12-31T23:59:59Z', closed_time: null,
    volume: 4567.89, liquidity: 123.456789, categories: ['Technology'], fetched_at: observedAt,
    url: 'https://upstream.example/market-123',
  };
  for (const source of ['polymarket', 'kalshi', 'manifold', 'myriad', 'limitless', 'predict', 'opinion', 'gemini']) {
    const normalized = normalizePredictionMarket(parsePdataMarket({ ...base, source }, { apiUrl: `https://api.pdata.world/api/v1/markets?source=${source}`, staleAfterMs: 3_600_000 }), Date.parse('2026-08-02T12:30:00.000Z'));
    assert.equal(normalized.venueId, source);
    assert.equal(normalized.observedAt, observedAt);
    assert.equal(normalized.marketUrl, `https://pdata.world/markets/${source}/market-123`);
    assert.equal(normalized.resolution.sourceUrl, 'https://official.example/launch');
    assert.equal(normalized.supplyAttributions[0].license, 'CC BY 4.0');
    assert.equal(normalized.supplyAttributions[0].modified, true);
    assert.match(normalized.supplyAttributions[0].notice, /Normalized and transformed by Clervo/u);
    assert.ok(normalized.provenance.some(({ fieldGroup, sourceUrl }) => fieldGroup === 'licensed_supply_attribution' && sourceUrl === 'https://pdata.world/data'));
    if (source === 'manifold') assert.equal(normalized.volumeMicrousd, null);
  }
  assert.throws(() => parsePdataMarket({ ...base, source: 'unknown' }, { apiUrl: 'https://api.pdata.world/api/v1/markets', staleAfterMs: 3_600_000 }), /response_invalid/u);
});
