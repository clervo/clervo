#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../../../', import.meta.url);
const paths = [
  'package.json',
  'packages/contracts/src/live-federation.ts',
  'packages/contracts/schemas/connected-retrieval-response.schema.json',
  'packages/contracts/fixtures/connected-retrieval-response-valid.json',
  'packages/contracts/fixtures/connected-retrieval-response-route-invalid.json',
  'services/search/src/connected-retrieval.ts',
  'services/search/src/live-federation.ts',
  'infra/n4.27r/browser-boundary.mjs',
  'infra/n4.27r/browser-worker.mjs',
  'scripts/benchmarks/n4.27r/create-corpus.mjs',
  'scripts/benchmarks/n4.27r/build-root-cause-ledger.mjs',
  'scripts/benchmarks/n4.27r/fixture-runtime.mjs',
  'scripts/benchmarks/n4.27r/evaluate.mjs',
  'scripts/benchmarks/n4.27r/qualify-browser.mjs',
  'scripts/benchmarks/n4.27r/freeze-implementation.mjs',
  'tests/contract/n4.27.test.mjs',
  'tests/contract/n4.27r.test.mjs'
];
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const files = [];
for (const path of paths) {
  const bytes = await readFile(new URL(path, root));
  files.push({ path, bytes: bytes.byteLength, sha256: sha256(bytes) });
}
const manifest = { schemaVersion: 'clervo.n4.27r.implementation-freeze.v1', frozenAt: '2026-07-31T21:16:00.000Z', tuningComplete: true, sealedValidationMayRun: true, postValidationTuningAllowed: false, originalN427HoldoutMayRun: false, files };
const output = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(new URL('benchmarks/n4.27r/implementation-freeze.v1.json', root), output);
process.stdout.write(`${JSON.stringify({ files: files.length, sha256: sha256(output) })}\n`);
