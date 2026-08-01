#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = path.join(root, 'apps/api/src/n427s-staging-main.mjs');
const outputPath = path.join(root, 'apps/api/src/n427t-staging-main.mjs');
const source = await readFile(sourcePath, 'utf8');
const sourceSha256 = createHash('sha256').update(source).digest('hex');
if (sourceSha256 !== 'fd79d4a650675e89d98e1375f5545a0f98296c9edd1de487b058c94930e4c492') {
  throw new Error('n427s_staging_source_hash_drift');
}

const generated = source
  .replaceAll('createN427sSourceAdapters', 'createN427tSourceAdapters')
  .replaceAll("../../../infra/n4.27s/source-adapters.mjs", "../../../infra/n4.27t/source-adapters.mjs")
  .replaceAll('N4.27S', 'N4.27T')
  .replaceAll('n4.27s', 'n4.27t')
  .replaceAll('N427S', 'N427T')
  .replaceAll('n427s', 'n427t')
  .replace("['developer_registry', 'npm package zod schema validation']", "['developer_registry', 'npm package ajv current version']");

if (
  generated.includes('createN427sSourceAdapters')
  || generated.includes('CLERVO_N427S')
  || generated.includes('clervo.n4.27s')
  || !generated.includes('createN427tSourceAdapters')
  || !generated.includes('npm package ajv current version')
) throw new Error('n427t_staging_generation_incomplete');

await writeFile(outputPath, generated, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({
  source: 'apps/api/src/n427s-staging-main.mjs',
  sourceSha256: `sha256:${sourceSha256}`,
  output: 'apps/api/src/n427t-staging-main.mjs',
  outputSha256: `sha256:${createHash('sha256').update(generated).digest('hex')}`,
})}\n`);
