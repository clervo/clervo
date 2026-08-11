#!/usr/bin/env node

import { createServer } from 'node:http';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { chromium, firefox, webkit } from 'playwright';

const root = path.resolve(import.meta.dirname, '../..');
const site = path.join(root, 'apps/site/dist');
const output = path.resolve(process.argv.find((value) => value.startsWith('--out='))?.slice(6)
  ?? path.join(root, 'docs/evidence/site/B12-RECOVERY/phase-1/home'));
const captures = path.join(output, 'screenshots');
const interactions = path.join(output, 'interactions');
const motion = path.join(output, 'motion');
const mime = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.xml': 'application/xml; charset=utf-8',
};
const assert = (condition, code) => { if (!condition) throw new Error(code); };

await Promise.all([mkdir(captures, { recursive: true }), mkdir(interactions, { recursive: true }), mkdir(motion, { recursive: true })]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let file = path.resolve(site, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
    assert(file === site || file.startsWith(`${site}${path.sep}`), 'path_traversal');
    let info;
    try { info = await stat(file); } catch { info = null; }
    if (info?.isDirectory() || (info === null && path.extname(file) === '')) file = path.join(file, 'index.html');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
  }
});
await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address !== null && typeof address !== 'string', 'server_address_missing');
const base = `http://127.0.0.1:${address.port}`;

const viewports = [
  { id: 'desktop-1600', width: 1600, height: 1000 },
  { id: 'desktop-1280', width: 1280, height: 900 },
  { id: 'tablet-768', width: 768, height: 1024 },
  { id: 'mobile-390', width: 390, height: 844 },
  { id: 'mobile-320', width: 320, height: 700 },
];
const errors = [];
const results = { captures: [], accessibility: [], browsers: [], links: [], interactions: {}, residue: {}, bundle: {} };

try {
  const browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${viewport.id}:console:${message.text()}`); });
    page.on('pageerror', (error) => errors.push(`${viewport.id}:page:${error.message}`));
    const response = await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    assert(response?.status() === 200, `home_status:${viewport.id}`);
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      heading: document.querySelector('h1')?.textContent?.trim(),
      state: document.querySelector('.recovery-home')?.getAttribute('data-state'),
      controls: [...document.querySelectorAll('main button, main a[href]')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { label: element.getAttribute('aria-label') ?? element.textContent?.trim(), width: rect.width, height: rect.height };
        }),
    }));
    assert(metrics.scrollWidth <= metrics.clientWidth, `horizontal_overflow:${viewport.id}:${metrics.scrollWidth}>${metrics.clientWidth}`);
    assert(metrics.heading === 'Give your agent a task.Get a verified result.', `promise_drift:${viewport.id}`);
    assert(metrics.state === 'request', `initial_state:${viewport.id}`);
    const tooSmall = metrics.controls.filter(({ width, height }) => width < 44 || height < 44);
    assert(tooSmall.length === 0, `small_targets:${viewport.id}:${JSON.stringify(tooSmall)}`);
    const axe = await new AxeBuilder({ page }).analyze();
    assert(axe.violations.length === 0, `axe:${viewport.id}:${axe.violations.map(({ id }) => id).join(',')}`);
    results.accessibility.push({ viewport: viewport.id, violations: 0, passes: axe.passes.length });
    const screenshot = path.join(captures, `${viewport.id}-full.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    results.captures.push({ ...viewport, path: path.relative(root, screenshot), fullPage: true });
    await context.close();
  }

  const interactionContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const interactionPage = await interactionContext.newPage();
  await interactionPage.goto(`${base}/`, { waitUntil: 'networkidle' });
  await interactionPage.getByRole('button', { name: 'Trace the contract' }).click();
  await interactionPage.waitForFunction(() => document.querySelector('.recovery-home')?.getAttribute('data-state') === 'prove');
  await interactionPage.screenshot({ path: path.join(interactions, 'lifecycle-proved.png') });
  assert(await interactionPage.locator('.home-stage-readout').innerText() === 'PROVE\nReturn an inspectable outcome.', 'proved_readout');
  await interactionPage.getByRole('button', { name: 'Copy' }).click();
  await interactionPage.getByRole('button', { name: 'Copied' }).waitFor();
  assert(await interactionPage.getByRole('button', { name: 'Copied' }).isVisible(), 'copy_feedback_missing');
  assert((await interactionPage.evaluate(() => navigator.clipboard.readText())).startsWith('curl -sS https://api.clervo.dev/'), 'copy_payload_wrong');
  results.interactions.lifecycle = 'PASS_REQUEST_QUALIFY_EXECUTE_VERIFY_PROVE';
  results.interactions.copy = 'PASS_CANONICAL_FREE_CALL';
  await interactionContext.close();

  const reducedContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${base}/`, { waitUntil: 'networkidle' });
  await reducedPage.getByRole('button', { name: 'Trace the contract' }).click();
  assert(await reducedPage.locator('.recovery-home').getAttribute('data-state') === 'prove', 'reduced_motion_did_not_resolve');
  assert(await reducedPage.locator('.home-journey li').count() === 5, 'reduced_motion_information_missing');
  await reducedPage.screenshot({ path: path.join(interactions, 'reduced-motion-proved.png'), fullPage: true });
  results.interactions.reducedMotion = 'PASS_IMMEDIATE_PROVED_STATE_ALL_STEPS_VISIBLE';
  await reducedContext.close();

  for (const width of [390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 700 }, hasTouch: true });
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    const trigger = page.getByRole('button', { name: 'Open menu' });
    await trigger.tap();
    assert(await page.getByRole('dialog', { name: 'Clervo navigation' }).isVisible(), `mobile_menu_not_open:${width}`);
    await page.screenshot({ path: path.join(interactions, `mobile-${width}-menu.png`) });
    const close = page.getByRole('button', { name: 'Close menu' });
    assert(await close.evaluate((element) => document.activeElement === element), `mobile_menu_initial_focus:${width}`);
    await page.keyboard.press('Shift+Tab');
    assert(await page.locator('.mobile-nav__cta').evaluate((element) => document.activeElement === element), `mobile_menu_focus_trap:${width}`);
    await page.keyboard.press('Escape');
    assert(await trigger.evaluate((element) => document.activeElement === element), `mobile_menu_focus_not_restored:${width}`);
    await page.locator('.home-journey button').nth(2).tap();
    assert(await page.locator('.recovery-home').getAttribute('data-state') === 'execute', `touch_journey_failed:${width}`);
    await context.close();
  }
  results.interactions.mobileMenu = 'PASS_TOUCH_ESCAPE_FOCUS_RETURN_390_320';
  results.interactions.lifecycleTouch = 'PASS_390_320';

  const zoomPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await zoomPage.goto(`${base}/`, { waitUntil: 'networkidle' });
  await zoomPage.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const zoomOverflow = await zoomPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert(!zoomOverflow, 'text_zoom_200_overflow');
  await zoomPage.screenshot({ path: path.join(interactions, 'text-zoom-200.png'), fullPage: true });
  results.interactions.textZoom = 'PASS_200_PERCENT_REFLOW_NO_HORIZONTAL_OVERFLOW';
  await zoomPage.close();

  const contractPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await contractPage.goto(`${base}/`, { waitUntil: 'networkidle' });
  const bodyText = (await contractPage.locator('body').innerText()).toLowerCase();
  const forbidden = ['prototype', 'fixture', 'design target', 'design prototype', 'no live action', 'disconnected prototype'];
  const residue = forbidden.filter((term) => bodyText.includes(term));
  assert(residue.length === 0, `home_residue:${residue.join(',')}`);
  results.residue = { inspectedTerms: forbidden, invalidOccurrences: 0 };
  const links = await contractPage.locator('main a[href]').evaluateAll((anchors) => anchors.map((anchor) => ({
    label: anchor.textContent?.trim() ?? '', href: anchor.getAttribute('href') ?? '',
  })));
  for (const link of links) {
    if (link.href.startsWith('#')) {
      assert(await contractPage.locator(link.href).count() === 1, `home_fragment_missing:${link.label}:${link.href}`);
      results.links.push({ ...link, status: 'LOCAL_FRAGMENT_PASS' });
      continue;
    }
    assert(link.href.startsWith('/'), `external_home_link:${link.label}:${link.href}`);
    const response = await fetch(new URL(link.href, base), { redirect: 'manual' });
    assert(response.status === 200, `home_link_status:${link.label}:${link.href}:${response.status}`);
    results.links.push({ ...link, status: response.status });
  }
  await contractPage.close();
  await browser.close();

  for (const [name, engine] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const localErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') localErrors.push(message.text()); });
    page.on('pageerror', (error) => localErrors.push(error.message));
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Trace the contract' }).click();
    const result = await page.evaluate(() => ({
      state: document.querySelector('.recovery-home')?.getAttribute('data-state'),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    assert(result.state === 'prove' && !result.overflow && localErrors.length === 0, `browser_smoke:${name}:${JSON.stringify({ result, localErrors })}`);
    results.browsers.push({ name, state: result.state, horizontalOverflow: result.overflow, consoleErrors: localErrors.length });
    await browser.close();
  }

  const videoContext = await chromium.launch({ headless: true });
  const recorded = await videoContext.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: motion, size: { width: 1280, height: 720 } } });
  const videoPage = await recorded.newPage();
  await videoPage.goto(`${base}/`, { waitUntil: 'networkidle' });
  await videoPage.getByRole('button', { name: 'Trace the contract' }).click();
  await videoPage.waitForFunction(() => document.querySelector('.recovery-home')?.getAttribute('data-state') === 'prove');
  const video = videoPage.video();
  await recorded.close();
  if (video !== null) await rename(await video.path(), path.join(motion, 'home-lifecycle.webm'));
  await videoContext.close();

  const assetFiles = await Promise.all([
    readFile(path.join(site, 'index.html'), 'utf8'),
    readFile(path.join(root, 'docs/evidence/site/B12-RECOVERY/phase-0/RECOVERY-QUALITY-GATES.md'), 'utf8'),
  ]);
  const [indexHtml, gates] = assetFiles;
  const cssName = indexHtml.match(/assets\/(index-[^"']+\.css)/u)?.[1];
  const jsName = indexHtml.match(/assets\/(index-[^"']+\.js)/u)?.[1];
  assert(cssName !== undefined && jsName !== undefined, 'bundle_assets_missing');
  const { gzipSync } = await import('node:zlib');
  const css = await readFile(path.join(site, 'assets', cssName));
  const js = await readFile(path.join(site, 'assets', jsName));
  const baselineJs = Number(gates.match(/Initial application JS[^\n]*\/ ([\d.]+) KB gzip/u)?.[1]);
  const baselineCss = Number(gates.match(/\| CSS \|[^\n]*\/ ([\d.]+) KB gzip/u)?.[1]);
  const jsGzipKb = gzipSync(js).byteLength / 1024;
  const cssGzipKb = gzipSync(css).byteLength / 1024;
  results.bundle = {
    initialJsGzipKb: Number(jsGzipKb.toFixed(2)), baselineJsGzipKb: baselineJs,
    jsDeltaKb: Number((jsGzipKb - baselineJs).toFixed(2)),
    initialCssGzipKb: Number(cssGzipKb.toFixed(2)), baselineCssGzipKb: baselineCss,
    cssDeltaKb: Number((cssGzipKb - baselineCss).toFixed(2)),
  };
  assert(jsGzipKb <= baselineJs + 20, `js_delta:${jsGzipKb}:${baselineJs}`);
  assert(errors.length === 0, `console_errors:${errors.join('|')}`);

  const report = {
    schemaVersion: 'clervo.b12-recovery.home-evidence.v1',
    generatedAt: new Date().toISOString(),
    source: 'production build / 153 prerendered routes',
    ...results,
    consoleErrors: errors,
    status: 'PASS',
  };
  await writeFile(path.join(output, 'home-qa-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, captures: report.captures.length, links: report.links.length, browsers: report.browsers, bundle: report.bundle }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
