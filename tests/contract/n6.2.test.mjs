import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  aiQualificationCheckNames,
  createAiModelCatalog,
  createAiRouteQualification,
  estimateAiSupplierCost,
  reconcileAiSupplierCost,
  selectAiRoute,
  verifyAiRouteDecision,
} from '../../dist/packages/contracts/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseUsage = { inputTokens: 1000, cachedInputTokens: 100, outputTokens: 500, reasoningTokens: 0, images: 0, audioCharacters: 0 };
const basePricing = { currency: 'USD', decimals: 6, inputTokenMicrosPerMillion: 1_000_000, cachedInputTokenMicrosPerMillion: 100_000, outputTokenMicrosPerMillion: 2_000_000, reasoningTokenMicrosPerMillion: 2_000_000, imageMicrosEach: 10_000, audioMicrosPerThousandCharacters: 2_000 };

function definition({ suffix, family, model, capabilities, products = ['ai.chat'] }) {
  const checks = [...aiQualificationCheckNames, ...(capabilities.includes('streaming') ? ['streaming'] : []), ...(capabilities.includes('structured_output') ? ['structured_output'] : []), ...(capabilities.includes('strict_schema') ? ['strict_schema'] : []), ...(capabilities.includes('tool_calling') ? ['tool_calling'] : []), ...(capabilities.includes('parallel_tool_calling') ? ['parallel_tool_calling'] : [])].map((name) => ({ name, status: 'passed', evidenceHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111' }));
  const qualification = createAiRouteQualification({
    qualificationId: `aiqual_01K0${suffix}QUALIFICATION0001`, routeId: `ai.route.${suffix.toLowerCase()}`, providerId: `provider.${suffix.toLowerCase()}`, supplyFamilyId: family, exactModelId: model, productIds: products,
    checkedAt: '2026-08-01T23:30:00.000Z', expiresAt: '2026-08-08T23:30:00.000Z', termsStatus: 'approved', resaleAllowed: true, checks,
    observed: { modelIdentity: model, latencyMsP95: 500, maximumSupplierCost: { asset: 'USD', amountAtomic: '1000000', decimals: 6 } },
  }, capabilities);
  return { routeId: qualification.routeId, providerId: qualification.providerId, supplyFamilyId: family, exactModelId: model, productIds: products, capabilities, requiredSecretNames: [`${suffix}_API_KEY`], quickAiPremium: false, qualification };
}

function setup() {
  const definitions = [
    definition({ suffix: 'FAST', family: 'supply.edge', model: 'fast-v1', capabilities: ['text_input', 'text_output'] }),
    definition({ suffix: 'SMART', family: 'supply.cloud', model: 'smart-v1', capabilities: ['text_input', 'text_output', 'structured_output'] }),
    definition({ suffix: 'CODE', family: 'supply.aggregator', model: 'code-v1', capabilities: ['text_input', 'text_output', 'structured_output', 'tool_calling'] }),
    definition({ suffix: 'DEEP', family: 'supply.cloud', model: 'deep-v1', capabilities: ['text_input', 'text_output', 'reasoning'] }),
  ];
  const catalog = createAiModelCatalog({ catalogId: 'aicat_01K0AIROUTINGCATALOG01', evaluatedAt: '2026-08-02T00:00:00.000Z', routes: definitions });
  const attributes = {
    'ai.route.fast': { latencyMsP95: 50, qualityScore: 0.6 },
    'ai.route.smart': { latencyMsP95: 400, qualityScore: 0.92 },
    'ai.route.code': { latencyMsP95: 500, qualityScore: 0.90 },
    'ai.route.deep': { latencyMsP95: 900, qualityScore: 0.98 },
  };
  const routes = definitions.map((value) => ({ definition: value, pricing: basePricing, health: 'healthy', circuit: 'closed', ...attributes[value.routeId] }));
  return { catalog, routes };
}

function request(setupValue, requestedModel, overrides = {}) {
  return selectAiRoute({
    ...setupValue,
    operationId: 'op_01K0AIROUTINGDECISION01', productId: 'ai.chat', requestedModel, requiredCapabilities: [], usageBounds: baseUsage,
    maximumSupplierCost: { asset: 'USD', amountAtomic: '100000', decimals: 6 }, decidedAt: '2026-08-02T00:01:00.000Z', ...overrides,
  });
}

test('usage accounting rounds each billed unit up and reconciles under the reservation', () => {
  const estimate = estimateAiSupplierCost(baseUsage, basePricing);
  assert.deepEqual(estimate, { asset: 'USD', amountAtomic: '1910', decimals: 6 });
  const reconciled = reconcileAiSupplierCost({ reservedMaximum: { asset: 'USD', amountAtomic: '2000', decimals: 6 }, usage: baseUsage, pricing: basePricing });
  assert.equal(reconciled.actual.amountAtomic, '1910');
  assert.equal(reconciled.unusedAtomic, '90');
  assert.throws(() => reconcileAiSupplierCost({ reservedMaximum: { asset: 'USD', amountAtomic: '1909', decimals: 6 }, usage: baseUsage, pricing: basePricing }), /exceeds_reservation/u);
  assert.throws(() => estimateAiSupplierCost({ ...baseUsage, cachedInputTokens: 1001 }, basePricing), /cached_input_exceeds/u);
});

test('aliases route deterministically by declared capability, latency, and quality policy', () => {
  const value = setup();
  assert.equal(request(value, 'clervo/fast').selectedRouteId, 'ai.route.fast');
  assert.equal(request(value, 'clervo/smart').selectedRouteId, 'ai.route.smart');
  assert.equal(request(value, 'clervo/code').selectedRouteId, 'ai.route.code');
  assert.equal(request(value, 'clervo/deep').selectedRouteId, 'ai.route.deep');
  assert.equal(verifyAiRouteDecision(request(value, 'clervo/smart')), true);
});

test('an exact route never substitutes while aliases degrade across qualified equivalents', () => {
  const value = setup();
  const routes = value.routes.map((route) => route.definition.routeId === 'ai.route.smart' ? { ...route, health: 'unavailable' } : route);
  const exact = request({ catalog: value.catalog, routes }, 'ai.route.smart');
  assert.equal(exact.outcome, 'rejected');
  assert.deepEqual(exact.rejectionCodes, ['route_unhealthy']);
  assert.equal(exact.selectedRouteId, undefined);
  const alias = request({ catalog: value.catalog, routes }, 'clervo/smart');
  assert.equal(alias.selectedRouteId, 'ai.route.code');
});

test('cost ceilings, circuits, unknown models, and modality aliases fail closed', () => {
  const value = setup();
  assert.deepEqual(request(value, 'missing-model').rejectionCodes, ['model_not_found']);
  assert.deepEqual(request(value, 'ai.route.fast', { maximumSupplierCost: { asset: 'USD', amountAtomic: '1', decimals: 6 } }).rejectionCodes, ['cost_ceiling_exceeded']);
  const routes = value.routes.map((route) => route.definition.routeId === 'ai.route.fast' ? { ...route, circuit: 'open' } : route);
  assert.deepEqual(request({ catalog: value.catalog, routes }, 'ai.route.fast').rejectionCodes, ['circuit_open']);
  assert.deepEqual(request(value, 'clervo/fast', { productId: 'ai.embed' }).rejectionCodes, ['alias_product_unsupported']);
});

test('route decisions validate strictly, remain internal, and detect tampering', async () => {
  const decision = request(setup(), 'clervo/code');
  const tampered = structuredClone(decision);
  tampered.selectedExactModelId = 'substitute-v1';
  assert.equal(verifyAiRouteDecision(tampered), false);
  const schemaFiles = (await readdir(path.join(root, 'packages/contracts/schemas'))).filter((file) => file.endsWith('.schema.json'));
  const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
  for (const file of schemaFiles) ajv.addSchema(JSON.parse(await readFile(path.join(root, 'packages/contracts/schemas', file), 'utf8')));
  const validate = ajv.getSchema('https://api.clervo.dev/schemas/2026-07-29.1/ai-route-decision.schema.json');
  assert.equal(validate(decision), true, ajv.errorsText(validate.errors));
  const visibility = JSON.parse(await readFile(path.join(root, 'packages/catalog/schema-visibility.v1.json'), 'utf8'));
  assert.equal(visibility.schemas.find(({ file }) => file === 'ai-route-decision.schema.json')?.visibility, 'internal_control');
});
