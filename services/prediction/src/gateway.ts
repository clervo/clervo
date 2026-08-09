import type { PredictionHistoryStore } from './history.js';
import type { NormalizedPredictionMarket, PredictionVenueId } from './normalization.js';
import { comparePredictionMarkets, isPredictionVenueId } from './normalization.js';
import {
  aggregatePredictionVenues,
  derivePredictionDisagreementSignals,
  derivePredictionMovementSignals,
  type PredictionSignalReport,
} from './signals.js';

export interface PredictionMarketSource {
  venueId: PredictionVenueId;
  discover(input: Readonly<{ query?: string; category?: string; status?: string; limit: number; cursor?: string }>, signal?: AbortSignal): Promise<Readonly<{ markets: readonly Readonly<NormalizedPredictionMarket>[]; nextCursor: string | null }>>;
}

function marketRef(value: string): void {
  if (!/^pmkt_[a-f0-9]{32}$/u.test(value)) throw new TypeError('prediction_market_ref_invalid');
}

function discoveryInput(input: Readonly<{ query?: string; category?: string; status?: string; limit: number; cursor?: string }>): void {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100
    || input.query !== undefined && (input.query.trim().length < 1 || input.query.length > 500)
    || input.category !== undefined && (input.category.trim().length < 1 || input.category.length > 100)
    || input.status !== undefined && !['open', 'closed', 'resolved', 'cancelled'].includes(input.status)
    || input.cursor !== undefined && (input.cursor.length < 1 || input.cursor.length > 512)) throw new TypeError('prediction_discovery_input_invalid');
}

export class PredictionIntelligenceGateway {
  readonly #sources: readonly PredictionMarketSource[];
  readonly #history: PredictionHistoryStore | null;
  readonly #latest = new Map<string, Readonly<NormalizedPredictionMarket>>();

  constructor(input: Readonly<{ sources: readonly PredictionMarketSource[]; history?: PredictionHistoryStore }>) {
    if (input.sources.length < 1 || input.sources.length > 16 || new Set(input.sources.map(({ venueId }) => venueId)).size !== input.sources.length
      || input.sources.some(({ venueId }) => !isPredictionVenueId(venueId))) throw new TypeError('prediction_gateway_config_invalid');
    this.#sources = Object.freeze([...input.sources]);
    this.#history = input.history ?? null;
  }

  async discover(input: Readonly<{ query?: string; category?: string; status?: string; limit: number; cursor?: string }>, signal?: AbortSignal): Promise<Readonly<{
    state: 'available' | 'degraded' | 'unavailable';
    markets: readonly Readonly<NormalizedPredictionMarket>[];
    venues: readonly Readonly<{ venueId: PredictionVenueId; state: 'available' | 'degraded' | 'unavailable'; marketCount: number; failureCode: string | null }>[];
    nextCursors: Readonly<Partial<Record<PredictionVenueId, string>>>;
  }>> {
    discoveryInput(input);
    if (signal?.aborted) throw new Error('prediction_discovery_cancelled');
    const settled = await Promise.allSettled(this.#sources.map(async (source) => ({ source, result: await source.discover(input, signal) })));
    const cursors: Partial<Record<PredictionVenueId, string>> = {};
    const results = settled.map((value, index) => {
      const source = this.#sources[index]!;
      if (value.status === 'rejected') return Object.freeze({ venueId: source.venueId, state: 'unavailable' as const, failureCode: signal?.aborted ? 'source_cancelled' : 'source_failed' });
      const { result } = value.value;
      if (result.markets.length > input.limit || result.nextCursor !== null && (result.nextCursor.length < 1 || result.nextCursor.length > 512)
        || result.markets.some((market) => market.venueId !== source.venueId)) return Object.freeze({ venueId: source.venueId, state: 'unavailable' as const, failureCode: 'source_contract_invalid' });
      if (result.nextCursor !== null) cursors[source.venueId] = result.nextCursor;
      for (const market of result.markets) {
        const existing = this.#latest.get(market.marketRef);
        if (existing !== undefined && (existing.venueId !== market.venueId || existing.venueMarketId !== market.venueMarketId)) throw new Error('prediction_market_identity_conflict');
        if (existing === undefined || Date.parse(existing.observedAt) <= Date.parse(market.observedAt)) this.#latest.set(market.marketRef, market);
      }
      return Object.freeze({ venueId: source.venueId, state: 'available' as const, markets: result.markets });
    });
    const aggregate = aggregatePredictionVenues(results);
    return Object.freeze({ ...aggregate, markets: Object.freeze(aggregate.markets.slice(0, input.limit)), nextCursors: Object.freeze(cursors) });
  }

  market(ref: string): Readonly<NormalizedPredictionMarket> {
    marketRef(ref);
    const market = this.#latest.get(ref);
    if (market === undefined) throw new Error('prediction_market_not_found');
    return market;
  }

  compare(leftRef: string, rightRef: string): ReturnType<typeof comparePredictionMarkets> {
    marketRef(leftRef);
    marketRef(rightRef);
    if (leftRef === rightRef) throw new TypeError('prediction_comparison_refs_invalid');
    return comparePredictionMarkets(this.market(leftRef), this.market(rightRef));
  }

  async recordSnapshot(ref: string): Promise<Readonly<{ replayed: boolean; sequence: number }>> {
    if (this.#history === null) throw new Error('prediction_history_unavailable');
    const appended = await this.#history.append(this.market(ref));
    return Object.freeze({ replayed: appended.replayed, sequence: appended.record.sequence });
  }

  async history(ref: string, afterSequence = 0, limit = 100): Promise<Awaited<ReturnType<PredictionHistoryStore['list']>>> {
    marketRef(ref);
    if (this.#history === null) throw new Error('prediction_history_unavailable');
    return this.#history.list(ref, afterSequence, limit);
  }

  async signals(ref: string, compareRef?: string): Promise<Readonly<PredictionSignalReport>> {
    marketRef(ref);
    if (compareRef !== undefined) {
      marketRef(compareRef);
      return derivePredictionDisagreementSignals(this.market(ref), this.market(compareRef));
    }
    if (this.#history === null) throw new Error('prediction_history_unavailable');
    const records = await this.#history.list(ref, 0, 100);
    if (records.length < 2) {
      const current = this.market(ref);
      return Object.freeze({ usable: false, reason: 'insufficient_evidence', observedAt: current.observedAt, signals: Object.freeze([]), provenance: Object.freeze([]) });
    }
    return derivePredictionMovementSignals(records.at(-2)!.snapshot, records.at(-1)!.snapshot);
  }
}
