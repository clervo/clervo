import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { verifyAiModelCatalog } from '../../dist/packages/contracts/src/index.js';
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
        const outputText = prompt.includes('CLERVO-QUAL-A') ? 'CLERVO-QUAL-A' : prompt.includes('CLERVO-QUAL-B') ? 'CLERVO-QUAL-B' : stream ? 'CLERVO-STREAM' : responseFormat === 'json_object' ? '{"nonce":"CLERVO-JSON"}' : 'unexpected';
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

test('screened Clervo, Vertex, Deepgram, and Groq routes preserve qualified supply and honest remaining blockers', async () => {
  const candidates = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-provider-candidates.v1.json'), 'utf8'));
  const clervo = candidates.targets.filter(({ providerId }) => providerId === 'provider.clervo_ai_gateway');
  const vertex = candidates.targets.filter(({ providerId }) => providerId === 'provider.google_vertex');
  const groq = candidates.targets.filter(({ providerId }) => providerId === 'provider.groq');
  const independentBlocked = candidates.targets.filter(({ providerId }) => providerId === 'provider.google_gemini');
  const cloudflare = candidates.targets.filter(({ providerId }) => providerId === 'provider.cloudflare_workers_ai');
  assert.deepEqual(clervo.map(({ exactModelId }) => exactModelId), ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']);
  assert.ok(clervo.every(({ requiredConfigurationNames, requiredSecretNames, termsStatus, resaleAllowed, qualificationStatus, blockerCodes }) => requiredConfigurationNames.includes('CLERVO_AI_BASE_URL') && requiredSecretNames.includes('CLERVO_AI_API_KEY') && termsStatus === 'restricted' && resaleAllowed && qualificationStatus === 'passed' && blockerCodes.length === 0));
  assert.deepEqual(vertex.map(({ exactModelId }) => exactModelId), ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash']);
  assert.ok(vertex.every(({ requiredConfigurationNames, requiredSecretNames, termsStatus, resaleAllowed, qualificationStatus, blockerCodes }) => requiredConfigurationNames.includes('GCP_PROJECT') && requiredSecretNames.length === 0 && termsStatus === 'restricted' && resaleAllowed && qualificationStatus === 'passed' && blockerCodes.length === 0));
  assert.deepEqual(groq.map(({ exactModelId }) => exactModelId), ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b']);
  assert.ok(groq.every(({ supplyFamilyId, selectedForQualification, termsStatus, resaleAllowed, qualificationStatus, blockerCodes, requiredSecretNames }) => supplyFamilyId === 'supply.groq' && selectedForQualification && termsStatus === 'restricted' && resaleAllowed && qualificationStatus === 'passed' && blockerCodes.length === 0 && requiredSecretNames.includes('GROQ_API_KEY')));
  assert.deepEqual(independentBlocked.map(({ providerId }) => providerId), ['provider.google_gemini']);
  assert.deepEqual(independentBlocked.map(({ exactModelId }) => exactModelId), ['gemini-3.6-flash']);
  assert.ok(independentBlocked.every(({ selectedForQualification, termsStatus, resaleAllowed, qualificationStatus, blockerCodes, requiredSecretNames }) => selectedForQualification && termsStatus === 'unreviewed' && resaleAllowed === false && qualificationStatus === 'blocked' && blockerCodes.includes('credential_missing') && blockerCodes.includes('live_checks_not_run') && requiredSecretNames.length > 0));
  assert.deepEqual(cloudflare.map(({ exactModelId }) => exactModelId), ['@cf/openai/gpt-oss-120b']);
  assert.ok(cloudflare.every(({ supplyFamilyId, selectedForQualification, termsStatus, resaleAllowed, qualificationStatus, blockerCodes, requiredSecretNames }) => supplyFamilyId === 'supply.cloudflare_workers_ai' && selectedForQualification && termsStatus === 'restricted' && resaleAllowed && qualificationStatus === 'blocked' && blockerCodes.length === 1 && blockerCodes.includes('live_checks_not_run') && requiredSecretNames.includes('CLOUDFLARE_API_TOKEN')));
  assert.ok([...groq, ...independentBlocked, ...cloudflare].flatMap(({ documentation }) => documentation).every(({ url }) => /^https:\/(?:\/ai\.google\.dev|\/console\.groq\.com|\/developers\.cloudflare\.com|\/www\.cloudflare\.com)/u.test(url)));
  const vertexImages = candidates.modalTargets.filter(({ providerId, products }) => providerId === 'provider.google_vertex' && products.includes('ai.image'));
  const vertexEmbedding = candidates.modalTargets.filter(({ providerId, products }) => providerId === 'provider.google_vertex' && products.includes('ai.embed'));
  const deepgramSpeech = candidates.modalTargets.filter(({ providerId }) => providerId === 'provider.deepgram');
  const blockedModal = candidates.modalTargets.filter(({ providerId }) => providerId === 'provider.openai');
  assert.deepEqual(vertexImages.map(({ exactModelId }) => exactModelId), ['gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image']);
  assert.ok(vertexImages.every(({ products, requiredSecretNames, qualificationStatus, blockerCodes }) => products[0] === 'ai.image' && requiredSecretNames.length === 0 && qualificationStatus === 'passed' && blockerCodes.length === 0));
  assert.deepEqual(vertexEmbedding.map(({ exactModelId }) => exactModelId), ['gemini-embedding-001']);
  assert.ok(vertexEmbedding.every(({ requiredConfigurationNames, requiredSecretNames, qualificationStatus, blockerCodes }) => requiredConfigurationNames.includes('GCP_PROJECT') && requiredSecretNames.length === 0 && qualificationStatus === 'passed' && blockerCodes.length === 0));
  assert.deepEqual(deepgramSpeech.map(({ exactModelId }) => exactModelId), ['aura-2-thalia-en', 'aura-2-arcas-en']);
  assert.ok(deepgramSpeech.every(({ products, requiredSecretNames, termsStatus, resaleAllowed, qualificationStatus, blockerCodes }) => products[0] === 'ai.speech' && requiredSecretNames.includes('DEEPGRAM_API_KEY') && termsStatus === 'restricted' && resaleAllowed && qualificationStatus === 'passed' && blockerCodes.length === 0));
  assert.deepEqual(blockedModal.map(({ products }) => products), [['ai.embed'], ['ai.image'], ['ai.speech']]);
  assert.deepEqual(blockedModal.map(({ exactModelId }) => exactModelId), ['text-embedding-3-large', 'gpt-image-2', 'tts-1']);
  assert.ok(blockedModal.every(({ providerId, supplyFamilyId, requiredSecretNames, qualificationStatus }) => providerId === 'provider.openai' && supplyFamilyId === 'supply.openai_api' && requiredSecretNames.includes('OPENAI_API_KEY') && qualificationStatus === 'blocked'));
  assert.ok(blockedModal.flatMap(({ documentation }) => documentation).every(({ url }) => /^https:\/\/developers\.openai\.com\/api\/docs\/models\//u.test(url)));
  assert.equal(candidates.quickAi.status, 'disabled');
  assert.deepEqual(candidates.quickAi.prohibitedIdentities, ['Claude-labelled routes', 'TongKhokr', 'MWAPI']);
});

test('live Clervo, Vertex, Deepgram, and Groq exact routes form a valid qualified and sellable internal model catalog', async () => {
  const catalog = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-model-catalog.v1.json'), 'utf8'));
  assert.equal(verifyAiModelCatalog(catalog), true);
  assert.equal(catalog.routes.length, 15);
  assert.ok(catalog.routes.every(({ qualification }) => qualification.status === 'passed'));
  assert.deepEqual(catalog.qualifiedSupplyFamilies, ['supply.clervo_ai_gateway', 'supply.deepgram', 'supply.google_vertex', 'supply.groq']);
  const gatewayPricing = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-launch-pricing.v1.json'), 'utf8'));
  const fundedPricing = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-credit-backed-pricing.v1.json'), 'utf8'));
  const speechPricing = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-speech-pricing.v1.json'), 'utf8'));
  const freeTierPricing = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-free-tier-pricing.v1.json'), 'utf8'));
  const sellable = new Set([...gatewayPricing.routes, ...fundedPricing.chatRoutes, ...fundedPricing.embeddingRoutes, ...fundedPricing.imageRoutes, ...speechPricing.speechRoutes, ...freeTierPricing.assets].filter(({ listingStatus }) => ['sellable', 'sellable_preview'].includes(listingStatus)).map(({ modelId }) => modelId));
  assert.ok(catalog.routes.every(({ exactModelId }) => sellable.has(exactModelId)));
  assert.equal(freeTierPricing.assets.length, 15);
  assert.ok(freeTierPricing.assets.every(({ customerPrice }) => customerPrice.input > 0 && customerPrice.output > 0));
  assert.equal(freeTierPricing.policy.unknownSupplierDebitBlocksPricing, false);
  assert.equal(freeTierPricing.policy.unknownSupplierDebitBlocksSale, false);
});

test('provider candidate and complete redacted supply inventories compile strictly and remain private', async () => {
  const files = (await readdir(path.join(root, 'packages/contracts/schemas'))).filter((file) => file.endsWith('.schema.json'));
  const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
  for (const file of files) ajv.addSchema(JSON.parse(await readFile(path.join(root, 'packages/contracts/schemas', file), 'utf8')));
  const candidates = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-provider-candidates.v1.json'), 'utf8'));
  const validate = ajv.getSchema('https://api.clervo.dev/schemas/2026-07-29.1/ai-provider-candidates.schema.json');
  assert.equal(validate(candidates), true, ajv.errorsText(validate.errors));
  const inventory = JSON.parse(await readFile(path.join(root, 'packages/catalog/external-supply-inventory.v1.json'), 'utf8'));
  const validateInventory = ajv.getSchema('https://api.clervo.dev/schemas/2026-07-29.1/external-supply-inventory.schema.json');
  assert.equal(validateInventory(inventory), true, ajv.errorsText(validateInventory.errors));
  assert.equal(inventory.source.uniqueSourceNames, 217);
  assert.equal(inventory.services.length, 28);
  assert.deepEqual(inventory.services.filter(({ category }) => ['storage', 'identity', 'notification', 'publishing', 'source_control'].includes(category)).map(({ serviceId }) => serviceId), ['supply.cloudflare_r2', 'supply.github_source', 'supply.gitlab_source', 'supply.devto', 'supply.hashnode', 'supply.telegram', 'supply.workos']);
  const audit = JSON.parse(await readFile(path.join(root, 'docs/evidence/supply-foundation/environment-name-audit.v1.json'), 'utf8'));
  const validateAudit = ajv.getSchema('https://api.clervo.dev/schemas/2026-07-29.1/supply-environment-name-audit.schema.json');
  assert.equal(validateAudit(audit), true, ajv.errorsText(validateAudit.errors));
  assert.deepEqual(audit.source, { manifestCount: 2, lineCount: 466, assignmentCount: 219, uniqueNameCount: 219, valuesRecorded: false });
  assert.equal(audit.counts.unmapped, 0);
  assert.equal(audit.rows.length, 219);
  assert.deepEqual(audit.rows.filter(({ serviceId }) => serviceId === 'supply.clervo_ai_gateway').map(({ environmentName }) => environmentName), ['CLERVO_AI_API_KEY', 'CLERVO_AI_BASE_URL']);
  const visibility = JSON.parse(await readFile(path.join(root, 'packages/catalog/schema-visibility.v1.json'), 'utf8'));
  assert.equal(visibility.schemas.find(({ file }) => file === 'ai-provider-candidates.schema.json')?.visibility, 'internal_control');
  assert.equal(visibility.schemas.find(({ file }) => file === 'supply-environment-name-audit.schema.json')?.visibility, 'internal_control');
});

test('Clervo gateway screen preserves the bounded live result without overstating quality or cost', async () => {
  const evidence = JSON.parse(await readFile(path.join(root, 'docs/evidence/stage6/clervo-gateway-screen.v1.json'), 'utf8'));
  assert.equal(evidence.screen.externalCalls, 38);
  assert.equal(evidence.screen.ownerCashSpentUsd, 0);
  assert.equal(evidence.screen.supplierBalanceDebitKnown, false);
  assert.equal(evidence.screen.secretValuesRecorded, false);
  assert.equal(evidence.screen.promptOrOutputPayloadsRecorded, false);
  assert.ok(evidence.screen.models.every(({ authentication, responseLabelMatchesRequestedModel, inputDependence, usageReporting, structuredOutput, streaming }) => authentication && responseLabelMatchesRequestedModel && inputDependence && usageReporting && structuredOutput && streaming));
  assert.deepEqual(evidence.screen.aliasResolution, { 'clervo/fast': 'gpt-5.6-luna', 'clervo/smart': 'gpt-5.6-terra', 'clervo/code': 'gpt-5.6-sol', 'clervo/deep': 'gpt-5.6-sol' });
  assert.equal(evidence.screen.invalidModel.rejectedSafely, true);
  assert.equal(evidence.limits.qualityBenchmark, 'not_run');
  assert.equal(evidence.limits.supplierCost, 'unknown');
  assert.equal(evidence.decision, 'screen_passed_deep_benchmark_and_supplier_cost_pending');
});

test('Groq screen preserves all discovered priced assets, repaired benchmarks, terms restrictions, and sellable qualification truth', async () => {
  const evidence = JSON.parse(await readFile(path.join(root, 'docs/evidence/stage6/groq-supply-screen.v1.json'), 'utf8'));
  assert.equal(evidence.source.externalCalls, 182);
  assert.equal(evidence.source.ownerCashSpentUsd, 0);
  assert.equal(evidence.source.secretValuesRecorded, false);
  assert.equal(evidence.discovery.activeModelCount, 15);
  assert.equal(evidence.discovery.models.length, 15);
  assert.equal(evidence.benchmark.initialRun.preservedAs, 'rate_limit_and_configuration_failure_evidence');
  assert.ok(evidence.benchmark.reasoningAwareRun.models.every(({ passed, total }) => passed === 10 && total === 10));
  assert.ok(evidence.qualification.models.every(({ status, checksPassed, checksTotal }) => status === 'passed' && checksPassed === 11 && checksTotal === 11));
  assert.equal(evidence.terms.rawCloudServiceResaleAllowed, false);
  assert.equal(evidence.terms.multiAccountLimitBypassAllowed, false);
  assert.equal(evidence.commercialDecision.allDiscoveredAssetsPriced, true);
  assert.equal(evidence.commercialDecision.unknownSupplierDebitBlocksPricing, false);
});

test('edge free-allocation catalog prices every authenticated asset and blocks paid-plan entries without owner cash', async () => {
  const pricing = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-edge-free-pricing.v1.json'), 'utf8'));
  assert.equal(pricing.discovery.modelCount, 61);
  assert.equal(pricing.discovery.externalCalls, 2);
  assert.equal(pricing.discovery.ownerCashSpentUsd, 0);
  assert.equal(pricing.freeGuard.dailyNeurons, 10_000);
  assert.equal(pricing.freeGuard.automaticPaidOverageAllowed, false);
  assert.equal(pricing.assets.length, 61);
  assert.ok(pricing.assets.every(({ customerPrices }) => customerPrices.length > 0 && customerPrices.every(({ price }) => price > 0)));
  assert.equal(pricing.assets.filter(({ supplierPriceKnown }) => !supplierPriceKnown).length, 15);
  assert.deepEqual(pricing.assets.filter(({ accessStatus }) => accessStatus === 'requires_paid_plan').map(({ modelId, listingStatus }) => [modelId, listingStatus]), [
    ['@cf/moonshotai/kimi-k2.6', 'priced_requires_paid_plan'],
    ['@cf/moonshotai/kimi-k2.7-code', 'priced_requires_paid_plan'],
    ['@cf/zai-org/glm-5.2', 'priced_requires_paid_plan'],
  ]);
  assert.ok(pricing.assets.filter(({ accessStatus }) => accessStatus === 'free_allocation_available').every(({ listingStatus }) => listingStatus === 'priced_pending_qualification'));
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
