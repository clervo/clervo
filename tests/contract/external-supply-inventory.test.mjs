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
  const terms = await json('docs/evidence/supply-foundation/public-rpc-terms-review.v1.json');
  const mesh = pricing.routes.filter(({ serviceId }) => serviceId === 'supply.public_rpc_mesh');
  assert.deepEqual([service.connectionStatus, service.qualificationStatus, service.termsStatus, service.resaleStatus], ['observed_working', 'failed', 'restricted', 'restricted']);
  assert.equal(evidence.configuredChains, 14);
  assert.equal(evidence.configuredRoutes, 32);
  assert.equal(evidence.externalCalls, 27);
  assert.equal(evidence.transactionCalls, 0);
  assert.equal(evidence.signedPayloads, 0);
  assert.deepEqual(evidence.summary, { passedRoutes: 20, passedChains: 13, exactIdentityRoutes: 17, endpointOnlyIdentityRoutes: 3, batchCapableRoutes: 15 });
  assert.deepEqual(evidence.safety, { httpsOnly: true, credentialsInUrlsAllowed: false, queryStringsAllowed: false, hostAllowlistRequired: true, publicDnsRequired: true, redirectsAllowed: false });
  assert.equal(mesh.length, 32);
  assert.ok(mesh.every(({ customerPriceMicrousd, broadcastStatus }) => customerPriceMicrousd > 0 && broadcastStatus === 'read_only_route'));
  assert.equal(mesh.filter(({ technicalQualificationStatus }) => technicalQualificationStatus === 'passed').length, 20);
  assert.ok(mesh.filter(({ technicalQualificationStatus }) => technicalQualificationStatus === 'passed').every(({ termsStatus, listingStatus }) => termsStatus === 'restricted' && listingStatus === 'priced_terms_blocked'));
  assert.deepEqual(terms.summary, { configuredRoutes: 32, technicallyHealthyRoutes: 20, productionRestrictedHealthyRoutes: 20, sellableRoutes: 0, unavailableRoutesNotMateriallyTermsReviewed: 12 });
  assert.deepEqual(terms.safety, { externalCallsDuringTermsReview: 0, transactionCalls: 0, signedPayloads: 0, ownerCashSpentUsd: 0 });
  assert.equal(new Set(mesh.filter(({ technicalQualificationStatus }) => technicalQualificationStatus === 'passed').map(({ network }) => network)).size, 13);
  assert.equal(mesh.filter(({ fallbackStatus }) => fallbackStatus === 'independent_fallback_ready').length, 20);
  assert.ok(mesh.filter(({ technicalQualificationStatus }) => technicalQualificationStatus === 'failed').every(({ listingStatus, qualityGrade }) => listingStatus === 'blocked' && qualityGrade === 'rejected'));
});

test('dedicated multi-chain RPC intake rejects the disclosed key and is ready for safe qualification', async () => {
  const inventory = await json('packages/catalog/external-supply-inventory.v1.json');
  const service = inventory.services.find(({ serviceId }) => serviceId === 'supply.drpc');
  const qualifier = await readFile(path.join(root, 'scripts/supply/qualify-drpc.mjs'), 'utf8');
  assert.deepEqual(
    [service.configuredCredentialSlots, service.credentialDeployment, service.connectionStatus, service.qualificationStatus],
    [0, 'missing', 'observed_not_tested', 'not_run'],
  );
  assert.equal(service.products.length, 13);
  assert.equal(service.products.includes('rpc.solana'), false);
  assert.deepEqual(service.credentialNames, ['DRPC_API_KEY']);
  assert.deepEqual(service.endpointOrigins, ['https://lb.drpc.org']);
  assert.match(qualifier, /'Drpc-Key': credential/u);
  assert.match(qualifier, /credentialInUrl: false/u);
  assert.match(qualifier, /transactionCalls: 0/u);
  assert.match(qualifier, /signedPayloads: 0/u);
  assert.doesNotMatch(qualifier, /lb\.drpc\.live\/[a-z0-9-]+\/[A-Za-z0-9_-]{20,}/u);
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
  assert.equal(evidence.endpointSelection, 'derived_from_account_id');
  assert.deepEqual([evidence.observation.status, evidence.observation.transportFailureCode, evidence.observation.passed], [403, null, false]);
  assert.equal(evidence.summary.productionStatus, 'blocked_credential_or_permission_failure');
  assert.equal(evidence.allowance.automaticPaidUpgradeAllowedByClervo, false);
  assert.equal(evidence.terms.rawCredentialOrAccountResaleAllowed, false);
});

test('platform integrations are priced and authenticated without pooling accounts or causing external mutations', async () => {
  const inventory = await json('packages/catalog/external-supply-inventory.v1.json');
  const pricing = await json('packages/catalog/platform-integration-supply-pricing.v1.json');
  const schema = await json('packages/contracts/schemas/platform-integration-supply-pricing.schema.json');
  const evidence = await json('docs/evidence/supply-foundation/platform-integration-qualification.v1.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(pricing), true, ajv.errorsText(validate.errors));
  assert.equal(pricing.assets.length, 8);
  assert.ok(pricing.assets.every(({ customerPriceMicrousd }) => customerPriceMicrousd > 0));
  assert.equal(pricing.policy.ownerCredentialDelegationAllowed, false);
  assert.equal(pricing.policy.accountPoolingAllowed, false);
  assert.equal(pricing.assets.find(({ serviceId }) => serviceId === 'supply.gitlab_source').technicalQualificationStatus, 'failed');
  assert.equal(pricing.assets.find(({ serviceId }) => serviceId === 'supply.workos').listingStatus, 'internal_dependency_only');
  assert.deepEqual(inventory.services.filter(({ serviceId }) => ['supply.github_source', 'supply.devto', 'supply.hashnode', 'supply.telegram', 'supply.workos'].includes(serviceId)).map(({ connectionStatus }) => connectionStatus), Array(5).fill('observed_working'));
  assert.equal(inventory.services.find(({ serviceId }) => serviceId === 'supply.gitlab_source').connectionStatus, 'observed_failed');
  assert.equal(evidence.externalCalls, 6);
  assert.equal(evidence.ownerCashSpentUsd, 0);
  assert.deepEqual([evidence.mutationCalls, evidence.publishedArticles, evidence.sentMessages, evidence.repositoriesRead], [0, 0, 0, 0]);
  assert.equal(evidence.credentialPolicy.githubCredentialSlotsUsed, 1);
  assert.equal(evidence.credentialPolicy.githubAccountPoolingAttempted, false);
  assert.equal(evidence.credentialPolicy.telegramAlternateCredentialUsed, false);
  assert.deepEqual(evidence.observations.map(({ serviceId, status, passed }) => [serviceId, status, passed]), [
    ['supply.github_source', 200, true],
    ['supply.gitlab_source', 401, false],
    ['supply.devto', 200, true],
    ['supply.hashnode', 200, true],
    ['supply.telegram', 200, true],
    ['supply.workos', 200, true],
  ]);
});

test('x402 facilitators expose supported capabilities without running a payment path', async () => {
  const inventory = await json('packages/catalog/external-supply-inventory.v1.json');
  const pricing = await json('packages/catalog/payment-supply-pricing.v1.json');
  const schema = await json('packages/contracts/schemas/payment-supply-pricing.schema.json');
  const evidence = await json('docs/evidence/supply-foundation/x402-facilitator-qualification.v1.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(pricing), true, ajv.errorsText(validate.errors));
  assert.equal(pricing.routes.length, 4);
  assert.ok(pricing.routes.every(({ customerPriceMicrousd }) => customerPriceMicrousd > 0));
  assert.equal(pricing.policy.automaticPaidOverageAllowed, false);
  assert.equal(pricing.policy.realPaymentRequiresOwnerApproval, true);
  assert.equal(pricing.policy.testnetIsProductionFallback, false);
  assert.equal(pricing.routes.filter(({ serviceId }) => serviceId === 'supply.x402_testnet').every(({ listingStatus, fallbackStatus }) => listingStatus === 'development_only' && fallbackStatus === 'not_a_production_fallback'), true);
  assert.deepEqual(inventory.services.filter(({ serviceId }) => ['supply.cdp_x402', 'supply.x402_testnet'].includes(serviceId)).map(({ connectionStatus, qualificationStatus }) => [connectionStatus, qualificationStatus]), [['observed_working', 'in_progress'], ['observed_working', 'in_progress']]);
  assert.equal(evidence.externalCalls, 2);
  assert.equal(evidence.summary.passedFacilitators, 2);
  assert.deepEqual([evidence.verificationCalls, evidence.settlementCalls, evidence.walletSignatureCalls, evidence.paymentAuthorizationCalls, evidence.transactionSubmissionCalls], [0, 0, 0, 0, 0]);
  assert.deepEqual([evidence.gasSpent, evidence.usdcSpent, evidence.ownerCashSpentUsd], [0, 0, 0]);
  assert.equal(evidence.credentialPolicy.secretValuesRecorded, false);
  assert.equal(evidence.credentialPolicy.signerAddressesRecorded, false);
  assert.deepEqual(evidence.observations.map(({ serviceId, status, supportedKindCount, passed }) => [serviceId, status, supportedKindCount, passed]), [
    ['supply.cdp_x402', 200, 24, true],
    ['supply.x402_testnet', 200, 11, true],
  ]);
  assert.equal(evidence.allowance.automaticPaidOverageAllowedByClervo, false);
});

test('final supply matrix covers every priced asset, preserves provider secrecy, and names only genuine owner blockers', async () => {
  const matrix = await json('packages/catalog/supply-route-matrix.v1.json');
  const schema = await json('packages/contracts/schemas/supply-route-matrix.schema.json');
  const market = await json('docs/evidence/supply-foundation/market-sourcing-gap-evaluation.v1.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(matrix), true, ajv.errorsText(validate.errors));
  assert.deepEqual(matrix.policy, { providerNamesPublic: false, exactModelSubstitutionAllowed: false, automaticPaidOverageAllowed: false, customerFreeByDefault: false, pricingIsReferencedNotDuplicated: true });
  assert.equal(matrix.catalogCoverage.length, 13);
  assert.equal(matrix.catalogCoverage.reduce((sum, row) => sum + row.assetCount, 0), 779);
  assert.equal(matrix.catalogCoverage.reduce((sum, row) => sum + row.positiveCustomerPriceCount, 0), 779);
  assert.equal(matrix.catalogCoverage.reduce((sum, row) => sum + row.sellableCount, 0), 22);
  assert.equal(new Set(matrix.capabilities.map(({ capabilityId }) => capabilityId)).size, matrix.capabilities.length);
  assert.ok(matrix.capabilities.every(({ publicAssets, pricingCatalogs, healthMethod, secretLocations, replacementPlan }) => publicAssets.length > 0 && pricingCatalogs.length > 0 && healthMethod.length > 0 && secretLocations.length > 0 && replacementPlan.length > 12));
  assert.deepEqual(matrix.ownerBlockers.map(({ blockerId, spendingAuthorized }) => [blockerId, spendingAuthorized]), [['owner.drpc_account', false], ['owner.brave_search_account', false], ['owner.r2_key_reissue', false]]);
  assert.equal(market.competitorObservation.observedLiveModels, 83);
  assert.equal(market.clervoObservation.qualifiedExactAiRoutes, 20);
  assert.deepEqual(market.finalDecision, { coverageSufficientWithoutOwnerAction: false, newAccountsSelected: 2, existingCredentialsNeedingReplacement: 1, selectedOwnerActions: ['dRPC dedicated free-tier key', 'Brave Search free-credit key', 'least-privilege R2 bucket key and bucket name'], allOtherResearchedSources: 'rejected or deferred until revenue, compatible terms, or a material failure justifies them' });
  const serialized = JSON.stringify(matrix);
  assert.equal(/(?:sk-|ghp_|AIza|Bearer\s|-----BEGIN|api[_-]?key["']?\s*:\s*["'][^"']+)/iu.test(serialized), false);
});
