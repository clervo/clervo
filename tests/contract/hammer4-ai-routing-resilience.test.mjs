import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_EXECUTION_REQUEST_SCHEMA_VERSION,
  CONTRACT_VERSION,
  aiQualificationCheckNames,
  createAiModelCatalog,
  createAiRouteQualification,
  estimateAiSupplierCost,
} from '../../dist/packages/contracts/src/index.js';
import {
  createAiAdapterFailureError,
  executeAiOperation,
} from '../../dist/services/ai/src/execution.js';
import { createAiExecutionMonitor } from '../../dist/services/ai/src/monitoring.js';
import { ClervoAiGatewayAdapter } from '../../dist/adapters/ai/src/clervo-ai-gateway.js';

const startedAt = '2026-08-17T17:00:00.000Z';
const deadlineAt = '2026-08-17T18:00:00.000Z';
const checkedAt = '2026-08-17T16:00:00.000Z';
const expiresAt = '2026-08-24T16:00:00.000Z';
const evidenceHash = `sha256:${'a'.repeat(64)}`;
const usageBounds = Object.freeze({
  inputTokens: 10,
  cachedInputTokens: 0,
  outputTokens: 10,
  reasoningTokens: 0,
  images: 0,
  audioCharacters: 0,
  videoSeconds: 0,
  musicGenerations: 0,
  virtualTryOnImages: 0,
});
const observedUsage = Object.freeze({ ...usageBounds, inputTokens: 1, outputTokens: 1 });

function pricing(rate = 1_000_000) {
  return Object.freeze({
    currency: 'USD',
    decimals: 6,
    inputTokenMicrosPerMillion: rate,
    cachedInputTokenMicrosPerMillion: rate,
    outputTokenMicrosPerMillion: rate,
    reasoningTokenMicrosPerMillion: rate,
    imageMicrosEach: 0,
    audioMicrosPerThousandCharacters: 0,
    videoMicrosPerSecond: 0,
    musicMicrosPerGeneration: 0,
    virtualTryOnMicrosPerImage: 0,
  });
}

function definition(routeId, { exactModelId = 'clervo/h4-exact', supplyFamilyId = 'supply.clervo_ai_gateway', providerId = 'provider.clervo_ai_gateway', suffix = 'a' } = {}) {
  const capabilities = ['text_input', 'text_output'];
  const qualification = createAiRouteQualification({
    qualificationId: `aiqual_${suffix.repeat(24)}`,
    routeId,
    providerId,
    supplyFamilyId,
    exactModelId,
    productIds: ['ai.chat'],
    checkedAt,
    expiresAt,
    termsStatus: 'approved',
    resaleAllowed: true,
    checks: aiQualificationCheckNames.map((name) => ({ name, status: 'passed', evidenceHash })),
    observed: {
      modelIdentity: exactModelId,
      latencyMsP95: 100,
      maximumSupplierCost: { asset: 'USD', amountAtomic: '1000000', decimals: 6 },
    },
  }, capabilities);
  return Object.freeze({
    routeId,
    providerId,
    supplyFamilyId,
    exactModelId,
    productIds: ['ai.chat'],
    capabilities,
    requiredSecretNames: ['CLERVO_AI_GATEWAY_TOKEN'],
    quickAiPremium: false,
    qualification,
  });
}

function runtime(definitionValue, rate = 1_000_000, qualityScore = 0.9) {
  return Object.freeze({
    definition: definitionValue,
    pricing: pricing(rate),
    health: 'healthy',
    circuit: 'closed',
    latencyMsP95: 100,
    qualityScore,
  });
}

function fixture({ secondRate = 1_000_000, secondFamily = 'supply.clervo_ai_gateway' } = {}) {
  const first = runtime(definition('ai.route.h4_a', { suffix: 'a' }));
  const second = runtime(definition('ai.route.h4_b', { suffix: 'b', supplyFamilyId: secondFamily }), secondRate);
  const catalog = createAiModelCatalog({
    catalogId: `aicat_${'c'.repeat(24)}`,
    evaluatedAt: startedAt,
    routes: [first.definition, second.definition],
  });
  return { catalog, routes: [first, second], first, second };
}

function request(requestedModel, maximumSupplierCost) {
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_EXECUTION_REQUEST_SCHEMA_VERSION,
    operationId: `op_${'h'.repeat(32)}`,
    productId: 'ai.chat',
    requestedModel,
    input: Object.freeze({ kind: 'chat', messages: Object.freeze([Object.freeze({ role: 'user', content: 'Reply exactly OK' })]), responseFormat: 'text', stream: false }),
    usageBounds,
    maximumSupplierCost,
    deadlineAt,
  });
}

function success(routeId, calls, content = 'OK') {
  return Object.freeze({
    routeId,
    async execute({ exactModelId }) {
      calls.push(routeId);
      return Object.freeze({
        modelIdentity: exactModelId,
        completedAt: '2026-08-17T17:00:01.000Z',
        usage: observedUsage,
        output: Object.freeze({ kind: 'chat', content, finishReason: 'stop' }),
      });
    },
  });
}

function failure(routeId, calls, metadata) {
  return Object.freeze({
    routeId,
    async execute() {
      calls.push(routeId);
      throw createAiAdapterFailureError('h4_test_failure', metadata);
    },
  });
}

function authorizedCost(route) {
  return estimateAiSupplierCost(usageBounds, route.pricing);
}

test('Hammer 4 retries a pre-commit auth failure only onto exact-equivalent authorized supply and receipts the successful route', async () => {
  const { catalog, routes, first } = fixture();
  const calls = [];
  const monitor = createAiExecutionMonitor();
  const outcome = await executeAiOperation({
    request: request('clervo/h4-exact', authorizedCost(first)),
    catalog,
    routes,
    adapters: [
      failure('ai.route.h4_a', calls, { failureClass: 'authentication', commitState: 'not_committed', retryDisposition: 'next_exact_route', providerStatus: 401, providerErrorCode: 'auth_unavailable' }),
      success('ai.route.h4_b', calls),
    ],
    startedAt,
    clock: () => Date.parse(startedAt),
    monitor,
  });
  assert.equal(outcome.outcome, 'completed');
  assert.equal(outcome.result.routeId, 'ai.route.h4_b');
  assert.equal(outcome.result.exactModelId, 'clervo/h4-exact');
  assert.deepEqual(calls, ['ai.route.h4_a', 'ai.route.h4_b']);

  const snapshot = monitor.snapshot();
  assert.deepEqual(snapshot.logs.map(({ eventName }) => eventName), [
    'clervo.ai.attempt_started',
    'clervo.ai.attempt_failed',
    'clervo.ai.attempt_started',
    'clervo.ai.completed',
  ]);
  const failureLog = snapshot.logs[1];
  const attributes = Object.fromEntries(failureLog.attributes.map(({ name, value }) => [name, value]));
  assert.equal(attributes.attempt_index, 1);
  assert.equal(attributes.failure_class, 'authentication');
  assert.equal(attributes.commit_state, 'not_committed');
  assert.equal(attributes.retryable, true);
  assert.equal(attributes.http_status, 401);
  assert.equal(attributes.error_code, 'auth_unavailable');
  assert.equal(snapshot.alerts.length, 0);
  assert.equal(snapshot.metrics.length, 1);
});

test('Hammer 4 does not substitute when the caller explicitly requests a route id', async () => {
  const { catalog, routes, first } = fixture();
  const calls = [];
  const outcome = await executeAiOperation({
    request: request('ai.route.h4_a', authorizedCost(first)),
    catalog,
    routes,
    adapters: [
      failure('ai.route.h4_a', calls, { failureClass: 'authentication', commitState: 'not_committed', retryDisposition: 'next_exact_route', providerStatus: 401 }),
      success('ai.route.h4_b', calls),
    ],
    startedAt,
    clock: () => Date.parse(startedAt),
  });
  assert.deepEqual(outcome, { outcome: 'failed', failureCode: 'adapter_failed' });
  assert.deepEqual(calls, ['ai.route.h4_a']);
});

test('Hammer 4 never crosses supply family and never exceeds the original supplier-cost ceiling', async () => {
  for (const mode of ['family', 'cost']) {
    const fixtureValue = mode === 'family'
      ? fixture({ secondFamily: 'supply.other_gateway' })
      : fixture({ secondRate: 2_000_000 });
    const calls = [];
    const outcome = await executeAiOperation({
      request: request('clervo/h4-exact', authorizedCost(fixtureValue.first)),
      catalog: fixtureValue.catalog,
      routes: fixtureValue.routes,
      adapters: [
        failure('ai.route.h4_a', calls, { failureClass: 'quota', commitState: 'not_committed', retryDisposition: 'next_exact_route', providerStatus: 429, providerErrorCode: 'usage_limit_reached' }),
        success('ai.route.h4_b', calls),
      ],
      startedAt,
      clock: () => Date.parse(startedAt),
    });
    assert.deepEqual(outcome, { outcome: 'failed', failureCode: 'adapter_failed' });
    assert.deepEqual(calls, ['ai.route.h4_a']);
  }
});

test('Hammer 4 fails closed when supplier commit state is unknown', async () => {
  const { catalog, routes, first } = fixture();
  const calls = [];
  const outcome = await executeAiOperation({
    request: request('clervo/h4-exact', authorizedCost(first)),
    catalog,
    routes,
    adapters: [
      failure('ai.route.h4_a', calls, { failureClass: 'transport', commitState: 'unknown', retryDisposition: 'stop' }),
      success('ai.route.h4_b', calls),
    ],
    startedAt,
    clock: () => Date.parse(startedAt),
  });
  assert.deepEqual(outcome, { outcome: 'failed', failureCode: 'adapter_failed' });
  assert.deepEqual(calls, ['ai.route.h4_a']);
});

function gatewayRequest() {
  return request('clervo/h4-exact', { asset: 'USD', amountAtomic: '1000', decimals: 6 });
}

async function gatewayFailure(status, type) {
  const adapter = new ClervoAiGatewayAdapter({
    config: { baseUrl: 'https://ai.clervo.dev/v1/', allowedHosts: ['ai.clervo.dev'], secretName: 'CLERVO_AI_GATEWAY_TOKEN', maximumResponseBytes: 100_000 },
    transport: {
      async request() {
        return Object.freeze({
          status,
          contentType: 'application/json',
          body: new TextEncoder().encode(JSON.stringify({ error: { type } })),
        });
      },
    },
    secret: async () => 'opaque-test-token',
  });
  try {
    await adapter.execute({ request: gatewayRequest(), exactModelId: 'clervo/h4-exact', runtimeModelId: 'gpt-5.6-sol', routeId: 'ai.route.dynamic_h4_account', signal: new AbortController().signal });
    assert.fail('gateway request unexpectedly succeeded');
  } catch (error) {
    return error.aiFailure;
  }
}

test('Clervo gateway exposes sanitized auth/quota metadata while 5xx remains unknown-commit and non-retryable', async () => {
  assert.deepEqual(await gatewayFailure(401, 'auth_unavailable'), {
    failureClass: 'authentication',
    commitState: 'not_committed',
    retryDisposition: 'next_exact_route',
    providerStatus: 401,
    providerErrorCode: 'auth_unavailable',
  });
  assert.deepEqual(await gatewayFailure(429, 'usage_limit_reached'), {
    failureClass: 'quota',
    commitState: 'not_committed',
    retryDisposition: 'next_exact_route',
    providerStatus: 429,
    providerErrorCode: 'usage_limit_reached',
  });
  assert.deepEqual(await gatewayFailure(503, 'internal_server_error'), {
    failureClass: 'transient',
    commitState: 'unknown',
    retryDisposition: 'stop',
    providerStatus: 503,
    providerErrorCode: 'internal_server_error',
  });
});
