#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const siteScope = JSON.parse(await readFile(path.join(root, 'apps/site/capability-scope.json'), 'utf8'));
  assert.equal(siteScope.artifact, 'prototype_scope_only');
  assert.equal(siteScope.productionWebsite, false);
  assert.equal(siteScope.company.identity, 'outcome infrastructure for agents');
  assert.equal(siteScope.firstRevenueRelease.productId, 'clervo.live_intelligence');
  assert.deepEqual(siteScope.firstRevenueRelease.requiredPillars, ['search']);
  assert.equal(siteScope.firstRevenueRelease.ready, false);
  assert.deepEqual(siteScope.additiveExpansion.map(({ id }) => id), ['ai', 'sandbox']);
  assert.deepEqual(siteScope.laterPlatformExpansion.map(({ id }) => id), ['rpc', 'prediction', 'crypto_intelligence']);
  assert.deepEqual(siteScope.laterPlatformExpansion.map(({ lifecycle }) => lifecycle), ['planned_post_launch', 'planned_post_launch', 'planned_post_launch']);

  const sources = await Promise.all([
    'README.md',
    'AI_BUILDER.md',
    'apps/site/PROTOTYPE-COPY.md',
    'docs/brand/FOCUSED-LAUNCH-SCOPE-v1.md',
    'docs/marketing/INITIAL-COMMERCIAL-RELEASE.md',
    'docs/product/CLERVO-LIVE-INTELLIGENCE-LAUNCH-AUTHORITY.md',
  ].map(async (relative) => [relative, await readFile(path.join(root, relative), 'utf8')]));

  for (const [relative, source] of sources) {
    assert.match(source, /Clervo Live Intelligence/u, `${relative}: First Revenue Release product missing`);
    assert.match(source, /Find → Understand → Act/u, `${relative}: permanent expansion narrative missing`);
    assert.doesNotMatch(source, /Initial Commercial Release (?:requires|pillars are).*Search.*AI.*Sandbox/isu, `${relative}: superseded release prerequisite`);
  }
  assert.match(sources.find(([relative]) => relative === 'AI_BUILDER.md')[1], /Discover → Retrieve → Structure → Verify → Monitor/u);
  assert.doesNotMatch(sources.find(([relative]) => relative === 'apps/site/PROTOTYPE-COPY.md')[1], /available now|production-ready/iu);
  console.log('product scope consistency: PASS');
} catch (error) {
  console.error(`product scope consistency: FAIL: ${error.message}`);
  process.exitCode = 1;
}
