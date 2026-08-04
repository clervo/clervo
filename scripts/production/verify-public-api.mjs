#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

const MAXIMUM_RESPONSE_BYTES = 1_048_576;
const DEFAULT_PUBLIC_ORIGIN = 'https://api.clervo.dev';
const DEFAULT_CLOUD_RUN_ORIGIN = 'https://clervo-api-production-jbtbib4yqa-uc.a.run.app';

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function requestJson(origin, pathname, options = {}, expectedStatus = 200) {
  const response = await fetch(new URL(pathname, origin), {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.byteLength <= MAXIMUM_RESPONSE_BYTES, `${pathname}:response_too_large`);
  assert.equal(response.status, expectedStatus, `${pathname}:unexpected_status`);
  const body = bytes.byteLength === 0 ? null : JSON.parse(new TextDecoder().decode(bytes));
  return { response, body, bodyHash: digest(bytes) };
}

export async function verifyPublicApi({
  publicOrigin = DEFAULT_PUBLIC_ORIGIN,
  cloudRunOrigin = DEFAULT_CLOUD_RUN_ORIGIN,
} = {}) {
  assert.equal(new URL(publicOrigin).protocol, 'https:', 'public_origin_must_use_https');
  assert.equal(new URL(cloudRunOrigin).protocol, 'https:', 'cloud_run_origin_must_use_https');
  const runId = randomBytes(8).toString('hex');
  const rawKey = `public-smoke-raw-${runId}`;
  const challengeKey = `public-smoke-quote-${runId}`;
  const rawBody = JSON.stringify({
    query: 'x402 payment protocol idempotency documentation',
    maxResults: 3,
    synthesize: false,
    language: 'en',
    region: 'US',
  });
  const synthesisBody = JSON.stringify({
    query: 'x402 payment protocol idempotency documentation',
    maxResults: 3,
    synthesize: true,
    language: 'en',
    region: 'US',
  });
  const productHeaders = { 'content-type': 'application/json', 'idempotency-key': rawKey };

  const root = await requestJson(publicOrigin, '/');
  assert.equal(root.body?.service, 'Clervo API');
  const health = await requestJson(publicOrigin, '/v1/health');
  assert.equal(health.body?.status, 'ok');
  assert.equal(health.body?.retrievalMode, 'live_external');
  assert.equal(health.body?.paidExecutionEnabled, true);
  assert.equal(health.body?.durableState, true);
  const readiness = await requestJson(publicOrigin, '/readyz');
  assert.equal(readiness.body?.status, 'ready');

  const raw = await requestJson(publicOrigin, '/v1/search/free', {
    method: 'POST', headers: productHeaders, body: rawBody,
  });
  assert.equal(raw.body?.productId, 'search.web');
  assert.equal(raw.body?.fundingMode, 'free');
  assert.equal(raw.body?.replayed, false);
  assert.ok(raw.body?.output?.searchResponse?.results?.length > 0, 'raw_search_results_missing');
  assert.ok(raw.body?.output?.searchResponse?.citations?.length > 0, 'raw_search_citations_missing');

  const replay = await requestJson(publicOrigin, '/v1/search/free', {
    method: 'POST', headers: productHeaders, body: rawBody,
  });
  assert.equal(replay.body?.operationId, raw.body.operationId);
  assert.equal(replay.body?.receipt?.receiptId, raw.body.receipt.receiptId);
  assert.equal(replay.body?.replayed, true);
  assert.equal(replay.response.headers.get('idempotency-replayed'), 'true');
  assert.deepEqual(replay.body?.output, raw.body.output);

  const synthesis = await requestJson(publicOrigin, '/v1/search/free', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': `public-smoke-synthesis-${runId}` },
    body: synthesisBody,
  }, 503);
  assert.equal(synthesis.body?.code, 'search_synthesis_unavailable');

  const challengeHeaders = { 'content-type': 'application/json', 'idempotency-key': challengeKey };
  const challenge = await requestJson(publicOrigin, '/v1/search/paid', {
    method: 'POST', headers: challengeHeaders, body: rawBody,
  }, 402);
  const repeatedChallenge = await requestJson(publicOrigin, '/v1/search/paid', {
    method: 'POST', headers: challengeHeaders, body: rawBody,
  }, 402);
  const paymentRequired = challenge.response.headers.get('payment-required');
  assert.ok(paymentRequired && paymentRequired.length > 32, 'payment_required_header_missing');
  assert.equal(repeatedChallenge.response.headers.get('payment-required'), paymentRequired);
  assert.equal(repeatedChallenge.bodyHash, challenge.bodyHash);

  const privateRoute = await requestJson(publicOrigin, '/internal/v1/sandbox/run', { method: 'POST' }, 404);
  assert.equal(privateRoute.body?.code, 'not_found');
  const directOrigin = await requestJson(cloudRunOrigin, '/v1/search/free', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': `public-smoke-direct-${runId}` },
    body: rawBody,
  }, 401);
  assert.equal(directOrigin.body?.code, 'edge_unauthorized');
  const cors = await requestJson(publicOrigin, '/v1/search/paid', { method: 'OPTIONS' }, 204);
  assert.equal(cors.response.headers.get('access-control-allow-origin'), '*');
  assert.match(cors.response.headers.get('access-control-allow-headers') ?? '', /payment-signature/u);

  return {
    schemaVersion: 'clervo.public-api-smoke.v1',
    verifiedAt: new Date().toISOString(),
    publicOrigin,
    cloudRunOriginProtected: true,
    root: root.response.status,
    health: health.response.status,
    readiness: readiness.response.status,
    rawSearch: {
      status: raw.response.status,
      resultCount: raw.body.output.searchResponse.results.length,
      citationCount: raw.body.output.searchResponse.citations.length,
      replaySameOperation: replay.body.operationId === raw.body.operationId,
      replaySameReceipt: replay.body.receipt.receiptId === raw.body.receipt.receiptId,
      replayMarked: replay.body.replayed === true,
      replayedOutputIdentical: JSON.stringify(replay.body.output) === JSON.stringify(raw.body.output),
    },
    synthesis: { status: synthesis.response.status, code: synthesis.body.code },
    x402Challenge: { status: challenge.response.status, stable: repeatedChallenge.bodyHash === challenge.bodyHash, paymentAttempted: false },
    privateRoute: privateRoute.response.status,
    directOrigin: directOrigin.response.status,
    cors: cors.response.status,
    paymentSigned: false,
    paymentSettled: false,
    ownerCashSpentUsd: 0,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await verifyPublicApi({
    publicOrigin: process.env.CLERVO_PUBLIC_API_ORIGIN ?? DEFAULT_PUBLIC_ORIGIN,
    cloudRunOrigin: process.env.CLERVO_CLOUD_RUN_ORIGIN ?? DEFAULT_CLOUD_RUN_ORIGIN,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
