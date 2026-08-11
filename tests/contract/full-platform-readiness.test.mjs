import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const json = async (path) => JSON.parse(await read(path));

test('full-platform readiness distinguishes private engineering from customer-functional paid release', async () => {
  const readiness = await json('packages/catalog/full-platform-readiness.v1.json');
  assert.equal(readiness.schemaVersion, 'clervo.full-platform-readiness.v1');
  assert.deepEqual(readiness.pillars.map(({ id }) => id), [
    'search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto_intelligence',
  ]);
  assert.equal(readiness.gates.length, 8);
  assert.deepEqual(readiness.finishLines.map(({ id }) => id), [
    'revenue_wedge', 'full_platform_first_revenue_release',
  ]);
  assert.ok(readiness.finishLines.every(({ platformLaunchClaimAllowed }) => platformLaunchClaimAllowed === false));

  const points = { complete: 10_000, partial: 5_000, missing: 0, blocked: 0 };
  for (const pillar of readiness.pillars) {
    assert.deepEqual(Object.keys(pillar.gates), readiness.gates.map(({ id }) => id));
    const expected = Math.round(Object.values(pillar.gates).reduce((total, status) => total + points[status], 0) / readiness.gates.length);
    assert.equal(pillar.readinessBasisPoints, expected, pillar.id);
  }
  const aggregate = Math.floor(readiness.pillars.reduce((total, { readinessBasisPoints }) => total + readinessBasisPoints, 0) / readiness.pillars.length);
  assert.equal(readiness.scoring.aggregateReadinessBasisPoints, aggregate);
  assert.equal(aggregate, 5937);
  assert.equal(readiness.executionOrder[0], 'launch_public_search_revenue_wedge');
  assert.equal(readiness.executionOrder.at(-1), 'complete_external_paid_first_revenue_release');
});

test('agent instructions keep live behavior and canonical launch state above public roadmap prose', async () => {
  const [agents, claude, roadmap] = await Promise.all([
    read('AGENTS.md'),
    read('CLAUDE.md'),
    read('ROADMAP.md'),
  ]);
  assert.ok(agents.split('\n').length <= 150);
  assert.match(agents, /ROADMAP\.md/u);
  assert.match(agents, /CLAUDE\.md/u);
  assert.match(claude, /ROADMAP\.md/u);
  assert.match(claude, /directly\nobserved deployed behavior/u);
  assert.match(claude, /canonical catalog\/launch-state/u);
  // docs/ is an archived research library and must not be cited as authority
  assert.doesNotMatch(agents, /docs\/product\//u);
  assert.doesNotMatch(claude, /docs\/product\//u);
  assert.match(roadmap, /public product-direction roadmap/u);
  assert.match(roadmap, /observed behavior wins/u);
  assert.match(roadmap, /Operational material that would unnecessarily expose or couple production\noperations does \*\*not\*\* belong/iu);
});
