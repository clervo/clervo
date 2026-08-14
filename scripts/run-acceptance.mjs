#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tsc = path.join(repositoryRoot, 'node_modules', '.bin', 'tsc');
const contractTests = [
  'tests/contract/n1.1.test.mjs', 'tests/contract/n1.2.test.mjs', 'tests/contract/n1.3.test.mjs',
  'tests/contract/n2.1.test.mjs', 'tests/contract/n2.2.test.mjs',
  'tests/contract/n3.1.test.mjs', 'tests/contract/n3.2.test.mjs',
  'tests/contract/n4.1.test.mjs', 'tests/contract/n4.2.test.mjs', 'tests/contract/n4.3.test.mjs',
  'tests/contract/n4.4.test.mjs', 'tests/contract/n4.5.test.mjs', 'tests/contract/n4.6.test.mjs',
  'tests/contract/n4.7.test.mjs', 'tests/contract/n4.8.test.mjs', 'tests/contract/n4.9.test.mjs',
  'tests/contract/n4.10.test.mjs', 'tests/contract/n4.11.test.mjs', 'tests/contract/n4.12.test.mjs', 'tests/contract/n4.13.test.mjs',
  'tests/contract/n4.14.test.mjs', 'tests/contract/n4.15.test.mjs', 'tests/contract/n4.16.test.mjs', 'tests/contract/n4.17.test.mjs',
  'tests/contract/n4.18.test.mjs', 'tests/contract/n4.19.test.mjs', 'tests/contract/n4.20.test.mjs', 'tests/contract/n4.21.test.mjs', 'tests/contract/n4.22.test.mjs',
  'tests/contract/n4.23a.test.mjs',
  'tests/contract/n4.23b.test.mjs',
  'tests/contract/nplan.1.test.mjs',
  'tests/contract/nplan.2.test.mjs',
  'tests/contract/nplan.3.test.mjs',
  // The four remaining product families are served over public HTTP and were
  // never in this list, so the acceptance run could pass while their public
  // routes were broken. The registry consistency test is here for the same
  // reason: it is the gate that stops a public surface disagreeing with the
  // probed live registry.
  'tests/contract/ai-public-http.test.mjs',
  'tests/contract/rpc-public-http.test.mjs',
  'tests/contract/prediction-public-http.test.mjs',
  'tests/contract/b8-prediction-intelligence.test.mjs',
  'tests/contract/crypto-public-http.test.mjs',
  'tests/contract/registry-public-consistency.test.mjs',
  // The three agent discovery documents are how an agent finds the service at
  // all. This suite binds them to the probed registry so a document can never
  // list supply the deployed system does not serve.
  'tests/contract/agent-discovery.test.mjs',
  // Route integrity: a listed route must sell the exact model it names, must not
  // reach `live` on an edge quote alone or on an expired qualification, and must
  // stay visible with a true reason when it is paused. Nothing here pins a route
  // count, so supply can change without a test forcing a dead route to stay
  // listed.
  'tests/contract/ai-route-integrity.test.mjs',
  // B7 dynamic supply proves model-count-independent composition, stable
  // customer identity, fail-closed pricing/lifecycle, supplier redaction, and
  // one generic gateway binding across catalog revisions.
  'tests/contract/b7-dynamic-ai.test.mjs',
  'tests/contract/ai-production-runtime.test.mjs',
  // Connect v1 must remain inside the ordinary repository acceptance run so a
  // broad pass cannot omit its shared wallet, limits, reconciliation, usage,
  // model-identity, MCP-profile and OpenAI compatibility contracts.
  'tests/contract/b11-connect.test.mjs',
];

const gates = [
  ['lint', node, ['scripts/lint.mjs']],
  ['SDK build prerequisite', npm, ['run', 'build', '--workspace', '@clervo/sdk']],
  ['typecheck', tsc, ['--project', 'tsconfig.json', '--noEmit']],
  ['clean-room boundary', path.join(repositoryRoot, 'scripts', 'verify-clean-room-boundary.sh'), []],
  ['stack decision', node, ['scripts/verify-stack-decision.mjs']],
  ['environment contract', node, ['scripts/verify-environments.mjs']],
  ['secret scan', node, ['scripts/scan-secrets.mjs']],
  ['N0.3 acceptance', node, ['scripts/test-n0.3.mjs']],
  ['build', tsc, ['--project', 'tsconfig.json']],
  ['contract schemas', node, ['scripts/validate-contracts.mjs']],
  ['discovery generation', node, ['scripts/generate-discovery.mjs']],
  // The consistency tests compare the generated public truth with the exact
  // files the site serves. A clean checkout has no projected site files until
  // this existing build step runs, so acceptance must project before testing.
  ['site public projection', node, ['scripts/site/prepare-public.mjs']],
  ['Stage 4 exit verification', node, ['scripts/verify-stage4-exit.mjs']],
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
