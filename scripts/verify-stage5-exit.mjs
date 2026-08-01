#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPlatformRegistry,
  assertSchemaVisibilityManifest,
  liveIntelligenceSolutionPackIds,
} from '../dist/packages/contracts/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));

export async function verifyStage5Exit() {
  const [gate, stage4, registry, visibility, siteScope] = await Promise.all([
    readJson('docs/evidence/completion-gates/stage5_live_intelligence.json'),
    readJson('docs/evidence/completion-gates/stage4_search_reference_pattern.json'),
    readJson('packages/catalog/platform-registry.v1.json'),
    readJson('packages/catalog/schema-visibility.v1.json'),
    readJson('apps/site/capability-scope.json'),
  ]);
  const schemaFiles = (await readdir(path.join(root, 'packages/contracts/schemas')))
    .filter((file) => file.endsWith('.schema.json')).sort();

  assert.equal(stage4.result, 'passed', 'Stage 4 reference gate must pass');
  assert.equal(stage4.stageExitEvidence.blockingCheckCount, 0, 'Stage 4 blockers must remain zero');
  assert.doesNotThrow(() => assertSchemaVisibilityManifest(visibility, schemaFiles));
  assert.doesNotThrow(() => assertPlatformRegistry(registry, visibility));
  assert.equal(registry.state, 'foundation_unfrozen', 'cross-pillar freeze belongs to Stage 12');
  assert.deepEqual(registry.pillars.map(({ coreQualified }) => coreQualified), [true, false, false, false, false, false]);
  assert.deepEqual(registry.solutionPacks.map(({ packId }) => packId), [...liveIntelligenceSolutionPackIds]);
  for (const operationId of ['search.compare', 'search.monitor', 'search.alert.evaluate', 'search.solution_pack.assemble']) {
    const operation = registry.operations.find((candidate) => candidate.operationId === operationId);
    assert.ok(operation, `${operationId} must be registered`);
    assert.equal(operation.visibility, 'internal', `${operationId} must remain private`);
    assert.equal(operation.route, null, `${operationId} must have no shared public route`);
  }
  const liveIntelligenceSchemas = visibility.schemas.filter(({ file }) => file.startsWith('live-intelligence-'));
  assert.ok(liveIntelligenceSchemas.length >= 9, 'Live Intelligence contract coverage is incomplete');
  assert.ok(liveIntelligenceSchemas.every(({ visibility: value }) => value === 'internal_control'), 'Live Intelligence schemas must remain internal');
  const generatedSchemas = await readdir(path.join(root, 'generated/public/schemas/2026-07-29.1'));
  assert.equal(generatedSchemas.some((file) => file.startsWith('live-intelligence-')), false, 'private schemas leaked into preview discovery');
  assert.equal(siteScope.sharedAccessAndDistribution.ready, false, 'shared distribution cannot be marked ready');
  assert.equal(siteScope.productionWebsite, false, 'prototype cannot be marked production');

  assert.equal(gate.schemaVersion, 'clervo.completion-gate-evidence.v1');
  assert.equal(gate.gateId, 'stage5_live_intelligence');
  assert.equal(gate.result, 'passed');
  assert.equal(gate.qualification.solutionPackCount, liveIntelligenceSolutionPackIds.length);
  assert.equal(gate.qualification.publicSharedSurfaceBegun, false);
  assert.deepEqual(gate.externalEffects, { providerCalls: 0, messagesDelivered: 0, infrastructureSpendUsd: 0, usdcSpent: 0 });
  return Object.freeze({ solutionPacks: liveIntelligenceSolutionPackIds.length, schemas: liveIntelligenceSchemas.length });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyStage5Exit().then((result) => {
    console.log(`stage5 exit verification: PASS (${result.solutionPacks} solution packs, ${result.schemas} private schemas)`);
    console.log('external calls: 0; spend: USD 0; USDC 0');
  }).catch((error) => {
    console.error(`stage5 exit verification: FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
