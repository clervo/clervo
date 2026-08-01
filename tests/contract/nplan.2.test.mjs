import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('NPLAN.2 Live Intelligence decision and evidence remain historical truth', async () => {
  const ticket = await readFile(path.join(root, 'docs/tickets/NPLAN.2.md'), 'utf8');
  const evidence = await readFile(path.join(root, 'docs/evidence/NPLAN.2-live-intelligence-launch-authority.md'), 'utf8');
  assert.match(ticket, /Clervo\s+Live Intelligence becomes the First Revenue Release/);
  assert.match(ticket, /AI and Sandbox are not First Revenue Release prerequisites/);
  assert.match(evidence, /NPLAN\.2 supersedes only its\s+future release and stage authority/);
  assert.match(evidence, /npm run test:nplan\.2`: 6\/6 passed/);
  assert.match(evidence, /Canonical `npm test`: not run/);
});

test('NPLAN.3 supersedes NPLAN.2 only for forward release and stage authority', async () => {
  const authority = await readFile(path.join(root, 'docs/product/CLERVO-LIVE-INTELLIGENCE-LAUNCH-AUTHORITY.md'), 'utf8');
  assert.match(authority, /Decision ticket:\*\* NPLAN\.3/);
  assert.match(authority, /NPLAN\.3 supersedes NPLAN\.2 only for forward release and stage authority/);
  assert.match(authority, /NPLAN\.1, NPLAN\.2, completed Stages 0–4, prior ticket outcomes, sealed evidence/);
  assert.match(authority, /First Revenue Release:\*\* \*\*Clervo Platform\*\*, comprising all six product/);
});
