#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  composeAiProductCatalog,
  createAiPublicDiscoveryProjection,
  createAiPublicModelList,
} from '../../dist/services/ai/src/product-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function argumentsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!['--supply', '--identity-registry', '--commercial-permissions', '--pricing-policies', '--competitor-evidence', '--strategic-overrides', '--at', '--output-directory'].includes(name) || value === undefined) throw new TypeError('qualified_ai_catalog_argument_invalid');
    result[name.slice(2)] = value;
  }
  for (const required of ['supply', 'at', 'output-directory']) if (result[required] === undefined) throw new TypeError(`qualified_ai_catalog_argument_missing:${required}`);
  return result;
}

async function json(file) {
  return JSON.parse(await readFile(path.resolve(root, file), 'utf8'));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const args = argumentsFrom(process.argv.slice(2));
const [supplyCatalog, identityRegistry, pricingPolicies, competitorCatalog, commercialCatalog, strategicCatalog] = await Promise.all([
  json(args.supply),
  json(args['identity-registry'] ?? 'packages/catalog/ai-customer-identity-registry.v1.json'),
  json(args['pricing-policies'] ?? 'packages/catalog/ai-product-pricing-policy.v1.json'),
  json(args['competitor-evidence'] ?? 'packages/catalog/ai-competitor-price-evidence.v1.json'),
  json(args['commercial-permissions'] ?? 'packages/catalog/ai-dynamic-commercial-permission.v1.json'),
  json(args['strategic-overrides'] ?? 'packages/catalog/ai-strategic-pricing-overrides.v1.json'),
]);
const catalog = composeAiProductCatalog({
  supplyCatalog,
  identityRegistry,
  pricingPolicies,
  competitorEvidence: competitorCatalog.evidence,
  commercialPermissions: commercialCatalog.decisions,
  strategicOverrides: strategicCatalog.overrides,
  composedAt: args.at,
});
const output = path.resolve(root, args['output-directory']);
await mkdir(path.join(output, 'internal'), { recursive: true });
await mkdir(path.join(output, 'public'), { recursive: true });
await writeFile(path.join(output, 'internal', 'product-catalog.json'), stableJson(catalog));
await writeFile(path.join(output, 'internal', 'identity-registry.json'), stableJson(catalog.identityRegistry));
await writeFile(path.join(output, 'public', 'models.json'), stableJson(createAiPublicModelList(catalog)));
await writeFile(path.join(output, 'public', 'discovery.json'), stableJson(createAiPublicDiscoveryProjection(catalog)));
console.log(`qualified AI catalog composition: PASS (${catalog.internalModels.length} supplied, ${catalog.publicModels.length} catalogued, ${catalog.publicModels.filter(({ publicSellable }) => publicSellable).length} sellable)`);
