const accounts = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID_OLD', 'CLOUDFLARE_ACCOUNT_ID__LEGACY_ALT_01'];
const tokens = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_TOKEN_OLD'];
const observations = [];
for (const accountName of accounts) {
  for (const tokenName of tokens) {
    const account = process.env[accountName];
    const token = process.env[tokenName];
    if (!account || !token) {
      observations.push({ accountName, tokenName, status: null, outcome: 'missing', errorCodes: [], bucketCount: null });
      continue;
    }
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/r2/buckets`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json().catch(() => ({}));
      observations.push({
        accountName,
        tokenName,
        status: response.status,
        outcome: body.success === true ? 'passed' : 'rejected',
        errorCodes: Array.isArray(body.errors) ? body.errors.flatMap(({ code }) => Number.isInteger(code) ? [code] : []) : [],
        bucketCount: Array.isArray(body.result?.buckets) ? body.result.buckets.length : null,
      });
    } catch (error) {
      observations.push({ accountName, tokenName, status: null, outcome: error?.name === 'TimeoutError' ? 'timeout' : 'transport_failure', errorCodes: [], bucketCount: null });
    }
  }
}
const report = {
  schemaVersion: 'clervo.r2-control-plane-diagnostic.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.cloudflare_r2',
  externalCalls: observations.filter(({ status }) => status !== null).length,
  objectReadCalls: 0,
  objectWriteCalls: 0,
  mutationCalls: 0,
  ownerCashSpentUsd: 0,
  responsePayloadValuesRecorded: false,
  credentialValuesRecorded: false,
  observations,
  summary: { passedCombinations: observations.filter(({ outcome }) => outcome === 'passed').length, replacementCredentialStillRequired: observations.every(({ outcome }) => outcome !== 'passed') },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
