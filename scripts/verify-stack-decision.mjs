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
  const entries = source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=');
      assert.notEqual(separator, -1, `invalid stack version line: ${line}`);
      return [line.slice(0, separator), line.slice(separator + 1)];
    });

  return Object.fromEntries(entries);
}

function major(version) {
  return version.split('.')[0];
}

try {
  const [manifestSource, lockSource, nodeVersionSource, versionsSource] = await Promise.all([
    read('package.json'),
    read('package-lock.json'),
    read('.nvmrc'),
    read('infra/stack-versions.env'),
  ]);

  const manifest = JSON.parse(manifestSource);
  const lockfile = JSON.parse(lockSource);
  const versions = parseVersionFile(versionsSource);
  const nodeVersion = nodeVersionSource.trim();
  const rootLock = lockfile.packages?.[''];

  assert.equal(manifest.private, true, 'workspace must remain private');
  assert.equal(manifest.type, 'module', 'Node.js module system must be ESM');
  assert.equal(manifest.engines?.node, versions.NODE_VERSION_RANGE, 'Node engine range drift');
  assert.equal(nodeVersion, versions.NODE_VERSION, '.nvmrc drift');
  assert.equal(major(nodeVersion), '24', 'runtime must remain on Node.js 24 LTS');
  assert.equal(manifest.packageManager, `npm@${versions.NPM_VERSION}`, 'npm pin drift');

  assert.equal(versions.POSTGRES_MAJOR, '18', 'database must remain PostgreSQL 18');
  assert.equal(major(versions.POSTGRES_VERSION), versions.POSTGRES_MAJOR, 'PostgreSQL pin drift');

  assert.equal(manifest.dependencies?.['pg-boss'], versions.PG_BOSS_VERSION, 'pg-boss manifest drift');
  assert.equal(major(versions.PG_BOSS_VERSION), versions.PG_BOSS_MAJOR, 'pg-boss major drift');
  assert.equal(versions.PG_BOSS_MAJOR, '12', 'queue must remain pg-boss 12');
  assert.equal(rootLock?.dependencies?.['pg-boss'], versions.PG_BOSS_VERSION, 'pg-boss lock root drift');
  assert.equal(lockfile.packages?.['node_modules/pg-boss']?.version, versions.PG_BOSS_VERSION, 'resolved pg-boss drift');

  assert.equal(rootLock?.engines?.node, versions.NODE_VERSION_RANGE, 'lockfile Node engine drift');
  assert.equal(rootLock?.devDependencies?.typescript, manifest.devDependencies?.typescript, 'TypeScript lock root drift');
  assert.equal(lockfile.packages?.['node_modules/typescript']?.version, manifest.devDependencies?.typescript, 'resolved TypeScript drift');

  console.log('stack decision: PASS');
  console.log(`runtime: TypeScript ${manifest.devDependencies.typescript} on Node.js ${nodeVersion}`);
  console.log(`database: PostgreSQL ${versions.POSTGRES_VERSION}`);
  console.log(`durable queue: pg-boss ${versions.PG_BOSS_VERSION} on PostgreSQL`);
  console.log(`package manager: npm ${versions.NPM_VERSION}`);
  console.log('network calls made: 0');
  console.log('USDC spent: 0');
} catch (error) {
  console.error(`stack decision: FAIL: ${error.message}`);
  process.exitCode = 1;
}