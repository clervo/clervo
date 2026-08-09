import assert from 'node:assert/strict';
import test from 'node:test';

import { CryptoIntelligenceGateway } from '../../dist/services/crypto/src/gateway.js';
import { normalizeCryptoToken, normalizeCryptoTransaction, normalizeCryptoWallet } from '../../dist/services/crypto/src/normalization.js';

const chainId = 'eip155:1';
const walletAddress = '0x0000000000000000000000000000000000000001';
const tokenAddress = '0x0000000000000000000000000000000000000002';
const observedAt = '2026-08-02T12:00:00.000Z';
const evidence = (suffix, fields) => [{ evidenceRef: `evidence_${suffix.repeat(32)}`, sourceUrl: `https://evidence.example/${suffix}`, observedAt, fieldGroups: fields }];

function wallet(amount, suffix) {
  return normalizeCryptoWallet({ chainId, address: walletAddress, nativeSymbol: 'ETH', nativeDecimals: 18, nativeBalanceAtomic: amount, assets: [], observedAt, staleAfterMs: 60_000, evidence: evidence(suffix, ['native_balance']), coverage: ['native_balance'] }, Date.parse(observedAt) + 1_000);
}

function token(price, suffix) {
  return normalizeCryptoToken({ chainId, assetAddress: tokenAddress, symbol: 'TKN', name: 'Token', decimals: 18, totalSupplyAtomic: null, priceMicrousd: price, marketCapMicrousd: null, liquidityMicrousd: null, observedAt, staleAfterMs: 60_000, confidenceBasisPoints: 5000, confidenceBasis: ['single_source'], evidence: evidence(suffix, ['token_metadata']), risk: { level: 'unverified', classifications: [], evidenceRefs: [] } }, Date.parse(observedAt) + 1_000);
}

function transaction(status = 'confirmed', suffix = 'a') {
  return normalizeCryptoTransaction({
    chainId,
    transactionId: `0x${suffix.repeat(64)}`,
    blockHeight: 1,
    timestamp: observedAt,
    status,
    from: tokenAddress,
    to: walletAddress,
    nativeValueAtomic: '1',
    tokenTransfers: [],
    programOrContract: null,
    observedAt,
    evidence: evidence(suffix, ['transaction']),
  });
}

const transactionBatch = (transactions = []) => ({ transactions, coverage: ['transactions', 'token_transfers'], missing: [], truncated: false });

function source(sourceRef, overrides = {}) {
  return {
    sourceRef,
    chains: [chainId],
    capabilities: ['wallet', 'token', 'transaction', 'protocol'],
    async wallet() { return wallet('100', 'a'); },
    async token() { return token(null, 'a'); },
    async transactions() { return transactionBatch(); },
    async protocols() { return []; },
    ...overrides,
  };
}

test('crypto gateway preserves provider replacement behind one stable report contract', async () => {
  const gateway = new CryptoIntelligenceGateway([source('crypto_source_0123456789abcdef')]);
  assert.equal((await gateway.wallet(chainId, walletAddress)).wallet.nativeBalance.amountAtomic, '100');
  assert.equal((await gateway.token(chainId, tokenAddress)).token.priceMicrousd, null);
  assert.deepEqual((await gateway.transactions(chainId, walletAddress, 10)).transactions, []);
  assert.deepEqual((await gateway.protocols(chainId, walletAddress)).positions, []);
  const report = await gateway.report(chainId, walletAddress, '2026-08-02T12:00:01.000Z');
  assert.match(report.disclaimer, /custody assets, sign, or trade/u);
  assert.equal('trade' in gateway || 'sign' in gateway || 'sendTransaction' in gateway, false);
});

test('source outages degrade independently and conflicting values remain visible', async () => {
  const gateway = new CryptoIntelligenceGateway([
    source('crypto_source_0123456789abcdef'),
    source('crypto_source_fedcba9876543210', {
      async wallet() { return wallet('200', 'b'); },
      async token() { throw new Error('upstream detail'); },
    }),
  ]);
  const walletResult = await gateway.wallet(chainId, walletAddress);
  assert.equal(walletResult.state, 'available');
  assert.ok(walletResult.wallet.conflicts.some(({ field }) => field === 'native_balance'));
  const tokenResult = await gateway.token(chainId, tokenAddress);
  assert.equal(tokenResult.state, 'degraded');
  assert.equal(tokenResult.sources[1].failureCode, 'source_failed');
});

test('transaction conflicts are surfaced while the first deterministic record remains stable', async () => {
  const first = transaction('confirmed', 'a');
  const gateway = new CryptoIntelligenceGateway([
    source('crypto_source_0123456789abcdef', { async transactions() { return transactionBatch([first]); } }),
    source('crypto_source_fedcba9876543210', { async transactions() { return transactionBatch([{ ...first, status: 'failed', evidence: evidence('b', ['transaction']) }]); } }),
  ]);
  const result = await gateway.transactions(chainId, walletAddress, 10);
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].status, 'confirmed');
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].state, 'unresolved');
});

test('gateway fails closed on invalid identity, source substitution, cancellation, and total outage', async () => {
  const substituted = source('crypto_source_0123456789abcdef', { async wallet() { return wallet('100', 'a'); } });
  substituted.chains = ['eip155:8453'];
  const other = new CryptoIntelligenceGateway([substituted]);
  await assert.rejects(other.wallet(chainId, walletAddress), /unavailable/u);
  const failed = new CryptoIntelligenceGateway([source('crypto_source_0123456789abcdef', { async wallet() { throw new Error('secret upstream detail'); } })]);
  await assert.rejects(failed.wallet(chainId, walletAddress), /unavailable/u);
  await assert.rejects(failed.wallet(chainId, 'bad'), /address_invalid/u);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(failed.wallet(chainId, walletAddress, controller.signal), /cancelled/u);
});
