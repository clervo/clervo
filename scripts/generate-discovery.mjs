#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaDirectory = path.join(root, 'packages/contracts/schemas');
const outputDirectory = path.join(root, 'generated/public');
const contractModule = await import(pathToFileURL(path.join(root, 'dist/packages/contracts/src/index.js')));

function componentName(fileName) {
  return fileName
    .replace('.schema.json', '')
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(path.join(outputDirectory, 'schemas', contractModule.CONTRACT_VERSION), { recursive: true });

const schemas = {};
for (const fileName of (await readdir(schemaDirectory)).filter((name) => name.endsWith('.schema.json')).sort()) {
  const source = await readFile(path.join(schemaDirectory, fileName), 'utf8');
  const schema = JSON.parse(source);
  schemas[componentName(fileName)] = schema;
  await writeFile(path.join(outputDirectory, 'schemas', contractModule.CONTRACT_VERSION, fileName), stableJson(schema));
}

const openapi = contractModule.createOpenApiDocument(schemas);
const discovery = contractModule.createDiscoveryDocument();
const llms = contractModule.createLlmsText();
contractModule.assertPreviewArtifacts(openapi, discovery, llms);
await writeFile(path.join(outputDirectory, 'openapi.json'), stableJson(openapi));
await mkdir(path.join(outputDirectory, '.well-known'), { recursive: true });
await writeFile(path.join(outputDirectory, '.well-known', 'clervo.json'), stableJson(discovery));
await writeFile(path.join(outputDirectory, 'llms.txt'), llms);

console.log(`discovery generation: PASS (${Object.keys(schemas).length} schemas)`);