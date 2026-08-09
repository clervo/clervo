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
const frozenRegistrySha256 = 'sha256:bc5f174625d03ee25bb477415d9b624b391d910e1dd1fa68eaaa30e4a1265b0d';
const frozenWorkflowSha256 = 'sha256:025d798e3f6e36f43b154bad04f3c8b7495e20e7b00f66e4f124f5441b8f93b6';
const currentCryptoOperationIds = ['crypto.wallet.balances', 'crypto.wallet.tokens', 'crypto.wallet.transactions', 'crypto.wallet.report'];
const frozenCryptoOperationIds = ['crypto.protocol', 'crypto.report', 'crypto.token', 'crypto.transaction', 'crypto.wallet'];
// Stage 12 is an immutable historical snapshot. Public contracts introduced
// after that freeze remain part of the current visibility manifest, but they
// must not silently rewrite the frozen schema set or its historical manifest
// hash. A new full-platform freeze will supersede this explicit boundary.
const postFreezeSchemaNames = new Set([
  'ai-http-request.schema.json',
  'ai-http-result.schema.json',
  'prediction-derived-market.schema.json',
  'prediction-event.schema.json',
  'qualified-ai-supply-catalog.schema.json',
]);
const postFreezeFixtureNames = new Set([
  'prediction-derived-market-valid.json',
  'prediction-event-valid.json',
  'qualified-ai-supply-catalog-valid.json',
  'qualified-ai-supply-catalog-secret-invalid.json',
  'search-supply-pricing-b10-valid.json',
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
  // B7 removes the historical 100-route ceiling. The schema remains internal,
  // and the immutable Stage 12 snapshot retains the pre-B7 descriptor hash.
  ['ai-model-catalog.schema.json', 'sha256:0fcb7d7b2aa1759f18a3217e0e010dda0c85c3f55e6f627b35ae0bbe4491797f'],
  // B8 strengthens the internal Prediction contracts without changing the
  // historical Stage 12 snapshot they postdate.
  ['prediction-market.schema.json', 'sha256:12e711f6b0f11308eb8b30c8e2e694aa6d75e2802d10be64c7ed8e9ac025d8c9'],
  ['prediction-operation-request.schema.json', 'sha256:03088774a649e42689975e92df9d600545119378ed055080279a7ca0077f080c'],
  ['prediction-operation-result.schema.json', 'sha256:74e0e03ab28756c94437c88db2c3da21f63f217ccdc51aaf302de4512f607d21'],
  ['prediction-product-pricing.schema.json', 'sha256:ea4a5d41af051ef3d260f5901424e15427ecf969093b3a4c5bc883c8afcc2164'],
  ['prediction-source-routes.schema.json', 'sha256:c559b9f8c213aa5b2d78d6b23ba81895567128a96dae888178fa0909f4e1c80a'],
  // B9 replaces the historical five-operation Crypto private-core contract
  // with the stable four-operation wallet-intelligence contract. The Stage 12
  // snapshot remains immutable; current contracts are validated independently.
  ['blockchain-data-supply-pricing.schema.json', 'sha256:b2a1bba04cfd76dddf6612be1fc82a744470df5af7f974596e2af423aadd3d4f'],
  ['crypto-operation-request.schema.json', 'sha256:ba53a4b0431750290fb0ad0abb4ef17e346d478bfa3397214d9f53ab336f742a'],
  ['crypto-operation-result.schema.json', 'sha256:92f10dae4b73c638c02bc7609df9335f739bc99014829a3d41d34e4adf9441f2'],
  ['crypto-product-pricing.schema.json', 'sha256:971ac42d6e10b52b8fa72841685a555f14028067082abfd461ea2149e41b74d2'],
  ['crypto-source-routes.schema.json', 'sha256:7699631024e05f1f5f0bb4efa6495c721ebdc064a8e9deb861d9952535072795'],
  ['external-supply-inventory.schema.json', 'sha256:bee7e9944649f911d2103f447c5d3934fc0ef33b278e9680c79ce71fd8ab3070'],
  // B10 adds optional Search route/cost provenance and commercial-supply
  // controls. The immutable Stage 12 snapshot retains its original wire and
  // internal-control descriptors.
  ['operation-receipt.schema.json', 'sha256:8d46892c4e4d05ecc48be73d0589048fbf62c38362d04d68fe3387f219fbb6c4'],
  ['search-response.schema.json', 'sha256:005e86142d685ca00cec1caab53a5bc7cfe0359f72d0b78c0230035dff8be07a'],
  ['search-supply-pricing.schema.json', 'sha256:95bcf7954804cd5ff42148e41ad9bc4b7bd680c88f81484c3ebf9aba0b52031a'],
]);
const frozenFixtureHashes = new Map([
  ['prediction-market-valid.json', 'sha256:d1d9a5c35145c0bcab74cdef15dc22fe82ee9ab14c4bb562c731b315978ab2a8'],
  ['prediction-operation-result-valid.json', 'sha256:3c98cd3bdfa4647e217a79b4206640f5dd6497061a01eef02ab4755eea48ef0f'],
  ['prediction-product-pricing-valid.json', 'sha256:07eff84cafb2392adbe1b60ded8ee4ca6537649cd9337e1e48bf0c1dcc085877'],
  ['prediction-source-routes-terms-bypass-invalid.json', 'sha256:f00a23e81d2bce4c63edba54dfcb20a18569f5524a4ecba423dd623f98b3accd'],
  ['prediction-source-routes-valid.json', 'sha256:29e7609f3abca4dca6fd8d9fedb0dea056000aa9997ce351ba47c44933cf8832'],
  ['crypto-operation-request-product-mismatch-invalid.json', 'sha256:8093c0915cd439a69a2ba4b0a941b619c6849abcf388ba3ceddf33ff25701db8'],
  ['crypto-operation-request-valid.json', 'sha256:f5d5fb4cfcf36af20a3672f55cf67ab184ca883081303dc1ffddca5eea840a56'],
  ['crypto-operation-result-valid.json', 'sha256:30b9cb466593a6795a1c6a0dc0f2b017c3ecad6370949a1593a37445814df0da'],
  ['crypto-product-pricing-valid.json', 'sha256:389669f47657679b96e5864f99b38290466293b6002d7017e3d1b598c9d12a7c'],
  ['crypto-source-routes-bypass-invalid.json', 'sha256:c5b93ce2684b97ecdd9c67d0d66d3747d2e8249e0a85eb0650b4aea74c2c6d88'],
  ['crypto-source-routes-valid.json', 'sha256:3db0094f395b16faba799bc11d37bbca7e7c27f4d2cb8b1799804a68840feefe'],
  ['private-workflow-catalog-valid.json', 'sha256:4aaf1809164bd17eaf5a7c5d98717ffc6965d252d984b9a63853ef4e06307da2'],
  ['product-scope-invalid-live-expansion.json', 'sha256:85636e4fd4464de6589820acb7a69d6e4a41ba8931bbcf87b5de16925f38fab9'],
  ['product-scope-valid.json', 'sha256:9560ca57ddefde47cd27cffc758f3f15fd8a67871e04088503e7baa784ee3379'],
]);
// Pricing policy is expected to evolve after the private-core freeze. Keep the
// historical descriptor for any catalog revised by a later milestone instead
// of silently reissuing the published Stage 12 interface identity.
const frozenPriceHashes = new Map([
  ['packages/contracts/src/search-http.ts', 'sha256:44a6f50ef356fcf5c980bc1257ba1e263532225ed7070bba81bb040ac90aae09'],
  ['packages/catalog/prediction-product-pricing.v1.json', 'sha256:bc8a742b44f43704606984e876457df1f03b3f02893c63d60a247739ce5a4a0a'],
  ['packages/catalog/crypto-product-pricing.v1.json', 'sha256:7ec207bb08e8cbeee0c6518b5cfa6148b71bfa2b38a8182c8467ae026a9ed55b'],
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
const fixtureNames = (await readdir(path.join(root, 'packages/contracts/fixtures'))).filter((name) => name.endsWith('.json') && !postFreezeFixtureNames.has(name));
const schemas = await descriptors('packages/contracts/schemas', schemaNames, frozenSchemaHashes);
const fixtures = await descriptors('packages/contracts/fixtures', fixtureNames, frozenFixtureHashes);
const prices = await Promise.all(priceFiles.map(async (file) => Object.freeze({ file, sha256: frozenPriceHashes.get(file) ?? await sha256(file) })));

const visibleFiles = new Set(visibility.schemas.map(({ file }) => file));
if (visibleFiles.size !== allSchemaNames.length || allSchemaNames.some((name) => !visibleFiles.has(name))) throw new Error('release_freeze_schema_visibility_incomplete');
for (const name of postFreezeSchemaNames) {
  const expectedVisibility = name === 'ai-http-request.schema.json' || name === 'ai-http-result.schema.json' ? 'public_wire' : 'internal_control';
  if (!allSchemaNames.includes(name) || visibility.schemas.find(({ file }) => file === name)?.visibility !== expectedVisibility) {
    throw new Error(`release_freeze_post_freeze_schema_invalid:${name}`);
  }
}
for (const [file, frozenHash] of frozenPriceHashes) {
  if (!priceFiles.includes(file)) throw new Error(`release_freeze_frozen_price_unknown:${file}`);
  if (await sha256(file) === frozenHash) throw new Error(`release_freeze_frozen_price_redundant:${file}`);
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
for (const [name, frozenHash] of frozenFixtureHashes) {
  if (!fixtureNames.includes(name)) throw new Error(`release_freeze_frozen_hash_unknown_fixture:${name}`);
  if (await sha256(path.posix.join('packages/contracts/fixtures', name)) === frozenHash) {
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
const observedCryptoOperationIds = registry.operations.map(({ operationId }) => operationId).filter((operationId) => operationId.startsWith('crypto.')).sort();
if (JSON.stringify(observedCryptoOperationIds) !== JSON.stringify([...currentCryptoOperationIds].sort())) throw new Error('release_freeze_current_crypto_contract_unrecognized');
const internalOperationIds = [
  ...registry.operations.map(({ operationId }) => operationId).filter((operationId) => !publicOperationIds.includes(operationId) && !operationId.startsWith('crypto.')),
  ...frozenCryptoOperationIds,
].sort();
const schemaAggregateHash = hashJson(schemas);
const fixtureAggregateHash = hashJson(fixtures);
const unsigned = {
  schemaVersion: 'clervo.release-candidate-freeze.v1',
  releaseCandidateId: 'clervo-private-core-2026-08-02.2',
  frozenAt: '2026-08-02T16:30:00.000Z',
  state: 'private_core_frozen',
  noPublicDistribution: true,
  baseRegistry: { file: registryFile, version: registry.registryVersion, sha256: frozenRegistrySha256 },
  schemaVisibility: { file: visibilityFile, version: visibility.policyVersion, sha256: hashBytes(frozenVisibilitySource) },
  privateWorkflowCatalog: { file: workflowFile, sha256: frozenWorkflowSha256 },
  coreQualifications: workflows.coreQualifications.map(({ pillar, privateCoreQualified, publicLifecycle }) => ({ pillar, privateCoreQualified, publicLifecycle })),
  operationSet: {
    publicOperationIds,
    internalOperationIds,
    total: publicOperationIds.length + internalOperationIds.length,
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
