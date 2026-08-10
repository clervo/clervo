#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const targets = JSON.parse(await readFile(
  path.join(root, 'packages/distribution/release-targets.v1.json'),
  'utf8',
));
const releasePackages = targets.nextRelease?.packages ?? targets.packages;
const freeze = JSON.parse(await readFile(
  path.join(root, 'packages/catalog/release-candidate-freeze.v1.json'),
  'utf8',
));
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'clervo-onboarding-'));
const artifacts = path.join(temporaryRoot, 'artifacts');

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    maxBuffer: 16 * 1024 * 1024,
    stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
}

try {
  await mkdir(artifacts);
  run('npm', ['run', 'build', '--workspace', '@clervo/sdk']);
  run('npm', ['run', 'build', '--workspace', '@clervo/mcp']);

  const npmTarballs = [];
  for (const target of releasePackages.filter(({ registry }) => registry === 'npm')) {
    const packed = JSON.parse(run('npm', [
      'pack',
      path.join(root, target.path),
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      artifacts,
    ]));
    assert.equal(packed.length, 1);
    assert.equal(packed[0].name, target.name);
    assert.equal(packed[0].version, target.version);
    assert.ok(packed[0].files.some(({ path: packedPath }) => packedPath === 'README.md'));
    assert.ok(packed[0].files.some(({ path: packedPath }) => packedPath.startsWith('dist/')));
    npmTarballs.push(path.join(artifacts, packed[0].filename));
  }

  const nodeConsumer = path.join(temporaryRoot, 'node-consumer');
  await mkdir(nodeConsumer);
  await writeFile(path.join(nodeConsumer, 'package.json'), JSON.stringify({
    name: 'clervo-clean-consumer',
    private: true,
    type: 'module',
  }, null, 2));
  run('npm', [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--no-package-lock',
    ...npmTarballs,
  ], { cwd: nodeConsumer });
  await writeFile(path.join(nodeConsumer, 'verify.mjs'), [
    "import { ClervoClient, CLERVO_RELEASE_CANDIDATE_ID } from '@clervo/sdk';",
    "import { CLERVO_MCP_TOOLS } from '@clervo/mcp';",
    `if (CLERVO_RELEASE_CANDIDATE_ID !== ${JSON.stringify(freeze.releaseCandidateId)}) throw new Error('candidate_identity_mismatch');`,
    "if (CLERVO_MCP_TOOLS.map(({ name }) => name).join(',') !== 'search_web,search_answer,models_list,ai_execute') throw new Error('mcp_tools_invalid');",
    "const client = new ClervoClient({ baseUrl: 'http://127.0.0.1:8080' });",
    "if (!client.search.web || !client.search.answer || !client.models.list || !client.ai.execute) throw new Error('sdk_methods_missing');",
    '',
  ].join('\n'));
  run(process.execPath, ['verify.mjs'], { cwd: nodeConsumer });
  const mcpBin = path.join(nodeConsumer, 'node_modules', '.bin', 'clervo-mcp');
  assert.equal((await stat(mcpBin)).isFile(), true);

  const builder = path.join(temporaryRoot, 'python-builder');
  run('python3', ['-m', 'venv', builder]);
  const builderPython = path.join(builder, 'bin', 'python');
  run(builderPython, [
    '-m',
    'pip',
    'install',
    '--disable-pip-version-check',
    `build==${targets.tooling.pythonBuildVersion}`,
  ]);
  run(builderPython, [
    '-m',
    'build',
    '--sdist',
    '--wheel',
    '--outdir',
    artifacts,
    path.join(root, 'packages/sdk-python'),
  ]);

  const artifactNames = await readdir(artifacts);
  const wheel = artifactNames.find((name) => /^clervo_sdk-.+\.whl$/u.test(name));
  const source = artifactNames.find((name) => /^clervo_sdk-.+\.tar\.gz$/u.test(name));
  assert.ok(wheel, 'Python wheel missing');
  assert.ok(source, 'Python source distribution missing');
  const wheelListing = run(builderPython, ['-m', 'zipfile', '-l', path.join(artifacts, wheel)]);
  const sourceListing = run('tar', ['-tf', path.join(artifacts, source)]);
  for (const expected of ['clervo/client.py', 'clervo/py.typed']) assert.match(wheelListing, new RegExp(expected.replace('.', '\\.'), 'u'));
  assert.match(sourceListing, /README\.md/u);
  assert.match(sourceListing, /pyproject\.toml/u);

  const pythonConsumer = path.join(temporaryRoot, 'python-consumer');
  run('python3', ['-m', 'venv', pythonConsumer]);
  const consumerPython = path.join(pythonConsumer, 'bin', 'python');
  run(consumerPython, [
    '-m',
    'pip',
    'install',
    '--disable-pip-version-check',
    '--no-deps',
    path.join(artifacts, wheel),
  ]);
  run(consumerPython, [
    '-c',
    [
      'from clervo import Clervo',
      "client = Clervo(base_url='http://127.0.0.1:8080')",
      'assert callable(client.search.web)',
      'assert callable(client.search.answer)',
      'assert callable(client.models.list)',
      'assert callable(client.ai.execute)',
    ].join('; '),
  ]);

  console.log('distribution onboarding proof: PASS (TypeScript SDK, MCP, Python wheel, Python sdist)');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
