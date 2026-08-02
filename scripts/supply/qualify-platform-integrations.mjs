import { performance } from 'node:perf_hooks';

const required = [
  'GH_TOKEN_1',
  'GITLAB_TOKEN',
  'DEVTO_API_KEY',
  'HASHNODE_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'WORKOS_API_KEY',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) throw new Error(`Missing required environment names: ${missing.join(', ')}`);

const observe = async ({ serviceId, request, validate, summarize = () => ({}) }) => {
  const started = performance.now();
  try {
    const response = await fetch(request.url, {
      method: request.method ?? 'GET',
      headers: request.headers,
      body: request.body,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    const latencyMs = Math.round(performance.now() - started);
    const payload = await response.json().catch(() => null);
    const shapeValid = validate(payload);
    return {
      serviceId,
      status: response.status,
      latencyMs,
      responseShapeValid: shapeValid,
      rateLimitHeaderPresent: [...response.headers.keys()].some((name) => name.includes('ratelimit') || name.includes('rate-limit')),
      passed: response.ok && shapeValid,
      ...summarize(payload, response),
    };
  } catch (error) {
    return {
      serviceId,
      status: null,
      latencyMs: Math.round(performance.now() - started),
      responseShapeValid: false,
      rateLimitHeaderPresent: false,
      passed: false,
      failureCode: error?.name === 'TimeoutError' ? 'timeout' : 'transport_failure',
    };
  }
};

const telegramCredential = process.env.TELEGRAM_BOT_TOKEN;
const checks = [
  {
    serviceId: 'supply.github_source',
    request: {
      url: 'https://api.github.com/user',
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${process.env.GH_TOKEN_1}`, 'user-agent': 'clervo-supply-qualification' },
    },
    validate: (payload) => Number.isInteger(payload?.id) && typeof payload?.login === 'string',
    summarize: (_payload, response) => ({ authenticatedIdentityPresent: response.status === 200, grantedScopesHeaderPresent: response.headers.has('x-oauth-scopes') }),
  },
  {
    serviceId: 'supply.gitlab_source',
    request: { url: 'https://gitlab.com/api/v4/user', headers: { accept: 'application/json', 'private-token': process.env.GITLAB_TOKEN } },
    validate: (payload) => Number.isInteger(payload?.id) && typeof payload?.username === 'string',
    summarize: (payload) => ({ authenticatedIdentityPresent: Number.isInteger(payload?.id) }),
  },
  {
    serviceId: 'supply.devto',
    request: { url: 'https://dev.to/api/users/me', headers: { accept: 'application/vnd.forem.api-v1+json', 'api-key': process.env.DEVTO_API_KEY } },
    validate: (payload) => Number.isInteger(payload?.id) && typeof payload?.username === 'string',
    summarize: (payload) => ({ authenticatedIdentityPresent: Number.isInteger(payload?.id) }),
  },
  {
    serviceId: 'supply.hashnode',
    request: {
      url: 'https://gql-beta.hashnode.com/',
      method: 'POST',
      headers: { accept: 'application/json', authorization: `Bearer ${process.env.HASHNODE_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'query ClervoSupplyIdentity { me { id } }' }),
    },
    validate: (payload) => typeof payload?.data?.me?.id === 'string',
    summarize: (payload) => ({ authenticatedIdentityPresent: typeof payload?.data?.me?.id === 'string', graphqlErrorsPresent: Array.isArray(payload?.errors) && payload.errors.length > 0 }),
  },
  {
    serviceId: 'supply.telegram',
    request: { url: `https://api.telegram.org/bot${telegramCredential}/getMe`, headers: { accept: 'application/json' } },
    validate: (payload) => payload?.ok === true && Number.isInteger(payload?.result?.id) && payload?.result?.is_bot === true,
    summarize: (payload) => ({ authenticatedBotPresent: payload?.ok === true && payload?.result?.is_bot === true }),
  },
  {
    serviceId: 'supply.workos',
    request: { url: 'https://api.workos.com/organizations?limit=1', headers: { accept: 'application/json', authorization: `Bearer ${process.env.WORKOS_API_KEY}` } },
    validate: (payload) => Array.isArray(payload?.data) && (typeof payload?.listMetadata === 'object' || typeof payload?.list_metadata === 'object'),
    summarize: (payload) => ({ organizationListShapePresent: Array.isArray(payload?.data), organizationCountReturned: Array.isArray(payload?.data) ? payload.data.length : null }),
  },
];

const observations = [];
for (const check of checks) observations.push(await observe(check));
const latency = observations.map(({ latencyMs }) => latencyMs).sort((a, b) => a - b);
const report = {
  schemaVersion: 'clervo.platform-integration-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  ownerCashSpentUsd: 0,
  externalCalls: observations.length,
  mutationCalls: 0,
  publishedArticles: 0,
  sentMessages: 0,
  repositoriesRead: 0,
  customerIdentityDataUsed: false,
  responsePayloadValuesRecorded: false,
  credentialPolicy: {
    githubConfiguredTokenAssignments: 12,
    githubCredentialSlotsUsed: 1,
    githubAccountPoolingAttempted: false,
    telegramAlternateCredentialUsed: false,
  },
  summary: {
    passedServices: observations.filter(({ passed }) => passed).length,
    failedServices: observations.filter(({ passed }) => !passed).length,
    latencyMsP50: latency[Math.floor((latency.length - 1) * 0.5)],
    latencyMsP95: latency[Math.ceil((latency.length - 1) * 0.95)],
  },
  observations,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
