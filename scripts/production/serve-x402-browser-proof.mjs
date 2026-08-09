#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAddress, isAddress } from 'viem';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dist = path.join(root, 'tools/x402-browser-proof/dist');
const asset = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const productId = String(process.env.CLERVO_X402_PROOF_PRODUCT ?? 'search.web');
const predictionMarketRef = String(process.env.CLERVO_X402_PROOF_PREDICTION_MARKET_REF ?? '');
const profiles = Object.freeze({
  'search.web': Object.freeze({
    route: '/v1/search/paid',
    resource: 'https://api.clervo.dev/v1/search/paid',
    amountAtomic: '6000',
    amountDisplay: '0.006 USDC',
    supplierCostCeilingAtomic: '0',
    request: { query: 'Python programming', maxResults: 3, synthesize: false, language: 'en', region: 'US' },
  }),
  'sandbox.run': Object.freeze({
    route: '/v1/sandbox/execute',
    resource: 'https://api.clervo.dev/v1/sandbox/execute',
    amountAtomic: '10000',
    amountDisplay: '0.010 USDC',
    supplierCostCeilingAtomic: '8000',
    request: {
      command: ['node', '-e', 'process.stdout.write("B10 sandbox proof")'],
      limits: { cpuMillis: 5000, memoryBytes: 268435456, processes: 16, diskBytes: 67108864, outputBytes: 65536, artifactBytes: 1048576, wallTimeMs: 10000 },
    },
  }),
  'ai.chat': Object.freeze({
    route: '/v1/ai/execute',
    resource: 'https://api.clervo.dev/v1/ai/execute',
    amountAtomic: '1000',
    amountDisplay: '0.001 USDC',
    supplierCostCeilingAtomic: '225',
    request: {
      model: 'gpt-5.6-luna',
      input: { kind: 'chat', messages: [{ role: 'user', content: 'Reply with the single word ready.' }], responseFormat: 'text', stream: false },
      maximumOutputTokens: 16,
    },
  }),
  'prediction.markets': Object.freeze({
    route: '/v1/prediction/execute',
    resource: 'https://api.clervo.dev/v1/prediction/execute',
    amountAtomic: '2000',
    amountDisplay: '0.002 USDC',
    supplierCostCeilingAtomic: '0',
    request: { kind: 'markets', status: 'open', limit: 3 },
  }),
  'prediction.market': Object.freeze({
    route: '/v1/prediction/execute',
    resource: 'https://api.clervo.dev/v1/prediction/execute',
    amountAtomic: '2000',
    amountDisplay: '0.002 USDC',
    supplierCostCeilingAtomic: '0',
    request: { kind: 'market', marketRef: predictionMarketRef },
  }),
  'crypto.wallet.report': Object.freeze({
    route: '/v1/crypto/execute',
    resource: 'https://api.clervo.dev/v1/crypto/execute',
    amountAtomic: '4000',
    amountDisplay: '0.004 USDC',
    supplierCostCeilingAtomic: '0',
    request: { kind: 'report', address: '0x67c484fb4cfe84633b34f5d6514b5f0f39653f07', chains: ['eip155:8453'], lookbackDays: 30, limit: 10 },
  }),
  'crypto.wallet.transactions': Object.freeze({
    route: '/v1/crypto/execute',
    resource: 'https://api.clervo.dev/v1/crypto/execute',
    amountAtomic: '3000',
    amountDisplay: '0.003 USDC',
    supplierCostCeilingAtomic: '0',
    request: { kind: 'transactions', address: '0x338c0d6868638ed44f937999e363f9dc9f86a2b6', chains: ['eip155:1'], lookbackDays: 30, limit: 10 },
  }),
});
assert.equal(Object.hasOwn(profiles, productId), true, 'proof product is not allowlisted');
if (productId === 'prediction.market') assert.match(predictionMarketRef, /^pmkt_[a-f0-9]{32}$/u, 'Prediction market ref is invalid');
const profile = profiles[productId];
const target = new URL(process.env.CLERVO_X402_PROOF_TARGET_ORIGIN ?? '');
const audienceValue = process.env.CLERVO_X402_PROOF_IDENTITY_AUDIENCE;
const audience = audienceValue === undefined ? undefined : new URL(audienceValue);
const port = Number(process.env.CLERVO_X402_PROOF_PORT ?? '8790');
const configuredPayer = String(process.env.CLERVO_X402_PROOF_PAYER ?? 'auto');
const payer = configuredPayer === 'auto' ? null : normalizeAddress(configuredPayer, 'payer');
const payTo = normalizeAddress(process.env.CLERVO_X402_PROOF_PAY_TO, 'receiver');
const idempotencyKey = String(process.env.CLERVO_X402_PROOF_IDEMPOTENCY_KEY ?? '');

function normalizeAddress(value, label) {
  assert.equal(isAddress(String(value ?? ''), { strict: true }), true, `${label} address is invalid`);
  return getAddress(String(value));
}

assert.equal(target.protocol, 'https:');
assert.equal(target.hostname === 'api.clervo.dev' || /^[a-z0-9-]+\.(?:[a-z0-9-]+\.)?run\.app$/u.test(target.hostname), true);
assert.equal(target.pathname, '/');
assert.equal(target.username, '');
assert.equal(target.password, '');
if (target.hostname === 'api.clervo.dev') assert.equal(audience, undefined, 'public proof must not use a Cloud Run identity token');
else {
  assert.equal(audience?.protocol, 'https:');
  assert.match(audience?.hostname ?? '', /^[a-z0-9-]+\.(?:[a-z0-9-]+\.)?run\.app$/u);
  assert.equal(audience?.pathname, '/');
}
if (payer !== null) assert.notEqual(payer.toLowerCase(), payTo.toLowerCase(), 'payer and receiver must differ');
assert.match(idempotencyKey, /^idem_[a-z0-9_]{16,96}$/u);
assert.equal(Number.isSafeInteger(port) && port >= 1024 && port <= 65535, true);

function identityToken() {
  assert.notEqual(audience, undefined, 'identity token requested for public target');
  const result = spawnSync('gcloud', ['auth', 'print-identity-token', `--audiences=${audience.origin}`], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 64 * 1024,
  });
  assert.equal(result.status, 0, 'Cloud Run identity token unavailable');
  const token = result.stdout.trim();
  assert.match(token, /^[A-Za-z0-9_.-]{100,8192}$/u);
  return token;
}

async function body(request, maximum = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximum) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function json(response, status, value) {
  const encoded = Buffer.from(JSON.stringify(value));
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': encoded.length, 'cache-control': 'no-store' });
  response.end(encoded);
}

async function staticFile(response, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//u, '');
  if (!/^(?:index\.html|assets\/[a-zA-Z0-9_.-]+)$/u.test(relative)) return false;
  const contents = await readFile(path.join(dist, relative));
  const type = relative.endsWith('.html') ? 'text/html; charset=utf-8' : relative.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
  response.writeHead(200, { 'content-type': type, 'content-length': contents.length, 'cache-control': 'no-store', 'content-security-policy': "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
  response.end(contents);
  return true;
}

const proofConfig = Object.freeze({
  network: 'eip155:8453', chainIdHex: '0x2105', asset,
  amountAtomic: profile.amountAtomic, amountDisplay: profile.amountDisplay,
  ...(payer === null ? {} : { payer }), payTo, productId, resource: profile.resource, idempotencyKey,
  payerBalanceCapAtomic: '32000', supplierCostCeilingAtomic: profile.supplierCostCeilingAtomic,
  request: profile.request,
});

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/config') return json(response, 200, proofConfig);
    if (request.method === 'POST' && url.pathname === '/api/paid-operation') {
      const incoming = await body(request);
      assert.deepEqual(JSON.parse(incoming.toString('utf8')), proofConfig.request, 'request body drift');
      assert.equal(request.headers['idempotency-key'], idempotencyKey, 'idempotency key drift');
      const payment = request.headers['payment-signature'];
      if (payment !== undefined) assert.equal(typeof payment === 'string' && payment.length <= 32_768, true, 'payment header invalid');
      const headers = {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
        ...(audience === undefined ? {} : { authorization: `Bearer ${identityToken()}` }),
        ...(payment ? { 'payment-signature': payment } : {}),
      };
      const upstream = await fetch(new URL(profile.route, target), {
        method: 'POST', headers, body: incoming, redirect: 'manual', signal: AbortSignal.timeout(45_000),
      });
      assert.equal(upstream.status >= 300 && upstream.status < 400, false, 'redirect refused');
      const returned = Buffer.from(await upstream.arrayBuffer());
      assert.equal(returned.length <= 512 * 1024, true, 'response too large');
      const outputHeaders = { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'content-length': returned.length, 'cache-control': 'no-store' };
      for (const name of ['payment-required', 'payment-response', 'idempotency-replayed']) {
        const value = upstream.headers.get(name);
        if (value) outputHeaders[name] = value;
      }
      response.writeHead(upstream.status, outputHeaders);
      return response.end(returned);
    }
    if (request.method === 'GET' && await staticFile(response, url.pathname)) return;
    json(response, 404, { error: 'not_found' });
  } catch (error) {
    json(response, 502, { error: 'proof_proxy_refused', recovery: 'stop_and_reconcile_without_retry' });
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`bounded x402 proof ready on http://127.0.0.1:${port}\n`);
  process.stdout.write(`${audience === undefined ? 'public' : 'private'} target: configured; wallet values: not printed; payment: not authorized\n`);
});
