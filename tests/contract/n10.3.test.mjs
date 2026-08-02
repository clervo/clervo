import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeCryptoTokenEvidence,
  normalizeCryptoProtocolPosition,
  normalizeCryptoToken,
  normalizeCryptoWallet,
} from '../../dist/services/crypto/src/normalization.js';
import { buildCryptoReport } from '../../dist/services/crypto/src/report.js';

const observedAt = '2026-08-02T12:00:00.000Z';
const chainId = 'eip155:1';
const walletAddress = '0x0000000000000000000000000000000000000001';
const tokenAddress = '0x0000000000000000000000000000000000000002';
const evidenceRef = `evidence_${'a'.repeat(32)}`;
const evidence = [{ evidenceRef, sourceUrl: 'https://evidence.example/token', observedAt, fieldGroups: ['token_metadata', 'price'] }];

function token(overrides = {}) {
  return normalizeCryptoToken({
    chainId,
    assetAddress: tokenAddress,
    symbol: 'TKN',
    name: 'Token',
    decimals: 18,
    totalSupplyAtomic: null,
    priceMicrousd: null,
    marketCapMicrousd: null,
    liquidityMicrousd: null,
    observedAt,
    staleAfterMs: 60_000,
    confidenceBasisPoints: 5000,
    confidenceBasis: ['single_source'],
    evidence,
    risk: { level: 'unverified', classifications: [], evidenceRefs: [] },
    ...overrides,
  }, Date.parse(observedAt) + 1_000);
}

function wallet() {
  return normalizeCryptoWallet({
    chainId,
    address: walletAddress,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    nativeBalanceAtomic: '100',
    assets: [],
    observedAt,
    staleAfterMs: 60_000,
    evidence: [{ evidenceRef: `evidence_${'b'.repeat(32)}`, sourceUrl: 'https://evidence.example/wallet', observedAt, fieldGroups: ['native_balance'] }],
    coverage: ['native_balance'],
  }, Date.parse(observedAt) + 1_000);
}

test('token normalization preserves missing market data as null and surfaces conflicting values with conservative confidence', () => {
  const first = token();
  assert.equal(first.priceMicrousd, null);
  assert.equal(first.totalSupplyAtomic, null);
  const second = token({ priceMicrousd: 1_000_000, confidenceBasisPoints: 9000, confidenceBasis: ['two_sources'] });
  const merged = mergeCryptoTokenEvidence([first, second]);
  assert.ok(merged.conflicts.some(({ field, values }) => field === 'priceMicrousd' && values.includes('missing')));
  assert.equal(merged.confidence.scoreBasisPoints, 5000);
  assert.deepEqual(new Set(merged.confidence.basis), new Set(['single_source', 'two_sources']));
});

test('protocol positions preserve atomic assets, freshness, provenance, and unknown USD value', () => {
  const position = normalizeCryptoProtocolPosition({
    chainId,
    walletAddress,
    protocolId: 'protocol.example',
    protocolName: 'Example Protocol',
    category: 'lending',
    positionId: 'position-1',
    suppliedAssets: [{ assetAddress: tokenAddress, amountAtomic: '42', decimals: 18 }],
    borrowedAssets: [],
    netValueMicrousd: null,
    observedAt,
    staleAfterMs: 60_000,
    evidence,
  }, Date.parse(observedAt) + 1_000);
  assert.equal(position.suppliedAssets[0].amountAtomic, '42');
  assert.equal(position.netValueMicrousd, null);
  assert.equal(position.freshness.status, 'fresh');
});

test('deterministic report states coverage gaps and never creates advice, prices, or actions', () => {
  const result = buildCryptoReport({ wallet: wallet(), tokens: [token()], transactions: [], protocols: [], generatedAt: '2026-08-02T12:00:01.000Z' });
  assert.ok(result.coverage.missing.includes('prices'));
  assert.ok(result.coverage.missing.includes('transactions'));
  assert.match(result.warnings.join(' '), /Coverage is incomplete/u);
  assert.match(result.disclaimer, /performs no custody, signing, or trading/u);
  assert.equal(JSON.stringify(result).includes('recommend buying'), false);
});

test('unsupported risk and malformed protocol/token values fail closed', () => {
  assert.throws(() => token({ confidenceBasisPoints: 10001 }), /token_invalid/u);
  assert.throws(() => normalizeCryptoProtocolPosition({
    chainId,
    walletAddress,
    protocolId: 'bad id',
    protocolName: 'Example',
    category: 'lending',
    positionId: 'position-1',
    suppliedAssets: [],
    borrowedAssets: [],
    netValueMicrousd: null,
    observedAt,
    staleAfterMs: 60_000,
    evidence,
  }, Date.parse(observedAt) + 1_000), /protocol_position_invalid/u);
});
