#!/usr/bin/env node

import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const exists = async (relative) => {
  try {
    await access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
};

const families = [
  'Search',
  'AI',
  'Secure Sandbox',
  'Multi-chain RPC',
  'Prediction',
  'Crypto Intelligence',
];

const activeAuthorityPaths = [
  'AGENTS.md',
  'AI_BUILDER.md',
  'README.md',
  'START-HERE.md',
  'docs/PRODUCT.md',
  'docs/CURRENT-STATE.yaml',
  'docs/authority/AUTHORITY-MAP.md',
  'docs/brand/FOCUSED-LAUNCH-SCOPE-v1.md',
  'docs/marketing/INITIAL-COMMERCIAL-RELEASE.md',
  'docs/product/CURRENT-ENGINEERING-STATE.md',
  'docs/product/FULL-PLATFORM-REVENUE-FINISH-LINE.md',
  'docs/decisions/GATE4_5-SIX-FAMILY-AUTHORITY-CORRECTION-v1-20260805.md',
];

const restoredPaths = [
  'docs/decisions/NPLAN.3-SIX-PRODUCT-CORE-FIRST-PLATFORM.md',
  'docs/evidence/NPLAN.3-six-product-core-first-roadmap-audit.md',
  'docs/tickets/NPLAN.3.md',
  'docs/evidence/NPLAN.3R-acceptance-handoff-repair.md',
  'docs/tickets/NPLAN.3R.md',
  'docs/decisions/NPLAN.4-STANDING-AUTONOMOUS-COMPLETION.md',
  'docs/evidence/NPLAN.4-autonomous-completion-and-owner-package.md',
  'docs/tickets/NPLAN.4.md',
];

const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

try {
  const product = await read('docs/PRODUCT.md');
  const state = await read('docs/CURRENT-STATE.yaml');
  const agents = await read('AGENTS.md');
  const decision = await read(
    'docs/decisions/GATE4_5-SIX-FAMILY-AUTHORITY-CORRECTION-v1-20260805.md',
  );
  const authorityMap = await read('docs/authority/AUTHORITY-MAP.md');
  const packageJson = JSON.parse(await read('package.json'));

  for (const family of families) {
    assert.match(product, new RegExp(escaped(family)));
    assert.match(agents, new RegExp(escaped(family)));
  }

  for (const id of [
    'search',
    'ai',
    'secure_sandbox',
    'multi_chain_rpc',
    'crypto_intelligence',
    'prediction',
  ]) {
    assert.match(state, new RegExp(`id: ${id}`));
  }

  assert.match(
    decision,
    /Revenue-first changes how the six-family platform is recovered\./,
  );
  assert.match(decision, /Search is first only in the recovery work order\./);
  assert.match(authorityMap, /Issue `#10`.*is superseded/s);
  assert.equal(
    Object.hasOwn(packageJson.scripts ?? {}, 'test:stage5'),
    false,
    'obsolete test:stage5 must remain retired',
  );

  for (const relative of activeAuthorityPaths) {
    assert.equal(await exists(relative), true, `missing active authority: ${relative}`);
  }

  for (const relative of restoredPaths) {
    assert.equal(await exists(relative), true, `missing restored history: ${relative}`);
  }

  assert.equal(
    await exists('docs/product/SHOP-OPEN-EXECUTION.md'),
    false,
    'Search-only Shop-Open program must not remain active',
  );
  assert.equal(
    await exists(
      'docs/archive/gate4-5-control-reset-20260805/product/SHOP-OPEN-EXECUTION.failed-authority.md',
    ),
    true,
    'failed Shop-Open program must remain archived',
  );

  const combined = (
    await Promise.all(activeAuthorityPaths.map((relative) => read(relative)))
  ).join('\n');

  for (const forbidden of [
    'Only Search matters until the shop opens',
    'The active product is `search.web`',
    'Open the strongest Clervo shop',
  ]) {
    assert.doesNotMatch(combined, new RegExp(escaped(forbidden)));
  }

  assert.match(
    combined,
    /Search being first does not redefine the company, catalog, launch architecture,/,
  );

  console.log('Gate 4.5 six-family authority verification passed.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
