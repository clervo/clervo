import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PUBLIC_SEARCH_DISTRIBUTION_PROJECTION,
  assertPublicArtifacts,
  createDiscoveryDocument,
  createLlmsText,
  createOpenApiDocument,
} from '../../dist/packages/contracts/src/index.js';
import { verifyPublicApi } from '../../scripts/production/verify-public-api.mjs';

const root = new URL('../..', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const text = async (path) => readFile(new URL(path, root), 'utf8');

test('public launch policy exposes qualified Search, AI, Sandbox, Prediction, and Crypto through a zero-traffic fail-closed rollout', async () => {
  const policy = await json('infra/production/gcp/public-launch.v1.json');
  const release = await json('infra/production/cloudflare/public-search-release.v1.json');
  const launchState = await json('packages/catalog/launch-state.v1.json');
  const worker = await json('apps/worker/wrangler.jsonc');
  assert.equal(policy.publicOrigin, 'https://api.clervo.dev/');
  assert.equal(policy.search.mode, 'live_external');
  assert.equal(policy.search.synthesisEnabled, false);
  assert.equal(policy.search.automaticPaidOverage, false);
  assert.equal(policy.commerce.mode, 'settlement_enabled');
  assert.equal(policy.sandbox.publicRoute, true);
  assert.equal(policy.sandbox.publicMode, 'paid');
  assert.match(policy.sandbox.runnerDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(policy.sandbox.maximumChargeAtomic, '120000');
  assert.match(policy.ai.routeFamilies, /deepgram/u);
  assert.equal(policy.ai.artifacts.mode, 'r2');
  assert.equal(policy.ai.artifacts.bucket, 'clervo-artifacts');
  assert.equal(policy.ai.artifacts.retentionSeconds, 604800);
  assert.equal(policy.prediction.mode, 'paid');
  assert.equal(policy.prediction.publicRoute, true);
  assert.equal(policy.prediction.qualifiedAdapter, 'adapter_prediction.pdata_rest');
  assert.deepEqual(policy.prediction.qualifiedVenues, ['polymarket', 'kalshi', 'manifold', 'limitless']);
  assert.equal(policy.prediction.supplierCostMicrousd, 0);
  assert.equal(policy.prediction.attributionRequired, true);
  assert.equal(policy.crypto.mode, 'paid');
  assert.equal(policy.crypto.publicRoute, true);
  assert.equal(policy.crypto.qualifiedAdapter, 'adapter_crypto.blockscout_value_added');
  assert.deepEqual(policy.crypto.supportedChains, ['eip155:1', 'eip155:8453']);
  assert.equal(policy.crypto.supplierCostMicrousd, 0);
  assert.equal(policy.crypto.rawApiResaleAllowed, false);
  assert.equal(policy.rollout.deployTrafficPercent, 0);
  assert.equal(policy.rollout.publicAccessEnabledOnlyAfterPromotion, true);
  assert.equal(policy.rollout.publicAccessMethod, 'cloud_run_invoker_iam_check_disabled');
  assert.equal(policy.edge.sharedSecret, 'clervo-production-edge-authorization');
  assert.ok(policy.protectedResources.includes('ai.clervo.dev'));
  assert.deepEqual(worker.secrets.required, ['CLERVO_EDGE_AUTHORIZATION']);
  assert.equal(worker.vars.CLERVO_AI_PUBLIC_ENABLED, 'true');
  assert.equal(worker.vars.CLERVO_SANDBOX_PUBLIC_ENABLED, 'true');
  assert.equal(worker.vars.CLERVO_PREDICTION_PUBLIC_ENABLED, 'true');
  assert.equal(worker.vars.CLERVO_CRYPTO_PUBLIC_ENABLED, 'true');
  assert.deepEqual(worker.routes.map(({ pattern }) => pattern), ['api.clervo.dev/', 'api.clervo.dev/*']);
  assert.equal(release.state, 'public_preview_verified');
  assert.equal(release.edge.trafficPercent, 100);
  assert.equal(release.origin.directProductAccessStatus, 401);
  assert.equal(release.observed.rawSearchStatus, 200);
  assert.equal(release.observed.x402ChallengeStatus, 402);
  assert.equal(release.commerce.paymentAttempted, false);
  assert.equal(release.commerce.revenueEvidence, false);
  assert.deepEqual(release.protectedResourcesTouched, []);
  assert.equal(launchState.distribution.publicApi.publicCallable, true);
  assert.equal(launchState.distribution.publicApi.publicTraffic, true);
  assert.equal(launchState.paymentProof.publicCustomerPaymentAvailable, true);
  assert.equal(launchState.paymentProof.revenueEvidence, false);
  assert.equal(launchState.products.find(({ id }) => id === 'search').customerLifecycle, 'preview_publicly_callable');
  assert.equal(launchState.products.find(({ id }) => id === 'ai').customerLifecycle, 'preview_publicly_callable');
  assert.equal(launchState.products.find(({ id }) => id === 'sandbox').customerLifecycle, 'preview_publicly_callable');
});

test('public release tooling keeps deployment private until all independent promotion checks pass', async () => {
  const source = await text('scripts/production/gcp-public-launch.mjs');
  const prober = await text('scripts/probe-live-registry.mjs');
  const discoveryGenerator = await text('scripts/generate-discovery.mjs');
  assert.match(source, /--no-allow-unauthenticated/u);
  assert.match(source, /--no-traffic/u);
  assert.match(source, /CLERVO_LIVE_SEARCH_SMOKE/u);
  assert.match(source, /CLERVO_X402_CHALLENGE_SMOKE/u);
  assert.match(source, /CLERVO_SANDBOX_LIVE_SMOKE/u);
  assert.match(source, /CLERVO_PREDICTION_LIVE_SMOKE/u);
  assert.match(source, /CLERVO_PREDICTION_MODE/u);
  assert.match(source, /CLERVO_CRYPTO_LIVE_SMOKE/u);
  assert.match(source, /CLERVO_CRYPTO_MODE/u);
  assert.match(source, /CLERVO_BLOCKSCOUT_SECRET_VERSION/u);
  assert.match(source, /CLERVO_MONITORING_DELIVERY/u);
  assert.match(source, /--no-invoker-iam-check/u);
  assert.match(source, /--invoker-iam-check/u);
  assert.match(source, /publicAccessEnabledOnlyAfterPromotion/u);
  assert.match(source, /CLERVO_EDGE_AUTHORIZATION_SECRET_VERSION/u);
  assert.match(source, /CLERVO_ARTIFACT_SIGNING_SECRET_VERSION/u);
  assert.match(source, /CLERVO_R2_SECRET_ACCESS_KEY_SECRET_VERSION/u);
  assert.match(source, /CLERVO_DEEPGRAM_SECRET_VERSION/u);
  assert.match(prober, /api\.prediction_execute/u);
  assert.match(prober, /probeIds: \{ paid: 'api\.prediction_execute' \}/u);
  assert.match(prober, /api\.crypto_execute/u);
  assert.match(prober, /probeIds: \{ paid: 'api\.crypto_execute' \}/u);
  assert.match(prober, /productId: 'prediction', resourcePath: '\/v1\/prediction\/execute'/u);
  assert.match(discoveryGenerator, /publicPrediction = observedLive\.prediction/u);
  assert.match(discoveryGenerator, /openapi\.paths\['\/v1\/prediction\/execute'\]/u);
  assert.match(discoveryGenerator, /publicCrypto = observedLive\.crypto_intelligence/u);
  assert.match(discoveryGenerator, /openapi\.paths\['\/v1\/crypto\/execute'\]/u);
  assert.match(discoveryGenerator, /priceModel: 'request_derived_per_operation'/u);
});

test('API edge publishes enabled products while blocking private control and disabled public products', async () => {
  const worker = (await import('../../apps/worker/src/api-edge.js')).default;
  const rootResponse = await worker.fetch(new Request('https://api.clervo.dev/'));
  assert.equal(rootResponse.status, 200);
  assert.equal((await rootResponse.json()).discovery, 'https://api.clervo.dev/.well-known/clervo.json');
  const favicon = await worker.fetch(new Request('https://api.clervo.dev/favicon.ico'));
  assert.equal(favicon.status, 200);
  assert.match(favicon.headers.get('content-type') ?? '', /image\/svg\+xml/u);
  const discovery = await worker.fetch(new Request('https://api.clervo.dev/.well-known/clervo.json'));
  assert.equal(discovery.status, 200);
  assert.equal((await discovery.json()).name, 'Clervo');
  const openapi = await worker.fetch(new Request('https://api.clervo.dev/openapi.json'));
  assert.equal(openapi.status, 200);
  assert.equal((await openapi.json()).openapi, '3.1.1');
  const unsafeQuery = await worker.fetch(new Request('https://api.clervo.dev/openapi.json?version=old'));
  assert.equal(unsafeQuery.status, 400);
  const internal = await worker.fetch(new Request('https://api.clervo.dev/internal/v1/sandbox/run', { method: 'POST' }));
  assert.equal(internal.status, 404);
  const preflight = await worker.fetch(new Request('https://api.clervo.dev/v1/search/paid', { method: 'OPTIONS' }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /payment-signature/u);
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /authorization/u);
  const disabledAi = await worker.fetch(new Request('https://api.clervo.dev/v1/ai/execute', { method: 'OPTIONS' }));
  assert.equal(disabledAi.status, 404);
  const aiPreflight = await worker.fetch(new Request('https://api.clervo.dev/v1/ai/execute', { method: 'OPTIONS' }), { CLERVO_AI_PUBLIC_ENABLED: 'true' });
  assert.equal(aiPreflight.status, 204);
  assert.match(aiPreflight.headers.get('access-control-expose-headers') ?? '', /www-authenticate/u);
  const oversizedAi = await worker.fetch(new Request('https://api.clervo.dev/v1/ai/execute', {
    method: 'POST',
    headers: { 'content-length': '262145' },
  }), { CLERVO_AI_PUBLIC_ENABLED: 'true' });
  assert.equal(oversizedAi.status, 413);
  const disabledSandbox = await worker.fetch(new Request('https://api.clervo.dev/v1/sandbox/execute', { method: 'OPTIONS' }), { CLERVO_AI_PUBLIC_ENABLED: 'true' });
  assert.equal(disabledSandbox.status, 404);
  const sandboxPreflight = await worker.fetch(new Request('https://api.clervo.dev/v1/sandbox/execute', { method: 'OPTIONS' }), { CLERVO_AI_PUBLIC_ENABLED: 'true', CLERVO_SANDBOX_PUBLIC_ENABLED: 'true' });
  assert.equal(sandboxPreflight.status, 204);
  const oversizedSandbox = await worker.fetch(new Request('https://api.clervo.dev/v1/sandbox/execute', {
    method: 'POST', headers: { 'content-length': '1500001' },
  }), { CLERVO_AI_PUBLIC_ENABLED: 'true', CLERVO_SANDBOX_PUBLIC_ENABLED: 'true' });
  assert.equal(oversizedSandbox.status, 413);
  const disabledRpc = await worker.fetch(new Request('https://api.clervo.dev/v1/rpc/execute', { method: 'OPTIONS' }), { CLERVO_AI_PUBLIC_ENABLED: 'true', CLERVO_SANDBOX_PUBLIC_ENABLED: 'true' });
  assert.equal(disabledRpc.status, 404);
  const rpcPreflight = await worker.fetch(new Request('https://api.clervo.dev/v1/rpc/execute', { method: 'OPTIONS' }), { CLERVO_RPC_PUBLIC_ENABLED: 'true' });
  assert.equal(rpcPreflight.status, 204);
  const oversizedRpc = await worker.fetch(new Request('https://api.clervo.dev/v1/rpc/execute', {
    method: 'POST', headers: { 'content-length': '262145' },
  }), { CLERVO_RPC_PUBLIC_ENABLED: 'true' });
  assert.equal(oversizedRpc.status, 413);
  const disabledPrediction = await worker.fetch(new Request('https://api.clervo.dev/v1/prediction/execute', { method: 'OPTIONS' }), { CLERVO_RPC_PUBLIC_ENABLED: 'true' });
  assert.equal(disabledPrediction.status, 404);
  const predictionPreflight = await worker.fetch(new Request('https://api.clervo.dev/v1/prediction/execute', { method: 'OPTIONS' }), { CLERVO_PREDICTION_PUBLIC_ENABLED: 'true' });
  assert.equal(predictionPreflight.status, 204);
  const oversizedPrediction = await worker.fetch(new Request('https://api.clervo.dev/v1/prediction/execute', { method: 'POST', headers: { 'content-length': '262145' } }), { CLERVO_PREDICTION_PUBLIC_ENABLED: 'true' });
  assert.equal(oversizedPrediction.status, 413);
  const disabledCrypto = await worker.fetch(new Request('https://api.clervo.dev/v1/crypto/execute', { method: 'OPTIONS' }), { CLERVO_PREDICTION_PUBLIC_ENABLED: 'true' });
  assert.equal(disabledCrypto.status, 404);
  const cryptoPreflight = await worker.fetch(new Request('https://api.clervo.dev/v1/crypto/execute', { method: 'OPTIONS' }), { CLERVO_CRYPTO_PUBLIC_ENABLED: 'true' });
  assert.equal(cryptoPreflight.status, 204);
  const oversizedCrypto = await worker.fetch(new Request('https://api.clervo.dev/v1/crypto/execute', { method: 'POST', headers: { 'content-length': '262145' } }), { CLERVO_CRYPTO_PUBLIC_ENABLED: 'true' });
  assert.equal(oversizedCrypto.status, 413);
  const artifactPath = `/v1/artifacts/tenant_${'a'.repeat(32)}/${'b'.repeat(64)}/png/1785819900/${'c'.repeat(43)}`;
  const artifactPreflight = await worker.fetch(new Request(`https://api.clervo.dev${artifactPath}`, { method: 'OPTIONS' }));
  assert.equal(artifactPreflight.status, 204);
  const artifactMethod = await worker.fetch(new Request(`https://api.clervo.dev${artifactPath}`, { method: 'POST' }));
  assert.equal(artifactMethod.status, 405);
  const malformedArtifact = await worker.fetch(new Request(`https://api.clervo.dev${artifactPath.slice(0, -1)}`));
  assert.equal(malformedArtifact.status, 404);
});

test('public Search discovery exposes only the exact verified raw product and preserves commercial boundaries', () => {
  const projection = PUBLIC_SEARCH_DISTRIBUTION_PROJECTION;
  const openapi = createOpenApiDocument({}, projection);
  const discovery = createDiscoveryDocument(projection);
  const llms = createLlmsText(projection);
  assert.doesNotThrow(() => assertPublicArtifacts(openapi, discovery, llms, projection));
  assert.equal(openapi['x-clervo-status'].distribution, 'public_preview');
  assert.equal(discovery.distribution.callable, true);
  assert.equal(discovery.payment.publicAvailable, true);
  assert.equal(discovery.payment.commercialProof, false);
  const raw = discovery.products.find(({ productId }) => productId === 'search.web');
  const answer = discovery.products.find(({ productId }) => productId === 'search.answer');
  assert.equal(raw.publicAvailable, true);
  assert.equal(raw.payment.payable, true);
  assert.equal(raw.pricing.displayPrice.asset, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  assert.equal(raw.pricing.displayPrice.amountAtomic, '6000');
  assert.equal(answer.publicAvailable, false);
  assert.equal(answer.payment.payable, false);
  assert.equal(answer.pricing.displayPrice, null);
  assert.match(llms, /no customer revenue or demand claimed/iu);
});

test('external public smoke verifies live retrieval, replay, stable challenge, isolation, and CORS without payment', async () => {
  const originalFetch = globalThis.fetch;
  let rawCalls = 0;
  const result = {
    operationId: 'op_publicsmoketest000000001',
    productId: 'search.web',
    fundingMode: 'free',
    replayed: false,
    output: { searchResponse: { results: [{ title: 'x402' }], citations: [{ id: 'citation-1' }] } },
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    if (url.hostname === 'origin.invalid') return Response.json({ code: 'edge_unauthorized' }, { status: 401 });
    if (url.pathname === '/') return Response.json({ service: 'Clervo API', discovery: 'https://public.invalid/.well-known/clervo.json' });
    if (url.pathname === '/.well-known/clervo.json') return Response.json({
      distribution: { state: 'public_preview', callable: true },
      payment: { publicAvailable: true, commercialProof: false },
      products: [
        { productId: 'search.web', publicAvailable: true },
        { productId: 'search.answer', publicAvailable: false },
      ],
    });
    if (url.pathname === '/openapi.json') return Response.json({ 'x-clervo-status': { distribution: 'public_preview', publicCallable: true } });
    if (url.pathname === '/pricing.json') return Response.json({ publicOfferAvailable: true, publicPrice: { productId: 'search.web', amountAtomic: '6000' } });
    if (url.pathname === '/v1/health') return Response.json({ status: 'ok', retrievalMode: 'live_external', paidExecutionEnabled: true, durableState: true });
    if (url.pathname === '/readyz') return Response.json({ status: 'ready' });
    if (url.pathname === '/internal/v1/sandbox/run') return Response.json({ code: 'not_found' }, { status: 404 });
    if (url.pathname === '/v1/search/paid' && method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'payment-signature' } });
    const body = JSON.parse(init.body);
    if (body.synthesize) return Response.json({ code: 'search_synthesis_unavailable' }, { status: 503 });
    if (url.pathname === '/v1/search/paid') return Response.json({ code: 'payment_required', exact: 'stable' }, { status: 402, headers: { 'payment-required': 'stable-payment-requirement-that-is-long-enough' } });
    rawCalls += 1;
    return Response.json({ ...result, replayed: rawCalls > 1 }, { headers: rawCalls > 1 ? { 'idempotency-replayed': 'true' } : {} });
  };
  try {
    const report = await verifyPublicApi({ publicOrigin: 'https://public.invalid', cloudRunOrigin: 'https://origin.invalid' });
    assert.equal(report.rawSearch.replaySameOperation, true);
    assert.equal(report.rawSearch.receiptExpected, false);
    assert.equal(report.x402Challenge.stable, true);
    assert.equal(report.paymentSigned, false);
    assert.equal(report.paymentSettled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
