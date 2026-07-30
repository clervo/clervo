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
  SEARCH_PRODUCT_ID,
  assertSearchExecutionOutput,
  createMockChallengeResponse,
  createSearchHttpResult,
  normalizeSearchHttpRequest,
  sealQuote,
  searchHttpRequestHash,
  validateIdempotencyKey,
} from '../../../dist/packages/contracts/src/index.js';

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
  freeQuota = new InMemoryFreeSearchQuota(),
  commerce = new MockCommerceKernel(),
  allowMockPaidExecution = false,
  publicOrigin = 'https://api.clervo.dev',
} = {}) {
  if (!executor || typeof executor.execute !== 'function') throw new TypeError('search executor is required');
  const idempotency = new Map();

  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://loopback.invalid');
    if (request.method !== 'POST' || ![SEARCH_FREE_PATH, SEARCH_PAID_PATH].includes(url.pathname)) {
      send(response, 404, problem(404, 'not_found', 'Not found', 'No route matches this request.', url.pathname), {}, PROBLEM_TYPE);
      return;
    }
    if (url.search !== '') {
      send(response, 400, problem(400, 'query_parameters_not_allowed', 'Query parameters not allowed', 'The search contract accepts JSON body fields only.', url.pathname), {}, PROBLEM_TYPE);
      return;
    }

    let operationId;
    try {
      const keyHeader = request.headers['idempotency-key'];
      if (typeof keyHeader !== 'string') throw Object.assign(new Error('idempotency_key_required'), { status: 400 });
      validateIdempotencyKey(keyHeader);
      const normalized = normalizeSearchHttpRequest(await readJson(request));
      const requestHash = searchHttpRequestHash(normalized, url.pathname);
      const stored = idempotency.get(keyHeader);
      if (stored && stored.requestHash !== requestHash) {
        send(response, 409, problem(409, 'idempotency_conflict', 'Idempotency key conflict', 'The key is already bound to a different canonical request.', url.pathname, stored.operationId), {}, PROBLEM_TYPE);
        return;
      }
      if (stored?.response) {
        send(response, 200, { ...stored.response, replayed: true }, { 'idempotency-replayed': 'true' });
        return;
      }
      operationId = stored?.operationId ?? identifier('op', `${keyHeader}:${requestHash}`);
      idempotency.set(keyHeader, { operationId, requestHash });
      const fundingMode = url.pathname === SEARCH_FREE_PATH ? 'free' : 'paid';
      const executionInput = Object.freeze({ ...normalized, operationId, requestHash, fundingMode });

      if (fundingMode === 'free') {
        const subject = request.socket.remoteAddress ?? 'loopback-unknown';
        const quota = freeQuota.consume(subject, now());
        const quotaHeaders = {
          'ratelimit-limit': String(quota.limit),
          'ratelimit-remaining': String(quota.remaining),
          'ratelimit-reset': quota.resetAt,
        };
        if (!quota.allowed) {
          idempotency.delete(keyHeader);
          send(response, 429, problem(429, 'free_quota_exceeded', 'Free search quota exceeded', 'The bounded free sample quota is exhausted.', url.pathname, operationId), { ...quotaHeaders, 'retry-after': String(Math.max(1, Math.ceil((Date.parse(quota.resetAt) - Date.parse(now())) / 1_000))) }, PROBLEM_TYPE);
          return;
        }
        const output = await executor.execute(executionInput);
        const result = createSearchHttpResult(executionInput, output, false);
        idempotency.set(keyHeader, { operationId, requestHash, response: result });
        send(response, 200, result, quotaHeaders);
        return;
      }

      const issuedAt = now();
      const expiresAt = new Date(Date.parse(issuedAt) + 300_000).toISOString();
      const quote = sealQuote({
        contractVersion: CONTRACT_VERSION,
        quoteId: identifier('quote', `${operationId}:${requestHash}`),
        operationId,
        productId: SEARCH_PRODUCT_ID,
        requestHash,
        priceVersion: 'search-query-mock-1',
        maximumCharge: { asset: 'mock:usdc', amountAtomic: '1000', decimals: 6 },
        issuedAt,
        expiresAt,
      });
      const challenge = createMockChallengeResponse({ quote, resourceUrl: `${publicOrigin}${SEARCH_PAID_PATH}`, description: 'Non-payable mock challenge for search.query', network: 'mock:local', asset: 'mock:usdc', payTo: 'mock:nonpayable-search', maxTimeoutSeconds: 60, now: issuedAt });
      const payment = parseMockPayment(request.headers[MOCK_PAYMENT_HEADER]);
      if (!allowMockPaidExecution || payment === undefined) {
        idempotency.delete(keyHeader);
        send(response, challenge.status, { ...challenge.body, quote }, { [PAYMENT_REQUIRED_HEADER]: challenge.headers[PAYMENT_REQUIRED_HEADER] });
        return;
      }

      let executionOutput;
      const paid = commerce.process({
        idempotencyKey: keyHeader,
        requestHash,
        quote,
        payment,
        now: issuedAt,
        authorizationId: identifier('auth', operationId),
        settlementId: identifier('settle', operationId),
        ledgerTransactionId: identifier('ledger', operationId),
        receiptId: identifier('rcpt', operationId),
        execute: () => {
          executionOutput = executor.execute(executionInput);
          if (executionOutput instanceof Promise) throw new TypeError('mock_paid_executor_must_be_synchronous');
          assertSearchExecutionOutput(executionOutput, executionInput);
          return { output: executionOutput, supplierCost: { asset: 'mock:usd', amountAtomic: '400', decimals: 6 }, provenance: [{ adapterId: 'adapter_mock.search', qualificationId: identifier('qual', operationId), providerReferenceHash: requestHash }] };
        },
        settle: () => ({ settlementId: identifier('settle', operationId), outcome: 'settled', referenceHash: requestHash, observedAt: issuedAt }),
      });
      if (paid.kind !== 'completed' || executionOutput === undefined) throw new TypeError('mock_paid_operation_not_completed');
      const result = createSearchHttpResult(executionInput, executionOutput, paid.replayed, paid.receipt);
      idempotency.set(keyHeader, { operationId, requestHash, response: result });
      send(response, 200, result, { 'idempotency-replayed': String(paid.replayed) });
    } catch (error) {
      const code = errorCode(error);
      const executorFailure = code.startsWith('search_execution_') || code.startsWith('search_synthesis_') || code === 'mock_paid_operation_not_completed' || code === 'mock_paid_executor_must_be_synchronous';
      const status = Number.isInteger(error?.status) ? error.status : code === 'idempotency_conflict' ? 409 : !executorFailure && (code.includes('invalid') || code.includes('required') || code.includes('additional')) ? 400 : 502;
      send(response, status, problem(status, code, status === 502 ? 'Search execution failed' : 'Invalid search request', status === 502 ? 'The bounded search executor failed closed.' : 'The request did not satisfy the search HTTP contract.', url.pathname, operationId), {}, PROBLEM_TYPE);
    }
  });
}