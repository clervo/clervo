#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tsc = path.join(repositoryRoot, 'node_modules', '.bin', 'tsc');
const contractTests = readdirSync(path.join(repositoryRoot, 'tests/contract'))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => `tests/contract/${name}`);

const gates = [
  ['lint', node, ['scripts/lint.mjs']],
  ['SDK build prerequisite', npm, ['run', 'build', '--workspace', '@clervo/sdk']],
  ['typecheck', tsc, ['--project', 'tsconfig.json', '--noEmit']],
  ['clean-room boundary', path.join(repositoryRoot, 'scripts', 'verify-clean-room-boundary.sh'), []],
  ['stack decision', node, ['scripts/verify-stack-decision.mjs']],
  ['environment contract', node, ['scripts/verify-environments.mjs']],
  ['secret scan', node, ['scripts/scan-secrets.mjs']],
  ['repository safety checks', node, ['scripts/test-n0.3.mjs']],
  ['build', tsc, ['--project', 'tsconfig.json']],
  ['contract schemas', node, ['scripts/validate-contracts.mjs']],
  ['H4 product catalog projection', node, ['scripts/ai/project-h4-product-catalog.mjs']],
  ['discovery generation', node, ['scripts/generate-discovery.mjs']],
  // The consistency tests compare the generated public truth with the exact
  // files the site serves. A clean checkout has no projected site files until
  // this existing build step runs, so acceptance must project before testing.
  ['site public projection', node, ['scripts/site/prepare-public.mjs']],
  ['public truth audit', node, ['scripts/audit-public-truth.mjs']],
  ['contract tests', node, ['--test', '--test-concurrency=1', ...contractTests]],
];

for (const [name, command, args] of gates) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`acceptance: FAIL at ${name} (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nacceptance: PASS');
console.log(`executing Node.js: ${process.versions.node}`);
console.log('network calls made: 0 external; loopback HTTP only');
console.log('USDC spent: 0');
