#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'apps/site/qa-artifacts/slice4');
const captures = path.join(out, 'captures');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cases = [
  ['product-1600-entry', '/product', 1600, 900, 'product', 'entry'],
  ['product-1600-verified', '/product', 1600, 900, 'product', 'verified'],
  ['product-1024-entry', '/product', 1024, 768, 'product', 'entry'],
  ['product-390-entry', '/product', 390, 844, 'product', 'entry'],
  ['product-390-verified', '/product', 390, 844, 'product', 'verified'],
  ['product-320-entry', '/product', 320, 700, 'product', 'entry'],
  ['catalog-1600-entry', '/catalog', 1600, 900, 'catalog', 'entry'],
  ['catalog-1600-filtered', '/catalog', 1600, 900, 'catalog', 'filtered'],
  ['catalog-1024-entry', '/catalog', 1024, 768, 'catalog', 'entry'],
  ['catalog-390-entry', '/catalog', 390, 844, 'catalog', 'entry'],
  ['catalog-320-entry', '/catalog', 320, 700, 'catalog', 'entry'],
  ['family-search-1600', '/products/search', 1600, 900, 'family', 'Search'],
  ['family-ai-1024', '/products/ai', 1024, 768, 'family', 'AI'],
  ['family-search-390', '/products/search', 390, 844, 'family', 'Search'],
  ['family-ai-390', '/products/ai', 390, 844, 'family', 'AI'],
  ['family-sandbox-390', '/products/sandbox', 390, 844, 'family', 'Secure Sandbox'],
  ['family-rpc-390', '/products/rpc', 390, 844, 'family', 'Multi-chain RPC'],
  ['family-prediction-390', '/products/prediction', 390, 844, 'family', 'Prediction'],
  ['family-crypto-390', '/products/crypto', 390, 844, 'family', 'Crypto Intelligence'],
  ['family-prediction-320', '/products/prediction', 320, 700, 'family', 'Prediction'],
].map(([id, route, width, height, kind, state]) => ({ id, route, width, height, kind, state }));

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForHttp(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* retry */ }
    await sleep(100);
  }
  throw new Error(`preview_timeout:${url}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(1500)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function inspectMenu(page, width) {
  if (width > 900) return null;
  const trigger = page.locator('.site-header__menu');
  if (!(await trigger.isVisible())) return { present: false };
  await trigger.click();
  const panel = page.locator('.mobile-nav__panel');
  await panel.waitFor({ state: 'visible' });
  const result = await panel.evaluate((element) => {
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const rect = element.getBoundingClientRect();
    const controls = [...element.querySelectorAll('a[href],button')]
      .filter((node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
      })
      .map((node) => {
        const box = node.getBoundingClientRect();
        return { width: box.width, height: box.height, left: box.left, right: box.right };
      });
    return {
      contained: rect.left >= -1 && rect.right <= viewportWidth + 1 && rect.top >= -1 && rect.bottom <= viewportHeight + 1,
      controlsContained: controls.every((item) => item.left >= -1 && item.right <= viewportWidth + 1),
      tooSmall: controls.filter((item) => item.width < 44 || item.height < 44),
    };
  });
  await page.locator('.mobile-nav__close').click();
  await page.locator('.mobile-nav').waitFor({ state: 'hidden' });
  return { present: true, ...result };
}

async function inspectPage(page, expectedFamily) {
  return page.evaluate((family) => {
    const root = document.querySelector('.b12-slice4');
    if (!(root instanceof HTMLElement)) return { missingRoot: true };
    const width = document.documentElement.clientWidth;
    const pageWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const rootRect = root.getBoundingClientRect();
    const targets = [...root.querySelectorAll('button,input,select,.b12-button,.s4-family-row,.s4-family-strip a,.s4-back-link')]
      .filter((node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
      })
      .map((node) => {
        const box = node.getBoundingClientRect();
        return { text: (node.textContent ?? '').trim().replace(/\s+/gu, ' ').slice(0, 60), width: box.width, height: box.height, left: box.left, right: box.right };
      });
    const offenders = [...root.querySelectorAll('*')]
      .filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node.closest('.s4-search-presets')) return false;
        const style = getComputedStyle(node);
        if (style.position === 'fixed') return false;
        const box = node.getBoundingClientRect();
        return box.width > 1 && (box.left < -1 || box.right > width + 1);
      })
      .slice(0, 20)
      .map((node) => ({ tag: node.tagName, className: String(node.className), rect: node.getBoundingClientRect().toJSON() }));
    const heading = root.querySelector('h1')?.textContent?.trim() ?? '';
    return {
      pageWidth,
      viewportWidth: width,
      horizontalOverflow: pageWidth > width + 1,
      rootContained: rootRect.left >= -1 && rootRect.right <= width + 1,
      offenders,
      tooSmallTargets: targets.filter((item) => item.width < 44 || item.height < 44),
      heading,
      familyMatch: family == null ? null : heading === family,
    };
  }, expectedFamily ?? null);
}

async function runProductFixture(page) {
  const trace = [];
  const read = () => page.locator('.b12-product').getAttribute('data-router-state');
  trace.push(await read());
  await page.getByRole('button', { name: 'Run fixture' }).click();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const current = await read();
    if (trace.at(-1) !== current) trace.push(current);
    if (current === 'verified') break;
    await sleep(25);
  }
  if (trace.at(-1) !== 'verified') throw new Error(`product_verified_timeout:${trace.join('>')}`);
  const semantics = await page.evaluate(() => {
    const style = (selector) => {
      const node = document.querySelector(selector);
      return node instanceof Element ? getComputedStyle(node) : null;
    };
    return {
      requestStroke: style('.b12-request .b12-signal-line')?.stroke ?? null,
      qualifyStroke: style('.b12-qualify .b12-signal-line')?.stroke ?? null,
      outcomeStroke: style('.b12-outcome .b12-signal-line')?.stroke ?? null,
      outcomeOpacity: style('.b12-outcome circle')?.opacity ?? null,
      statusDot: style('.s4-router-status i')?.backgroundColor ?? null,
    };
  });
  return { trace: [...new Set(trace.filter(Boolean))], semantics };
}

async function filterCatalogDeterministically(page) {
  const cards = page.locator('.s4-operation-card');
  const initial = await cards.count();
  if (initial < 1) throw new Error('catalog_has_no_observed_routes');
  const exactRoute = (await cards.first().locator('h3').textContent())?.trim();
  if (!exactRoute) throw new Error('catalog_first_route_missing_identity');
  await page.locator('[data-slice4-search]').fill(exactRoute);
  await page.waitForFunction((route) => {
    const headings = [...document.querySelectorAll('.s4-operation-card h3')].map((node) => node.textContent?.trim());
    return headings.length > 0 && headings.every((heading) => heading === route);
  }, exactRoute);
  return { query: exactRoute, shown: await cards.count() };
}

await rm(out, { recursive: true, force: true });
await mkdir(captures, { recursive: true });
const port = await freePort();
const preview = spawn('npm', ['run', 'preview', '--workspace', '@clervo/site', '--', '--host', '127.0.0.1', '--port', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let previewLog = '';
preview.stdout.on('data', (chunk) => { previewLog += String(chunk); });
preview.stderr.on('data', (chunk) => { previewLog += String(chunk); });

const report = { generatedAt: new Date().toISOString(), cases: [], reducedMotion: null, failures: [] };
let browser;
try {
  await waitForHttp(`http://127.0.0.1:${port}/product/`);
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });

  for (const item of cases) {
    const context = await browser.newContext({ viewport: { width: item.width, height: item.height } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}${item.route}`, { waitUntil: 'networkidle' });
    await page.locator('.b12-slice4').waitFor({ state: 'visible' });

    let interaction = null;
    if (item.kind === 'product') {
      interaction = { idleOutcomeOpacity: await page.locator('.b12-outcome circle').evaluate((node) => getComputedStyle(node).opacity) };
      if (item.state === 'verified') interaction = { ...interaction, ...(await runProductFixture(page)) };
    } else if (item.kind === 'catalog' && item.state === 'filtered') {
      interaction = await filterCatalogDeterministically(page);
    }

    const menu = await inspectMenu(page, item.width);
    const inspection = await inspectPage(page, item.kind === 'family' ? item.state : null);
    const screenshot = path.join(captures, `${item.id}.png`);
    const fullPage = path.join(captures, `${item.id}--full-page.png`);
    await page.screenshot({ path: screenshot });
    await page.screenshot({ path: fullPage, fullPage: true });
    report.cases.push({ ...item, consoleErrors, pageErrors, menu, inspection, interaction, screenshot: path.relative(root, screenshot), fullPage: path.relative(root, fullPage) });

    if (consoleErrors.length) report.failures.push(`${item.id}:console`);
    if (pageErrors.length) report.failures.push(`${item.id}:page`);
    if (inspection.missingRoot || inspection.horizontalOverflow || !inspection.rootContained || inspection.offenders.length) report.failures.push(`${item.id}:containment`);
    if (inspection.tooSmallTargets.length) report.failures.push(`${item.id}:targets`);
    if (inspection.familyMatch === false) report.failures.push(`${item.id}:family-name`);
    if (menu && (!menu.present || !menu.contained || !menu.controlsContained || menu.tooSmall.length)) report.failures.push(`${item.id}:menu`);
    if (item.kind === 'product' && item.state === 'entry' && interaction.idleOutcomeOpacity !== '0') report.failures.push(`${item.id}:gold-before-verify`);
    if (item.kind === 'product' && item.state === 'verified') {
      if (JSON.stringify(interaction.trace) !== JSON.stringify(['idle', 'request', 'qualify', 'verified'])) report.failures.push(`${item.id}:trace`);
      const sem = interaction.semantics;
      if (sem.requestStroke !== 'rgb(255, 59, 48)' || sem.qualifyStroke !== 'rgb(0, 229, 255)' || sem.outcomeStroke !== 'rgb(255, 200, 0)' || sem.outcomeOpacity !== '1' || sem.statusDot !== 'rgb(255, 200, 0)') report.failures.push(`${item.id}:state-semantics`);
    }
    await context.close();
  }

  const reducedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const reducedPage = await reducedContext.newPage();
  const reducedConsole = [];
  const reducedErrors = [];
  reducedPage.on('console', (message) => { if (message.type() === 'error') reducedConsole.push(message.text()); });
  reducedPage.on('pageerror', (error) => reducedErrors.push(error.message));
  await reducedPage.goto(`http://127.0.0.1:${port}/product/`, { waitUntil: 'networkidle' });
  await reducedPage.getByRole('button', { name: 'Run fixture' }).click();
  await reducedPage.waitForFunction(() => document.querySelector('.b12-product')?.getAttribute('data-router-state') === 'verified');
  const reduced = await reducedPage.evaluate(() => {
    const root = document.querySelector('.b12-slice4');
    const liquid = document.querySelector('.b12-slice4 .b12-liquid');
    return root instanceof HTMLElement && liquid instanceof HTMLElement ? {
      media: matchMedia('(prefers-reduced-motion: reduce)').matches,
      transition: getComputedStyle(liquid).transitionDuration,
      animation: getComputedStyle(liquid).animationDuration,
      state: document.querySelector('.b12-product')?.getAttribute('data-router-state'),
      overflow: root.scrollWidth > document.documentElement.clientWidth + 1,
    } : null;
  });
  await reducedPage.screenshot({ path: path.join(captures, 'product-390-reduced-motion.png') });
  report.reducedMotion = { reduced, consoleErrors: reducedConsole, pageErrors: reducedErrors };
  if (reduced === null || !reduced.media || reduced.state !== 'verified' || reduced.overflow || reducedConsole.length || reducedErrors.length) report.failures.push('reduced-motion');
  await reducedContext.close();
} finally {
  if (browser) await browser.close();
  await stop(preview);
  await writeFile(path.join(out, 'preview.log'), previewLog);
  await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(out, 'summary.md'), `# B12 Slice 4 integrated QA\n\nCases: ${report.cases.length}\nViewport captures: ${report.cases.length}\nFull-page captures: ${report.cases.length}\nFailures: ${report.failures.length}\n${report.failures.length ? report.failures.map((failure) => `- ${failure}`).join('\n') : '- none'}\n\nOwner/control-room visual approval is still required.\n`);
}

if (report.failures.length) {
  console.error(`B12 Slice 4 QA: FAIL (${report.failures.join(', ')})`);
  process.exit(1);
}
console.log(`B12 Slice 4 QA: PASS (${report.cases.length} viewport + ${report.cases.length} full-page captures)`);
console.log(path.join(out, 'summary.md'));
