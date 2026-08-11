#!/usr/bin/env node

import http from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  AI_MAX_BODY_BYTES,
  AI_PAID_PATH,
  CONTRACT_VERSION,
  InMemoryFreeSearchQuota,
  MockCommerceKernel,
  PAYMENT_REQUIRED_HEADER,
  SEARCH_FREE_PATH,
  SEARCH_MAX_BODY_BYTES,
  SEARCH_PAID_PATH,
  assertSearchExecutionOutput,
  aiHttpRequestHash,
  createMockChallengeResponse,
  createSearchHttpResult,
  normalizeSearchHttpRequest,
  normalizeAiHttpRequest,
  sealQuote,
  searchHttpRequestHash,
  searchProductId,
  searchProductPricing,
  validateIdempotencyKey,
} from '../../../dist/packages/contracts/src/index.js';
import { InMemorySearchStateStore } from './search-state-store.mjs';
import { createX402PaidSearchProcessor, x402SearchPricing } from './x402-paid-search.mjs';
import { createX402PaidAiProcessor } from './x402-paid-ai.mjs';
import { createFreeAiOperationProcessor } from './ai-free-operation.mjs';
import { createAiDiscoveryContract } from './ai-discovery.mjs';
import {
  SANDBOX_DISCOVERY,
  SANDBOX_MAX_BODY_BYTES as SANDBOX_PUBLIC_MAX_BODY_BYTES,
  SANDBOX_PAID_PATH,
  sandboxRunPricing,
  createX402PaidSandboxProcessor,
  normalizeSandboxHttpRequest,
  sandboxHttpRequestHash,
} from './x402-paid-sandbox.mjs';
import {
  RPC_DISCOVERY,
  RPC_MAX_BODY_BYTES,
  RPC_PAID_PATH,
  createX402PaidRpcProcessor,
  normalizeRpcHttpRequest,
  rpcHttpRequestHash,
  rpcPublicPricing,
} from './x402-paid-rpc.mjs';
import {
  PREDICTION_DISCOVERY,
  PREDICTION_MAX_BODY_BYTES,
  PREDICTION_PAID_PATH,
  createX402PaidPredictionProcessor,
  normalizePredictionHttpRequest,
  predictionHttpRequestHash,
  predictionPublicPricing,
} from './x402-paid-prediction.mjs';
import {
  CRYPTO_DISCOVERY,
  CRYPTO_MAX_BODY_BYTES,
  CRYPTO_PAID_PATH,
  createX402PaidCryptoProcessor,
  cryptoHttpRequestHash,
  cryptoPublicPricing,
  normalizeCryptoHttpRequest,
} from './x402-paid-crypto.mjs';

const JSON_TYPE = 'application/json; charset=utf-8';
const PROBLEM_TYPE = 'application/problem+json; charset=utf-8';
const MOCK_PAYMENT_HEADER = 'x-clervo-mock-payment';
const SANDBOX_PRIVATE_PATH = '/internal/v1/sandbox/run';
const SANDBOX_MAX_BODY_BYTES = 1_500_000;
const SEARCH_DISCOVERY_PROBE_REQUEST = Object.freeze({
  query: 'current x402 protocol documentation',
  maxResults: 3,
  synthesize: false,
  language: 'en',
  region: 'US',
});

function identifier(prefix, seed) {
  return `${prefix}_${createHash('sha256').update(seed).digest('hex').slice(0, 32)}`;
}

// A first-time caller of the free sample has no reason to know what an
// idempotency key is, and rejecting them with 400 lost them at the top of the
// funnel. When no key is supplied the server mints one and reports it in
// `idempotency-key` on the response, so the caller can replay deliberately.
//
// The generated key is random, never derived from the request. Deriving it from
// the body would silently collapse two unrelated callers asking the same
// question into one operation: the second would be served the first one's
// result as a replay. Randomness keeps every unkeyed request its own operation,
// which is exactly what a caller who supplied no key asked for.
//
// Callers that do supply a key take the untouched path below, so replay,
// conflict, and in-progress behaviour for them is unchanged.
function generatedIdempotencyKey() {
  return `srv.free.${randomUUID().replaceAll('-', '')}`;
}

function problem(status, code, title, detail, instance, operationId) {
  return {
    type: `https://api.clervo.dev/problems/${code.replaceAll('_', '-')}`,
    title,
    status,
    detail,
    instance,
    code,
    ...(operationId ? { operationId } : {}),
    retryable: status === 429 || status >= 500,
  };
}

function errorCode(error) {
  const raw = error instanceof Error ? error.message : 'internal_error';
  if (raw === 'Idempotency-Key must be 8-128 visible ASCII token characters') return 'invalid_idempotency_key';
  return /^[a-z][a-z0-9_]{2,63}$/.test(raw) ? raw : 'internal_error';
}

function send(response, status, body, headers = {}, contentType = JSON_TYPE) {
  response.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}

// `curl -d '{"query":"..."}'` sends `application/x-www-form-urlencoded`, so a
// first-time caller who copies the shortest possible command received 415 from
// the free sample. The free path therefore accepts any of the content types a
// naive client sends and still requires the body itself to be JSON; nothing is
// ever parsed as a form. Paid paths keep the strict check, because a payable
// request should be explicit about what it is sending.
//
// This makes the free route reachable by a cross-origin HTML form without a
// preflight. It is safe here and only here: the route is unauthenticated, reads
// no cookie, carries no ambient identity, is capped by the per-subject free
// quota, and answers `cache-control: no-store`. A forged submission can
// therefore consume a caller's own free quota and nothing else.
const NAIVE_CONTENT_TYPES = new Set(['application/json', 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']);

async function readJson(request, maximumBytes = SEARCH_MAX_BODY_BYTES, { acceptNaiveContentType = false, allowEmpty = false } = {}) {
  const contentType = request.headers['content-type'];
  const declaredType = typeof contentType === 'string' ? contentType.split(';', 1)[0].trim().toLowerCase() : '';
  const acceptable = acceptNaiveContentType
    ? declaredType === '' || NAIVE_CONTENT_TYPES.has(declaredType)
    : declaredType === 'application/json';
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > maximumBytes) throw Object.assign(new Error('request_body_too_large'), { status: 413 });
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximumBytes) throw Object.assign(new Error('request_body_too_large'), { status: 413 });
    chunks.push(chunk);
  }
  if (bytes === 0 && allowEmpty) return undefined;
  if (!acceptable) throw Object.assign(new Error('unsupported_media_type'), { status: 415 });
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
}

function parseMockPayment(value) {
  if (typeof value !== 'string') return undefined;
  try { return JSON.parse(Buffer.from(value, 'base64').toString('utf8')); } catch { throw Object.assign(new Error('invalid_mock_payment'), { status: 400 }); }
}

function internalAuthorized(value, expected) {
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(value.slice(7)); const required = Buffer.from(expected);
  return supplied.byteLength === required.byteLength && timingSafeEqual(supplied, required);
}

function mppAuthorization(value) {
  return typeof value === 'string' && /^Payment\s+/iu.test(value) ? value : undefined;
}

export function createSearchServer({
  executor,
  now = () => new Date().toISOString(),
  monotonicNow = () => performance.now(),
  freeQuota = new InMemoryFreeSearchQuota(),
  stateStore,
  commerce = new MockCommerceKernel(),
  monitor,
  allowMockPaidExecution = false,
  publicOrigin = 'https://api.clervo.dev',
  environment,
  releaseId,
  maxConcurrentExecutions = 16,
  trafficControl,
  x402Service,
  x402StateStore,
  sandboxGateway,
  sandboxApiToken,
  synthesisEnabled = true,
  retrievalMode = 'recorded',
  edgeAuthorization,
  aiPublicPricing,
  aiAdapters,
  aiAdapterFactory,
  aiRuntimeBindings,
  aiReady,
  aiFreeTier,
  aiArtifactAccess,
  aiMonitor,
  sandboxPublicRunnerDigest,
  rpcRuntime,
  predictionRuntime,
  cryptoRuntime,
} = {}) {
  if (!executor || typeof executor.execute !== 'function') throw new TypeError('search executor is required');
  if (monitor !== undefined && typeof monitor.record !== 'function') throw new TypeError('invalid search monitor');
  if (!Number.isInteger(maxConcurrentExecutions) || maxConcurrentExecutions < 1 || maxConcurrentExecutions > 256) throw new TypeError('invalid max concurrent executions');
  if (trafficControl !== undefined && typeof trafficControl.snapshot !== 'function') throw new TypeError('invalid traffic control');
  if ((x402Service === undefined) !== (x402StateStore === undefined)) throw new TypeError('x402 service and state store must be configured together');
  if (allowMockPaidExecution && x402Service !== undefined) throw new TypeError('mock and real commerce cannot be enabled together');
  if (environment === 'production' && x402Service?.mode === 'settlement_enabled' && x402StateStore?.durable !== true) throw new TypeError('production x402 requires durable state');
  if ((sandboxGateway === undefined) !== (sandboxApiToken === undefined)) throw new TypeError('sandbox gateway and API token must be configured together');
  if (sandboxGateway !== undefined && (typeof sandboxGateway.run !== 'function' || typeof sandboxGateway.ready !== 'function')) throw new TypeError('invalid sandbox gateway');
  if (sandboxApiToken !== undefined && (typeof sandboxApiToken !== 'string' || sandboxApiToken.length < 32 || sandboxApiToken.length > 512)) throw new TypeError('invalid sandbox API token');
  if (environment === 'production' && sandboxGateway !== undefined && sandboxGateway.durable !== true) throw new TypeError('production sandbox requires durable state');
  if (typeof synthesisEnabled !== 'boolean' || !['recorded', 'live_external', 'open_federation'].includes(retrievalMode)) throw new TypeError('invalid search capability configuration');
  if (edgeAuthorization !== undefined && (typeof edgeAuthorization !== 'string' || edgeAuthorization.length < 32 || edgeAuthorization.length > 512)) throw new TypeError('invalid edge authorization');
  if ((aiPublicPricing === undefined) !== (aiAdapters === undefined)) throw new TypeError('AI pricing and adapters must be configured together');
  if (aiPublicPricing !== undefined && x402Service === undefined) throw new TypeError('public AI requires x402 commerce');
  if (aiFreeTier !== undefined && (aiPublicPricing === undefined || !aiFreeTier.policy || !aiFreeTier.store)) throw new TypeError('invalid AI free-tier configuration');
  if (aiAdapterFactory !== undefined && (aiPublicPricing === undefined || typeof aiAdapterFactory !== 'function')) throw new TypeError('invalid AI adapter factory');
  if (aiArtifactAccess !== undefined && (typeof aiArtifactAccess.matches !== 'function' || typeof aiArtifactAccess.retrieve !== 'function')) throw new TypeError('invalid AI artifact access');
  if (aiReady !== undefined && (aiPublicPricing === undefined || typeof aiReady !== 'function')) throw new TypeError('invalid AI readiness probe');
  if (sandboxPublicRunnerDigest !== undefined && (sandboxGateway === undefined || x402Service === undefined)) throw new TypeError('public Sandbox requires private execution and x402 commerce');
  if (rpcRuntime !== undefined && x402Service === undefined) throw new TypeError('public RPC requires x402 commerce');
  if (predictionRuntime !== undefined && x402Service === undefined) throw new TypeError('public Prediction requires x402 commerce');
  if (cryptoRuntime !== undefined && x402Service === undefined) throw new TypeError('public Crypto requires x402 commerce');
  const searchState = stateStore ?? new InMemorySearchStateStore({ freeQuota });
  if (
    typeof searchState.begin !== 'function'
    || typeof searchState.complete !== 'function'
    || typeof searchState.abandon !== 'function'
    || typeof searchState.consumeFreeQuota !== 'function'
  ) throw new TypeError('invalid search state store');
  const idempotency = new Map();
  let activeExecutions = 0;

  const acquireExecution = () => {
    if (activeExecutions >= maxConcurrentExecutions) return undefined;
    activeExecutions += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeExecutions -= 1;
    };
  };
  const x402PaidProcessor = x402Service === undefined ? undefined : createX402PaidSearchProcessor({
    service: x402Service,
    stateStore: x402StateStore,
    executor,
    acquireExecution,
  });
  const x402AiProcessor = aiPublicPricing === undefined ? undefined : createX402PaidAiProcessor({
    service: x402Service,
    stateStore: x402StateStore,
    publicPricing: aiPublicPricing,
    adapters: aiAdapters,
    adapterFactory: aiAdapterFactory,
    runtimeBindings: aiRuntimeBindings,
    acquireExecution,
    monitor: aiMonitor,
  });
  const freeAiProcessor = aiFreeTier === undefined ? undefined : createFreeAiOperationProcessor({
    stateStore: searchState,
    quotaStore: aiFreeTier.store,
    policy: aiFreeTier.policy,
    publicPricing: aiPublicPricing,
    adapters: aiAdapters,
    runtimeBindings: aiRuntimeBindings,
    acquireExecution,
    monitor: aiMonitor,
  });
  const x402SandboxProcessor = sandboxPublicRunnerDigest === undefined ? undefined : createX402PaidSandboxProcessor({
    service: x402Service,
    stateStore: x402StateStore,
    gateway: sandboxGateway,
    runnerDigest: sandboxPublicRunnerDigest,
    acquireExecution,
  });
  const x402RpcProcessor = rpcRuntime === undefined ? undefined : createX402PaidRpcProcessor({ service: x402Service, stateStore: x402StateStore, runtime: rpcRuntime, acquireExecution });
  const x402PredictionProcessor = predictionRuntime === undefined ? undefined : createX402PaidPredictionProcessor({ service: x402Service, stateStore: x402StateStore, runtime: predictionRuntime, acquireExecution });
  const x402CryptoProcessor = cryptoRuntime === undefined ? undefined : createX402PaidCryptoProcessor({ service: x402Service, stateStore: x402StateStore, runtime: cryptoRuntime, acquireExecution });

  async function discoveryPaymentChallenge(pathname, observedAt) {
    let productId;
    let requestHash;
    let pricing;
    let discovery;
    if (pathname === AI_PAID_PATH) {
      if (typeof aiPublicPricing?.discoveryRequest !== 'function') throw new TypeError('ai_discovery_contract_unavailable');
      const input = aiPublicPricing.discoveryRequest(observedAt);
      const normalized = normalizeAiHttpRequest(input);
      productId = normalized.productId;
      requestHash = aiHttpRequestHash(normalized);
      const operationId = identifier('op', `discovery:${pathname}:${requestHash}`);
      pricing = aiPublicPricing.quote({ normalized, operationId, now: observedAt }).pricing;
      discovery = createAiDiscoveryContract(input);
    } else if (pathname === SANDBOX_PAID_PATH) {
      const normalized = normalizeSandboxHttpRequest(SANDBOX_DISCOVERY.input);
      productId = 'sandbox.run';
      requestHash = sandboxHttpRequestHash(normalized);
      pricing = sandboxRunPricing(normalized);
      discovery = SANDBOX_DISCOVERY;
    } else if (pathname === RPC_PAID_PATH) {
      const normalized = normalizeRpcHttpRequest(RPC_DISCOVERY.input);
      productId = normalized.productId;
      requestHash = rpcHttpRequestHash(normalized);
      pricing = rpcPublicPricing(normalized);
      discovery = RPC_DISCOVERY;
    } else if (pathname === PREDICTION_PAID_PATH) {
      const normalized = normalizePredictionHttpRequest(PREDICTION_DISCOVERY.input);
      productId = normalized.productId;
      requestHash = predictionHttpRequestHash(normalized);
      pricing = predictionPublicPricing(normalized);
      discovery = PREDICTION_DISCOVERY;
    } else if (pathname === CRYPTO_PAID_PATH) {
      const normalized = normalizeCryptoHttpRequest(CRYPTO_DISCOVERY.input);
      productId = normalized.productId;
      requestHash = cryptoHttpRequestHash(normalized);
      pricing = cryptoPublicPricing(normalized);
      discovery = CRYPTO_DISCOVERY;
    } else {
      const normalized = normalizeSearchHttpRequest(SEARCH_DISCOVERY_PROBE_REQUEST);
      productId = searchProductId(normalized);
      requestHash = searchHttpRequestHash(normalized, SEARCH_PAID_PATH);
      pricing = x402SearchPricing(productId);
    }
    const operationId = identifier('op', `discovery:${pathname}:${requestHash}`);
    const quote = sealQuote({
      contractVersion: CONTRACT_VERSION,
      quoteId: identifier('quote', `discovery:${pathname}:${requestHash}`),
      operationId,
      productId,
      requestHash,
      priceVersion: pricing.priceVersion,
      maximumCharge: pricing.maximumCharge,
      issuedAt: observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 300_000).toISOString(),
    });
    return x402Service.challenge({ quote, description: `Bounded ${productId} discovery challenge`, now: observedAt, resourcePath: pathname, discovery });
  }

  const record = (input) => {
    try { monitor?.record(input); } catch { /* Monitoring must never alter customer response behavior. */ }
  };

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://loopback.invalid');
    if (request.method === 'GET' && ['/healthz', '/v1/health'].includes(url.pathname) && url.search === '') {
      send(response, 200, {
        status: 'ok',
        service: 'clervo-search-api',
        environment: environment ?? 'unknown',
        releaseId: releaseId ?? 'unknown',
        paidExecutionEnabled: allowMockPaidExecution || x402PaidProcessor?.mode === 'settlement_enabled',
        stateBackend: searchState.kind ?? 'unknown',
        durableState: searchState.durable === true,
        trafficMode: trafficControl?.snapshot().mode ?? 'open',
        sandboxPrivateEnabled: sandboxGateway !== undefined,
        sandboxDurableState: sandboxGateway?.durable === true,
        aiPaidEnabled: x402AiProcessor?.mode === 'settlement_enabled',
        sandboxPaidEnabled: x402SandboxProcessor?.mode === 'settlement_enabled',
        rpcPaidEnabled: x402RpcProcessor?.mode === 'settlement_enabled',
        predictionPaidEnabled: x402PredictionProcessor?.mode === 'settlement_enabled',
        cryptoPaidEnabled: x402CryptoProcessor?.mode === 'settlement_enabled',
        retrievalMode,
      });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/readyz' && url.search === '') {
      try {
        const trafficOpen = (trafficControl?.snapshot().mode ?? 'open') === 'open';
        const ready = trafficOpen
          && typeof searchState.ready === 'function'
          && await searchState.ready()
          && (x402StateStore === undefined || await x402StateStore.ready())
          && (sandboxGateway === undefined || await sandboxGateway.ready())
          && (aiReady === undefined || await aiReady())
          && (rpcRuntime === undefined || await rpcRuntime.ready())
          && (predictionRuntime === undefined || await predictionRuntime.ready())
          && (cryptoRuntime === undefined || await cryptoRuntime.ready());
        send(response, ready ? 200 : 503, {
          status: ready ? 'ready' : 'unavailable',
          service: 'clervo-search-api',
          stateBackend: searchState.kind ?? 'unknown',
          durableState: searchState.durable === true,
          trafficMode: trafficControl?.snapshot().mode ?? 'open',
        });
      } catch {
        send(response, 503, {
          status: 'unavailable',
          service: 'clervo-search-api',
          stateBackend: searchState.kind ?? 'unknown',
          durableState: searchState.durable === true,
          trafficMode: trafficControl?.snapshot().mode ?? 'open',
        });
      }
      return;
    }
    if (aiArtifactAccess?.matches(url.pathname)) {
      if (edgeAuthorization !== undefined && !internalAuthorized(request.headers['x-clervo-edge-authorization'], edgeAuthorization)) {
        send(response, 401, problem(401, 'edge_unauthorized', 'Unauthorized', 'The public API edge is required.', url.pathname), {}, PROBLEM_TYPE);
        return;
      }
      if (request.method !== 'GET') {
        send(response, 405, problem(405, 'method_not_allowed', 'Method not allowed', 'Artifact retrieval requires GET.', url.pathname), { allow: 'GET' }, PROBLEM_TYPE);
        return;
      }
      if (url.search !== '') {
        send(response, 400, problem(400, 'query_parameters_not_allowed', 'Query parameters not allowed', 'The signed artifact path already contains the complete access grant.', url.pathname), {}, PROBLEM_TYPE);
        return;
      }
      try {
        const artifact = await aiArtifactAccess.retrieve(url.pathname);
        response.writeHead(200, {
          'content-type': artifact.mimeType,
          'content-length': String(artifact.bytes.byteLength),
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
          'x-clervo-artifact-sha256': artifact.sha256,
          'x-clervo-artifact-expires': artifact.expiresAt,
        });
        response.end(Buffer.from(artifact.bytes));
      } catch (error) {
        const code = errorCode(error);
        const status = Number.isInteger(error?.status) ? error.status : 503;
        send(response, status, problem(status, code, status === 410 ? 'Artifact access expired' : status === 404 ? 'Artifact not found' : 'Artifact unavailable', 'The artifact request failed closed without exposing storage credentials or a different tenant object.', url.pathname), status >= 500 ? { 'retry-after': '30' } : {}, PROBLEM_TYPE);
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === SANDBOX_PRIVATE_PATH && url.search === '' && sandboxGateway !== undefined) {
      if (!internalAuthorized(request.headers['x-clervo-internal-authorization'], sandboxApiToken)) {
        send(response, 401, problem(401, 'sandbox_api_unauthorized', 'Unauthorized', 'Private Sandbox API authentication is required.', url.pathname), {}, PROBLEM_TYPE);
        return;
      }
      if (trafficControl?.snapshot().mode === 'stopped') {
        send(response, 503, problem(503, 'traffic_stopped', 'Traffic temporarily stopped', 'New execution is disabled by the independent traffic safety control.', url.pathname), { 'retry-after': '30' }, PROBLEM_TYPE);
        return;
      }
      try {
        const tenantId = request.headers['x-clervo-tenant-id'];
        if (typeof tenantId !== 'string') throw Object.assign(new Error('sandbox_tenant_invalid'), { status: 400 });
        const operation = await sandboxGateway.run({ tenantId, request: await readJson(request, SANDBOX_MAX_BODY_BYTES) });
        send(response, 200, operation.result, { 'x-clervo-replay': String(operation.replayed) });
      } catch (error) {
        const code = errorCode(error);
        const status = Number.isInteger(error?.status) ? error.status : code.includes('invalid') ? 400 : 503;
        send(response, status, problem(status, code, status === 409 ? 'Sandbox operation conflict' : status === 400 ? 'Invalid Sandbox request' : 'Sandbox execution unavailable', 'The private Sandbox operation failed closed without a customer charge.', url.pathname), status >= 500 ? { 'retry-after': '30' } : {}, PROBLEM_TYPE);
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === AI_PAID_PATH && x402AiProcessor !== undefined) {
      if (edgeAuthorization !== undefined && !internalAuthorized(request.headers['x-clervo-edge-authorization'], edgeAuthorization)) {
        send(response, 401, problem(401, 'edge_unauthorized', 'Unauthorized', 'The public API edge is required.', url.pathname), {}, PROBLEM_TYPE);
        return;
      }
      if (trafficControl?.snapshot().mode === 'stopped') {
        send(response, 503, problem(503, 'traffic_stopped', 'Traffic temporarily stopped', 'New execution is disabled by the independent traffic safety control.', url.pathname), { 'retry-after': '30' }, PROBLEM_TYPE);
        return;
      }
      if (url.search !== '') {
        send(response, 400, problem(400, 'query_parameters_not_allowed', 'Query parameters not allowed', 'The AI contract accepts JSON body fields only.', url.pathname), {}, PROBLEM_TYPE);
        return;
      }
      let aiOperationId;
      try {
        const observedAt = now();
        const suppliedKey = request.headers['idempotency-key'];
        const authorizationHeader = mppAuthorization(request.headers.authorization);
        const discoveryEligible = typeof suppliedKey !== 'string' && typeof request.headers['payment-signature'] !== 'string' && authorizationHeader === undefined;
        const aiBody = await readJson(request, AI_MAX_BODY_BYTES, { allowEmpty: discoveryEligible });
        if (aiBody === undefined) {
          const challenge = await discoveryPaymentChallenge(AI_PAID_PATH, observedAt);
          send(response, challenge.status, challenge.body, challenge.headers);
          return;
        }
        const normalized = normalizeAiHttpRequest(aiBody);
        const requestHash = aiHttpRequestHash(normalized);
        const classificationId = identifier('op', `classify:${requestHash}`);
        const billingMode = aiPublicPricing.quote({ normalized, operationId: classificationId, now: observedAt }).pricing.billingMode;
        if (billingMode === 'free') {
          if (freeAiProcessor === undefined) throw Object.assign(new Error('ai_free_tier_unavailable'), { status: 503 });
          const keyGenerated = typeof suppliedKey !== 'string';
          const keyHeader = keyGenerated ? generatedIdempotencyKey() : suppliedKey;
          validateIdempotencyKey(keyHeader);
          aiOperationId = identifier('op', `${keyHeader}:${requestHash}`);
          const edgeSubject = request.headers['x-clervo-quota-subject'];
          if (edgeAuthorization !== undefined && (typeof edgeSubject !== 'string' || edgeSubject.length < 1 || edgeSubject.length > 200)) throw Object.assign(new Error('ai_quota_subject_required'), { status: 503 });
          const subject = typeof edgeSubject === 'string' && edgeSubject.length >= 1 && edgeSubject.length <= 200
            ? edgeSubject
            : request.socket.remoteAddress ?? 'loopback-unknown';
          const free = await freeAiProcessor.process({ idempotencyKey: keyHeader, requestHash, operationId: aiOperationId, normalized, subject, now: observedAt });
          send(response, free.status, free.body, { ...free.headers, ...(keyGenerated ? { 'idempotency-key': keyHeader } : {}) });
          return;
        }
        const keyGenerated = typeof suppliedKey !== 'string' && typeof request.headers['payment-signature'] !== 'string' && authorizationHeader === undefined;
        const keyHeader = keyGenerated ? `srv.ai.${randomUUID().replaceAll('-', '')}` : suppliedKey;
        if (typeof keyHeader !== 'string') throw Object.assign(new Error('idempotency_key_required'), { status: 400 });
        validateIdempotencyKey(keyHeader);
        aiOperationId = identifier('op', `${keyHeader}:${requestHash}`);
        const paid = await x402AiProcessor.process({
          idempotencyKey: keyHeader,
          requestHash,
          operationId: aiOperationId,
          normalized,
          paymentHeader: typeof request.headers['payment-signature'] === 'string' ? request.headers['payment-signature'] : undefined,
          authorizationHeader,
          now: observedAt,
        });
        send(response, paid.status, paid.body, { ...paid.headers, ...(keyGenerated ? { 'idempotency-key': keyHeader } : {}) });
      } catch (error) {
        const code = errorCode(error);
        const status = Number.isInteger(error?.status) ? error.status : (code.includes('invalid') || code.includes('required') || code.includes('additional')) ? 400 : 503;
        const title = status === 400 ? 'Invalid AI request' : status === 404 ? 'AI model not found' : status === 409 ? 'AI operation conflict' : status === 422 ? 'AI model unavailable' : 'AI execution unavailable';
        const detail = status === 400 ? 'The request did not satisfy the bounded AI HTTP contract.' : status === 404 ? 'The requested model ID is not present in the current Clervo catalog.' : status === 422 ? 'The requested model is known but is not currently sellable for this input kind.' : 'The AI operation failed closed without an additional customer charge.';
        send(response, status, problem(status, code, title, detail, url.pathname, aiOperationId), status >= 500 ? { 'retry-after': '30' } : {}, PROBLEM_TYPE);
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === RPC_PAID_PATH && x402RpcProcessor !== undefined) {
      if (edgeAuthorization !== undefined && !internalAuthorized(request.headers['x-clervo-edge-authorization'], edgeAuthorization)) {
        send(response, 401, problem(401, 'edge_unauthorized', 'Unauthorized', 'The public API edge is required.', url.pathname), {}, PROBLEM_TYPE);
        return;
      }
      if (trafficControl?.snapshot().mode === 'stopped') {
        send(response, 503, problem(503, 'traffic_stopped', 'Traffic temporarily stopped', 'New execution is disabled by the independent traffic safety control.', url.pathname), { 'retry-after': '30' }, PROBLEM_TYPE);
        return;
      }
      if (url.search !== '') {
        send(response, 400, problem(400, 'query_parameters_not_allowed', 'Query parameters not allowed', 'The RPC contract accepts JSON body fields only.', url.pathname), {}, PROBLEM_TYPE);
        return;
      }
      let operationId;
      try {
        const keyHeader = request.headers['idempotency-key'];
        const authorizationHeader = mppAuthorization(request.headers.authorization);
        if (typeof keyHeader !== 'string' && typeof request.headers['payment-signature'] !== 'string' && authorizationHeader === undefined) {
          const challenge = await discoveryPaymentChallenge(RPC_PAID_PATH, now());
          send(response, challenge.status, challenge.body, challenge.headers);
          return;
        }
        if (typeof keyHeader !== 'string') throw Object.assign(new Error('idempotency_key_required'), { status: 400 });
        validateIdempotencyKey(keyHeader);
        const normalized = normalizeRpcHttpRequest(await readJson(request, RPC_MAX_BODY_BYTES));
        const requestHash = rpcHttpRequestHash(normalized);
        operationId = identifier('op', `${keyHeader}:${requestHash}`);
        const paid = await x402RpcProcessor.process({ idempotencyKey: keyHeader, requestHash, operationId, normalized, paymentHeader: typeof request.headers['payment-signature'] === 'string' ? request.headers['payment-signature'] : undefined, authorizationHeader, now: now() });
        send(response, paid.status, paid.body, paid.headers);
      } catch (error) {
        const code = errorCode(error); const status = Number.isInteger(error?.status) ? error.status : (code.includes('invalid') || code.includes('required') || code.includes('additional')) ? 400 : 503;
        send(response, status, problem(status, code, status === 400 ? 'Invalid RPC request' : status === 409 ? 'RPC operation conflict' : 'RPC execution unavailable', status >= 500 ? 'The RPC operation failed closed. Do not retry an unknown paid operation until reconciliation.' : 'The RPC request was rejected before execution.', url.pathname, operationId), status >= 500 ? { 'retry-after': '30' } : {}, PROBLEM_TYPE);
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === PREDICTION_PAID_PATH && x402PredictionProcessor !== undefined) {
      if (edgeAuthorization !== undefined && !internalAuthorized(request.headers['x-clervo-edge-authorization'], edgeAuthorization)) {
        send(response, 401, problem(401, 'edge_unauthorized', 'Unauthorized', 'The public API edge is required.', url.pathname), {}, PROBLEM_TYPE); return;
      }
      if (trafficControl?.snapshot().mode === 'stopped') {
        send(response, 503, problem(503, 'traffic_stopped', 'Traffic temporarily stopped', 'New execution is disabled by the independent traffic safety control.', url.pathname), { 'retry-after': '30' }, PROBLEM_TYPE); return;
      }
      if (url.search !== '') {
        send(response, 400, problem(400, 'query_parameters_not_allowed', 'Query parameters not allowed', 'The Prediction contract accepts JSON body fields only.', url.pathname), {}, PROBLEM_TYPE); return;
      }
      let operationId;
      try {
        const keyHeader = request.headers['idempotency-key'];
        const authorizationHeader = mppAuthorization(request.headers.authorization);
        if (typeof keyHeader !== 'string' && typeof request.headers['payment-signature'] !== 'string' && authorizationHeader === undefined) {
          const challenge = await discoveryPaymentChallenge(PREDICTION_PAID_PATH, now()); send(response, challenge.status, challenge.body, challenge.headers); return;
        }
        if (typeof keyHeader !== 'string') throw Object.assign(new Error('idempotency_key_required'), { status: 400 });
        validateIdempotencyKey(keyHeader);
        const normalized = normalizePredictionHttpRequest(await readJson(request, PREDICTION_MAX_BODY_BYTES));
        const requestHash = predictionHttpRequestHash(normalized);
        operationId = identifier('op', `${keyHeader}:${requestHash}`);
        const paid = await x402PredictionProcessor.process({ idempotencyKey: keyHeader, requestHash, operationId, normalized, paymentHeader: typeof request.headers['payment-signature'] === 'string' ? request.headers['payment-signature'] : undefined, authorizationHeader, now: now() });
        send(response, paid.status, paid.body, paid.headers);
      } catch (error) {
        const code = errorCode(error); const status = Number.isInteger(error?.status) ? error.status : (code.includes('invalid') || code.includes('required') || code.includes('additional')) ? 400 : 503;
        send(response, status, problem(status, code, status === 400 ? 'Invalid Prediction request' : status === 404 ? 'Prediction market not found' : status === 409 ? 'Prediction operation conflict' : 'Prediction execution unavailable', status >= 500 ? 'The Prediction operation failed closed. Do not retry an unknown paid operation until reconciliation.' : 'The Prediction request was rejected before execution.', url.pathname, operationId), status >= 500 ? { 'retry-after': '30' } : {}, PROBLEM_TYPE);
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === CRYPTO_PAID_PATH && x402CryptoProcessor !== undefined) {
      if (edgeAuthorization !== undefined && !internalAuthorized(request.headers['x-clervo-edge-authorization'], edgeAuthorization)) {
        send(response, 401, problem(401, 'edge_unauthorized', 'Unauthorized', 'The public API edge is required.', url.pathname), {}, PROBLEM_TYPE); return;
      }
      if (trafficControl?.snapshot().mode === 'stopped') {
        send(response, 503, problem(503, 'traffic_stopped', 'Traffic temporarily stopped', 'New execution is disabled by the independent traffic safety control.', url.pathname), { 'retry-after': '30' }, PROBLEM_TYPE); return;
      }
      if (url.search !== '') {
        send(response, 400, problem(400, 'query_parameters_not_allowed', 'Query parameters not allowed', 'The Crypto contract accepts JSON body fields only.', url.pathname), {}, PROBLEM_TYPE); return;
      }
      let operationId;
      try {
        const keyHeader = request.headers['idempotency-key'];
        const authorizationHeader = mppAuthorization(request.headers.authorization);
        if (typeof keyHeader !== 'string' && typeof request.headers['payment-signature'] !== 'string' && authorizationHeader === undefined) {
          const challenge = await discoveryPaymentChallenge(CRYPTO_PAID_PATH, now()); send(response, challenge.status, challenge.body, challenge.headers); return;
        }
        if (typeof keyHeader !== 'string') throw Object.assign(new Error('idempotency_key_required'), { status: 400 });
        validateIdempotencyKey(keyHeader);
        const normalized = normalizeCryptoHttpRequest(await readJson(request, CRYPTO_MAX_BODY_BYTES));
        const requestHash = cryptoHttpRequestHash(normalized);
        operationId = identifier('op', `${keyHeader}:${requestHash}`);
        const paid = await x402CryptoProcessor.process({ idempotencyKey: keyHeader, requestHash, operationId, normalized, paymentHeader: typeof request.headers['payment-signature'] === 'string' ? request.headers['payment-signature'] : undefined, authorizationHeader, now: now() });
        send(response, paid.status, paid.body, paid.headers);
      } catch (error) {
        const code = errorCode(error); const status = Number.isInteger(error?.status) ? error.status : (code.includes('invalid') || code.includes('required') || code.includes('additional') || code.includes('unavailable')) ? 400 : 503;
        send(response, status, problem(status, code, status === 400 ? 'Invalid Crypto request' : status === 409 ? 'Crypto operation conflict' : 'Crypto execution unavailable', status >= 500 ? 'The Crypto operation failed closed. Do not retry an unknown paid operation until reconciliation.' : 'The Crypto request was rejected before execution.', url.pathname, operationId), status >= 500 ? { 'retry-after': '30' } : {}, PROBLEM_TYPE);
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === SANDBOX_PAID_PATH && x402SandboxProcessor !== undefined) {
      if (edgeAuthorization !== undefined && !internalAuthorized(request.headers['x-clervo-edge-authorization'], edgeAuthorization)) {
        send(response, 401, problem(401, 'edge_unauthorized', 'Unauthorized', 'The public API edge is required.', url.pathname), {}, PROBLEM_TYPE);
        return;
      }
      if (trafficControl?.snapshot().mode === 'stopped') {
        send(response, 503, problem(503, 'traffic_stopped', 'Traffic temporarily stopped', 'New execution is disabled by the independent traffic safety control.', url.pathname), { 'retry-after': '30' }, PROBLEM_TYPE);
        return;
      }
      if (url.search !== '') {
        send(response, 400, problem(400, 'query_parameters_not_allowed', 'Query parameters not allowed', 'The Sandbox contract accepts JSON body fields only.', url.pathname), {}, PROBLEM_TYPE);
        return;
      }
      let sandboxOperationId;
      try {
        const keyHeader = request.headers['idempotency-key'];
        const authorizationHeader = mppAuthorization(request.headers.authorization);
        if (typeof keyHeader !== 'string' && typeof request.headers['payment-signature'] !== 'string' && authorizationHeader === undefined) {
          const challenge = await discoveryPaymentChallenge(SANDBOX_PAID_PATH, now());
          send(response, challenge.status, challenge.body, challenge.headers);
          return;
        }
        if (typeof keyHeader !== 'string') throw Object.assign(new Error('idempotency_key_required'), { status: 400 });
        validateIdempotencyKey(keyHeader);
        const normalized = normalizeSandboxHttpRequest(await readJson(request, SANDBOX_PUBLIC_MAX_BODY_BYTES));
        const requestHash = sandboxHttpRequestHash(normalized);
        sandboxOperationId = identifier('op', `${keyHeader}:${requestHash}`);
        const paid = await x402SandboxProcessor.process({
          idempotencyKey: keyHeader,
          requestHash,
          operationId: sandboxOperationId,
          normalized,
          paymentHeader: typeof request.headers['payment-signature'] === 'string' ? request.headers['payment-signature'] : undefined,
          authorizationHeader,
          now: now(),
        });
        send(response, paid.status, paid.body, paid.headers);
      } catch (error) {
        const code = errorCode(error);
        const status = Number.isInteger(error?.status) ? error.status : (code.includes('invalid') || code.includes('required') || code.includes('additional')) ? 400 : 503;
        const title = status === 400 ? 'Invalid Sandbox request' : status === 409 ? 'Sandbox operation conflict' : 'Sandbox execution unavailable';
        const detail = status === 400 ? 'The request did not satisfy the bounded public Sandbox contract.' : 'The Sandbox operation failed closed without an additional customer charge.';
        send(response, status, problem(status, code, title, detail, url.pathname, sandboxOperationId), status >= 500 ? { 'retry-after': '30' } : {}, PROBLEM_TYPE);
      }
      return;
    }
    if (request.method !== 'POST' || ![SEARCH_FREE_PATH, SEARCH_PAID_PATH].includes(url.pathname)) {
      send(response, 404, problem(404, 'not_found', 'Not found', 'No route matches this request.', url.pathname), {}, PROBLEM_TYPE);
      return;
    }
    if (edgeAuthorization !== undefined && !internalAuthorized(request.headers['x-clervo-edge-authorization'], edgeAuthorization)) {
      send(response, 401, problem(401, 'edge_unauthorized', 'Unauthorized', 'The public API edge is required.', url.pathname), {}, PROBLEM_TYPE);
      return;
    }
    if (trafficControl?.snapshot().mode === 'stopped') {
      send(response, 503, problem(503, 'traffic_stopped', 'Traffic temporarily stopped', 'New execution is disabled by the independent traffic safety control.', url.pathname), { 'retry-after': '30' }, PROBLEM_TYPE);
      return;
    }
    if (url.search !== '') {
      send(response, 400, problem(400, 'query_parameters_not_allowed', 'Query parameters not allowed', 'The search contract accepts JSON body fields only.', url.pathname), {}, PROBLEM_TYPE);
      return;
    }

    let operationId;
    let productId;
    let stateClaim;
    let stateCompletionAttempted = false;
    const startedAt = monotonicNow();
    try {
      const suppliedKey = request.headers['idempotency-key'];
      const authorizationHeader = mppAuthorization(request.headers.authorization);
      if (url.pathname === SEARCH_PAID_PATH && typeof suppliedKey !== 'string' && typeof request.headers['payment-signature'] !== 'string' && authorizationHeader === undefined) {
        const challenge = await discoveryPaymentChallenge(SEARCH_PAID_PATH, now());
        send(response, challenge.status, challenge.body, challenge.headers);
        return;
      }
      // The free sample accepts a naive caller. The paid path still requires a
      // caller-supplied key, because a generated key on a payable request would
      // give the caller nothing to retry with after a settlement of unknown
      // state — the one case that must fail closed.
      const keyGenerated = typeof suppliedKey !== 'string' && url.pathname === SEARCH_FREE_PATH;
      const keyHeader = keyGenerated ? generatedIdempotencyKey() : suppliedKey;
      if (typeof keyHeader !== 'string') throw Object.assign(new Error('idempotency_key_required'), { status: 400 });
      validateIdempotencyKey(keyHeader);
      // A caller who supplied no key is told which one was used, so a
      // deliberate replay of this exact operation is still possible.
      const keyHeaders = keyGenerated ? { 'idempotency-key': keyHeader } : {};
      const decoded = await readJson(request, SEARCH_MAX_BODY_BYTES, { acceptNaiveContentType: url.pathname === SEARCH_FREE_PATH });
      // Released clients send synthesize explicitly. At the public HTTP edge,
      // omission selects the supported raw Search operation so a clean caller
      // does not accidentally opt into the non-callable compatibility mode.
      const publicRequest = decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded) && !Object.hasOwn(decoded, 'synthesize')
        ? { ...decoded, synthesize: false }
        : decoded;
      const normalized = normalizeSearchHttpRequest(publicRequest);
      if (normalized.synthesize && !synthesisEnabled) {
        send(response, 422, problem(422, 'search_synthesis_unavailable', 'Search synthesis unavailable', 'Live cited synthesis is not implemented on this release. Retry with synthesize=false for raw results.', url.pathname), {}, PROBLEM_TYPE);
        return;
      }
      const requestHash = searchHttpRequestHash(normalized, url.pathname);
      const realPaid = url.pathname === SEARCH_PAID_PATH && x402PaidProcessor !== undefined;
      let stored;
      if (!realPaid) {
        stored = idempotency.get(keyHeader);
        if (stored && stored.requestHash !== requestHash) {
          send(response, 409, problem(409, 'idempotency_conflict', 'Idempotency key conflict', 'The key is already bound to a different canonical request.', url.pathname, stored.operationId), {}, PROBLEM_TYPE);
          return;
        }
        if (stored?.response) {
          send(response, 200, { ...stored.response, replayed: true }, { 'idempotency-replayed': 'true' });
          return;
        }
        if (stored?.pending) {
          const pendingResult = await stored.pending;
          send(response, 200, { ...pendingResult, replayed: true }, { 'idempotency-replayed': 'true' });
          return;
        }
      }
      if (url.pathname === SEARCH_FREE_PATH && stored === undefined) {
        const proposedOperationId = identifier('op', `${keyHeader}:${requestHash}`);
        stateClaim = await searchState.begin({ idempotencyKey: keyHeader, requestHash, operationId: proposedOperationId, now: now() });
        if (stateClaim.kind === 'conflict') {
          send(response, 409, problem(409, 'idempotency_conflict', 'Idempotency key conflict', 'The key is already bound to a different canonical request.', url.pathname, stateClaim.operationId), {}, PROBLEM_TYPE);
          return;
        }
        if (stateClaim.kind === 'replay') {
          send(response, 200, { ...stateClaim.response, replayed: true }, { 'idempotency-replayed': 'true' });
          return;
        }
        if (stateClaim.kind === 'in_progress') {
          stored = idempotency.get(keyHeader);
          if (stored?.pending) {
            const pendingResult = await stored.pending;
            send(response, 200, { ...pendingResult, replayed: true }, { 'idempotency-replayed': 'true' });
          } else {
            send(response, 409, problem(409, 'idempotency_in_progress', 'Request in progress', 'The matching request is still in progress. Retry with the same key after reconciliation.', url.pathname, stateClaim.operationId), { 'retry-after': '1' }, PROBLEM_TYPE);
          }
          return;
        }
      }
      operationId = stateClaim?.operationId ?? stored?.operationId ?? identifier('op', `${keyHeader}:${requestHash}`);
      if (!realPaid) idempotency.set(keyHeader, { ...stored, operationId, requestHash });
      const fundingMode = url.pathname === SEARCH_FREE_PATH ? 'free' : 'paid';
      productId = searchProductId(normalized);
      const executionInput = Object.freeze({ ...normalized, operationId, productId, requestHash, fundingMode });

      if (fundingMode === 'free') {
        const edgeSubject = request.headers['x-clervo-quota-subject'];
        const subject = edgeAuthorization !== undefined && typeof edgeSubject === 'string' && /^sha256:[a-f0-9]{64}$/u.test(edgeSubject)
          ? edgeSubject
          : request.socket.remoteAddress ?? 'loopback-unknown';
        const quota = await searchState.consumeFreeQuota(subject, now());
        const quotaHeaders = {
          'ratelimit-limit': String(quota.limit),
          'ratelimit-remaining': String(quota.remaining),
          'ratelimit-reset': quota.resetAt,
        };
        if (!quota.allowed) {
          idempotency.delete(keyHeader);
          if (stateClaim?.kind === 'claimed') await searchState.abandon({ idempotencyKey: keyHeader, requestHash, operationId, leaseId: stateClaim.leaseId });
          record({ timestamp: now(), productId, outcome: 'quota_rejected', durationSeconds: Math.max(0, (monotonicNow() - startedAt) / 1_000), operationId });
          send(response, 429, problem(429, 'free_quota_exceeded', 'Free search quota exceeded', 'The bounded free sample quota is exhausted.', url.pathname, operationId), { ...quotaHeaders, 'retry-after': String(Math.max(1, Math.ceil((Date.parse(quota.resetAt) - Date.parse(now())) / 1_000))) }, PROBLEM_TYPE);
          return;
        }
        const releaseExecution = acquireExecution();
        if (releaseExecution === undefined) {
          idempotency.delete(keyHeader);
          if (stateClaim?.kind === 'claimed') await searchState.abandon({ idempotencyKey: keyHeader, requestHash, operationId, leaseId: stateClaim.leaseId });
          send(response, 503, problem(503, 'search_overloaded', 'Search temporarily overloaded', 'The bounded execution pool is full. Retry this request with the same idempotency key.', url.pathname, operationId), { ...keyHeaders, 'retry-after': '1' }, PROBLEM_TYPE);
          return;
        }
        const pending = Promise.resolve()
          .then(() => executor.execute(executionInput))
          .then((output) => createSearchHttpResult(executionInput, output, false))
          .finally(releaseExecution);
        idempotency.set(keyHeader, { operationId, requestHash, pending });
        const result = await pending;
        if (stateClaim?.kind === 'claimed') {
          stateCompletionAttempted = true;
          await searchState.complete({ idempotencyKey: keyHeader, requestHash, operationId, leaseId: stateClaim.leaseId, response: result, now: now() });
        }
        idempotency.set(keyHeader, { operationId, requestHash, response: result });
        record({ timestamp: now(), productId, outcome: 'success', durationSeconds: Math.max(0, (monotonicNow() - startedAt) / 1_000), operationId });
        send(response, 200, result, { ...quotaHeaders, ...keyHeaders });
        return;
      }

      if (realPaid) {
        const paid = await x402PaidProcessor.process({
          idempotencyKey: keyHeader,
          requestHash,
          operationId,
          productId,
          normalized,
          paymentHeader: typeof request.headers['payment-signature'] === 'string' ? request.headers['payment-signature'] : undefined,
          authorizationHeader,
          now: now(),
        });
        record({ timestamp: now(), productId, outcome: paid.status === 402 ? 'payment_challenge' : 'success', durationSeconds: Math.max(0, (monotonicNow() - startedAt) / 1_000), operationId });
        if (paid.status === 200 && paid.body.replayed !== true) record({ timestamp: now(), productId, outcome: 'paid_completion', operationId });
        send(response, paid.status, paid.body, paid.headers);
        return;
      }

      const issuedAt = now();
      const expiresAt = new Date(Date.parse(issuedAt) + 300_000).toISOString();
      const pricing = searchProductPricing(productId);
      const quote = stored?.quote ?? sealQuote({
        contractVersion: CONTRACT_VERSION,
        quoteId: identifier('quote', `${operationId}:${requestHash}`),
        operationId,
        productId,
        requestHash,
        priceVersion: pricing.priceVersion,
        maximumCharge: pricing.maximumCharge,
        issuedAt,
        expiresAt,
      });
      idempotency.set(keyHeader, { operationId, requestHash, quote });
      const challenge = createMockChallengeResponse({ quote, resourceUrl: `${publicOrigin}${SEARCH_PAID_PATH}`, description: `Non-payable mock challenge for ${productId}`, network: 'mock:local', asset: 'mock:usdc', payTo: 'mock:nonpayable-search', maxTimeoutSeconds: 60, now: issuedAt });
      const payment = parseMockPayment(request.headers[MOCK_PAYMENT_HEADER]);
      if (!allowMockPaidExecution || payment === undefined) {
        if (!allowMockPaidExecution) idempotency.delete(keyHeader);
        record({ timestamp: now(), productId, outcome: 'payment_challenge', durationSeconds: Math.max(0, (monotonicNow() - startedAt) / 1_000), operationId });
        send(response, challenge.status, { ...challenge.body, quote }, { [PAYMENT_REQUIRED_HEADER]: challenge.headers[PAYMENT_REQUIRED_HEADER] });
        return;
      }

      let executionOutput;
      const pending = commerce.processAsync({
        idempotencyKey: keyHeader,
        requestHash,
        quote,
        payment,
        now: issuedAt,
        authorizationId: identifier('auth', operationId),
        settlementId: identifier('settle', operationId),
        ledgerTransactionId: identifier('ledger', operationId),
        receiptId: identifier('rcpt', operationId),
        execute: async () => {
          const releaseExecution = acquireExecution();
          if (releaseExecution === undefined) throw Object.assign(new Error('search_overloaded'), { status: 503 });
          try {
            executionOutput = await executor.execute(executionInput);
            assertSearchExecutionOutput(executionOutput, executionInput);
            return { output: executionOutput, supplierCost: { asset: 'mock:usd', amountAtomic: '400', decimals: 6 }, provenance: [{ adapterId: 'adapter_mock.search', qualificationId: identifier('qual', operationId), providerReferenceHash: requestHash }] };
          } finally {
            releaseExecution();
          }
        },
        settle: () => ({ settlementId: identifier('settle', operationId), outcome: 'settled', referenceHash: requestHash, observedAt: issuedAt }),
      }).then((paid) => {
        if (paid.kind !== 'completed' || executionOutput === undefined) throw new TypeError('mock_paid_operation_not_completed');
        return createSearchHttpResult(executionInput, executionOutput, paid.replayed, paid.receipt);
      });
      idempotency.set(keyHeader, { operationId, requestHash, pending });
      const result = await pending;
      idempotency.set(keyHeader, { operationId, requestHash, response: result });
      record({ timestamp: now(), productId, outcome: 'success', durationSeconds: Math.max(0, (monotonicNow() - startedAt) / 1_000), operationId });
      record({ timestamp: now(), productId, outcome: 'paid_completion', operationId });
      send(response, 200, result, { 'idempotency-replayed': String(result.replayed) });
    } catch (error) {
      const code = errorCode(error);
      const executorFailure = code.startsWith('search_execution_') || code.startsWith('search_synthesis_') || code === 'mock_paid_operation_not_completed';
      if (operationId !== undefined) {
        const keyHeader = request.headers['idempotency-key'];
        const stored = typeof keyHeader === 'string' ? idempotency.get(keyHeader) : undefined;
        if (stored?.response === undefined) idempotency.delete(keyHeader);
        if (typeof keyHeader === 'string' && stateClaim?.kind === 'claimed' && !stateCompletionAttempted) {
          try {
            await searchState.abandon({ idempotencyKey: keyHeader, requestHash: stored?.requestHash, operationId, leaseId: stateClaim.leaseId });
          } catch { /* The original failure remains the customer-visible result. */ }
        }
      }
      const status = Number.isInteger(error?.status) ? error.status : code === 'idempotency_conflict' ? 409 : !executorFailure && (code.includes('invalid') || code.includes('required') || code.includes('additional')) ? 400 : 502;
      if (executorFailure && productId !== undefined) record({ timestamp: now(), productId, outcome: 'execution_failure', durationSeconds: Math.max(0, (monotonicNow() - startedAt) / 1_000), operationId });
      send(response, status, problem(status, code, status === 502 ? 'Search execution failed' : 'Invalid search request', status === 502 ? 'The bounded search executor failed closed.' : 'The request did not satisfy the search HTTP contract.', url.pathname, operationId), {}, PROBLEM_TYPE);
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  return server;
}
