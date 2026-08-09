import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { BlockscoutDataAdapter } from '../../dist/adapters/blockchain/src/blockscout-data.js';

const credential = process.env.BLOCKSCOUT_API_KEY;
if (!credential) throw new Error('BLOCKSCOUT_API_KEY is required');

const origin = 'https://api.blockscout.com';
const maximumResponseBytes = 2_000_000;
const syntheticAddress = `0x${createHash('sha256').update('clervo-blockscout-qualification-2026-08-02').digest('hex').slice(0, 40)}`;
const chains = [
  { chain: 'ethereum', chainId: 1 },
  { chain: 'base', chainId: 8453 },
];

async function transport({ url, signal, maximumResponseBytes: requestedMaximum }) {
  if (url.origin !== origin || requestedMaximum !== maximumResponseBytes) throw new Error('blockchain_data_transport_policy_failed');
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    redirect: 'error',
    signal,
  });
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > requestedMaximum) throw new Error('blockchain_data_response_too_large');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > requestedMaximum) throw new Error('blockchain_data_response_too_large');
  let body = null;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('blockchain_data_response_invalid_json');
  }
  return { status: response.status, body };
}

const adapter = new BlockscoutDataAdapter({ apiKey: credential, allowedChainIds: chains.map(({ chainId }) => chainId), hardDailyCallCeiling: 6 }, transport);
const observations = [];
for (const { chain, chainId } of chains) {
  const operations = [
    ['wallet_overview', () => adapter.addressOverview(chainId, syntheticAddress), (value) => value.address === syntheticAddress && /^\d+$/u.test(value.nativeBalanceAtomic)],
    ['token_balances', () => adapter.tokenBalances(chainId, syntheticAddress), (value) => Array.isArray(value)],
    ['transaction_history', () => adapter.transactions(chainId, syntheticAddress), (value) => Array.isArray(value)],
  ];
  for (const [operation, execute, valid] of operations) {
    if (observations.length > 0) await new Promise((resolve) => setTimeout(resolve, 250));
    const started = performance.now();
    try {
      const value = await execute();
      observations.push({ chain, chainId, operation, status: 200, latencyMs: Math.round(performance.now() - started), normalizedShapeValid: valid(value), resultCount: Array.isArray(value) ? value.length : 1, passed: valid(value) });
    } catch (error) {
      const failureCode = error instanceof Error && /^blockchain_data_[a-z0-9_]+$/u.test(error.message) ? error.message : 'blockchain_data_qualification_failed';
      observations.push({ chain, chainId, operation, status: null, latencyMs: Math.round(performance.now() - started), normalizedShapeValid: false, resultCount: null, failureCode, passed: false });
    }
  }
}

const latencies = observations.map(({ latencyMs }) => latencyMs).sort((a, b) => a - b);
const passed = observations.every((observation) => observation.passed);
const report = {
  schemaVersion: 'clervo.blockscout-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.blockscout_pro',
  endpointOrigin: origin,
  ownerCashSpentUsd: 0,
  externalCalls: observations.length,
  transactionSubmissionCalls: 0,
  signedPayloads: 0,
  credentialSlotsUsed: 1,
  inputPolicy: {
    customerWalletDataUsed: false,
    deterministicSyntheticAddressUsed: true,
    syntheticAddressRecorded: false,
    responsePayloadValuesRecorded: false,
  },
  summary: {
    successfulChecks: observations.filter((observation) => observation.passed).length,
    chainsPassed: chains.filter(({ chainId }) => observations.filter((observation) => observation.chainId === chainId).every((observation) => observation.passed)).length,
    latencyMsP50: latencies[Math.floor((latencies.length - 1) * 0.5)],
    latencyMsP95: latencies[Math.ceil((latencies.length - 1) * 0.95)],
    technicalStatus: passed ? 'passed' : 'failed',
    productionStatus: passed ? 'qualified_value_added_routes' : 'blocked_technical_qualification_failed',
  },
  observations,
  allowance: {
    advertisedDailyCredits: 100_000,
    advertisedRequestsPerSecond: 5,
    hardDailyCallCeiling: 100_000,
    automaticPaidUpgradeAllowedByClervo: false,
  },
  terms: {
    reviewedAt: new Date().toISOString(),
    termsUrl: 'https://eaas.blockscout.com/terms-and-conditions',
    documentationUrl: 'https://docs.blockscout.com/devs/pro-api',
    intendedProductUseAllowed: true,
    valueAddedApplicationRequired: true,
    rawApiOrCredentialResaleAllowed: false,
    selectedNormalizedProducts: ['crypto.wallet.balances', 'crypto.wallet.tokens', 'crypto.wallet.transactions', 'crypto.wallet.report'],
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
