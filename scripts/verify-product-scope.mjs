#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pillarIds = ['search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto_intelligence'];

try {
  const siteScope = JSON.parse(await readFile(path.join(root, 'apps/site/capability-scope.json'), 'utf8'));
  assert.equal(siteScope.artifact, 'prototype_scope_only');
  assert.equal(siteScope.productionWebsite, false);
  assert.equal(siteScope.company.identity, 'outcome infrastructure for agents');
  assert.equal(siteScope.firstRevenueRelease.productId, 'clervo.platform');
  assert.equal(siteScope.firstRevenueRelease.productName, 'Clervo Platform');
  assert.deepEqual(siteScope.firstRevenueRelease.requiredPillars, pillarIds);
  assert.equal(siteScope.firstRevenueRelease.ready, false);
  assert.deepEqual(siteScope.pillars.map(({ id }) => id), pillarIds);
  assert.deepEqual(siteScope.pillars.map(({ lifecycle }) => lifecycle), ['preview', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable']);
  assert.equal(siteScope.sharedAccessAndDistribution.stage, 13);
  assert.equal(siteScope.sharedAccessAndDistribution.prerequisite, 'stage_12_core_and_contract_freeze');
  assert.equal(siteScope.sharedAccessAndDistribution.ready, false);

  const sources = await Promise.all([
    'README.md',
    'AI_BUILDER.md',
    'apps/site/PROTOTYPE-COPY.md',
    'docs/brand/FOCUSED-LAUNCH-SCOPE-v1.md',
    'docs/marketing/INITIAL-COMMERCIAL-RELEASE.md',
  ].map(async (relative) => [relative, await readFile(path.join(root, relative), 'utf8')]));

  for (const [relative, source] of sources) {
    assert.match(source, /Clervo Platform/u, `${relative}: First Revenue Release product missing`);
    assert.match(source, /Find → Understand → Act/u, `${relative}: permanent expansion narrative missing`);
    assert.doesNotMatch(source, /Clervo Live Intelligence (?:is|becomes) (?:the )?First Revenue Release/iu, `${relative}: superseded release product`);
    assert.doesNotMatch(source, /(?:AI|Sandbox|RPC|Prediction|Crypto Intelligence).*(?:after the First Revenue Release|planned.post.launch)/isu, `${relative}: superseded post-launch pillar`);
  }
  assert.match(sources.find(([relative]) => relative === 'AI_BUILDER.md')[1], /all-six \*\*Clervo Platform\*\*/u);
  assert.doesNotMatch(sources.find(([relative]) => relative === 'apps/site/PROTOTYPE-COPY.md')[1], /available now|production-ready/iu);
  console.log('product scope consistency: PASS');
} catch (error) {
  console.error(`product scope consistency: FAIL: ${error.message}`);
  process.exitCode = 1;
}
