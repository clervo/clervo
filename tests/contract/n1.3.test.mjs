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

async function json(relative) {
  return JSON.parse(await readFile(path.join(generated, relative), 'utf8'));
}

test('generated OpenAPI is deterministic, schema-complete, and truthfully exposes only search HTTP paths', async () => {
  const document = await json('openapi.json');
  assert.equal(document.openapi, '3.1.1');
  assert.equal(document.jsonSchemaDialect, 'https://json-schema.org/draft/2020-12/schema');
  assert.deepEqual(Object.keys(document.paths).sort(), [SEARCH_FREE_PATH, SEARCH_PAID_PATH].sort());
  assert.deepEqual(document['x-clervo-status'], {
    lifecycle: 'preview',
    distribution: 'candidate',
    noPublicDistribution: true,
    publicCallable: false,
    paymentImplemented: false,
    deploymentVerified: false,
    releaseCandidateId: 'clervo-private-core-2026-08-02.2',
    interfaceHash: 'sha256:1b32a86f5725499f90d3e2f167f4432563f67bac477a3ca0e552f0958bf26622',
    operationIds: ['search.web', 'search.answer'],
  });
  const schemaFiles = (await readdir(path.join(root, 'packages/contracts/schemas'))).filter((name) => name.endsWith('.schema.json'));
  const visibility = JSON.parse(await readFile(path.join(root, 'packages/catalog/schema-visibility.v1.json'), 'utf8'));
  assert.equal(Object.keys(document.components.schemas).length, publicSchemaFiles(visibility, schemaFiles).length);
});

test('embedded and published schemas compile under Draft 2020-12 with resolved references', async () => {
  const document = await json('openapi.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  for (const schema of Object.values(document.components.schemas)) ajv.addSchema(schema);
  for (const schema of Object.values(document.components.schemas)) assert.ok(ajv.getSchema(schema.$id));
  for (const fileName of await readdir(path.join(generated, 'schemas', CONTRACT_VERSION))) {
    assert.deepEqual(
      JSON.parse(await readFile(path.join(generated, 'schemas', CONTRACT_VERSION, fileName), 'utf8')),
      JSON.parse(await readFile(path.join(root, 'packages/contracts/schemas', fileName), 'utf8')),
    );
  }
});

test('discovery is bound to the frozen private core without claiming public distribution', async () => {
  const discovery = await json('.well-known/clervo.json');
  assert.deepEqual(discovery, createDiscoveryDocument());
  assert.deepEqual(discovery.distribution, {
    state: 'candidate',
    publicAvailable: false,
    callable: false,
    noPublicDistribution: true,
    releaseCandidateId: 'clervo-private-core-2026-08-02.2',
    interfaceHash: 'sha256:1b32a86f5725499f90d3e2f167f4432563f67bac477a3ca0e552f0958bf26622',
  });
  assert.equal(discovery.payment.implemented, false);
  assert.equal(discovery.products.length, 2);
  assert.deepEqual(discovery.products.map(({ productId }) => productId), ['search.web', 'search.answer']);
  assert.ok(discovery.products.every((product) =>
    product.publicAvailable === false
    && product.payment.payable === false
    && product.pricing.model === 'non_payable_mock_fixture'));
  assert.deepEqual(discovery.products.map(({ selection, pricing }) => [selection.synthesize, pricing.displayPrice.amountAtomic]), [[false, '6000'], [true, '12000']]);
  assert.match(discovery.description, /not publicly callable/i);
  assert.equal(discovery.payment.privateProofVerified, true);
  assert.equal(discovery.payment.commercialProof, false);
  assert.deepEqual(await json('catalog.json'), {
    contractVersion: CONTRACT_VERSION,
    catalogVersion: discovery.discoveryVersion,
    distribution: discovery.distribution,
    releaseScope: discovery.releaseScope,
    products: discovery.products,
  });
  assert.equal(discovery.discoveryVersion, '2026-08-02.2');
  assert.equal(discovery.releaseScope.scopeVersion, '2026-08-01.3');
  assert.equal(discovery.releaseScope.firstRevenueRelease.productName, 'Clervo Platform');
  assert.deepEqual(discovery.releaseScope.firstRevenueRelease.requiredPillars, ['search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto_intelligence']);
  assert.equal(discovery.releaseScope.firstRevenueRelease.ready, false);
  assert.deepEqual(discovery.releaseScope.productCore, {
    requiredPillars: ['search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto_intelligence'],
    interfacesFrozen: true,
    compatibilityVerified: true,
    ready: true,
  });
  assert.deepEqual(discovery.releaseScope.pillars.map(({ lifecycle }) => lifecycle), ['preview', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable']);
  assert.deepEqual(discovery.releaseScope.pillars.map(({ coreQualified }) => coreQualified), [true, true, true, true, true, true]);
  assert.ok(discovery.releaseScope.pillars.every(({ release }) => release === 'first_revenue_release'));
});

test('llms.txt publishes the candidate operation set and explicit distribution limitations', async () => {
  const llms = await readFile(path.join(generated, 'llms.txt'), 'utf8');
  assert.equal(llms, createLlmsText());
  assert.match(llms, /^# Clervo\n\n> /);
  assert.match(llms, /Projected operation IDs: search\.web, search\.answer/);
  assert.match(llms, /Public API callable: no/);
  assert.match(llms, /x402 public payment: unavailable/);
  assert.match(llms, /one owner-funded useful result settled and replayed without a second charge/);
  assert.match(llms, /Six product cores: privately qualified and compatibility-frozen/);
  assert.match(llms, /First Revenue Release ready: no/);
  assert.match(llms, /llms\.txt is a documentation map, not a search or AI ranking claim/);
  assert.doesNotMatch(llms, /live service|available now|production-ready/i);
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
