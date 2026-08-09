import { createHash } from 'node:crypto';

import type { NormalizedPredictionMarket, PredictionVenueId } from './normalization.js';
import { scorePredictionMarketMatch } from './normalization.js';

export type CanonicalPredictionMatchDecision = 'auto_match' | 'unresolved';

export interface CanonicalPredictionEvent {
  eventRef: string;
  proposition: string;
  closesAt: string;
  outcomes: readonly string[];
  matchDecision: CanonicalPredictionMatchDecision;
  matchConfidenceBasisPoints: number;
  supportingVenueCount: number;
  hasStaleEvidence: boolean;
  constituents: readonly Readonly<{
    marketRef: string;
    venueId: PredictionVenueId;
    venueMarketId: string;
    observedAt: string;
    freshness: 'fresh' | 'stale';
    resolutionSourceUrl: string;
  }>[];
  matchEvidence: readonly Readonly<{
    leftMarketRef: string;
    rightMarketRef: string;
    decision: 'auto_match';
    scoreBasisPoints: number;
    reasons: readonly string[];
  }>[];
}

function normalizedText(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function eventRef(market: Readonly<NormalizedPredictionMarket>): string {
  const identity = JSON.stringify({
    proposition: normalizedText(market.question),
    closesAt: market.closesAt,
    outcomes: market.outcomes.map(({ label }) => normalizedText(label)).sort(),
    resolutionSourceHost: new URL(market.resolution.sourceUrl).hostname.toLocaleLowerCase('en-US'),
    ruleNumbers: [...new Set(`${market.question} ${market.resolution.rules}`.toLocaleLowerCase('en-US').match(/(?:\$|€|£)?\d+(?:[.,]\d+)*(?:%|bps?)?/gu) ?? [])].sort(),
  });
  return `pevt_${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
}

export function createCanonicalPredictionEvent(markets: readonly Readonly<NormalizedPredictionMarket>[]): Readonly<CanonicalPredictionEvent> {
  if (markets.length < 1 || markets.length > 16 || new Set(markets.map(({ marketRef }) => marketRef)).size !== markets.length) throw new TypeError('prediction_canonical_event_markets_invalid');
  const ordered = [...markets].sort((left, right) => left.marketRef.localeCompare(right.marketRef));
  const evidence: CanonicalPredictionEvent['matchEvidence'][number][] = [];
  let confidence = ordered.length === 1 ? 5_000 : 10_000;
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const match = scorePredictionMarketMatch(ordered[leftIndex]!, ordered[rightIndex]!);
      if (match.decision !== 'auto_match') throw new Error('prediction_canonical_event_match_unconfirmed');
      confidence = Math.min(confidence, match.scoreBasisPoints);
      evidence.push(Object.freeze({ leftMarketRef: ordered[leftIndex]!.marketRef, rightMarketRef: ordered[rightIndex]!.marketRef, decision: 'auto_match', scoreBasisPoints: match.scoreBasisPoints, reasons: match.reasons }));
    }
  }
  const refs = new Set(ordered.map(eventRef));
  if (refs.size !== 1) throw new Error('prediction_canonical_event_identity_conflict');
  const first = ordered[0]!;
  return Object.freeze({
    eventRef: [...refs][0]!,
    proposition: first.question,
    closesAt: first.closesAt,
    outcomes: Object.freeze(first.outcomes.map(({ label }) => label)),
    matchDecision: ordered.length > 1 ? 'auto_match' : 'unresolved',
    matchConfidenceBasisPoints: confidence,
    supportingVenueCount: new Set(ordered.map(({ venueId }) => venueId)).size,
    hasStaleEvidence: ordered.some(({ freshness }) => freshness.status === 'stale'),
    constituents: Object.freeze(ordered.map((market) => Object.freeze({ marketRef: market.marketRef, venueId: market.venueId, venueMarketId: market.venueMarketId, observedAt: market.observedAt, freshness: market.freshness.status, resolutionSourceUrl: market.resolution.sourceUrl }))),
    matchEvidence: Object.freeze(evidence),
  });
}

export function groupCanonicalPredictionEvents(markets: readonly Readonly<NormalizedPredictionMarket>[]): readonly Readonly<CanonicalPredictionEvent>[] {
  if (markets.length > 100) throw new TypeError('prediction_canonical_event_markets_invalid');
  const groups: Readonly<NormalizedPredictionMarket>[][] = [];
  for (const market of [...markets].sort((left, right) => left.marketRef.localeCompare(right.marketRef))) {
    const group = groups.find((candidate) => candidate.every((existing) => scorePredictionMarketMatch(existing, market).decision === 'auto_match'));
    if (group === undefined) groups.push([market]);
    else group.push(market);
  }
  return Object.freeze(groups.map((group) => createCanonicalPredictionEvent(group)));
}
