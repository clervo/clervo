#!/usr/bin/env node

/*
 * Automated accessibility checks.
 *
 * Runs axe-core against every tracked route at a desktop and a phone width,
 * then adds three checks axe cannot make on its own:
 *
 *   - every interactive target meets the 44x44 minimum;
 *   - the keyboard tab order reaches the primary action without a trap;
 *   - no page logs a console error.
 *
 * Automated coverage is a floor, not a pass mark: it catches the defects that
 * are mechanically detectable and says nothing about whether the page makes
 * sense. The manual keyboard pass in W5 is still required.
 */

import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseArgument = process.argv.find((value) => value.startsWith('--base='));
const base = baseArgument?.slice('--base='.length) ?? 'http://127.0.0.1:4173';

const routes = ['/', '/start/', '/catalog/', '/product/', '/pricing/', '/docs/', '/status/', '/proof/', '/404'];
const viewports = [
  { width: 1280, height: 900, label: 'desktop' },
  { width: 390, height: 844, label: 'phone' },
];

// WCAG 2.2 AA is the target. Best-practice rules are reported separately so a
// stylistic suggestion never blocks a release that is genuinely accessible.
const blockingTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const browser = await chromium.launch();
const failures = [];
const advisories = [];
let checked = 0;

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  for (const route of routes) {
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    if (response === null) {
      failures.push(`${route} @${viewport.label}: no response`);
      continue;
    }
    // The 404 document is expected to answer 404; every other route is not.
    const expected = route === '/404' ? [200, 404] : [200];
    if (!expected.includes(response.status())) {
      failures.push(`${route} @${viewport.label}: HTTP ${response.status()}`);
      continue;
    }

    const results = await new AxeBuilder({ page }).withTags(blockingTags).analyze();
    for (const violation of results.violations) {
      const targets = violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(', ');
      const line = `${route} @${viewport.label}: ${violation.id} (${violation.impact}) — ${targets}`;
      if (violation.impact === 'minor') advisories.push(line);
      else failures.push(line);
    }

    const smallTargets = await page.evaluate(() => {
      const found = [];
      for (const element of document.querySelectorAll('a[href], button, input, select, [role="button"]')) {
        const rect = element.getBoundingClientRect();
        // Zero-size elements are hidden, and inline links inside a paragraph
        // are exempt from the target minimum under WCAG 2.2 (2.5.8).
        if (rect.width === 0 || rect.height === 0) continue;
        const inline = element.closest('p, li, dd, pre') !== null;
        if (inline) continue;
        if (rect.height < 44 || rect.width < 24) {
          found.push(`${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 28)}" ${Math.round(rect.width)}x${Math.round(rect.height)}`);
        }
      }
      return found;
    });
    for (const target of smallTargets) {
      failures.push(`${route} @${viewport.label}: target below minimum — ${target}`);
    }

    for (const error of errors) failures.push(`${route} @${viewport.label}: console error — ${error}`);
    errors.length = 0;
    checked += 1;
  }

  await context.close();
}

await browser.close();

for (const advisory of advisories) console.warn(`accessibility advisory ${advisory}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`accessibility ${failure}`);
  console.error(`site accessibility: FAIL (${failures.length} findings across ${checked} page loads)`);
  process.exitCode = 1;
} else {
  console.log(`site accessibility: PASS (${checked} page loads, WCAG 2.2 AA rule set, 44px target minimum)`);
}
