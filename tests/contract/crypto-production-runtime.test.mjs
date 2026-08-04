import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTRACT_VERSION } from '../../dist/packages/contracts/src/index.js';
import { createCryptoProductionRuntime } from '../../apps/api/src/crypto-production-runtime.mjs';
import { CRYPTO_REQUEST_SCHEMA_VERSION } from '../../apps/api/src/x402-paid-crypto.mjs';

const nowMs = Date.parse('2026-08-04T12:00:00.000Z');
const address = '0x0000000000000000000000000000000000000001';
const token = '0x0000000000000000000000000000000000000002';
const transaction = `0x${'a'.repeat(64)}`;

function fetcher(input) {
  const url = new URL(input);
  if (url.pathname.endsWith('/token-balances')) return Response.json([{ value: '42', token: { address_hash: token, symbol: 'TKN', decimals: '6', type: 'ERC-20' } }]);
  if (url.pathname.includes('/api/v2/tokens/')) return Response.json({ address_hash: token, symbol: 'TKN', name: 'Test Token', decimals: '6', total_supply: '42000000', type: 'ERC-20', exchange_rate: '1' });
  if (url.pathname.endsWith('/transactions')) return Response.json({ items: [{ hash: transaction, block_number: 12, timestamp: '2026-08-04T11:59:59.000000Z', status: 'ok', from: { hash: address }, to: { hash: token }, value: '7' }] });
  return Response.json({ hash: address, coin_balance: '100', is_contract: false, has_tokens: true, has_token_transfers: true });
}

function request(kind, input, amountAtomic) {
  return { contractVersion: CONTRACT_VERSION, schemaVersion: CRYPTO_REQUEST_SCHEMA_VERSION, operationId: `op_${kind.padEnd(32, 'x')}`, productId: `crypto.${kind}`, input: { kind, chainId: 'eip155:1', ...input }, maximumCharge: { asset: 'USD', amountAtomic, decimals: 6 }, deadlineAt: '2026-08-04T12:00:30.000Z' };
}

test('crypto production runtime returns useful hash-bound wallet, token, transaction, and report results', async () => {
  const runtime = createCryptoProductionRuntime({ credential: 'test-private-key', fetcher, now: () => nowMs, hardDailyCallCeiling: 20 });
  const wallet = await runtime.execute(request('wallet', { address }, '500'));
  assert.equal(wallet.result.output.data.nativeBalance.amountAtomic, '100');
  assert.equal(wallet.result.output.data.assets[0].balanceAtomic, '42');
  const tokenResult = await runtime.execute(request('token', { assetAddress: token }, '250'));
  assert.equal(tokenResult.result.output.data.symbol, 'TKN');
  assert.equal(tokenResult.result.output.data.priceMicrousd, null);
  const transactions = await runtime.execute(request('transaction', { address, limit: 10 }, '500'));
  assert.equal(transactions.result.output.data.transactions[0].transactionId, transaction);
  const report = await runtime.execute(request('report', { address }, '1000'));
  assert.equal(report.result.output.state, 'degraded');
  assert.ok(report.result.output.data.coverage.missing.includes('protocol_positions'));
  assert.match(report.result.resultHash, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(report.qualificationIds, ['qual_BlockscoutValueAdded20260804']);
});

test('crypto production runtime rejects unsupported chains and response substitution before useful output', async () => {
  const runtime = createCryptoProductionRuntime({ credential: 'test-private-key', now: () => nowMs, async fetcher() { return Response.json({ hash: token, coin_balance: '1', is_contract: false }); } });
  await assert.rejects(runtime.execute(request('wallet', { address }, '500')), /unavailable|response_invalid/u);
});
