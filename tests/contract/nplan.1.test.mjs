import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('NPLAN.1 historical decision and result remain preserved', async () => {
  const decision = await readFile(path.join(root, 'docs/decisions/NPLAN.1-FOCUSED-INITIAL-COMMERCIAL-RELEASE.md'), 'utf8');
  const ticket = await readFile(path.join(root, 'docs/tickets/NPLAN.1.md'), 'utf8');
  assert.match(decision, /Initial Commercial Release consists of exactly three product pillars/);
  assert.match(decision, /Stage 5 — AI supply plane/);
  assert.match(ticket, /Focused Initial Commercial Release Amendment/);
  assert.match(ticket, /209\/209/);
});

test('NPLAN.1 remains history rather than current launch authority', async () => {
  const current = await readFile(path.join(root, 'docs/product/CLERVO-LIVE-INTELLIGENCE-LAUNCH-AUTHORITY.md'), 'utf8');
  assert.match(current, /Decision ticket:\*\* NPLAN\.2/);
  assert.match(current, /Completed Stages 0–4, ticket IDs, commits, evidence, and stage records retain/);
});
