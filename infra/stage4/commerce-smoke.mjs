#!/usr/bin/env node

import assert from 'node:assert/strict';
import { SEARCH_PAID_PATH } from '../../dist/packages/contracts/src/index.js';

const origin = process.env.CLERVO_STAGE4_COMMERCE_ORIGIN ?? 'http://127.0.0.1:8080';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('stage4_commerce_origin_must_be_loopback');

async function post(key, body, payment) {
  return fetch(`${origin}${SEARCH_PAID_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      ...(payment === undefined ? {} : { 'x-clervo-mock-payment': Buffer.from(JSON.stringify(payment)).toString('base64') }),
    },
    body: JSON.stringify(body),
  });
}
const payment = (quote, id) => ({ mode: 'mock', paymentId: id, quoteId: quote.quoteId, quoteHash: quote.quoteHash, requestHash: quote.requestHash, amount: quote.maximumCharge });

const health = await fetch(`${origin}/healthz`).then((response) => response.json());
assert.equal(health.paidExecutionEnabled, true);
const results = [];
for (const [name, body, productId, amountAtomic] of [
  ['raw', { query: 'stage four mock commerce raw evidence', synthesize: false }, 'search.web', '1000'],
  ['synthesis', { query: 'stage four mock commerce synthesis evidence', synthesize: true }, 'search.answer', '2500'],
]) {
  const key = `stage4-commerce-${name}`;
  const challenged = await post(key, body); assert.equal(challenged.status, 402);
  const challenge = await challenged.json();
  assert.deepEqual([challenge.quote.productId, challenge.quote.maximumCharge.amountAtomic], [productId, amountAtomic]);
  const authorized = payment(challenge.quote, `mock:stage4-${name}`);
  const completed = await post(key, body, authorized); assert.equal(completed.status, 200);
  const result = await completed.json();
  assert.deepEqual([result.productId, result.receipt.productId, result.receipt.customerCharge.amountAtomic], [productId, productId, amountAtomic]);
  const replayed = await post(key, body, authorized); assert.equal(replayed.status, 200); assert.equal(replayed.headers.get('idempotency-replayed'), 'true');
  const replay = await replayed.json(); assert.equal(replay.replayed, true); assert.equal(replay.receipt.receiptHash, result.receipt.receiptHash);
  results.push({ productId, amountAtomic, priceVersion: challenge.quote.priceVersion, challengeStatus: 402, completionStatus: 200, replayWithoutSecondExecution: true, receiptHash: result.receipt.receiptHash });
}

process.stdout.write(`${JSON.stringify({ schemaVersion: 'clervo.stage4.commerce-smoke.v1', paymentMode: 'private_mock_only', realPayment: false, usdcSpent: 0, passed: true, results })}\n`);
