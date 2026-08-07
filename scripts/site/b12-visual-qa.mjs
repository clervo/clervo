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
const defaultSite = path.join(root, 'apps/site/dist');
const site = path.resolve(value('--site-root') ?? defaultSite);
const out = path.resolve(value('--out') ?? path.join(root, 'apps/site/qa-artifacts'));
const vaultArg = value('--reference-root') ?? process.env.CLERVO_B12_VAULT_ROOT ?? null;
const vault = vaultArg === null ? null : path.resolve(vaultArg);
const useBuilt = has('--use-built') || site !== defaultSite;
const shots = path.join(out, 'captures');
const comparisonsDir = path.join(out, 'comparisons');

const homeMatrix = [
  { id: 'desktop-1600-rest', surface: 'home', path: '/?state=rest', width: 1600, height: 900, state: 'rest' },
  { id: 'desktop-1600-prove', surface: 'home', path: '/?state=prove', width: 1600, height: 900, state: 'prove' },
  { id: 'tablet-1024-rest', surface: 'home', path: '/?state=rest', width: 1024, height: 768, state: 'rest' },
  { id: 'mobile-390-rest', surface: 'home', path: '/?state=rest', width: 390, height: 844, state: 'rest' },
  { id: 'mobile-390-prove', surface: 'home', path: '/?state=prove', width: 390, height: 844, state: 'prove' },
  { id: 'mobile-320-rest', surface: 'home', path: '/?state=rest', width: 320, height: 700, state: 'rest' },
  { id: 'mobile-320-prove', surface: 'home', path: '/?state=prove', width: 320, height: 700, state: 'prove' },
];
const startMatrix = [
  { id: 'start-desktop-1600-entry', surface: 'start', path: '/start', width: 1600, height: 900, startState: 'entry' },
  { id: 'start-desktop-1600-verified', surface: 'start', path: '/start', width: 1600, height: 900, startState: 'verified' },
  { id: 'start-tablet-1024-entry', surface: 'start', path: '/start', width: 1024, height: 768, startState: 'entry' },
  { id: 'start-tablet-1024-verified', surface: 'start', path: '/start', width: 1024, height: 768, startState: 'verified' },
  { id: 'start-mobile-390-entry', surface: 'start', path: '/start', width: 390, height: 844, startState: 'entry' },
  { id: 'start-mobile-390-verified', surface: 'start', path: '/start', width: 390, height: 844, startState: 'verified' },
  { id: 'start-mobile-320-entry', surface: 'start', path: '/start', width: 320, height: 700, startState: 'entry' },
  { id: 'start-mobile-320-verified', surface: 'start', path: '/start', width: 320, height: 700, startState: 'verified' },
];
const matrix = [...homeMatrix, ...startMatrix];
const slice2ProofOrder = ['request', 'qualify', 'execute', 'verify', 'prove'];
const referenceMap = {
  'desktop-1600-rest': '06-hero/locked/prototype-v1.0/preview-desktop-rest.png',
  'desktop-1600-prove': '06-hero/locked/prototype-v1.0/preview-desktop-prove.png',
  'mobile-390-rest': '07-full-site-design/locked/visual-creative-mobile-hardening-v1.0/final-home-390.png',
  'mobile-320-rest': '07-full-site-design/locked/visual-creative-mobile-hardening-v1.0/final-home-320.png',
  'start-mobile-390-entry': '07-full-site-design/locked/visual-creative-mobile-hardening-v1.0/final-start-390.png',
  'start-mobile-320-entry': '07-full-site-design/locked/visual-creative-mobile-hardening-v1.0/final-start-320.png',
};
const mime = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.woff2': 'font/woff2',
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, code) => { if (!condition) throw new Error(code); };

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
  const candidates = [process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
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
  on(method, callback) { const list = this.events.get(method) ?? []; list.push(callback); this.events.set(method, list); return () => this.events.set(method, (this.events.get(method) ?? []).filter((item) => item !== callback)); }
  once(method, timeout = 15_000) { return new Promise((resolve, reject) => { const timer = setTimeout(() => { off(); reject(new Error(`${method}_timeout`)); }, timeout); const off = this.on(method, (value) => { clearTimeout(timer); off(); resolve(value); }); }); }
  close() { this.ws.close(); }
}

async function launchChrome(port, profile) {
  const executable = await findChrome();
  const child = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--mute-audio', '--no-first-run', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
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
    await sleep(50);
  }
  throw new Error(`${code}_timeout`);
}

async function waitForHomeState(cdp, state) {
  const expected = JSON.stringify(state);
  await waitForExpression(cdp, `(() => document.querySelector('.b12-home')?.dataset.state === ${expected} || document.body.dataset.state === ${expected})()`, `state_not_reached:${state}`, 5_000);
}

async function waitForSlice2ProofState(cdp, state, timeout = 5_000) {
  const expected = JSON.stringify(state);
  await waitForExpression(cdp, `document.querySelector('.s7a-proof-frame')?.dataset.proofState === ${expected}`, `slice2_proof_state_not_reached:${state}`, timeout);
}

async function waitForStartStage(cdp, index) {
  await waitForExpression(cdp, `document.querySelector('.stage-panel')?.dataset.stageIndex === ${JSON.stringify(String(index))}`, `start_stage_not_reached:${index}`, 5_000);
}

async function imageSize(file) {
  const bytes = await readFile(file);
  assert(bytes.subarray(1, 4).toString() === 'PNG', `reference_not_png:${file}`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function dataUri(file) {
  return `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
}

async function compare(capture) {
  if (vault === null || referenceMap[capture.id] === undefined) return null;
  const referencePath = path.join(vault, referenceMap[capture.id]);
  try { await access(referencePath, constants.R_OK); } catch { return { id: capture.id, status: 'reference_missing', reference: referenceMap[capture.id] }; }
  const currentPath = path.join(root, capture.screenshot);
  const currentSize = await imageSize(currentPath), referenceSize = await imageSize(referencePath);
  if (currentSize.width !== referenceSize.width || currentSize.height !== referenceSize.height) {
    return { id: capture.id, status: 'dimension_mismatch', reference: referenceMap[capture.id], currentSize, referenceSize, ownerApprovalRequired: true };
  }
  const current = await dataUri(currentPath), reference = await dataUri(referencePath);
  const { width, height } = currentSize;
  const side = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 2}" height="${height}" viewBox="0 0 ${width * 2} ${height}"><image href="${reference}" width="${width}" height="${height}"/><image href="${current}" x="${width}" width="${width}" height="${height}"/></svg>`;
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${reference}" width="${width}" height="${height}"/><image href="${current}" width="${width}" height="${height}" opacity=".5"/></svg>`;
  const sidePath = path.join(comparisonsDir, `${capture.id}--side-by-side.svg`), overlayPath = path.join(comparisonsDir, `${capture.id}--overlay.svg`);
  await writeFile(sidePath, side); await writeFile(overlayPath, overlay);
  return { id: capture.id, status: 'generated', reference: referenceMap[capture.id], sideBySide: path.relative(root, sidePath), overlay: path.relative(root, overlayPath), ownerApprovalRequired: true };
}

async function inspectMobileMenu(cdp, width) {
  if (width > 900) return null;
  const opened = await cdp.send('Runtime.evaluate', { expression: `(() => { const button = document.querySelector('.site-header__menu'); if (!(button instanceof HTMLButtonElement) || getComputedStyle(button).display === 'none') return false; button.click(); return true; })()`, returnByValue: true });
  if (opened.result?.value !== true) return { present: false, contained: false, controlsContained: false, tooSmallTargets: ['menu_trigger_missing'] };
  await waitForExpression(cdp, `document.querySelector('.mobile-nav')?.classList.contains('is-open') === true && document.querySelector('.mobile-nav')?.hidden === false`, 'mobile_menu_open');
  const result = (await cdp.send('Runtime.evaluate', { expression: `(() => {
    const panel = document.querySelector('.mobile-nav__panel');
    if (!(panel instanceof HTMLElement)) return null;
    const clientWidth = document.documentElement.clientWidth;
    const clientHeight = document.documentElement.clientHeight;
    const rect = panel.getBoundingClientRect();
    const controls = [...panel.querySelectorAll('a[href],button')].filter((element) => {
      const style = getComputedStyle(element); const box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    }).map((element) => { const box = element.getBoundingClientRect(); return { label: element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName, left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }; });
    return {
      present: true,
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      contained: rect.left >= -1 && rect.right <= clientWidth + 1 && rect.top >= -1 && rect.bottom <= clientHeight + 1,
      controlsContained: controls.every((item) => item.left >= -1 && item.right <= clientWidth + 1),
      tooSmallTargets: controls.filter((item) => item.width < 44 || item.height < 44).map((item) => item.label),
    };
  })()`, returnByValue: true })).result.value;
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.mobile-nav__close')?.click()` });
  await waitForExpression(cdp, `document.querySelector('.mobile-nav')?.hidden === true`, 'mobile_menu_close');
  return result;
}

async function inspectPage(cdp, capture) {
  const surface = JSON.stringify(capture.surface);
  return (await cdp.send('Runtime.evaluate', { expression: `(() => {
    const surface = ${surface};
    const documentElement = document.documentElement;
    const body = document.body;
    const clientWidth = documentElement.clientWidth;
    const clientHeight = documentElement.clientHeight;
    const homeSections = [...document.querySelectorAll('#step-7a > .s7a-section, #step-7a > .s7a-footer')];
    const startSections = [...document.querySelectorAll('.b12-start > .b12-start-section, .b12-start > #entry')];
    const sectionNodes = surface === 'start' ? startSections : homeSections;
    const sections = sectionNodes.map((element, index) => {
      const rect = element.getBoundingClientRect();
      return { id: element.id || (element.classList.contains('s7a-footer') ? 's7a-footer' : surface + '-section-' + (index + 1)), left: rect.left, right: rect.right, width: rect.width, height: rect.height, clippedHorizontally: rect.left < -1 || rect.right > clientWidth + 1, empty: rect.width < 1 || rect.height < 1 };
    });
    const positionedElements = [...document.querySelectorAll('body *')].flatMap((element) => {
      const style = getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'sticky') return [];
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || rect.bottom <= 0 || rect.top >= clientHeight || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= .01) return [];
      return [{ selector: element.id ? '#' + element.id : '.' + [...element.classList].join('.'), position: style.position, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }];
    });
    const obscuredSections = sections.flatMap((section, index) => {
      const rect = sectionNodes[index].getBoundingClientRect();
      const overlaps = positionedElements.filter((item) => item.selector !== '.site-header' && item.left < rect.right && item.right > rect.left && item.top < rect.bottom && item.bottom > rect.top);
      return overlaps.length ? [{ id: section.id, by: overlaps.map(({ selector }) => selector) }] : [];
    });
    const rail = document.querySelector('.b12-rail');
    const railRect = rail?.getBoundingClientRect();
    const railStyle = rail ? getComputedStyle(rail) : null;
    const mechanismPanel = document.querySelector('.s7a-mechanism-panel');
    const mechanismRect = mechanismPanel?.getBoundingClientRect();
    const slice2ProofFrame = document.querySelector('.s7a-proof-frame');
    const startPanel = document.querySelector('.stage-panel');
    const startTone = startPanel?.getAttribute('data-tone') ?? null;
    const startStageIndex = startPanel?.getAttribute('data-stage-index') ?? null;
    const importantStart = [...document.querySelectorAll('.b12-start .shell,.b12-start .command-wrap,.b12-start .entry-shell,.b12-start .environment-grid,.b12-start .workspace,.b12-start .stage-panel,.b12-start .state-inspector,.b12-start .final-command')]
      .filter((element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; })
      .map((element) => { const rect = element.getBoundingClientRect(); return { selector: element.id ? '#' + element.id : '.' + [...element.classList].join('.'), left: rect.left, right: rect.right, width: rect.width, contained: rect.left >= -1 && rect.right <= clientWidth + 1 }; });
    const controls = surface === 'start' ? [...document.querySelectorAll('.b12-start button,.b12-start a[href],.b12-start input,.site-header button,.site-header a[href]')] : [];
    const controlTargets = controls.filter((element) => {
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).map((element) => { const rect = element.getBoundingClientRect(); const intentionalRail = element.closest('.journey,.state-list') !== null; return { label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0,80) || element.tagName, left: rect.left, right: rect.right, width: rect.width, height: rect.height, contained: intentionalRail || (rect.left >= -1 && rect.right <= clientWidth + 1), tooSmall: rect.width < 44 || rect.height < 44 }; });
    const header = document.querySelector('.site-header');
    const headerRect = header?.getBoundingClientRect();
    const visibleStartContent = [...document.querySelectorAll('.b12-start h1,.b12-start .stage-bar,.b12-start .section-head')].filter((element) => { const rect = element.getBoundingClientRect(); return rect.bottom > 0 && rect.top < clientHeight; });
    const headerObscures = surface === 'start' && headerRect ? visibleStartContent.some((element) => { const rect = element.getBoundingClientRect(); return rect.top < headerRect.bottom - 1 && rect.bottom > headerRect.top + 1; }) : false;
    return {
      scrollWidth: documentElement.scrollWidth,
      clientWidth,
      bodyScrollWidth: body.scrollWidth,
      scrollHeight: Math.max(documentElement.scrollHeight, body.scrollHeight),
      sections,
      clippedSections: sections.filter(({ clippedHorizontally, empty }) => clippedHorizontally || empty).map(({ id }) => id),
      positionedElements,
      obscuredSections,
      slice2ProofState: slice2ProofFrame?.dataset.proofState ?? null,
      startStageIndex,
      startTone,
      startImportant: importantStart,
      startClippedImportant: importantStart.filter(({ contained }) => !contained).map(({ selector }) => selector),
      controlTargets,
      controlsOutsideViewport: controlTargets.filter(({ contained }) => !contained).map(({ label }) => label),
      controlsTooSmall: controlTargets.filter(({ tooSmall }) => tooSmall).map(({ label }) => label),
      headerObscures,
      mechanism: mechanismPanel && mechanismRect ? { left: mechanismRect.left, right: mechanismRect.right, width: mechanismRect.width, contained: mechanismRect.left >= -1 && mechanismRect.right <= clientWidth + 1 } : null,
      rail: rail && railRect && railStyle ? { left: railRect.left, right: railRect.right, clientWidth: rail.clientWidth, scrollWidth: rail.scrollWidth, overflowX: railStyle.overflowX, contained: railRect.left >= -1 && railRect.right <= clientWidth + 1, internalOverflow: rail.scrollWidth > rail.clientWidth + 1 } : null,
    };
  })()`, returnByValue: true })).result.value;
}

assert(typeof WebSocket === 'function', 'node_websocket_unavailable');
await mkdir(out, { recursive: true });
for (const target of [shots, comparisonsDir, path.join(out, 'report.json'), path.join(out, 'summary.md'), path.join(out, 'build.log')]) await rm(target, { recursive: true, force: true });
await mkdir(shots, { recursive: true }); await mkdir(comparisonsDir, { recursive: true });

let build = { command: 'npm run build --workspace @clervo/site', skipped: useBuilt, exitCode: null };
if (!useBuilt) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', 'build', '--workspace', '@clervo/site'], { cwd: root, encoding: 'utf8' });
  build = { ...build, exitCode: result.status };
  await writeFile(path.join(out, 'build.log'), `${result.stdout ?? ''}${result.stderr ?? ''}`);
  assert(result.status === 0, `site_build_failed:${result.status}`);
}
await access(site, constants.R_OK);

const webPort = await freePort(), debugPort = await freePort(), profile = await mkdtemp(path.join(os.tmpdir(), 'clervo-b12-chrome-'));
const server = await serve(webPort); let browser, cdp, cleanupError; const results = [];
try {
  browser = await launchChrome(debugPort, profile); cdp = new Cdp(browser.ws); await cdp.open();
  await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable'].map((method) => cdp.send(method)));
  let consoleErrors = [], pageErrors = [];
  cdp.on('Runtime.consoleAPICalled', ({ type, args: values }) => { if (type === 'error') consoleErrors.push(values.map(({ value: v, description }) => v ?? description ?? '').join(' ')); });
  cdp.on('Log.entryAdded', ({ entry }) => { if (entry.level === 'error') consoleErrors.push(entry.text); });
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => pageErrors.push(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'runtime_exception'));

  for (const capture of matrix) {
    const { id, width, height } = capture;
    consoleErrors = []; pageErrors = [];
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height });
    const loaded = cdp.once('Page.loadEventFired');
    const url = `http://127.0.0.1:${webPort}${capture.path}`;
    const navigation = await cdp.send('Page.navigate', { url }); assert(!navigation.errorText, `navigation_failed:${navigation.errorText}`); await loaded;
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts ? document.fonts.ready.then(() => true) : true', awaitPromise: true, returnByValue: true });
    const slice2ProofTrace = [];
    if (capture.surface === 'home') {
      await waitForHomeState(cdp, capture.state);
      if (capture.state === 'prove') {
        const trigger = await cdp.send('Runtime.evaluate', { expression: `(() => { const button = document.querySelector('.s7a-proof-actions .s7a-button-primary'); if (!(button instanceof HTMLButtonElement)) return false; button.click(); return true; })()`, returnByValue: true });
        assert(trigger.result?.value === true, 'slice2_proof_trigger_missing');
        for (const proofState of slice2ProofOrder) { await waitForSlice2ProofState(cdp, proofState); slice2ProofTrace.push(proofState); }
      }
      await cdp.send('Runtime.evaluate', { expression: 'scrollTo(0,0)' });
    } else {
      await waitForExpression(cdp, `document.querySelector('.b12-start') instanceof HTMLElement`, 'start_root_missing');
      await waitForStartStage(cdp, 0);
      if (capture.startState === 'verified') {
        const trigger = await cdp.send('Runtime.evaluate', { expression: `(() => { const button = document.querySelector('[data-start-stage-button="3"]'); if (!(button instanceof HTMLButtonElement)) return false; button.click(); return true; })()`, returnByValue: true });
        assert(trigger.result?.value === true, 'start_verified_trigger_missing');
        await waitForStartStage(cdp, 3);
        await waitForExpression(cdp, `document.querySelector('.stage-panel')?.getAttribute('data-tone') === 'gold'`, 'start_verified_gold_not_reached');
        await cdp.send('Runtime.evaluate', { expression: `(() => { document.querySelector('#workspace')?.scrollIntoView({block:'start',behavior:'instant'}); scrollBy(0,-72); return true; })()` });
      } else await cdp.send('Runtime.evaluate', { expression: 'scrollTo(0,0)' });
    }
    await sleep(120);
    const mobileMenu = capture.surface === 'start' ? await inspectMobileMenu(cdp, width) : null;
    const diagnostics = await inspectPage(cdp, capture);
    const screenshot = path.join(shots, `${id}.png`);
    const viewportImage = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    await writeFile(screenshot, Buffer.from(viewportImage.data, 'base64'));
    const layout = await cdp.send('Page.getLayoutMetrics');
    const contentSize = layout.cssContentSize ?? layout.contentSize;
    const fullPageScreenshot = path.join(shots, `${id}--full-page.png`);
    const fullPageImage = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width: contentSize.width, height: contentSize.height, scale: 1 } });
    await writeFile(fullPageScreenshot, Buffer.from(fullPageImage.data, 'base64'));
    results.push({
      id, surface: capture.surface, path: capture.path, state: capture.state ?? null, startState: capture.startState ?? null,
      width, height, deviceScaleFactor: 1,
      consoleErrors: [...new Set(consoleErrors)], pageErrors: [...new Set(pageErrors)], slice2ProofTrace, mobileMenu,
      ...diagnostics,
      fullPageHeight: contentSize.height,
      horizontalOverflow: Math.max(diagnostics.scrollWidth, diagnostics.bodyScrollWidth) > diagnostics.clientWidth,
      screenshot: path.relative(root, screenshot), fullPageScreenshot: path.relative(root, fullPageScreenshot),
    });
  }
} finally {
  const cleanupErrors = [];
  try { cdp?.close(); } catch (error) { cleanupErrors.push(error); }
  try {
    const child = browser?.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      if (!(await waitForExit(child))) { child.kill('SIGKILL'); if (!(await waitForExit(child))) cleanupErrors.push(new Error('chrome_exit_timeout')); }
    }
  } catch (error) { cleanupErrors.push(error); }
  try { await new Promise((resolve) => server.close(resolve)); } catch (error) { cleanupErrors.push(error); }
  try { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (error) { cleanupErrors.push(error); }
  if (cleanupErrors.length) cleanupError = new AggregateError(cleanupErrors, 'b12_visual_qa_cleanup_failed');
}

const comparisons = (await Promise.all(results.map(compare))).filter(Boolean);
const issues = results.flatMap((item) => [
  ...item.consoleErrors.map((error) => `${item.id}:console:${error}`),
  ...item.pageErrors.map((error) => `${item.id}:page:${error}`),
  ...(item.horizontalOverflow ? [`${item.id}:horizontal_overflow:${item.scrollWidth}/${item.clientWidth}`] : []),
  ...item.clippedSections.map((section) => `${item.id}:clipped_section:${section}`),
  ...item.obscuredSections.map(({ id: section, by }) => `${item.id}:obscured_section:${section}:${by.join(',')}`),
  ...(item.rail && !item.rail.contained ? [`${item.id}:rail_not_contained:${item.rail.left}/${item.rail.right}/${item.clientWidth}`] : []),
  ...((item.surface === 'home' && (item.width === 390 || item.width === 320) && (!item.mechanism || !item.mechanism.contained)) ? [`${item.id}:mechanism_not_contained:${item.mechanism?.left ?? 'missing'}/${item.mechanism?.right ?? 'missing'}/${item.clientWidth}`] : []),
  ...(item.surface === 'home' && item.state === 'prove' && item.slice2ProofState !== 'prove' ? [`${item.id}:slice2_proof_not_reached:${item.slice2ProofState ?? 'missing'}`] : []),
  ...(item.surface === 'home' && item.state === 'prove' && item.slice2ProofTrace.join('>') !== slice2ProofOrder.join('>') ? [`${item.id}:slice2_proof_trace_incomplete:${item.slice2ProofTrace.join('>')}`] : []),
  ...(item.surface === 'start' ? item.startClippedImportant.map((selector) => `${item.id}:start_content_not_contained:${selector}`) : []),
  ...(item.surface === 'start' ? item.controlsOutsideViewport.map((label) => `${item.id}:control_not_contained:${label}`) : []),
  ...(item.surface === 'start' ? item.controlsTooSmall.map((label) => `${item.id}:control_below_44px:${label}`) : []),
  ...(item.surface === 'start' && item.headerObscures ? [`${item.id}:sticky_header_obscures_content`] : []),
  ...(item.surface === 'start' && item.startState === 'verified' && (item.startStageIndex !== '3' || item.startTone !== 'gold') ? [`${item.id}:verified_state_not_reached:${item.startStageIndex ?? 'missing'}/${item.startTone ?? 'missing'}`] : []),
  ...(item.surface === 'start' && item.width <= 900 && (!item.mobileMenu?.present || !item.mobileMenu.contained || !item.mobileMenu.controlsContained) ? [`${item.id}:mobile_menu_not_contained`] : []),
  ...(item.surface === 'start' && item.width <= 900 ? (item.mobileMenu?.tooSmallTargets ?? []).map((label) => `${item.id}:mobile_menu_target_below_44px:${label}`) : []),
]);
const report = {
  schemaVersion: 'clervo.b12.visual-qa.v3', generatedAt: new Date().toISOString(), target: site, chrome: browser?.executable ?? null, build,
  captures: results, technicalIssues: issues, comparisons,
  referenceCoverage: 'Exact locked comparisons are generated for the approved homepage viewport references and /start final 390x844 + 320x700 entry references. No exact v1.3 1600x900, 1024x768, or verified-state /start reference is supplied.',
  comparisonPolicy: 'Comparison artifacts are evidence only. Pixel differences never auto-approve a design; owner visual judgment is final.',
};
await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(out, 'summary.md'), [
  '# Clervo B12 visual QA', '',
  `- Build: ${build.skipped ? 'existing build used' : build.exitCode === 0 ? 'PASS' : 'FAIL'}`,
  `- Homepage captures: ${results.filter(({ surface }) => surface === 'home').length} viewport + full-page`,
  `- /start captures: ${results.filter(({ surface }) => surface === 'start').length} viewport + full-page`,
  `- Technical issues: ${issues.length}`,
  `- Comparison artifacts: ${comparisons.filter(({ status }) => status === 'generated').length}`,
  '- Visual comparison never auto-approves; owner judgment is final.', '',
  ...results.map((item) => item.surface === 'start'
    ? `- ${item.id}: ${item.width}x${item.height}@1 start=${item.startState}; stage=${item.startStageIndex ?? 'missing'}/${item.startTone ?? 'missing'}; pageHeight=${item.fullPageHeight}; scrollWidth/clientWidth=${item.scrollWidth}/${item.clientWidth}; console=${item.consoleErrors.length}; page=${item.pageErrors.length}; clipped=${item.clippedSections.length + item.startClippedImportant.length}; obscured=${item.obscuredSections.length}; controlsOutside=${item.controlsOutsideViewport.length}; controlsSmall=${item.controlsTooSmall.length}; menu=${item.mobileMenu ? `${item.mobileMenu.contained && item.mobileMenu.controlsContained ? 'contained' : 'NOT-CONTAINED'}` : 'n/a'}; viewport=${item.screenshot}; full=${item.fullPageScreenshot}`
    : `- ${item.id}: ${item.width}x${item.height}@1 state=${item.state}; slice2=${item.slice2ProofState ?? 'missing'}${item.slice2ProofTrace.length ? `/trace=${item.slice2ProofTrace.join('>')}` : ''}; pageHeight=${item.fullPageHeight}; scrollWidth/clientWidth=${item.scrollWidth}/${item.clientWidth}; console=${item.consoleErrors.length}; page=${item.pageErrors.length}; clipped=${item.clippedSections.length}; obscured=${item.obscuredSections.length}; mechanism=${item.mechanism ? (item.mechanism.contained ? 'contained' : 'NOT-CONTAINED') : 'missing'}; rail=${item.rail ? `${item.rail.contained ? 'contained' : 'NOT-CONTAINED'}${item.rail.internalOverflow ? '/internal-scroll' : ''}` : 'missing'}; viewport=${item.screenshot}; full=${item.fullPageScreenshot}`),
  '',
].join('\n'));
console.log(`B12 visual QA: ${issues.length ? 'ISSUES' : 'PASS'} (${results.length} viewport + ${results.length} full-page captures)`);
console.log(path.join(out, 'summary.md'));
if (cleanupError) throw cleanupError;
if (issues.length) process.exitCode = 1;
