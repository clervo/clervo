#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const registryMode = process.argv.includes('--registry');
const publishedMode = process.argv.includes('--published');
assert.equal(registryMode && publishedMode, false, 'registry preflight and published verification are mutually exclusive');
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
if (publishedMode) {
  assert.deepEqual(targets.publication, {
    state: 'published_verified',
    sourceCommit: 'd299f08ae70a0a19390050583e14a512f9751172',
    githubRunId: 30858517518,
    verifiedAt: '2026-08-03T22:28:10Z',
  });
}
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

if (registryMode || publishedMode) {
  for (const target of targets.packages) {
    if (target.registry === 'npm') {
      const packument = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(target.name)}`);
      const versions = Object.keys(packument.versions ?? {});
      if (registryMode) {
        assert.equal(versions.includes(target.version), false, `${target.name}@${target.version} is already published; reconcile before retrying`);
        const latest = packument['dist-tags']?.latest;
        assert.equal(typeof latest, 'string', `${target.name} has no latest registry version`);
        assert.ok(compareVersions(target.version, latest) > 0, `${target.name}@${target.version} does not advance ${latest}`);
      } else {
        const published = packument.versions?.[target.version];
        assert.ok(published, `${target.name}@${target.version} is not published`);
        assert.equal(packument['dist-tags']?.latest, target.version, `${target.name} latest tag drift`);
        assert.equal(published.dist?.integrity, target.integrity, `${target.name} registry integrity drift`);
        assert.equal(published.dist?.attestations?.provenance?.predicateType, target.provenancePredicate, `${target.name} provenance drift`);
        assert.equal(published.repository?.url, expectedGitUrl, `${target.name} registry repository drift`);
        assert.equal(published.deprecated, undefined, `${target.name}@${target.version} must not be deprecated`);
      }
    } else {
      const project = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(target.name)}/json`);
      const published = project.releases?.[target.version] ?? [];
      if (registryMode) {
        assert.equal(published.length, 0, `${target.name}==${target.version} is already published; reconcile before retrying`);
        const latest = project.info?.version;
        assert.equal(typeof latest, 'string', `${target.name} has no latest registry version`);
        assert.ok(compareVersions(target.version, latest) > 0, `${target.name}==${target.version} does not advance ${latest}`);
      } else {
        assert.equal(project.info?.version, target.version, `${target.name} latest version drift`);
        const observedFiles = published
          .map(({ filename, digests }) => ({ filename, sha256: digests?.sha256 }))
          .sort((left, right) => left.filename.localeCompare(right.filename));
        const expectedFiles = [...target.files].sort((left, right) => left.filename.localeCompare(right.filename));
        assert.deepEqual(observedFiles, expectedFiles, `${target.name} published file digest drift`);
      }
    }
  }
}

if (publishedMode) {
  const legacy = await json('packages/distribution/legacy-release-policy.v1.json');
  for (const release of legacy.npm) {
    const packument = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(release.name)}`);
    for (const version of release.versions) {
      assert.equal(packument.versions?.[version]?.deprecated, release.message, `${release.name}@${version} deprecation drift`);
    }
  }
  for (const release of legacy.pypi) {
    const project = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(release.name)}/json`);
    const files = project.releases?.[release.versions[0]] ?? [];
    assert.ok(files.length > 0, `${release.name}==${release.versions[0]} history is missing`);
    assert.ok(files.every(({ yanked }) => yanked === false), `${release.name}==${release.versions[0]} was unexpectedly yanked`);
  }
}

const registryState = registryMode ? 'unpublished_checked' : publishedMode ? 'published_verified' : 'skipped';
console.log(`distribution release verification: PASS (${targets.packages.length} packages, registry=${registryState})`);
