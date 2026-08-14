#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const base = process.env.CLERVO_SITE_QA_BASE ?? 'http://127.0.0.1:4173';
const output = process.env.CLERVO_SITE_QA_OUTPUT ?? '/tmp/clervo-commercial-qa';
const routes = ['/', '/product/', '/products/ai/', '/operations/ai.execute/', '/pricing/', '/start/', '/docs/'];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const failures = [];
let assertions = 0;

function check(condition, message) {
  assertions += 1;
  if (!condition) failures.push(message);
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    for (const route of routes) {
      const page = await context.newPage();
      const runtimeErrors = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') runtimeErrors.push(message.text());
      });
      const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
      check(response?.ok() === true, `${viewport.name}:${route}:http_${response?.status() ?? 'none'}`);
      check(await page.locator('h1').count() === 1, `${viewport.name}:${route}:expected_one_h1`);
      if (viewport.name === 'desktop') check(await page.locator('.site-header__cta').isVisible(), `${viewport.name}:${route}:primary_cta_hidden`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${viewport.name}:${route}:page_overflow`);
      check(runtimeErrors.length === 0, `${viewport.name}:${route}:runtime_errors:${runtimeErrors.join('|')}`);

      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const blocking = axe.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious');
      check(blocking.length === 0, `${viewport.name}:${route}:axe:${blocking.flatMap(({ id, nodes }) => nodes.slice(0, 3).map(({ target }) => `${id}:${target.join(' ')}`)).join(',')}`);

      if (viewport.name === 'desktop') {
        const nav = await page.locator('.site-header__nav a').allTextContents();
        check(JSON.stringify(nav) === JSON.stringify(['Home', 'Products', 'Pricing', 'Docs']), `${route}:desktop_nav:${nav.join(',')}`);
      } else {
        const menu = page.locator('.site-header__menu');
        check(await menu.isVisible(), `${route}:mobile_menu_hidden`);
        await menu.click();
        check(await page.locator('.mobile-nav__panel').isVisible(), `${route}:mobile_panel_hidden`);
        check(await page.locator('.mobile-nav__cta').isVisible(), `${route}:mobile_cta_hidden`);
        await page.keyboard.press('Escape');
        check(await page.locator('.mobile-nav__panel').isHidden(), `${route}:mobile_escape_failed`);
        check(await menu.evaluate((node) => node === document.activeElement), `${route}:mobile_focus_not_restored`);
      }

      if (['/', '/product/', '/start/'].includes(route)) {
        const name = route === '/' ? 'home' : route.split('/')[1];
        await page.screenshot({ path: path.join(output, `${name}-${viewport.name}.png`), fullPage: true });
      }
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`commercial site QA: FAIL (${failures.length}/${assertions} assertions)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`commercial site QA: PASS (${assertions} assertions, ${routes.length} routes, ${viewports.length} viewports)`);
  console.log(`screenshots: ${output}`);
}
