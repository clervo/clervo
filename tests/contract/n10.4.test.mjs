import assert from 'node:assert/strict';
import test from 'node:test';

import { CryptoIntelligenceGateway } from '../../dist/services/crypto/src/gateway.js';
import { normalizeCryptoToken, normalizeCryptoWallet } from '../../dist/services/crypto/src/normalization.js';

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

function source(sourceRef, overrides = {}) {
  return {
    sourceRef,
    chains: [chainId],
    capabilities: ['wallet', 'token', 'transaction', 'protocol'],
    async wallet() { return wallet('100', 'a'); },
    async token() { return token(null, 'a'); },
    async transactions() { return []; },
    async protocols() { return []; },
    ...overrides,
  };
}

test('crypto gateway composes all five intelligence products without custody, signing, or trading', async () => {
  const gateway = new CryptoIntelligenceGateway([source('crypto_source_0123456789abcdef')]);
  assert.equal((await gateway.wallet(chainId, walletAddress)).wallet.nativeBalance.amountAtomic, '100');
  assert.equal((await gateway.token(chainId, tokenAddress)).token.priceMicrousd, null);
  assert.deepEqual((await gateway.transactions(chainId, walletAddress, 10)).transactions, []);
  assert.deepEqual((await gateway.protocols(chainId, walletAddress)).positions, []);
  const report = await gateway.report(chainId, walletAddress, '2026-08-02T12:00:01.000Z');
  assert.match(report.disclaimer, /no custody, signing, or trading/u);
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
  const transaction = { chainId, transactionId: `0x${'a'.repeat(64)}`, status: 'confirmed', deterministicType: 'native_transfer', timestamp: observedAt, evidence: evidence('a', ['transaction']) };
  const gateway = new CryptoIntelligenceGateway([
    source('crypto_source_0123456789abcdef', { async transactions() { return [transaction]; } }),
    source('crypto_source_fedcba9876543210', { async transactions() { return [{ ...transaction, status: 'failed', evidence: evidence('b', ['transaction']) }]; } }),
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
