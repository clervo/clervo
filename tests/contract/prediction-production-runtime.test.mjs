import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTRACT_VERSION } from '../../dist/packages/contracts/src/index.js';
import { createPredictionProductionRuntime } from '../../apps/api/src/prediction-production-runtime.mjs';
import { PREDICTION_REQUEST_SCHEMA_VERSION } from '../../apps/api/src/x402-paid-prediction.mjs';

const nowMs = Date.parse('2026-08-04T12:00:00.000Z');
const polymarket = { id: '123', question: 'Will the example launch happen?', description: 'Resolves Yes if the launch occurs.', category: 'Technology', active: true, closed: false, startDate: '2026-01-01T00:00:00Z', endDate: '2026-12-31T23:59:59Z', resolutionSource: 'https://official.example/launch', outcomes: '["Yes","No"]', outcomePrices: '["0.55","0.45"]', liquidityNum: 123.45, volumeNum: 456.78, fee: 0.02, slug: 'example-launch', umaResolutionStatus: 'proposed' };
const kalshi = { ticker: 'KXTEST-26', title: 'Will the example launch happen?', subtitle: 'A binary launch market.', category: 'Technology', rules_primary: 'Resolves Yes if the launch occurs.', rules_secondary: 'The official announcement controls.', status: 'open', open_time: '2026-01-01T00:00:00Z', close_time: '2026-12-31T23:59:59Z', yes_bid_dollars: '0.54', yes_ask_dollars: '0.56' };

function store() {
  const values = new Map(); const history = new Map();
  return { durable: true, async ready() { return true; }, async put(value) { values.set(value.marketRef, value); }, async get(ref) { return values.get(ref); }, async append(value) { const list = history.get(value.marketRef) ?? []; if (!list.some(({ observedAt }) => observedAt === value.observedAt)) list.push({ sequence: list.length + 1, marketRef: value.marketRef, venueId: value.venueId, observedAt: value.observedAt, previousHash: null, payloadHash: 'a'.repeat(64), recordHash: 'b'.repeat(64), snapshot: value }); history.set(value.marketRef, list); return { record: list.at(-1), replayed: false }; }, async list(ref, after = 0, limit = 100) { return (history.get(ref) ?? []).filter(({ sequence }) => sequence > after).slice(0, limit); } };
}

function sourceRegistry() {
  return { customerRoutingEnabled: true, schemaVersion: 'clervo.prediction-source-routes.v1', sources: [
    { venueId: 'polymarket', qualificationId: 'qual_PolymarketPublicData20260809', technicalQualification: 'qualified', technicalObservedAt: '2026-08-01T00:00:00.000Z', technicalExpiresAt: '2026-08-16T00:00:00.000Z', commercialPermission: 'approved', publicSellable: true, customerRoutingEnabled: true, historyPermission: 'approved' },
    { venueId: 'kalshi', qualificationId: 'qual_KalshiPublicData20260809', technicalQualification: 'qualified', technicalObservedAt: '2026-08-01T00:00:00.000Z', technicalExpiresAt: '2026-08-16T00:00:00.000Z', commercialPermission: 'approved', publicSellable: true, customerRoutingEnabled: true, historyPermission: 'approved' },
  ] };
}

test('prediction production runtime retains both public venue results and emits a hash-bound result', async () => {
  const runtime = createPredictionProductionRuntime({
    store: store(), now: () => nowMs, sourceRegistry: sourceRegistry(),
    async fetcher(input) {
      const url = new URL(input);
      return url.hostname === 'gamma-api.polymarket.com' ? Response.json([polymarket]) : Response.json({ markets: [kalshi] });
    },
  });
  const request = { contractVersion: CONTRACT_VERSION, schemaVersion: PREDICTION_REQUEST_SCHEMA_VERSION, operationId: `op_${'a'.repeat(32)}`, productId: 'prediction.markets', input: { kind: 'markets', status: 'open', limit: 3 }, maximumCharge: { asset: 'USD', amountAtomic: '10', decimals: 6 }, deadlineAt: '2026-08-04T12:00:30.000Z' };
  const completed = await runtime.execute(request);
  assert.equal(completed.result.output.kind, 'markets');
  assert.equal(completed.result.output.state, 'available');
  assert.equal(completed.result.output.markets.length, 2);
  assert.equal(completed.result.output.events.length, 2);
  assert.equal(completed.qualificationIds.length, 2);
  assert.match(completed.result.resultHash, /^sha256:[a-f0-9]{64}$/u);
});

test('prediction production runtime degrades to the remaining valid venue without fabricating a second result', async () => {
  const runtime = createPredictionProductionRuntime({ store: store(), now: () => nowMs, sourceRegistry: sourceRegistry(), async fetcher(input) { if (new URL(input).hostname.includes('kalshi')) return new Response('down', { status: 503, headers: { 'content-type': 'application/json' } }); return Response.json([polymarket]); } });
  const request = { contractVersion: CONTRACT_VERSION, schemaVersion: PREDICTION_REQUEST_SCHEMA_VERSION, operationId: `op_${'b'.repeat(32)}`, productId: 'prediction.markets', input: { kind: 'markets', limit: 3 }, maximumCharge: { asset: 'USD', amountAtomic: '10', decimals: 6 }, deadlineAt: '2026-08-04T12:00:30.000Z' };
  const completed = await runtime.execute(request);
  assert.equal(completed.result.output.state, 'degraded');
  assert.equal(completed.result.output.markets.length, 1);
  assert.equal(completed.qualificationIds.length, 1);
});

test('prediction production runtime reports partial malformed source data as degraded while retaining valid evidence', async () => {
  const onlyPolymarket = { ...sourceRegistry(), sources: [sourceRegistry().sources[0]] };
  const runtime = createPredictionProductionRuntime({ store: store(), now: () => nowMs, sourceRegistry: onlyPolymarket, async fetcher() { return Response.json([{ unexpected: true }, polymarket]); } });
  const request = { contractVersion: CONTRACT_VERSION, schemaVersion: PREDICTION_REQUEST_SCHEMA_VERSION, operationId: `op_${'c'.repeat(32)}`, productId: 'prediction.markets', input: { kind: 'markets', limit: 3 }, maximumCharge: { asset: 'USD', amountAtomic: '1000', decimals: 6 }, deadlineAt: '2026-08-04T12:00:30.000Z' };
  const completed = await runtime.execute(request);
  assert.equal(completed.result.output.state, 'degraded');
  assert.equal(completed.result.output.markets.length, 1);
  assert.deepEqual(completed.result.output.venues[0], { venueId: 'polymarket', state: 'degraded', marketCount: 1, failureCode: 'partial_malformed_source' });
});
