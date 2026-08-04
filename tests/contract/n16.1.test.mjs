import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PUBLIC_SEARCH_DISTRIBUTION_PROJECTION,
  assertPublicArtifacts,
  createDiscoveryDocument,
  createLlmsText,
  createOpenApiDocument,
} from '../../dist/packages/contracts/src/index.js';

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
  assert.equal(policy.rollout.publicAccessEnabledOnlyAfterPromotion, true);
  assert.equal(policy.rollout.publicAccessMethod, 'cloud_run_invoker_iam_check_disabled');
  assert.equal(policy.edge.sharedSecret, 'clervo-production-edge-authorization');
  assert.ok(policy.protectedResources.includes('ai.clervo.dev'));
});

test('public release tooling keeps deployment private until three independent promotion checks pass', async () => {
  const source = await text('scripts/production/gcp-public-launch.mjs');
  assert.match(source, /--no-allow-unauthenticated/u);
  assert.match(source, /--no-traffic/u);
  assert.match(source, /CLERVO_LIVE_SEARCH_SMOKE/u);
  assert.match(source, /CLERVO_X402_CHALLENGE_SMOKE/u);
  assert.match(source, /CLERVO_MONITORING_DELIVERY/u);
  assert.match(source, /--no-invoker-iam-check/u);
  assert.match(source, /--invoker-iam-check/u);
  assert.match(source, /publicAccessEnabledOnlyAfterPromotion/u);
  assert.match(source, /CLERVO_EDGE_AUTHORIZATION_SECRET_VERSION/u);
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

test('public Search discovery exposes only the exact verified raw product and preserves commercial boundaries', () => {
  const projection = PUBLIC_SEARCH_DISTRIBUTION_PROJECTION;
  const openapi = createOpenApiDocument({}, projection);
  const discovery = createDiscoveryDocument(projection);
  const llms = createLlmsText(projection);
  assert.doesNotThrow(() => assertPublicArtifacts(openapi, discovery, llms, projection));
  assert.equal(openapi['x-clervo-status'].distribution, 'public_preview');
  assert.equal(discovery.distribution.callable, true);
  assert.equal(discovery.payment.publicAvailable, true);
  assert.equal(discovery.payment.commercialProof, false);
  const raw = discovery.products.find(({ productId }) => productId === 'search.web');
  const answer = discovery.products.find(({ productId }) => productId === 'search.answer');
  assert.equal(raw.publicAvailable, true);
  assert.equal(raw.payment.payable, true);
  assert.equal(raw.pricing.displayPrice.asset, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  assert.equal(raw.pricing.displayPrice.amountAtomic, '6000');
  assert.equal(answer.publicAvailable, false);
  assert.equal(answer.payment.payable, false);
  assert.match(llms, /no customer revenue or demand claimed/iu);
});
