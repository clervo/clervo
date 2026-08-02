import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { qualifyAiChatRoute } from '../../dist/services/ai/src/qualification.js';
import { createAiExecutionMonitor } from '../../dist/services/ai/src/monitoring.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const capabilities = ['text_input', 'text_output', 'streaming', 'structured_output'];
const pricing = { currency: 'USD', decimals: 6, inputTokenMicrosPerMillion: 1_000_000, cachedInputTokenMicrosPerMillion: 100_000, outputTokenMicrosPerMillion: 2_000_000, reasoningTokenMicrosPerMillion: 2_000_000, imageMicrosEach: 0, audioMicrosPerThousandCharacters: 0 };
const usage = { inputTokens: 10, cachedInputTokens: 0, outputTokens: 2, reasoningTokens: 0, images: 0, audioCharacters: 0 };

function input(overrides = {}) {
  return {
    qualificationId: 'aiqual_01K0AILIVEQUALIFICATION01', routeId: 'ai.route.provider_chat', providerId: 'provider.example', supplyFamilyId: 'supply.example_cloud', exactModelId: 'example-chat-v1', capabilities,
    credentialAvailable: true, termsStatus: 'approved', resaleAllowed: true, checkedAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-09T00:00:00.000Z', maximumLatencyMsP95: 1000,
    maximumSupplierCost: { asset: 'USD', amountAtomic: '1000', decimals: 6 }, pricing,
    probe: {
      async complete({ prompt, stream, responseFormat }) {
        const outputText = prompt.includes('CLERVO-QUAL-A') ? 'CLERVO-QUAL-A.' : prompt.includes('CLERVO-QUAL-B') ? 'CLERVO-QUAL-B.' : stream ? 'CLERVO-STREAM.' : responseFormat === 'json_object' ? '{"nonce":"CLERVO-JSON"}' : 'unexpected';
        return { modelIdentity: 'example-chat-v1', outputText, usage, latencyMs: stream ? 25 : 20 };
      },
      async invalidModelFailsSafely() { return true; },
    },
    ...overrides,
  };
}

test('qualification harness proves exact identity, input dependence, streaming, usage, failure, cost, and terms', async () => {
  const result = await qualifyAiChatRoute(input());
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.checks.map(({ name, status }) => [name, status]), [
    ['authentication', 'passed'], ['exact_identity', 'passed'], ['input_dependence', 'passed'], ['output_shape', 'passed'], ['usage_reporting', 'passed'], ['latency', 'passed'], ['failure_handling', 'passed'], ['cost_ceiling', 'passed'], ['terms', 'passed'], ['streaming', 'passed'], ['structured_output', 'passed'],
  ]);
  assert.equal(result.observed.modelIdentity, 'example-chat-v1');
  assert.equal(result.observed.maximumSupplierCost.amountAtomic, '1000');
  assert.ok(['authentication', 'exact_identity', 'input_dependence', 'latency', 'cost_ceiling'].every((name) => result.checks.find((entry) => entry.name === name)?.evidenceHash?.startsWith('sha256:')));
});

test('missing credentials block without making a provider call', async () => {
  let calls = 0;
  const blocked = await qualifyAiChatRoute(input({ credentialAvailable: false, termsStatus: 'unreviewed', resaleAllowed: false, probe: { complete: async () => { calls += 1; throw new Error('must not run'); }, invalidModelFailsSafely: async () => { calls += 1; return false; } } }));
  assert.equal(blocked.status, 'blocked');
  assert.equal(calls, 0);
  assert.ok(blocked.checks.every(({ status, code }) => status === 'not_run' && code === 'credential_missing'));
  assert.deepEqual(blocked.observed, {});
});

test('identity substitution, latency breach, unsafe failures, and unresolved resale fail closed', async () => {
  const substituted = await qualifyAiChatRoute(input({ probe: { ...input().probe, complete: async (value) => ({ ...(await input().probe.complete(value)), modelIdentity: 'substitute-v1' }) } }));
  assert.equal(substituted.status, 'failed');
  assert.equal(substituted.checks.find(({ name }) => name === 'exact_identity').status, 'failed');
  const unsafe = await qualifyAiChatRoute(input({ maximumLatencyMsP95: 10, termsStatus: 'unreviewed', resaleAllowed: false, probe: { ...input().probe, invalidModelFailsSafely: async () => false } }));
  assert.equal(unsafe.status, 'failed');
  assert.equal(unsafe.checks.find(({ name }) => name === 'latency').status, 'failed');
  assert.equal(unsafe.checks.find(({ name }) => name === 'failure_handling').status, 'failed');
  assert.equal(unsafe.checks.find(({ name }) => name === 'terms').status, 'not_run');
});

test('three independent current targets remain honestly blocked on credentials, live checks, and resale terms', async () => {
  const candidates = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-provider-candidates.v1.json'), 'utf8'));
  assert.deepEqual(candidates.targets.map(({ providerId }) => providerId), ['provider.google_gemini', 'provider.groq', 'provider.cloudflare_workers_ai']);
  assert.equal(new Set(candidates.targets.map(({ supplyFamilyId }) => supplyFamilyId)).size, 3);
  assert.deepEqual(candidates.targets.map(({ exactModelId }) => exactModelId), ['gemini-3.6-flash', 'openai/gpt-oss-120b', '@cf/openai/gpt-oss-120b']);
  assert.ok(candidates.targets.every(({ selectedForQualification, termsStatus, resaleAllowed, qualificationStatus, blockerCodes, requiredSecretNames }) => selectedForQualification && termsStatus === 'unreviewed' && resaleAllowed === false && qualificationStatus === 'blocked' && blockerCodes.includes('credential_missing') && blockerCodes.includes('live_checks_not_run') && requiredSecretNames.length > 0));
  assert.ok(candidates.targets.flatMap(({ documentation }) => documentation).every(({ url }) => /^https:\/(?:\/ai\.google\.dev|\/console\.groq\.com|\/developers\.cloudflare\.com)/u.test(url)));
  assert.deepEqual(candidates.modalTargets.map(({ products }) => products), [['ai.embed'], ['ai.image'], ['ai.speech']]);
  assert.deepEqual(candidates.modalTargets.map(({ exactModelId }) => exactModelId), ['text-embedding-3-large', 'gpt-image-2', 'tts-1']);
  assert.ok(candidates.modalTargets.every(({ providerId, supplyFamilyId, requiredSecretNames, qualificationStatus }) => providerId === 'provider.openai' && supplyFamilyId === 'supply.openai_api' && requiredSecretNames.includes('OPENAI_API_KEY') && qualificationStatus === 'blocked'));
  assert.ok(candidates.modalTargets.flatMap(({ documentation }) => documentation).every(({ url }) => /^https:\/\/developers\.openai\.com\/api\/docs\/models\//u.test(url)));
  assert.equal(candidates.quickAi.status, 'disabled');
  assert.deepEqual(candidates.quickAi.prohibitedIdentities, ['Claude-labelled routes', 'TongKhokr', 'MWAPI']);
});

test('provider candidate schema compiles strictly and remains private', async () => {
  const files = (await readdir(path.join(root, 'packages/contracts/schemas'))).filter((file) => file.endsWith('.schema.json'));
  const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
  for (const file of files) ajv.addSchema(JSON.parse(await readFile(path.join(root, 'packages/contracts/schemas', file), 'utf8')));
  const candidates = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-provider-candidates.v1.json'), 'utf8'));
  const validate = ajv.getSchema('https://api.clervo.dev/schemas/2026-07-29.1/ai-provider-candidates.schema.json');
  assert.equal(validate(candidates), true, ajv.errorsText(validate.errors));
  const visibility = JSON.parse(await readFile(path.join(root, 'packages/catalog/schema-visibility.v1.json'), 'utf8'));
  assert.equal(visibility.schemas.find(({ file }) => file === 'ai-provider-candidates.schema.json')?.visibility, 'internal_control');
});

test('AI outage monitoring emits bounded provider alerts without prompt or credential payloads', () => {
  const monitor = createAiExecutionMonitor();
  monitor.record({ occurredAt: '2026-08-02T00:00:00.000Z', operationId: 'op_01K0AIOUTAGEMONITOR0001', productId: 'ai.chat', outcome: 'routing_rejected', rejectionCodes: ['route_unhealthy', 'circuit_open'] });
  monitor.record({ occurredAt: '2026-08-02T00:00:01.000Z', operationId: 'op_01K0AIOUTAGEMONITOR0002', productId: 'ai.chat', outcome: 'completed', routeId: 'ai.route.example' });
  const snapshot = monitor.snapshot();
  assert.equal(snapshot.logs.length, 2);
  assert.equal(snapshot.metrics.length, 2);
  assert.equal(snapshot.alerts.length, 1);
  assert.equal(snapshot.alerts[0].code, 'dependency.provider_unavailable');
  assert.equal(snapshot.alerts[0].summary, 'Provider dependency is unavailable.');
  assert.equal(JSON.stringify(snapshot).includes('prompt'), false);
  assert.equal(JSON.stringify(snapshot).includes('credential'), false);
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.alerts));
});
