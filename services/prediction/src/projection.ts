import { createHash } from 'node:crypto';

import type { NormalizedPredictionMarket } from './normalization.js';

export interface DerivedPredictionMarket {
  marketRef: string;
  venueId: string;
  venueMarketId: string;
  proposition: string;
  category: string;
  status: string;
  closesAt: string;
  resolvedAt: string | null;
  resolvedOutcomeId: string | null;
  resolution: Readonly<{ sourceUrl: string; rulesHash: string }>;
  marketUrl: string;
  outcomes: readonly Readonly<{ outcomeId: string; label: string; normalizedProbabilityBps: number | null }>[];
  probability: Readonly<{ method: 'normalized_visible_prices_largest_remainder'; quotedOutcomeCount: number; overroundBps: number | null }>;
  observedAt: string;
  freshness: Readonly<{ staleAfterMs: number; ageMs: number; status: 'fresh' | 'stale' }>;
  evidence: readonly Readonly<{ fieldGroup: string; sourceUrl: string; observedAt: string }>[];
}

export function projectDerivedPredictionMarket(market: Readonly<NormalizedPredictionMarket>): Readonly<DerivedPredictionMarket> {
  const overroundBps = market.probability.overroundMicrousd === null ? null : Math.round(market.probability.overroundMicrousd / 100);
  return Object.freeze({
    marketRef: market.marketRef,
    venueId: market.venueId,
    venueMarketId: market.venueMarketId,
    proposition: market.question,
    category: market.category,
    status: market.status,
    closesAt: market.closesAt,
    resolvedAt: market.resolvedAt,
    resolvedOutcomeId: market.resolvedOutcomeId,
    resolution: Object.freeze({ sourceUrl: market.resolution.sourceUrl, rulesHash: `sha256:${createHash('sha256').update(market.resolution.rules).digest('hex')}` }),
    marketUrl: market.marketUrl,
    outcomes: Object.freeze(market.outcomes.map(({ outcomeId, label, normalizedProbabilityBps }) => Object.freeze({ outcomeId, label, normalizedProbabilityBps }))),
    probability: Object.freeze({ method: market.probability.method, quotedOutcomeCount: market.probability.quotedOutcomeCount, overroundBps }),
    observedAt: market.observedAt,
    freshness: market.freshness,
    evidence: market.provenance,
  });
}
