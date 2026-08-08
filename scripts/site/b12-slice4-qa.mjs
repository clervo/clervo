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
  { id: 'product-1600-entry', path: '/product', width: 1600, height: 900, kind: 'product', state: 'entry' },
  { id: 'product-1600-verified', path: '/product', width: 1600, height: 900, kind: 'product', state: 'verified' },
  { id: 'product-1024-entry', path: '/product', width: 1024, height: 768, kind: 'product', state: 'entry' },
  { id: 'product-390-entry', path: '/product', width: 390, height: 844, kind: 'product', state: 'entry' },
  { id: 'product-390-verified', path: '/product', width: 390, height: 844, kind: 'product', state: 'verified' },
  { id: 'product-320-entry', path: '/product', width: 320, height: 700, kind: 'product', state: 'entry' },
  { id: 'catalog-1600-entry', path: '/catalog', width: 1600, height: 900, kind: 'catalog', state: 'entry' },
  { id: 'catalog-1600-filtered', path: '/catalog', width: 1600, height: 900, kind: 'catalog', state: 'filtered' },
  { id: 'catalog-1024-entry', path: '/catalog', width: 1024, height: 768, kind: 'catalog', state: 'entry' },
  { id: 'catalog-390-entry', path: '/catalog', width: 390, height: 844, kind: 'catalog', state: 'entry' },
  { id: 'catalog-320-entry', path: '/catalog', width: 320, height: 700, kind: 'catalog', state: 'entry' },
  { id: 'family-search-1600', path: '/products/search', width: 1600, height: 900, kind: 'family', family: 'Search' },
  { id: 'family-ai-1024', path: '/products/ai', width: 1024, height: 768, kind: 'family', family: 'AI' },
  { id: 'family-search-390', path: '/products/search', width: 390, height: 844, kind: 'family', family: 'Search' },
  { id: 'family-ai-390', path: '/products/ai', width: 390, height: 844, kind: 'family', family: 'AI' },
  { id: 'family-sandbox-390', path: '/products/sandbox', width: 390, height: 844, kind: 'family', family: 'Secure Sandbox' },
  { id: 'family-rpc-390', path: '/products/rpc', width: 390, height: 844, kind: 'family', family: 'Multi-chain RPC' },
  { id: 'family-prediction-390', path: '/products/prediction', width: 390, height: 844, kind: 'family', family: 'Prediction' },
  { id: 'family-crypto-390', path: '/products/crypto', width: 390, height: 844, kind: 'family', family: 'Crypto Intelligence' },
  { id: 'family-prediction-320', path: '/products/prediction', width: 320, height: 700, kind: 'family', family: 'Prediction' },
];

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForHttp(url, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* retry */ }
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

function unique(values) { return [...new Set(values)]; }

async function inspectMenu(page, width) {
  if (width > 900) return null;
  const trigger = page.locator('.site-header__menu');
  if (await trigger.count() === 0 || !(await trigger.isVisible())) return { present: false };
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
        return { text: (node.textContent ?? '').trim().replace(/\s+/gu, ' ').slice(0, 80), width: box.width, height: box.height, left: box.left, right: box.right };
      });
    return {
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      contained: rect.left >= -1 && rect.right <= viewportWidth + 1 && rect.top >= -1 && rect.bottom <= viewportHeight + 1,
      controlsContained: controls.every((item) => item.left >= -1 && item.right <= viewportWidth + 1),
      tooSmall: controls.filter((item) => item.width < 44 || item.height < 44),
    };
  });
  await page.locator('.mobile-nav__close').click();
  await page.locator('.mobile-nav').waitFor({ state: 'hidden' });
  return { present: true, ...result };
}

async function inspectPage(page, item) {
  return page.evaluate(({ kind, family }) => {
    const root = document.querySelector('.b12-slice4');
    if (!(root instanceof HTMLElement)) return { missingRoot: true };
    const doc = document.documentElement;
    const body = document.body;
    const width = doc.clientWidth;
    const rootRect = root.getBoundingClientRect();
    const standalone = [...root.querySelectorAll('button,input,select,.b12-button,.s4-family-row,.s4-family-strip a,.s4-back-link')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { tag: node.tagName, text: (node.textContent ?? '').trim().replace(/\s+/gu, ' ').slice(0, 70), width: rect.width, height: rect.height, left: rect.left, right: rect.right };
      });
    const horizontalOffenders = [...root.querySelectorAll('*')]
      .filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        if (style.position === 'fixed' || node.closest('.s4-search-presets')) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 1 && (rect.left < -1 || rect.right > width + 1);
      })
      .slice(0, 20)
      .map((node) => ({ selector: `${node.tagName.toLowerCase()}.${node.className}`, rect: node.getBoundingClientRect().toJSON() }));
    const heading = root.querySelector('h1')?.textContent?.trim() ?? '';
    return {
      kind,
      heading,
      familyExpected: family ?? null,
      familyMatch: family == null ? null : heading === family,
      documentWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      viewportWidth: width,
      horizontalOverflow: Math.max(doc.scrollWidth, body.scrollWidth) > width + 1,
      rootContained: rootRect.left >= -1 && rootRect.right <= width + 1,
      horizontalOffenders,
      tooSmallTargets: standalone.filter((item) => item.width < 44 || item.height < 44),
    };
  }, { kind: item.kind, family: item.family ?? null });
}

async function runProductFixture(page) {
  const trace = [];
  const state = async () => page.locator('.b12-product').getAttribute('data-router-state');
  trace.push(await state());
  await page.getByRole('button', { name: 'Run fixture' }).click();
  const end = Date.now() + 5_000;
  while (Date.now() < end) {
    const next = await state();
    if (trace.at(-1) !== next) trace.push(next);
    if (next === 'verified') break;
    await sleep(25);
  }
  if (trace.at(-1) !== 'verified') throw new Error(`slice4_product_verified_timeout:${trace.join('>')}`);
  const semantics = await page.evaluate(() => {
    const stroke = (selector) => {
      const node = document.querySelector(selector);
      return node instanceof SVGElement ? getComputedStyle(node).stroke : null;
    };
    const opacity = (selector) => {
      const node = document.querySelector(selector);
      return node instanceof Element ? getComputedStyle(node).opacity : null;
    };
    const dot = document.querySelector('.s4-router-status i');
    return {
      requestStroke: stroke('.b12-product .b12-request .b12-signal-line'),
      qualifyStroke: stroke('.b12-product .b12-qualify .b12-signal-line'),
      outcomeStroke: stroke('.b12-product .b12-outcome .b12-signal-line'),
      outcomeCircleOpacity: opacity('.b12-product .b12-outcome circle'),
      statusDot: dot instanceof HTMLElement ? getComputedStyle(dot).backgroundColor : null,
    };
  });
  return { trace: unique(trace.filter(Boolean)), semantics };
}

await rm(out, { recursive: true, force: true });
await mkdir(captures, { recursive: true });
const port = await freePort();
const preview = spawn('npm', ['run', 'preview', '--workspace', '@clervo/site', '--', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let previewLog = '';
preview.stdout.on('data', (chunk) => { previewLog += String(chunk); });
preview.stderr.on('data', (chunk) => { previewLog += String(chunk); });

const report = { generatedAt: new Date().toISOString(), port, cases: [], reducedMotion: null, failures: [] };
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
    await page.goto(`http://127.0.0.1:${port}${item.path}`, { waitUntil: 'networkidle' });
    await page.locator('.b12-slice4').waitFor({ state: 'visible' });

    let interaction = null;
    if (item.kind === 'product') {
      const idleGold = await page.evaluate(() => {
        const line = document.querySelector('.b12-product .b12-outcome .b12-signal-line');
        const circle = document.querySelector('.b12-product .b12-outcome circle');
        return {
          lineTransform: line instanceof SVGElement ? getComputedStyle(line).transform : null,
          circleOpacity: circle instanceof SVGElement ? getComputedStyle(circle).opacity : null,
        };
      });
      interaction = { idleGold };
      if (item.state === 'verified') interaction = { ...interaction, ...(await runProductFixture(page)) };
    } else if (item.kind === 'catalog') {
      await page.locator('[data-slice4-search]').focus();
      if (item.state === 'filtered') {
        await page.locator('[data-slice4-search]').fill('search');
        await page.waitForFunction(() => document.querySelectorAll('.s4-operation-card').length > 0);
        interaction = { query: 'search', shown: await page.locator('.s4-operation-card').count() };
      }
    }

    const menu = await inspectMenu(page, item.width);
    const inspection = await inspectPage(page, item);
    const screenshot = path.join(captures, `${item.id}.png`);
    const fullPage = path.join(captures, `${item.id}--full-page.png`);
    await page.screenshot({ path: screenshot });
    await page.screenshot({ path: fullPage, fullPage: true });
    const result = { ...item, consoleErrors, pageErrors, menu, inspection, interaction, screenshot: path.relative(root, screenshot), fullPage: path.relative(root, fullPage) };
    report.cases.push(result);
    if (consoleErrors.length) report.failures.push(`${item.id}:console`);
    if (pageErrors.length) report.failures.push(`${item.id}:page`);
    if (inspection.missingRoot || inspection.horizontalOverflow || !inspection.rootContained || inspection.horizontalOffenders.length) report.failures.push(`${item.id}:containment`);
    if (inspection.tooSmallTargets.length) report.failures.push(`${item.id}:targets`);
    if (inspection.familyMatch === false) report.failures.push(`${item.id}:family_name`);
    if (menu && (!menu.present || !menu.contained || !menu.controlsContained || menu.tooSmall.length)) report.failures.push(`${item.id}:menu`);
    if (item.kind === 'product' && item.state === 'entry' && interaction?.idleGold?.circleOpacity !== '0') report.failures.push(`${item.id}:gold_before_verify`);
    if (item.kind === 'product' && item.state === 'verified') {
      const expectedTrace = ['idle', 'request', 'qualify', 'verified'];
      if (JSON.stringify(interaction?.trace) !== JSON.stringify(expectedTrace)) report.failures.push(`${item.id}:trace`);
      const sem = interaction?.semantics;
      if (sem?.requestStroke !== 'rgb(255, 59, 48)' || sem?.qualifyStroke !== 'rgb(0, 229, 255)' || sem?.outcomeStroke !== 'rgb(255, 200, 0)' || sem?.outcomeCircleOpacity !== '1' || sem?.statusDot !== 'rgb(255, 200, 0)') report.failures.push(`${item.id}:semantics`);
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
    if (!(root instanceof HTMLElement) || !(liquid instanceof HTMLElement)) return null;
    return {
      media: matchMedia('(prefers-reduced-motion: reduce)').matches,
      transition: getComputedStyle(liquid).transitionDuration,
      animation: getComputedStyle(liquid).animationDuration,
      state: document.querySelector('.b12-product')?.getAttribute('data-router-state'),
      overflow: root.scrollWidth > document.documentElement.clientWidth + 1,
    };
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
  const summary = [
    '# B12 Slice 4 integrated QA',
    '',
    `Cases: ${report.cases.length}`,
    `Viewport captures: ${report.cases.length}`,
    `Full-page captures: ${report.cases.length}`,
    `Failures: ${report.failures.length}`,
    ...(report.failures.length ? report.failures.map((failure) => `- ${failure}`) : ['- none']),
    '',
    'Owner/control-room visual approval is still required.',
  ].join('\n');
  await writeFile(path.join(out, 'summary.md'), `${summary}\n`);
}

if (report.failures.length) {
  console.error(`B12 Slice 4 QA: FAIL (${report.failures.join(', ')})`);
  process.exit(1);
}
console.log(`B12 Slice 4 QA: PASS (${report.cases.length} viewport + ${report.cases.length} full-page captures)`);
console.log(path.join(out, 'summary.md'));
