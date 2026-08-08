#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1] ?? null;
};
const site = path.resolve(value('--site-root') ?? path.join(root, 'apps/site/dist'));
const out = path.resolve(value('--out') ?? path.join(root, 'apps/site/qa-artifacts-final'));
const useBuilt = has('--use-built');
const captures = path.join(out, 'captures');
const contactSheets = path.join(out, 'contact-sheets');
const dedicated = path.join(out, 'dedicated');

const viewports = [
  { id: '1600', width: 1600, height: 900 },
  { id: '1024', width: 1024, height: 768 },
  { id: '390', width: 390, height: 844 },
  { id: '320', width: 320, height: 700 },
];

const routes = [
  { id: 'home', path: '/' },
  { id: 'start', path: '/start' },
  { id: 'product', path: '/product' },
  { id: 'catalog', path: '/catalog' },
  { id: 'family-search', path: '/products/search' },
  { id: 'family-ai', path: '/products/ai' },
  { id: 'family-sandbox', path: '/products/sandbox' },
  { id: 'family-rpc', path: '/products/rpc' },
  { id: 'family-prediction', path: '/products/prediction' },
  { id: 'family-crypto', path: '/products/crypto' },
  { id: 'operation-search-web', path: '/operations/search.web' },
  { id: 'pricing', path: '/pricing', support: true },
  { id: 'proof', path: '/proof', support: true },
  { id: 'docs', path: '/docs', support: true },
  { id: 'status', path: '/status', support: true },
  { id: 'security', path: '/security', support: true },
  { id: 'benchmarks', path: '/benchmarks', support: true },
  { id: 'changelog', path: '/changelog', support: true },
  { id: 'legal', path: '/legal', support: true },
];

const mime = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

async function waitForExit(child, timeoutMs = 2_000) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const onExit = () => { clearTimeout(timer); resolve(true); };
    const timer = setTimeout(() => { child.off('exit', onExit); resolve(child.exitCode !== null || child.signalCode !== null); }, timeoutMs);
    child.once('exit', onExit);
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function serve(port) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
      let file = path.resolve(site, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
      assert(file === site || file.startsWith(`${site}${path.sep}`), 'path_traversal');
      let info; try { info = await stat(file); } catch { info = null; }
      if (info?.isDirectory() || (info === null && path.extname(file) === '')) file = path.join(file, 'index.html');
      const body = await readFile(file);
      response.writeHead(200, { 'cache-control': 'no-store', 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
  return server;
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* next */ }
  }
  throw new Error('chrome_executable_missing');
}

async function fetchJson(url, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch { /* retry */ }
    await sleep(100);
  }
  throw new Error(`endpoint_timeout:${url}`);
}

class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.id = 1; this.pending = new Map(); this.events = new Map(); }
  async open() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('cdp_open_timeout')), 10_000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('cdp_socket_error')); }, { once: true });
    });
    this.ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.id !== undefined) {
        const call = this.pending.get(message.id); if (!call) return;
        this.pending.delete(message.id);
        message.error ? call.reject(new Error(`${call.method}:${message.error.message}`)) : call.resolve(message.result ?? {});
      } else for (const callback of this.events.get(message.method) ?? []) callback(message.params ?? {});
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => { this.pending.set(id, { method, resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  on(method, callback) {
    const list = this.events.get(method) ?? [];
    list.push(callback); this.events.set(method, list);
    return () => this.events.set(method, (this.events.get(method) ?? []).filter((item) => item !== callback));
  }
  once(method, timeout = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error(`${method}_timeout`)); }, timeout);
      const off = this.on(method, (event) => { clearTimeout(timer); off(); resolve(event); });
    });
  }
  close() { this.ws.close(); }
}

async function launchChrome(port, profile) {
  const executable = await findChrome();
  const child = spawn(executable, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
    '--disable-extensions', '--disable-sync', '--mute-audio', '--no-first-run', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  const end = Date.now() + 15_000; let page;
  while (!page && Date.now() < end) {
    try { page = (await fetchJson(`http://127.0.0.1:${port}/json/list`, 2_000)).find(({ type }) => type === 'page'); } catch { /* retry */ }
    if (!page) await sleep(100);
  }
  assert(page?.webSocketDebuggerUrl, 'chrome_page_target_missing');
  return { child, executable, ws: page.webSocketDebuggerUrl };
}

async function waitForExpression(cdp, expression, code, timeout = 8_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.result?.value === true) return;
    await sleep(60);
  }
  throw new Error(`${code}_timeout`);
}

async function setViewport(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height });
}

async function navigate(cdp, baseUrl, routePath) {
  const loaded = cdp.once('Page.loadEventFired');
  const navigation = await cdp.send('Page.navigate', { url: `${baseUrl}${routePath}` });
  assert(!navigation.errorText, `navigation_failed:${routePath}:${navigation.errorText}`);
  await loaded;
  await cdp.send('Runtime.evaluate', { expression: 'document.fonts ? document.fonts.ready.then(() => true) : true', awaitPromise: true, returnByValue: true });
  await waitForExpression(cdp, `document.querySelector('#main-content') instanceof HTMLElement`, `main_missing:${routePath}`);
  await sleep(80);
}

async function screenshot(cdp, file, fullPage = false) {
  let params = { format: 'png', fromSurface: true, captureBeyondViewport: false };
  if (fullPage) {
    const layout = await cdp.send('Page.getLayoutMetrics');
    const size = layout.cssContentSize ?? layout.contentSize;
    params = { format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } };
  }
  const image = await cdp.send('Page.captureScreenshot', params);
  await writeFile(file, Buffer.from(image.data, 'base64'));
}

async function diagnostics(cdp, route, viewport) {
  const result = await cdp.send('Runtime.evaluate', { expression: `(() => {
    const de = document.documentElement;
    const body = document.body;
    const visible = (element) => {
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > .01 && rect.width > 0 && rect.height > 0;
    };
    const box = (element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }; };
    const header = document.querySelector('.site-header');
    const brand = document.querySelector('.site-header__brand');
    const mark = document.querySelector('.site-header__brand .apex-mark');
    const wordmark = document.querySelector('.site-header__wordmark');
    const cta = document.querySelector('.site-header__cta');
    const menu = document.querySelector('.site-header__menu');
    const support = document.querySelector('.s6-subnav');
    const title = document.querySelector('h1');
    const controls = [...document.querySelectorAll('button, select, input:not([type="hidden"]), a.button, a.b12-button, a.s6-button')]
      .filter(visible).map((element) => ({ label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0,80) || element.tagName, ...box(element) }));
    const badControls = controls.filter(({ width, height }) => width < 44 || height < 44);
    const mainChildren = [...document.querySelectorAll('#main-content > *')].filter(visible).map((element) => ({ selector: '.' + [...element.classList].join('.'), ...box(element) }));
    return {
      title: document.title,
      h1: title?.textContent?.trim() ?? null,
      scrollWidth: Math.max(de.scrollWidth, body.scrollWidth), clientWidth: de.clientWidth,
      horizontalOverflow: Math.max(de.scrollWidth, body.scrollWidth) > de.clientWidth + 1,
      header: header && visible(header) ? { ...box(header), position: getComputedStyle(header).position } : null,
      brand: brand && visible(brand) ? box(brand) : null,
      mark: mark && visible(mark) ? box(mark) : null,
      wordmark: wordmark && visible(wordmark) ? { text: wordmark.textContent?.trim() ?? '', transform: getComputedStyle(wordmark).textTransform, family: getComputedStyle(wordmark).fontFamily, size: getComputedStyle(wordmark).fontSize, weight: getComputedStyle(wordmark).fontWeight, spacing: getComputedStyle(wordmark).letterSpacing } : null,
      cta: cta ? { visible: visible(cta), ...box(cta) } : null,
      menu: menu ? { visible: visible(menu), ...box(menu) } : null,
      support: support && visible(support) ? { ...box(support), position: getComputedStyle(support).position } : null,
      badControls,
      mainChildren,
      rootClass: document.querySelector('#main-content > *')?.className ?? null,
    };
  })()`, returnByValue: true });
  const value = result.result.value;
  const issues = [];
  if (value.horizontalOverflow) issues.push(`horizontal_overflow:${value.scrollWidth}/${value.clientWidth}`);
  if (!value.header || !value.brand || !value.mark || !value.wordmark) issues.push('global_header_identity_missing');
  if (value.mark && (value.mark.width < 15 || value.mark.height < 15)) issues.push(`apex_below_minimum:${value.mark.width}x${value.mark.height}`);
  if (viewport.width <= 900 && !value.menu?.visible) issues.push('mobile_menu_trigger_missing');
  if (viewport.width <= 390 && !value.cta?.visible) issues.push('mobile_setup_cta_hidden');
  if (route.support && value.wordmark?.transform !== 'uppercase') issues.push(`support_wordmark_not_uppercase:${value.wordmark?.transform ?? 'missing'}`);
  if (value.badControls.length) issues.push(...value.badControls.map(({ label, width, height }) => `control_below_44:${label}:${Math.round(width)}x${Math.round(height)}`));
  return { ...value, issues };
}

async function inspectSupportSticky(cdp) {
  const result = await cdp.send('Runtime.evaluate', { expression: `(() => {
    const rail = document.querySelector('.s6-subnav');
    if (!(rail instanceof HTMLElement)) return null;
    scrollTo(0, Math.min(900, Math.max(0, document.documentElement.scrollHeight - innerHeight)));
    const rect = rail.getBoundingClientRect();
    const header = document.querySelector('.site-header');
    const headerRect = header?.getBoundingClientRect();
    const headerVisible = headerRect ? headerRect.bottom > 0 && headerRect.top < innerHeight : false;
    return { top: rect.top, bottom: rect.bottom, visible: rect.bottom > 0 && rect.top < innerHeight, headerVisible, headerBottom: headerRect?.bottom ?? null, overlap: headerVisible && headerRect.bottom > rect.top + 1 };
  })()`, returnByValue: true });
  await sleep(100);
  return result.result.value;
}

async function openMenu(cdp) {
  const opened = await cdp.send('Runtime.evaluate', { expression: `(() => { const b = document.querySelector('.site-header__menu'); if (!(b instanceof HTMLButtonElement) || getComputedStyle(b).display === 'none') return false; b.click(); return true; })()`, returnByValue: true });
  assert(opened.result?.value === true, 'menu_trigger_not_clickable');
  await waitForExpression(cdp, `document.querySelector('.mobile-nav')?.hidden === false && document.querySelector('.mobile-nav')?.classList.contains('is-open')`, 'menu_not_open');
}

async function closeMenuEscape(cdp) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await waitForExpression(cdp, `document.querySelector('.mobile-nav')?.hidden === true`, 'menu_escape_not_closed');
}

async function clickByText(cdp, selector, text) {
  const expression = `(() => { const wanted = ${JSON.stringify(text)}; const elements = [...document.querySelectorAll(${JSON.stringify(selector)})]; const element = elements.find((item) => item.textContent?.trim() === wanted); if (!(element instanceof HTMLElement)) return false; element.click(); return true; })()`;
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
  assert(result.result?.value === true, `click_target_missing:${text}`);
}

async function stateEvidence(cdp, baseUrl, evidenceIssues) {
  // Product verified, including reduced-motion collapse.
  await setViewport(cdp, 390, 844);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate(cdp, baseUrl, '/product');
  await clickByText(cdp, 'button', 'Run fixture');
  await waitForExpression(cdp, `document.querySelector('.b12-product')?.getAttribute('data-router-state') === 'verified'`, 'product_verified_not_reached', 2_000);
  await screenshot(cdp, path.join(dedicated, 'semantic-product-verified-390.png'));
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  // Operation proof state.
  await navigate(cdp, baseUrl, '/operations/search.web');
  await clickByText(cdp, 'button', 'Approve fixture boundary');
  await clickByText(cdp, 'button', 'Execute fixture');
  await waitForExpression(cdp, `document.querySelector('.b12-operation')?.getAttribute('data-execution-state') === 'verified'`, 'operation_verified_not_reached', 5_000);
  await screenshot(cdp, path.join(dedicated, 'operation-proof-390.png'));

  // Operation unresolved/recovery state.
  await clickByText(cdp, 'button', 'Unresolved');
  await clickByText(cdp, 'button', 'Execute fixture');
  await waitForExpression(cdp, `document.querySelector('.b12-operation')?.getAttribute('data-execution-state') === 'unresolved'`, 'operation_unresolved_not_reached', 5_000);
  await screenshot(cdp, path.join(dedicated, 'operation-unresolved-390.png'));

  // Pricing approval and refusal.
  await navigate(cdp, baseUrl, '/pricing');
  await clickByText(cdp, 'button', 'Preview approval boundary');
  await waitForExpression(cdp, `document.querySelector('.s6-quote-shell')?.getAttribute('data-quote-state') === 'approved'`, 'pricing_approved_not_reached');
  document;
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.s6-quote-shell')?.scrollIntoView({block:'center',behavior:'instant'})` });
  await screenshot(cdp, path.join(dedicated, 'semantic-pricing-approved-390.png'));
  await clickByText(cdp, 'button', 'Preview refusal');
  await waitForExpression(cdp, `document.querySelector('.s6-quote-shell')?.getAttribute('data-quote-state') === 'refused'`, 'pricing_refused_not_reached');
  await screenshot(cdp, path.join(dedicated, 'semantic-pricing-refused-390.png'));

  // Proof owner-funded record is the default selected class.
  await navigate(cdp, baseUrl, '/proof');
  const owner = await cdp.send('Runtime.evaluate', { expression: `(() => { const text = document.body.innerText; return /owner-funded/i.test(text) && /0\.006 USDC/i.test(text); })()`, returnByValue: true });
  if (owner.result?.value !== true) evidenceIssues.push('proof_owner_funded_record_not_visible');
  await screenshot(cdp, path.join(dedicated, 'proof-owner-funded-390.png'));

  // Current status / benchmark / legal structural surfaces.
  for (const [routePath, name] of [['/status','status-unbound-390.png'],['/benchmarks','benchmarks-empty-390.png'],['/legal','legal-structural-390.png']]) {
    await navigate(cdp, baseUrl, routePath);
    await screenshot(cdp, path.join(dedicated, name));
  }
}

function contactSheetSvg(viewportId, items) {
  const mobile = viewportId !== '1600';
  const columns = mobile ? 4 : 3;
  const tileWidth = mobile ? 210 : 520;
  const imageWidth = mobile ? 195 : 500;
  const imageHeight = mobile ? Math.round(imageWidth * 1.45) : Math.round(imageWidth * 0.5625);
  const tileHeight = imageHeight + 46;
  const rows = Math.ceil(items.length / columns);
  const width = columns * tileWidth + 20;
  const height = rows * tileHeight + 20;
  const body = items.map((item, index) => {
    const column = index % columns; const row = Math.floor(index / columns);
    const x = 10 + column * tileWidth; const y = 10 + row * tileHeight;
    return `<g transform="translate(${x} ${y})"><rect width="${imageWidth}" height="${imageHeight}" fill="#050505" stroke="#2a2a2a"/><image href="../captures/${esc(item.file)}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice"/><text x="0" y="${imageHeight + 24}" fill="#f5f5f5" font-family="monospace" font-size="13">${esc(item.label)}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#000"/>${body}</svg>`;
}

assert(typeof WebSocket === 'function', 'node_websocket_unavailable');
await rm(out, { recursive: true, force: true });
await mkdir(captures, { recursive: true });
await mkdir(contactSheets, { recursive: true });
await mkdir(dedicated, { recursive: true });

let build = { command: 'npm run build --workspace @clervo/site', skipped: useBuilt, exitCode: null };
if (!useBuilt) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', 'build', '--workspace', '@clervo/site'], { cwd: root, encoding: 'utf8' });
  build = { ...build, exitCode: result.status };
  await writeFile(path.join(out, 'build.log'), `${result.stdout ?? ''}${result.stderr ?? ''}`);
  assert(result.status === 0, `site_build_failed:${result.status}`);
}
await access(site, constants.R_OK);

const webPort = await freePort(); const debugPort = await freePort();
const profile = await mkdtemp(path.join(os.tmpdir(), 'clervo-b12-final-chrome-'));
const server = await serve(webPort); const baseUrl = `http://127.0.0.1:${webPort}`;
let browser; let cdp; const results = []; const globalIssues = []; const evidenceIssues = [];
try {
  browser = await launchChrome(debugPort, profile); cdp = new Cdp(browser.ws); await cdp.open();
  await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable'].map((method) => cdp.send(method)));
  let consoleErrors = []; let pageErrors = [];
  cdp.on('Runtime.consoleAPICalled', ({ type, args: values }) => { if (type === 'error') consoleErrors.push(values.map(({ value: v, description }) => v ?? description ?? '').join(' ')); });
  cdp.on('Log.entryAdded', ({ entry }) => { if (entry.level === 'error') consoleErrors.push(entry.text); });
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => pageErrors.push(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'runtime_exception'));

  for (const viewport of viewports) {
    await setViewport(cdp, viewport.width, viewport.height);
    for (const route of routes) {
      consoleErrors = []; pageErrors = [];
      await navigate(cdp, baseUrl, route.path);
      await cdp.send('Runtime.evaluate', { expression: 'scrollTo(0,0)' });
      const diag = await diagnostics(cdp, route, viewport);
      let sticky = null;
      if (route.support) {
        sticky = await inspectSupportSticky(cdp);
        if (sticky === null || !sticky.visible || sticky.top < -1 || sticky.overlap) diag.issues.push(`support_subnav_overlap:${JSON.stringify(sticky)}`);
        await cdp.send('Runtime.evaluate', { expression: 'scrollTo(0,0)' });
      }
      const file = `${viewport.id}--${route.id}.png`;
      await screenshot(cdp, path.join(captures, file));
      const uniqueConsole = [...new Set(consoleErrors)]; const uniquePage = [...new Set(pageErrors)];
      const issues = [...diag.issues, ...uniqueConsole.map((error) => `console:${error}`), ...uniquePage.map((error) => `page:${error}`)];
      results.push({ viewport: viewport.id, width: viewport.width, height: viewport.height, route: route.path, routeId: route.id, file, diagnostics: diag, sticky, consoleErrors: uniqueConsole, pageErrors: uniquePage, issues });
    }
  }

  // Dedicated long-content evidence.
  await setViewport(cdp, 390, 844);
  for (const [routePath, name] of [['/operations/search.web','long-operation-390-full.png'],['/legal','long-legal-390-full.png']]) {
    await navigate(cdp, baseUrl, routePath);
    await screenshot(cdp, path.join(dedicated, name), true);
  }

  // Mobile menu visible/open and Escape behavior.
  await navigate(cdp, baseUrl, '/pricing');
  await openMenu(cdp);
  await screenshot(cdp, path.join(dedicated, 'mobile-menu-open-390.png'));
  await closeMenuEscape(cdp);

  // Backdrop close is observable at tablet width where the drawer does not fill the viewport.
  await setViewport(cdp, 760, 800);
  await navigate(cdp, baseUrl, '/pricing');
  await openMenu(cdp);
  await screenshot(cdp, path.join(dedicated, 'mobile-menu-backdrop-before-760.png'));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 20, y: 400, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 20, y: 400, button: 'left', clickCount: 1 });
  try { await waitForExpression(cdp, `document.querySelector('.mobile-nav')?.hidden === true`, 'menu_backdrop_not_closed', 2_000); }
  catch { globalIssues.push('mobile_menu_backdrop_close_failed'); }
  await screenshot(cdp, path.join(dedicated, 'mobile-menu-backdrop-after-760.png'));

  await stateEvidence(cdp, baseUrl, evidenceIssues);
} finally {
  try { cdp?.close(); } catch { /* cleanup */ }
  const child = browser?.child;
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    if (!(await waitForExit(child))) { child.kill('SIGKILL'); await waitForExit(child); }
  }
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

for (const viewportId of ['1600','390','320']) {
  const items = results.filter(({ viewport }) => viewport === viewportId).map(({ routeId, file }) => ({ label: routeId, file }));
  await writeFile(path.join(contactSheets, `whole-site-${viewportId}.svg`), contactSheetSvg(viewportId, items));
}

const issueRows = results.flatMap((result) => result.issues.map((issue) => `${result.viewport}:${result.route}:${issue}`));
const issues = [...issueRows, ...globalIssues, ...evidenceIssues];
const report = { build, routeCount: routes.length, viewportCount: viewports.length, captureCount: results.length, viewports, routes, results, globalIssues, evidenceIssues, issues };
await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

const summary = [
  '# B12 Final Whole-Site Visual QA', '',
  `- routes: ${routes.length}`,
  `- viewport captures: ${results.length}`,
  `- viewports: ${viewports.map(({ width, height }) => `${width}×${height}`).join(', ')}`,
  `- issues: ${issues.length}`,
  '', '## Result', '', issues.length === 0 ? 'PASS' : 'FAIL', '',
  ...(issues.length ? ['## Issues', '', ...issues.map((issue) => `- ${issue}`)] : []),
].join('\n');
await writeFile(path.join(out, 'summary.md'), `${summary}\n`);

const ledger = [
  '# Final hardening finding ledger', '',
  '## MUST FIX corrected',
  '- Slice 6 trust/support routes inherited the pre-B12 shared shell, producing title-case wordmark styling, hiding the primary setup CTA at phone width, and creating a sticky-header/subnav collision risk. Correction: route-scoped B12 shell reconciliation only.',
  '- Global mobile navigation did not close from its backdrop. Correction: backdrop click closes the panel and returns focus to the trigger.',
  '', '## LEAVE ALONE',
  '- Hollow Apex geometry and generated identity source.',
  '- Approved Hero, Homepage, Start, Product/Catalog, Operation and trust/support page compositions.',
  '- Product registry, pricing, payment/x402, supplier logic, runtime, APIs, commercial policy and discovery authority.',
  '', '## QA', `- ${issues.length === 0 ? 'No automated visual/interaction regression flags.' : `${issues.length} automated flags require owner review.`}`,
].join('\n');
await writeFile(path.join(out, 'finding-ledger.md'), `${ledger}\n`);

if (issues.length) {
  console.error(summary);
  process.exitCode = 1;
} else console.log(summary);
