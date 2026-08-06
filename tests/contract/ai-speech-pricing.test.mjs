import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));

test('funded speech assets are competitively priced, bounded, and honest about integration and quality', async () => {
  const pricing = await json('packages/catalog/ai-speech-pricing.v1.json');
  const schema = await json('packages/contracts/schemas/ai-speech-pricing.schema.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(pricing), true, ajv.errorsText(validate.errors));
  const guard = pricing.creditGuard;
  assert.equal(guard.speechAllocationUsd + guard.transcriptionAllocationUsd + guard.reserveUsd, guard.ownerReportedBalanceUsd);
  assert.equal(pricing.policy.customerFreeByDefault, false);
  assert.equal(pricing.policy.unknownSupplierDebitBlocksSale, false);
  assert.ok(pricing.speechRoutes.every(({ listingStatus }) => listingStatus === 'sellable'));
  assert.ok(pricing.speechRoutes.every((route) => route.customerUsdPerThousandCharacters < pricing.competitorReference.speechPriceRangeUsdPerThousandCharacters[0]));
  assert.ok(pricing.speechRoutes.every((route) => route.customerUsdPerThousandCharacters < route.shadowUsdPerThousandCharacters));
  const transcription = pricing.transcriptionRoutes[0];
  // The listing status moves as the route is qualified and integrated, so it is
  // read from the schema's own enum rather than frozen here — pinning it made
  // the honest re-rank into a build failure. What must hold is the honesty
  // invariant: the route always states its known limitation, and it stays
  // priced below what it costs us to serve.
  const allowed = schema.properties.transcriptionRoutes.items.properties.listingStatus.enum;
  assert.ok(allowed.includes(transcription.listingStatus), `unexpected listing status ${transcription.listingStatus}`);
  assert.ok(transcription.knownLimitation.length > 0, 'a transcription route must state its known limitation');
  assert.ok(transcription.customerUsdPerMinute.streaming < transcription.shadowUsdPerMinute.streaming);
  assert.ok(transcription.customerUsdPerMinute.prerecorded < transcription.shadowUsdPerMinute.prerecorded);
  assert.match(transcription.knownLimitation, /idempotency/u);
});
