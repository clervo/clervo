import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTRACT_VERSION, hashJson } from '../../dist/packages/contracts/src/index.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';
import { PREDICTION_RESULT_SCHEMA_VERSION } from '../../apps/api/src/x402-paid-prediction.mjs';

const now = '2026-08-04T12:00:00.000Z';

test('public Prediction route challenges before validation, settles useful output once, and replays', async (context) => {
  const calls = { challenge: 0, execute: 0, settle: 0 };
  const service = { mode: 'settlement_enabled', async challenge({ quote, resourcePath }) { calls.challenge += 1; return { status: 402, headers: { 'PAYMENT-REQUIRED': 'prediction', 'WWW-Authenticate': 'Payment id="prediction"' }, body: { accepts: [{ amount: quote.maximumCharge.amountAtomic }], resource: { url: `https://api.clervo.dev${resourcePath}` } } }; }, async authorize() { return { fingerprint: `sha256:${'7'.repeat(64)}` }; }, async settle() { calls.settle += 1; return { kind: 'settled', headers: {}, settlement: { network: 'eip155:8453', transaction: `0x${'8'.repeat(64)}` } }; } };
  const runtime = { durable: true, async ready() { return true; }, async execute(request) { calls.execute += 1; assert.equal(request.maximumCharge.amountAtomic, '2000'); const output = { kind: 'markets', state: 'available', markets: [], events: [], venues: [{ venueId: 'polymarket', state: 'available', marketCount: 0, failureCode: null }], nextCursor: null }; const unsigned = { contractVersion: CONTRACT_VERSION, schemaVersion: PREDICTION_RESULT_SCHEMA_VERSION, operationId: request.operationId, productId: request.productId, completedAt: now, meteredCharge: { asset: 'USD', amountAtomic: '0', decimals: 6 }, output }; const qualificationId = `qual_${'a'.repeat(24)}`; return { qualificationIds: [qualificationId], adapterIds: ['adapter_prediction.pdata_rest'], sourceBindings: [{ adapterId: 'adapter_prediction.pdata_rest', qualificationId }], result: { ...unsigned, resultHash: hashJson(unsigned) } }; } };
  const server = createSearchServer({ executor: { async execute() { throw new Error('unused'); } }, now: () => now, edgeAuthorization: 'edge-authorization-at-least-32-characters', x402Service: service, x402StateStore: new InMemoryX402OperationStore({ environmentNamespace: 'prediction_http' }), predictionRuntime: runtime });
  server.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve)); context.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`; const edge = { 'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters' };
  const probe = await fetch(`${origin}/v1/prediction/execute`, { method: 'POST', headers: edge }); assert.equal(probe.status, 402); assert.equal(probe.headers.has('www-authenticate'), true); assert.equal((await probe.json()).accepts[0].amount, '2000');
  const body = JSON.stringify({ kind: 'markets', status: 'open', limit: 3 }); const headers = { ...edge, 'content-type': 'application/json', 'idempotency-key': 'idem_prediction_http_001' };
  assert.equal((await fetch(`${origin}/v1/prediction/execute`, { method: 'POST', headers, body })).status, 402);
  const paid = await fetch(`${origin}/v1/prediction/execute`, { method: 'POST', headers: { ...headers, 'payment-signature': 'opaque' }, body }); assert.equal(paid.status, 200); const paidBody = await paid.json(); assert.equal(paidBody.result.output.kind, 'markets'); assert.equal(paidBody.receipt.customerCharge.amountAtomic, '2000'); assert.equal(paidBody.receipt.supplierCost.amountAtomic, '0'); assert.equal(paidBody.receipt.requestHash, paidBody.requestHash); assert.equal(paidBody.receipt.settlement.status, 'settled'); assert.equal(paidBody.receipt.provenance[0].adapterId, 'adapter_prediction.pdata_rest');
  const replay = await fetch(`${origin}/v1/prediction/execute`, { method: 'POST', headers, body }); assert.equal(replay.status, 200); assert.equal((await replay.json()).replayed, true);
  const conflict = await fetch(`${origin}/v1/prediction/execute`, { method: 'POST', headers, body: JSON.stringify({ kind: 'markets', status: 'open', limit: 4 }) }); assert.equal(conflict.status, 409);
  assert.deepEqual(calls, { challenge: 2, execute: 1, settle: 1 });
});

test('Prediction execution failure produces no settlement or successful receipt and quarantines retry', async (context) => {
  const calls = { settle: 0 };
  const service = { mode: 'settlement_enabled', async challenge({ quote }) { return { status: 402, headers: { 'PAYMENT-REQUIRED': 'prediction' }, body: { accepts: [{ amount: quote.maximumCharge.amountAtomic }] } }; }, async authorize() { return { fingerprint: `sha256:${'9'.repeat(64)}` }; }, async settle() { calls.settle += 1; return { kind: 'settled', headers: {}, settlement: { network: 'eip155:8453', transaction: `0x${'8'.repeat(64)}` } }; } };
  const runtime = { durable: true, async ready() { return true; }, async execute() { throw new Error('prediction_sources_unavailable'); } };
  const server = createSearchServer({ executor: { async execute() { throw new Error('unused'); } }, now: () => now, edgeAuthorization: 'edge-authorization-at-least-32-characters', x402Service: service, x402StateStore: new InMemoryX402OperationStore({ environmentNamespace: 'prediction_failure_http' }), predictionRuntime: runtime });
  server.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve)); context.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`; const headers = { 'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters', 'content-type': 'application/json', 'idempotency-key': 'idem_prediction_failure_001' }; const body = JSON.stringify({ kind: 'search', query: 'Fed cut', limit: 3 });
  assert.equal((await fetch(`${origin}/v1/prediction/execute`, { method: 'POST', headers, body })).status, 402);
  const failed = await fetch(`${origin}/v1/prediction/execute`, { method: 'POST', headers: { ...headers, 'payment-signature': 'opaque' }, body });
  assert.notEqual(failed.status, 200);
  assert.equal(calls.settle, 0);
  assert.equal((await fetch(`${origin}/v1/prediction/execute`, { method: 'POST', headers, body })).status, 503);
});
