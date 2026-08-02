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
  assert.deepEqual(inventory.services.filter(({ qualificationStatus }) => qualificationStatus === 'passed').map(({ serviceId }) => serviceId), ['supply.clervo_ai_gateway', 'supply.deepgram', 'supply.google_vertex', 'supply.groq']);

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

  assert.deepEqual(inventory.retiredServices.map(({ serviceId }) => serviceId), ['supply.quickai', 'supply.tongkhokr']);
  assert.ok(inventory.retiredServices.every(({ connectionStatus, resaleStatus }) => connectionStatus === 'retired' && resaleStatus === 'prohibited'));
  assert.deepEqual(inventory.creditPools.map(({ serviceId, reportedAmount }) => [serviceId, reportedAmount]), [
    ['supply.google_vertex', 1700],
    ['supply.deepgram', 200],
    ['supply.hcnsec_gateway', null],
  ]);

  const serialized = JSON.stringify(inventory);
  assert.equal(/(?:sk-|ghp_|AIza|Bearer\s|-----BEGIN|api[_-]?key["']?\s*:\s*["'][^"']+)/iu.test(serialized), false);
});
