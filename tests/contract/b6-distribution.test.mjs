import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageMetadata = JSON.parse(readFileSync(new URL('../../packages/router/package.json', import.meta.url), 'utf8'));
const packageReadme = readFileSync(new URL('../../packages/router/README.md', import.meta.url), 'utf8');
const packageLicense = readFileSync(new URL('../../packages/router/LICENSE', import.meta.url), 'utf8');
const discoveryGenerator = readFileSync(new URL('../../scripts/generate-discovery.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/publish-router.yml', import.meta.url), 'utf8');

test('B6 Router public package metadata names one truthful immutable distribution target', () => {
  assert.equal(packageMetadata.name, '@clervo/router');
  assert.equal(packageMetadata.version, '0.1.0');
  assert.equal(packageMetadata.license, 'MIT');
  assert.ok(packageMetadata.files.includes('LICENSE'));
  assert.equal(packageMetadata.publishConfig.access, 'public');
  assert.equal(packageMetadata.publishConfig.provenance, true);
  assert.equal(packageMetadata.publishConfig.registry, 'https://registry.npmjs.org/');
  assert.deepEqual(packageMetadata.bin, { clervo: './dist/cli.js' });
  assert.equal(packageMetadata.exports['.'].import, './dist/index.js');
  assert.equal(packageMetadata.exports['.'].types, './dist/index.d.ts');
  assert.deepEqual(packageMetadata.repository, {
    type: 'git',
    url: 'git+https://github.com/clervo/clervo.git',
    directory: 'packages/router',
  });
  assert.equal(packageMetadata.homepage, 'https://github.com/clervo/clervo/tree/main/packages/router#readme');
  assert.equal(packageMetadata.bugs.url, 'https://github.com/clervo/clervo/issues');
  assert.match(packageReadme, /npx @clervo\/router search "World Wide Web"/u);
  assert.match(packageReadme, /client package is MIT licensed/u);
  assert.match(packageReadme, /hosted services remains subject to the applicable service terms/u);
  assert.match(packageLicense, /^MIT License\n\nCopyright \(c\) 2026 Clervo\n/u);
  assert.match(packageLicense, /Permission is hereby granted, free of charge/u);
  assert.doesNotMatch(packageLicense, /trademark|service terms|Clervo API/u);
  assert.match(discoveryGenerator, /npx @clervo\/router search "World Wide Web"/u);
  assert.doesNotMatch(packageReadme, /who is shipping x402 in production|base usdc settlement latency/u);
});

test('B6 Router release workflow is package-specific, immutable, OIDC-capable, and fail-closed', () => {
  assert.match(workflow, /name: Publish Clervo Router/u);
  assert.match(workflow, /release_commit:/u);
  assert.match(workflow, /test "\$\{#RELEASE_COMMIT\}" -eq 40/u);
  assert.match(workflow, /git merge-base --is-ancestor "\$RELEASE_COMMIT" origin\/main/u);
  assert.match(workflow, /id-token: write/u);
  assert.match(workflow, /runs-on: ubuntu-latest/u);
  assert.match(workflow, /npm@11\.18\.0/u);
  assert.match(workflow, /@clervo\/router@0\.1\.0/u);
  assert.match(workflow, /npm publish "\$ROUTER_ARCHIVE" --access public --provenance/u);
  assert.match(workflow, /packageMetadata\.license !== 'MIT'/u);
  assert.match(workflow, /package\/LICENSE/u);
  assert.match(workflow, /registry\.npmjs\.org\/%40clervo%2Frouter\/0\.1\.0/u);
  assert.doesNotMatch(workflow, /%2Frouter%2F0\.1\.0/u);
  assert.doesNotMatch(workflow, /@clervo\/sdk|@clervo\/mcp|clervo-sdk/u);
});

test('B6 Router standard help and version flags succeed for package consumers', () => {
  const cli = new URL('../../packages/router/dist/cli.js', import.meta.url);
  const version = spawnSync(process.execPath, [cli.pathname, '--version'], { encoding: 'utf8' });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), '0.1.0');

  const help = spawnSync(process.execPath, [cli.pathname, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /A real search result\. Free, no wallet, no signup\./u);
});
