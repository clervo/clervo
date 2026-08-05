import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('Gate 4.5 restores six-family authority without asserting fake readiness', async () => {
  const decision = await read(
    'docs/decisions/GATE4_5-SIX-FAMILY-AUTHORITY-CORRECTION-v1-20260805.md',
  );
  const state = await read('docs/CURRENT-STATE.yaml');
  const product = await read('docs/PRODUCT.md');

  for (const family of [
    'Search',
    'AI',
    'Secure Sandbox',
    'Multi-chain RPC',
    'Prediction',
    'Crypto Intelligence',
  ]) {
    assert.match(decision, new RegExp(escaped(family)));
    assert.match(product, new RegExp(escaped(family)));
  }

  assert.match(decision, /Search is first only in the recovery work order\./);
  assert.match(state, /current_gate: 5/);
  assert.match(state, /implementation_authorized: false/);
  assert.doesNotMatch(state, /readiness(_| )percentage/i);

  const nplan3 = await read(
    'docs/decisions/NPLAN.3-SIX-PRODUCT-CORE-FIRST-PLATFORM.md',
  );
  const nplan4 = await read(
    'docs/decisions/NPLAN.4-STANDING-AUTONOMOUS-COMPLETION.md',
  );
  assert.match(nplan3, /^> \*\*Historical restoration notice \(Gate 4\.5\):\*\*/);
  assert.match(nplan4, /^> \*\*Historical restoration notice \(Gate 4\.5\):\*\*/);
  assert.match(decision, /NPLAN\.3's requirement to finish all six cores/);
  assert.match(decision, /NPLAN\.4's standing autonomous exact-ticket program/);
});

test('control verifier passes', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'scripts/verify-product-scope.mjs')],
    { cwd: root, encoding: 'utf8' },
  );

  assert.equal(
    result.status,
    0,
    `verifier failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
});
