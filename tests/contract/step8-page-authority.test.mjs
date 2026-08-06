import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Step 8B start page preserves the locked agent-native onboarding promise and approval boundary', async () => {
  const source = await read('apps/site/src/pages/Build.tsx');
  assert.match(source, /Set up Clervo in your agent\./);
  assert.match(source, /No wallet action, payment, or standing spending permission/);
  for (const environment of ['Codex', 'Claude Code', 'Cursor', 'Generic MCP', 'Claude Desktop', 'TypeScript', 'Python', 'HTTP \/ OpenAPI']) assert.ok(source.includes(environment));
  assert.match(source, /Design fixture/);
});

test('Step 8B proof surface uses success and failure evidence language without customer claims', async () => {
  const source = await read('apps/site/src/pages/Proof.tsx');
  assert.match(source, /Proof when work succeeds—and when it doesn’t\./);
  for (const state of ['verified', 'refused', 'unresolved']) assert.ok(source.includes(`state: '${state}'`));
  assert.match(source, /synthetic fixture/);
  assert.match(source, /no customer claim/i);
});

test('Step 8B docs and status use the locked objective-first and canonical-truth headings', async () => {
  const docs = await read('apps/site/src/pages/Docs.tsx');
  const status = await read('apps/site/src/pages/Status.tsx');
  assert.match(docs, /Start from what your agent needs to do\./);
  assert.match(docs, /Five entry paths/);
  assert.match(status, /Current truth without marketing interpretation\./);
  assert.match(status, /No canonical public incident feed is connected yet/);
});

test('Step 8B trust pages preserve the exact locked headings and legal route structure', async () => {
  const source = await read('apps/site/src/pages/Trust.tsx');
  for (const heading of ['Know the maximum before Clervo acts.', 'No number without the method behind it.', 'Authority is explicit, scoped, and inspectable.', 'Terms should explain how the system actually works.']) assert.ok(source.includes(heading));
  assert.match(source, /\['terms', 'privacy', 'payments', 'acceptable-use'\]/);
  assert.match(source, /to=\{`\/legal\/\$\{section\}`\}/);
  assert.match(source, /payable: false/);
});

test('Step 8B canonical app routes Proof and all legal structures without resurrecting legacy nav labels', async () => {
  const source = await read('apps/site/src/App.tsx');
  assert.match(source, /<Proof activation=/);
  for (const route of ['/legal/terms', '/legal/privacy', '/legal/payments', '/legal/acceptable-use']) assert.ok(source.includes(route));
  assert.doesNotMatch(source, />Build</);
  assert.doesNotMatch(source, />Proof Lab</);
});
