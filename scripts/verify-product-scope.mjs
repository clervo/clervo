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
  assert.deepEqual(siteScope.initialCommercialRelease.map(({ id }) => id), ['search', 'ai', 'sandbox']);
  assert.deepEqual(siteScope.postLaunchExpansion.map(({ id }) => id), ['rpc', 'prediction', 'crypto_intelligence']);
  assert.deepEqual(siteScope.postLaunchExpansion.map(({ lifecycle }) => lifecycle), ['planned_post_launch', 'planned_post_launch', 'planned_post_launch']);

  const sources = await Promise.all([
    'README.md',
    'AI_BUILDER.md',
    'apps/site/PROTOTYPE-COPY.md',
    'docs/brand/FOCUSED-LAUNCH-SCOPE-v1.md',
    'docs/marketing/INITIAL-COMMERCIAL-RELEASE.md',
  ].map(async (relative) => [relative, await readFile(path.join(root, relative), 'utf8')]));

  for (const [relative, source] of sources) {
    assert.match(source, /Search/iu, `${relative}: Search scope missing`);
    assert.match(source, /AI/iu, `${relative}: AI scope missing`);
    assert.match(source, /Sandbox/iu, `${relative}: Sandbox scope missing`);
  }
  assert.match(sources.find(([relative]) => relative === 'AI_BUILDER.md')[1], /Find → Reason → Execute/u);
  assert.doesNotMatch(sources.find(([relative]) => relative === 'apps/site/PROTOTYPE-COPY.md')[1], /available now|production-ready/iu);
  console.log('product scope consistency: PASS');
} catch (error) {
  console.error(`product scope consistency: FAIL: ${error.message}`);
  process.exitCode = 1;
}
