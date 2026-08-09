import { CONTRACT_VERSION, hashJson } from '../../../dist/packages/contracts/src/index.js';
import { BlockscoutDataAdapter } from '../../../dist/adapters/blockchain/src/blockscout-data.js';
import { normalizeBlockscoutActivity, normalizeBlockscoutToken, normalizeBlockscoutWallet } from '../../../dist/adapters/blockchain/src/intelligence-normalizers.js';
import { CryptoIntelligenceGateway } from '../../../dist/services/crypto/src/gateway.js';
import { CRYPTO_RESULT_SCHEMA_VERSION } from './x402-paid-crypto.mjs';

const CHAIN_CONFIG = Object.freeze({
  'eip155:1': Object.freeze({ numericId: 1, name: 'Ethereum', nativeSymbol: 'ETH', nativeDecimals: 18 }),
  'eip155:8453': Object.freeze({ numericId: 8453, name: 'Base', nativeSymbol: 'ETH', nativeDecimals: 18 }),
});
const SUPPORTED_CHAINS = Object.freeze(Object.keys(CHAIN_CONFIG));
export const CRYPTO_COMMERCIAL_QUALIFICATION = Object.freeze({
  qualificationId: 'qual_BlockscoutValueAdded20260809',
  evaluatedAt: '2026-08-09T17:30:00.000Z',
  expiresAt: '2026-08-16T17:30:00.000Z',
  source: 'Blockscout PRO API',
  permission: 'value_added_application',
  rawApiResaleAllowed: false,
});
const SOURCE_REF = 'crypto_source_3c34c5827ba3f772';

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

function evidence(values) {
  return Object.freeze([...new Map(values.flat().map((item) => [item.evidenceRef, item])).values()]);
}

function freshness(values) {
  if (values.length === 0) return Object.freeze({ status: 'unknown', observedAt: null });
  return Object.freeze({
    status: values.some(({ freshness: item }) => item.status === 'stale') ? 'stale' : 'fresh',
    observedAt: [...values.map(({ observedAt }) => observedAt)].sort().at(-1),
  });
}

function sourceProvenance() {
  return Object.freeze({
    source: CRYPTO_COMMERCIAL_QUALIFICATION.source,
    sourceClass: 'indexed_public_blockchain_data',
    qualificationId: CRYPTO_COMMERCIAL_QUALIFICATION.qualificationId,
    permission: CRYPTO_COMMERCIAL_QUALIFICATION.permission,
    transformation: 'provider-neutral normalization and deterministic Clervo derivation',
    rawApiResale: false,
    thirdPartyLabelsUsed: false,
  });
}

function operationEnvelope(kind, requestedChains, chainResults, chainFailures, derivedAt, data) {
  const allEvidence = evidence(chainResults.map(({ evidence: items = [] }) => items));
  return Object.freeze({
    kind,
    state: chainFailures.length === 0 && chainResults.every(({ state = 'available' }) => state === 'available') ? 'available' : 'degraded',
    requestedChains,
    servedChains: Object.freeze(chainResults.map(({ chainId }) => chainId)),
    observedAt: chainResults.map(({ observedAt }) => observedAt).filter(Boolean).sort().at(-1) ?? null,
    derivedAt,
    freshness: freshness(chainResults.filter(({ freshness: item }) => item && typeof item === 'object')),
    coverage: Object.freeze({
      missingChains: Object.freeze(chainFailures.map(({ chainId }) => chainId)),
      chainFailures: Object.freeze(chainFailures),
    }),
    evidence: allEvidence,
    evidenceRefs: Object.freeze(allEvidence.map(({ evidenceRef }) => evidenceRef)),
    provenance: sourceProvenance(),
    data,
  });
}

function crossChainReport(address, requestedChains, reports, failures, derivedAt) {
  const activeChains = reports.filter(({ report }) => report.activity.observedTransactionCount > 0).map(({ chainId }) => chainId);
  const signals = reports.flatMap(({ report }) => report.signals);
  if (activeChains.length > 1) signals.push(Object.freeze({
    signalId: 'multi_chain_activity',
    reason: `Activity was observed on ${activeChains.length} requested chains.`,
    inputs: Object.freeze({ requestedChains, lookbackDays: reports[0]?.report.lookback.days ?? null }),
    observations: Object.freeze(activeChains.map((chainId) => `activeChain=${chainId}`)),
    coverage: Object.freeze(reports.flatMap(({ report }) => report.coverage.covered)),
    quality: Object.freeze({ method: 'deterministic', confidence: 'bounded_observation' }),
  }));
  const chainResults = reports.map(({ chainId, report }) => ({ chainId, state: report.state, observedAt: report.observedAt, freshness: report.freshness, evidence: report.evidence }));
  return operationEnvelope('report', requestedChains, chainResults, failures, derivedAt, Object.freeze({
    schemaVersion: 'clervo.crypto-wallet-multichain-report.v1',
    identity: Object.freeze({ address, requestedChains }),
    portfolio: Object.freeze({
      chains: Object.freeze(reports.map(({ chainId, report }) => Object.freeze({ chainId, nativeBalance: report.portfolio.nativeBalance, tokenHoldings: report.portfolio.tokenHoldings, tokenHoldingCount: report.portfolio.tokenHoldingCount }))),
      activeHoldingChains: Object.freeze(reports.filter(({ report }) => report.portfolio.nativeBalance?.amountAtomic !== '0' || report.portfolio.tokenHoldingCount > 0).map(({ chainId }) => chainId)),
      valuation: Object.freeze({ status: 'unavailable', reason: 'No commercially qualified price source is used.' }),
      concentration: Object.freeze({ status: 'unavailable', reason: 'Cross-asset concentration is not derived without a common valuation basis.' }),
    }),
    activity: Object.freeze({
      activeChains: Object.freeze(activeChains),
      observedTransactionCount: reports.reduce((sum, { report }) => sum + report.activity.observedTransactionCount, 0),
      confirmedTransactionCount: reports.reduce((sum, { report }) => sum + report.activity.confirmedTransactionCount, 0),
      byChain: Object.freeze(reports.map(({ chainId, report }) => Object.freeze({ chainId, ...report.activity }))),
    }),
    flows: Object.freeze({ byChain: Object.freeze(reports.map(({ chainId, report }) => Object.freeze({ chainId, ...report.flows }))), comparisonAcrossAssetsAvailable: false }),
    counterparties: Object.freeze({ byChain: Object.freeze(reports.map(({ chainId, report }) => Object.freeze({ chainId, ...report.counterparties }))), labelsInferred: false }),
    signals: Object.freeze(signals),
    coverage: Object.freeze({
      byChain: Object.freeze(reports.map(({ chainId, report }) => Object.freeze({ chainId, ...report.coverage }))),
      missingChains: Object.freeze(failures.map(({ chainId }) => chainId)),
    }),
    reports: Object.freeze(reports.map(({ chainId, report }) => Object.freeze({ chainId, report }))),
  }));
}

export function createCryptoProductionRuntime({ credential, fetcher = globalThis.fetch, now = () => Date.now(), hardDailyCallCeiling = 100_000 } = {}) {
  if (typeof credential !== 'string' || credential.trim().length < 8 || typeof fetcher !== 'function' || typeof now !== 'function') throw new TypeError('crypto_production_configuration_invalid');
  const adapter = new BlockscoutDataAdapter({ apiKey: credential, allowedChainIds: Object.values(CHAIN_CONFIG).map(({ numericId }) => numericId), hardDailyCallCeiling, timeoutMs: 15_000 }, boundedTransport(fetcher));
  const evmSource = Object.freeze({
    sourceRef: SOURCE_REF,
    chains: SUPPORTED_CHAINS,
    capabilities: Object.freeze(['wallet', 'token', 'transaction']),
    async wallet(chainId, walletAddress, signal) {
      const config = CHAIN_CONFIG[chainId];
      if (!config) throw new Error('crypto_chain_unavailable');
      const overview = await adapter.addressOverview(config.numericId, walletAddress, signal);
      let tokens = []; let tokenCoverage = false;
      try { tokens = await adapter.tokenBalances(config.numericId, walletAddress, signal); tokenCoverage = true; } catch { /* Native balance remains useful and missing token coverage stays explicit. */ }
      const observedAt = new Date(now()).toISOString();
      return normalizeBlockscoutWallet({ chainId: config.numericId, overview, tokens, nativeSymbol: config.nativeSymbol, nativeDecimals: config.nativeDecimals, observedAt, staleAfterMs: 120_000, nowMs: now(), coverage: tokenCoverage ? ['native_balance', 'token_balances'] : ['native_balance'] });
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
      const [transactions, tokenTransfers] = await Promise.allSettled([
        adapter.transactions(config.numericId, walletAddress, limit, signal),
        adapter.tokenTransfers(config.numericId, walletAddress, limit, signal),
      ]);
      if (transactions.status === 'rejected' && tokenTransfers.status === 'rejected') throw new Error('crypto_transactions_unavailable');
      const rows = transactions.status === 'fulfilled' ? transactions.value : Object.freeze([]);
      const transfers = tokenTransfers.status === 'fulfilled' ? tokenTransfers.value : Object.freeze([]);
      const observedAt = new Date(now()).toISOString();
      return Object.freeze({
        transactions: normalizeBlockscoutActivity({ chainId: config.numericId, transactions: rows, tokenTransfers: transfers, observedAt }),
        coverage: Object.freeze([...(transactions.status === 'fulfilled' ? ['transactions'] : []), ...(tokenTransfers.status === 'fulfilled' ? ['token_transfers'] : [])]),
        missing: Object.freeze([...(transactions.status === 'rejected' ? ['transactions'] : []), ...(tokenTransfers.status === 'rejected' ? ['token_transfers'] : [])]),
        truncated: rows.length >= limit || transfers.length >= limit,
      });
    },
  });
  const gateway = new CryptoIntelligenceGateway([evmSource]);

  async function collect(chains, execute, signal) {
    const settled = await Promise.allSettled(chains.map((chainId) => execute(chainId)));
    if (signal.aborted) throw new Error('crypto_operation_deadline_exceeded');
    const values = []; const failures = [];
    settled.forEach((outcome, index) => {
      const chainId = chains[index];
      if (outcome.status === 'fulfilled') values.push(outcome.value);
      else failures.push(Object.freeze({ chainId, code: 'source_unavailable' }));
    });
    if (values.length === 0) throw new Error('crypto_sources_unavailable');
    return Object.freeze({ values: Object.freeze(values), failures: Object.freeze(failures) });
  }

  return Object.freeze({
    durable: true,
    supportedChains: SUPPORTED_CHAINS,
    supportedKinds: Object.freeze(['balances', 'tokens', 'transactions', 'report']),
    commercialQualification: CRYPTO_COMMERCIAL_QUALIFICATION,
    async ready() { return adapter.remainingCalls > 0 && now() < Date.parse(CRYPTO_COMMERCIAL_QUALIFICATION.expiresAt); },
    async execute(request) {
      const nowMs = now();
      const deadlineMs = Date.parse(request.deadlineAt);
      if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !Number.isFinite(deadlineMs) || nowMs >= deadlineMs) throw new Error('crypto_operation_deadline_exceeded');
      if (nowMs >= Date.parse(CRYPTO_COMMERCIAL_QUALIFICATION.expiresAt)) throw new Error('crypto_commercial_qualification_expired');
      const signal = AbortSignal.timeout(Math.max(1, deadlineMs - nowMs));
      const derivedAt = new Date(now()).toISOString();
      const { kind, chains, address, lookbackDays = 30, limit = 50 } = request.input;
      let operation;
      if (kind === 'balances' || kind === 'tokens') {
        const collected = await collect(chains, async (chainId) => {
          const value = await gateway.wallet(chainId, address, signal);
          return Object.freeze({ chainId, state: value.state, observedAt: value.wallet.observedAt, freshness: value.wallet.freshness, evidence: value.wallet.evidence, wallet: value.wallet });
        }, signal);
        operation = operationEnvelope(kind, chains, collected.values, collected.failures, derivedAt, Object.freeze({
          address,
          chains: Object.freeze(collected.values.map(({ chainId, wallet }) => kind === 'balances'
            ? Object.freeze({ chainId, nativeBalance: wallet.nativeBalance, tokenHoldingCount: wallet.assets.length, coverage: wallet.coverage })
            : Object.freeze({ chainId, tokenHoldings: wallet.assets, tokenHoldingCount: wallet.assets.length, coverage: wallet.coverage }))),
        }));
      } else if (kind === 'transactions') {
        const lookbackStart = nowMs - lookbackDays * 86_400_000;
        const collected = await collect(chains, async (chainId) => {
          const value = await gateway.transactions(chainId, address, limit, signal);
          const transactions = Object.freeze(value.transactions.filter(({ timestamp }) => timestamp === null || Date.parse(timestamp) >= lookbackStart));
          const activityEvidence = evidence(transactions.map(({ evidence: items }) => items));
          return Object.freeze({ chainId, state: value.state, observedAt: derivedAt, freshness: { status: 'fresh', ageMs: 0, staleAfterMs: 120_000 }, evidence: activityEvidence, transactions, coverage: value.coverage, missing: value.missing, truncated: value.truncated });
        }, signal);
        operation = operationEnvelope(kind, chains, collected.values, collected.failures, derivedAt, Object.freeze({ address, lookback: Object.freeze({ days: lookbackDays, startsAt: new Date(lookbackStart).toISOString(), endsAt: derivedAt }), chains: Object.freeze(collected.values.map(({ evidence: ignored, freshness: ignoredFreshness, ...value }) => value)) }));
      } else if (kind === 'report') {
        const collected = await collect(chains, async (chainId) => Object.freeze({ chainId, report: await gateway.report(chainId, address, derivedAt, { lookbackDays, limit }, signal) }), signal);
        operation = crossChainReport(address, chains, collected.values, collected.failures, derivedAt);
      } else throw new TypeError('crypto_kind_unavailable');
      if (signal.aborted || now() >= deadlineMs) throw new Error('crypto_operation_deadline_exceeded');
      return Object.freeze({ result: result(request, operation, new Date(now()).toISOString()), qualificationIds: Object.freeze([CRYPTO_COMMERCIAL_QUALIFICATION.qualificationId]) });
    },
  });
}
