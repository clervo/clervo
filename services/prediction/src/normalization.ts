import { createHash } from 'node:crypto';

export type PredictionVenueId = 'polymarket' | 'kalshi';
export type PredictionMarketStatus = 'open' | 'closed' | 'resolved' | 'cancelled';

export interface VenueOutcomeSnapshot {
  venueOutcomeId: string;
  label: string;
  price: string | null;
}

export interface VenueMarketSnapshot {
  venueId: PredictionVenueId;
  venueMarketId: string;
  question: string;
  description: string;
  category: string;
  status: PredictionMarketStatus;
  openedAt: string | null;
  closesAt: string;
  resolvedAt: string | null;
  resolvedOutcomeId: string | null;
  resolutionRules: string;
  resolutionSourceUrl: string;
  marketUrl: string;
  outcomes: readonly VenueOutcomeSnapshot[];
  liquidityMicrousd: number | null;
  volumeMicrousd: number | null;
  feeBps: number | null;
  observedAt: string;
  staleAfterMs: number;
}

export interface NormalizedPredictionOutcome {
  outcomeId: string;
  venueOutcomeId: string;
  label: string;
  rawPriceMicrousd: number | null;
  normalizedProbabilityBps: number | null;
}

export interface NormalizedPredictionMarket {
  marketRef: string;
  venueId: PredictionVenueId;
  venueMarketId: string;
  question: string;
  description: string;
  category: string;
  status: PredictionMarketStatus;
  openedAt: string | null;
  closesAt: string;
  resolvedAt: string | null;
  resolvedOutcomeId: string | null;
  resolution: Readonly<{ rules: string; sourceUrl: string }>;
  marketUrl: string;
  outcomes: readonly Readonly<NormalizedPredictionOutcome>[];
  probability: Readonly<{ method: 'normalized_visible_prices_largest_remainder'; quotedOutcomeCount: number; rawTotalMicrousd: number | null; overroundMicrousd: number | null }>;
  liquidityMicrousd: number | null;
  volumeMicrousd: number | null;
  feeBps: number | null;
  observedAt: string;
  freshness: Readonly<{ staleAfterMs: number; ageMs: number; status: 'fresh' | 'stale' }>;
  provenance: readonly Readonly<{ fieldGroup: string; sourceUrl: string; observedAt: string }>[];
}

function timestamp(value: string | null, name: string): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError(`prediction_${name}_invalid`);
  return parsed;
}

function publicUrl(value: string, name: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new TypeError(`prediction_${name}_invalid`); }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== '' || /^(?:localhost|127(?:\.|$)|10(?:\.|$)|169\.254(?:\.|$)|192\.168(?:\.|$)|172\.(?:1[6-9]|2[0-9]|3[01])(?:\.|$)|0\.0\.0\.0$|\[?::1\]?$)/u.test(url.hostname)) throw new TypeError(`prediction_${name}_invalid`);
  return url.href;
}

function text(value: string, name: string, maximum: number): string {
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length < 1 || normalized.length > maximum || /[\u0000-\u001F\u007F]/u.test(normalized)) throw new TypeError(`prediction_${name}_invalid`);
  return normalized;
}

function nullableInteger(value: number | null, name: string, maximum: number): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > maximum)) throw new TypeError(`prediction_${name}_invalid`);
}

function price(value: string | null): number | null {
  if (value === null) return null;
  if (!/^(?:0(?:\.[0-9]{1,6})?|1(?:\.0{1,6})?)$/u.test(value)) throw new TypeError('prediction_price_invalid');
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'));
}

function normalizedProbabilities(prices: readonly (number | null)[]): readonly (number | null)[] {
  const quoted = prices.filter((value): value is number => value !== null);
  if (quoted.length !== prices.length || quoted.reduce((sum, value) => sum + value, 0) === 0) return Object.freeze(prices.map(() => null));
  const total = quoted.reduce((sum, value) => sum + value, 0);
  const scaled = quoted.map((value, index) => {
    const numerator = value * 10_000;
    return { index, floor: Math.floor(numerator / total), remainder: numerator % total };
  });
  let remaining = 10_000 - scaled.reduce((sum, value) => sum + value.floor, 0);
  for (const item of [...scaled].sort((left, right) => right.remainder - left.remainder || left.index - right.index)) {
    if (remaining <= 0) break;
    item.floor += 1;
    remaining -= 1;
  }
  return Object.freeze(scaled.sort((left, right) => left.index - right.index).map(({ floor }) => floor));
}

function marketRef(venueId: PredictionVenueId, venueMarketId: string): string {
  return `pmkt_${createHash('sha256').update(`${venueId}\0${venueMarketId}`).digest('hex').slice(0, 32)}`;
}

export function normalizePredictionMarket(input: Readonly<VenueMarketSnapshot>, nowMs: number): Readonly<NormalizedPredictionMarket> {
  if (!['polymarket', 'kalshi'].includes(input.venueId) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,159}$/u.test(input.venueMarketId) || !Number.isSafeInteger(nowMs) || nowMs < 0) throw new TypeError('prediction_identity_invalid');
  const question = text(input.question, 'question', 500);
  const description = text(input.description, 'description', 20_000);
  const category = text(input.category, 'category', 100);
  const resolutionRules = text(input.resolutionRules, 'resolution_rules', 50_000);
  const resolutionSourceUrl = publicUrl(input.resolutionSourceUrl, 'resolution_source');
  const marketUrl = publicUrl(input.marketUrl, 'market_url');
  const openedMs = timestamp(input.openedAt, 'opened_at');
  const closesMs = timestamp(input.closesAt, 'closes_at')!;
  const resolvedMs = timestamp(input.resolvedAt, 'resolved_at');
  const observedMs = timestamp(input.observedAt, 'observed_at')!;
  if (openedMs !== null && openedMs >= closesMs || resolvedMs !== null && resolvedMs < closesMs || observedMs > nowMs || !Number.isSafeInteger(input.staleAfterMs) || input.staleAfterMs < 1_000 || input.staleAfterMs > 86_400_000) throw new TypeError('prediction_timeline_invalid');
  if (input.outcomes.length < 2 || input.outcomes.length > 100) throw new TypeError('prediction_outcomes_invalid');
  nullableInteger(input.liquidityMicrousd, 'liquidity', Number.MAX_SAFE_INTEGER);
  nullableInteger(input.volumeMicrousd, 'volume', Number.MAX_SAFE_INTEGER);
  nullableInteger(input.feeBps, 'fee', 10_000);
  const outcomeIds = new Set<string>();
  const labels = new Set<string>();
  const prices = input.outcomes.map(({ price: value }) => price(value));
  const probabilities = normalizedProbabilities(prices);
  const outcomes = input.outcomes.map((outcome, index) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(outcome.venueOutcomeId) || outcomeIds.has(outcome.venueOutcomeId)) throw new TypeError('prediction_outcomes_invalid');
    outcomeIds.add(outcome.venueOutcomeId);
    const label = text(outcome.label, 'outcome_label', 200);
    const labelKey = label.toLocaleLowerCase('en-US');
    if (labels.has(labelKey)) throw new TypeError('prediction_outcomes_invalid');
    labels.add(labelKey);
    return Object.freeze({ outcomeId: `pout_${createHash('sha256').update(`${input.venueId}\0${input.venueMarketId}\0${outcome.venueOutcomeId}`).digest('hex').slice(0, 32)}`, venueOutcomeId: outcome.venueOutcomeId, label, rawPriceMicrousd: prices[index]!, normalizedProbabilityBps: probabilities[index]! });
  });
  if ((input.status === 'resolved') !== (input.resolvedAt !== null && input.resolvedOutcomeId !== null) || input.resolvedOutcomeId !== null && !outcomeIds.has(input.resolvedOutcomeId)) throw new TypeError('prediction_resolution_invalid');
  const quoted = prices.filter((value): value is number => value !== null);
  const rawTotalMicrousd = quoted.length === prices.length ? quoted.reduce((sum, value) => sum + value, 0) : null;
  const ageMs = nowMs - observedMs;
  return Object.freeze({
    marketRef: marketRef(input.venueId, input.venueMarketId),
    venueId: input.venueId,
    venueMarketId: input.venueMarketId,
    question,
    description,
    category,
    status: input.status,
    openedAt: input.openedAt,
    closesAt: input.closesAt,
    resolvedAt: input.resolvedAt,
    resolvedOutcomeId: input.resolvedOutcomeId,
    resolution: Object.freeze({ rules: resolutionRules, sourceUrl: resolutionSourceUrl }),
    marketUrl,
    outcomes: Object.freeze(outcomes),
    probability: Object.freeze({ method: 'normalized_visible_prices_largest_remainder', quotedOutcomeCount: quoted.length, rawTotalMicrousd, overroundMicrousd: rawTotalMicrousd === null ? null : rawTotalMicrousd - 1_000_000 }),
    liquidityMicrousd: input.liquidityMicrousd,
    volumeMicrousd: input.volumeMicrousd,
    feeBps: input.feeBps,
    observedAt: input.observedAt,
    freshness: Object.freeze({ staleAfterMs: input.staleAfterMs, ageMs, status: ageMs <= input.staleAfterMs ? 'fresh' : 'stale' }),
    provenance: Object.freeze([
      Object.freeze({ fieldGroup: 'identity_and_rules', sourceUrl: resolutionSourceUrl, observedAt: input.observedAt }),
      Object.freeze({ fieldGroup: 'market_state_prices_liquidity', sourceUrl: marketUrl, observedAt: input.observedAt }),
    ]),
  });
}

function normalizedText(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function scorePredictionMarketMatch(left: Readonly<NormalizedPredictionMarket>, right: Readonly<NormalizedPredictionMarket>): Readonly<{ scoreBasisPoints: number; decision: 'auto_match' | 'review' | 'reject'; reasons: readonly string[] }> {
  if (left.venueId === right.venueId && left.venueMarketId === right.venueMarketId) return Object.freeze({ scoreBasisPoints: 10_000, decision: 'auto_match', reasons: Object.freeze(['same_venue_identity']) });
  const reasons: string[] = [];
  let score = 0;
  const questionExact = normalizedText(left.question) === normalizedText(right.question);
  if (questionExact) { score += 4_000; reasons.push('question_exact'); }
  const leftLabels = left.outcomes.map(({ label }) => normalizedText(label)).sort();
  const rightLabels = right.outcomes.map(({ label }) => normalizedText(label)).sort();
  const outcomesExact = JSON.stringify(leftLabels) === JSON.stringify(rightLabels);
  if (outcomesExact) { score += 2_000; reasons.push('outcomes_exact'); }
  const closeDelta = Math.abs(Date.parse(left.closesAt) - Date.parse(right.closesAt));
  if (closeDelta === 0) { score += 1_500; reasons.push('close_exact'); }
  else if (closeDelta <= 3_600_000) { score += 750; reasons.push('close_near'); }
  const rulesExact = normalizedText(left.resolution.rules) === normalizedText(right.resolution.rules);
  if (rulesExact) { score += 1_500; reasons.push('rules_exact'); }
  if (new URL(left.resolution.sourceUrl).hostname === new URL(right.resolution.sourceUrl).hostname) { score += 1_000; reasons.push('resolution_source_host_exact'); }
  const decision = score >= 9_500 && questionExact && outcomesExact && rulesExact ? 'auto_match' : score >= 6_000 ? 'review' : 'reject';
  return Object.freeze({ scoreBasisPoints: score, decision, reasons: Object.freeze(reasons) });
}

export function comparePredictionMarkets(left: Readonly<NormalizedPredictionMarket>, right: Readonly<NormalizedPredictionMarket>): Readonly<{ match: ReturnType<typeof scorePredictionMarketMatch>; stale: boolean; outcomeComparisons: readonly Readonly<{ label: string; leftProbabilityBps: number | null; rightProbabilityBps: number | null; disagreementBps: number | null }>[] }> {
  const match = scorePredictionMarketMatch(left, right);
  if (match.decision !== 'auto_match') throw new Error('prediction_comparison_match_unconfirmed');
  const rightByLabel = new Map(right.outcomes.map((outcome) => [normalizedText(outcome.label), outcome]));
  const outcomeComparisons = left.outcomes.map((outcome) => {
    const other = rightByLabel.get(normalizedText(outcome.label));
    const disagreementBps = outcome.normalizedProbabilityBps === null || other?.normalizedProbabilityBps === null || other === undefined ? null : Math.abs(outcome.normalizedProbabilityBps - other.normalizedProbabilityBps);
    return Object.freeze({ label: outcome.label, leftProbabilityBps: outcome.normalizedProbabilityBps, rightProbabilityBps: other?.normalizedProbabilityBps ?? null, disagreementBps });
  });
  return Object.freeze({ match, stale: left.freshness.status === 'stale' || right.freshness.status === 'stale', outcomeComparisons: Object.freeze(outcomeComparisons) });
}
