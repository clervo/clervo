import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  CONTRACT_VERSION,
  AI_EXECUTION_REQUEST_SCHEMA_VERSION,
  aiQualificationCheckNames,
  createAiModelCatalog,
  createAiRouteQualification,
  verifyAiExecutionResult,
} from '../../dist/packages/contracts/src/index.js';
import { executeAiOperation } from '../../dist/services/ai/src/execution.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const startedAt = '2026-08-02T00:00:00.000Z';
const completedAt = '2026-08-02T00:00:01.000Z';
const deadlineAt = '2026-08-02T00:01:00.000Z';
const zeroUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: 0 };
const pricing = { currency: 'USD', decimals: 6, inputTokenMicrosPerMillion: 1_000_000, cachedInputTokenMicrosPerMillion: 100_000, outputTokenMicrosPerMillion: 2_000_000, reasoningTokenMicrosPerMillion: 2_000_000, imageMicrosEach: 10_000, audioMicrosPerThousandCharacters: 2_000 };

const routeSpecs = [
  { suffix: 'CHAT', productId: 'ai.chat', model: 'recorded-chat-v1', capabilities: ['text_input', 'text_output'] },
  { suffix: 'EMBED', productId: 'ai.embed', model: 'recorded-embed-v1', capabilities: ['text_input', 'embedding_output'] },
  { suffix: 'IMAGE', productId: 'ai.image', model: 'recorded-image-v1', capabilities: ['text_input', 'image_output'] },
  { suffix: 'SPEECH', productId: 'ai.speech', model: 'recorded-speech-v1', capabilities: ['text_input', 'audio_output'] },
];

function definition(spec) {
  const qualification = createAiRouteQualification({
    qualificationId: `aiqual_01K0AI${spec.suffix}QUALIFICATION0001`, routeId: `ai.route.recorded_${spec.suffix.toLowerCase()}`, providerId: `provider.recorded_${spec.suffix.toLowerCase()}`, supplyFamilyId: `supply.recorded_${spec.suffix.toLowerCase()}`, exactModelId: spec.model, productIds: [spec.productId],
    checkedAt: '2026-08-01T23:30:00.000Z', expiresAt: '2026-08-08T23:30:00.000Z', termsStatus: 'approved', resaleAllowed: true,
    checks: aiQualificationCheckNames.map((name) => ({ name, status: 'passed', evidenceHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111' })),
    observed: { modelIdentity: spec.model, latencyMsP95: 50, maximumSupplierCost: { asset: 'USD', amountAtomic: '1000000', decimals: 6 } },
  }, spec.capabilities);
  return { routeId: qualification.routeId, providerId: qualification.providerId, supplyFamilyId: qualification.supplyFamilyId, exactModelId: spec.model, productIds: [spec.productId], capabilities: spec.capabilities, requiredSecretNames: [], quickAiPremium: false, qualification };
}

function setup() {
  const definitions = routeSpecs.map(definition);
  return {
    catalog: createAiModelCatalog({ catalogId: 'aicat_01K0AIEXECUTIONCATALOG1', evaluatedAt: startedAt, routes: definitions }),
    routes: definitions.map((value) => ({ definition: value, pricing, health: 'healthy', circuit: 'closed', latencyMsP95: 50, qualityScore: 0.8 })),
  };
}

function request(spec, input, usageBounds) {
  return {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_EXECUTION_REQUEST_SCHEMA_VERSION,
    operationId: `op_01K0AI${spec.suffix}EXECUTION0001`,
    productId: spec.productId,
    requestedModel: `ai.route.recorded_${spec.suffix.toLowerCase()}`,
    input,
    usageBounds,
    maximumSupplierCost: { asset: 'USD', amountAtomic: '1000000', decimals: 6 },
    deadlineAt,
  };
}

function adapter(routeId, modelIdentity, usage, output, overrides = {}) {
  return { routeId, execute: async () => ({ modelIdentity, completedAt, usage, output, ...overrides }) };
}

test('evidence-aware chat returns only citation-bound claims with exact model and cost disclosure', async () => {
  const spec = routeSpecs[0];
  const citationId = 'cite_01K0AIEVIDENCECITATION01';
  const req = request(spec, {
    kind: 'chat', messages: [{ role: 'user', content: 'What changed?' }], responseFormat: 'text', stream: false,
    evidence: [{ citationId, resultId: 'sr_01K0AIEVIDENCERESULT001', canonicalUrl: 'https://example.com/change', quote: 'The plan changed on Friday.' }],
  }, { ...zeroUsage, inputTokens: 1000, outputTokens: 200 });
  const usage = { ...zeroUsage, inputTokens: 120, outputTokens: 12 };
  const output = { kind: 'chat', content: 'The plan changed on Friday.', finishReason: 'stop', claims: [{ text: 'The plan changed on Friday.', citationIds: [citationId] }] };
  const runtime = setup();
  const outcome = await executeAiOperation({ request: req, ...runtime, adapters: [adapter('ai.route.recorded_chat', spec.model, usage, output)], startedAt, clock: () => Date.parse(startedAt) });
  assert.equal(outcome.outcome, 'completed');
  assert.equal(outcome.result.exactModelId, spec.model);
  assert.equal(outcome.result.supplierCost.amountAtomic, '144');
  assert.equal(verifyAiExecutionResult(outcome.result, req, { ...outcome.result, decisionHash: outcome.result.routeDecisionHash }), false, 'a result is not itself a route decision');
  assert.ok(Object.isFrozen(outcome.result) && Object.isFrozen(outcome.result.output));
});

test('embedding, image, and speech normalize to bounded provider-neutral artifacts', async () => {
  const runtime = setup();
  const cases = [
    {
      spec: routeSpecs[1], input: { kind: 'embedding', inputs: ['one', 'two'], dimensions: 2 }, bounds: { ...zeroUsage, inputTokens: 100 }, usage: { ...zeroUsage, inputTokens: 4 },
      output: { kind: 'embedding', vectors: [{ index: 0, embedding: [0.1, 0.2] }, { index: 1, embedding: [0.3, 0.4] }] },
    },
    {
      spec: routeSpecs[2], input: { kind: 'image', prompt: 'A geometric prism', size: '1024x1024', quality: 'low', count: 1 }, bounds: { ...zeroUsage, inputTokens: 100, images: 1 }, usage: { ...zeroUsage, inputTokens: 10, images: 1 },
      output: { kind: 'image', artifacts: [{ artifactUri: 'artifact://ai/image/result-0001', sha256: 'sha256:2222222222222222222222222222222222222222222222222222222222222222', mimeType: 'image/png', width: 1024, height: 1024 }] },
    },
    {
      spec: routeSpecs[3], input: { kind: 'speech', input: 'Hello from Clervo.', voice: 'neutral', responseFormat: 'mp3' }, bounds: { ...zeroUsage, inputTokens: 100, audioCharacters: 18 }, usage: { ...zeroUsage, inputTokens: 5, audioCharacters: 18 },
      output: { kind: 'speech', artifact: { artifactUri: 'artifact://ai/speech/result-0001', sha256: 'sha256:3333333333333333333333333333333333333333333333333333333333333333', mimeType: 'audio/mpeg', bytes: 1024 } },
    },
  ];
  for (const value of cases) {
    const req = request(value.spec, value.input, value.bounds);
    const outcome = await executeAiOperation({ request: req, ...runtime, adapters: [adapter(`ai.route.recorded_${value.spec.suffix.toLowerCase()}`, value.spec.model, value.usage, value.output)], startedAt, clock: () => Date.parse(startedAt) });
    assert.equal(outcome.outcome, 'completed');
    assert.equal(outcome.result.output.kind, value.input.kind);
  }
});

test('identity substitution, uncited prose, malformed output, and provider exceptions fail safely', async () => {
  const spec = routeSpecs[0];
  const citationId = 'cite_01K0AIEVIDENCECITATION02';
  const req = request(spec, { kind: 'chat', messages: [{ role: 'user', content: 'Summarize.' }], responseFormat: 'text', stream: false, evidence: [{ citationId, resultId: 'sr_01K0AIEVIDENCERESULT002', canonicalUrl: 'https://example.com/evidence', quote: 'Verified statement.' }] }, { ...zeroUsage, inputTokens: 100, outputTokens: 100 });
  const runtime = setup();
  const usage = { ...zeroUsage, inputTokens: 10, outputTokens: 5 };
  const validOutput = { kind: 'chat', content: 'Verified statement.', finishReason: 'stop', claims: [{ text: 'Verified statement.', citationIds: [citationId] }] };
  const substituted = await executeAiOperation({ request: req, ...runtime, adapters: [adapter('ai.route.recorded_chat', 'other-model', usage, validOutput)], startedAt, clock: () => Date.parse(startedAt) });
  assert.deepEqual(substituted, { outcome: 'failed', failureCode: 'model_identity_mismatch' });
  const uncited = await executeAiOperation({ request: req, ...runtime, adapters: [adapter('ai.route.recorded_chat', spec.model, usage, { kind: 'chat', content: 'Invented.', finishReason: 'stop', claims: [{ text: 'Invented.', citationIds: ['cite_01K0UNKNOWNCITATION00001'] }] })], startedAt, clock: () => Date.parse(startedAt) });
  assert.deepEqual(uncited, { outcome: 'failed', failureCode: 'usage_or_output_invalid' });
  const thrown = await executeAiOperation({ request: req, ...runtime, adapters: [{ routeId: 'ai.route.recorded_chat', execute: async () => { throw new Error('credential-value-must-not-escape'); } }], startedAt, clock: () => Date.parse(startedAt) });
  assert.deepEqual(thrown, { outcome: 'failed', failureCode: 'adapter_failed' });
  assert.equal(JSON.stringify(thrown).includes('credential-value'), false);
});

test('non-cooperative adapters are deadline-bounded and aborted', async () => {
  const spec = routeSpecs[0];
  const shortDeadline = '2026-08-02T00:00:00.020Z';
  const req = { ...request(spec, { kind: 'chat', messages: [{ role: 'user', content: 'Wait.' }], responseFormat: 'text', stream: false }, { ...zeroUsage, inputTokens: 100, outputTokens: 100 }), deadlineAt: shortDeadline };
  let signal;
  const outcome = await executeAiOperation({ request: req, ...setup(), adapters: [{ routeId: 'ai.route.recorded_chat', execute: async (input) => { signal = input.signal; return new Promise(() => {}); } }], startedAt, clock: () => Date.parse(startedAt) });
  assert.deepEqual(outcome, { outcome: 'failed', failureCode: 'deadline_exceeded' });
  assert.equal(signal.aborted, true);
});

test('execution request and result schemas compile strictly and remain private', async () => {
  const req = request(routeSpecs[0], { kind: 'chat', messages: [{ role: 'user', content: 'Hello.' }], responseFormat: 'text', stream: false }, { ...zeroUsage, inputTokens: 100, outputTokens: 100 });
  const runtime = setup();
  const outcome = await executeAiOperation({ request: req, ...runtime, adapters: [adapter('ai.route.recorded_chat', 'recorded-chat-v1', { ...zeroUsage, inputTokens: 2, outputTokens: 2 }, { kind: 'chat', content: 'Hello.', finishReason: 'stop' })], startedAt, clock: () => Date.parse(startedAt) });
  assert.equal(outcome.outcome, 'completed');
  const files = (await readdir(path.join(root, 'packages/contracts/schemas'))).filter((file) => file.endsWith('.schema.json'));
  const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
  for (const file of files) ajv.addSchema(JSON.parse(await readFile(path.join(root, 'packages/contracts/schemas', file), 'utf8')));
  for (const [id, value] of [['ai-execution-request.schema.json', req], ['ai-execution-result.schema.json', outcome.result]]) {
    const validate = ajv.getSchema(`https://api.clervo.dev/schemas/2026-07-29.1/${id}`);
    assert.equal(validate(value), true, ajv.errorsText(validate.errors));
  }
  const visibility = JSON.parse(await readFile(path.join(root, 'packages/catalog/schema-visibility.v1.json'), 'utf8'));
  assert.ok(['ai-execution-request.schema.json', 'ai-execution-result.schema.json'].every((file) => visibility.schemas.find((entry) => entry.file === file)?.visibility === 'internal_control'));
  const registry = JSON.parse(await readFile(path.join(root, 'packages/catalog/platform-registry.v1.json'), 'utf8'));
  assert.deepEqual(registry.operations.filter(({ operationId }) => operationId.startsWith('ai.')).map(({ operationId, lifecycle, route }) => ({ operationId, lifecycle, route })), [
    { operationId: 'ai.chat', lifecycle: 'unavailable', route: null },
    { operationId: 'ai.embed', lifecycle: 'unavailable', route: null },
    { operationId: 'ai.image', lifecycle: 'unavailable', route: null },
    { operationId: 'ai.speech', lifecycle: 'unavailable', route: null },
  ]);
});
