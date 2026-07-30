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
    lifecycle: 'implemented_unverified',
    callable: true,
    paymentImplemented: false,
    deploymentVerified: false,
  });
  const schemaFiles = (await readdir(path.join(root, 'packages/contracts/schemas'))).filter((name) => name.endsWith('.schema.json'));
  assert.equal(Object.keys(document.components.schemas).length, schemaFiles.length);
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

test('discovery publishes the implemented search product without payment or deployment readiness', async () => {
  const discovery = await json('.well-known/clervo.json');
  assert.deepEqual(discovery, createDiscoveryDocument());
  assert.equal(discovery.callable, true);
  assert.equal(discovery.payment.implemented, false);
  assert.equal(discovery.products.length, 1);
  assert.equal(discovery.products[0].productId, 'search.query');
  assert.equal(discovery.products[0].payment.payable, false);
  assert.match(discovery.description, /deployment.*not verified/i);
  assert.deepEqual(await json('catalog.json'), { contractVersion: CONTRACT_VERSION, catalogVersion: discovery.discoveryVersion, products: discovery.products });
});

test('llms.txt publishes search.query and states payment/deployment limitations', async () => {
  const llms = await readFile(path.join(generated, 'llms.txt'), 'utf8');
  assert.equal(llms, createLlmsText());
  assert.match(llms, /^# Clervo Next\n\n> /);
  assert.match(llms, /Callable products: search\.query/);
  assert.match(llms, /x402 payment implementation: not implemented/);
  assert.doesNotMatch(llms, /live service|available now|production-ready/i);
});

test('generation fails closed if implemented routes disappear or payment readiness is injected', () => {
  const unsafeOpenApi = structuredClone(createOpenApiDocument({}));
  delete unsafeOpenApi.paths[SEARCH_FREE_PATH];
  assert.throws(
    () => assertPreviewArtifacts(unsafeOpenApi, createDiscoveryDocument(), createLlmsText()),
    /openapi_search_paths_required/,
  );

  const unsafeDiscovery = structuredClone(createDiscoveryDocument());
  unsafeDiscovery.payment.implemented = true;
  assert.throws(
    () => assertPreviewArtifacts(createOpenApiDocument({}), unsafeDiscovery, createLlmsText()),
    /discovery_must_not_claim_payment/,
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