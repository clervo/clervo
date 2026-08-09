#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

import {
  PredictionPublicMarketClient,
  createBoundedPredictionHttpTransport,
  parseKalshiMarket,
  parsePolymarketGammaMarket,
} from '../../dist/adapters/prediction/src/public-market-data.js';
import { normalizePredictionMarket } from '../../dist/services/prediction/src/normalization.js';

const evaluatedAt = new Date().toISOString();
const transport = createBoundedPredictionHttpTransport();
const repeatedCalls = 3;

const sources = [
  {
    venueId: 'polymarket',
    client: new PredictionPublicMarketClient({ config: { sourceId: 'polymarket_gamma', origin: 'https://gamma-api.polymarket.com', allowedPathPrefix: '/markets', maximumResponseBytes: 1_048_576, timeoutMs: 10_000, staleAfterMs: 60_000 }, transport }),
    async call(client) {
      const raw = await client.get('/markets', { limit: '1', active: 'true', closed: 'false' });
      if (!Array.isArray(raw) || raw.length !== 1 || raw[0] === null || typeof raw[0] !== 'object' || typeof raw[0].id !== 'string') throw new Error('prediction_polymarket_live_shape_invalid');
      const observedAt = new Date().toISOString();
      return normalizePredictionMarket(parsePolymarketGammaMarket(raw[0], { sourceUrl: `https://gamma-api.polymarket.com/markets/${encodeURIComponent(raw[0].id)}`, observedAt, staleAfterMs: 60_000 }), Date.now());
    },
  },
  {
    venueId: 'kalshi',
    client: new PredictionPublicMarketClient({ config: { sourceId: 'kalshi_market_data', origin: 'https://external-api.kalshi.com', allowedPathPrefix: '/trade-api/v2/markets', maximumResponseBytes: 1_048_576, timeoutMs: 10_000, staleAfterMs: 60_000 }, transport }),
    async call(client) {
      const raw = await client.get('/trade-api/v2/markets', { limit: '1', status: 'open' });
      if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.markets) || raw.markets.length !== 1 || typeof raw.markets[0]?.ticker !== 'string') throw new Error('prediction_kalshi_live_shape_invalid');
      const observedAt = new Date().toISOString();
      return normalizePredictionMarket(parseKalshiMarket(raw.markets[0], { sourceUrl: `https://external-api.kalshi.com/trade-api/v2/markets/${encodeURIComponent(raw.markets[0].ticker)}`, observedAt, staleAfterMs: 60_000 }), Date.now());
    },
  },
];

const qualified = [];
for (const source of sources) {
  const latenciesMs = [];
  const failures = [];
  let sample = null;
  for (let index = 0; index < repeatedCalls; index += 1) {
    const started = performance.now();
    try {
      sample = await source.call(source.client);
      latenciesMs.push(Math.round((performance.now() - started) * 10) / 10);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'unknown_failure');
    }
  }
  const ordered = [...latenciesMs].sort((left, right) => left - right);
  qualified.push({
    venueId: source.venueId,
    technicalStatus: sample === null ? 'failed' : failures.length === 0 ? 'passed' : 'degraded',
    repeatedCallCount: repeatedCalls,
    successCount: latenciesMs.length,
    failureCount: failures.length,
    failureCodes: [...new Set(failures)],
    latencyMs: ordered.length === 0 ? null : { minimum: ordered[0], median: ordered[Math.floor(ordered.length / 2)], maximum: ordered.at(-1) },
    normalization: sample === null ? null : {
      marketStatus: sample.status,
      outcomeCount: sample.outcomes.length,
      quotedOutcomeCount: sample.probability.quotedOutcomeCount,
      freshness: sample.freshness.status,
      resolutionRulesPresent: sample.resolution.rules.length > 0,
      resolutionLinkPresent: sample.resolution.sourceUrl.startsWith('https://'),
      liquidityBasis: sample.liquidityMicrousd === null ? 'unavailable' : 'usd',
      provenanceEntryCount: sample.provenance.length,
    },
  });
}

const result = {
  schemaVersion: 'clervo.prediction-live-conformance.v2',
  evaluatedAt,
  externalCalls: repeatedCalls * sources.length,
  ownerCashSpentUsd: 0,
  mutationCount: 0,
  sources: qualified,
};

console.log(JSON.stringify(result, null, 2));
if (qualified.some(({ successCount }) => successCount === 0)) process.exitCode = 1;
