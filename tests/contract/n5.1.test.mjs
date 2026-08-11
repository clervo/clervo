import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  assertPlatformRegistry,
  assertSchemaVisibilityManifest,
  createProductScopeDocument,
  publicSchemaFiles,
  SEARCH_PRODUCT_PRICING,
} from '../../dist/packages/contracts/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaDirectory = path.join(root, 'packages/contracts/schemas');

async function json(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}

test('canonical foundation binds all six pillars and every adopted capability without claiming a freeze', async () => {
  const registry = await json('packages/catalog/platform-registry.v1.json');
  const visibility = await json('packages/catalog/schema-visibility.v1.json');
  assert.doesNotThrow(() => assertPlatformRegistry(registry, visibility));
  assert.equal(registry.state, 'foundation_unfrozen');
  assert.deepEqual(registry.pillars.map(({ pillarId }) => pillarId), ['search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto_intelligence']);
  assert.deepEqual(registry.pillars.map(({ lifecycle }) => lifecycle), ['preview', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable']);
  assert.deepEqual(registry.pillars.map(({ coreQualified }) => coreQualified), [true, false, false, false, false, false]);

  const scope = createProductScopeDocument();
  for (const pillar of scope.pillars) {
    assert.deepEqual(
      registry.capabilities.filter(({ pillarId }) => pillarId === pillar.pillarId).map(({ capabilityId }) => capabilityId),
      [...pillar.capabilityIds],
    );
  }
});

test('canonical registry assertion and visibility manifest validation follow current authority', async () => {
  const registry = await json('packages/catalog/platform-registry.v1.json');
  const visibility = await json('packages/catalog/schema-visibility.v1.json');
  const visibilitySchema = await json('packages/contracts/schemas/schema-visibility.schema.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  assert.doesNotThrow(() => assertPlatformRegistry(registry, visibility));
  assert.equal(ajv.compile(visibilitySchema)(visibility), true);

  for (const declaration of visibility.schemas) {
    const schema = await json(`packages/contracts/schemas/${declaration.file}`);
    assert.equal(declaration.schemaId, schema.$id, `${declaration.file}: manifest identity drift`);
  }
});

test('implemented Search and private unavailable product cores are instantiated without public claims', async () => {
  const registry = await json('packages/catalog/platform-registry.v1.json');
  assert.deepEqual(registry.operations.map(({ operationId }) => operationId), [
    'ai.chat', 'ai.embed', 'ai.image', 'ai.speech',
    'sandbox.run', 'sandbox.session.create', 'sandbox.session.exec', 'sandbox.artifact.get', 'sandbox.session.destroy',
    'rpc.call', 'rpc.batch', 'rpc.health', 'rpc.archive', 'rpc.broadcast',
    'crypto.wallet.balances', 'crypto.wallet.tokens', 'crypto.wallet.transactions', 'crypto.wallet.report',
    'prediction.markets', 'prediction.market', 'prediction.compare', 'prediction.history', 'prediction.signal',
    'search.alert.evaluate', 'search.compare', 'search.monitor', 'search.solution_pack.assemble', 'search.web', 'search.answer', 'web.fetch', 'web.extract',
  ]);
  assert.ok(registry.operations.every(({ visibility }) => visibility === 'internal'));
  assert.ok(registry.operations.filter(({ operationId }) => /^(?:ai|sandbox|rpc|crypto|prediction)\./u.test(operationId)).every(({ lifecycle, route }) => lifecycle === 'unavailable' && route === null));
  assert.deepEqual(registry.products.map(({ productId }) => productId), [
    'ai.chat', 'ai.embed', 'ai.image', 'ai.speech',
    'sandbox.run', 'sandbox.session.create', 'sandbox.session.exec', 'sandbox.artifact.get', 'sandbox.session.destroy',
    'rpc.call', 'rpc.batch', 'rpc.health', 'rpc.archive', 'rpc.broadcast',
    'crypto.wallet.balances', 'crypto.wallet.tokens', 'crypto.wallet.transactions', 'crypto.wallet.report',
    'prediction.markets', 'prediction.market', 'prediction.compare', 'prediction.history', 'prediction.signal',
    'search.web', 'search.answer', 'web.fetch', 'web.extract',
  ]);
  assert.deepEqual(
    registry.skus.map(({ productId, commerceMode, maximumCharge, priceVersion }) => ({ productId, commerceMode, maximumCharge, priceVersion })),
    [
      { productId: 'search.web', commerceMode: 'mock_only', maximumCharge: SEARCH_PRODUCT_PRICING['search.web'].maximumCharge, priceVersion: SEARCH_PRODUCT_PRICING['search.web'].priceVersion },
      { productId: 'search.answer', commerceMode: 'mock_only', maximumCharge: SEARCH_PRODUCT_PRICING['search.answer'].maximumCharge, priceVersion: SEARCH_PRODUCT_PRICING['search.answer'].priceVersion },
    ],
  );
});

test('schema visibility is exhaustive, default-deny, and excludes control and sealed contracts from preview projection', async () => {
  const visibility = await json('packages/catalog/schema-visibility.v1.json');
  const schemaFiles = (await readdir(schemaDirectory)).filter((file) => file.endsWith('.schema.json')).sort();
  assert.doesNotThrow(() => assertSchemaVisibilityManifest(visibility, schemaFiles));
  const projected = publicSchemaFiles(visibility, schemaFiles);
  assert.ok(projected.includes('search-http-request.schema.json'));
  assert.ok(projected.includes('search-http-result.schema.json'));
  assert.ok(!projected.includes('platform-registry.schema.json'));
  assert.ok(!projected.includes('schema-visibility.schema.json'));
  assert.ok(!projected.includes('search-benchmark.schema.json'));

  const generated = (await readdir(path.join(root, 'generated/public/schemas/2026-07-29.1'))).sort();
  assert.deepEqual(generated, projected);
});

test('registry invariants fail closed on dangling references, false public projection, and missing charge ceilings', async () => {
  const registry = await json('packages/catalog/platform-registry.v1.json');
  const visibility = await json('packages/catalog/schema-visibility.v1.json');

  const dangling = structuredClone(registry);
  dangling.operations.find(({ operationId }) => operationId === 'search.web').capabilityId = 'search.missing';
  assert.throws(() => assertPlatformRegistry(dangling, visibility), /operation_reference_invalid:search\.web/u);

  const leaked = structuredClone(registry);
  leaked.operations.find(({ operationId }) => operationId === 'web.fetch').visibility = 'public';
  leaked.operations.find(({ operationId }) => operationId === 'web.fetch').route = { method: 'POST', path: '/v1/web/fetch' };
  assert.throws(() => assertPlatformRegistry(leaked, visibility), /public_operation_schema_private:web\.fetch/u);

  const unbounded = structuredClone(registry);
  unbounded.skus[0].maximumCharge = null;
  assert.throws(() => assertPlatformRegistry(unbounded, visibility), /charged_sku_missing_ceiling:search\.web\.mock\.v1/u);
});

test('schema projection rejects unclassified files and duplicate declarations', async () => {
  const visibility = await json('packages/catalog/schema-visibility.v1.json');
  const schemaFiles = (await readdir(schemaDirectory)).filter((file) => file.endsWith('.schema.json')).sort();
  assert.throws(() => publicSchemaFiles(visibility, [...schemaFiles, 'future-secret.schema.json']), /schema_file_unclassified/u);
  const duplicate = structuredClone(visibility);
  duplicate.schemas.push(structuredClone(duplicate.schemas[0]));
  assert.throws(() => publicSchemaFiles(duplicate, schemaFiles), /schema_files_duplicate/u);
});
