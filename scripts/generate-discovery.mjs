#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaDirectory = path.join(root, 'packages/contracts/schemas');
const outputDirectory = path.join(root, 'generated/public');
const contractModule = await import(pathToFileURL(path.join(root, 'dist/packages/contracts/src/index.js')));
const schemaVisibility = JSON.parse(await readFile(path.join(root, 'packages/catalog/schema-visibility.v1.json'), 'utf8'));
const releaseCandidate = JSON.parse(await readFile(path.join(root, 'packages/catalog/release-candidate-freeze.v1.json'), 'utf8'));
const registry = JSON.parse(await readFile(path.join(root, releaseCandidate.baseRegistry.file), 'utf8'));
const onboarding = JSON.parse(await readFile(path.join(root, 'packages/distribution/onboarding.v1.json'), 'utf8'));

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

const { interfaceHash, ...unsignedReleaseCandidate } = releaseCandidate;
if (
  releaseCandidate.state !== 'private_core_frozen'
  || releaseCandidate.noPublicDistribution !== true
  || interfaceHash !== contractModule.hashJson(unsignedReleaseCandidate)
) throw new Error('distribution_release_candidate_invalid');
if (
  releaseCandidate.coreQualifications.length !== 6
  || releaseCandidate.coreQualifications.some(({ privateCoreQualified }) => privateCoreQualified !== true)
) throw new Error('distribution_private_core_qualification_incomplete');
if (
  releaseCandidate.operationSet.publicOperationIds.join(',') !== 'search.web,search.answer'
  || releaseCandidate.operationSet.publicOperationIds.some((operationId) => {
    const operation = registry.operations.find((candidate) => candidate.operationId === operationId);
    const inputVisibility = schemaVisibility.schemas.find(({ schemaId }) => schemaId === operation?.inputSchema)?.visibility;
    const outputVisibility = schemaVisibility.schemas.find(({ schemaId }) => schemaId === operation?.outputSchema)?.visibility;
    return operation?.lifecycle !== 'preview'
      || operation.visibility !== 'internal'
      || operation.route === null
      || inputVisibility !== 'public_wire'
      || outputVisibility !== 'public_wire';
  })
) throw new Error('distribution_operation_projection_invalid');
if (
  releaseCandidate.lifecycleProjection.length !== registry.pillars.length
  || releaseCandidate.lifecycleProjection.some(({ pillarId, lifecycle }) => {
    const pillar = registry.pillars.find((candidate) => candidate.pillarId === pillarId);
    return pillar?.lifecycle !== lifecycle;
  })
) throw new Error('distribution_lifecycle_projection_invalid');

const projection = Object.freeze({
  releaseCandidateId: releaseCandidate.releaseCandidateId,
  interfaceHash,
  noPublicDistribution: true,
  publicOperationIds: Object.freeze([...releaseCandidate.operationSet.publicOperationIds]),
});
if (
  onboarding.schemaVersion !== 'clervo.distribution-onboarding.v1'
  || onboarding.releaseCandidateId !== projection.releaseCandidateId
  || onboarding.interfaceHash !== projection.interfaceHash
  || onboarding.publicCallable !== false
  || onboarding.paymentImplemented !== false
  || onboarding.journey.map(({ step }) => step).join(',') !== 'install,ask,fund,approve,result,receipt'
  || onboarding.recovery.map(({ code }) => code).join(',') !== 'insufficient_funds,wrong_network_or_asset,expired_quote,rejected,timeout,unknown_settlement'
  || onboarding.recovery.some(({ action, retry, problemCodes }) =>
    typeof action !== 'string'
    || action.length < 20
    || !['after_action', 'prohibited_until_reconciled'].includes(retry)
    || !Array.isArray(problemCodes)
    || problemCodes.length < 1
  )
) throw new Error('distribution_onboarding_invalid');

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(path.join(outputDirectory, 'schemas', contractModule.CONTRACT_VERSION), { recursive: true });

const schemas = {};
const allSchemaFiles = (await readdir(schemaDirectory)).filter((name) => name.endsWith('.schema.json')).sort();
const projectedSchemaFiles = contractModule.publicSchemaFiles(schemaVisibility, allSchemaFiles);
for (const fileName of projectedSchemaFiles) {
  const source = await readFile(path.join(schemaDirectory, fileName), 'utf8');
  const schema = JSON.parse(source);
  const declaration = schemaVisibility.schemas.find(({ file }) => file === fileName);
  if (!declaration || declaration.schemaId !== schema.$id) throw new Error(`schema visibility identity mismatch: ${fileName}`);
  schemas[componentName(fileName)] = schema;
  await writeFile(path.join(outputDirectory, 'schemas', contractModule.CONTRACT_VERSION, fileName), stableJson(schema));
}

const openapi = contractModule.createOpenApiDocument(schemas, projection);
const discovery = contractModule.createDiscoveryDocument(projection);
const llms = contractModule.createLlmsText(projection);
const catalog = contractModule.createCatalogDocument(projection);
contractModule.assertPreviewArtifacts(openapi, discovery, llms, projection);
await writeFile(path.join(outputDirectory, 'openapi.json'), stableJson(openapi));
await writeFile(path.join(outputDirectory, 'catalog.json'), stableJson(catalog));
await writeFile(path.join(outputDirectory, 'onboarding.json'), stableJson(onboarding));
await mkdir(path.join(outputDirectory, '.well-known'), { recursive: true });
await writeFile(path.join(outputDirectory, '.well-known', 'clervo.json'), stableJson(discovery));
await writeFile(path.join(outputDirectory, 'llms.txt'), llms);

console.log(`distribution discovery generation: PASS (${projection.publicOperationIds.length} operations, ${Object.keys(schemas).length} schemas)`);
