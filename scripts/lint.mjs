#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['packages', 'scripts', 'tests'];
const extensions = new Set(['.ts', '.mjs', '.json']);

async function filesBelow(relative) {
  const output = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(child));
    else if (extensions.has(path.extname(entry.name))) output.push(child);
  }
  return output;
}

try {
  const files = (await Promise.all(roots.map(filesBelow))).flat().sort();
  for (const file of files) {
    const source = await readFile(path.join(root, file), 'utf8');
    assert.equal(source.includes('\r'), false, `${file}: CRLF is not allowed`);
    source.split('\n').forEach((line, index) => {
      assert.equal(/[ \t]+$/.test(line), false, `${file}:${index + 1}: trailing whitespace`);
      assert.equal(line.includes('\t'), false, `${file}:${index + 1}: tabs are not allowed`);
    });
    if (file.endsWith('.json')) JSON.parse(source);
  }
  console.log(`lint: PASS (${files.length} source/contract files)`);
} catch (error) {
  console.error(`lint: FAIL: ${error.message}`);
  process.exitCode = 1;
}