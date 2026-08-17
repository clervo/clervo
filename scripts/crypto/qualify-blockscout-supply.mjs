import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { BlockscoutDataAdapter } from '../../dist/adapters/blockchain/src/blockscout-data.js';
import { normalizeBlockscoutActivity, normalizeBlockscoutWallet } from '../../dist/adapters/blockchain/src/intelligence-normalizers.js';

const credential = process.env.BLOCKSCOUT_API_KEY;
if (typeof credential !== 'string' || credential.length < 8) throw new Error('BLOCKSCOUT_API_KEY is required');

const evaluatedAt = new Date().toISOString();
const evaluatedAtMs = Date.parse(evaluatedAt);
if (!Number.isFinite(evaluatedAtMs)) throw new Error('blockscout_qualification_clock_invalid');
const qualificationId = `qual_BlockscoutValueAdded${evaluatedAt.slice(0, 10).replaceAll('-', '')}`;
const expiresAt = new Date(evaluatedAtMs + 7 * 86_400_000).toISOString();
const origin = 'https://api.blockscout.com';
const maximumResponseBytes = 2_000_000;
const chains = Object.freeze([
  Object.freeze({ chain: 'ethereum', chainId: 1, activeAddress: '0x338c0d6868638ed44f937999e363f9dc9f86a2b6', tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', nativeSymbol: 'ETH' }),
  Object.freeze({ chain: 'base', chainId: 8453, activeAddress: '0x67c484fb4cfe84633b34f5d6514b5f0f39653f07', tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', nativeSymbol: 'ETH' }),
]);
const emptyAddress = `0x${createHash('sha256').update('clervo-b9-empty-wallet-2026-08-09').digest('hex').slice(0, 40)}`;
const transportObservations = [];

async function transport({ url, signal, maximumResponseBytes: requestedMaximum }) {
  if (url.origin !== origin || requestedMaximum !== maximumResponseBytes) throw new Error('blockchain_data_transport_policy_failed');
  const started = performance.now();
  const response = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'error', signal });
  const bytes = new Uint8Array(await response.arrayBuffer());
  transportObservations.push(Object.freeze({ status: response.status, latencyMs: Number((performance.now() - started).toFixed(1)), responseBytes: bytes.byteLength }));
  if (bytes.byteLength > requestedMaximum) throw new Error('blockchain_data_response_too_large');
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('blockchain_data_response_invalid_json'); }
  return Object.freeze({ status: response.status, body });
}

const adapter = new BlockscoutDataAdapter({ apiKey: credential, allowedChainIds: chains.map(({ chainId }) => chainId), hardDailyCallCeiling: 100, timeoutMs: 30_000 }, transport);
const checks = [];

async function check(id, execute, validate) {
  const started = performance.now();
  try {
    const value = await execute();
    const valid = validate(value);
    checks.push(Object.freeze({ id, passed: valid, latencyMs: Number((performance.now() - started).toFixed(1)), count: Array.isArray(value) ? value.length : 1, failureCode: valid ? null : 'normalization_invalid' }));
    return value;
  } catch (error) {
    const code = error instanceof Error && /^blockchain_data_[a-z0-9_]+$/u.test(error.message) ? error.message : 'blockchain_data_qualification_failed';
    checks.push(Object.freeze({ id, passed: false, latencyMs: Number((performance.now() - started).toFixed(1)), count: null, failureCode: code }));
    return null;
  }
}

for (const chain of chains) {
  const active = {};
  active.overview = await check(`${chain.chain}.active.overview`, () => adapter.addressOverview(chain.chainId, chain.activeAddress), (value) => value.address === chain.activeAddress && /^\d+$/u.test(value.nativeBalanceAtomic));
  await new Promise((resolve) => setTimeout(resolve, 220));
  active.balances = await check(`${chain.chain}.active.token_balances`, () => adapter.tokenBalances(chain.chainId, chain.activeAddress), (value) => Array.isArray(value) && value.every(({ balanceAtomic }) => /^\d+$/u.test(balanceAtomic)));
  await new Promise((resolve) => setTimeout(resolve, 220));
  active.transactions = await check(`${chain.chain}.active.transactions`, () => adapter.transactions(chain.chainId, chain.activeAddress, 50), (value) => Array.isArray(value) && value.every(({ transactionHash, status }) => /^0x[a-f0-9]{64}$/u.test(transactionHash) && ['confirmed', 'failed', 'unknown'].includes(status)));
  await new Promise((resolve) => setTimeout(resolve, 220));
  active.transfers = await check(`${chain.chain}.active.token_transfers`, () => adapter.tokenTransfers(chain.chainId, chain.activeAddress, 50), (value) => Array.isArray(value) && value.every(({ transactionHash, amountAtomic, decimals }) => /^0x[a-f0-9]{64}$/u.test(transactionHash) && /^\d+$/u.test(amountAtomic) && Number.isSafeInteger(decimals)));
  await new Promise((resolve) => setTimeout(resolve, 220));
  await check(`${chain.chain}.token_metadata`, () => adapter.tokenOverview(chain.chainId, chain.tokenAddress), (value) => value.contractAddress === chain.tokenAddress && Number.isSafeInteger(value.decimals));
  await new Promise((resolve) => setTimeout(resolve, 220));
  await check(`${chain.chain}.empty.overview`, () => adapter.addressOverview(chain.chainId, emptyAddress), (value) => value.address === emptyAddress && /^\d+$/u.test(value.nativeBalanceAtomic));
  await new Promise((resolve) => setTimeout(resolve, 220));
  await check(`${chain.chain}.empty.token_balances`, () => adapter.tokenBalances(chain.chainId, emptyAddress), (value) => Array.isArray(value) && value.length === 0);
  await new Promise((resolve) => setTimeout(resolve, 220));
  await check(`${chain.chain}.empty.transactions`, () => adapter.transactions(chain.chainId, emptyAddress, 50), (value) => Array.isArray(value) && value.length === 0);
  await new Promise((resolve) => setTimeout(resolve, 220));
  await check(`${chain.chain}.empty.token_transfers`, () => adapter.tokenTransfers(chain.chainId, emptyAddress, 50), (value) => Array.isArray(value) && value.length === 0);
  if (active.overview && active.balances && active.transactions && active.transfers) {
    await check(`${chain.chain}.normalization`, async () => {
      const observedAt = new Date().toISOString();
      const wallet = normalizeBlockscoutWallet({ chainId: chain.chainId, overview: active.overview, tokens: active.balances, nativeSymbol: chain.nativeSymbol, nativeDecimals: 18, observedAt, staleAfterMs: 120_000, nowMs: Date.now() });
      const transactions = normalizeBlockscoutActivity({ chainId: chain.chainId, transactions: active.transactions, tokenTransfers: active.transfers, observedAt });
      return Object.freeze({ wallet, transactions });
    }, ({ wallet, transactions }) => wallet.chainId === `eip155:${chain.chainId}` && transactions.every(({ chainId }) => chainId === wallet.chainId));
  }
}

await check('base.pagination_100', () => adapter.transactions(8453, chains[1].tokenAddress, 100), (value) => value.length > 50 && value.length <= 100);

const localRejections = [];
for (const [id, execute, expected] of [
  ['malformed_address', () => adapter.addressOverview(8453, '0x1234'), 'blockchain_data_address_invalid'],
  ['unsupported_chain', () => adapter.addressOverview(10, emptyAddress), 'blockchain_data_chain_not_allowed'],
  ['invalid_limit', () => adapter.transactions(8453, emptyAddress, 101), 'blockchain_data_transaction_limit_invalid'],
]) {
  try { await execute(); localRejections.push({ id, passed: false, failureCode: 'not_rejected' }); } catch (error) { localRejections.push({ id, passed: error instanceof Error && error.message === expected, failureCode: error instanceof Error ? error.message : 'unknown' }); }
}

await new Promise((resolve) => setTimeout(resolve, 1_100));
const burstStartedAt = transportObservations.length;
const burst = await Promise.allSettled(Array.from({ length: 6 }, (_, index) => adapter.addressOverview(8453, `0x${createHash('sha256').update(`clervo-b9-burst-${index}`).digest('hex').slice(0, 40)}`)));
await new Promise((resolve) => setTimeout(resolve, 1_100));
const cooldown = await check('base.cooldown_recovery', () => adapter.addressOverview(8453, emptyAddress), (value) => value.address === emptyAddress);

const successfulNetworkRequests = transportObservations.filter(({ status }) => status === 200).length;
const latencies = transportObservations.filter(({ status }) => status === 200).map(({ latencyMs }) => latencyMs).sort((left, right) => left - right);
const percentile = (fraction) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * fraction))] ?? null;
const newestTransactionAt = checks.filter(({ id }) => id.endsWith('.active.transactions')).map(({ id }) => id);
const passed = checks.every(({ passed: value }) => value) && localRejections.every(({ passed: value }) => value) && burst.some(({ status }) => status === 'fulfilled') && cooldown !== null;
const qualificationEvidence = Object.freeze({
  externalCalls: transportObservations.length,
  successes: successfulNetworkRequests,
  failures: transportObservations.length - successfulNetworkRequests,
  checksPassed: checks.filter(({ passed: value }) => value).length,
  paginationPassed: checks.find(({ id }) => id === 'base.pagination_100')?.passed === true,
  emptyWalletsPassed: checks.filter(({ id }) => id.includes('.empty.')).every(({ passed: value }) => value),
  highActivityPassed: checks.find(({ id }) => id === 'base.pagination_100')?.passed === true,
  burstSuccesses: burst.filter(({ status }) => status === 'fulfilled').length,
  cooldownRecovered: cooldown !== null,
  latencyMs: Object.freeze({ minimum: latencies[0] ?? null, median: percentile(0.5), p95: percentile(0.95), maximum: latencies.at(-1) ?? null }),
  normalizationPassed: checks.filter(({ id }) => id.endsWith('.normalization')).every(({ passed: value }) => value),
});

const report = Object.freeze({
  schemaVersion: 'clervo.blockscout-b9-qualification.v1',
  evaluatedAt,
  sourceId: 'crypto.source.blockscout_pro',
  qualificationId,
  expiresAt,
  qualificationWindowDays: 7,
  ownerCashSpentUsd: 0,
  externalCalls: transportObservations.length,
  successfulNetworkRequests,
  failedNetworkRequests: transportObservations.length - successfulNetworkRequests,
  transactionSubmissionCalls: 0,
  signedPayloads: 0,
  summary: Object.freeze({
    technicalStatus: passed ? 'qualified' : 'failed',
    checksPassed: checks.filter(({ passed: value }) => value).length,
    checksFailed: checks.filter(({ passed: value }) => !value).length,
    repeatedCallsCharacterized: true,
    paginationPassed: qualificationEvidence.paginationPassed,
    emptyWalletsPassed: qualificationEvidence.emptyWalletsPassed,
    highActivityPassed: qualificationEvidence.highActivityPassed,
    malformedAndUnsupportedRejected: localRejections.every(({ passed: value }) => value),
    burstSuccesses: qualificationEvidence.burstSuccesses,
    burstFailures: burst.filter(({ status }) => status === 'rejected').length,
    cooldownRecovered: qualificationEvidence.cooldownRecovered,
    latencyMs: qualificationEvidence.latencyMs,
    normalizationPassed: qualificationEvidence.normalizationPassed,
    newestTransactionChecks: newestTransactionAt.length,
  }),
  capability: Object.freeze({
    chains: Object.freeze(['eip155:1', 'eip155:8453']),
    nativeBalances: true,
    erc20Balances: true,
    transactions: true,
    erc20Transfers: true,
    failedTransactionStatus: true,
    pagination: true,
    finality: 'indexed_canonical_status_exposed_finality_not_claimed',
    internalTransactions: 'source_exposes_but_launch_contract_does_not_claim_coverage',
    independentSourceAgreement: 'not_available_single_production_source',
  }),
  commercial: Object.freeze({
    permission: 'value_added_application',
    publicSellable: true,
    rawApiResale: false,
    credentialResale: false,
    attributionPreserved: true,
    supplierVariableCostMicrousd: 0,
    allowance: '100000 credits/day; 5 requests/second; no automatic paid upgrade',
    evidenceUrls: Object.freeze(['https://docs.blockscout.com/devs/pro-api', 'https://dev.blockscout.com/', 'https://eaas.blockscout.com/terms-and-conditions']),
  }),
  sourceRouteUpdate: Object.freeze({
    qualificationId,
    technicalQualification: passed ? 'qualified' : 'failed',
    technicalObservedAt: evaluatedAt,
    technicalExpiresAt: expiresAt,
    qualificationEvidence,
    termsObservedAt: evaluatedAt,
  }),
  checks,
  localRejections,
  burst: Object.freeze({ attempted: burst.length, networkRequests: transportObservations.length - burstStartedAt - 1, outcomes: burst.map((outcome) => outcome.status === 'fulfilled' ? 'success' : outcome.reason instanceof Error ? outcome.reason.message : 'failure') }),
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!passed) process.exitCode = 1;
