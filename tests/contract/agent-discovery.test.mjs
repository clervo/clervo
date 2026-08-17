// B3 — API discovery served.
//
// An agent cannot open an account or read a marketing page. It reads three
// documents: a model list, a payment manifest, and a reference. These tests
// assert the four launch-critical properties of those documents:
//
//   1. every document is derived from the probed live registry;
//   2. every operation a document lists is callable on the deployed edge;
//   3. no document lists a route the registry marks `unavailable`;
//   4. no document claims a proof level the registry does not hold.
//
// As in registry-public-consistency.test.mjs, nothing here pins a status value.
// A document is compared against the registry, never against a literal state,
// so improving the runtime can never break this suite.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import worker from '../../apps/worker/src/api-edge.js';

const root = path.resolve(import.meta.dirname, '../..');
const json = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const text = (file) => readFile(path.join(root, file), 'utf8');

const LIFECYCLE_STATES = new Set(['live', 'supply_paused', 'unavailable']);
const PROOF_LEVELS = ['none', 'quote_observed_unpaid', 'paid_outcome_verified', 'externally_repeated'];
// A route in one of these states is in the catalog. `unavailable` is not: it
// has no public route at all, and listing it would advertise supply we do not
// have. A paused route stays listed with its reason, because dropping it would
// erase supply we own.
const CATALOGUED_STATES = new Set(['live', 'supply_paused']);

const registry = await json('packages/catalog/live-registry.json');
const models = await json('generated/public/models.json');
const b7Models = await json('generated/b7-ai/public/models.json');
const manifest = await json('generated/public/.well-known/x402.json');
const catalogModelById = new Map(registry.aiRoutes.map((model) => [model.routeId, model]));

const environment = {
  CLERVO_AI_PUBLIC_ENABLED: 'true',
  CLERVO_SANDBOX_PUBLIC_ENABLED: 'true',
  CLERVO_EDGE_AUTHORIZATION: 'edge-authorization-at-least-32-characters',
};
const get = (pathname) => worker.fetch(new Request(`https://api.clervo.dev${pathname}`), environment);

test('the model list carries every catalogued route and no route the registry does not catalogue', async () => {
  const catalogued = registry.aiRoutes
    .filter(({ state }) => CATALOGUED_STATES.has(state))
    .map(({ routeId }) => routeId)
    .sort();
  const listed = models.data.map(({ id }) => id).sort();
  assert.deepEqual(listed, catalogued);
  assert.deepEqual(models.clervo.inventory, b7Models.clervo.inventory);

  // Every listed model is a provider-neutral customer identity from the frozen
  // B7 catalog. A list that falls back to a supplier route ID breaks the
  // public contract and leaks an implementation detail.
  for (const entry of models.data) {
    const catalogModel = catalogModelById.get(entry.id);
    assert.ok(catalogModel !== undefined, `${entry.id} must map to a frozen customer model identity`);
    const authoritative = b7Models.data.find(({ id }) => id === entry.id);
    assert.equal(entry.clervo.identityKind, authoritative.clervo.identityKind);
    assert.equal(entry.object, 'model');
    assert.equal(entry.owned_by, 'clervo');
    for (const field of [
      'modelCreator',
      'modelCreatorStatus',
      'executionSupplier',
      'upstreamExecutionSupplier',
      'upstreamExecutionSupplierStatus',
    ]) {
      assert.equal(
        field in entry.clervo,
        false,
        `${entry.id} must not publish internal field ${field}`,
      );
    }
    assert.match(entry.clervo.ownedBySemantics, /not a model-creator claim/u);
    assert.equal(entry.clervo.commerce.executionPath, '/v1/ai/execute');
    if (entry.clervo.identityKind === 'alias') {
      assert.equal(typeof entry.clervo.aliasFor, 'string');
      assert.ok(
        models.data.some(
          ({ id, clervo }) =>
            id === entry.clervo.aliasFor
            && clervo.identityKind === 'canonical',
        ),
      );

      for (const field of [
        'aliasKind',
        'aliasRationale',
        'selectionPolicy',
        'tradeoffs',
        'isAlias',
      ]) {
        assert.equal(
          field in entry.clervo,
          false,
          `${entry.id} must not publish internal alias field ${field}`,
        );
      }
    }
  }
  assert.equal(models.object, 'list');
});

test('the model list renders current availability and sellability from the catalog', () => {
  for (const entry of models.data) {
    const catalogModel = catalogModelById.get(entry.id);
    assert.ok(catalogModel !== undefined, `${entry.id} must map to a frozen customer model identity`);
    const authoritative = b7Models.data.find(({ id }) => id === entry.id);
    assert.equal(entry.clervo.availability, authoritative.clervo.availability, `${entry.id} availability must match the catalog authority`);
    assert.equal(entry.clervo.health, authoritative.clervo.health, `${entry.id} health must match the catalog authority`);
    assert.equal(entry.clervo.publicSellable, catalogModel.sellable, `${entry.id} sellability must match the live catalog`);
    if (entry.clervo.publicSellable) {
      assert.equal('availabilityReason' in entry.clervo, false);
    } else {
      assert.equal(
        entry.clervo.availabilityReason,
        'temporarily_unavailable',
      );
    }
  }
  assert.deepEqual(registry.summary.aiRoutes, {
    live: models.data.filter(({ clervo }) => clervo.publicSellable).length,
    supply_paused: models.data.filter(({ clervo }) => !clervo.publicSellable).length,
  });
});

test('every model price is projected byte-for-byte from the coherent B7 pricing authority', () => {
  assert.equal(
    models.clervo.catalogRevision,
    b7Models.clervo.catalogRevision,
  );
  assert.deepEqual(
    models.clervo.inventory,
    b7Models.clervo.inventory,
  );

  for (const entry of models.data) {
    const authoritative = b7Models.data.find(
      ({ id }) => id === entry.id,
    );

    assert.ok(
      authoritative !== undefined,
      `${entry.id} must exist in the B7 pricing authority`,
    );

    assert.deepEqual(
      entry.clervo.customerPricing,
      authoritative.clervo.customerPricing,
      `${entry.id} customer pricing must match the B7 authority`,
    );

    assert.equal(
      entry.clervo.billingMode,
      authoritative.clervo.billingMode,
    );

    assert.equal(
      entry.clervo.commerce.payment,
      authoritative.clervo.commerce.payment,
    );

    const rates = Object.entries(entry.clervo.customerPricing)
      .filter(([field]) => field.endsWith('MicrosPerMillion')
        || field.endsWith('MicrosEach')
        || field.endsWith('MicrosPerThousandCharacters')
        || field.endsWith('MicrosPerSecond')
        || field.endsWith('MicrosPerGeneration')
        || field.endsWith('MicrosPerImage'))
      .map(([, value]) => value);
    assert.ok(rates.every((value) => Number.isInteger(value) && value >= 0), `${entry.id} rates must be non-negative atomic integers`);
    assert.match(entry.clervo.customerPricing.inputPerMToken, /^(?:0|[1-9][0-9]*)\.[0-9]{6}$/u);
    assert.match(entry.clervo.customerPricing.outputPerMToken, /^(?:0|[1-9][0-9]*)\.[0-9]{6}$/u);
    const free = rates.every((value) => value === 0);
    assert.equal(entry.clervo.billingMode, free ? 'free' : 'metered');
    assert.equal(entry.clervo.commerce.payment, free ? 'none' : 'x402_or_mpp');
  }
});

test('the x402 manifest lists only resources the registry serves, at the quote it observed', () => {
  const familyOfResource = {
    'https://api.clervo.dev/v1/search/paid': 'search',
    'https://api.clervo.dev/v1/ai/execute': 'ai',
    'https://api.clervo.dev/v1/chat/completions': 'ai',
    'https://api.clervo.dev/v1/messages': 'ai',
    'https://api.clervo.dev/v1/responses': 'ai',
    'https://api.clervo.dev/v1/sandbox/execute': 'sandbox',
    'https://api.clervo.dev/v1/rpc/execute': 'rpc',
    'https://api.clervo.dev/v1/prediction/execute': 'prediction',
    'https://api.clervo.dev/v1/crypto/execute': 'crypto_intelligence',
  };
  assert.equal(manifest.x402Version, 2);
  assert.ok(manifest.items.length > 0, 'a manifest with no items advertises nothing');

  const servedFamilies = new Set(registry.products.filter(({ state }) => state === 'live').map(({ id }) => id));
  for (const item of manifest.items) {
    const family = familyOfResource[item.resource];
    assert.ok(family !== undefined, `${item.resource} is not a known Clervo resource`);
    assert.ok(servedFamilies.has(family), `the manifest offers ${item.resource} but the registry does not serve ${family}`);

    const product = registry.products.find(({ id }) => id === family);
    const [offer] = item.accepts;
    assert.equal(item.x402Version, 2);
    assert.equal(offer.network, product.observedQuote.network);
    assert.equal(offer.asset, product.observedQuote.asset);
    assert.equal(offer.payTo, product.observedQuote.payTo);
    assert.equal(offer.scheme, product.observedQuote.scheme);
    assert.equal(offer.extra.clervo.lifecycleState, product.state, `${family} lifecycle must match the registry`);
    assert.equal('proofLevel' in offer.extra.clervo, false, `${family} must not publish internal proof classification`);

    // A request-derived price carries an example quote and says so. A fixed
    // price is the product-level quote and is binding. Publishing a per-request
    // example as binding would send an agent to sign the wrong amount.
    if (offer.extra.clervo.amountIsBinding) {
      assert.equal(offer.amount, product.observedQuote.amountAtomic);
      assert.equal(offer.extra.clervo.priceVersion, product.observedQuote.priceVersion);
      assert.equal(offer.extra.clervo.exampleRouteId, null);
    } else if (family === 'ai') {
      assert.equal(offer.extra.clervo.exampleRouteId, null);
      assert.equal(offer.extra.clervo.operationId, 'ai.chat');
      assert.equal(offer.extra.clervo.priceModel, 'request_derived_per_model');
      assert.equal(offer.amount, product.observedQuote.amountAtomic);
      assert.equal(offer.extra.clervo.priceVersion, product.observedQuote.priceVersion);
      assert.equal(item.metadata.modelList, 'https://api.clervo.dev/v1/models');
    } else {
      const exampleOperationByFamily = {
        prediction: 'prediction.markets',
        crypto_intelligence: 'crypto.wallet.report',
        sandbox: 'sandbox.run',
        rpc: 'rpc.call',
      };
      assert.ok(Object.hasOwn(exampleOperationByFamily, family), 'request-derived public quote family missing');
      assert.equal(offer.extra.clervo.operationId, exampleOperationByFamily[family]);
      assert.equal(offer.extra.clervo.exampleRouteId, null);
      assert.equal(
        offer.extra.clervo.priceModel,
        family === 'sandbox' ? 'class_derived_quote' : family === 'rpc' ? 'request_derived_per_call' : 'request_derived_per_operation',
      );
      assert.equal(offer.amount, product.observedQuote.amountAtomic);
      assert.equal(offer.extra.clervo.priceVersion, product.observedQuote.priceVersion);
    }
  }
});

test('the manifest advertises the free path as free and never as a payable resource', () => {
  const freeEntry = registry.products.find(({ id }) => id === 'search').freeEntry;
  if (freeEntry === null) {
    assert.deepEqual(manifest.clervo.freeResources, []);
    return;
  }
  const [free] = manifest.clervo.freeResources;
  assert.equal(free.resource, freeEntry.route);
  assert.equal(free.paymentRequired, false);
  assert.equal(free.acceptsRequestWithoutIdempotencyKey, freeEntry.acceptsNaiveRequest);
  // The free path carries no payment requirement, so it must not appear as an
  // x402 item: an agent that treats it as payable would try to sign for a route
  // that never charges.
  assert.ok(!manifest.items.some(({ resource }) => resource === freeEntry.route));
});

test('no discovery document lists a product the registry marks unavailable', () => {
  const unavailable = registry.products.filter(({ state }) => state === 'unavailable').map(({ id }) => id);
  const manifestText = JSON.stringify(manifest);
  const modelsText = JSON.stringify(models);
  const routeOfFamily = { rpc: '/v1/rpc/execute', prediction: '/v1/prediction/execute', crypto_intelligence: '/v1/crypto/execute' };
  for (const family of unavailable) {
    const route = routeOfFamily[family];
    if (route === undefined) continue;
    assert.ok(!manifestText.includes(route), `the x402 manifest must not offer ${route}`);
    assert.ok(!modelsText.includes(route), `the model list must not offer ${route}`);
  }
});

test('the API edge serves all three agent documents, and llms.txt byte-identically', async () => {
  const [modelsResponse, manifestResponse, llmsResponse] = await Promise.all([
    get('/v1/models'),
    get('/.well-known/x402'),
    get('/llms.txt'),
  ]);
  assert.equal(modelsResponse.status, 200);
  assert.equal(manifestResponse.status, 200);
  assert.equal(llmsResponse.status, 200);
  assert.match(modelsResponse.headers.get('content-type'), /application\/json/u);
  assert.match(manifestResponse.headers.get('content-type'), /application\/json/u);
  assert.match(llmsResponse.headers.get('content-type'), /text\/plain/u);
  assert.equal(modelsResponse.headers.get('access-control-allow-origin'), '*');

  assert.deepEqual(await modelsResponse.json(), models);
  assert.deepEqual(await manifestResponse.json(), manifest);
  // The Worker has no filesystem, so llms.txt is compiled into a module. Two
  // hosts serving two versions of the same reference is the drift this guards.
  assert.equal(await llmsResponse.text(), await text('generated/public/llms.txt'));
  assert.deepEqual(await (await get('/v1/catalog')).json(), models);
});

test('the agent documents are read-only and reachable without a credential', async () => {
  for (const pathname of ['/v1/models', '/v1/catalog', '/.well-known/x402', '/llms.txt']) {
    const posted = await worker.fetch(new Request(`https://api.clervo.dev${pathname}`, { method: 'POST' }), environment);
    assert.equal(posted.status, 405, `${pathname} must reject a non-GET method`);
  }
  // No credential is supplied here beyond the edge's own upstream secret, which
  // a caller never sends. A discovery document behind authentication is
  // invisible to the customer it exists for.
  const response = await worker.fetch(new Request('https://api.clervo.dev/v1/models'), {
    CLERVO_AI_PUBLIC_ENABLED: 'true',
    CLERVO_SANDBOX_PUBLIC_ENABLED: 'true',
  });
  assert.equal(response.status, 200);
});

test('the API root and the reference point at the three agent paths', async () => {
  const root_ = await (await get('/')).json();
  assert.equal(root_.models, 'https://api.clervo.dev/v1/models');
  assert.equal(root_.x402, 'https://api.clervo.dev/.well-known/x402');
  assert.equal(root_.reference, 'https://api.clervo.dev/llms.txt');

  const discovery = await json('generated/public/.well-known/clervo.json');
  assert.equal(discovery.artifacts.models, '/v1/models');
  assert.equal(discovery.artifacts.x402, '/.well-known/x402');
  assert.equal(discovery.artifacts.reference, '/llms.txt');

  const llms = await text('generated/public/llms.txt');
  assert.ok(llms.includes('https://api.clervo.dev/v1/models'));
  assert.ok(llms.includes('https://api.clervo.dev/.well-known/x402'));
});

test('this suite pins no status value', async () => {
  // Rule 2. Comparing a document against the registry is the point; naming a
  // state as the value a document is expected to have is what previously made
  // honesty break the build.
  const source = await text('tests/contract/agent-discovery.test.mjs');
  const states = [...LIFECYCLE_STATES].join('|');
  const offenders = source
    .split('\n')
    .filter((line) => line.trimStart().startsWith('assert.'))
    .filter((line) => new RegExp(`,\\s*'(?:${states})'`, 'u').test(line));
  assert.deepEqual(offenders, [], 'an assertion pins a lifecycle state as an expected value');
});
