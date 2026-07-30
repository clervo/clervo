#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaDirectory = path.join(root, 'packages/contracts/schemas');
const fixtureDirectory = path.join(root, 'packages/contracts/fixtures');
const contractModule = await import(pathToFileURL(path.join(root, 'dist/packages/contracts/src/index.js')));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

try {
  const schemaFiles = (await readdir(schemaDirectory)).filter((name) => name.endsWith('.schema.json')).sort();
  const schemas = new Map();
  for (const name of schemaFiles) {
    const schema = JSON.parse(await readFile(path.join(schemaDirectory, name), 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    ajv.addSchema(schema);
    schemas.set(name.replace('.schema.json', ''), schema.$id);
  }

  const fixtureFiles = (await readdir(fixtureDirectory)).filter((name) => name.endsWith('.json')).sort();
  for (const name of fixtureFiles) {
    const fixture = JSON.parse(await readFile(path.join(fixtureDirectory, name), 'utf8'));
    const validator = ajv.getSchema(schemas.get(fixture.schema));
    assert.ok(validator, `${name}: unknown schema ${fixture.schema}`);
    const valid = validator(fixture.value);
    assert.equal(valid, fixture.valid, `${name}: ${ajv.errorsText(validator.errors)}`);
  }

  assert.equal(contractModule.CONTRACT_VERSION, '2026-07-29.1');
  console.log(`contract validation: PASS (${schemaFiles.length} schemas, ${fixtureFiles.length} fixtures)`);
} catch (error) {
  console.error(`contract validation: FAIL: ${error.message}`);
  process.exitCode = 1;
}