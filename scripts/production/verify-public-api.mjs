#!/usr/bin/env node

import assert from 'node:assert/strict';

const MAXIMUM_RESPONSE_BYTES = 1_048_576;
const DEFAULT_PUBLIC_ORIGIN = 'https://api.clervo.dev';

function checkedOrigin(value) {
  const origin = new URL(value);
  assert.equal(origin.protocol, 'https:', 'public_origin_must_use_https');
  assert.equal(origin.username, '', 'public_origin_must_not_include_credentials');
  assert.equal(origin.password, '', 'public_origin_must_not_include_credentials');
  assert.equal(origin.search, '', 'public_origin_must_not_include_query');
  assert.equal(origin.hash, '', 'public_origin_must_not_include_fragment');
  return origin;
}

async function getJson(origin, pathname) {
  const response = await fetch(new URL(pathname, origin), {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200, `${pathname}:unexpected_status`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAXIMUM_RESPONSE_BYTES, `${pathname}:invalid_response_size`);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function verifyPublicApi({ publicOrigin = DEFAULT_PUBLIC_ORIGIN } = {}) {
  const origin = checkedOrigin(publicOrigin);
  const [root, discovery, openapi, status, pricing, models, health, readiness] = await Promise.all([
    getJson(origin, '/'),
    getJson(origin, '/.well-known/clervo.json'),
    getJson(origin, '/openapi.json'),
    getJson(origin, '/status.json'),
    getJson(origin, '/pricing.json'),
    getJson(origin, '/v1/models'),
    getJson(origin, '/v1/health'),
    getJson(origin, '/readyz'),
  ]);

  assert.equal(root.service, 'Clervo API');
  assert.equal(discovery.distribution?.callable, true);
  assert.equal(discovery.payment?.publicAvailable, true);
  assert.ok(discovery.products?.length > 0, 'public_products_missing');
  for (const pathname of ['/v1/ai/execute', '/v1/chat/completions', '/v1/messages', '/v1/responses']) {
    assert.ok(openapi.paths?.[pathname], `${pathname}:openapi_path_missing`);
  }
  assert.equal(status.publicApi?.publicCallable, true);
  assert.equal(status.publicApi?.publicTraffic, true);
  assert.equal(pricing.publicOfferAvailable, true);
  assert.ok(pricing.offers?.length > 0, 'public_offers_missing');
  assert.ok(models.data?.length > 0, 'public_models_missing');
  assert.equal(health.status, 'ok');
  assert.equal(health.stateBackend, 'postgres');
  assert.equal(health.durableState, true);
  assert.equal(health.trafficMode, 'open');
  assert.equal(health.paidExecutionEnabled, true);
  assert.equal(readiness.status, 'ready');
  assert.equal(readiness.stateBackend, 'postgres');
  assert.equal(readiness.durableState, true);

  return {
    schemaVersion: 'clervo.production-live-health.v1',
    checkedAt: new Date().toISOString(),
    publicOrigin: origin.origin,
    checks: {
      root: true,
      discovery: true,
      openapi: true,
      status: true,
      pricing: true,
      models: true,
      health: true,
      readiness: true,
      durableState: true,
      publicTraffic: true,
    },
    requests: 8,
    mutations: 0,
    paymentAttempted: false,
    paymentSigned: false,
    paymentSettled: false,
    usdcSpent: 0,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await verifyPublicApi({ publicOrigin: process.env.CLERVO_PUBLIC_API_ORIGIN ?? DEFAULT_PUBLIC_ORIGIN });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
