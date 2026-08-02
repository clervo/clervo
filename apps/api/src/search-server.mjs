#!/usr/bin/env node

import http from 'node:http';
import { createHash } from 'node:crypto';
import {
  CONTRACT_VERSION,
  InMemoryFreeSearchQuota,
  MockCommerceKernel,
  PAYMENT_REQUIRED_HEADER,
  SEARCH_FREE_PATH,
  SEARCH_MAX_BODY_BYTES,
  SEARCH_PAID_PATH,
  assertSearchExecutionOutput,
  createMockChallengeResponse,
  createSearchHttpResult,
  normalizeSearchHttpRequest,
  sealQuote,
  searchHttpRequestHash,
  searchProductId,
  searchProductPricing,
  validateIdempotencyKey,
} from '../../../dist/packages/contracts/src/index.js';
import { InMemorySearchStateStore } from './search-state-store.mjs';

const JSON_TYPE = 'application/json; charset=utf-8';
const PROBLEM_TYPE = 'application/problem+json; charset=utf-8';
const MOCK_PAYMENT_HEADER = 'x-clervo-mock-payment';

function identifier(prefix, seed) {
  return `${prefix}_${createHash('sha256').update(seed).digest('hex').slice(0, 32)}`;
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

async function readJson(request) {
  const contentType = request.headers['content-type'];
  if (typeof contentType !== 'string' || contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw Object.assign(new Error('unsupported_media_type'), { status: 415 });
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > SEARCH_MAX_BODY_BYTES) throw Object.assign(new Error('request_body_too_large'), { status: 413 });
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > SEARCH_MAX_BODY_BYTES) throw Object.assign(new Error('request_body_too_large'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
}

function parseMockPayment(value) {
  if (typeof value !== 'string') return undefined;
  try { return JSON.parse(Buffer.from(value, 'base64').toString('utf8')); } catch { throw Object.assign(new Error('invalid_mock_payment'), { status: 400 }); }
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
} = {}) {
  if (!executor || typeof executor.execute !== 'function') throw new TypeError('search executor is required');
  if (monitor !== undefined && typeof monitor.record !== 'function') throw new TypeError('invalid search monitor');
  if (!Number.isInteger(maxConcurrentExecutions) || maxConcurrentExecutions < 1 || maxConcurrentExecutions > 256) throw new TypeError('invalid max concurrent executions');
  if (trafficControl !== undefined && typeof trafficControl.snapshot !== 'function') throw new TypeError('invalid traffic control');
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
        paidExecutionEnabled: allowMockPaidExecution,
        stateBackend: searchState.kind ?? 'unknown',
        durableState: searchState.durable === true,
        trafficMode: trafficControl?.snapshot().mode ?? 'open',
      });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/readyz' && url.search === '') {
      try {
        const trafficOpen = (trafficControl?.snapshot().mode ?? 'open') === 'open';
        const ready = trafficOpen && typeof searchState.ready === 'function' && await searchState.ready();
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
    if (request.method !== 'POST' || ![SEARCH_FREE_PATH, SEARCH_PAID_PATH].includes(url.pathname)) {
      send(response, 404, problem(404, 'not_found', 'Not found', 'No route matches this request.', url.pathname), {}, PROBLEM_TYPE);
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
      const keyHeader = request.headers['idempotency-key'];
      if (typeof keyHeader !== 'string') throw Object.assign(new Error('idempotency_key_required'), { status: 400 });
      validateIdempotencyKey(keyHeader);
      const normalized = normalizeSearchHttpRequest(await readJson(request));
      const requestHash = searchHttpRequestHash(normalized, url.pathname);
      let stored = idempotency.get(keyHeader);
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
      idempotency.set(keyHeader, { ...stored, operationId, requestHash });
      const fundingMode = url.pathname === SEARCH_FREE_PATH ? 'free' : 'paid';
      productId = searchProductId(normalized);
      const executionInput = Object.freeze({ ...normalized, operationId, productId, requestHash, fundingMode });

      if (fundingMode === 'free') {
        const subject = request.socket.remoteAddress ?? 'loopback-unknown';
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
          send(response, 503, problem(503, 'search_overloaded', 'Search temporarily overloaded', 'The bounded execution pool is full. Retry this request with the same idempotency key.', url.pathname, operationId), { 'retry-after': '1' }, PROBLEM_TYPE);
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
        send(response, 200, result, quotaHeaders);
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
