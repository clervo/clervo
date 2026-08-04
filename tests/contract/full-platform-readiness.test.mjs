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
  const aggregate = Math.round(readiness.pillars.reduce((total, { readinessBasisPoints }) => total + readinessBasisPoints, 0) / readiness.pillars.length);
  assert.equal(readiness.scoring.aggregateReadinessBasisPoints, aggregate);
  assert.equal(aggregate, 4792);
  assert.equal(readiness.executionOrder[0], 'launch_public_search_revenue_wedge');
  assert.equal(readiness.executionOrder.at(-1), 'complete_external_paid_first_revenue_release');
});

test('resumable instructions point to one continuous revenue finish line without changing scope', async () => {
  const [agents, state, finishLine] = await Promise.all([
    read('AGENTS.md'),
    read('docs/product/CURRENT-ENGINEERING-STATE.md'),
    read('docs/product/FULL-PLATFORM-REVENUE-FINISH-LINE.md'),
  ]);
  assert.ok(agents.split('\n').length <= 150);
  assert.match(agents, /FULL-PLATFORM-REVENUE-FINISH-LINE\.md/u);
  assert.match(state, /Customer-functional paid readiness is currently 47\.92%/u);
  assert.match(state, /public Search preview is externally verified/u);
  assert.match(finishLine, /The two finish lines/u);
  assert.match(finishLine, /Customer-functional definition/u);
  assert.match(finishLine, /Launch AI/u);
  assert.match(finishLine, /Launch Secure Sandbox/u);
  assert.match(finishLine, /Launch RPC/u);
  assert.match(finishLine, /Launch Prediction Intelligence/u);
  assert.match(finishLine, /Launch Crypto Intelligence/u);
  assert.match(finishLine, /Full Platform First Revenue Release/u);
});
