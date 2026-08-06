import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeBlockscoutTransactions,
  normalizeBlockscoutWallet,
  normalizeSolanaRpcWallet,
} from '../../dist/adapters/blockchain/src/intelligence-normalizers.js';

const observedAt = '2026-08-02T12:00:00.000Z';
const evmWallet = '0x0000000000000000000000000000000000000001';
const evmToken = '0x0000000000000000000000000000000000000002';
const solanaWallet = '11111111111111111111111111111111';
const solanaMint = 'So11111111111111111111111111111111111111112';

test('qualified EVM adapter output maps into the canonical wallet and transaction contracts', () => {
  const wallet = normalizeBlockscoutWallet({
    chainId: 8453,
    overview: { address: evmWallet, nativeBalanceAtomic: '100', isContract: false, transactionActivityPresent: true, tokenActivityPresent: true },
    tokens: [{ contractAddress: evmToken, symbol: 'TKN', decimals: 18, balanceAtomic: '42', tokenType: 'ERC-20' }],
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    observedAt,
    staleAfterMs: 60_000,
    nowMs: Date.parse(observedAt) + 1_000,
  });
  assert.equal(wallet.chainId, 'eip155:8453');
  assert.equal(wallet.assets[0].risk.level, 'unverified');
  assert.equal(wallet.evidence[0].fieldGroups.includes('token_balances'), true);
  const transactions = normalizeBlockscoutTransactions({
    chainId: 8453,
    transactions: [{ transactionHash: `0x${'a'.repeat(64)}`, blockNumber: 123, timestamp: observedAt, status: 'confirmed', from: evmWallet, to: evmToken, valueAtomic: '7' }],
    observedAt,
  });
  assert.equal(transactions[0].deterministicType, 'native_transfer');
  assert.equal(transactions[0].chainId, 'eip155:8453');
});

test('standard Solana RPC balance and parsed token accounts map without inventing token metadata', () => {
  const wallet = normalizeSolanaRpcWallet({
    address: solanaWallet,
    balanceResult: { context: { slot: 123 }, value: 1000 },
    tokenAccountsResult: {
      context: { slot: 123 },
      value: [{
        pubkey: solanaMint,
        account: {
          data: {
            program: 'spl-token',
            parsed: { info: { mint: solanaMint, owner: solanaWallet, tokenAmount: { amount: '42', decimals: 9, uiAmount: 0.000000042 } }, type: 'account' },
          },
        },
      }],
    },
    observedAt,
    staleAfterMs: 60_000,
    nowMs: Date.parse(observedAt) + 1_000,
  });
  assert.equal(wallet.protocol, 'solana');
  assert.equal(wallet.nativeBalance.amountAtomic, '1000');
  assert.equal(wallet.assets[0].symbol, null);
  assert.equal(wallet.assets[0].name, null);
  assert.equal(wallet.assets[0].risk.level, 'unverified');
});

test('Solana normalization rejects unsafe numeric precision, owner substitution, malformed mint identities, and unknown parsers', () => {
  const base = {
    address: solanaWallet,
    balanceResult: { value: 1000 },
    tokenAccountsResult: { value: [] },
    observedAt,
    staleAfterMs: 60_000,
    nowMs: Date.parse(observedAt) + 1_000,
  };
  assert.throws(() => normalizeSolanaRpcWallet({ ...base, balanceResult: { value: Number.MAX_SAFE_INTEGER + 1 } }), /response_invalid/u);
  const token = (overrides = {}) => ({ value: [{ account: { data: { program: 'spl-token', parsed: { info: { mint: solanaMint, owner: solanaWallet, tokenAmount: { amount: '1', decimals: 9 }, ...overrides } } } } }] });
  assert.throws(() => normalizeSolanaRpcWallet({ ...base, tokenAccountsResult: token({ owner: solanaMint }) }), /response_invalid/u);
  assert.throws(() => normalizeSolanaRpcWallet({ ...base, tokenAccountsResult: token({ mint: 'bad' }) }), /response_invalid/u);
  const unknown = token();
  unknown.value[0].account.data.program = 'unknown-parser';
  assert.throws(() => normalizeSolanaRpcWallet({ ...base, tokenAccountsResult: unknown }), /response_invalid/u);
});
