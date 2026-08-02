#!/usr/bin/env node

import {
  PredictionPublicMarketClient,
  createBoundedPredictionHttpTransport,
  parseKalshiMarket,
  parsePolymarketGammaMarket,
} from '../../dist/adapters/prediction/src/public-market-data.js';
import { normalizePredictionMarket } from '../../dist/services/prediction/src/normalization.js';

const evaluatedAt = new Date().toISOString();
const transport = createBoundedPredictionHttpTransport();

const polymarketClient = new PredictionPublicMarketClient({
  config: {
    sourceId: 'polymarket_gamma',
    origin: 'https://gamma-api.polymarket.com',
    allowedPathPrefix: '/markets',
    maximumResponseBytes: 1_048_576,
    timeoutMs: 10_000,
    staleAfterMs: 60_000,
  },
  transport,
});
const kalshiClient = new PredictionPublicMarketClient({
  config: {
    sourceId: 'kalshi_market_data',
    origin: 'https://api.elections.kalshi.com',
    allowedPathPrefix: '/trade-api/v2/markets',
    maximumResponseBytes: 1_048_576,
    timeoutMs: 10_000,
    staleAfterMs: 60_000,
  },
  transport,
});

const polymarketList = await polymarketClient.get('/markets', { limit: '1', active: 'true', closed: 'false' });
if (!Array.isArray(polymarketList) || polymarketList.length !== 1 || polymarketList[0] === null || typeof polymarketList[0] !== 'object') throw new Error('prediction_polymarket_live_shape_invalid');
const polymarketId = Reflect.get(polymarketList[0], 'id');
if (typeof polymarketId !== 'string') throw new Error('prediction_polymarket_live_shape_invalid');
const polymarket = normalizePredictionMarket(parsePolymarketGammaMarket(polymarketList[0], {
  sourceUrl: `https://gamma-api.polymarket.com/markets/${encodeURIComponent(polymarketId)}`,
  observedAt: evaluatedAt,
  staleAfterMs: 60_000,
}), Date.now());

const kalshiList = await kalshiClient.get('/trade-api/v2/markets', { limit: '1', status: 'open' });
if (kalshiList === null || typeof kalshiList !== 'object' || !Array.isArray(Reflect.get(kalshiList, 'markets')) || Reflect.get(kalshiList, 'markets').length !== 1) throw new Error('prediction_kalshi_live_shape_invalid');
const kalshiRaw = Reflect.get(kalshiList, 'markets')[0];
const kalshiId = Reflect.get(kalshiRaw, 'ticker');
if (typeof kalshiId !== 'string') throw new Error('prediction_kalshi_live_shape_invalid');
const kalshi = normalizePredictionMarket(parseKalshiMarket(kalshiRaw, {
  sourceUrl: `https://api.elections.kalshi.com/trade-api/v2/markets/${encodeURIComponent(kalshiId)}`,
  observedAt: evaluatedAt,
  staleAfterMs: 60_000,
}), Date.now());

const result = {
  schemaVersion: 'clervo.prediction-live-conformance.v1',
  evaluatedAt,
  externalCalls: 2,
  ownerCashSpentUsd: 0,
  sources: [polymarket, kalshi].map((market) => ({
    venueId: market.venueId,
    technicalStatus: 'passed',
    marketStatus: market.status,
    outcomeCount: market.outcomes.length,
    quotedOutcomeCount: market.probability.quotedOutcomeCount,
    freshness: market.freshness.status,
    resolutionRulesPresent: market.resolution.rules.length > 0,
    resolutionLinkPresent: market.resolution.sourceUrl.startsWith('https://'),
    liquidityBasis: market.liquidityMicrousd === null ? 'unavailable' : 'usd',
  })),
};

console.log(JSON.stringify(result, null, 2));
