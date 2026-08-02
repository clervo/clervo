#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../../..');
const output = path.join(root, 'docs/evidence/site/v6-browser-baseline');
const origin = process.env.CLERVO_SITE_ORIGIN ?? 'http://127.0.0.1:4173';
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = { origin, consoleErrors: [], requestFailures: [], captures: [] };

async function context(viewport, reducedMotion = 'no-preference') {
  const value = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion });
  value.on('page', (page) => {
    page.on('console', (message) => {
      if (message.type() === 'error') report.consoleErrors.push({ url: page.url(), text: message.text() });
    });
    page.on('requestfailed', (request) => {
      report.requestFailures.push({ url: request.url(), failure: request.failure()?.errorText ?? 'unknown' });
    });
  });
  return value;
}

async function capture(name, route, viewport, action) {
  const browserContext = await context(viewport);
  const page = await browserContext.newPage();
  await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
  if (action) await action(page);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false });
  report.captures.push({ name, route, viewport, title: await page.title() });
  await browserContext.close();
}

await capture('desktop-home', '/', { width: 1440, height: 1000 });
await capture('desktop-proof-receipt', '/proof-lab', { width: 1440, height: 1000 }, async (page) => {
  await page.getByRole('button', { name: 'Qualify fixture route' }).click();
  await page.getByRole('button', { name: 'Generate fixture quote' }).click();
  await page.getByRole('button', { name: 'Review approval boundary' }).click();
  await page.getByRole('button', { name: 'Approve fixture only' }).click();
  await page.getByRole('button', { name: 'Verify contract evidence' }).click();
  await page.getByRole('button', { name: 'Reveal fixture result' }).click();
  await page.getByRole('button', { name: 'Seal fixture receipt' }).click();
  await page.getByText('Inspect fixture receipt').click();
});
await capture('desktop-docs', '/docs/typescript', { width: 1440, height: 1000 });
await capture('desktop-product', '/product', { width: 1440, height: 1000 });
await capture('desktop-security', '/security', { width: 1440, height: 1000 });
await capture('mobile-home', '/', { width: 390, height: 844 });
await capture('mobile-proof', '/proof-lab', { width: 390, height: 844 });

const reducedContext = await context({ width: 390, height: 844 }, 'reduce');
const reducedPage = await reducedContext.newPage();
await reducedPage.goto(`${origin}/`, { waitUntil: 'networkidle' });
await reducedPage.screenshot({ path: path.join(output, 'mobile-home-reduced-motion.png') });
report.captures.push({ name: 'mobile-home-reduced-motion', route: '/', viewport: { width: 390, height: 844 }, reducedMotion: true });
await reducedContext.close();

await browser.close();
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

if (report.consoleErrors.length > 0 || report.requestFailures.length > 0) {
  console.error(JSON.stringify({ consoleErrors: report.consoleErrors, requestFailures: report.requestFailures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`site capture: PASS (${report.captures.length} views)`);
}
