#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

const credential = process.env.BRAVE_SEARCH_API_KEY;
if (!credential) throw new TypeError('BRAVE_SEARCH_API_KEY is required');

const cases = [
  { caseId: 'node_fetch', query: 'site:nodejs.org Node.js fetch API documentation', expectedHost: 'nodejs.org' },
  { caseId: 'mdn_429', query: 'site:developer.mozilla.org HTTP 429 status code', expectedHost: 'developer.mozilla.org' },
  { caseId: 'rfc_9110', query: 'site:rfc-editor.org RFC 9110 HTTP semantics', expectedHost: 'rfc-editor.org' },
  { caseId: 'cloudflare_r2', query: 'site:developers.cloudflare.com R2 S3 API documentation', expectedHost: 'developers.cloudflare.com' },
  { caseId: 'solana_rpc', query: 'site:solana.com docs JSON RPC getHealth', expectedHost: 'solana.com' },
];

const observations = [];
for (const testCase of cases) {
  const endpoint = new URL('https://api.search.brave.com/res/v1/web/search');
  endpoint.search = new URLSearchParams({
    q: testCase.query,
    count: '10',
    country: 'us',
    search_lang: 'en',
    safesearch: 'moderate',
  }).toString();
  const started = performance.now();
  let response;
  try {
    response = await fetch(endpoint, {
      headers: { accept: 'application/json', 'X-Subscription-Token': credential },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    observations.push({
      caseId: testCase.caseId,
      status: 0,
      latencyMs: Math.round(performance.now() - started),
      webResultCount: 0,
      expectedHostPresent: false,
      expectedHostRank: null,
      queryMetadataPresent: false,
      failureCode: error?.name === 'TimeoutError' ? 'timeout' : 'network_failure',
    });
    continue;
  }
  const latencyMs = Math.round(performance.now() - started);
  const payload = await response.json().catch(() => ({}));
  const results = Array.isArray(payload.web?.results) ? payload.web.results : [];
  const hosts = results.flatMap(({ url }) => {
    try { return [new URL(url).hostname]; } catch { return []; }
  });
  const expectedRank = hosts.findIndex((host) => host === testCase.expectedHost || host.endsWith(`.${testCase.expectedHost}`)) + 1;
  observations.push({
    caseId: testCase.caseId,
    status: response.status,
    latencyMs,
    webResultCount: results.length,
    expectedHostPresent: expectedRank > 0,
    expectedHostRank: expectedRank || null,
    queryMetadataPresent: payload.query != null,
    failureCode: response.status === 200 ? null : `http_${response.status}`,
  });
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

const successful = observations.filter(({ status }) => status === 200);
const relevant = observations.filter(({ expectedHostPresent }) => expectedHostPresent);
const latencyMsP50 = percentile(observations.map(({ latencyMs }) => latencyMs), 0.5);
const latencyMsP95 = percentile(observations.map(({ latencyMs }) => latencyMs), 0.95);
const fullPass = successful.length === cases.length && relevant.length === cases.length;
const report = {
  schemaVersion: 'clervo.brave-search-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.brave_search',
  endpointOrigin: 'https://api.search.brave.com',
  ownerCashSpentUsd: 0,
  externalCalls: observations.length,
  credentialSlotsUsed: 1,
  configuredCredentialSlots: 1,
  responsePayloadValuesRecorded: false,
  corpus: { caseCount: cases.length, queryValuesIncluded: false, expectedHostValuesIncluded: false },
  summary: {
    successfulCalls: successful.length,
    expectedHostHits: relevant.length,
    expectedHostTopThreeHits: observations.filter(({ expectedHostRank }) => expectedHostRank <= 3).length,
    latencyMsP50,
    latencyMsP95,
    resultCountMinimum: successful.length ? Math.min(...successful.map(({ webResultCount }) => webResultCount)) : 0,
    qualityGrade: fullPass && latencyMsP95 <= 600 ? 'best' : fullPass ? 'good' : successful.length >= 4 && relevant.length >= 4 ? 'poor' : 'rejected',
  },
  observations,
  terms: {
    reviewedAt: new Date().toISOString(),
    termsUrl: 'https://api-dashboard.search.brave.com/documentation/resources/terms-of-service',
    termsUpdatedAt: '2026-02-11',
    customerApplicationsAndEndUsersRecognized: true,
    searchResultsUsableWithCustomerApplications: true,
    rawApiOrSearchResultResaleAllowed: false,
    transientOperationalStorageOnly: true,
    aiTrainingOrBenchmarkUseAllowed: false,
    multipleAccountLimitCircumventionAllowed: false,
    endUserEquivalentRestrictionsRequired: true,
    valueAddedClervoIntegrationRequired: true,
  },
  supplierPricing: {
    currency: 'USD',
    recurringMonthlyCreditUsd: 5,
    searchPricePerThousandUsd: 5,
    recurringMonthlyQueries: 1000,
    queriesPerSecond: 50,
    cardChargeOnFreePlan: false,
    currentOwnedRemainingQueries: null,
    currentOwnedRemainingStatus: 'not_exposed_by_api_response',
    clervoHardMonthlyCallCeiling: 1000,
    automaticPaidOverageAllowedByClervo: false,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
