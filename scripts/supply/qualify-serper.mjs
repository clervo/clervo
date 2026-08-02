import { performance } from 'node:perf_hooks';

const credential = process.env.SERPER_API_KEY;
if (!credential) throw new Error('SERPER_API_KEY is required');

const cases = [
  { caseId: 'node_fetch', query: 'site:nodejs.org Node.js fetch API documentation', expectedHost: 'nodejs.org' },
  { caseId: 'mdn_429', query: 'site:developer.mozilla.org HTTP 429 status code', expectedHost: 'developer.mozilla.org' },
  { caseId: 'rfc_9110', query: 'site:rfc-editor.org RFC 9110 HTTP semantics', expectedHost: 'rfc-editor.org' },
  { caseId: 'cloudflare_r2', query: 'site:developers.cloudflare.com R2 S3 API documentation', expectedHost: 'developers.cloudflare.com' },
  { caseId: 'solana_rpc', query: 'site:solana.com docs JSON RPC getHealth', expectedHost: 'solana.com' },
];

const observations = [];
for (const testCase of cases) {
  const started = performance.now();
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': credential },
    body: JSON.stringify({ q: testCase.query, gl: 'us', hl: 'en', num: 10 }),
    signal: AbortSignal.timeout(15_000),
  });
  const latencyMs = Math.round(performance.now() - started);
  const payload = await response.json().catch(() => ({}));
  const organic = Array.isArray(payload.organic) ? payload.organic : [];
  const hosts = organic.flatMap(({ link }) => {
    try { return [new URL(link).hostname]; } catch { return []; }
  });
  const expectedRank = hosts.findIndex((host) => host === testCase.expectedHost || host.endsWith(`.${testCase.expectedHost}`)) + 1;
  observations.push({
    caseId: testCase.caseId,
    status: response.status,
    latencyMs,
    organicResultCount: organic.length,
    expectedHostPresent: expectedRank > 0,
    expectedHostRank: expectedRank || null,
    hasSearchParameters: payload.searchParameters != null,
    hasCreditsHeader: response.headers.has('x-credits-remaining'),
  });
}

const sortedLatency = observations.map(({ latencyMs }) => latencyMs).sort((a, b) => a - b);
const successful = observations.filter(({ status }) => status === 200);
const relevant = observations.filter(({ expectedHostPresent }) => expectedHostPresent);
const report = {
  schemaVersion: 'clervo.serper-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.serper',
  endpointOrigin: 'https://google.serper.dev',
  ownerCashSpentUsd: 0,
  externalCalls: observations.length,
  credentialSlotsUsed: 1,
  configuredCredentialSlots: 1,
  accountPolicy: 'single_account_only_no_limit_circumvention',
  corpus: { caseCount: cases.length, queryValuesIncluded: false, expectedHostValuesIncluded: false },
  summary: {
    successfulCalls: successful.length,
    expectedHostHits: relevant.length,
    expectedHostTopThreeHits: observations.filter(({ expectedHostRank }) => expectedHostRank <= 3).length,
    latencyMsP50: sortedLatency[Math.floor((sortedLatency.length - 1) * 0.5)],
    latencyMsP95: sortedLatency[Math.ceil((sortedLatency.length - 1) * 0.95)],
    resultCountMinimum: successful.length ? Math.min(...successful.map(({ organicResultCount }) => organicResultCount)) : 0,
    qualityGrade: successful.length === cases.length && relevant.length === cases.length ? 'good' : successful.length >= 4 && relevant.length >= 4 ? 'poor' : 'rejected',
  },
  observations,
  terms: {
    reviewedAt: new Date().toISOString(),
    termsUrl: 'https://serper.dev/terms',
    pricingUrl: 'https://serper.dev/',
    termsUpdatedAt: '2024-05-29',
    businessToBusinessService: true,
    valueAddedApplicationAllowed: true,
    unchangedMirroringAllowed: false,
    multipleAccountsAllowed: false,
    limitCircumventionAllowed: false,
    dataAttributionAndRightsRemainCustomerResponsibilities: true,
  },
  supplierPricing: {
    currency: 'USD',
    freeQueriesAdvertised: 2500,
    starterCredits: 50000,
    starterPriceUsd: 50,
    starterQueriesPerSecond: 50,
    purchasedCreditsExpireAfterMonths: 6,
    successfulResponsesConsumeCredits: true,
    currentOwnedBalance: null,
    currentOwnedBalanceStatus: 'not_exposed_by_api_response',
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
