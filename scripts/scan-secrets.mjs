#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
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
  const commits = unique(git(['rev-list', range]));
  const findings = [];
  for (const commit of commits) {
    const files = unique(git(['ls-tree', '-r', '--name-only', commit]));
    for (const file of files) {
      let content;
      try {
        content = git(['show', `${commit}:${file}`]);
      } catch {
        continue;
      }
      findings.push(...findingsFor(`history:${commit.slice(0, 12)}:${file}`, content));
    }
  }
  return findings;
}

function requestedHistoryRange() {
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
    console.log('scope: working tree plus committed history');
    console.log('secret values printed: 0');
    console.log('network calls made: 0');
    console.log('USDC spent: 0');
  }
} catch (error) {
  console.error(`secret scan: FAIL: ${error.message}`);
  process.exitCode = 1;
}