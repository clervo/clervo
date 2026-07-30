#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nullHash = '0000000000000000000000000000000000000000';
const maximumTextBytes = 2 * 1024 * 1024;

const rules = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i],
  ['GitHub token', /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Stripe live secret', /\bsk_live_[0-9A-Za-z]{16,}\b/],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/],
  ['database URL with password', /\bpostgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/i],
  ['generic assigned secret', /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9/+_.-]{20,}["']?/i],
];

function git(args, options = {}) {
  return execFileSync('git', ['-C', repositoryRoot, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function unique(lines) {
  return [...new Set(lines.split('\n').map((line) => line.trim()).filter(Boolean))];
}

function findingsFor(sourceName, content) {
  if (Buffer.byteLength(content) > maximumTextBytes || content.includes('\0')) return [];
  const findings = [];
  for (const [ruleName, pattern] of rules) {
    const match = pattern.exec(content);
    if (match) {
      const line = content.slice(0, match.index).split('\n').length;
      findings.push(`${sourceName}:${line}: ${ruleName}`);
    }
  }
  return findings;
}

async function scanWorkingTree() {
  const files = unique(git(['ls-files', '--cached', '--others', '--exclude-standard']));
  const findings = [];
  for (const file of files) {
    try {
      findings.push(...findingsFor(`working-tree:${file}`, await readFile(path.join(repositoryRoot, file), 'utf8')));
    } catch (error) {
      // `git ls-files --cached` includes tracked paths deleted by the pending
      // change. Their committed content is still covered by the history scan.
      if (error.code !== 'EISDIR' && error.code !== 'ENOENT') throw error;
    }
  }
  return findings;
}

function scanHistoryRange(range) {
  if (!range) return [];
  const objects = unique(git(['rev-list', '--objects', range]));
  const objectIds = objects.map((entry) => entry.split(' ', 1)[0]);
  const objectNames = new Map(objects.map((entry) => {
    const separator = entry.indexOf(' ');
    return [entry.slice(0, separator === -1 ? undefined : separator), separator === -1 ? '' : entry.slice(separator + 1)];
  }));
  if (objectIds.length === 0) return [];

  const batch = spawnSync('git', ['-C', repositoryRoot, 'cat-file', '--batch'], {
    input: `${objectIds.join('\n')}\n`,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (batch.status !== 0) throw new Error(batch.stderr.toString('utf8').trim() || 'git cat-file --batch failed');

  const findings = [];
  let offset = 0;
  while (offset < batch.stdout.length) {
    const headerEnd = batch.stdout.indexOf(10, offset);
    if (headerEnd === -1) throw new Error('truncated git cat-file header');
    const header = batch.stdout.subarray(offset, headerEnd).toString('utf8');
    const [objectId, type, sizeSource] = header.split(' ');
    if (type === 'missing') throw new Error(`missing Git object ${objectId}`);
    const size = Number(sizeSource);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`invalid Git object size for ${objectId}`);
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (contentEnd >= batch.stdout.length) throw new Error(`truncated Git object ${objectId}`);
    if (type === 'blob' && size <= maximumTextBytes) {
      const content = batch.stdout.subarray(contentStart, contentEnd).toString('utf8');
      const name = objectNames.get(objectId) || '<historical-path-unavailable>';
      findings.push(...findingsFor(`history:${objectId.slice(0, 12)}:${name}`, content));
    }
    offset = contentEnd + 1;
  }
  return findings;
}

function requestedHistoryRange() {
  if (process.env.SECRET_SCAN_SKIP_HISTORY === '1') return '';
  const base = process.env.SECRET_SCAN_BASE_SHA;
  const head = process.env.SECRET_SCAN_HEAD_SHA ?? 'HEAD';
  if (base && base !== nullHash) return `${base}..${head}`;
  try {
    git(['rev-parse', '--verify', 'HEAD']);
    return head;
  } catch {
    return '';
  }
}

try {
  const findings = [
    ...(await scanWorkingTree()),
    ...scanHistoryRange(requestedHistoryRange()),
  ];

  if (findings.length > 0) {
    console.error('secret scan: FAIL');
    for (const finding of findings) console.error(`- ${finding}`);
    process.exitCode = 1;
  } else {
    console.log('secret scan: PASS');
    console.log(`scope: working tree${process.env.SECRET_SCAN_SKIP_HISTORY === '1' ? '' : ' plus committed history'}`);
    console.log('secret values printed: 0');
    console.log('network calls made: 0');
    console.log('USDC spent: 0');
  }
} catch (error) {
  console.error(`secret scan: FAIL: ${error.message}`);
  process.exitCode = 1;
}