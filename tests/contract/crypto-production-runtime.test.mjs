import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTRACT_VERSION } from '../../dist/packages/contracts/src/index.js';
import { createCryptoProductionRuntime } from '../../apps/api/src/crypto-production-runtime.mjs';
import { CRYPTO_REQUEST_SCHEMA_VERSION } from '../../apps/api/src/x402-paid-crypto.mjs';

const nowMs = Date.parse('2026-08-04T12:00:00.000Z');
const address = '0x0000000000000000000000000000000000000001';
const token = '0x0000000000000000000000000000000000000002';
const transaction = `0x${'a'.repeat(64)}`;
const ethereumWstEth = '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0';
const solanaEndpoint = 'https://solana-mainnet.g.alchemy.com/v2/test-private-key';
const solanaAddress = '11111111111111111111111111111111';
const solanaMint = 'So11111111111111111111111111111111111111112';

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
  const runtime = createCryptoProductionRuntime({ credential: 'test-private-key', solanaRpcEndpoint: solanaEndpoint, fetcher, now: () => nowMs, hardDailyCallCeiling: 20 });
  const wallet = await runtime.execute(request('wallet', { address }, '500'));
  assert.equal(wallet.result.output.data.nativeBalance.amountAtomic, '100');
  assert.equal(wallet.result.output.data.assets[0].balanceAtomic, '42');
  const tokenResult = await runtime.execute(request('token', { assetAddress: token }, '250'));
  assert.equal(tokenResult.result.output.data.symbol, 'TKN');
  assert.equal(tokenResult.result.output.data.priceMicrousd, null);
  const transactions = await runtime.execute(request('transaction', { address, limit: 10 }, '500'));
  assert.equal(transactions.result.output.data.transactions[0].transactionId, transaction);
  const protocols = await runtime.execute(request('protocol', { address }, '750'));
  assert.deepEqual(protocols.result.output.data.supportedProtocolIds, ['lido']);
  assert.deepEqual(protocols.result.output.data.positions, []);
  assert.match(protocols.result.output.data.coverageNote, /absence is not proof/u);
  const report = await runtime.execute(request('report', { address }, '1000'));
  assert.equal(report.result.output.state, 'degraded');
  assert.ok(report.result.output.data.coverage.missing.includes('protocol_positions'));
  assert.match(report.result.resultHash, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(report.qualificationIds, ['qual_BlockscoutValueAdded20260804']);
});

test('crypto production runtime rejects unsupported chains and response substitution before useful output', async () => {
  const runtime = createCryptoProductionRuntime({ credential: 'test-private-key', solanaRpcEndpoint: solanaEndpoint, now: () => nowMs, async fetcher() { return Response.json({ hash: token, coin_balance: '1', is_contract: false }); } });
  await assert.rejects(runtime.execute(request('wallet', { address }, '500')), /unavailable|response_invalid/u);
});

test('crypto protocol operation classifies only an exact officially identified receipt-token address', async () => {
  const runtime = createCryptoProductionRuntime({ credential: 'test-private-key', solanaRpcEndpoint: solanaEndpoint, now: () => nowMs, async fetcher(input) {
    const url = new URL(input);
    if (url.pathname.endsWith('/token-balances')) return Response.json([{ value: '12', token: { address_hash: ethereumWstEth, symbol: 'wstETH', decimals: '18', type: 'ERC-20' } }]);
    return Response.json({ hash: address, coin_balance: '0', is_contract: false, has_tokens: true, has_token_transfers: true });
  } });
  const protocols = await runtime.execute(request('protocol', { address }, '750'));
  assert.equal(protocols.result.output.data.positions.length, 1);
  assert.equal(protocols.result.output.data.positions[0].protocolId, 'lido');
  assert.equal(protocols.result.output.data.positions[0].suppliedAssets[0].amountAtomic, '12');
});

test('crypto production runtime serves bounded Solana wallet, token, and history from the dedicated RPC contract', async () => {
  const signature = '2'.repeat(64);
  const runtime = createCryptoProductionRuntime({ credential: 'test-private-key', solanaRpcEndpoint: solanaEndpoint, now: () => nowMs, async fetcher(input, init) {
    assert.equal(new URL(input).hostname, 'solana-mainnet.g.alchemy.com');
    const requests = JSON.parse(Buffer.from(init.body).toString('utf8'));
    const values = (Array.isArray(requests) ? requests : [requests]).map(({ id, method }) => {
      if (method === 'getBalance') return { jsonrpc: '2.0', id, result: { context: { slot: 123 }, value: 1000 } };
      if (method === 'getTokenAccountsByOwner') return { jsonrpc: '2.0', id, result: { context: { slot: 123 }, value: [] } };
      if (method === 'getTokenSupply') return { jsonrpc: '2.0', id, result: { context: { slot: 123 }, value: { amount: '42000000', decimals: 9 } } };
      if (method === 'getSignaturesForAddress') return { jsonrpc: '2.0', id, result: [{ signature, slot: 123, blockTime: Math.floor(nowMs / 1000), err: null }] };
      throw new Error('unexpected test RPC method');
    });
    return Response.json(Array.isArray(requests) ? values : values[0]);
  } });
  const wallet = await runtime.execute({ ...request('wallet', { address: solanaAddress }, '500'), input: { kind: 'wallet', chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', address: solanaAddress } });
  assert.equal(wallet.result.output.data.nativeBalance.amountAtomic, '1000');
  const tokenResult = await runtime.execute({ ...request('token', { assetAddress: solanaMint }, '250'), input: { kind: 'token', chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', assetAddress: solanaMint } });
  assert.equal(tokenResult.result.output.data.totalSupplyAtomic, '42000000');
  const transactions = await runtime.execute({ ...request('transaction', { address: solanaAddress, limit: 10 }, '500'), input: { kind: 'transaction', chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', address: solanaAddress, limit: 10 } });
  assert.equal(transactions.result.output.data.transactions[0].transactionId, signature);
});
