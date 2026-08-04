import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const text = async (path) => readFile(new URL(path, root), 'utf8');

test('public launch policy exposes only live raw Search through a zero-traffic fail-closed rollout', async () => {
  const policy = await json('infra/production/gcp/public-launch.v1.json');
  assert.equal(policy.publicOrigin, 'https://api.clervo.dev/');
  assert.equal(policy.search.mode, 'live_external');
  assert.equal(policy.search.synthesisEnabled, false);
  assert.equal(policy.search.automaticPaidOverage, false);
  assert.equal(policy.commerce.mode, 'settlement_enabled');
  assert.equal(policy.sandbox.publicRoute, false);
  assert.equal(policy.rollout.deployTrafficPercent, 0);
  assert.equal(policy.rollout.publicInvokerAddedOnlyAfterPromotion, true);
  assert.ok(policy.protectedResources.includes('ai.clervo.dev'));
});

test('public release tooling keeps deployment private until three independent promotion checks pass', async () => {
  const source = await text('scripts/production/gcp-public-launch.mjs');
  assert.match(source, /--no-allow-unauthenticated/u);
  assert.match(source, /--no-traffic/u);
  assert.match(source, /CLERVO_LIVE_SEARCH_SMOKE/u);
  assert.match(source, /CLERVO_X402_CHALLENGE_SMOKE/u);
  assert.match(source, /CLERVO_MONITORING_DELIVERY/u);
  assert.match(source, /add-iam-policy-binding/u);
  assert.match(source, /remove-iam-policy-binding/u);
  assert.match(source, /publicInvokerAddedOnlyAfterPromotion/u);
});

test('API edge publishes only health and Search routes and blocks private Sandbox access', async () => {
  const worker = (await import('../../apps/worker/src/api-edge.js')).default;
  const rootResponse = await worker.fetch(new Request('https://api.clervo.dev/'));
  assert.equal(rootResponse.status, 200);
  assert.equal((await rootResponse.json()).discovery, 'https://clervo.dev/.well-known/clervo.json');
  const internal = await worker.fetch(new Request('https://api.clervo.dev/internal/v1/sandbox/run', { method: 'POST' }));
  assert.equal(internal.status, 404);
  const preflight = await worker.fetch(new Request('https://api.clervo.dev/v1/search/paid', { method: 'OPTIONS' }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /payment-signature/u);
});
