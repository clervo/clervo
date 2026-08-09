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
const descriptors = async (directory, names, frozenHashes = new Map()) => Promise.all(names.sort().map(async (name) => {
  const file = path.posix.join(directory, name);
  return Object.freeze({ file, sha256: frozenHashes.get(name) ?? await sha256(file) });
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
// A schema inside the frozen set that has legitimately been edited since the
// freeze. The manifest keeps the hash the schema had at the freeze, because
// interfaceHash derives from it and that hash is a published identifier: it is
// pinned in both SDKs, in infra/production/release-policy.v1.json, in the
// distribution sources, and on every generated public surface. Recomputing it
// would silently reissue the frozen release candidate's identity, which is why
// scripts/generate-discovery.mjs refuses a manifest whose interfaceHash does
// not match the one the published surfaces carry.
//
// ai-speech-pricing.schema.json was widened in ba76817: priceVersion,
// listingStatus, and positioning were single `const` literals that the catalog
// had already moved past, so honest pricing data failed its own schema. The
// widening constrains the same fields to the value sets the catalog reports and
// removes no requirement. The wire contract is unchanged, so the frozen
// interface is unchanged, and the frozen hash stands.
//
// The four AI pricing schemas were edited again on 2026-08-07 for the B7
// commercial repricing. Each had `priceVersion` pinned as a `const`, which made
// it impossible to revise a price without editing the schema, and each pinned
// `positiveMarginRequiredAtLaunch: false` / `qualifiedRoutesAreSellable: true`
// -- the launch subsidy stance, now reversed by owner decision. priceVersion is
// now a dated pattern, the two policy pins are inverted, and grossMarginTarget
// plus creditsJustifyBelowCostPricing were added as required fields. These are
// internal pricing catalogs, not wire contracts: no request or response shape
// changes, so the frozen interface is unchanged and the frozen hashes stand.
const frozenSchemaHashes = new Map([
  ['ai-speech-pricing.schema.json', 'sha256:b290584d94341427b2fcb4d01ca77f23f4172ab507317ea670c18794ef364ed2'],
  ['ai-credit-backed-pricing.schema.json', 'sha256:46f824e555a0b9df42099862f323fef3b59bc4a74b800ef455f12b51aa8c3c9c'],
  ['ai-edge-free-pricing.schema.json', 'sha256:cb62ad263ad47f5120d4499fcf4ffbf61ac388155b3a9b0dab4a9f0c08cf3ce6'],
  ['ai-free-tier-pricing.schema.json', 'sha256:7964a41a938e52b5925f62f3aff8171793ef9e3303285c2136d1b710eb5e3b22'],
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
const schemas = await descriptors('packages/contracts/schemas', schemaNames, frozenSchemaHashes);
const fixtures = await descriptors('packages/contracts/fixtures', fixtureNames);
const prices = await Promise.all(priceFiles.map(async (file) => Object.freeze({ file, sha256: await sha256(file) })));

const visibleFiles = new Set(visibility.schemas.map(({ file }) => file));
if (visibleFiles.size !== allSchemaNames.length || allSchemaNames.some((name) => !visibleFiles.has(name))) throw new Error('release_freeze_schema_visibility_incomplete');
for (const name of postFreezeSchemaNames) {
  if (!allSchemaNames.includes(name) || visibility.schemas.find(({ file }) => file === name)?.visibility !== 'public_wire') {
    throw new Error(`release_freeze_post_freeze_schema_invalid:${name}`);
  }
}
// A pinned hash that no longer belongs to any schema in the frozen set is dead
// weight that would hide the next real drift, and one that matches the file on
// disk means the exemption has been made redundant by a revert. Both should be
// removed rather than left to rot.
for (const [name, frozenHash] of frozenSchemaHashes) {
  if (!schemaNames.includes(name)) throw new Error(`release_freeze_frozen_hash_unknown_schema:${name}`);
  if (await sha256(path.posix.join('packages/contracts/schemas', name)) === frozenHash) {
    throw new Error(`release_freeze_frozen_hash_redundant:${name}`);
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
