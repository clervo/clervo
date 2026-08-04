#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

import { hashJson } from '../../dist/packages/contracts/src/receipt.js';

const root = process.cwd();
const readJson = async (name) => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const hashBytes = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const sha256 = async (name) => hashBytes(await readFile(path.join(root, name)));
const descriptors = async (directory, names) => Promise.all(names.sort().map(async (name) => {
  const file = path.posix.join(directory, name);
  return Object.freeze({ file, sha256: await sha256(file) });
}));

const registryFile = 'packages/catalog/platform-registry.v1.json';
const visibilityFile = 'packages/catalog/schema-visibility.v1.json';
const workflowFile = 'packages/catalog/private-workflows.v1.json';
// Stage 12 is an immutable historical snapshot. Public contracts introduced
// after that freeze remain part of the current visibility manifest, but they
// must not silently rewrite the frozen schema set or its historical manifest
// hash. A new full-platform freeze will supersede this explicit boundary.
const postFreezeSchemaNames = new Set([
  'ai-http-request.schema.json',
  'ai-http-result.schema.json',
]);
const priceFiles = [
  'packages/contracts/src/search-http.ts',
  'packages/catalog/ai-launch-pricing.v1.json',
  'packages/contracts/src/sandbox.ts',
  'packages/catalog/rpc-product-pricing.v1.json',
  'packages/catalog/prediction-product-pricing.v1.json',
  'packages/catalog/crypto-product-pricing.v1.json',
];
const registry = await readJson(registryFile);
const visibilitySource = await readFile(path.join(root, visibilityFile), 'utf8');
const visibility = JSON.parse(visibilitySource);
const workflows = await readJson(workflowFile);
const allSchemaNames = (await readdir(path.join(root, 'packages/contracts/schemas'))).filter((name) => name.endsWith('.schema.json'));
const schemaNames = allSchemaNames.filter((name) => !postFreezeSchemaNames.has(name));
const fixtureNames = (await readdir(path.join(root, 'packages/contracts/fixtures'))).filter((name) => name.endsWith('.json'));
const schemas = await descriptors('packages/contracts/schemas', schemaNames);
const fixtures = await descriptors('packages/contracts/fixtures', fixtureNames);
const prices = await Promise.all(priceFiles.map(async (file) => Object.freeze({ file, sha256: await sha256(file) })));

const visibleFiles = new Set(visibility.schemas.map(({ file }) => file));
if (visibleFiles.size !== allSchemaNames.length || allSchemaNames.some((name) => !visibleFiles.has(name))) throw new Error('release_freeze_schema_visibility_incomplete');
for (const name of postFreezeSchemaNames) {
  if (!allSchemaNames.includes(name) || visibility.schemas.find(({ file }) => file === name)?.visibility !== 'public_wire') {
    throw new Error(`release_freeze_post_freeze_schema_invalid:${name}`);
  }
}
const frozenVisibilitySource = visibilitySource
  .split('\n')
  .filter((line) => ![...postFreezeSchemaNames].some((name) => line.includes(`"file": "${name}"`)))
  .join('\n');
if (workflows.coreQualifications.length !== 6 || workflows.coreQualifications.some(({ privateCoreQualified }) => !privateCoreQualified)) throw new Error('release_freeze_core_qualification_incomplete');
const publicOperationIds = ['search.web', 'search.answer'];
for (const operationId of publicOperationIds) {
  const operation = registry.operations.find((value) => value.operationId === operationId);
  if (operation?.lifecycle !== 'preview' || operation.route === null) throw new Error(`release_freeze_public_operation_invalid:${operationId}`);
}
const internalOperationIds = registry.operations.map(({ operationId }) => operationId).filter((operationId) => !publicOperationIds.includes(operationId)).sort();
const schemaAggregateHash = hashJson(schemas);
const fixtureAggregateHash = hashJson(fixtures);
const unsigned = {
  schemaVersion: 'clervo.release-candidate-freeze.v1',
  releaseCandidateId: 'clervo-private-core-2026-08-02.2',
  frozenAt: '2026-08-02T16:30:00.000Z',
  state: 'private_core_frozen',
  noPublicDistribution: true,
  baseRegistry: { file: registryFile, version: registry.registryVersion, sha256: await sha256(registryFile) },
  schemaVisibility: { file: visibilityFile, version: visibility.policyVersion, sha256: hashBytes(frozenVisibilitySource) },
  privateWorkflowCatalog: { file: workflowFile, sha256: await sha256(workflowFile) },
  coreQualifications: workflows.coreQualifications.map(({ pillar, privateCoreQualified, publicLifecycle }) => ({ pillar, privateCoreQualified, publicLifecycle })),
  operationSet: {
    publicOperationIds,
    internalOperationIds,
    total: registry.operations.length,
  },
  lifecycleProjection: registry.pillars.map(({ pillarId, lifecycle }) => ({ pillarId, lifecycle })),
  prices,
  schemas: {
    directory: 'packages/contracts/schemas',
    count: schemas.length,
    aggregateHash: schemaAggregateHash,
  },
  examples: {
    directory: 'packages/contracts/fixtures',
    count: fixtures.length,
    aggregateHash: fixtureAggregateHash,
  },
};
const manifest = { ...unsigned, interfaceHash: hashJson(unsigned) };
const output = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const committed = await readFile(path.join(root, 'packages/catalog/release-candidate-freeze.v1.json'), 'utf8');
  assert.deepEqual(JSON.parse(committed), manifest, 'release_candidate_freeze_drift');
  console.log(`release-candidate freeze: PASS (${schemas.length} schemas, ${fixtures.length} examples, ${registry.operations.length} operations)`);
} else if (process.argv.includes('--write')) {
  await writeFile(path.join(root, 'packages/catalog/release-candidate-freeze.v1.json'), output);
  console.log(`release-candidate freeze: WROTE (${schemas.length} schemas, ${fixtures.length} examples, ${registry.operations.length} operations)`);
} else {
  process.stdout.write(output);
}
