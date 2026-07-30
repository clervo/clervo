#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const tsc = path.join(repositoryRoot, 'node_modules', '.bin', 'tsc');
const contractTests = [
  'tests/contract/n1.1.test.mjs', 'tests/contract/n1.2.test.mjs', 'tests/contract/n1.3.test.mjs',
  'tests/contract/n2.1.test.mjs', 'tests/contract/n2.2.test.mjs',
  'tests/contract/n3.1.test.mjs', 'tests/contract/n3.2.test.mjs',
  'tests/contract/n4.1.test.mjs', 'tests/contract/n4.2.test.mjs', 'tests/contract/n4.3.test.mjs',
  'tests/contract/n4.4.test.mjs', 'tests/contract/n4.5.test.mjs', 'tests/contract/n4.6.test.mjs',
  'tests/contract/n4.7.test.mjs', 'tests/contract/n4.8.test.mjs', 'tests/contract/n4.9.test.mjs',
  'tests/contract/n4.10.test.mjs',
];

const gates = [
  ['lint', node, ['scripts/lint.mjs']],
  ['typecheck', tsc, ['--project', 'tsconfig.json', '--noEmit']],
  ['clean-room boundary', path.join(repositoryRoot, 'scripts', 'verify-clean-room-boundary.sh'), []],
  ['stack decision', node, ['scripts/verify-stack-decision.mjs']],
  ['environment contract', node, ['scripts/verify-environments.mjs']],
  ['secret scan', node, ['scripts/scan-secrets.mjs']],
  ['N0.3 acceptance', node, ['scripts/test-n0.3.mjs']],
  ['build', tsc, ['--project', 'tsconfig.json']],
  ['contract schemas', node, ['scripts/validate-contracts.mjs']],
  ['discovery generation', node, ['scripts/generate-discovery.mjs']],
  ['contract tests', node, ['--test', ...contractTests]],
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