import { isPredictionVenueId, type NormalizedPredictionMarket, type PredictionVenueId } from './normalization.js';
import { comparePredictionMarkets } from './normalization.js';

export type PredictionSignal =
  | Readonly<{ kind: 'probability_movement'; outcomeId: string; label: string; changeBps: number; previousProbabilityBps: number; currentProbabilityBps: number }>
  | Readonly<{ kind: 'liquidity_change'; changeMicrousd: number; previousLiquidityMicrousd: number; currentLiquidityMicrousd: number }>
  | Readonly<{ kind: 'venue_disagreement'; label: string; disagreementBps: number; leftProbabilityBps: number; rightProbabilityBps: number }>;

export interface PredictionSignalReport {
  usable: boolean;
  reason: 'ok' | 'stale' | 'identity_mismatch' | 'insufficient_evidence';
  observedAt: string;
  signals: readonly PredictionSignal[];
  provenance: readonly Readonly<{ venueId: PredictionVenueId; marketRef: string; observedAt: string; sourceUrls: readonly string[] }>[];
}

function provenance(markets: readonly Readonly<NormalizedPredictionMarket>[]): PredictionSignalReport['provenance'] {
  return Object.freeze(markets.map((market) => Object.freeze({
    venueId: market.venueId,
    marketRef: market.marketRef,
    observedAt: market.observedAt,
    sourceUrls: Object.freeze([...new Set(market.provenance.map(({ sourceUrl }) => sourceUrl))]),
  })));
}

function report(input: Omit<PredictionSignalReport, 'signals' | 'provenance'>, signals: readonly PredictionSignal[], markets: readonly Readonly<NormalizedPredictionMarket>[]): Readonly<PredictionSignalReport> {
  return Object.freeze({ ...input, signals: Object.freeze(signals), provenance: provenance(markets) });
}

export function derivePredictionMovementSignals(previous: Readonly<NormalizedPredictionMarket>, current: Readonly<NormalizedPredictionMarket>): Readonly<PredictionSignalReport> {
  const observedAt = current.observedAt;
  if (previous.marketRef !== current.marketRef || previous.venueId !== current.venueId || previous.venueMarketId !== current.venueMarketId) return report({ usable: false, reason: 'identity_mismatch', observedAt }, [], [previous, current]);
  if (Date.parse(previous.observedAt) >= Date.parse(current.observedAt)) return report({ usable: false, reason: 'insufficient_evidence', observedAt }, [], [previous, current]);
  if (previous.freshness.status === 'stale' || current.freshness.status === 'stale') return report({ usable: false, reason: 'stale', observedAt }, [], [previous, current]);
  const previousById = new Map(previous.outcomes.map((outcome) => [outcome.venueOutcomeId, outcome]));
  const signals: PredictionSignal[] = [];
  for (const outcome of current.outcomes) {
    const old = previousById.get(outcome.venueOutcomeId);
    if (old?.normalizedProbabilityBps !== null && old !== undefined && outcome.normalizedProbabilityBps !== null) {
      const changeBps = outcome.normalizedProbabilityBps - old.normalizedProbabilityBps;
      if (changeBps !== 0) signals.push(Object.freeze({ kind: 'probability_movement', outcomeId: outcome.outcomeId, label: outcome.label, changeBps, previousProbabilityBps: old.normalizedProbabilityBps, currentProbabilityBps: outcome.normalizedProbabilityBps }));
    }
  }
  if (previous.liquidityMicrousd !== null && current.liquidityMicrousd !== null && previous.liquidityMicrousd !== current.liquidityMicrousd) {
    signals.push(Object.freeze({ kind: 'liquidity_change', changeMicrousd: current.liquidityMicrousd - previous.liquidityMicrousd, previousLiquidityMicrousd: previous.liquidityMicrousd, currentLiquidityMicrousd: current.liquidityMicrousd }));
  }
  return report({ usable: signals.length > 0, reason: signals.length > 0 ? 'ok' : 'insufficient_evidence', observedAt }, signals, [previous, current]);
}

export function derivePredictionDisagreementSignals(left: Readonly<NormalizedPredictionMarket>, right: Readonly<NormalizedPredictionMarket>): Readonly<PredictionSignalReport> {
  const observedAt = Date.parse(left.observedAt) >= Date.parse(right.observedAt) ? left.observedAt : right.observedAt;
  let comparison: ReturnType<typeof comparePredictionMarkets>;
  try {
    comparison = comparePredictionMarkets(left, right);
  } catch {
    return report({ usable: false, reason: 'identity_mismatch', observedAt }, [], [left, right]);
  }
  if (comparison.stale) return report({ usable: false, reason: 'stale', observedAt }, [], [left, right]);
  const signals = comparison.outcomeComparisons.flatMap((outcome): readonly PredictionSignal[] => outcome.disagreementBps === null || outcome.disagreementBps === 0
    ? []
    : [Object.freeze({ kind: 'venue_disagreement', label: outcome.label, disagreementBps: outcome.disagreementBps, leftProbabilityBps: outcome.leftProbabilityBps!, rightProbabilityBps: outcome.rightProbabilityBps! })]);
  return report({ usable: signals.length > 0, reason: signals.length > 0 ? 'ok' : 'insufficient_evidence', observedAt }, signals, [left, right]);
}

export interface PredictionVenueResult {
  venueId: PredictionVenueId;
  state: 'available' | 'degraded' | 'unavailable';
  markets?: readonly Readonly<NormalizedPredictionMarket>[];
  failureCode?: string;
}

export function aggregatePredictionVenues(results: readonly Readonly<PredictionVenueResult>[]): Readonly<{
  state: 'available' | 'degraded' | 'unavailable';
  markets: readonly Readonly<NormalizedPredictionMarket>[];
  venues: readonly Readonly<{ venueId: PredictionVenueId; state: 'available' | 'degraded' | 'unavailable'; marketCount: number; failureCode: string | null }>[];
}> {
  if (results.length < 1 || results.length > 16 || new Set(results.map(({ venueId }) => venueId)).size !== results.length) throw new TypeError('prediction_venue_results_invalid');
  const venues = results.map((result) => {
    if (!isPredictionVenueId(result.venueId)
      || ['available', 'degraded'].includes(result.state) && result.markets === undefined
      || result.state === 'unavailable' && result.markets !== undefined
      || result.failureCode !== undefined && !/^[a-z][a-z0-9_]{2,63}$/u.test(result.failureCode)) throw new TypeError('prediction_venue_results_invalid');
    return Object.freeze({ venueId: result.venueId, state: result.state, marketCount: result.markets?.length ?? 0, failureCode: result.failureCode ?? null });
  });
  const markets = Object.freeze(results.flatMap(({ markets: value }) => value === undefined ? [] : [...value]));
  const usable = venues.filter(({ state }) => state !== 'unavailable').length;
  return Object.freeze({ state: venues.every(({ state }) => state === 'available') ? 'available' : usable === 0 ? 'unavailable' : 'degraded', markets, venues: Object.freeze(venues) });
}
