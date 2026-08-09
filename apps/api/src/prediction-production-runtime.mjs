import { CONTRACT_VERSION, hashJson } from '../../../dist/packages/contracts/src/index.js';
import { createBoundedPredictionHttpTransport, parseKalshiMarket, parsePdataMarket, parsePolymarketGammaMarket, PredictionPublicMarketClient } from '../../../dist/adapters/prediction/src/public-market-data.js';
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

function source({ sourceId, adapterId, venueId, client, now }) {
  return Object.freeze({
    sourceId, adapterId, venueIds: Object.freeze([venueId]),
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
      return Object.freeze({
        markets: Object.freeze(parsed), nextCursor: cursor ?? null,
        venues: Object.freeze([Object.freeze({ venueId, state: malformed > 0 ? 'degraded' : 'available', marketCount: parsed.length, failureCode: malformed > 0 ? 'partial_malformed_source' : null })]),
      });
    },
  });
}

function pdataSource({ sourceId, adapterId, venueIds, client, now }) {
  return Object.freeze({
    sourceId, adapterId, venueIds: Object.freeze([...venueIds]),
    async discover(input, signal) {
      const selectedVenues = input.venues === undefined ? venueIds : venueIds.filter((venueId) => input.venues.includes(venueId));
      if (selectedVenues.length < 1) return Object.freeze({ markets: Object.freeze([]), nextCursor: null, venues: Object.freeze([]) });
      const pageSize = Math.max(20, Math.min(200, input.limit * 2));
      const maximumPages = 5;
      let pageByVenue;
      if (input.cursor === undefined) pageByVenue = Object.fromEntries(selectedVenues.map((venueId) => [venueId, 1]));
      else {
        try {
          const decoded = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
          if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded) || Object.keys(decoded).some((venueId) => !selectedVenues.includes(venueId))
            || selectedVenues.some((venueId) => !Number.isSafeInteger(decoded[venueId]) || decoded[venueId] < 0 || decoded[venueId] > 100_000)) throw new Error('invalid');
          pageByVenue = decoded;
        } catch { throw new Error('prediction_source_cursor_invalid'); }
      }
      const settled = await Promise.allSettled(selectedVenues.map(async (venueId) => {
        let pageNumber = pageByVenue[venueId];
        if (pageNumber === 0) return { venueId, markets: [], malformed: 0, stale: 0, nextPage: 0 };
        const markets = [];
        let malformed = 0; let stale = 0; let nextPage = 0;
        for (let page = 0; page < maximumPages && markets.length < input.limit; page += 1) {
          const query = {
            page: String(pageNumber), page_size: String(pageSize), source: venueId,
            ...(input.status === undefined || input.status === 'open' ? { status: 'open' } : input.status === 'resolved' ? { status: 'resolved' } : { closed: 'true' }),
            ...(input.status === undefined || input.status === 'open' ? { ends_after: new Date(now()).toISOString() } : {}),
            ...(input.query === undefined ? {} : { search: input.query }),
            ...(input.category === undefined ? {} : { categories: input.category }),
          };
          const apiUrl = new URL(`/api/v1/markets?${new URLSearchParams(query)}`, 'https://api.pdata.world').href;
          const response = await client.get('/api/v1/markets', query, signal);
          if (!response || typeof response !== 'object' || Array.isArray(response) || !Array.isArray(response.items)
            || !response.meta || typeof response.meta !== 'object' || !response._meta || typeof response._meta !== 'object'
            || response._meta.attribution !== 'pdata.world — aggregated prediction-market data across 8 platforms') throw new Error('prediction_source_response_invalid');
          for (const item of response.items) {
            try {
              const market = normalizePredictionMarket(parsePdataMarket(item, { apiUrl, staleAfterMs: 3_600_000 }), now());
              if (market.venueId !== venueId) throw new Error('prediction_source_response_invalid');
              if (market.freshness.status !== 'fresh') { stale += 1; continue; }
              if (input.query !== undefined && !matchesQuery(market, input.query)) continue;
              if (input.category !== undefined && market.category.toLocaleLowerCase('en-US') !== input.category.toLocaleLowerCase('en-US')) continue;
              if (input.status !== undefined && market.status !== input.status) continue;
              markets.push(market);
              if (markets.length >= input.limit) break;
            } catch { malformed += 1; }
          }
          const totalPages = Number(response.meta.total_pages);
          if (!Number.isSafeInteger(totalPages) || totalPages < 0 || totalPages > 1_000_000) throw new Error('prediction_source_response_invalid');
          if (pageNumber < totalPages) { pageNumber += 1; nextPage = pageNumber; }
          else { nextPage = 0; break; }
        }
        return { venueId, markets, malformed, stale, nextPage };
      }));
      const successful = settled.filter(({ status }) => status === 'fulfilled').map(({ value }) => value);
      const byVenue = new Map(successful.map(({ venueId, markets }) => [venueId, [...markets]]));
      const selectedMarkets = [];
      while (selectedMarkets.length < input.limit && [...byVenue.values()].some((markets) => markets.length > 0)) {
        for (const venueId of selectedVenues) {
          const market = byVenue.get(venueId)?.shift();
          if (market !== undefined) selectedMarkets.push(market);
          if (selectedMarkets.length >= input.limit) break;
        }
      }
      const counts = Object.fromEntries(selectedVenues.map((venueId) => [venueId, 0]));
      for (const market of selectedMarkets) counts[market.venueId] += 1;
      const nextPages = Object.fromEntries(selectedVenues.map((venueId, index) => [venueId, settled[index].status === 'fulfilled' ? settled[index].value.nextPage : pageByVenue[venueId]]));
      const nextCursor = Object.values(nextPages).some((page) => page > 0) ? Buffer.from(JSON.stringify(nextPages)).toString('base64url') : null;
      return Object.freeze({
        markets: Object.freeze(selectedMarkets), nextCursor,
        venues: Object.freeze(selectedVenues.map((venueId, index) => {
          const entry = settled[index];
          if (entry.status === 'rejected') return Object.freeze({ venueId, state: 'unavailable', marketCount: 0, failureCode: 'source_failed' });
          const issues = entry.value.malformed + entry.value.stale;
          return Object.freeze({
            venueId, state: counts[venueId] === 0 && issues > 0 ? 'unavailable' : issues > 0 ? 'degraded' : 'available', marketCount: counts[venueId],
            failureCode: entry.value.malformed > 0 ? 'partial_malformed_source' : entry.value.stale > 0 ? 'partial_stale_source' : null,
          });
        })),
      });
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

function uniqueAttributions(markets) {
  const seen = new Set();
  const values = [];
  for (const attribution of markets.flatMap(({ supplyAttributions = [] }) => supplyAttributions)) {
    const key = `${attribution.sourceId}\0${attribution.upstreamVenueId}\0${attribution.upstreamMarketUrl}`;
    if (seen.has(key)) continue;
    seen.add(key); values.push(attribution);
  }
  return Object.freeze(values);
}

export function createPredictionProductionRuntime({ store, fetcher = globalThis.fetch, now = () => Date.now(), sourceRegistry } = {}) {
  if (!store || store.durable !== true || typeof store.ready !== 'function' || typeof store.put !== 'function' || typeof store.get !== 'function' || typeof store.append !== 'function' || typeof store.list !== 'function') throw new TypeError('prediction_production_store_invalid');
  if (typeof fetcher !== 'function' || typeof now !== 'function') throw new TypeError('prediction_production_runtime_invalid');
  const transport = createBoundedPredictionHttpTransport(fetcher);
  const configured = sellablePredictionSources(sourceRegistry, now());
  const bindings = configured.flatMap((item) => item.venueIds.map((venueId) => ({ venueId, qualificationId: item.qualificationId, adapterId: item.adapterId, historyPermission: item.historyPermission })));
  if (new Set(bindings.map(({ venueId }) => venueId)).size !== bindings.length) throw new Error('prediction_public_venue_binding_ambiguous');
  const qualificationByVenue = Object.freeze(Object.fromEntries(bindings.map(({ venueId, qualificationId }) => [venueId, qualificationId])));
  const adapterByVenue = Object.freeze(Object.fromEntries(bindings.map(({ venueId, adapterId }) => [venueId, adapterId])));
  const historyAllowedByVenue = new Set(bindings.filter(({ historyPermission }) => historyPermission === 'approved').map(({ venueId }) => venueId));
  const sourceBindingsForMarkets = (markets) => Object.freeze([...new Map(markets.map(({ venueId }) => {
    const binding = Object.freeze({ adapterId: adapterByVenue[venueId], qualificationId: qualificationByVenue[venueId] });
    return [`${binding.adapterId}\0${binding.qualificationId}`, binding];
  })).values()]);
  const sources = Object.freeze(configured.map((item) => {
    if (item.adapterId === 'adapter_prediction.pdata_rest') return pdataSource({
      sourceId: item.sourceId, adapterId: item.adapterId, venueIds: item.venueIds, now,
      client: new PredictionPublicMarketClient({ config: { sourceId: 'pdata_rest', origin: 'https://api.pdata.world', allowedPathPrefix: '/api/v1/markets', maximumResponseBytes: 10_485_760, timeoutMs: 12_000, staleAfterMs: 3_600_000 }, transport }),
    });
    const venueId = item.venueIds[0];
    if (item.venueIds.length !== 1) throw new Error('prediction_source_adapter_unavailable');
    if (item.adapterId === 'adapter_prediction.polymarket_gamma' || item.adapterId === undefined && venueId === 'polymarket') return source({ sourceId: item.sourceId ?? 'prediction.source.polymarket_gamma', adapterId: item.adapterId ?? 'adapter_prediction.polymarket_gamma', venueId, now, client: new PredictionPublicMarketClient({ config: { sourceId: 'polymarket_gamma', origin: 'https://gamma-api.polymarket.com', allowedPathPrefix: '/markets', maximumResponseBytes: 5_242_880, timeoutMs: 8_000, staleAfterMs: 60_000 }, transport }) });
    if (item.adapterId === 'adapter_prediction.kalshi_market_data' || item.adapterId === undefined && venueId === 'kalshi') return source({ sourceId: item.sourceId ?? 'prediction.source.kalshi_market_data', adapterId: item.adapterId ?? 'adapter_prediction.kalshi_market_data', venueId, now, client: new PredictionPublicMarketClient({ config: { sourceId: 'kalshi_market_data', origin: 'https://external-api.kalshi.com', allowedPathPrefix: '/trade-api/v2/markets', maximumResponseBytes: 5_242_880, timeoutMs: 8_000, staleAfterMs: 60_000 }, transport }) });
    throw new Error('prediction_source_adapter_unavailable');
  }));

  async function discover(input, signal) {
    const selected = input.venues === undefined ? sources : sources.filter(({ venueIds }) => venueIds.some((venueId) => input.venues.includes(venueId)));
    const configuredSourceIds = new Set(sources.map(({ sourceId }) => sourceId));
    const inputCursors = decodeCursor(input.cursor, configuredSourceIds);
    const settled = await Promise.allSettled(selected.map(async (item) => ({ source: item, response: await item.discover({ ...input, cursor: inputCursors[item.sourceId] }, signal) })));
    const markets = [];
    const venues = [];
    const nextCursors = {};
    for (let index = 0; index < settled.length; index += 1) {
      const selectedSource = selected[index];
      const value = settled[index];
      if (value.status === 'rejected') {
        for (const venueId of selectedSource.venueIds.filter((item) => input.venues === undefined || input.venues.includes(item))) venues.push(Object.freeze({ venueId, state: 'unavailable', marketCount: 0, failureCode: 'source_failed' }));
        continue;
      }
      const values = value.value.response.markets;
      if (value.value.response.nextCursor !== null) nextCursors[selectedSource.sourceId] = value.value.response.nextCursor;
      venues.push(...value.value.response.venues);
      for (const market of values) {
        await store.put(market);
        if (historyAllowedByVenue.has(market.venueId)) await store.append(market);
        markets.push(market);
      }
    }
    if (signal?.aborted) throw new Error('prediction_operation_deadline_exceeded');
    const usable = venues.filter(({ state }) => state !== 'unavailable').length;
    if (usable < 1) throw new Error('prediction_sources_unavailable');
    const selectedMarkets = Object.freeze(markets.slice(0, input.limit));
    const sourceBindings = sourceBindingsForMarkets(selectedMarkets);
    return Object.freeze({ output: Object.freeze({ kind: 'markets', state: venues.every(({ state }) => state === 'available') ? 'available' : 'degraded', markets: Object.freeze(selectedMarkets.map(projectDerivedPredictionMarket)), events: groupCanonicalPredictionEvents(selectedMarkets), venues: Object.freeze(venues), nextCursor: encodeCursor(nextCursors) }), qualificationIds: Object.freeze(sourceBindings.map(({ qualificationId }) => qualificationId)), adapterIds: Object.freeze(sourceBindings.map(({ adapterId }) => adapterId)), sourceBindings });
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
        const sourceBindings = sourceBindingsForMarkets([market]);
        completed = { output: Object.freeze({ kind: 'market', market: projectDerivedPredictionMarket(market), event: groupCanonicalPredictionEvents([market])[0] }), qualificationIds: Object.freeze(sourceBindings.map(({ qualificationId }) => qualificationId)), adapterIds: Object.freeze(sourceBindings.map(({ adapterId }) => adapterId)), sourceBindings };
      } else if (request.input.kind === 'compare') {
        const [left, right] = await Promise.all(request.input.marketRefs.map(load));
        const comparison = comparePredictionMarkets(left, right);
        const sourceBindings = sourceBindingsForMarkets([left, right]);
        completed = { output: Object.freeze({ kind: 'compare', marketRefs: request.input.marketRefs, event: groupCanonicalPredictionEvents([left, right])[0], stale: comparison.stale, matchScoreBasisPoints: comparison.match.scoreBasisPoints, matchEvidence: comparison.match.reasons, outcomes: comparison.outcomeComparisons, supplyAttributions: uniqueAttributions([left, right]) }), qualificationIds: Object.freeze(sourceBindings.map(({ qualificationId }) => qualificationId)), adapterIds: Object.freeze(sourceBindings.map(({ adapterId }) => adapterId)), sourceBindings };
      } else if (request.input.kind === 'history') {
        const market = await load(request.input.marketRef);
        const records = await store.list(request.input.marketRef, request.input.afterSequence ?? 0, request.input.limit);
        if (!historyAllowedByVenue.has(market.venueId)) throw new Error('prediction_history_terms_unqualified');
        const projected = Object.freeze(records.map((record) => Object.freeze({ ...record, snapshot: projectDerivedPredictionMarket(record.snapshot), hashScope: 'retained_internal_normalized_snapshot' })));
        const sourceBindings = sourceBindingsForMarkets([market]);
        completed = { output: Object.freeze({ kind: 'history', marketRef: request.input.marketRef, records: projected, retention: Object.freeze({ maximumSnapshotsPerMarket: store.maximumSnapshotsPerMarket ?? null, bounded: true }), supplyAttributions: market.supplyAttributions }), qualificationIds: Object.freeze(sourceBindings.map(({ qualificationId }) => qualificationId)), adapterIds: Object.freeze(sourceBindings.map(({ adapterId }) => adapterId)), sourceBindings };
      } else {
        const market = await load(request.input.marketRef);
        let report;
        let attributedMarkets = [market];
        if (request.input.compareMarketRef !== undefined) {
          const comparison = await load(request.input.compareMarketRef);
          report = derivePredictionDisagreementSignals(market, comparison);
          attributedMarkets = [market, comparison];
        } else {
          if (!historyAllowedByVenue.has(market.venueId)) throw new Error('prediction_history_terms_unqualified');
          const records = typeof store.latest === 'function' ? await store.latest(request.input.marketRef, 2) : await store.list(request.input.marketRef, 0, 100);
          report = records.length < 2 ? Object.freeze({ usable: false, reason: 'insufficient_evidence', observedAt: market.observedAt, signals: Object.freeze([]) }) : derivePredictionMovementSignals(records.at(-2).snapshot, records.at(-1).snapshot);
        }
        const sourceBindings = sourceBindingsForMarkets(attributedMarkets);
        completed = { output: Object.freeze({ kind: 'signal', usable: report.usable, reason: report.reason, observedAt: report.observedAt, signals: report.signals, provenance: report.provenance ?? Object.freeze([]), supplyAttributions: uniqueAttributions(attributedMarkets) }), qualificationIds: Object.freeze(sourceBindings.map(({ qualificationId }) => qualificationId)), adapterIds: Object.freeze(sourceBindings.map(({ adapterId }) => adapterId)), sourceBindings };
      }
      } finally { clearTimeout(timer); }
      const completedAt = new Date(now()).toISOString();
      return Object.freeze({ result: result(request, completed.output, completedAt), qualificationIds: completed.qualificationIds, adapterIds: completed.adapterIds, sourceBindings: completed.sourceBindings });
    },
  });
}
