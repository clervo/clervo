import { performance } from 'node:perf_hooks';

const credential = process.env.ZERION_API_KEY;
if (!credential) throw new Error('ZERION_API_KEY is required');

const origin = 'https://api.zerion.io';
const syntheticAddress = '0x000000000000000000000000000000000000dead';
const documentationExampleAddress = '0x42b9df65b219b3dd36ff330a4dd8f327a6ada990';
const checks = [
  { checkId: 'chains', path: '/v1/chains/', shape: (payload) => Array.isArray(payload.data) && payload.data.length > 0, count: (payload) => payload.data?.length ?? 0 },
  { checkId: 'token_search', path: '/v1/fungibles/?filter[search_query]=USDC&page[size]=1', shape: (payload) => Array.isArray(payload.data), count: (payload) => payload.data?.length ?? 0 },
  { checkId: 'protocol_directory', path: '/v1/dapps/?page[size]=1', shape: (payload) => Array.isArray(payload.data), count: (payload) => payload.data?.length ?? 0 },
  { checkId: 'synthetic_wallet_portfolio', path: `/v1/wallets/${syntheticAddress}/portfolio`, shape: (payload) => payload.data != null && typeof payload.data === 'object' && !Array.isArray(payload.data), count: (payload) => payload.data ? 1 : 0 },
  { checkId: 'documentation_wallet_transactions', path: `/v1/wallets/${documentationExampleAddress}/transactions/?page[size]=1`, shape: (payload) => Array.isArray(payload.data), count: (payload) => payload.data?.length ?? 0 },
];

const authorization = `Basic ${Buffer.from(`${credential}:`).toString('base64')}`;
const observations = [];
for (const check of checks) {
  if (observations.length > 0) await new Promise((resolve) => setTimeout(resolve, 1_100));
  const started = performance.now();
  const response = await fetch(new URL(check.path, origin), {
    headers: { accept: 'application/json', authorization },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  const latencyMs = Math.round(performance.now() - started);
  const payload = await response.json().catch(() => ({}));
  observations.push({
    checkId: check.checkId,
    status: response.status,
    latencyMs,
    jsonApiShapeValid: check.shape(payload),
    resultCount: check.count(payload),
    rateLimitHeaderPresent: [...response.headers.keys()].some((name) => name.includes('ratelimit')),
    retryAfterPresent: response.headers.has('retry-after'),
    passed: response.status === 200 && check.shape(payload),
  });
}

const latency = observations.map(({ latencyMs }) => latencyMs).sort((a, b) => a - b);
const report = {
  schemaVersion: 'clervo.zerion-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.zerion',
  endpointOrigin: origin,
  ownerCashSpentUsd: 0,
  externalCalls: observations.length,
  transactionSubmissionCalls: 0,
  signedPayloads: 0,
  credentialSlotsUsed: 1,
  configuredCredentialSlots: 1,
  inputPolicy: { customerWalletDataUsed: false, syntheticPublicAddressUsed: true, providerDocumentationExampleAddressUsed: true, responsePayloadValuesRecorded: false },
  summary: {
    successfulChecks: observations.filter(({ passed }) => passed).length,
    latencyMsP50: latency[Math.floor((latency.length - 1) * 0.5)],
    latencyMsP95: latency[Math.ceil((latency.length - 1) * 0.95)],
    technicalStatus: observations.every(({ passed }) => passed) ? 'passed' : 'failed',
    productionStatus: 'blocked_free_plan_local_development_only',
  },
  observations,
  allowance: {
    advertisedPlan: 'developer',
    ownerPlanStatus: 'inferred_from_zero_cash_legacy_key_not_account_verified',
    dailyRequests: 2_000,
    requestsPerSecond: 3,
    automaticPaidUpgradeAllowedByClervo: false,
  },
  terms: {
    reviewedAt: new Date().toISOString(),
    apiLicenseUrl: 'https://www.zerion.io/api-license-agreement',
    pricingUrl: 'https://zerion.io/api/',
    apiLicenseUpdatedAt: '2026-06-26',
    customerApplicationsRecognized: true,
    commercialUseOnPaidPlans: true,
    freePlanProductionUseAllowed: false,
    dataResaleAllowed: false,
    serviceBureauUseAllowed: false,
    thirdPartyBenefitAllowed: false,
    customerMonetizationRequiresCompatiblePaidPlan: true,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
