import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  CONTRACT_VERSION,
  assertPreviewArtifacts,
  createDiscoveryDocument,
  createLlmsText,
  createOpenApiDocument,
  publicSchemaFiles,
  SEARCH_FREE_PATH,
  SEARCH_PAID_PATH,
} from '../../dist/packages/contracts/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const generated = path.join(root, 'generated/public');
const launchState = JSON.parse(await readFile(path.join(root, 'packages/catalog/launch-state.v1.json'), 'utf8'));

async function json(relative) {
  return JSON.parse(await readFile(path.join(generated, relative), 'utf8'));
}

test('generated OpenAPI is deterministic, schema-complete, and exposes only registry-declared public paths', async () => {
  const [document, discovery] = await Promise.all([json('openapi.json'), json('.well-known/clervo.json')]);
  assert.equal(document.openapi, '3.1.1');
  assert.equal(document.jsonSchemaDialect, 'https://json-schema.org/draft/2020-12/schema');
  // Paths and status advance as products launch. Assert the invariants that
  // must hold at any stage — Search is always present, nothing undeclared is
  // published, and the status block agrees with launch state — rather than
  // freezing the private-candidate snapshot, which failed the build as soon as
  // AI and Sandbox became publicly payable.
  const paths = Object.keys(document.paths).sort();
  assert.ok(paths.includes(SEARCH_FREE_PATH), 'free Search path is required');
  assert.ok(paths.includes(SEARCH_PAID_PATH), 'paid Search path is required');
  const declaredPublicPaths = new Set(discovery.products
    .filter(({ publicAvailable }) => publicAvailable)
    .flatMap(({ routes }) => Object.values(routes)));
  assert.deepEqual(paths, [...declaredPublicPaths].sort(), 'OpenAPI paths must equal the generated public product routes');
  const status = document['x-clervo-status'];
  assert.equal(status.releaseCandidateId, undefined);
  assert.equal(status.interfaceHash, undefined);
  assert.ok(['preview', 'available'].includes(status.lifecycle), `unexpected lifecycle ${status.lifecycle}`);
  assert.equal(status.publicCallable, launchState.distribution.publicApi.publicCallable === true);
  assert.equal(status.paymentImplemented, launchState.paymentProof.publicCustomerPaymentAvailable === true);
  assert.ok(status.operationIds.includes('search.web'), 'search.web must stay published');
  const schemaFiles = (await readdir(path.join(root, 'packages/contracts/schemas'))).filter((name) => name.endsWith('.schema.json'));
  const visibility = JSON.parse(await readFile(path.join(root, 'packages/catalog/schema-visibility.v1.json'), 'utf8'));
  assert.equal(Object.keys(document.components.schemas).length, publicSchemaFiles(visibility, schemaFiles).filter((name) => name !== 'product-scope.schema.json').length);
  assert.equal(document.components.schemas.ProductScope, undefined);
});

test('embedded and published schemas compile under Draft 2020-12 with resolved references', async () => {
  const document = await json('openapi.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  for (const schema of Object.values(document.components.schemas)) ajv.addSchema(schema);
  for (const schema of Object.values(document.components.schemas)) assert.ok(ajv.getSchema(schema.$id));
  for (const fileName of await readdir(path.join(generated, 'schemas', CONTRACT_VERSION))) {
    const published = JSON.parse(await readFile(path.join(generated, 'schemas', CONTRACT_VERSION, fileName), 'utf8'));
    const internal = JSON.parse(await readFile(path.join(root, 'packages/contracts/schemas', fileName), 'utf8'));
    if (fileName === 'search-http-result.schema.json') {
      assert.deepEqual(published.properties.productId.enum, ['search.web']);
      assert.deepEqual({ ...published, properties: { ...published.properties, productId: internal.properties.productId } }, internal);
    } else assert.deepEqual(published, internal);
  }
});

test('public discovery excludes private release bookkeeping and agrees with live launch state', async () => {
  const discovery = await json('.well-known/clervo.json');
  assert.equal(discovery.distribution.releaseCandidateId, undefined);
  assert.equal(discovery.distribution.interfaceHash, undefined);
  assert.equal(discovery.releaseScope, undefined);
  assert.equal(discovery.distribution.callable, launchState.distribution.publicApi.publicCallable === true);
  assert.equal(discovery.payment.publicAvailable, launchState.paymentProof.publicCustomerPaymentAvailable === true);
  assert.equal(discovery.payment.network, 'eip155:8453');
  assert.equal(discovery.payment.asset, 'USDC');
  const productIds = discovery.products.map(({ productId }) => productId);
  assert.ok(productIds.includes('search.web'), 'search.web must stay published');
  assert.equal(productIds.includes('search.answer'), false, 'non-callable search.answer must stay out of public inventory');
  // Anything advertised as payable must carry a real price, never a mock
  // fixture. displayPrice is null for request-derived quotes such as ai.chat,
  // where the exact maximum charge is computed per request.
  for (const product of discovery.products) {
    if (product.payment.payable !== true) continue;
    assert.notEqual(product.pricing.model, 'non_payable_mock_fixture', `${product.productId}: payable product must not advertise a mock fixture price`);
    if (product.pricing.displayPrice === null) continue;
    assert.match(String(product.pricing.displayPrice.amountAtomic), /^\d+$/u, `${product.productId}: payable product needs an atomic amount`);
  }
  assert.doesNotMatch(discovery.description, /live service|available now|production-ready/iu);
  assert.equal(discovery.payment.privateProofVerified, undefined);
  assert.equal(discovery.payment.commercialProof, undefined);
  assert.deepEqual(await json('catalog.json'), {
    contractVersion: CONTRACT_VERSION,
    catalogVersion: discovery.discoveryVersion,
    distribution: discovery.distribution,
    products: discovery.products,
    observedTruth: discovery.observedTruth,
  });
  assert.equal(discovery.discoveryVersion, '2026-08-02.2');
});

test('llms.txt matches the generator and states public status truthfully', async () => {
  const llms = await readFile(path.join(generated, 'llms.txt'), 'utf8');
  // Not compared byte-for-byte against createLlmsText(): the generator calls it
  // with the live projection and then appends per-product sections, so a
  // no-argument call here reproduces only the frozen private-candidate default.
  // That mismatch is what made this test demand "Public API callable: no" and
  // "x402 public payment: unavailable" as literals, which in turn kept the
  // published llms.txt frozen at "not publicly callable and receiving no public
  // traffic" while the API was settling payments. Staleness is caught instead
  // by the acceptance run, which regenerates generated/public and leaves a
  // dirty tree if the checked-in files drift.
  assert.match(llms, /^# Clervo\n\n> /);
  assert.match(llms, /x402 owner-funded proof: settled outcomes are reported per product in the generated proof table/);
  assert.match(llms, /llms\.txt is a documentation map, not a search or AI ranking claim/);
  assert.doesNotMatch(llms, /live service|available now|production-ready/i);
  // Status lines are generated from launch state, so assert their shape rather
  // than a frozen value. These previously asserted "Public API callable: no"
  // and "x402 public payment: unavailable" as literals, which meant that
  // regenerating llms.txt after Search, AI, and Sandbox went public broke the
  // build. The file therefore stayed frozen, publicly telling agents the API
  // was not callable while it was settling payments.
  assert.match(llms, /^- Public API callable: (yes|no)$/mu);
  assert.match(llms, /^- x402 public payment: .+$/mu);
  const discovery = await json('.well-known/clervo.json');
  const expectedPublicOperations = discovery.products
    .filter(({ publicAvailable }) => publicAvailable)
    .flatMap(({ operationId, operationIds }) => operationIds ?? [operationId]);
  const operationLine = llms.split('\n').find((line) => line.startsWith('- Public operation IDs: '));
  assert.ok(operationLine !== undefined, 'llms.txt must publish its operation identities');
  assert.deepEqual(operationLine.slice('- Public operation IDs: '.length).split(', '), expectedPublicOperations);
  // Whatever the status is, it must agree with launch state.
  const publiclyCallable = /^- Public API callable: yes$/mu.test(llms);
  assert.equal(
    publiclyCallable,
    launchState.distribution.publicApi.publicCallable === true,
    'llms.txt public-callable claim disagrees with launch state',
  );
  if (publiclyCallable) {
    assert.doesNotMatch(llms, /not publicly callable|receiving no public traffic/u);
    assert.doesNotMatch(llms, /^- x402 public payment: unavailable$/mu);
  }
});

test('generation fails closed if routes disappear or public availability is injected', () => {
  const unsafeOpenApi = structuredClone(createOpenApiDocument({}));
  delete unsafeOpenApi.paths[SEARCH_FREE_PATH];
  assert.throws(
    () => assertPreviewArtifacts(unsafeOpenApi, createDiscoveryDocument(), createLlmsText()),
    /openapi_search_paths_required/,
  );

  const unsafeDiscovery = structuredClone(createDiscoveryDocument());
  unsafeDiscovery.distribution.callable = true;
  assert.throws(
    () => assertPreviewArtifacts(createOpenApiDocument({}), unsafeDiscovery, createLlmsText()),
    /discovery_distribution_claim_unsafe/,
  );

  const falseQualification = structuredClone(createDiscoveryDocument());
  falseQualification.releaseScope.productCore.interfacesFrozen = false;
  assert.throws(
    () => assertPreviewArtifacts(createOpenApiDocument({}), falseQualification, createLlmsText()),
    /discovery_product_scope_invalid/,
  );
});

test('generated public artifacts contain no common secret material', async () => {
  const files = [
    path.join(generated, 'openapi.json'),
    path.join(generated, 'catalog.json'),
    path.join(generated, '.well-known/clervo.json'),
    path.join(generated, 'llms.txt'),
  ];
  const contents = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
  assert.doesNotMatch(contents, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|Bearer\s+[A-Za-z0-9._-]+|api[_-]?key\s*[:=]/i);
});
