import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));

test('external supply inventory is strict, redacted, commercial, and failover-aware', async () => {
  const inventory = await json('packages/catalog/external-supply-inventory.v1.json');
  const schema = await json('packages/contracts/schemas/external-supply-inventory.schema.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(inventory), true, ajv.errorsText(validate.errors));

  assert.equal(inventory.source.valuesIncluded, false);
  assert.equal(inventory.commercialPolicy.ownerCashBudgetUsd, 0);
  assert.equal(inventory.commercialPolicy.customerFreeByDefault, false);
  assert.equal(inventory.commercialPolicy.positiveMarginRequiredAtLaunch, false);
  assert.equal(inventory.commercialPolicy.unknownSupplierCostBlocksSale, false);
  assert.equal(inventory.commercialPolicy.launchPricingPolicy, 'competitive_credit_backed');
  assert.equal(inventory.commercialPolicy.budgetRunwayRequired, true);
  assert.equal(inventory.commercialPolicy.providerNamesPublic, false);
  assert.equal(inventory.commercialPolicy.silentQualityDowngradeAllowed, false);
  assert.equal(new Set(inventory.services.map(({ serviceId }) => serviceId)).size, inventory.services.length);
  assert.deepEqual(inventory.services.filter(({ qualificationStatus }) => qualificationStatus === 'passed').map(({ serviceId }) => serviceId), ['supply.clervo_ai_gateway', 'supply.deepgram', 'supply.google_vertex', 'supply.groq', 'supply.serper']);

  const clervo = inventory.services.find(({ serviceId }) => serviceId === 'supply.clervo_ai_gateway');
  assert.equal(clervo.connectionStatus, 'observed_working');
  assert.equal(clervo.credentialDeployment, 'current_environment');
  assert.equal(clervo.configuredCredentialSlots, 1);
  assert.deepEqual(clervo.knownModelNames, ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']);

  const vertex = inventory.services.find(({ serviceId }) => serviceId === 'supply.google_vertex');
  assert.equal(vertex.connectionStatus, 'observed_working');
  assert.equal(vertex.qualificationStatus, 'passed');
  assert.ok(vertex.knownModelNames.includes('gemini-3.6-flash') && vertex.knownModelNames.includes('veo-3.1-fast-generate-001'));

  const deepgram = inventory.services.find(({ serviceId }) => serviceId === 'supply.deepgram');
  assert.equal(deepgram.connectionStatus, 'observed_working');
  assert.equal(deepgram.qualificationStatus, 'passed');
  assert.deepEqual(deepgram.knownModelNames, ['aura-2-thalia-en', 'aura-2-arcas-en', 'nova-3']);
  assert.equal(inventory.creditPools.find(({ serviceId }) => serviceId === 'supply.deepgram').automaticTopUpStatus, 'disabled');
  assert.equal(inventory.ownerInputs.some(({ inputId }) => inputId === 'confirm_deepgram_billing_guard'), false);

  const gateway = inventory.services.find(({ serviceId }) => serviceId === 'supply.hcnsec_gateway');
  assert.equal(gateway.configuredCredentialSlots, 20);
  assert.equal(gateway.alternateCredentialSlots, 20);
  assert.equal(gateway.credentialDeployment, 'legacy_import_read_only');
  assert.equal(gateway.connectionStatus, 'observed_working');
  assert.equal(gateway.qualificationStatus, 'failed');
  assert.equal(gateway.knownModelNames.length, 21);

  assert.deepEqual(inventory.services.filter(({ serviceId }) => ['supply.cerebras', 'supply.cohere', 'supply.mistral', 'supply.nvidia', 'supply.openrouter', 'supply.sambanova', 'supply.siliconflow', 'supply.zai'].includes(serviceId)).map(({ serviceId, connectionStatus, knownModelNames }) => [serviceId, connectionStatus, knownModelNames.length]), [
    ['supply.cerebras', 'observed_working', 3],
    ['supply.cohere', 'observed_working', 31],
    ['supply.mistral', 'observed_working', 52],
    ['supply.nvidia', 'observed_working', 102],
    ['supply.openrouter', 'observed_working', 337],
    ['supply.sambanova', 'observed_working', 6],
    ['supply.siliconflow', 'observed_working', 73],
    ['supply.zai', 'observed_working', 8],
  ]);
  assert.equal(inventory.services.find(({ serviceId }) => serviceId === 'supply.cerebras').qualificationStatus, 'failed');
  const nvidia = inventory.services.find(({ serviceId }) => serviceId === 'supply.nvidia');
  assert.equal(nvidia.qualificationStatus, 'failed');
  assert.equal(nvidia.termsStatus, 'blocked');
  assert.equal(nvidia.resaleStatus, 'prohibited');
  assert.deepEqual(inventory.services.filter(({ serviceId }) => ['supply.google_gemini', 'supply.github_models'].includes(serviceId)).map(({ serviceId, connectionStatus }) => [serviceId, connectionStatus]), [
    ['supply.google_gemini', 'observed_failed'],
  ]);

  assert.deepEqual(inventory.retiredServices.map(({ serviceId }) => serviceId), ['supply.quickai', 'supply.tongkhokr', 'supply.github_models']);
  assert.ok(inventory.retiredServices.every(({ connectionStatus, resaleStatus }) => connectionStatus === 'retired' && resaleStatus === 'prohibited'));
  assert.deepEqual(inventory.creditPools.map(({ serviceId, reportedAmount }) => [serviceId, reportedAmount]), [
    ['supply.google_vertex', 1700],
    ['supply.deepgram', 200],
    ['supply.hcnsec_gateway', null],
  ]);

  const serialized = JSON.stringify(inventory);
  assert.equal(/(?:sk-|ghp_|AIza|Bearer\s|-----BEGIN|api[_-]?key["']?\s*:\s*["'][^"']+)/iu.test(serialized), false);
});

test('owned search supply is measured, customer-priced, and single-account bounded', async () => {
  const pricing = await json('packages/catalog/search-supply-pricing.v1.json');
  const schema = await json('packages/contracts/schemas/search-supply-pricing.schema.json');
  const evidence = await json('docs/evidence/supply-foundation/serper-qualification.v1.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(pricing), true, ajv.errorsText(validate.errors));
  assert.equal(pricing.routes.length, 1);
  assert.ok(pricing.routes.every(({ customerPriceMicrousd }) => customerPriceMicrousd > 0));
  assert.equal(pricing.routes[0].customerPriceMicrousd, 1000);
  assert.equal(pricing.routes[0].listingStatus, 'qualified_not_integrated');
  assert.equal(pricing.routes[0].fallbackStatus, 'independent_fallback_missing');
  assert.equal(pricing.policy.singleAccountOnly, true);
  assert.equal(evidence.externalCalls, 5);
  assert.equal(evidence.ownerCashSpentUsd, 0);
  assert.deepEqual(evidence.summary, {
    successfulCalls: 5,
    expectedHostHits: 5,
    expectedHostTopThreeHits: 5,
    latencyMsP50: 680,
    latencyMsP95: 765,
    resultCountMinimum: 10,
    qualityGrade: 'good',
  });
  assert.ok(evidence.observations.every(({ status, expectedHostRank }) => status === 200 && expectedHostRank === 1));
  assert.equal(evidence.terms.valueAddedApplicationAllowed, true);
  assert.equal(evidence.terms.multipleAccountsAllowed, false);
});

test('owned Solana RPC is technically healthy and priced while third-party use remains terms-blocked', async () => {
  const inventory = await json('packages/catalog/external-supply-inventory.v1.json');
  const service = inventory.services.find(({ serviceId }) => serviceId === 'supply.helius_rpc');
  const pricing = await json('packages/catalog/rpc-supply-pricing.v1.json');
  const schema = await json('packages/contracts/schemas/rpc-supply-pricing.schema.json');
  const evidence = await json('docs/evidence/supply-foundation/helius-qualification.v1.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(pricing), true, ajv.errorsText(validate.errors));
  assert.deepEqual([service.connectionStatus, service.qualificationStatus, service.termsStatus, service.resaleStatus], ['observed_working', 'failed', 'blocked', 'prohibited']);
  const route = pricing.routes.find(({ serviceId }) => serviceId === 'supply.helius_rpc');
  assert.ok(route.customerPriceMicrousd > 0);
  assert.deepEqual([route.technicalQualificationStatus, route.listingStatus, route.broadcastStatus], ['passed', 'priced_terms_blocked', 'read_only_route']);
  assert.equal(evidence.externalCalls, 4);
  assert.equal(evidence.transactionCalls, 0);
  assert.equal(evidence.signedPayloads, 0);
  assert.equal(evidence.summary.technicalStatus, 'passed');
  assert.equal(evidence.summary.commercialStatus, 'blocked');
  assert.ok(evidence.observations.every(({ status, passed }) => status === 200 && passed));
  assert.equal(evidence.terms.resaleAllowed, false);
  assert.equal(evidence.terms.thirdPartyBenefitAllowed, false);
});

test('public RPC mesh prices every configured route and preserves failures, identity, and safety boundaries', async () => {
  const inventory = await json('packages/catalog/external-supply-inventory.v1.json');
  const service = inventory.services.find(({ serviceId }) => serviceId === 'supply.public_rpc_mesh');
  const pricing = await json('packages/catalog/rpc-supply-pricing.v1.json');
  const evidence = await json('docs/evidence/supply-foundation/public-rpc-mesh-qualification.v1.json');
  const mesh = pricing.routes.filter(({ serviceId }) => serviceId === 'supply.public_rpc_mesh');
  assert.deepEqual([service.connectionStatus, service.qualificationStatus, service.termsStatus], ['observed_working', 'in_progress', 'review_required']);
  assert.equal(evidence.configuredChains, 14);
  assert.equal(evidence.configuredRoutes, 32);
  assert.equal(evidence.externalCalls, 27);
  assert.equal(evidence.transactionCalls, 0);
  assert.equal(evidence.signedPayloads, 0);
  assert.deepEqual(evidence.summary, { passedRoutes: 20, passedChains: 13, exactIdentityRoutes: 17, endpointOnlyIdentityRoutes: 3, batchCapableRoutes: 15 });
  assert.deepEqual(evidence.safety, { httpsOnly: true, credentialsInUrlsAllowed: false, queryStringsAllowed: false, hostAllowlistRequired: true, publicDnsRequired: true, redirectsAllowed: false });
  assert.equal(mesh.length, 32);
  assert.ok(mesh.every(({ customerPriceMicrousd, termsStatus, broadcastStatus }) => customerPriceMicrousd > 0 && termsStatus === 'unreviewed' && broadcastStatus === 'read_only_route'));
  assert.equal(mesh.filter(({ technicalQualificationStatus }) => technicalQualificationStatus === 'passed').length, 20);
  assert.equal(new Set(mesh.filter(({ technicalQualificationStatus }) => technicalQualificationStatus === 'passed').map(({ network }) => network)).size, 13);
  assert.equal(mesh.filter(({ fallbackStatus }) => fallbackStatus === 'independent_fallback_ready').length, 20);
  assert.ok(mesh.filter(({ technicalQualificationStatus }) => technicalQualificationStatus === 'failed').every(({ listingStatus, qualityGrade }) => listingStatus === 'blocked' && qualityGrade === 'rejected'));
});

test('owned blockchain data is technically complete and priced without treating a local-development key as sellable', async () => {
  const inventory = await json('packages/catalog/external-supply-inventory.v1.json');
  const service = inventory.services.find(({ serviceId }) => serviceId === 'supply.zerion');
  const pricing = await json('packages/catalog/blockchain-data-supply-pricing.v1.json');
  const schema = await json('packages/contracts/schemas/blockchain-data-supply-pricing.schema.json');
  const evidence = await json('docs/evidence/supply-foundation/zerion-qualification.v1.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(pricing), true, ajv.errorsText(validate.errors));
  assert.deepEqual([service.connectionStatus, service.qualificationStatus, service.termsStatus, service.resaleStatus], ['observed_working', 'failed', 'blocked', 'prohibited']);
  assert.deepEqual(pricing.routes.map(({ productId }) => productId), ['crypto.wallet', 'crypto.token', 'crypto.transaction', 'crypto.protocol']);
  assert.ok(pricing.routes.every(({ customerPriceMicrousd, technicalQualificationStatus, listingStatus, termsStatus }) => customerPriceMicrousd > 0 && technicalQualificationStatus === 'passed' && listingStatus === 'priced_terms_blocked' && termsStatus === 'blocked'));
  assert.equal(evidence.externalCalls, 5);
  assert.equal(evidence.transactionSubmissionCalls, 0);
  assert.equal(evidence.signedPayloads, 0);
  assert.equal(evidence.summary.technicalStatus, 'passed');
  assert.equal(evidence.summary.productionStatus, 'blocked_free_plan_local_development_only');
  assert.ok(evidence.observations.every(({ status, passed }) => status === 200 && passed));
  assert.deepEqual(evidence.inputPolicy, { customerWalletDataUsed: false, syntheticPublicAddressUsed: true, providerDocumentationExampleAddressUsed: true, responsePayloadValuesRecorded: false });
  assert.equal(evidence.terms.commercialUseOnPaidPlans, true);
  assert.equal(evidence.terms.serviceBureauUseAllowed, false);
});

test('owned object storage is positively priced but fails closed on the legacy endpoint and unknown overage guard', async () => {
  const inventory = await json('packages/catalog/external-supply-inventory.v1.json');
  const service = inventory.services.find(({ serviceId }) => serviceId === 'supply.cloudflare_r2');
  const pricing = await json('packages/catalog/storage-supply-pricing.v1.json');
  const schema = await json('packages/contracts/schemas/storage-supply-pricing.schema.json');
  const evidence = await json('docs/evidence/supply-foundation/cloudflare-r2-qualification.v1.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(pricing), true, ajv.errorsText(validate.errors));
  assert.deepEqual([service.connectionStatus, service.qualificationStatus, service.termsStatus, service.resaleStatus], ['observed_failed', 'failed', 'restricted', 'restricted']);
  assert.deepEqual(pricing.assets.map(({ publicAssetId }) => publicAssetId), ['object-storage-standard', 'object-storage-write', 'object-storage-read', 'object-storage-egress']);
  assert.ok(pricing.assets.every(({ customerPriceMicrousd, listingStatus, costGuardStatus }) => customerPriceMicrousd > 0 && listingStatus === 'blocked' && costGuardStatus === 'unverified'));
  assert.equal(pricing.policy.customerFreeByDefault, false);
  assert.equal(pricing.policy.automaticPaidOverageAllowed, false);
  assert.equal(evidence.externalCalls, 1);
  assert.equal(evidence.ownerCashSpentUsd, 0);
  assert.deepEqual([evidence.objectReadCalls, evidence.objectWriteCalls, evidence.deleteCalls], [0, 0, 0]);
  assert.equal(evidence.customerObjectDataUsed, false);
  assert.equal(evidence.observation.transportFailureCode, 'tls_handshake_failure');
  assert.equal(evidence.summary.productionStatus, 'blocked_credential_or_permission_failure');
  assert.equal(evidence.allowance.automaticPaidUpgradeAllowedByClervo, false);
  assert.equal(evidence.terms.rawCredentialOrAccountResaleAllowed, false);
});
