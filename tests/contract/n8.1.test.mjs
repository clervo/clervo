import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Step 8A implements the locked Hollow Apex geometry and semantic beam', async () => {
  const source = await read('apps/site/src/components/HollowApex.tsx');
  assert.match(source, /M20 2 38 30H2L20 2/);
  assert.match(source, /M14 18H26/);
  assert.match(source, /#FF3B30/);
  assert.match(source, /#00E5FF/);
  assert.match(source, /#FFC800/);
  assert.match(source, /data-logo-authority="hollow-apex-v1\.0"/);
});

test('Step 8A shell uses canonical locked navigation and setup route', async () => {
  const source = await read('apps/site/src/components/Navigation.tsx');
  for (const label of ['Product', 'Catalog', 'Pricing', 'Docs', 'Status', 'Set up Clervo']) {
    assert.ok(source.includes(label), `missing navigation label: ${label}`);
  }
  assert.match(source, /to="\/start"/);
  assert.match(source, /mobile-navigation-panel/);
  assert.match(source, /aria-modal="true"/);
});

test('Step 8A exposes the locked site routes while preserving safe legacy aliases', async () => {
  const source = await read('apps/site/src/App.tsx');
  for (const route of ['/catalog', '/start', '/proof', '/capabilities/', '/operations/', '/changelog']) {
    assert.ok(source.includes(route), `missing route: ${route}`);
  }
  const router = await read('apps/site/src/router.tsx');
  assert.match(router, /'\/build'.*'\/start'/s);
  assert.match(router, /'\/proof-lab'.*'\/proof'/s);
});

test('Step 8A authority layer locks semantic colors, liquid controls, mobile targets, and reduced motion', async () => {
  const css = await read('apps/site/src/authority.css');
  assert.match(css, /--request:\s*#ff3b30/i);
  assert.match(css, /--qualified:\s*#00e5ff/i);
  assert.match(css, /--verified:\s*#ffc800/i);
  assert.match(css, /\.liquid-capsule/);
  assert.match(css, /min-height:\s*46px/);
  assert.match(css, /\.mobile-menu-trigger/);
  assert.match(css, /prefers-reduced-motion/);
});

test('Step 8A keeps all six permanent capability families visible', async () => {
  const source = await read('apps/site/src/content.ts');
  for (const family of ['Search', 'AI', 'Secure Sandbox', 'Multi-chain RPC', 'Prediction', 'Crypto Intelligence']) {
    assert.ok(source.includes(`title: '${family}'`), `missing family: ${family}`);
  }
});
