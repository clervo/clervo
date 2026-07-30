#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

function parseVersionFile(source) {
  return Object.fromEntries(source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=');
      assert.notEqual(separator, -1, `invalid stack version line: ${line}`);
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
}

try {
  const [manifestSource, nvmSource, nodeVersionSource, toolVersionsSource, versionsSource] = await Promise.all([
    read('package.json'),
    read('.nvmrc'),
    read('.node-version'),
    read('.tool-versions'),
    read('infra/stack-versions.env'),
  ]);

  const manifest = JSON.parse(manifestSource);
  const versions = parseVersionFile(versionsSource);
  const expected = versions.NODE_VERSION;
  const actual = process.versions.node;
  const toolVersion = toolVersionsSource.trim().match(/^nodejs\s+(\S+)$/)?.[1];

  assert.equal(nvmSource.trim(), expected, '.nvmrc drift');
  assert.equal(nodeVersionSource.trim(), expected, '.node-version drift');
  assert.equal(toolVersion, expected, '.tool-versions drift');
  assert.equal(manifest.engines?.node, expected, 'package.json must require the exact Node.js runtime');
  assert.equal(actual, expected, `executing Node.js ${actual}; required ${expected}`);

  console.log('runtime enforcement: PASS');
  console.log(`executing Node.js: ${actual}`);
  console.log(`required Node.js: ${expected}`);
} catch (error) {
  console.error(`runtime enforcement: FAIL: ${error.message}`);
  console.error('Install/select the version in .nvmrc before running repository commands.');
  process.exitCode = 1;
}