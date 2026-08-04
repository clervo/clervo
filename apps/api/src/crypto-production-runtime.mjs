import { CONTRACT_VERSION, hashJson } from '../../../dist/packages/contracts/src/index.js';
import { BlockscoutDataAdapter } from '../../../dist/adapters/blockchain/src/blockscout-data.js';
import { normalizeBlockscoutToken, normalizeBlockscoutTransactions, normalizeBlockscoutWallet, normalizeSolanaRpcToken, normalizeSolanaRpcTransactions, normalizeSolanaRpcWallet } from '../../../dist/adapters/blockchain/src/intelligence-normalizers.js';
import { createBoundedRpcHttpTransport, JsonRpcAdapter } from '../../../dist/adapters/rpc/src/json-rpc.js';
import { CryptoIntelligenceGateway } from '../../../dist/services/crypto/src/gateway.js';
import { normalizeCryptoProtocolPosition } from '../../../dist/services/crypto/src/normalization.js';
import { CRYPTO_RESULT_SCHEMA_VERSION } from './x402-paid-crypto.mjs';

const CHAIN_CONFIG = Object.freeze({
  'eip155:1': Object.freeze({ numericId: 1, nativeSymbol: 'ETH', nativeDecimals: 18 }),
  'eip155:8453': Object.freeze({ numericId: 8453, nativeSymbol: 'ETH', nativeDecimals: 18 }),
});
const QUALIFICATION_ID = 'qual_BlockscoutValueAdded20260804';
const SOURCE_REF = 'crypto_source_3c34c5827ba3f772';
const SOLANA_SOURCE_REF = 'crypto_source_4eb6603d25bf6e2e';
const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SOLANA_TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const PROTOCOL_ASSETS = Object.freeze({
  'eip155:1': Object.freeze(new Map([
    ['0xae7ab96520de3a18e5e111b5eaab095312d7fe84', Object.freeze({ protocolId: 'lido', protocolName: 'Lido', category: 'staking' })],
    ['0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', Object.freeze({ protocolId: 'lido', protocolName: 'Lido', category: 'staking' })],
  ])),
  'eip155:8453': Object.freeze(new Map([
    ['0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452', Object.freeze({ protocolId: 'lido', protocolName: 'Lido', category: 'staking' })],
  ])),
});

function boundedTransport(fetcher) {
  return async ({ url, signal, maximumResponseBytes }) => {
    if (url.origin !== 'https://api.blockscout.com' || !/^\/(?:1|8453)\/api\/v2\//u.test(url.pathname) || !Number.isSafeInteger(maximumResponseBytes) || maximumResponseBytes < 1 || maximumResponseBytes > 2_000_000) throw new Error('blockchain_data_transport_policy_failed');
    const response = await fetcher(url, { method: 'GET', headers: { accept: 'application/json' }, redirect: 'error', signal });
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maximumResponseBytes) throw new Error('blockchain_data_response_too_large');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumResponseBytes) throw new Error('blockchain_data_response_too_large');
    let body;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('blockchain_data_response_invalid_json'); }
    return Object.freeze({ status: response.status, body });
  };
}

function result(request, output, completedAt) {
  const unsigned = Object.freeze({ contractVersion: CONTRACT_VERSION, schemaVersion: CRYPTO_RESULT_SCHEMA_VERSION, operationId: request.operationId, productId: request.productId, completedAt, meteredCharge: Object.freeze({ asset: 'USD', amountAtomic: '0', decimals: 6 }), output });
  return Object.freeze({ ...unsigned, resultHash: hashJson(unsigned) });
}

function solanaEndpoint(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new TypeError('crypto_solana_endpoint_invalid'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || parsed.hostname !== 'solana-mainnet.g.alchemy.com' || !/^\/v2\/[A-Za-z0-9_-]{8,256}$/u.test(parsed.pathname) || parsed.search) throw new TypeError('crypto_solana_endpoint_invalid');
  return parsed.href;
}

function rpcResults(outcomes) {
  if (!Array.isArray(outcomes) || outcomes.some(({ ok }) => ok !== true)) throw new Error('crypto_solana_source_failed');
  return outcomes.map(({ result: value }) => value);
}

export function createCryptoProductionRuntime({ credential, solanaRpcEndpoint, fetcher = globalThis.fetch, now = () => Date.now(), hardDailyCallCeiling = 100_000 } = {}) {
  if (typeof credential !== 'string' || credential.trim().length < 8 || typeof fetcher !== 'function' || typeof now !== 'function') throw new TypeError('crypto_production_configuration_invalid');
  const selectedSolanaEndpoint = solanaEndpoint(solanaRpcEndpoint);
  const adapter = new BlockscoutDataAdapter({ apiKey: credential, allowedChainIds: Object.values(CHAIN_CONFIG).map(({ numericId }) => numericId), hardDailyCallCeiling }, boundedTransport(fetcher));
  const evmSource = Object.freeze({
    sourceRef: SOURCE_REF,
    chains: Object.freeze(Object.keys(CHAIN_CONFIG)),
    capabilities: Object.freeze(['wallet', 'token', 'transaction', 'protocol']),
    async wallet(chainId, walletAddress, signal) {
      const config = CHAIN_CONFIG[chainId];
      if (!config) throw new Error('crypto_chain_unavailable');
      const [overview, tokens] = await Promise.all([adapter.addressOverview(config.numericId, walletAddress, signal), adapter.tokenBalances(config.numericId, walletAddress, signal)]);
      const observedAt = new Date(now()).toISOString();
      return normalizeBlockscoutWallet({ chainId: config.numericId, overview, tokens, nativeSymbol: config.nativeSymbol, nativeDecimals: config.nativeDecimals, observedAt, staleAfterMs: 120_000, nowMs: now() });
    },
    async token(chainId, assetAddress, signal) {
      const config = CHAIN_CONFIG[chainId];
      if (!config) throw new Error('crypto_chain_unavailable');
      const token = await adapter.tokenOverview(config.numericId, assetAddress, signal);
      const observedAt = new Date(now()).toISOString();
      return normalizeBlockscoutToken({ chainId: config.numericId, token, observedAt, staleAfterMs: 300_000, nowMs: now() });
    },
    async transactions(chainId, walletAddress, limit, signal) {
      const config = CHAIN_CONFIG[chainId];
      if (!config) throw new Error('crypto_chain_unavailable');
      const rows = await adapter.transactions(config.numericId, walletAddress, signal);
      const observedAt = new Date(now()).toISOString();
      return normalizeBlockscoutTransactions({ chainId: config.numericId, transactions: rows.slice(0, limit), observedAt });
    },
    async protocols(chainId, walletAddress, signal) {
      const wallet = await this.wallet(chainId, walletAddress, signal);
      const selected = PROTOCOL_ASSETS[chainId];
      if (!selected) throw new Error('crypto_chain_unavailable');
      return Object.freeze(wallet.assets.flatMap((asset) => {
        const definition = selected.get(asset.assetAddress);
        if (!definition || asset.balanceAtomic === '0') return [];
        return [normalizeCryptoProtocolPosition({
          chainId,
          walletAddress,
          protocolId: definition.protocolId,
          protocolName: definition.protocolName,
          category: definition.category,
          positionId: `receipt-token:${asset.assetAddress}`,
          suppliedAssets: Object.freeze([{ assetAddress: asset.assetAddress, amountAtomic: asset.balanceAtomic, decimals: asset.decimals }]),
          borrowedAssets: Object.freeze([]),
          netValueMicrousd: null,
          observedAt: wallet.observedAt,
          staleAfterMs: wallet.freshness.staleAfterMs,
          evidence: wallet.evidence,
        }, now())];
      }));
    },
  });
  const solanaAdapter = new JsonRpcAdapter({
    config: { routeId: 'rpc.route.alchemy_solana', chainId: SOLANA_MAINNET, allowedHosts: ['solana-mainnet.g.alchemy.com'], maximumRequestBytes: 262_144, maximumResponseBytes: 10_485_760, timeoutMs: 8_000 },
    transport: createBoundedRpcHttpTransport(fetcher),
    async resolveEndpoint() { return selectedSolanaEndpoint; },
  });
  const solanaSource = Object.freeze({
    sourceRef: SOLANA_SOURCE_REF,
    chains: Object.freeze([SOLANA_MAINNET]),
    capabilities: Object.freeze(['wallet', 'token', 'transaction']),
    async wallet(chainId, walletAddress, signal) {
      if (chainId !== SOLANA_MAINNET) throw new Error('crypto_chain_unavailable');
      const values = rpcResults(await solanaAdapter.execute([
        { method: 'getBalance', params: [walletAddress, { commitment: 'finalized' }] },
        { method: 'getTokenAccountsByOwner', params: [walletAddress, { programId: SOLANA_TOKEN_PROGRAM }, { encoding: 'jsonParsed', commitment: 'finalized' }] },
        { method: 'getTokenAccountsByOwner', params: [walletAddress, { programId: SOLANA_TOKEN_2022_PROGRAM }, { encoding: 'jsonParsed', commitment: 'finalized' }] },
      ], signal));
      const legacy = values[1]; const token2022 = values[2];
      if (!legacy || typeof legacy !== 'object' || !Array.isArray(legacy.value) || !token2022 || typeof token2022 !== 'object' || !Array.isArray(token2022.value)) throw new Error('crypto_solana_source_failed');
      const observedAt = new Date(now()).toISOString();
      return normalizeSolanaRpcWallet({ address: walletAddress, balanceResult: values[0], tokenAccountsResult: { value: [...legacy.value, ...token2022.value] }, observedAt, staleAfterMs: 60_000, nowMs: now() });
    },
    async token(chainId, assetAddress, signal) {
      if (chainId !== SOLANA_MAINNET) throw new Error('crypto_chain_unavailable');
      const [supply] = rpcResults(await solanaAdapter.execute([{ method: 'getTokenSupply', params: [assetAddress, { commitment: 'finalized' }] }], signal));
      const observedAt = new Date(now()).toISOString();
      return normalizeSolanaRpcToken({ assetAddress, supplyResult: supply, observedAt, staleAfterMs: 60_000, nowMs: now() });
    },
    async transactions(chainId, walletAddress, limit, signal) {
      if (chainId !== SOLANA_MAINNET || limit > 20) throw new Error('crypto_chain_unavailable');
      const [signatures] = rpcResults(await solanaAdapter.execute([{ method: 'getSignaturesForAddress', params: [walletAddress, { commitment: 'finalized', limit }] }], signal));
      return normalizeSolanaRpcTransactions({ address: walletAddress, signaturesResult: signatures, observedAt: new Date(now()).toISOString() });
    },
  });
  const gateway = new CryptoIntelligenceGateway([evmSource, solanaSource]);

  return Object.freeze({
    durable: true,
    supportedChains: Object.freeze([...Object.keys(CHAIN_CONFIG), SOLANA_MAINNET]),
    supportedKinds: Object.freeze(['wallet', 'token', 'transaction', 'protocol', 'report']),
    async ready() { return adapter.remainingCalls > 0; },
    async execute(request) {
      const nowMs = now();
      if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs >= Date.parse(request.deadlineAt)) throw new Error('crypto_operation_deadline_exceeded');
      let operation;
      if (request.input.kind === 'wallet') {
        const value = await gateway.wallet(request.input.chainId, request.input.address);
        operation = { kind: 'wallet', state: value.state, chainId: request.input.chainId, observedAt: value.wallet.observedAt, freshness: value.wallet.freshness.status, coverage: value.wallet.coverage, conflictCount: value.wallet.conflicts.length, evidenceRefs: value.wallet.evidence.map(({ evidenceRef }) => evidenceRef), data: value.wallet };
      } else if (request.input.kind === 'token') {
        const value = await gateway.token(request.input.chainId, request.input.assetAddress);
        operation = { kind: 'token', state: value.state, chainId: request.input.chainId, observedAt: value.token.observedAt, freshness: value.token.freshness.status, coverage: ['token_metadata'], conflictCount: value.token.conflicts.length, evidenceRefs: value.token.evidence.map(({ evidenceRef }) => evidenceRef), data: value.token };
      } else if (request.input.kind === 'transaction') {
        const value = await gateway.transactions(request.input.chainId, request.input.address, request.input.limit);
        const filtered = request.input.transactionId === undefined ? value.transactions : value.transactions.filter(({ transactionId }) => transactionId === request.input.transactionId);
        const observedAt = new Date(now()).toISOString();
        operation = { kind: 'transaction', state: value.state, chainId: request.input.chainId, observedAt, freshness: 'fresh', coverage: ['transactions'], conflictCount: value.conflicts.length, evidenceRefs: [...new Set(filtered.flatMap(({ evidence }) => evidence.map(({ evidenceRef }) => evidenceRef)))], data: Object.freeze({ transactions: Object.freeze(filtered), conflicts: value.conflicts }) };
      } else if (request.input.kind === 'protocol') {
        const value = await gateway.protocols(request.input.chainId, request.input.address);
        const observedAt = value.positions[0]?.observedAt ?? new Date(now()).toISOString();
        operation = { kind: 'protocol', state: value.state, chainId: request.input.chainId, observedAt, freshness: value.positions.some(({ freshness }) => freshness.status === 'stale') ? 'mixed' : 'fresh', coverage: ['protocol_positions'], conflictCount: 0, evidenceRefs: [...new Set(value.positions.flatMap(({ evidence }) => evidence.map(({ evidenceRef }) => evidenceRef)))], data: Object.freeze({ supportedProtocolIds: Object.freeze(['lido']), positions: value.positions, coverageNote: 'Exact supported receipt-token positions only; absence is not proof that the wallet has no other protocol positions.' }) };
      } else if (request.input.kind === 'report') {
        const report = await gateway.report(request.input.chainId, request.input.address, new Date(now()).toISOString());
        operation = { kind: 'report', state: report.coverage.missing.length === 0 ? 'available' : 'degraded', chainId: request.input.chainId, observedAt: report.generatedAt, freshness: 'fresh', coverage: report.coverage.covered, conflictCount: report.summary.unresolvedConflictCount, evidenceRefs: report.evidenceRefs, data: report };
      } else throw new TypeError('crypto_kind_unavailable');
      return Object.freeze({ result: result(request, Object.freeze(operation), new Date(now()).toISOString()), qualificationIds: Object.freeze([QUALIFICATION_ID]) });
    },
  });
}
