import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));

test('AI launch prices are sellable, credit-backed, and exactly half the shadow market valuation', async () => {
  const pricing = await json('packages/catalog/ai-launch-pricing.v1.json');
  const schema = await json('packages/contracts/schemas/ai-launch-pricing.schema.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(pricing), true, ajv.errorsText(validate.errors));
  assert.equal(pricing.policy.positiveMarginRequiredAtLaunch, false);
  assert.equal(pricing.policy.unknownSupplierDebitBlocksSale, false);
  assert.ok(pricing.routes.every(({ listingStatus }) => listingStatus === 'sellable'));
  for (const route of pricing.routes) {
    for (const field of ['inputMicrosPerMillion', 'cachedInputMicrosPerMillion', 'outputMicrosPerMillion', 'reasoningMicrosPerMillion']) {
      assert.equal(route.customerPrice[field] * 2, route.shadowBudgetValuation[field], `${route.modelId}:${field}`);
    }
  }
  assert.equal(new Set(pricing.routes.flatMap(({ aliases }) => aliases)).size, 4);
  assert.ok(pricing.gatewayLimits.customerRequestsPerMinute + pricing.gatewayLimits.reservedOperationalRequestsPerMinute <= 29);
});
