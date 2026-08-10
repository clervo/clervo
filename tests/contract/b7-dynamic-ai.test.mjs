import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AI_CUSTOMER_IDENTITY_REGISTRY_SCHEMA_VERSION,
  QUALIFIED_AI_SUPPLY_CATALOG_SCHEMA_VERSION,
  assignAiCustomerIdentities,
  createAiExecutionRequest,
  normalizeAiHttpRequest,
  parseAiCustomerIdentityRegistry,
  parseQualifiedAiSupplyCatalog,
} from '../../dist/packages/contracts/src/index.js';
import {
  AuthenticatedQualifiedAiSupplyCatalogSource,
  InMemoryQualifiedAiSupplyRevisionStateStore,
  RevisionGuardedQualifiedAiSupplyCatalogSource,
  StaticQualifiedAiSupplyCatalogSource,
} from '../../dist/services/ai/src/catalog-source.js';
import {
  composeAiProductCatalog,
  createAiPublicDiscoveryProjection,
  createAiPublicModelList,
} from '../../dist/services/ai/src/product-catalog.js';
import { ClervoAiGatewayAdapter } from '../../dist/adapters/ai/src/clervo-ai-gateway.js';
import { executeAiOperation } from '../../dist/services/ai/src/execution.js';
import { authorizeAiFreeTierRequest, InMemoryAiFreeTierQuotaStore, PostgresAiFreeTierQuotaStore } from '../../dist/services/ai/src/free-tier.js';
import { createAiProductRuntimeProjection, createDynamicAiPublicPricing } from '../../dist/services/ai/src/product-runtime.js';
import { createDynamicAiProductionRuntime } from '../../apps/api/src/ai-dynamic-production-runtime.mjs';

const emptyRegistry = {
  schemaVersion: AI_CUSTOMER_IDENTITY_REGISTRY_SCHEMA_VERSION,
  revision: 'aiid_empty_v1',
  entries: [],
};

const zeroPricing = {
  currency: 'USD', decimals: 6,
  inputTokenMicrosPerMillion: 0,
  cachedInputTokenMicrosPerMillion: 0,
  outputTokenMicrosPerMillion: 0,
  reasoningTokenMicrosPerMillion: 0,
  imageMicrosEach: 0,
  audioMicrosPerThousandCharacters: 0,
};

function prices(input, output = input) {
  return { ...zeroPricing, inputTokenMicrosPerMillion: input, cachedInputTokenMicrosPerMillion: input, outputTokenMicrosPerMillion: output };
}

function model(overrides = {}) {
  return {
    gatewaySupplyId: 'aisupply_gateway_model_alpha',
    runtimeModelId: 'runtime/model-alpha',
    marketModelId: 'openai/model-alpha',
    display: { name: 'Model Alpha', description: 'Qualified chat model.' },
    modalities: ['chat'],
    inputTypes: ['text'],
    outputTypes: ['text'],
    capabilities: ['text_input', 'text_output', 'streaming', 'structured_output'],
    limits: { contextTokens: 128000, maximumOutputTokens: 16000 },
    qualification: {
      state: 'qualified',
      checkedAt: '2026-08-09T10:00:00.000Z',
      expiresAt: '2026-08-12T10:00:00.000Z',
      evidenceRef: 'evidence://qualification/model-alpha',
    },
    availability: { state: 'available', reason: null, observedAt: '2026-08-09T10:00:00.000Z' },
    upstreamCost: {
      state: 'known', pricing: prices(2_000_000, 10_000_000), authorityRef: 'cost://gateway/model-alpha',
      observedAt: '2026-08-09T10:00:00.000Z', validUntil: '2026-08-12T10:00:00.000Z',
    },
    quality: { score: 0.9, evidenceRef: 'evidence://quality/model-alpha' },
    ...overrides,
  };
}

function snapshot(models, overrides = {}) {
  return {
    schemaVersion: QUALIFIED_AI_SUPPLY_CATALOG_SCHEMA_VERSION,
    catalogRevision: 'gateway:2026-08-09:revision-a',
    generatedAt: '2026-08-09T10:05:00.000Z',
    sourceObservedAt: '2026-08-09T10:00:00.000Z',
    validUntil: '2026-08-10T10:05:00.000Z',
    models,
    ...overrides,
  };
}

const policies = {
  revision: 'pricing:2026-08-09:revision-a',
  observedAt: '2026-08-09T09:00:00.000Z',
  validUntil: '2026-08-15T09:00:00.000Z',
  defaultPolicy: { policyId: 'default_sustainable', minimumMarginBasisPoints: 1000, targetMarginBasisPoints: 2500, competitorUndercutBasisPoints: 500 },
  modalityPolicies: {
    chat: { policyId: 'chat_competitive', minimumMarginBasisPoints: 500, targetMarginBasisPoints: 800, competitorUndercutBasisPoints: 500 },
    embedding: { policyId: 'embedding_growth', minimumMarginBasisPoints: 1500, targetMarginBasisPoints: 3000, competitorUndercutBasisPoints: 1000 },
  },
};

const competitor = {
  competitor: 'Evidence Gateway',
  marketModelId: 'openai/model-alpha',
  pricing: prices(5_000_000, 30_000_000),
  source: 'https://example.com/api/models',
  observedAt: '2026-08-09T09:30:00.000Z',
  validUntil: '2026-08-10T09:30:00.000Z',
  confidence: 'verified',
};

function permission(gatewaySupplyId, state = 'approved') {
  return {
    gatewaySupplyId, state,
    ownerDecisionRef: state === 'approved' ? `owner://decision/${gatewaySupplyId}` : null,
    observedAt: '2026-08-09T09:00:00.000Z',
    validUntil: '2026-09-09T09:00:00.000Z',
  };
}

function compose(supply, registry = emptyRegistry, extra = {}) {
  return composeAiProductCatalog({
    supplyCatalog: parseQualifiedAiSupplyCatalog(supply),
    identityRegistry: parseAiCustomerIdentityRegistry(registry),
    pricingPolicies: policies,
    composedAt: '2026-08-09T10:30:00.000Z',
    ...extra,
  });
}

test('qualified supply revisions add models without source changes and preserve customer identities', () => {
  const alpha = model();
  const beta = model({
    gatewaySupplyId: 'aisupply_gateway_embedding_beta', runtimeModelId: 'runtime/embedding-beta', marketModelId: 'market/embedding-beta',
    display: { name: 'Embedding Beta' }, modalities: ['embedding'], outputTypes: ['embedding'],
    capabilities: ['text_input', 'embedding_output'], limits: { contextTokens: 8192 },
    upstreamCost: { ...alpha.upstreamCost, pricing: prices(50_000), authorityRef: 'cost://gateway/embedding-beta' },
  });
  const revisionA = snapshot([alpha], { catalogRevision: 'gateway:2026-08-09:revision-a' });
  const composedA = compose(revisionA, emptyRegistry, { commercialPermissions: [permission(alpha.gatewaySupplyId)], competitorEvidence: [competitor] });
  const alphaId = composedA.internalModels[0].identity.customerModelId;

  const revisionB = snapshot([alpha, beta], { catalogRevision: 'gateway:2026-08-09:revision-b' });
  const composedB = compose(revisionB, composedA.identityRegistry, { commercialPermissions: [permission(alpha.gatewaySupplyId), permission(beta.gatewaySupplyId)], competitorEvidence: [competitor] });
  assert.equal(composedB.internalModels.length, 2);
  assert.equal(composedB.internalModels.find(({ supply }) => supply.gatewaySupplyId === alpha.gatewaySupplyId).identity.customerModelId, alphaId);
  assert.match(composedB.internalModels.find(({ supply }) => supply.gatewaySupplyId === beta.gatewaySupplyId).identity.customerModelId, /^clervo\/embed-[a-f0-9]{10}$/u);
  assert.equal(composedB.publicModels.length, 2);
  assert.equal(createAiPublicDiscoveryProjection(composedA).inventory.catalogued, 1);
  assert.equal(createAiPublicDiscoveryProjection(composedB).inventory.catalogued, 2);
  assert.equal(createAiPublicModelList(composedB).data.some(({ id }) => id === composedB.internalModels.find(({ supply }) => supply.gatewaySupplyId === beta.gatewaySupplyId).identity.customerModelId), true);
  assert.notEqual(composedB.internalModels[0].pricing.policyId, composedB.internalModels[1].pricing.policyId);
  assert.notEqual(composedB.internalModels[0].pricing.customerPricing.inputTokenMicrosPerMillion, composedB.internalModels[1].pricing.customerPricing.inputTokenMicrosPerMillion);
});

test('identity assignment is immutable across revisions and retains tombstoned assignments', () => {
  const alpha = parseQualifiedAiSupplyCatalog(snapshot([model()]));
  const assignedA = assignAiCustomerIdentities({ catalog: alpha, registry: parseAiCustomerIdentityRegistry(emptyRegistry), assignedAt: '2026-08-09T10:30:00.000Z' });
  const moved = parseQualifiedAiSupplyCatalog(snapshot([model({ runtimeModelId: 'runtime/model-alpha-new-binding' })], { catalogRevision: 'gateway:2026-08-09:revision-b' }));
  const assignedB = assignAiCustomerIdentities({ catalog: moved, registry: assignedA.registry, assignedAt: '2026-08-09T11:00:00.000Z' });
  assert.equal(assignedB.bySupplyId.get(model().gatewaySupplyId).customerModelId, assignedA.bySupplyId.get(model().gatewaySupplyId).customerModelId);
  const removed = parseQualifiedAiSupplyCatalog(snapshot([], { catalogRevision: 'gateway:2026-08-09:revision-c' }));
  const assignedC = assignAiCustomerIdentities({ catalog: removed, registry: assignedB.registry, assignedAt: '2026-08-09T11:30:00.000Z' });
  assert.equal(assignedC.registry.entries.length, 1);
});

test('equivalent supply changes preserve one customer product identity and provide data-driven fallback', () => {
  const alpha = model();
  const first = compose(snapshot([alpha]), emptyRegistry, { commercialPermissions: [permission(alpha.gatewaySupplyId)] });
  const alternative = model({
    gatewaySupplyId: 'aisupply_gateway_model_alpha_fallback',
    runtimeModelId: 'runtime/model-alpha-fallback',
    display: { name: 'Model Alpha' },
    upstreamCost: { ...alpha.upstreamCost, pricing: prices(1_800_000, 9_000_000), authorityRef: 'cost://gateway/model-alpha-fallback' },
  });
  const redundant = compose(snapshot([alpha, alternative], { catalogRevision: 'gateway:2026-08-09:revision-fallback' }), first.identityRegistry, { commercialPermissions: [permission(alpha.gatewaySupplyId), permission(alternative.gatewaySupplyId)] });
  assert.equal(redundant.internalModels.length, 2);
  assert.equal(new Set(redundant.internalModels.map(({ identity }) => identity.customerModelId)).size, 1);
  assert.equal(redundant.publicModels.length, 1);
  assert.equal(redundant.publicModels[0].publicSellable, true);
  assert.equal(redundant.privateRuntimeBindings.length, 2);
  const projection = createAiProductRuntimeProjection(redundant);
  const dynamicPricing = createDynamicAiPublicPricing(projection);
  const normalized = normalizeAiHttpRequest({ model: redundant.publicModels[0].modelId, input: { kind: 'chat', messages: [{ role: 'user', content: 'fallback selection' }], responseFormat: 'text', stream: false }, maximumOutputTokens: 100 });
  const quote = dynamicPricing.quote({ normalized, operationId: `op_${'f'.repeat(32)}`, now: '2026-08-09T10:30:00.000Z' });
  const selectedBinding = redundant.privateRuntimeBindings.find(({ routeId }) => routeId === quote.decision.selectedRouteId);
  assert.equal(selectedBinding.gatewaySupplyId, alternative.gatewaySupplyId);

  const replacement = compose(snapshot([alternative], { catalogRevision: 'gateway:2026-08-09:revision-replacement' }), redundant.identityRegistry, { commercialPermissions: [permission(alternative.gatewaySupplyId)] });
  assert.equal(replacement.internalModels[0].identity.customerModelId, first.internalModels[0].identity.customerModelId);
  assert.equal(replacement.publicModels[0].modelId, first.publicModels[0].modelId);
});

test('availability, qualification, removal, cost, permission, and stale source truth propagate fail closed', () => {
  const alpha = model();
  const approved = [permission(alpha.gatewaySupplyId)];
  const ready = compose(snapshot([alpha]), emptyRegistry, { commercialPermissions: approved });
  assert.equal(ready.publicModels[0].publicSellable, true);

  const degraded = compose(snapshot([model({ availability: { state: 'degraded', reason: 'elevated_errors', observedAt: '2026-08-09T10:00:00.000Z' } })]), ready.identityRegistry, { commercialPermissions: approved });
  assert.equal(degraded.publicModels[0].lifecycle, 'degraded');
  assert.equal(degraded.publicModels[0].publicSellable, false);

  const pending = compose(snapshot([model({ qualification: { ...alpha.qualification, state: 'pending' } })]), ready.identityRegistry, { commercialPermissions: approved });
  assert.ok(pending.publicModels[0].publicationBlockers.includes('technical_qualification_pending'));

  const expired = compose(snapshot([model({ qualification: { ...alpha.qualification, expiresAt: '2026-08-09T10:20:00.000Z' } })]), ready.identityRegistry, { commercialPermissions: approved });
  assert.ok(expired.publicModels[0].publicationBlockers.includes('technical_qualification_expired'));

  const missingCost = compose(snapshot([model({ upstreamCost: { state: 'unknown', pricing: null, authorityRef: null, observedAt: null, validUntil: null } })]), ready.identityRegistry, { commercialPermissions: approved });
  assert.ok(missingCost.publicModels[0].publicationBlockers.includes('pricing_missing_cost'));

  const staleCost = compose(snapshot([model({ upstreamCost: { ...alpha.upstreamCost, validUntil: '2026-08-09T10:20:00.000Z' } })]), ready.identityRegistry, { commercialPermissions: approved });
  assert.ok(staleCost.publicModels[0].publicationBlockers.includes('pricing_stale_cost'));

  const unresolved = compose(snapshot([alpha]), ready.identityRegistry);
  assert.equal(unresolved.publicModels.length, 0);
  assert.equal(unresolved.internalModels[0].commercialPermission, 'unresolved');
  assert.equal(unresolved.internalModels[0].publicSellable, false);

  const repriced = compose(snapshot([model({ upstreamCost: { ...alpha.upstreamCost, pricing: prices(3_000_000, 15_000_000) } })], { catalogRevision: 'gateway:2026-08-09:revision-cost' }), ready.identityRegistry, { commercialPermissions: approved });
  assert.notDeepEqual(repriced.internalModels[0].pricing.customerPricing, ready.internalModels[0].pricing.customerPricing);

  const removed = compose(snapshot([], { catalogRevision: 'gateway:2026-08-09:revision-removed' }), ready.identityRegistry, { commercialPermissions: approved });
  assert.equal(removed.internalModels.length, 0);
  assert.equal(removed.publicModels.length, 0);
  assert.equal(removed.identityRegistry.entries.length, 1);

  const stale = compose(snapshot([alpha], { validUntil: '2026-08-09T10:20:00.000Z' }), ready.identityRegistry, { commercialPermissions: approved });
  assert.ok(stale.publicModels[0].publicationBlockers.includes('supply_snapshot_stale'));
});

test('catalog validation rejects duplicate supply, conflicting runtime binding, unsupported modality, and secret-bearing fields', () => {
  const alpha = model();
  assert.throws(() => parseQualifiedAiSupplyCatalog(snapshot([alpha, alpha])), /qualified_ai_supply_identity_duplicate/u);
  assert.throws(() => parseQualifiedAiSupplyCatalog(snapshot([alpha, model({ gatewaySupplyId: 'aisupply_gateway_model_beta' })])), /qualified_ai_runtime_binding_conflict/u);
  assert.throws(() => parseQualifiedAiSupplyCatalog(snapshot([model({ modalities: ['unsupported'] })])), /qualified_ai_supply_modalities_invalid/u);
  assert.throws(() => parseQualifiedAiSupplyCatalog(snapshot([model({ upstreamCost: { ...alpha.upstreamCost, pricing: { ...alpha.upstreamCost.pricing, currency: 'EUR' } } })])), /qualified_ai_supply_pricing_currency_invalid/u);
  assert.throws(() => parseQualifiedAiSupplyCatalog(snapshot([{ ...alpha, providerCredential: 'must-not-enter-contract' }])), /qualified_ai_supply_model_additional_property/u);
});

test('pricing uses per-category policies, competitor data, and bounded owner-authorized subsidy only', () => {
  const alpha = model();
  const competitive = compose(snapshot([alpha]), emptyRegistry, { commercialPermissions: [permission(alpha.gatewaySupplyId)], competitorEvidence: [competitor] });
  assert.equal(competitive.internalModels[0].pricing.state, 'ready');
  assert.equal(competitive.internalModels[0].pricing.competitiveComparison, 'undercut');
  assert.ok(['cost_policy', 'competitive_target', 'strategic_override'].includes(competitive.internalModels[0].pricing.method));
  for (const key of ['inputTokenMicrosPerMillion', 'outputTokenMicrosPerMillion']) assert.ok(competitive.internalModels[0].pricing.customerPricing[key] >= competitive.internalModels[0].pricing.upstreamCost[key]);

  const allowedOverride = {
    gatewaySupplyId: alpha.gatewaySupplyId,
    customerPricing: prices(1_900_000, 9_500_000),
    maximumSubsidy: prices(100_000, 500_000),
    ownerAuthorizationRef: 'owner://loss-leader/bounded-alpha', budgetRef: 'budget://alpha-2026-08',
    startsAt: '2026-08-09T10:00:00.000Z', expiresAt: '2026-08-09T11:00:00.000Z',
  };
  const subsidized = compose(snapshot([alpha]), emptyRegistry, { commercialPermissions: [permission(alpha.gatewaySupplyId)], strategicOverrides: [allowedOverride] });
  assert.equal(subsidized.internalModels[0].pricing.method, 'strategic_override');
  assert.ok(subsidized.internalModels[0].pricing.grossMarginBasisPoints.inputTokenMicrosPerMillion < 0);

  const outsideBoundary = { ...allowedOverride, customerPricing: prices(1_700_000, 8_000_000) };
  const rejected = compose(snapshot([alpha]), emptyRegistry, { commercialPermissions: [permission(alpha.gatewaySupplyId)], strategicOverrides: [outsideBoundary] });
  assert.equal(rejected.internalModels[0].pricing.state, 'invalid_strategic_override');
  assert.equal(rejected.internalModels[0].publicSellable, false);

  const freeCompetitor = { ...competitor, pricing: { currency: 'USD', decimals: 6, inputTokenMicrosPerMillion: 0, outputTokenMicrosPerMillion: 0 } };
  const constrained = compose(snapshot([alpha]), emptyRegistry, { commercialPermissions: [permission(alpha.gatewaySupplyId)], competitorEvidence: [freeCompetitor] });
  assert.equal(constrained.internalModels[0].pricing.competitiveComparison, 'cost_constrained');
  assert.ok(constrained.internalModels[0].pricing.customerPricing.inputTokenMicrosPerMillion >= constrained.internalModels[0].pricing.upstreamCost.inputTokenMicrosPerMillion);

  const zeroCost = model({ upstreamCost: { ...alpha.upstreamCost, pricing: zeroPricing } });
  const freeCandidate = compose(snapshot([zeroCost]), emptyRegistry, { commercialPermissions: [permission(zeroCost.gatewaySupplyId)], competitorEvidence: [freeCompetitor] });
  assert.equal(freeCandidate.internalModels[0].pricing.customerPricing.inputTokenMicrosPerMillion, 0);
});

test('zero-cost free chat is bounded per wallet and globally with no paid overage', async () => {
  const free = model({ upstreamCost: { ...model().upstreamCost, pricing: zeroPricing } });
  const catalog = compose(snapshot([free]), emptyRegistry, { commercialPermissions: [permission(free.gatewaySupplyId)] });
  assert.equal(catalog.publicModels[0].customerPricing.inputTokenMicrosPerMillion, 0);
  const store = new InMemoryAiFreeTierQuotaStore();
  const policy = { revision: 'free:fixture-v1', enabled: true, zeroUpstreamCostRequired: true, automaticPaidOverageAllowed: false, perWalletDailyRequests: 2, globalDailyRequests: 3, validUntil: '2026-08-10T00:00:00.000Z' };
  const authorize = (walletSubject) => authorizeAiFreeTierRequest({ catalog, modelId: catalog.publicModels[0].modelId, walletSubject, now: '2026-08-09T10:30:00.000Z', policy, store });
  assert.equal((await authorize('wallet-a')).outcome, 'allowed');
  assert.equal((await authorize('wallet-a')).outcome, 'allowed');
  const walletCap = await authorize('wallet-a');
  assert.equal(walletCap.outcome, 'quota_exceeded');
  assert.equal(walletCap.automaticPaidOverageAllowed, false);
  assert.equal((await authorize('wallet-b')).outcome, 'allowed');
  const globalCap = await authorize('wallet-c');
  assert.equal(globalCap.outcome, 'quota_exceeded');
  assert.equal(globalCap.quota.globalRemaining, 0);

  const paidCatalog = compose(snapshot([model()]), emptyRegistry, { commercialPermissions: [permission(model().gatewaySupplyId)] });
  const notEligible = await authorizeAiFreeTierRequest({ catalog: paidCatalog, modelId: paidCatalog.publicModels[0].modelId, walletSubject: 'wallet-d', now: '2026-08-09T10:30:00.000Z', policy, store: new InMemoryAiFreeTierQuotaStore() });
  assert.equal(notEligible.outcome, 'not_eligible');
});

test('durable free-tier quota uses one atomic global-and-wallet decision and stores no raw wallet identity', async () => {
  const calls = [];
  const store = new PostgresAiFreeTierQuotaStore({ async query(sql, values) { calls.push({ sql, values }); return { rows: [{ allowed: true, subject_count: 0, global_count: 0 }] }; } }, 'b7_test');
  const decision = await store.consume({ subject: 'wallet-sensitive-identity', now: '2026-08-09T10:30:00.000Z', subjectLimit: 2, globalLimit: 3 });
  assert.equal(decision.allowed, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /pg_advisory_xact_lock/u);
  assert.match(calls[0].sql, /__global__/u);
  assert.equal(JSON.stringify(calls[0]).includes('wallet-sensitive-identity'), false);
  assert.match(calls[0].values[2], /^sha256:[a-f0-9]{64}$/u);
  const migration = await readFile(new URL('../../infra/storage/postgres/0008-ai-free-tier-quota.sql', import.meta.url), 'utf8');
  assert.match(migration, /PRIMARY KEY \(environment_namespace, quota_day, subject_hash\)/u);
});

test('public projection excludes supplier identity, runtime binding, upstream cost, and internal routing metadata', () => {
  const alpha = model();
  const composed = compose(snapshot([alpha]), emptyRegistry, { commercialPermissions: [permission(alpha.gatewaySupplyId)] });
  const publicJson = JSON.stringify(composed.publicModels);
  for (const secretName of ['gatewaySupplyId', 'runtimeModelId', 'upstreamCost', 'supplyFamilyId', 'providerId', 'authorityRef', 'ownerDecisionRef']) assert.equal(publicJson.includes(secretName), false);
  assert.equal(publicJson.includes(alpha.gatewaySupplyId), false);
  assert.equal(publicJson.includes(alpha.runtimeModelId), false);
  assert.equal(composed.privateRuntimeBindings[0].runtimeModelId, alpha.runtimeModelId);
});

test('generated public model discovery omits legacy supplier family and raw route identifiers', async () => {
  const generated = JSON.parse(await readFile(new URL('../../generated/public/models.json', import.meta.url), 'utf8'));
  assert.ok(generated.data.length > 0);
  for (const entry of generated.data) {
    assert.equal(Object.hasOwn(entry.clervo, 'supplyFamilyId'), false);
    assert.equal(Object.hasOwn(entry.clervo, 'routeId'), false);
  }
});

test('B7 exact-market token prices use atomic micro-USD per million tokens', async () => {
  const pricing = JSON.parse(await readFile(new URL('../../packages/catalog/ai-b7-commercial-pricing.v1.json', import.meta.url), 'utf8'));
  const opus = pricing.models.find(({ modelId }) => modelId === 'clervo/claude-opus-4-6');
  assert.equal(opus.customerPricing.inputTokenMicrosPerMillion, 2_500_000);
  assert.equal(opus.customerPricing.outputTokenMicrosPerMillion, 12_500_000);
});

test('static and authenticated catalog sources validate snapshots and keep credentials out of the contract', async () => {
  const catalog = snapshot([model()]);
  const staticSource = new StaticQualifiedAiSupplyCatalogSource(catalog);
  assert.equal((await staticSource.load()).catalogRevision, catalog.catalogRevision);
  let observedAuthorization;
  const source = new AuthenticatedQualifiedAiSupplyCatalogSource({
    endpoint: 'https://ai.clervo.dev/internal/catalog', allowedHosts: ['ai.clervo.dev'], credential: async () => 'catalog-test-token',
    fetcher: async (_url, init) => {
      observedAuthorization = init.headers.authorization;
      return new Response(JSON.stringify(catalog), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal((await source.load()).models.length, 1);
  assert.equal(observedAuthorization, 'Bearer catalog-test-token');
  assert.equal(JSON.stringify(await source.load()).includes('catalog-test-token'), false);
  assert.throws(() => new AuthenticatedQualifiedAiSupplyCatalogSource({ endpoint: 'http://ai.clervo.dev/internal/catalog', allowedHosts: ['ai.clervo.dev'], credential: async () => 'catalog-test-token' }), /endpoint_invalid/u);
});

test('revision guard accepts forward snapshots and rejects rollback or same-revision equivocation', async () => {
  const revisionA = parseQualifiedAiSupplyCatalog(snapshot([model()], { catalogRevision: 'gateway:2026-08-09:revision-a' }));
  const revisionB = parseQualifiedAiSupplyCatalog(snapshot([model()], { catalogRevision: 'gateway:2026-08-09:revision-b', generatedAt: '2026-08-09T10:10:00.000Z' }));
  const queue = [revisionA, revisionB, revisionA];
  const guarded = new RevisionGuardedQualifiedAiSupplyCatalogSource({ async load() { return queue.shift(); } }, new InMemoryQualifiedAiSupplyRevisionStateStore());
  assert.equal((await guarded.load()).catalogRevision, revisionA.catalogRevision);
  assert.equal((await guarded.load()).catalogRevision, revisionB.catalogRevision);
  await assert.rejects(guarded.load(), /revision_rollback/u);

  const equivocationQueue = [revisionA, parseQualifiedAiSupplyCatalog(snapshot([model({ display: { name: 'Changed under same revision' } })], { catalogRevision: revisionA.catalogRevision }))];
  const equivocationGuard = new RevisionGuardedQualifiedAiSupplyCatalogSource({ async load() { return equivocationQueue.shift(); } }, new InMemoryQualifiedAiSupplyRevisionStateStore());
  await equivocationGuard.load();
  await assert.rejects(equivocationGuard.load(), /revision_equivocation/u);
});

test('one generic gateway adapter executes different catalog bindings without provider or model adapters', async () => {
  const calls = [];
  const transport = {
    async request(input) {
      const request = JSON.parse(new TextDecoder().decode(input.body));
      calls.push(request.model);
      return {
        status: 200, contentType: 'application/json',
        body: new TextEncoder().encode(JSON.stringify({ model: request.model, choices: [{ message: { content: `response:${request.model}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })),
      };
    },
  };
  const adapter = new ClervoAiGatewayAdapter({
    config: { baseUrl: 'https://ai.clervo.dev/v1/', allowedHosts: ['ai.clervo.dev'], secretName: 'CLERVO_AI_GATEWAY_TOKEN', maximumResponseBytes: 100000 },
    transport, secret: async () => 'gateway-test-token', clock: () => '2026-08-09T10:31:00.000Z',
  });
  const request = {
    contractVersion: '2026-07-29.1', schemaVersion: 'ai-execution-request.v1', operationId: 'op_0123456789ABCDEFGHIJ', productId: 'ai.chat', requestedModel: 'clervo/chat-test',
    input: { kind: 'chat', messages: [{ role: 'user', content: 'hi' }], stream: false, responseFormat: 'text' },
    usageBounds: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, reasoningTokens: 0, images: 0, audioCharacters: 0 },
    maximumSupplierCost: { asset: 'USD', amountAtomic: '100', decimals: 6 }, deadlineAt: '2026-08-09T11:00:00.000Z',
  };
  for (const [routeId, runtimeModelId] of [['ai.route.dynamic_aaaaaaaaaaaaaaaaaaaa', 'runtime/model-alpha'], ['ai.route.dynamic_bbbbbbbbbbbbbbbbbbbb', 'runtime/model-beta']]) {
    const result = await adapter.execute({ request, exactModelId: 'clervo/chat-test', routeId, runtimeModelId, signal: new AbortController().signal });
    assert.equal(result.modelIdentity, runtimeModelId);
  }
  assert.deepEqual(calls, ['runtime/model-alpha', 'runtime/model-beta']);
});

test('dynamic production runtime quotes stable customer identity and executes the private gateway binding end to end', async () => {
  const alpha = model();
  const calls = [];
  const fetcher = async (_url, init) => {
    const payload = JSON.parse(new TextDecoder().decode(init.body));
    calls.push(payload.model);
    return new Response(JSON.stringify({ model: payload.model, choices: [{ message: { content: 'Dynamic result.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const runtime = await createDynamicAiProductionRuntime({
    env: { CLERVO_AI_BASE_URL: 'https://ai.clervo.dev/v1/', CLERVO_AI_GATEWAY_TOKEN: 'gateway-runtime-token' },
    fetcher,
    catalogSource: new StaticQualifiedAiSupplyCatalogSource(snapshot([alpha])),
    identityRegistry: emptyRegistry,
    pricingPolicies: policies,
    competitorEvidence: [competitor],
    commercialPermissions: [permission(alpha.gatewaySupplyId)],
    strategicOverrides: [],
    clock: () => '2026-08-09T10:30:00.000Z',
  });
  assert.equal(runtime.supplyAuthority, 'qualified_ai_supply_catalog');
  assert.equal(runtime.adapters.length, 1);
  const customerModelId = runtime.productCatalog.internalModels[0].identity.customerModelId;
  const normalized = normalizeAiHttpRequest({ model: customerModelId, input: { kind: 'chat', messages: [{ role: 'user', content: 'Hello dynamic catalog' }], responseFormat: 'text', stream: false }, maximumOutputTokens: 100 });
  const operationId = `op_${'d'.repeat(32)}`;
  const quote = runtime.publicPricing.quote({ normalized, operationId, now: '2026-08-09T10:30:00.000Z' });
  assert.equal(quote.decision.selectedExactModelId, customerModelId);
  const request = createAiExecutionRequest({ normalized, operationId, maximumSupplierCost: quote.decision.maximumSupplierCost, deadlineAt: '2026-08-09T11:00:00.000Z' });
  const outcome = await executeAiOperation({ request, catalog: quote.catalog, routes: quote.routes, adapters: runtime.adapters, runtimeBindings: quote.runtimeBindings, startedAt: '2026-08-09T10:30:00.000Z', clock: () => Date.parse('2026-08-09T10:30:00.000Z') });
  assert.equal(outcome.outcome, 'completed');
  assert.equal(outcome.result.exactModelId, customerModelId);
  assert.deepEqual(calls, [alpha.runtimeModelId]);
});
