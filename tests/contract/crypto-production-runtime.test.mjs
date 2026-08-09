import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTRACT_VERSION } from '../../dist/packages/contracts/src/index.js';
import { createCryptoProductionRuntime } from '../../apps/api/src/crypto-production-runtime.mjs';
import { CRYPTO_REQUEST_SCHEMA_VERSION } from '../../apps/api/src/x402-paid-crypto.mjs';

const nowMs = Date.parse('2026-08-09T18:00:00.000Z');
const address = '0x0000000000000000000000000000000000000001';
const counterparty = '0x0000000000000000000000000000000000000002';
const token = '0x0000000000000000000000000000000000000003';
const transaction = `0x${'a'.repeat(64)}`;
const productByKind = {
  balances: 'crypto.wallet.balances',
  tokens: 'crypto.wallet.tokens',
  transactions: 'crypto.wallet.transactions',
  report: 'crypto.wallet.report',
};

function fetcher(input) {
  const url = new URL(input);
  if (url.pathname.endsWith('/token-balances')) return Response.json([{ value: '42', token: { address_hash: token, symbol: 'TKN', decimals: '6', type: 'ERC-20' } }]);
  if (url.pathname.endsWith('/token-transfers')) return Response.json({ items: [{ transaction_hash: transaction, block_number: 12, log_index: 1, timestamp: '2026-08-09T17:59:59.000000Z', token_type: 'ERC-20', from: { hash: counterparty }, to: { hash: address }, token: { address_hash: token, symbol: 'TKN', name: 'Token', decimals: '6' }, total: { value: '7', decimals: '6' } }] });
  if (url.pathname.endsWith('/transactions')) return Response.json({ items: [{ hash: transaction, block_number: 12, timestamp: '2026-08-09T17:59:59.000000Z', status: 'ok', from: { hash: counterparty }, to: { hash: address }, value: '5' }] });
  return Response.json({ hash: address, coin_balance: '100', is_contract: false, has_tokens: true, has_token_transfers: true });
}

function request(kind, amountAtomic) {
  return {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: CRYPTO_REQUEST_SCHEMA_VERSION,
    operationId: `op_${kind.padEnd(32, 'x')}`,
    productId: productByKind[kind],
    input: { kind, address, chains: ['eip155:1'], ...(kind === 'transactions' || kind === 'report' ? { lookbackDays: 30, limit: 50 } : {}) },
    maximumCharge: { asset: 'USD', amountAtomic, decimals: 6 },
    deadlineAt: '2026-08-09T18:00:30.000Z',
  };
}

test('crypto production runtime returns bounded balances, holdings, activity, and deterministic report evidence', async () => {
  const runtime = createCryptoProductionRuntime({ credential: 'test-private-key', fetcher, now: () => nowMs, hardDailyCallCeiling: 20 });
  assert.deepEqual(runtime.supportedChains, ['eip155:1', 'eip155:8453']);
  assert.deepEqual(runtime.supportedKinds, ['balances', 'tokens', 'transactions', 'report']);

  const balances = await runtime.execute(request('balances', '2000'));
  assert.equal(balances.result.output.data.chains[0].nativeBalance.amountAtomic, '100');
  const tokens = await runtime.execute(request('tokens', '2000'));
  assert.equal(tokens.result.output.data.chains[0].tokenHoldings[0].balanceAtomic, '42');
  const transactions = await runtime.execute(request('transactions', '3000'));
  assert.equal(transactions.result.output.data.chains[0].transactions[0].transactionId, transaction);
  assert.equal(transactions.result.output.data.chains[0].transactions[0].tokenTransfers[0].amountAtomic, '7');
  const report = await runtime.execute(request('report', '4000'));
  assert.equal(report.result.output.data.flows.byChain[0].byAsset.find(({ assetId }) => assetId.endsWith(token)).inboundAtomic, '7');
  assert.equal(report.result.output.data.counterparties.labelsInferred, false);
  assert.equal(report.result.output.provenance.rawApiResale, false);
  assert.equal(report.result.output.provenance.thirdPartyLabelsUsed, false);
  assert.match(report.result.resultHash, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(report.qualificationIds, ['qual_BlockscoutValueAdded20260809']);
});

test('crypto production runtime preserves useful partial chain output and explicit source degradation', async () => {
  const runtime = createCryptoProductionRuntime({ credential: 'test-private-key', now: () => nowMs, async fetcher(input) {
    const url = new URL(input);
    if (url.pathname.startsWith('/8453/')) return new Response('unavailable', { status: 503 });
    return fetcher(input);
  } });
  const value = await runtime.execute({ ...request('report', '4000'), input: { ...request('report', '4000').input, chains: ['eip155:1', 'eip155:8453'] } });
  assert.equal(value.result.output.state, 'degraded');
  assert.deepEqual(value.result.output.servedChains, ['eip155:1']);
  assert.deepEqual(value.result.output.coverage.missingChains, ['eip155:8453']);
  assert.equal(value.result.output.coverage.chainFailures[0].code, 'source_unavailable');
});

test('crypto production runtime fails closed on total source failure, malformed data, expiry, and unsupported operation kinds', async () => {
  const unavailable = createCryptoProductionRuntime({ credential: 'test-private-key', now: () => nowMs, async fetcher() { return new Response('unavailable', { status: 503 }); } });
  await assert.rejects(unavailable.execute(request('report', '4000')), /sources_unavailable/u);

  const malformed = createCryptoProductionRuntime({ credential: 'test-private-key', now: () => nowMs, async fetcher() { return Response.json({ hash: token, coin_balance: '-1', is_contract: false }); } });
  await assert.rejects(malformed.execute(request('balances', '2000')), /sources_unavailable/u);

  const expired = createCryptoProductionRuntime({ credential: 'test-private-key', now: () => Date.parse('2026-08-17T00:00:00.000Z'), fetcher });
  assert.equal(await expired.ready(), false);
  await assert.rejects(expired.execute({ ...request('balances', '2000'), deadlineAt: '2026-08-17T00:00:30.000Z' }), /qualification_expired/u);
  await assert.rejects(unavailable.execute({ ...request('report', '4000'), input: { ...request('report', '4000').input, kind: 'protocol' } }), /kind_unavailable/u);
});

test('crypto production runtime applies the operation deadline across all upstream work', async () => {
  const runtime = createCryptoProductionRuntime({ credential: 'test-private-key', now: () => nowMs, fetcher(input, init) {
    return new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
  } });
  await assert.rejects(runtime.execute({ ...request('report', '4000'), deadlineAt: new Date(nowMs + 5).toISOString() }), /deadline_exceeded/u);
});
