import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PRIVATE_WORKFLOW_DEFINITIONS } from '../../dist/services/workflows/src/engine.js';

const read = async (name) => JSON.parse(await readFile(path.join(process.cwd(), name), 'utf8'));

test('private workflow catalog exactly matches implemented definitions and does not claim public availability', async () => {
  const catalog = await read('packages/catalog/private-workflows.v1.json');
  assert.equal(catalog.lifecycle, 'private_qualified');
  assert.equal(catalog.publicAvailable, false);
  assert.deepEqual(catalog.workflows.map(({ workflowId }) => workflowId), PRIVATE_WORKFLOW_DEFINITIONS.map(({ workflowId }) => workflowId));
  for (const [index, workflow] of catalog.workflows.entries()) {
    const implementation = PRIVATE_WORKFLOW_DEFINITIONS[index];
    assert.equal(workflow.version, implementation.version);
    assert.deepEqual(workflow.pillars, [...new Set(implementation.steps.map(({ pillar }) => pillar))]);
    assert.deepEqual(workflow.products, implementation.steps.map(({ productId }) => productId));
    assert.equal(workflow.maximumSupplierCostMicrousd, implementation.steps.reduce((sum, { maximumSupplierCostMicrousd }) => sum + maximumSupplierCostMicrousd, 0));
    assert.equal(workflow.publicAvailable, false);
  }
});

test('all six product cores are independently recorded as private-qualified without changing truthful public lifecycle', async () => {
  const catalog = await read('packages/catalog/private-workflows.v1.json');
  assert.deepEqual(catalog.coreQualifications.map(({ pillar }) => pillar), ['search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto']);
  assert.ok(catalog.coreQualifications.every(({ privateCoreQualified }) => privateCoreQualified));
  assert.equal(catalog.coreQualifications.filter(({ publicLifecycle }) => publicLifecycle === 'preview').length, 1);
  assert.equal(catalog.coreQualifications.filter(({ publicLifecycle }) => publicLifecycle === 'unavailable').length, 5);
});

test('workflow catalog and its public-claim rejection contract remain internal-only', async () => {
  const visibility = await read('packages/catalog/schema-visibility.v1.json');
  const entry = visibility.schemas.find(({ file }) => file === 'private-workflow-catalog.schema.json');
  assert.equal(entry?.visibility, 'internal_control');
  assert.equal((await read('packages/contracts/fixtures/private-workflow-catalog-public-invalid.json')).valid, false);
});
