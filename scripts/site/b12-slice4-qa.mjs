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
  ['family-prediction-390', '/products/prediction', 390, 844, 'family', 'Prediction'],
  ['family-crypto-320', '/products/crypto', 320, 700, 'family', 'Crypto Intelligence'],
].map(([id, route, width, height, kind, state]) => ({ id, route, width, height, kind, state }));

const familyRoutes = [
  ['/products/search', 'Search'],
  ['/products/ai', 'AI'],
  ['/products/sandbox', 'Secure Sandbox'],
  ['/products/rpc', 'Multi-chain RPC'],
  ['/products/prediction', 'Prediction'],
  ['/products/crypto', 'Crypto Intelligence'],
];

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
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(1200)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function openRoute(page, base, route) {
  await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.b12-slice4').waitFor({ state: 'visible' });
  await page.locator('h1').waitFor({ state: 'visible' });
}

async function inspectMenu(page, width) {
  if (width > 900) return null;
  const trigger = page.locator('.site-header__menu');
  if (!(await trigger.isVisible())) return { present: false };
  await trigger.click();
  const panel = page.locator('.mobile-nav__panel');
  await panel.waitFor({ state: 'visible' });
  const result = await panel.evaluate((element) => {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const rect = element.getBoundingClientRect();
    const controls = [...element.querySelectorAll('a[href],button')].map((node) => {
      const box = node.getBoundingClientRect();
      return { width: box.width, height: box.height, left: box.left, right: box.right };
    }).filter((item) => item.width > 0 && item.height > 0);
    return {
      contained: rect.left >= -1 && rect.right <= vw + 1 && rect.top >= -1 && rect.bottom <= vh + 1,
      controlsContained: controls.every((item) => item.left >= -1 && item.right <= vw + 1),
      tooSmall: controls.filter((item) => item.width < 44 || item.height < 44),
    };
  });
  await page.locator('.mobile-nav__close').click();
  await page.locator('.mobile-nav').waitFor({ state: 'hidden' });
  return { present: true, ...result };
}

async function inspectPage(page, expectedFamily = null) {
  return page.evaluate((family) => {
    const root = document.querySelector('.b12-slice4');
    if (!(root instanceof HTMLElement)) return { missingRoot: true };
    const vw = document.documentElement.clientWidth;
    const rootRect = root.getBoundingClientRect();
    const pageWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const controls = [...root.querySelectorAll('button,input,select,.b12-button,.s4-family-row,.s4-family-strip a,.s4-back-link')]
      .filter((node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
      })
      .map((node) => {
        const box = node.getBoundingClientRect();
        return { width: box.width, height: box.height, left: box.left, right: box.right, text: (node.textContent ?? '').trim().slice(0, 60) };
      });
    const offenders = [...root.querySelectorAll('*')]
      .filter((node) => {
        if (!(node instanceof HTMLElement) || node.closest('.s4-search-presets')) return false;
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.position !== 'fixed' && box.width > 1 && (box.left < -1 || box.right > vw + 1);
      })
      .slice(0, 20)
      .map((node) => ({ tag: node.tagName, className: String(node.className), rect: node.getBoundingClientRect().toJSON() }));
    const sections = [...root.querySelectorAll(':scope > section, :scope > .s4-family-content > section')]
      .map((node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return { className: String(node.className), width: box.width, height: box.height, display: style.display, visibility: style.visibility };
      });
    const heading = root.querySelector('h1')?.textContent?.trim() ?? '';
    return {
      pageWidth,
      viewportWidth: vw,
      horizontalOverflow: pageWidth > vw + 1,
      rootContained: rootRect.left >= -1 && rootRect.right <= vw + 1,
      offenders,
      tooSmallTargets: controls.filter((item) => item.width < 44 || item.height < 44),
      clippedOrHiddenSections: sections.filter((item) => item.width < 1 || item.height < 1 || item.display === 'none' || item.visibility === 'hidden'),
      heading,
      familyMatch: family === null ? null : heading === family,
    };
  }, expectedFamily);
}

async function runProductFixture(page) {
  await page.evaluate(() => {
    const root = document.querySelector('.b12-product');
    window.__b12Slice4Trace = [root?.getAttribute('data-router-state')];
    if (root) new MutationObserver(() => window.__b12Slice4Trace.push(root.getAttribute('data-router-state'))).observe(root, { attributes: true, attributeFilter: ['data-router-state'] });
  });
  await page.getByRole('button', { name: 'Run fixture' }).click();
  await page.waitForFunction(() => document.querySelector('.b12-product')?.getAttribute('data-router-state') === 'verified');
  await page.waitForFunction(() => {
    const node = document.querySelector('.b12-outcome circle');
    return node instanceof Element && Number.parseFloat(getComputedStyle(node).opacity) > 0.99;
  }, null, { timeout: 3000 });
  return page.evaluate(() => {
    const style = (selector) => {
      const node = document.querySelector(selector);
      return node instanceof Element ? getComputedStyle(node) : null;
    };
    return {
      trace: [...new Set((window.__b12Slice4Trace ?? []).filter(Boolean))],
      semantics: {
        requestStroke: style('.b12-request .b12-signal-line')?.stroke ?? null,
        qualifyStroke: style('.b12-qualify .b12-signal-line')?.stroke ?? null,
        outcomeStroke: style('.b12-outcome .b12-signal-line')?.stroke ?? null,
        outcomeOpacity: style('.b12-outcome circle')?.opacity ?? null,
        statusDot: style('.s4-router-status i')?.backgroundColor ?? null,
      },
    };
  });
}

async function filterCatalog(page) {
  const cards = page.locator('.s4-operation-card');
  if (await cards.count() < 1) throw new Error('catalog_has_no_observed_routes');
  const exactRoute = (await cards.first().locator('h3').textContent())?.trim();
  if (!exactRoute) throw new Error('catalog_first_route_missing_identity');
  await page.locator('[data-slice4-search]').fill(exactRoute);
  await page.waitForFunction((route) => {
    const headings = [...document.querySelectorAll('.s4-operation-card h3')].map((node) => node.textContent?.trim());
    return headings.length > 0 && headings.every((heading) => heading === route);
  }, exactRoute, { timeout: 3000 });
  return { query: exactRoute, shown: await cards.count() };
}

await rm(out, { recursive: true, force: true });
await mkdir(captures, { recursive: true });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const preview = spawn('npm', ['run', 'preview', '--workspace', '@clervo/site', '--', '--host', '127.0.0.1', '--port', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let previewLog = '';
preview.stdout.on('data', (chunk) => { previewLog += String(chunk); });
preview.stderr.on('data', (chunk) => { previewLog += String(chunk); });
const report = { generatedAt: new Date().toISOString(), cases: [], familyRouteAudit: [], reducedMotion: null, failures: [] };
let browser;

try {
  await waitForHttp(`${base}/product/`);
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });

  for (const item of cases) {
    const context = await browser.newContext({ viewport: { width: item.width, height: item.height } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await openRoute(page, base, item.route);

    let interaction = null;
    if (item.kind === 'product') {
      interaction = { idleOutcomeOpacity: await page.locator('.b12-outcome circle').evaluate((node) => getComputedStyle(node).opacity) };
      if (item.state === 'verified') interaction = { ...interaction, ...(await runProductFixture(page)) };
    } else if (item.kind === 'catalog' && item.state === 'filtered') interaction = await filterCatalog(page);

    const menu = await inspectMenu(page, item.width);
    const inspection = await inspectPage(page, item.kind === 'family' ? item.state : null);
    const screenshot = path.join(captures, `${item.id}.png`);
    await page.screenshot({ path: screenshot });
    let fullPage = null;
    if (['product-390-entry', 'catalog-390-entry', 'family-prediction-390'].includes(item.id)) {
      fullPage = path.join(captures, `${item.id}--full-page.png`);
      await page.screenshot({ path: fullPage, fullPage: true });
    }
    report.cases.push({ ...item, consoleErrors, pageErrors, menu, inspection, interaction, screenshot: path.relative(root, screenshot), fullPage: fullPage ? path.relative(root, fullPage) : null });

    if (consoleErrors.length) report.failures.push(`${item.id}:console`);
    if (pageErrors.length) report.failures.push(`${item.id}:page`);
    if (inspection.missingRoot || inspection.horizontalOverflow || !inspection.rootContained || inspection.offenders.length || inspection.clippedOrHiddenSections.length) report.failures.push(`${item.id}:containment`);
    if (inspection.tooSmallTargets.length) report.failures.push(`${item.id}:targets`);
    if (inspection.familyMatch === false) report.failures.push(`${item.id}:family-name`);
    if (menu && (!menu.present || !menu.contained || !menu.controlsContained || menu.tooSmall.length)) report.failures.push(`${item.id}:menu`);
    if (item.kind === 'product' && item.state === 'entry' && interaction.idleOutcomeOpacity !== '0') report.failures.push(`${item.id}:gold-before-verify`);
    if (item.kind === 'product' && item.state === 'verified') {
      if (JSON.stringify(interaction.trace) !== JSON.stringify(['idle', 'request', 'qualify', 'verified'])) report.failures.push(`${item.id}:trace`);
      const sem = interaction.semantics;
      if (sem.requestStroke !== 'rgb(255, 59, 48)' || sem.qualifyStroke !== 'rgb(0, 229, 255)' || sem.outcomeStroke !== 'rgb(255, 200, 0)' || Number.parseFloat(sem.outcomeOpacity) < 0.99 || sem.statusDot !== 'rgb(255, 200, 0)') report.failures.push(`${item.id}:state-semantics`);
    }
    await context.close();
  }

  const auditContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const auditPage = await auditContext.newPage();
  for (const [route, name] of familyRoutes) {
    const consoleErrors = [];
    const pageErrors = [];
    const onConsole = (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onError = (error) => pageErrors.push(error.message);
    auditPage.on('console', onConsole);
    auditPage.on('pageerror', onError);
    await openRoute(auditPage, base, route);
    const inspection = await inspectPage(auditPage, name);
    report.familyRouteAudit.push({ route, name, consoleErrors, pageErrors, inspection });
    if (consoleErrors.length || pageErrors.length || inspection.horizontalOverflow || inspection.offenders.length || inspection.tooSmallTargets.length || inspection.familyMatch === false) report.failures.push(`family-audit:${name}`);
    auditPage.off('console', onConsole);
    auditPage.off('pageerror', onError);
  }
  await auditContext.close();

  const reducedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const reducedPage = await reducedContext.newPage();
  const reducedConsole = [];
  const reducedErrors = [];
  reducedPage.on('console', (message) => { if (message.type() === 'error') reducedConsole.push(message.text()); });
  reducedPage.on('pageerror', (error) => reducedErrors.push(error.message));
  await openRoute(reducedPage, base, '/product');
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
  await writeFile(path.join(out, 'summary.md'), `# B12 Slice 4 integrated QA\n\nViewport cases: ${report.cases.length}\nRepresentative full-page captures: 3\nSix-family route audits: ${report.familyRouteAudit.length}\nFailures: ${report.failures.length}\n${report.failures.length ? report.failures.map((failure) => `- ${failure}`).join('\n') : '- none'}\n\nOwner/control-room visual approval is still required.\n`);
}

if (report.failures.length) {
  console.error(`B12 Slice 4 QA: FAIL (${report.failures.join(', ')})`);
  process.exit(1);
}
console.log(`B12 Slice 4 QA: PASS (${report.cases.length} viewport cases + 6 family route audits)`);
console.log(path.join(out, 'summary.md'));
