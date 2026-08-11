import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { hashJson } from '../../dist/packages/contracts/src/receipt.js';

const read = async (name) => JSON.parse(await readFile(path.join(process.cwd(), name), 'utf8'));

test('release candidate freezes all six private product cores without changing public lifecycle', async () => {
  const freeze = await read('packages/catalog/release-candidate-freeze.v1.json');
  const registry = await read('packages/catalog/platform-registry.v1.json');

  assert.equal(freeze.state, 'private_core_frozen');
  assert.equal(freeze.noPublicDistribution, true);
  assert.deepEqual(freeze.coreQualifications.map(({ pillar }) => pillar), ['search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto']);
  assert.ok(freeze.coreQualifications.every(({ privateCoreQualified }) => privateCoreQualified));
  assert.deepEqual(freeze.lifecycleProjection, registry.pillars.map(({ pillarId, lifecycle }) => ({ pillarId, lifecycle })));
  assert.equal(freeze.lifecycleProjection.filter(({ lifecycle }) => lifecycle === 'preview').length, 1);
  assert.equal(freeze.lifecycleProjection.filter(({ lifecycle }) => lifecycle === 'unavailable').length, 5);
});

test('historical frozen external operation set is internally exact, disjoint, and remains undistributed', async () => {
  const freeze = await read('packages/catalog/release-candidate-freeze.v1.json');
  const registry = await read('packages/catalog/platform-registry.v1.json');
  const publicIds = new Set(freeze.operationSet.publicOperationIds);
  const internalIds = new Set(freeze.operationSet.internalOperationIds);

  assert.deepEqual([...publicIds], ['search.web', 'search.answer']);
  assert.ok([...publicIds].every((operationId) => !internalIds.has(operationId)));
  assert.equal(publicIds.size + internalIds.size, freeze.operationSet.total);
  assert.equal(new Set([...publicIds, ...internalIds]).size, freeze.operationSet.total);
  assert.equal(freeze.noPublicDistribution, true);
  for (const operationId of publicIds) {
    const operation = registry.operations.find((candidate) => candidate.operationId === operationId);
    assert.equal(operation.lifecycle, 'preview');
    assert.ok(operation.route);
    assert.equal(operation.visibility, 'internal');
  }
});

test('external operations depend only on public wire schemas while controls and evidence remain excluded', async () => {
  const freeze = await read('packages/catalog/release-candidate-freeze.v1.json');
  const registry = await read('packages/catalog/platform-registry.v1.json');
  const visibility = await read('packages/catalog/schema-visibility.v1.json');
  const visibilityById = new Map(visibility.schemas.map((entry) => [entry.schemaId, entry.visibility]));

  for (const operationId of freeze.operationSet.publicOperationIds) {
    const operation = registry.operations.find((candidate) => candidate.operationId === operationId);
    assert.equal(visibilityById.get(operation.inputSchema), 'public_wire');
    assert.equal(visibilityById.get(operation.outputSchema), 'public_wire');
  }
  assert.equal(
    visibility.schemas.find(({ file }) => file === 'release-candidate-freeze.schema.json')?.visibility,
    'internal_control',
  );
  assert.ok(visibility.schemas.some(({ visibility: state }) => state === 'sealed_evidence'));
  assert.ok(freeze.operationSet.publicOperationIds.every((operationId) => !/(provider|supply|benchmark|evidence)/u.test(operationId)));
});

test('frozen compatibility surface binds registry, visibility, workflows, six prices, schemas, and examples', async () => {
  const freeze = await read('packages/catalog/release-candidate-freeze.v1.json');
  assert.equal(freeze.prices.length, 6);
  assert.deepEqual(freeze.prices.map(({ file }) => file), [
    'packages/contracts/src/search-http.ts',
    'packages/catalog/ai-launch-pricing.v1.json',
    'packages/contracts/src/sandbox.ts',
    'packages/catalog/rpc-product-pricing.v1.json',
    'packages/catalog/prediction-product-pricing.v1.json',
    'packages/catalog/crypto-product-pricing.v1.json',
  ]);
  assert.equal(freeze.schemas.directory, 'packages/contracts/schemas');
  assert.equal(freeze.examples.directory, 'packages/contracts/fixtures');
  assert.ok(freeze.schemas.count > 0);
  assert.ok(freeze.examples.count > 0);
  for (const hash of [
    freeze.baseRegistry.sha256,
    freeze.schemaVisibility.sha256,
    freeze.privateWorkflowCatalog.sha256,
    freeze.schemas.aggregateHash,
    freeze.examples.aggregateHash,
    ...freeze.prices.map(({ sha256 }) => sha256),
  ]) assert.match(hash, /^sha256:[a-f0-9]{64}$/u);
});

test('interface hash rejects any silent release-candidate mutation', async () => {
  const freeze = await read('packages/catalog/release-candidate-freeze.v1.json');
  const { interfaceHash, ...unsigned } = freeze;
  assert.equal(interfaceHash, hashJson(unsigned));
  assert.notEqual(interfaceHash, hashJson({ ...unsigned, noPublicDistribution: false }));
});
