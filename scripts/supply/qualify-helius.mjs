import { performance } from 'node:perf_hooks';

const credential = process.env.HELIUS_API_KEY;
const configuredEndpoint = process.env.HELIUS_RPC;
if (!credential || !configuredEndpoint) throw new Error('HELIUS_API_KEY and HELIUS_RPC are required');

const endpoint = new URL(configuredEndpoint);
if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'mainnet.helius-rpc.com') throw new Error('unexpected_helius_endpoint');
endpoint.searchParams.set('api-key', credential);

const checks = [
  { checkId: 'health', method: 'getHealth', params: [], valid: (value) => value === 'ok' },
  { checkId: 'version', method: 'getVersion', params: [], valid: (value) => typeof value?.['solana-core'] === 'string' },
  { checkId: 'slot', method: 'getSlot', params: [{ commitment: 'finalized' }], valid: (value) => Number.isSafeInteger(value) && value > 0 },
  { checkId: 'safe_failure', method: 'clervoQualificationUnknownMethod', params: [], valid: (_value, error) => Number.isInteger(error?.code) && typeof error?.message === 'string' },
];

const observations = [];
for (let index = 0; index < checks.length; index += 1) {
  const check = checks[index];
  const started = performance.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: index + 1, method: check.method, params: check.params }),
    signal: AbortSignal.timeout(10_000),
  });
  const latencyMs = Math.round(performance.now() - started);
  const payload = await response.json().catch(() => ({}));
  observations.push({
    checkId: check.checkId,
    status: response.status,
    latencyMs,
    jsonRpcEnvelopeValid: payload.jsonrpc === '2.0' && payload.id === index + 1,
    passed: response.status === 200 && check.valid(payload.result, payload.error),
    safeErrorCode: check.checkId === 'safe_failure' && Number.isInteger(payload.error?.code) ? payload.error.code : null,
  });
}

const latency = observations.map(({ latencyMs }) => latencyMs).sort((a, b) => a - b);
const report = {
  schemaVersion: 'clervo.helius-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.helius_rpc',
  endpointOrigin: `${endpoint.protocol}//${endpoint.hostname}`,
  network: 'solana-mainnet',
  ownerCashSpentUsd: 0,
  externalCalls: observations.length,
  transactionCalls: 0,
  signedPayloads: 0,
  credentialSlotsUsed: 1,
  configuredCredentialSlots: 1,
  summary: {
    successfulChecks: observations.filter(({ passed }) => passed).length,
    latencyMsP50: latency[Math.floor((latency.length - 1) * 0.5)],
    latencyMsP95: latency[Math.ceil((latency.length - 1) * 0.95)],
    technicalStatus: observations.every(({ passed }) => passed) ? 'passed' : 'failed',
    commercialStatus: 'blocked',
  },
  observations,
  allowance: {
    advertisedPlan: 'free',
    monthlyCredits: 1_000_000,
    standardRpcCreditsPerCall: 1,
    resetsMonthly: true,
    automaticPaidTopUpAllowedByClervo: false,
    currentOwnedRemainingCredits: null,
    currentOwnedRemainingStatus: 'project_id_not_available_in_redacted_environment',
  },
  terms: {
    reviewedAt: new Date().toISOString(),
    termsUrl: 'https://www.helius.dev/terms',
    termsUpdatedAt: '2026-04-24',
    oneAccountPerBusiness: true,
    resaleAllowed: false,
    thirdPartyBenefitAllowed: false,
    customerHostedRpcAllowed: false,
    writtenPermissionRequiredForClervoUse: true,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
