import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  assembleLiveIntelligenceSolutionPack,
  assertSchemaVisibilityManifest,
  createSearchResponse,
  liveIntelligenceSolutionPackDefinitions,
  liveIntelligenceSolutionPackIds,
  verifyLiveIntelligenceSolutionPackResult,
} from '../../dist/packages/contracts/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaDirectory = path.join(root, 'packages/contracts/schemas');

async function json(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}

const cases = [
  ['search.pack.commerce_marketplace', { product_name: 'Example Widget', price: '19.99', currency: 'USD', availability: 'in stock', seller: 'Example Store' }],
  ['search.pack.property_local_market', { listing_address: '1 Example Street', price: '450000', currency: 'USD', locality: 'Example City', bedrooms: '3' }],
  ['search.pack.company_competitive', { organization: 'Example Corp', signal_type: 'price change', observed_value: 'Pro plan 29 USD', product: 'Pro plan' }],
  ['search.pack.research_evidence', { claim: 'The standard was revised', source_kind: 'official publication', publisher: 'Example Standards Body' }],
  ['search.pack.developer_agent_context', { package_name: 'example-sdk', version: '2.4.1', ecosystem: 'npm', repository: 'example/example-sdk' }],
];

function packInput(packId, values, suffix) {
  const evidenceText = Object.values(values).join(' | ');
  const resultId = `sr_01K0PACK${suffix}RESULT000001`;
  const citationId = `cite_01K0PACK${suffix}CITE000001`;
  const url = `https://example.com/${suffix.toLowerCase()}`;
  const searchResponse = createSearchResponse({
    operationId: `op_01K0PACK${suffix}RUN00000001`,
    query: `example ${suffix.toLowerCase()}`,
    language: 'en',
    region: 'US',
    now: '2026-08-01T14:00:00.000Z',
    maxResults: 10,
    evidence: [{
      resultId,
      sourceId: 'adapter_test.search',
      url,
      title: `Example ${suffix}`,
      snippet: evidenceText,
      evidenceText,
      retrievedAt: '2026-08-01T14:00:00.000Z',
      authorityScore: 90,
      relevanceScore: 95,
    }],
    citations: [{ citationId, resultId, canonicalUrl: url, quote: evidenceText, startOffset: 0, endOffset: evidenceText.length }],
  });
  return {
    packId,
    searchResponse,
    observations: [{
      label: `Example ${suffix}`,
      fields: Object.entries(values).map(([name, value]) => ({ name, value, citationId })),
    }],
  };
}

test('all five solution packs assemble deterministic normalized records from exact cited evidence', () => {
  assert.deepEqual([...liveIntelligenceSolutionPackIds], cases.map(([packId]) => packId));
  for (const [index, [packId, values]] of cases.entries()) {
    const input = packInput(packId, values, `P${index + 1}`);
    const result = assembleLiveIntelligenceSolutionPack(input);
    assert.equal(result.packId, packId);
    assert.equal(result.summary.records, 1);
    assert.equal(result.summary.fields, Object.keys(values).length);
    assert.equal(result.summary.citations, 1);
    assert.equal(verifyLiveIntelligenceSolutionPackResult(result), true);
    assert.deepEqual(assembleLiveIntelligenceSolutionPack(input), result);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.records) && Object.isFrozen(result.records[0].fields));
  }
});

test('solution packs fail closed on missing fields, unsupported fields, uncited values, and duplicate entities', () => {
  const base = packInput('search.pack.commerce_marketplace', { product_name: 'Example Widget', price: '19.99', currency: 'USD', availability: 'in stock' }, 'FAIL');
  const missing = structuredClone(base);
  missing.observations[0].fields = missing.observations[0].fields.filter(({ name }) => name !== 'currency');
  assert.throws(() => assembleLiveIntelligenceSolutionPack(missing), /required_field_missing:currency/u);

  const unsupported = structuredClone(base);
  unsupported.observations[0].fields.push({ name: 'bedrooms', value: '3', citationId: unsupported.observations[0].fields[0].citationId });
  assert.throws(() => assembleLiveIntelligenceSolutionPack(unsupported), /field_not_allowed:bedrooms/u);

  const uncited = structuredClone(base);
  uncited.observations[0].fields.find(({ name }) => name === 'price').value = '999.99';
  assert.throws(() => assembleLiveIntelligenceSolutionPack(uncited), /value_not_cited:price/u);

  const duplicate = structuredClone(base);
  duplicate.observations.push(structuredClone(duplicate.observations[0]));
  assert.throws(() => assembleLiveIntelligenceSolutionPack(duplicate), /entity_duplicate/u);
});

test('pack result verification detects record, identity, summary, and hash tampering', () => {
  const input = packInput('search.pack.developer_agent_context', { package_name: 'example-sdk', version: '2.4.1', ecosystem: 'npm' }, 'TAMPER');
  const result = assembleLiveIntelligenceSolutionPack(input);
  for (const mutate of [
    (value) => { value.records[0].fields[0].value = 'other'; },
    (value) => { value.records[0].entityKey = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; },
    (value) => { value.summary.fields += 1; },
    (value) => { value.resultHash = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'; },
  ]) {
    const tampered = structuredClone(result);
    mutate(tampered);
    assert.equal(verifyLiveIntelligenceSolutionPackResult(tampered), false);
  }
});

test('solution-pack definitions contain exactly five stable internal contracts', async () => {
  const visibility = await json('packages/catalog/schema-visibility.v1.json');
  const schemas = (await readdir(schemaDirectory)).filter((file) => file.endsWith('.schema.json')).sort();
  assert.doesNotThrow(() => assertSchemaVisibilityManifest(visibility, schemas));
  assert.deepEqual(Object.keys(liveIntelligenceSolutionPackDefinitions), [...liveIntelligenceSolutionPackIds]);
  for (const packId of liveIntelligenceSolutionPackIds) {
    const pack = liveIntelligenceSolutionPackDefinitions[packId];
    assert.ok(pack.requiredFields.length > 0);
    assert.equal(new Set([...pack.requiredFields, ...pack.optionalFields]).size, pack.requiredFields.length + pack.optionalFields.length);
  }
});

test('solution-pack results validate strictly and remain excluded from public schema projection', async () => {
  const schemas = (await readdir(schemaDirectory)).filter((file) => file.endsWith('.schema.json')).sort();
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  for (const file of schemas) ajv.addSchema(await json(`packages/contracts/schemas/${file}`));
  const input = packInput('search.pack.research_evidence', { claim: 'The standard was revised', source_kind: 'official publication' }, 'SCHEMA');
  const result = assembleLiveIntelligenceSolutionPack(input);
  const validate = ajv.getSchema('https://api.clervo.dev/schemas/2026-07-29.1/live-intelligence-solution-pack-result.schema.json');
  assert.equal(validate(result), true, ajv.errorsText(validate.errors));
  const visibility = await json('packages/catalog/schema-visibility.v1.json');
  for (const file of ['live-intelligence-solution-pack-request.schema.json', 'live-intelligence-solution-pack-result.schema.json']) assert.equal(visibility.schemas.find((entry) => entry.file === file)?.visibility, 'internal_control');
  const generated = await readdir(path.join(root, 'generated/public/schemas/2026-07-29.1'));
  assert.equal(generated.some((file) => file.startsWith('live-intelligence-solution-pack')), false);
});
