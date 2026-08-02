#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const registryMode = process.argv.includes('--registry');
const targetPath = path.join(root, 'packages/distribution/release-targets.v1.json');
const targets = JSON.parse(await readFile(targetPath, 'utf8'));
const expectedRepository = 'https://github.com/clervo/clervo';
const expectedGitUrl = 'git+https://github.com/clervo/clervo.git';

function numericVersion(source) {
  assert.match(source, /^\d+\.\d+\.\d+$/u, `release version must be numeric: ${source}`);
  return source.split('.').map(Number);
}

function compareVersions(left, right) {
  const a = numericVersion(left);
  const b = numericVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

async function json(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}

async function text(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'clervo-release-preflight/1' },
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.ok, true, `registry lookup failed closed: ${response.status} ${url}`);
  return response.json();
}

assert.equal(targets.schemaVersion, 1);
assert.deepEqual(targets.repository, {
  owner: 'clervo',
  name: 'clervo',
  url: expectedRepository,
});
assert.deepEqual(targets.workflow, {
  filename: 'publish-packages.yml',
  environment: 'package-release',
});
assert.equal(targets.tooling.buildNpmVersion, '10.9.8');
assert.equal(targets.tooling.publishNpmVersion, '11.18.0');
assert.equal(targets.tooling.pythonBuildVersion, '1.5.0');
assert.equal(targets.packages.length, 3);

const sdk = await json('packages/sdk-typescript/package.json');
const mcp = await json('packages/mcp/package.json');
const pythonProject = await text('packages/sdk-python/pyproject.toml');
const manifests = new Map([
  ['@clervo/sdk', sdk],
  ['@clervo/mcp', mcp],
]);

for (const target of targets.packages) {
  numericVersion(target.version);
  assert.equal(typeof target.path, 'string');
  if (target.registry === 'npm') {
    const manifest = manifests.get(target.name);
    assert.ok(manifest, `unknown npm release target: ${target.name}`);
    assert.equal(manifest.name, target.name);
    assert.equal(manifest.version, target.version);
    assert.equal(manifest.license, 'UNLICENSED');
    assert.equal(manifest.repository.url, expectedGitUrl);
    assert.equal(manifest.repository.directory, target.path);
    assert.equal(manifest.bugs.url, `${expectedRepository}/issues`);
    assert.equal(manifest.publishConfig.access, 'public');
    assert.equal(manifest.publishConfig.provenance, true);
    assert.ok(manifest.homepage.startsWith('https://clervo.dev/docs/'));
  } else {
    assert.equal(target.registry, 'pypi');
    assert.equal(target.name, 'clervo-sdk');
    assert.match(pythonProject, new RegExp(`^version = "${target.version.replaceAll('.', '\\.')}"$`, 'mu'));
    assert.match(pythonProject, /^Repository = "https:\/\/github\.com\/clervo\/clervo"$/mu);
    assert.match(pythonProject, /^Issues = "https:\/\/github\.com\/clervo\/clervo\/issues"$/mu);
    assert.match(pythonProject, /^requires = \["setuptools==83\.0\.0", "wheel==0\.47\.0"\]$/mu);
  }
}

assert.equal(mcp.dependencies['@clervo/sdk'], sdk.version);

const publicPackageCopy = [
  await text('packages/sdk-typescript/README.md'),
  await text('packages/mcp/README.md'),
  await text('packages/sdk-python/README.md'),
].join('\n');
for (const staleClaim of [
  /QuickAI/iu,
  /Tongkhokr/iu,
  /\b23 AI models\b/iu,
  /\b24 AI models\b/iu,
  /\b12 free\b/iu,
  /\b8 free\b/iu,
  /cheapest working model/iu,
  /one wallet, pay per call/iu,
]) {
  assert.doesNotMatch(publicPackageCopy, staleClaim, `stale public package claim: ${staleClaim}`);
}
assert.match(publicPackageCopy, /no\s+public(?: API)? deployment is\s+(?:currently )?(?:verified|assumed)/iu);

if (registryMode) {
  for (const target of targets.packages) {
    if (target.registry === 'npm') {
      const packument = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(target.name)}`);
      const versions = Object.keys(packument.versions ?? {});
      assert.equal(versions.includes(target.version), false, `${target.name}@${target.version} is already published; reconcile before retrying`);
      const latest = packument['dist-tags']?.latest;
      assert.equal(typeof latest, 'string', `${target.name} has no latest registry version`);
      assert.ok(compareVersions(target.version, latest) > 0, `${target.name}@${target.version} does not advance ${latest}`);
    } else {
      const project = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(target.name)}/json`);
      const published = project.releases?.[target.version] ?? [];
      assert.equal(published.length, 0, `${target.name}==${target.version} is already published; reconcile before retrying`);
      const latest = project.info?.version;
      assert.equal(typeof latest, 'string', `${target.name} has no latest registry version`);
      assert.ok(compareVersions(target.version, latest) > 0, `${target.name}==${target.version} does not advance ${latest}`);
    }
  }
}

console.log(`distribution release preflight: PASS (${targets.packages.length} packages, registry=${registryMode ? 'checked' : 'skipped'})`);
