import { createHash } from 'node:crypto';

import { isPredictionVenueId, type NormalizedPredictionMarket, type PredictionVenueId } from './normalization.js';

export interface PredictionHistoryRecord {
  sequence: number;
  marketRef: string;
  venueId: PredictionVenueId;
  observedAt: string;
  previousHash: string | null;
  payloadHash: string;
  recordHash: string;
  snapshot: Readonly<NormalizedPredictionMarket>;
}

export interface PredictionHistoryStore {
  append(snapshot: Readonly<NormalizedPredictionMarket>): Promise<Readonly<{ record: Readonly<PredictionHistoryRecord>; replayed: boolean }>>;
  list(marketRef: string, afterSequence?: number, limit?: number): Promise<readonly Readonly<PredictionHistoryRecord>[]>;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function historyPayload(snapshot: Readonly<NormalizedPredictionMarket>): unknown {
  const { freshness, ...material } = snapshot;
  return { ...material, freshness: { staleAfterMs: freshness.staleAfterMs } };
}

export function predictionHistoryPayloadHash(snapshot: Readonly<NormalizedPredictionMarket>): string {
  identity(snapshot);
  return digest(canonical(historyPayload(snapshot)));
}

export function predictionHistoryMateriallyEqual(left: Readonly<NormalizedPredictionMarket>, right: Readonly<NormalizedPredictionMarket>): boolean {
  identity(left);
  identity(right);
  return canonical(historyPayload(left)) === canonical(historyPayload(right));
}

function identity(value: Readonly<NormalizedPredictionMarket>): void {
  if (!/^pmkt_[a-f0-9]{32}$/u.test(value.marketRef) || !isPredictionVenueId(value.venueId)
    || !Number.isFinite(Date.parse(value.observedAt)) || new Date(Date.parse(value.observedAt)).toISOString() !== value.observedAt) throw new TypeError('prediction_history_snapshot_invalid');
}

export function verifyPredictionHistory(records: readonly Readonly<PredictionHistoryRecord>[]): boolean {
  let previousHash: string | null = records[0]?.previousHash ?? null;
  let previousObservedAt = -1;
  const firstSequence = records[0]?.sequence ?? 1;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const payloadHash = predictionHistoryPayloadHash(record.snapshot);
    const recordHash = digest(canonical({
      sequence: record.sequence,
      marketRef: record.marketRef,
      venueId: record.venueId,
      observedAt: record.observedAt,
      previousHash,
      payloadHash,
    }));
    if (record.sequence !== firstSequence + index || record.previousHash !== previousHash || record.payloadHash !== payloadHash || record.recordHash !== recordHash
      || record.marketRef !== record.snapshot.marketRef || record.venueId !== record.snapshot.venueId || record.observedAt !== record.snapshot.observedAt
      || Date.parse(record.observedAt) <= previousObservedAt) return false;
    previousHash = record.recordHash;
    previousObservedAt = Date.parse(record.observedAt);
  }
  return true;
}

export class InMemoryPredictionHistoryStore implements PredictionHistoryStore {
  readonly #maximumSnapshotsPerMarket: number;
  readonly #historyAllowedVenues: ReadonlySet<PredictionVenueId>;
  readonly #records = new Map<string, readonly Readonly<PredictionHistoryRecord>[]>();

  constructor(input: Readonly<{ maximumSnapshotsPerMarket: number; historyAllowedVenues: readonly PredictionVenueId[] }>) {
    if (!Number.isSafeInteger(input.maximumSnapshotsPerMarket) || input.maximumSnapshotsPerMarket < 2 || input.maximumSnapshotsPerMarket > 100_000
      || input.historyAllowedVenues.length < 1 || new Set(input.historyAllowedVenues).size !== input.historyAllowedVenues.length
      || input.historyAllowedVenues.some((venue) => !isPredictionVenueId(venue))) throw new TypeError('prediction_history_config_invalid');
    this.#maximumSnapshotsPerMarket = input.maximumSnapshotsPerMarket;
    this.#historyAllowedVenues = new Set(input.historyAllowedVenues);
  }

  async append(snapshot: Readonly<NormalizedPredictionMarket>): Promise<Readonly<{ record: Readonly<PredictionHistoryRecord>; replayed: boolean }>> {
    identity(snapshot);
    if (!this.#historyAllowedVenues.has(snapshot.venueId)) throw new Error('prediction_history_terms_unqualified');
    const current = this.#records.get(snapshot.marketRef) ?? Object.freeze([]);
    const payloadHash = predictionHistoryPayloadHash(snapshot);
    const last = current.at(-1);
    if (last?.observedAt === snapshot.observedAt) {
      if (!predictionHistoryMateriallyEqual(last.snapshot, snapshot)) throw new Error('prediction_history_observation_conflict');
      return Object.freeze({ record: last, replayed: true });
    }
    if (last !== undefined && Date.parse(snapshot.observedAt) <= Date.parse(last.observedAt)) throw new Error('prediction_history_out_of_order');
    const sequence = (last?.sequence ?? 0) + 1;
    const previousHash = last?.recordHash ?? null;
    const recordHash = digest(canonical({
      sequence,
      marketRef: snapshot.marketRef,
      venueId: snapshot.venueId,
      observedAt: snapshot.observedAt,
      previousHash,
      payloadHash,
    }));
    const record = Object.freeze({ sequence, marketRef: snapshot.marketRef, venueId: snapshot.venueId, observedAt: snapshot.observedAt, previousHash, payloadHash, recordHash, snapshot });
    this.#records.set(snapshot.marketRef, Object.freeze([...current, record].slice(-this.#maximumSnapshotsPerMarket)));
    return Object.freeze({ record, replayed: false });
  }

  async list(marketRef: string, afterSequence = 0, limit = 100): Promise<readonly Readonly<PredictionHistoryRecord>[]> {
    if (!/^pmkt_[a-f0-9]{32}$/u.test(marketRef) || !Number.isSafeInteger(afterSequence) || afterSequence < 0
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('prediction_history_query_invalid');
    return Object.freeze((this.#records.get(marketRef) ?? []).filter(({ sequence }) => sequence > afterSequence).slice(0, limit));
  }
}
