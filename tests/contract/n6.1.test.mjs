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
  verifyAiModelCatalog,
  verifyAiRouteQualification,
} from '../../dist/packages/contracts/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function checks(extra = [], status = 'passed') {
  return [...aiQualificationCheckNames, ...extra].map((name, index) => ({
    name,
    status,
    evidenceHash: `sha256:${String(index + 1).padStart(64, '0')}`,
  }));
}

function qualification({
  suffix = 'ONE',
  providerId = 'provider.alpha',
  supplyFamilyId = 'supply.alpha_cloud',
  exactModelId = 'alpha-chat-v1',
  productIds = ['ai.chat'],
  capabilities = ['text_input', 'text_output'],
  termsStatus = 'approved',
  resaleAllowed = true,
  checkStatus = 'passed',
} = {}) {
  return createAiRouteQualification({
    qualificationId: `aiqual_01K0AI${suffix}QUALIFICATION01`,
    routeId: `ai.route.${suffix.toLowerCase()}`,
    providerId,
    supplyFamilyId,
    exactModelId,
    productIds,
    checkedAt: '2026-08-01T23:30:00.000Z',
    expiresAt: '2026-08-08T23:30:00.000Z',
    termsStatus,
    resaleAllowed,
    checks: checks([
      ...(capabilities.includes('streaming') ? ['streaming'] : []),
      ...(capabilities.includes('structured_output') ? ['structured_output'] : []),
    ], checkStatus),
    observed: checkStatus === 'passed' ? {
      modelIdentity: exactModelId,
      latencyMsP95: 420,
      maximumSupplierCost: { asset: 'USD', amountAtomic: '25', decimals: 6 },
    } : {},
  }, capabilities);
}

function route(options = {}) {
  const capabilities = options.capabilities ?? ['text_input', 'text_output'];
  const value = qualification({ ...options, capabilities });
  return {
    routeId: value.routeId,
    providerId: value.providerId,
    supplyFamilyId: value.supplyFamilyId,
    exactModelId: value.exactModelId,
    productIds: value.productIds,
    capabilities,
    requiredSecretNames: options.requiredSecretNames ?? ['ALPHA_API_KEY'],
    quickAiPremium: options.quickAiPremium ?? false,
    qualification: value,
  };
}

test('AI qualification passes only complete exact-model, terms, usage, and cost evidence', () => {
  const value = qualification({ capabilities: ['text_input', 'text_output', 'streaming', 'structured_output'] });
  assert.equal(value.status, 'passed');
  assert.equal(value.observed.modelIdentity, value.exactModelId);
  assert.equal(verifyAiRouteQualification(value, ['text_input', 'text_output', 'streaming', 'structured_output']), true);
  assert.ok(Object.isFrozen(value) && Object.isFrozen(value.checks) && Object.isFrozen(value.observed.maximumSupplierCost));

  const tampered = structuredClone(value);
  tampered.observed.modelIdentity = 'silent-substitute';
  assert.equal(verifyAiRouteQualification(tampered, ['text_input', 'text_output', 'streaming', 'structured_output']), false);
});

test('missing credentials, unresolved terms, failed checks, and absent cost ceilings stay blocked or failed', () => {
  assert.equal(qualification({ checkStatus: 'not_run', termsStatus: 'unreviewed', resaleAllowed: false }).status, 'blocked');
  assert.equal(qualification({ checkStatus: 'failed' }).status, 'failed');
  assert.throws(() => createAiRouteQualification({
    qualificationId: 'aiqual_01K0AIBADCHECKS0000001', routeId: 'ai.route.bad', providerId: 'provider.bad', supplyFamilyId: 'supply.bad', exactModelId: 'bad-v1', productIds: ['ai.chat'],
    checkedAt: '2026-08-01T23:30:00.000Z', expiresAt: '2026-08-08T23:30:00.000Z', termsStatus: 'approved', resaleAllowed: true,
    checks: checks().slice(1), observed: { modelIdentity: 'bad-v1', maximumSupplierCost: { asset: 'USD', amountAtomic: '0', decimals: 6 } },
  }), /checks_incomplete/u);
});

test('catalog derives independent qualified families and detects tampering', () => {
  const catalog = createAiModelCatalog({
    catalogId: 'aicat_01K0AICATALOG0000000001',
    evaluatedAt: '2026-08-02T00:00:00.000Z',
    routes: [
      route({ suffix: 'BETA', providerId: 'provider.beta', supplyFamilyId: 'supply.beta_edge', exactModelId: 'beta-chat-v2', requiredSecretNames: ['BETA_API_KEY'] }),
      route(),
      route({ suffix: 'BLOCKED', providerId: 'provider.gamma', supplyFamilyId: 'supply.gamma_aggregator', exactModelId: 'gamma-chat-v1', checkStatus: 'not_run', termsStatus: 'unreviewed', resaleAllowed: false, requiredSecretNames: ['GAMMA_API_KEY'] }),
    ],
  });
  assert.deepEqual(catalog.routes.map(({ routeId }) => routeId), ['ai.route.beta', 'ai.route.blocked', 'ai.route.one']);
  assert.deepEqual(catalog.qualifiedSupplyFamilies, ['supply.alpha_cloud', 'supply.beta_edge']);
  assert.equal(verifyAiModelCatalog(catalog), true);
  const tampered = structuredClone(catalog);
  tampered.qualifiedSupplyFamilies.push('supply.invented');
  assert.equal(verifyAiModelCatalog(tampered), false);
});

test('prohibited identities and non-GPT QuickAI routes cannot enter the catalog', () => {
  assert.throws(() => createAiModelCatalog({ catalogId: 'aicat_01K0AICATALOG0000000002', evaluatedAt: '2026-08-02T00:00:00.000Z', routes: [route({ suffix: 'CLAUDE', exactModelId: 'claude-prohibited' })] }), /route_prohibited/u);
  assert.throws(() => createAiModelCatalog({ catalogId: 'aicat_01K0AICATALOG0000000003', evaluatedAt: '2026-08-02T00:00:00.000Z', routes: [route({ suffix: 'QUICK', providerId: 'provider.quickai', exactModelId: 'generic-premium', quickAiPremium: true })] }), /quickai_route_invalid/u);
});

test('AI catalog schemas compile strictly and the internal control schemas stay private', async () => {
  const schemaDirectory = path.join(root, 'packages/contracts/schemas');
  const schemaFiles = (await readdir(schemaDirectory)).filter((file) => file.endsWith('.schema.json')).sort();
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  for (const file of schemaFiles) ajv.addSchema(JSON.parse(await readFile(path.join(schemaDirectory, file), 'utf8')));
  const catalog = createAiModelCatalog({ catalogId: 'aicat_01K0AICATALOG0000000004', evaluatedAt: '2026-08-02T00:00:00.000Z', routes: [route()] });
  const validate = ajv.getSchema('https://api.clervo.dev/schemas/2026-07-29.1/ai-model-catalog.schema.json');
  assert.equal(validate(catalog), true, ajv.errorsText(validate.errors));
  const visibility = JSON.parse(await readFile(path.join(root, 'packages/catalog/schema-visibility.v1.json'), 'utf8'));
  for (const file of ['ai-model-catalog.schema.json', 'ai-route-qualification.schema.json']) assert.equal(visibility.schemas.find((entry) => entry.file === file)?.visibility, 'internal_control');
  // The wire schemas for the public /v1/ai/execute route are published on
  // purpose; publishing them is what lets a caller construct a request without
  // reading our source. What must never leak is the control plane: supplier
  // identities, route qualifications, and cost structure. This assertion used
  // to forbid every ai-* file from the public directory, which made publishing
  // the public route's own contract a build failure.
  const publicFiles = await readdir(path.join(root, 'generated/public/schemas/2026-07-29.1'));
  const internalControl = new Set(visibility.schemas.filter(({ visibility: value }) => value === 'internal_control').map(({ file }) => file));
  for (const file of publicFiles) assert.equal(internalControl.has(file), false, `internal control schema published: ${file}`);
});
