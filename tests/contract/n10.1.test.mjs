import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeCryptoWalletEvidence,
  normalizeCryptoTransaction,
  normalizeCryptoWallet,
} from '../../dist/services/crypto/src/normalization.js';

const evmChain = 'eip155:1';
const solanaChain = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const evmWallet = '0x0000000000000000000000000000000000000001';
const evmToken = '0x0000000000000000000000000000000000000002';
const solanaWallet = '11111111111111111111111111111111';
const solanaMint = 'So11111111111111111111111111111111111111112';
const observedAt = '2026-08-02T12:00:00.000Z';
const evidence = (suffix, fields = ['native_balance', 'token_balances']) => [{
  evidenceRef: `evidence_${suffix.repeat(32)}`,
  sourceUrl: `https://evidence.example/${suffix}`,
  observedAt,
  fieldGroups: fields,
}];

function wallet(overrides = {}) {
  return {
    chainId: evmChain,
    address: evmWallet,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    nativeBalanceAtomic: '1000000000000000000',
    assets: [{ assetAddress: evmToken, symbol: 'TKN', name: 'Token', decimals: 18, balanceAtomic: '42', risk: { level: 'unverified', classifications: [], evidenceRefs: [] } }],
    observedAt,
    staleAfterMs: 60_000,
    evidence: evidence('a'),
    coverage: ['native_balance', 'token_balances'],
    ...overrides,
  };
}

test('EVM and Solana wallet normalization preserves canonical chains, addresses, decimals, freshness, coverage, and evidence', () => {
  const evm = normalizeCryptoWallet(wallet(), Date.parse(observedAt) + 30_000);
  assert.equal(evm.protocol, 'evm');
  assert.equal(evm.nativeBalance.amountAtomic, '1000000000000000000');
  assert.equal(evm.assets[0].assetId, `${evmChain}/token:${evmToken}`);
  assert.equal(evm.freshness.status, 'fresh');
  const solana = normalizeCryptoWallet(wallet({
    chainId: solanaChain,
    address: solanaWallet,
    nativeSymbol: 'SOL',
    nativeDecimals: 9,
    nativeBalanceAtomic: null,
    assets: [{ assetAddress: solanaMint, symbol: null, name: null, decimals: 9, balanceAtomic: '1' }],
  }), Date.parse(observedAt) + 120_000);
  assert.equal(solana.protocol, 'solana');
  assert.equal(solana.nativeBalance, null);
  assert.equal(solana.freshness.status, 'stale');
  assert.equal(solana.assets[0].symbol, null);
});

test('conflicting source values remain unresolved and missing data is never converted to zero', () => {
  const left = normalizeCryptoWallet(wallet(), Date.parse(observedAt) + 30_000);
  const right = normalizeCryptoWallet(wallet({
    nativeBalanceAtomic: null,
    assets: [],
    evidence: evidence('b'),
  }), Date.parse(observedAt) + 30_000);
  const merged = mergeCryptoWalletEvidence([left, right]);
  assert.ok(merged.conflicts.some(({ field, values, state }) => field === 'native_balance' && values.includes('missing') && state === 'unresolved'));
  assert.ok(merged.conflicts.some(({ field }) => field.startsWith('asset_balance:')));
  assert.equal(merged.nativeBalance, left.nativeBalance);
  assert.equal(merged.evidence.length, 2);
});

test('risk language is cautious, attributable, and refuses unsupported malicious claims', () => {
  const known = normalizeCryptoWallet(wallet({
    assets: [{ assetAddress: evmToken, symbol: 'BAD', name: 'Bad Token', decimals: 18, balanceAtomic: '1', risk: { level: 'known_malicious', classifications: ['published_blocklist'], evidenceRefs: [`evidence_${'a'.repeat(32)}`] } }],
  }), Date.parse(observedAt) + 1_000);
  assert.match(known.assets[0].risk.language, /identified source classifies/u);
  assert.match(known.assets[0].risk.language, /verify independently/u);
  assert.throws(() => normalizeCryptoWallet(wallet({
    assets: [{ assetAddress: evmToken, symbol: 'BAD', name: null, decimals: 18, balanceAtomic: '1', risk: { level: 'known_malicious', classifications: ['published_blocklist'], evidenceRefs: [] } }],
  }), Date.parse(observedAt) + 1_000), /risk_invalid/u);
  assert.match(normalizeCryptoWallet(wallet(), Date.parse(observedAt) + 1_000).assets[0].risk.language, /not proof of harm/u);
});

test('transaction normalization decodes deterministically before explanation for EVM and Solana', () => {
  const evm = normalizeCryptoTransaction({
    chainId: evmChain,
    transactionId: `0x${'a'.repeat(64)}`,
    blockHeight: 123,
    timestamp: observedAt,
    status: 'confirmed',
    from: evmWallet,
    to: evmToken,
    nativeValueAtomic: '0',
    tokenTransfers: [{ assetAddress: evmToken, from: evmWallet, to: evmToken, amountAtomic: '42', decimals: 18 }],
    programOrContract: evmToken,
    observedAt,
    evidence: evidence('c', ['transaction']),
  });
  assert.equal(evm.deterministicType, 'token_transfer');
  const solana = normalizeCryptoTransaction({
    chainId: solanaChain,
    transactionId: '2'.repeat(88),
    blockHeight: 456,
    timestamp: null,
    status: 'unknown',
    from: solanaWallet,
    to: null,
    nativeValueAtomic: null,
    tokenTransfers: [],
    programOrContract: solanaMint,
    observedAt,
    evidence: evidence('d', ['transaction']),
  });
  assert.equal(solana.deterministicType, 'program_interaction');
  assert.equal(solana.timestamp, null);
});

test('normalization fails closed on malformed addresses, noncanonical amounts, unsafe evidence URLs, and future observations', () => {
  assert.throws(() => normalizeCryptoWallet(wallet({ address: '0x1234' }), Date.parse(observedAt) + 1_000), /address_invalid/u);
  assert.throws(() => normalizeCryptoWallet(wallet({ nativeBalanceAtomic: '01' }), Date.parse(observedAt) + 1_000), /balance_invalid/u);
  assert.throws(() => normalizeCryptoWallet(wallet({ evidence: [{ ...evidence('a')[0], sourceUrl: 'http://127.0.0.1/private' }] }), Date.parse(observedAt) + 1_000), /evidence_invalid/u);
  assert.throws(() => normalizeCryptoWallet(wallet(), Date.parse(observedAt) - 1), /freshness_invalid/u);
});
