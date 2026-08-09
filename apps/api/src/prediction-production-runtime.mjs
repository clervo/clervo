import { CONTRACT_VERSION, hashJson } from '../../../dist/packages/contracts/src/index.js';
import { createBoundedPredictionHttpTransport, parseKalshiMarket, parsePolymarketGammaMarket, PredictionPublicMarketClient } from '../../../dist/adapters/prediction/src/public-market-data.js';
import { comparePredictionMarkets } from '../../../dist/services/prediction/src/normalization.js';
import { groupCanonicalPredictionEvents } from '../../../dist/services/prediction/src/canonical.js';
import { derivePredictionDisagreementSignals, derivePredictionMovementSignals } from '../../../dist/services/prediction/src/signals.js';
import { normalizePredictionMarket } from '../../../dist/services/prediction/src/normalization.js';
import { projectDerivedPredictionMarket } from '../../../dist/services/prediction/src/projection.js';
import { PREDICTION_RESULT_SCHEMA_VERSION } from './x402-paid-prediction.mjs';
import { sellablePredictionSources } from './prediction-public-policy.mjs';

function matchesQuery(market, query) {
  const haystack = `${market.question} ${market.description} ${market.category}`.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ');
  const terms = [...new Set(query.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((term) => term.length > 1))];
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
}

function source({ venueId, client, now }) {
  return Object.freeze({
    venueId,
    async discover(input, signal) {
      const parsed = [];
      const pageSize = input.query === undefined ? input.limit : Math.max(20, Math.min(100, input.limit * 4));
      const maximumPages = input.query === undefined ? 1 : 5;
      let cursor = input.cursor;
      let malformed = 0;
      for (let page = 0; page < maximumPages && parsed.length < input.limit; page += 1) {
        const observedAt = new Date(now()).toISOString();
        let raw;
        let sourceUrl;
        let nextCursor = null;
        if (venueId === 'polymarket') {
          const offset = cursor === undefined ? 0 : Number(cursor);
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw new Error('prediction_source_cursor_invalid');
          const query = { active: input.status === undefined || input.status === 'open' ? 'true' : 'false', closed: input.status === 'open' ? 'false' : input.status === 'closed' || input.status === 'resolved' ? 'true' : 'false', limit: String(pageSize), offset: String(offset) };
          sourceUrl = new URL(`/markets?${new URLSearchParams(query)}`, 'https://gamma-api.polymarket.com').href;
          raw = await client.get('/markets', query, signal);
          if (Array.isArray(raw) && raw.length === pageSize) nextCursor = String(offset + pageSize);
        } else {
          const query = { limit: String(pageSize), ...(input.status === undefined ? { status: 'open' } : { status: input.status === 'resolved' ? 'settled' : input.status }), ...(cursor === undefined ? {} : { cursor }) };
          sourceUrl = new URL(`/trade-api/v2/markets?${new URLSearchParams(query)}`, 'https://external-api.kalshi.com').href;
          const response = await client.get('/trade-api/v2/markets', query, signal);
          raw = response?.markets;
          nextCursor = typeof response?.cursor === 'string' && response.cursor.length > 0 && response.cursor.length <= 512 ? response.cursor : null;
        }
        if (!Array.isArray(raw)) throw new Error('prediction_source_response_invalid');
        for (const item of raw) {
          try {
            const snapshot = venueId === 'polymarket'
              ? parsePolymarketGammaMarket(item, { sourceUrl, observedAt, staleAfterMs: 60_000 })
              : parseKalshiMarket(item, { sourceUrl, observedAt, staleAfterMs: 60_000 });
            const market = normalizePredictionMarket(snapshot, now());
            if (input.query !== undefined && !matchesQuery(market, input.query)) continue;
            if (input.category !== undefined && market.category.toLocaleLowerCase('en-US') !== input.category.toLocaleLowerCase('en-US')) continue;
            if (input.status !== undefined && market.status !== input.status) continue;
            parsed.push(market);
            if (parsed.length >= input.limit) break;
          } catch { malformed += 1; }
        }
        cursor = nextCursor ?? undefined;
        if (nextCursor === null) break;
      }
      if (parsed.length < 1 && input.query === undefined && malformed > 0) throw new Error('prediction_source_no_usable_markets');
      return Object.freeze({ markets: Object.freeze(parsed), nextCursor: cursor ?? null, malformedCount: malformed });
    },
  });
}

function decodeCursor(value, allowedVenues) {
  if (value === undefined) return Object.freeze({});
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some((key) => !allowedVenues.has(key))
      || Object.values(parsed).some((item) => typeof item !== 'string' || item.length < 1 || item.length > 512)) throw new Error();
    return Object.freeze(parsed);
  } catch { throw new TypeError('prediction_cursor_invalid'); }
}

function encodeCursor(value) {
  return Object.keys(value).length === 0 ? null : Buffer.from(JSON.stringify(value)).toString('base64url');
}

function result(request, output, completedAt) {
  const unsigned = Object.freeze({ contractVersion: CONTRACT_VERSION, schemaVersion: PREDICTION_RESULT_SCHEMA_VERSION, operationId: request.operationId, productId: request.productId, completedAt, meteredCharge: Object.freeze({ asset: 'USD', amountAtomic: '0', decimals: 6 }), output });
  return Object.freeze({ ...unsigned, resultHash: hashJson(unsigned) });
}

export function createPredictionProductionRuntime({ store, fetcher = globalThis.fetch, now = () => Date.now(), sourceRegistry } = {}) {
  if (!store || store.durable !== true || typeof store.ready !== 'function' || typeof store.put !== 'function' || typeof store.get !== 'function' || typeof store.append !== 'function' || typeof store.list !== 'function') throw new TypeError('prediction_production_store_invalid');
  if (typeof fetcher !== 'function' || typeof now !== 'function') throw new TypeError('prediction_production_runtime_invalid');
  const transport = createBoundedPredictionHttpTransport(fetcher);
  const configured = sellablePredictionSources(sourceRegistry, now());
  const configuredVenues = new Set(configured.map(({ venueId }) => venueId));
  const qualificationByVenue = Object.freeze(Object.fromEntries(configured.map((item) => [item.venueId, item.qualificationId])));
  const historyAllowedByVenue = new Set(configured.filter(({ historyPermission }) => historyPermission === 'approved').map(({ venueId }) => venueId));
  const factories = Object.freeze({
    polymarket: () => source({ venueId: 'polymarket', now, client: new PredictionPublicMarketClient({ config: { sourceId: 'polymarket_gamma', origin: 'https://gamma-api.polymarket.com', allowedPathPrefix: '/markets', maximumResponseBytes: 5_242_880, timeoutMs: 8_000, staleAfterMs: 60_000 }, transport }) }),
    kalshi: () => source({ venueId: 'kalshi', now, client: new PredictionPublicMarketClient({ config: { sourceId: 'kalshi_market_data', origin: 'https://external-api.kalshi.com', allowedPathPrefix: '/trade-api/v2/markets', maximumResponseBytes: 5_242_880, timeoutMs: 8_000, staleAfterMs: 60_000 }, transport }) }),
  });
  const sources = Object.freeze(configured.map(({ venueId }) => {
    const factory = factories[venueId];
    if (factory === undefined) throw new Error('prediction_source_adapter_unavailable');
    return factory();
  }));

  async function discover(input, signal) {
    const selected = input.venues === undefined ? sources : sources.filter(({ venueId }) => input.venues.includes(venueId));
    const inputCursors = decodeCursor(input.cursor, configuredVenues);
    const settled = await Promise.allSettled(selected.map(async (item) => ({ source: item, response: await item.discover({ ...input, cursor: inputCursors[item.venueId] }, signal) })));
    const markets = [];
    const venues = [];
    const qualificationIds = [];
    const nextCursors = {};
    for (let index = 0; index < settled.length; index += 1) {
      const venueId = selected[index].venueId;
      const value = settled[index];
      if (value.status === 'rejected') { venues.push(Object.freeze({ venueId, state: 'unavailable', marketCount: 0, failureCode: 'source_failed' })); continue; }
      const values = value.value.response.markets;
      if (value.value.response.nextCursor !== null) nextCursors[venueId] = value.value.response.nextCursor;
      const venueState = value.value.response.malformedCount > 0 ? 'degraded' : 'available';
      venues.push(Object.freeze({ venueId, state: venueState, marketCount: values.length, failureCode: venueState === 'degraded' ? 'partial_malformed_source' : null }));
      qualificationIds.push(qualificationByVenue[venueId]);
      for (const market of values) {
        await store.put(market);
        if (historyAllowedByVenue.has(venueId)) await store.append(market);
        markets.push(market);
      }
    }
    if (signal?.aborted) throw new Error('prediction_operation_deadline_exceeded');
    const usable = venues.filter(({ state }) => state !== 'unavailable').length;
    if (usable < 1) throw new Error('prediction_sources_unavailable');
    const selectedMarkets = Object.freeze(markets.slice(0, input.limit));
    return Object.freeze({ output: Object.freeze({ kind: 'markets', state: venues.every(({ state }) => state === 'available') ? 'available' : 'degraded', markets: Object.freeze(selectedMarkets.map(projectDerivedPredictionMarket)), events: groupCanonicalPredictionEvents(selectedMarkets), venues: Object.freeze(venues), nextCursor: encodeCursor(nextCursors) }), qualificationIds: Object.freeze(qualificationIds) });
  }

  async function load(ref) {
    const market = await store.get(ref);
    if (!market) throw Object.assign(new Error('prediction_market_not_found'), { status: 404 });
    return market;
  }

  return Object.freeze({
    durable: true,
    async ready() { return store.ready(); },
    async close() { await store.close?.(); },
    async execute(request) {
      const nowMs = now();
      const deadlineMs = Date.parse(request.deadlineAt);
      if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !Number.isFinite(deadlineMs) || nowMs >= deadlineMs) throw new Error('prediction_operation_deadline_exceeded');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deadlineMs - nowMs);
      let completed;
      try {
      if (request.input.kind === 'markets') completed = await discover(request.input, controller.signal);
      else if (request.input.kind === 'market') {
        const market = await load(request.input.marketRef);
        completed = { output: Object.freeze({ kind: 'market', market: projectDerivedPredictionMarket(market), event: groupCanonicalPredictionEvents([market])[0] }), qualificationIds: Object.freeze([qualificationByVenue[market.venueId]]) };
      } else if (request.input.kind === 'compare') {
        const [left, right] = await Promise.all(request.input.marketRefs.map(load));
        const comparison = comparePredictionMarkets(left, right);
        completed = { output: Object.freeze({ kind: 'compare', marketRefs: request.input.marketRefs, event: groupCanonicalPredictionEvents([left, right])[0], stale: comparison.stale, matchScoreBasisPoints: comparison.match.scoreBasisPoints, matchEvidence: comparison.match.reasons, outcomes: comparison.outcomeComparisons }), qualificationIds: Object.freeze([...new Set([qualificationByVenue[left.venueId], qualificationByVenue[right.venueId]])]) };
      } else if (request.input.kind === 'history') {
        const market = await load(request.input.marketRef);
        const records = await store.list(request.input.marketRef, request.input.afterSequence ?? 0, request.input.limit);
        if (!historyAllowedByVenue.has(market.venueId)) throw new Error('prediction_history_terms_unqualified');
        const projected = Object.freeze(records.map((record) => Object.freeze({ ...record, snapshot: projectDerivedPredictionMarket(record.snapshot), hashScope: 'retained_internal_normalized_snapshot' })));
        completed = { output: Object.freeze({ kind: 'history', marketRef: request.input.marketRef, records: projected, retention: Object.freeze({ maximumSnapshotsPerMarket: store.maximumSnapshotsPerMarket ?? null, bounded: true }) }), qualificationIds: Object.freeze([qualificationByVenue[market.venueId]]) };
      } else {
        const market = await load(request.input.marketRef);
        let report;
        let qualificationIds = [qualificationByVenue[market.venueId]];
        if (request.input.compareMarketRef !== undefined) {
          const comparison = await load(request.input.compareMarketRef);
          report = derivePredictionDisagreementSignals(market, comparison);
          qualificationIds = [...new Set([...qualificationIds, qualificationByVenue[comparison.venueId]])];
        } else {
          if (!historyAllowedByVenue.has(market.venueId)) throw new Error('prediction_history_terms_unqualified');
          const records = typeof store.latest === 'function' ? await store.latest(request.input.marketRef, 2) : await store.list(request.input.marketRef, 0, 100);
          report = records.length < 2 ? Object.freeze({ usable: false, reason: 'insufficient_evidence', observedAt: market.observedAt, signals: Object.freeze([]) }) : derivePredictionMovementSignals(records.at(-2).snapshot, records.at(-1).snapshot);
        }
        completed = { output: Object.freeze({ kind: 'signal', usable: report.usable, reason: report.reason, observedAt: report.observedAt, signals: report.signals, provenance: report.provenance ?? Object.freeze([]) }), qualificationIds: Object.freeze(qualificationIds) };
      }
      } finally { clearTimeout(timer); }
      const completedAt = new Date(now()).toISOString();
      return Object.freeze({ result: result(request, completed.output, completedAt), qualificationIds: completed.qualificationIds });
    },
  });
}
