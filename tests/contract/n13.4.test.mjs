import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const targets = JSON.parse(await readFile('packages/distribution/release-targets.v1.json', 'utf8'));
const legacy = JSON.parse(await readFile('packages/distribution/legacy-release-policy.v1.json', 'utf8'));
const sdk = JSON.parse(await readFile('packages/sdk-typescript/package.json', 'utf8'));
const mcp = JSON.parse(await readFile('packages/mcp/package.json', 'utf8'));
const mcpRegistry = JSON.parse(await readFile('packages/mcp/server.json', 'utf8'));
const pythonProject = await readFile('packages/sdk-python/pyproject.toml', 'utf8');
const verifyWorkflow = await readFile('.github/workflows/verify-distribution.yml', 'utf8');
const publishWorkflow = await readFile('.github/workflows/publish-packages.yml', 'utf8');

test('release targets preserve current package and registry truth', () => {
  assert.deepEqual(targets.repository, {
    owner: 'clervo',
    name: 'clervo',
    url: 'https://github.com/clervo/clervo',
  });
  assert.deepEqual(
    (targets.nextRelease?.packages ?? targets.packages).map(({ registry, name, version }) => ({ registry, name, version })),
    [
      { registry: 'npm', name: '@clervo/sdk', version: '0.5.2' },
      { registry: 'npm', name: '@clervo/mcp', version: '0.5.2' },
      { registry: 'pypi', name: 'clervo-sdk', version: '0.4.2' },
    ],
  );
  assert.equal(targets.publication.state, 'published_verified');
  assert.match(targets.publication.sourceCommit, /^[a-f0-9]{40}$/u);
  assert.ok(Number.isSafeInteger(targets.publication.githubRunId) && targets.publication.githubRunId > 0);
  assert.ok(Number.isFinite(Date.parse(targets.publication.verifiedAt)));
  if (targets.nextRelease !== undefined) assert.equal(targets.nextRelease.state, 'release_prepared');
  assert.ok(targets.packages.filter(({ registry }) => registry === 'npm').every(({ integrity, provenancePredicate }) =>
    /^sha512-/u.test(integrity) && provenancePredicate === 'https://slsa.dev/provenance/v1'));
  assert.equal(targets.packages.find(({ registry }) => registry === 'pypi').files.length, 2);
  assert.equal(sdk.license, 'MIT');
  assert.equal(mcp.license, 'MIT');
  assert.equal(sdk.repository.url, 'git+https://github.com/clervo/clervo.git');
  assert.equal(mcp.repository.url, 'git+https://github.com/clervo/clervo.git');
  assert.equal(mcp.dependencies['@clervo/sdk'], sdk.version);
  assert.equal(mcp.mcpName, 'io.github.clervo/connect');
  assert.equal(mcpRegistry.name, mcp.mcpName);
  assert.equal(mcpRegistry.version, mcp.version);
  assert.equal(mcpRegistry.packages[0].identifier, mcp.name);
  assert.equal(mcpRegistry.packages[0].version, mcp.version);
  assert.match(pythonProject, /^Repository = "https:\/\/github\.com\/clervo\/clervo"$/mu);
});

test('ordinary distribution CI is read-only and proves clean onboarding', () => {
  assert.match(verifyWorkflow, /^permissions:\n  contents: read$/mu);
  assert.doesNotMatch(verifyWorkflow, /id-token: write/u);
  assert.doesNotMatch(verifyWorkflow, /npm publish|gh-action-pypi-publish/u);
  assert.match(verifyWorkflow, /npm run verify:package-consumers/u);
});

test('package publishing is manual, commit-bound, environment-protected, and tokenless', () => {
  assert.match(publishWorkflow, /^  workflow_dispatch:$/mu);
  assert.doesNotMatch(publishWorkflow, /^  (?:push|pull_request):$/mu);
  assert.match(publishWorkflow, /name: package-release/u);
  assert.match(publishWorkflow, /id-token: write/u);
  assert.match(publishWorkflow, /git merge-base --is-ancestor/u);
  assert.match(publishWorkflow, /verify:distribution-release:registry/u);
  assert.doesNotMatch(publishWorkflow, /secrets\.|NODE_AUTH_TOKEN|API_TOKEN/u);
  assert.match(publishWorkflow, /mcp-publisher" login github-oidc/u);
  assert.match(publishWorkflow, /registry\.modelcontextprotocol\.io\/v0\.1\/servers/u);

  for (const reference of publishWorkflow.matchAll(/uses: [^@\n]+@([^\s#]+)/gu)) {
    assert.match(reference[1], /^[a-f0-9]{40}$/u);
  }

  const sdkPublish = publishWorkflow.indexOf('npm publish release-artifacts/npm/clervo-sdk-0.5.2.tgz');
  const mcpPublish = publishWorkflow.indexOf('npm publish release-artifacts/npm/clervo-mcp-0.5.2.tgz');
  const pythonPublish = publishWorkflow.indexOf('pypa/gh-action-pypi-publish@');
  assert.ok(sdkPublish > 0 && mcpPublish > sdkPublish && pythonPublish > mcpPublish);
});

test('legacy releases are preserved, truthfully deprecated, and superseded only after replacements exist', () => {
  assert.equal(legacy.policy.deletePublishedHistory, false);
  assert.equal(legacy.policy.unpublishPublishedHistory, false);
  assert.equal(legacy.policy.applyDeprecationsAfterReplacementPublication, true);
  assert.deepEqual(legacy.npm.map(({ name }) => name), ['clervo', '@clervo/sdk', '@clervo/mcp', '@clervo/beacon']);
  assert.ok(legacy.npm.every(({ action, message }) => action.startsWith('deprecate_') && !/QuickAI|Tongkhokr|free models|cheapest/iu.test(message)));
  assert.equal(legacy.pypi[0].action, 'preserve_and_supersede');
  assert.equal(legacy.pypi[0].yank, false);
  assert.equal(legacy.pypi[0].delete, false);
});
