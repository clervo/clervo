import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTRACT_VERSION, hashJson } from '../../dist/packages/contracts/src/index.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';
import { CRYPTO_RESULT_SCHEMA_VERSION, cryptoPublicPricing, normalizeCryptoHttpRequest } from '../../apps/api/src/x402-paid-crypto.mjs';

const now = '2026-08-09T18:00:00.000Z';
const address = '0x0000000000000000000000000000000000000000';

test('public Crypto route quotes authoritative prices, settles useful output once, and replays without execution or charge', async (context) => {
  const calls = { challenge: 0, authorize: 0, execute: 0, settle: 0 };
  const service = {
    mode: 'settlement_enabled',
    async challenge({ quote, resourcePath }) { calls.challenge += 1; return { status: 402, headers: { 'PAYMENT-REQUIRED': 'crypto', 'WWW-Authenticate': 'Payment id="crypto"' }, body: { accepts: [{ amount: quote.maximumCharge.amountAtomic }], resource: { url: `https://api.clervo.dev${resourcePath}` } } }; },
    async authorize() { calls.authorize += 1; return { fingerprint: `sha256:${'7'.repeat(64)}` }; },
    async settle() { calls.settle += 1; return { kind: 'settled', headers: {}, settlement: { network: 'eip155:8453', transaction: `0x${'8'.repeat(64)}` } }; },
  };
  const runtime = {
    durable: true,
    async ready() { return true; },
    async execute(request) {
      calls.execute += 1;
      const output = { kind: 'report', state: 'available', requestedChains: ['eip155:1'], servedChains: ['eip155:1'], observedAt: now, derivedAt: now, freshness: { status: 'fresh', observedAt: now }, coverage: { missingChains: [], chainFailures: [] }, evidence: [], evidenceRefs: [], provenance: { sourceClass: 'indexed_public_blockchain_data', thirdPartyLabelsUsed: false }, data: { activity: { observedTransactionCount: 1 } } };
      const unsigned = { contractVersion: CONTRACT_VERSION, schemaVersion: CRYPTO_RESULT_SCHEMA_VERSION, operationId: request.operationId, productId: request.productId, completedAt: now, meteredCharge: { asset: 'USD', amountAtomic: '0', decimals: 6 }, output };
      return { qualificationIds: [`qual_${'a'.repeat(24)}`], result: { ...unsigned, resultHash: hashJson(unsigned) } };
    },
  };
  const server = createSearchServer({ executor: { async execute() { throw new Error('unused'); } }, now: () => now, edgeAuthorization: 'edge-authorization-at-least-32-characters', x402Service: service, x402StateStore: new InMemoryX402OperationStore({ environmentNamespace: 'crypto_http' }), cryptoRuntime: runtime });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const edge = { 'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters' };

  const discoveryProbe = await fetch(`${origin}/v1/crypto/execute`, { method: 'POST', headers: edge });
  assert.equal(discoveryProbe.status, 402);
  assert.equal((await discoveryProbe.json()).accepts[0].amount, '4000');

  const body = JSON.stringify({ kind: 'report', address, chains: ['eip155:1'], lookbackDays: 30, limit: 50 });
  const headers = { ...edge, 'content-type': 'application/json', 'idempotency-key': 'idem_crypto_http_report_001' };
  assert.equal((await fetch(`${origin}/v1/crypto/execute`, { method: 'POST', headers, body })).status, 402);
  const paid = await fetch(`${origin}/v1/crypto/execute`, { method: 'POST', headers: { ...headers, 'payment-signature': 'opaque' }, body });
  assert.equal(paid.status, 200);
  assert.equal((await paid.json()).result.output.kind, 'report');
  const replay = await fetch(`${origin}/v1/crypto/execute`, { method: 'POST', headers, body });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).replayed, true);
  assert.deepEqual(calls, { challenge: 2, authorize: 1, execute: 1, settle: 1 });
});

test('Crypto validation and price authority fail closed before settlement', () => {
  assert.throws(() => normalizeCryptoHttpRequest({ kind: 'report', address, chains: ['eip155:10'], lookbackDays: 30, limit: 50 }), /chain_unavailable/u);
  assert.throws(() => normalizeCryptoHttpRequest({ kind: 'report', address, chains: ['eip155:1'], lookbackDays: 91, limit: 50 }), /lookback_invalid/u);
  const prices = ['balances', 'tokens', 'transactions', 'report'].map((kind) => cryptoPublicPricing(normalizeCryptoHttpRequest({ kind, address, chains: ['eip155:1'], ...(kind === 'transactions' || kind === 'report' ? { lookbackDays: 30, limit: 50 } : {}) })).maximumCharge.amountAtomic);
  assert.deepEqual(prices, ['2000', '2000', '3000', '4000']);
});
