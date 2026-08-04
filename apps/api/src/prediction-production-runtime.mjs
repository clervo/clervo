import { CONTRACT_VERSION, hashJson } from '../../../dist/packages/contracts/src/index.js';
import { createBoundedPredictionHttpTransport, parseKalshiMarket, parsePolymarketGammaMarket, PredictionPublicMarketClient } from '../../../dist/adapters/prediction/src/public-market-data.js';
import { comparePredictionMarkets } from '../../../dist/services/prediction/src/normalization.js';
import { derivePredictionDisagreementSignals, derivePredictionMovementSignals } from '../../../dist/services/prediction/src/signals.js';
import { normalizePredictionMarket } from '../../../dist/services/prediction/src/normalization.js';
import { PREDICTION_RESULT_SCHEMA_VERSION } from './x402-paid-prediction.mjs';

const QUALIFICATIONS = Object.freeze({ polymarket: 'qual_PolymarketPublicData20260804', kalshi: 'qual_KalshiPublicMarketData20260804' });

function source({ venueId, client, now }) {
  return Object.freeze({
    venueId,
    async discover(input, signal) {
      const observedAt = new Date(now()).toISOString();
      let raw;
      let sourceUrl;
      if (venueId === 'polymarket') {
        const query = { active: input.status === undefined || input.status === 'open' ? 'true' : 'false', closed: input.status === 'open' ? 'false' : input.status === 'closed' || input.status === 'resolved' ? 'true' : 'false', limit: String(input.limit) };
        sourceUrl = new URL(`/markets?${new URLSearchParams(query)}`, 'https://gamma-api.polymarket.com').href;
        raw = await client.get('/markets', query, signal);
      } else {
        const query = { limit: String(input.limit), ...(input.status === undefined ? { status: 'open' } : { status: input.status === 'resolved' ? 'settled' : input.status }) };
        sourceUrl = new URL(`/trade-api/v2/markets?${new URLSearchParams(query)}`, 'https://external-api.kalshi.com').href;
        raw = await client.get('/trade-api/v2/markets', query, signal);
        raw = raw?.markets;
      }
      if (!Array.isArray(raw)) throw new Error('prediction_source_response_invalid');
      const parsed = [];
      for (const item of raw.slice(0, input.limit)) {
        try {
          const snapshot = venueId === 'polymarket'
            ? parsePolymarketGammaMarket(item, { sourceUrl, observedAt, staleAfterMs: 60_000 })
            : parseKalshiMarket(item, { sourceUrl, observedAt, staleAfterMs: 60_000 });
          const market = normalizePredictionMarket(snapshot, now());
          if (input.query !== undefined && !`${market.question} ${market.description}`.toLocaleLowerCase('en-US').includes(input.query.toLocaleLowerCase('en-US'))) continue;
          if (input.category !== undefined && market.category.toLocaleLowerCase('en-US') !== input.category.toLocaleLowerCase('en-US')) continue;
          if (input.status !== undefined && market.status !== input.status) continue;
          parsed.push(market);
        } catch { /* A malformed venue item cannot contaminate the remaining bounded result. */ }
      }
      if (parsed.length < 1) throw new Error('prediction_source_no_usable_markets');
      return Object.freeze({ markets: Object.freeze(parsed), nextCursor: null });
    },
  });
}

function result(request, output, completedAt) {
  const unsigned = Object.freeze({ contractVersion: CONTRACT_VERSION, schemaVersion: PREDICTION_RESULT_SCHEMA_VERSION, operationId: request.operationId, productId: request.productId, completedAt, meteredCharge: Object.freeze({ asset: 'USD', amountAtomic: '0', decimals: 6 }), output });
  return Object.freeze({ ...unsigned, resultHash: hashJson(unsigned) });
}

export function createPredictionProductionRuntime({ store, fetcher = globalThis.fetch, now = () => Date.now() } = {}) {
  if (!store || store.durable !== true || typeof store.ready !== 'function' || typeof store.put !== 'function' || typeof store.get !== 'function' || typeof store.append !== 'function' || typeof store.list !== 'function') throw new TypeError('prediction_production_store_invalid');
  if (typeof fetcher !== 'function' || typeof now !== 'function') throw new TypeError('prediction_production_runtime_invalid');
  const transport = createBoundedPredictionHttpTransport(fetcher);
  const sources = Object.freeze([
    source({ venueId: 'polymarket', now, client: new PredictionPublicMarketClient({ config: { sourceId: 'polymarket_gamma', origin: 'https://gamma-api.polymarket.com', allowedPathPrefix: '/markets', maximumResponseBytes: 5_242_880, timeoutMs: 8_000, staleAfterMs: 60_000 }, transport }) }),
    source({ venueId: 'kalshi', now, client: new PredictionPublicMarketClient({ config: { sourceId: 'kalshi_market_data', origin: 'https://external-api.kalshi.com', allowedPathPrefix: '/trade-api/v2/markets', maximumResponseBytes: 5_242_880, timeoutMs: 8_000, staleAfterMs: 60_000 }, transport }) }),
  ]);

  async function discover(input, signal) {
    const selected = input.venues === undefined ? sources : sources.filter(({ venueId }) => input.venues.includes(venueId));
    const settled = await Promise.allSettled(selected.map(async (item) => ({ source: item, response: await item.discover(input, signal) })));
    const markets = [];
    const venues = [];
    const qualificationIds = [];
    for (let index = 0; index < settled.length; index += 1) {
      const venueId = selected[index].venueId;
      const value = settled[index];
      if (value.status === 'rejected') { venues.push(Object.freeze({ venueId, state: 'unavailable', marketCount: 0, failureCode: 'source_failed' })); continue; }
      const values = value.value.response.markets;
      venues.push(Object.freeze({ venueId, state: 'available', marketCount: values.length, failureCode: null }));
      qualificationIds.push(QUALIFICATIONS[venueId]);
      for (const market of values) {
        await store.put(market);
        await store.append(market);
        markets.push(market);
      }
    }
    const available = venues.filter(({ state }) => state === 'available').length;
    if (available < 1) throw new Error('prediction_sources_unavailable');
    return Object.freeze({ output: Object.freeze({ kind: 'markets', state: available === venues.length ? 'available' : 'degraded', markets: Object.freeze(markets.slice(0, input.limit)), venues: Object.freeze(venues), nextCursor: null }), qualificationIds: Object.freeze(qualificationIds) });
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
      if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs >= Date.parse(request.deadlineAt)) throw new Error('prediction_operation_deadline_exceeded');
      let completed;
      if (request.input.kind === 'markets') completed = await discover(request.input);
      else if (request.input.kind === 'market') {
        const market = await load(request.input.marketRef);
        completed = { output: Object.freeze({ kind: 'market', market }), qualificationIds: Object.freeze([QUALIFICATIONS[market.venueId]]) };
      } else if (request.input.kind === 'compare') {
        const [left, right] = await Promise.all(request.input.marketRefs.map(load));
        const comparison = comparePredictionMarkets(left, right);
        completed = { output: Object.freeze({ kind: 'compare', marketRefs: request.input.marketRefs, stale: comparison.stale, matchScoreBasisPoints: comparison.match.scoreBasisPoints, outcomes: comparison.outcomeComparisons }), qualificationIds: Object.freeze([...new Set([QUALIFICATIONS[left.venueId], QUALIFICATIONS[right.venueId]])]) };
      } else if (request.input.kind === 'history') {
        const market = await load(request.input.marketRef);
        const records = await store.list(request.input.marketRef, request.input.afterSequence ?? 0, request.input.limit);
        completed = { output: Object.freeze({ kind: 'history', marketRef: request.input.marketRef, records }), qualificationIds: Object.freeze([QUALIFICATIONS[market.venueId]]) };
      } else {
        const market = await load(request.input.marketRef);
        let report;
        let qualificationIds = [QUALIFICATIONS[market.venueId]];
        if (request.input.compareMarketRef !== undefined) {
          const comparison = await load(request.input.compareMarketRef);
          report = derivePredictionDisagreementSignals(market, comparison);
          qualificationIds = [...new Set([...qualificationIds, QUALIFICATIONS[comparison.venueId]])];
        } else {
          const records = await store.list(request.input.marketRef, 0, 100);
          report = records.length < 2 ? Object.freeze({ usable: false, reason: 'insufficient_evidence', observedAt: market.observedAt, signals: Object.freeze([]) }) : derivePredictionMovementSignals(records.at(-2).snapshot, records.at(-1).snapshot);
        }
        completed = { output: Object.freeze({ kind: 'signal', usable: report.usable, reason: report.reason, observedAt: report.observedAt, signals: report.signals }), qualificationIds: Object.freeze(qualificationIds) };
      }
      const completedAt = new Date(now()).toISOString();
      return Object.freeze({ result: result(request, completed.output, completedAt), qualificationIds: completed.qualificationIds });
    },
  });
}
