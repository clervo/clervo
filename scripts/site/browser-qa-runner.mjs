#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const reportPath = path.join(root, 'apps/site/qa-artifacts/browser-qa-report.json');

try {
  await import('./browser-qa.mjs');
} catch (error) {
  const cleanupRace = error?.code === 'ENOTEMPTY'
    && typeof error?.path === 'string'
    && error.path.includes('clervo-chrome-');

  if (!cleanupRace) throw error;

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (!Array.isArray(report.failures) || report.failures.length !== 0) throw error;

  console.warn('Step 8 browser QA passed; ignored Chromium temporary-profile cleanup race.');
}
