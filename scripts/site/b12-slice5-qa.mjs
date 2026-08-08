#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const site = path.join(root, 'apps/site/dist');
const out = path.join(root, 'apps/site/qa-artifacts/slice5');
const captures = path.join(out, 'captures');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, code) => { if (!condition) throw new Error(code); };

const cases = [
  { id: 'operation-search-web-1600-entry', path: '/operations/search.web/', width: 1600, height: 900, state: 'entry' },
  { id: 'operation-search-web-1600-proof', path: '/operations/search.web/', width: 1600, height: 900, state: 'proof' },
  { id: 'operation-search-web-1600-unresolved', path: '/operations/search.web/', width: 1600, height: 900, state: 'unresolved' },
  { id: 'operation-search-web-1024-entry', path: '/operations/search.web/', width: 1024, height: 768, state: 'entry' },
  { id: 'operation-search-web-390-entry', path: '/operations/search.web/', width: 390, height: 844, state: 'entry' },
  { id: 'operation-search-web-320-entry', path: '/operations/search.web/', width: 320, height: 700, state: 'entry' },
  { id: 'operation-search-web-390-verified', path: '/operations/search.web/', width: 390, height: 844, state: 'verified' },
  { id: 'operation-search-web-320-unresolved', path: '/operations/search.web/', width: 320, height: 700, state: 'unresolved' },
  { id: 'operation-search-web-390-errors', path: '/operations/search.web/', width: 390, height: 844, state: 'errors' },
  { id: 'operation-search-web-390-replay', path: '/operations/search.web/', width: 390, height: 844, state: 'replay' },
  { id: 'operation-ai-chat-390-price', path: '/operations/ai.chat/', width: 390, height: 844, state: 'price' },
  { id: 'operation-rpc-broadcast-320-entry', path: '/operations/rpc.broadcast/', width: 320, height: 700, state: 'entry' },
];

const mime = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

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
      response.end(body);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
  return server;
}

async function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* next */ }
  }
  throw new Error('chrome_executable_missing');
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
        const pending = this.pending.get(message.id); if (!pending) return;
        this.pending.delete(message.id);
        message.error ? pending.reject(new Error(`${pending.method}:${message.error.message}`)) : pending.resolve(message.result ?? {});
      } else for (const callback of this.events.get(message.method) ?? []) callback(message.params ?? {});
    });
  }
  send(method, params = {}) { const id = this.id++; return new Promise((resolve, reject) => { this.pending.set(id, { method, resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  on(method, callback) { const callbacks = this.events.get(method) ?? []; callbacks.push(callback); this.events.set(method, callbacks); }
  close() { this.ws.close(); }
}

async function json(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch { /* retry */ }
    await sleep(100);
  }
  throw new Error(`endpoint_timeout:${url}`);
}

async function launchChrome(port, profile) {
  const executable = await findChrome();
  const child = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--mute-audio', '--no-first-run', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let page;
  for (let attempt = 0; attempt < 100 && page === undefined; attempt += 1) {
    try { page = (await json(`http://127.0.0.1:${port}/json/list`)).find(({ type }) => type === 'page'); } catch { /* retry */ }
    if (page === undefined) await sleep(100);
  }
  assert(page?.webSocketDebuggerUrl, 'chrome_page_target_missing');
  return { child, ws: page.webSocketDebuggerUrl };
}

async function waitFor(cdp, expression, code, timeout = 8_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.result?.value === true) return;
    await sleep(50);
  }
  throw new Error(`${code}_timeout`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails !== undefined) throw new Error(`evaluate_exception:${result.exceptionDetails.text}`);
  return result.result?.value;
}

async function clickText(cdp, text) {
  const expected = JSON.stringify(text);
  const clicked = await evaluate(cdp, `(() => { const el=[...document.querySelectorAll('button')].find((node)=>node.textContent?.trim()===${expected}); if (!(el instanceof HTMLButtonElement)) return false; el.click(); return true; })()`);
  assert(clicked === true, `button_missing:${text}`);
}

async function scrollTo(cdp, selector) {
  const value = JSON.stringify(selector);
  const found = await evaluate(cdp, `(() => { const el=document.querySelector(${value}); if (!(el instanceof HTMLElement)) return false; el.scrollIntoView({block:'center',behavior:'instant'}); return true; })()`);
  assert(found === true, `scroll_target_missing:${selector}`);
  await sleep(120);
}

async function setVerified(cdp) {
  await scrollTo(cdp, '#s5-price');
  await clickText(cdp, 'Approve fixture boundary');
  await scrollTo(cdp, '#s5-execution');
  await clickText(cdp, 'Verified');
  await clickText(cdp, 'Execute fixture');
  await waitFor(cdp, `document.querySelector('.b12-operation')?.dataset.executionState === 'verified'`, 'verified_state');
}

async function setUnresolved(cdp) {
  await scrollTo(cdp, '#s5-execution');
  await clickText(cdp, 'Unresolved');
  await clickText(cdp, 'Execute fixture');
  await waitFor(cdp, `document.querySelector('.b12-operation')?.dataset.executionState === 'unresolved'`, 'unresolved_state');
}

async function inspect(cdp, width) {
  return evaluate(cdp, `(() => {
    const root=document.querySelector('.b12-operation');
    const vw=document.documentElement.clientWidth;
    const visible=(el)=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
    const targets=[...document.querySelectorAll('.b12-operation a,.b12-operation button,.site-header a,.site-header button')].filter(visible).map((el)=>{const r=el.getBoundingClientRect();return {label:(el.textContent||el.getAttribute('aria-label')||el.tagName).trim().slice(0,80),width:r.width,height:r.height};});
    const tooSmall=targets.filter(({width,height})=>width<43.5||height<43.5);
    const panels=[...document.querySelectorAll('.s5-hero-summary,.s5-contract-strip-inner,.s5-contract-section,.s5-schema-shell,.s5-quote-layout,.s5-execution-shell,.s5-error-table,.s5-replay-shell')].map((el)=>{const r=el.getBoundingClientRect();return {name:el.id||el.className,left:r.left,right:r.right,width:r.width};});
    const clipped=panels.filter(({left,right})=>left < -1 || right > vw + 1);
    const operationId=document.querySelector('.s5-operation-id');
    const codeBlocks=[...document.querySelectorAll('.s5-code-block')].map((el)=>({clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,overflowX:getComputedStyle(el).overflowX}));
    operationId?.focus?.();
    const focusTarget=document.querySelector('.s5-contract-choice'); focusTarget?.focus();
    const focusStyle=focusTarget ? getComputedStyle(focusTarget).outlineStyle : 'none';
    return {
      width:${width},
      horizontalOverflow:document.documentElement.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1,
      rootContained:root ? root.getBoundingClientRect().left >= -1 && root.getBoundingClientRect().right <= vw + 1 : false,
      clipped,
      tooSmall,
      focusOutline:focusStyle,
      codeBlocks,
      fixtureLabel:/design.fixture/i.test(root?.textContent||'') || /design-state fixture/i.test(root?.textContent||''),
      state:root?.dataset.executionState||null,
    };
  })()`);
}

async function inspectMenu(cdp, width) {
  if (width > 900) return null;
  const opened = await evaluate(cdp, `(() => { const b=document.querySelector('.site-header__menu'); if (!(b instanceof HTMLButtonElement) || getComputedStyle(b).display==='none') return false; b.click(); return true; })()`);
  assert(opened === true, 'mobile_menu_trigger_missing');
  await waitFor(cdp, `document.querySelector('.mobile-nav')?.classList.contains('is-open') === true`, 'mobile_menu_open');
  const audit = await evaluate(cdp, `(() => { const p=document.querySelector('.mobile-nav__panel'); if (!(p instanceof HTMLElement)) return null; const r=p.getBoundingClientRect(),vw=document.documentElement.clientWidth,vh=document.documentElement.clientHeight; const controls=[...p.querySelectorAll('a,button')].filter((el)=>{const x=el.getBoundingClientRect(),s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&x.width>0&&x.height>0}).map((el)=>{const x=el.getBoundingClientRect();return {width:x.width,height:x.height,label:(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,60)};}); return {contained:r.left>=-1&&r.right<=vw+1&&r.top>=-1&&r.bottom<=vh+1,tooSmall:controls.filter((x)=>x.width<43.5||x.height<43.5)}; })()`);
  await evaluate(cdp, `document.querySelector('.mobile-nav__close')?.click()`);
  return audit;
}

async function semanticColors(cdp) {
  return evaluate(cdp, `(() => { const color=(selector,property='backgroundColor')=>{const el=document.querySelector(selector);return el?getComputedStyle(el)[property]:null}; return {request:color('.s5-pipeline-step.request i'),qualify:color('.s5-pipeline-step.qualify i'),prove:color('.s5-pipeline-step.prove i'),result:color('.s5-execution-result','color')}; })()`);
}

async function screenshot(cdp, file) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(file, Buffer.from(shot.data, 'base64'));
}

await rm(out, { recursive: true, force: true });
await mkdir(captures, { recursive: true });
const webPort = await freePort();
const debugPort = await freePort();
const server = await serve(webPort);
const profile = await mkdtemp(path.join(os.tmpdir(), 'clervo-s5-chrome-'));
const chrome = await launchChrome(debugPort, profile);
const cdp = new Cdp(chrome.ws);
await cdp.open();
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');

let currentErrors = [];
cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => currentErrors.push(`page:${exceptionDetails?.text ?? 'exception'}`));
cdp.on('Log.entryAdded', ({ entry }) => { if (entry?.level === 'error') currentErrors.push(`console:${entry.text}`); });
const report = { head: process.env.GITHUB_SHA ?? null, cases: [], semantic: {}, routeAudit: [], issues: [] };

try {
  for (const item of cases) {
    currentErrors = [];
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: item.width, height: item.height, deviceScaleFactor: 1, mobile: item.width <= 480 });
    await cdp.send('Emulation.setEmulatedMedia', { media: '', features: item.id.includes('replay') ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [] });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${webPort}${item.path}` });
    await waitFor(cdp, `document.querySelector('.b12-operation')?.dataset.operationId === ${JSON.stringify(item.path.split('/')[2])}`, `route:${item.id}`);
    await sleep(120);

    if (item.state === 'proof') await scrollTo(cdp, '#s5-proof');
    if (item.state === 'price') await scrollTo(cdp, '#s5-price');
    if (item.state === 'errors') await scrollTo(cdp, '#s5-errors');
    if (item.state === 'verified') { await setVerified(cdp); await scrollTo(cdp, '#s5-execution'); }
    if (item.state === 'unresolved') { await setUnresolved(cdp); await scrollTo(cdp, '#s5-execution'); }
    if (item.state === 'replay') { await setVerified(cdp); await scrollTo(cdp, '#s5-replay'); await clickText(cdp, 'Replay same fixture identity'); await sleep(50); }

    const audit = await inspect(cdp, item.width);
    const menu = item.state === 'entry' ? await inspectMenu(cdp, item.width) : null;
    const colors = item.state === 'verified' ? await semanticColors(cdp) : null;
    if (audit.horizontalOverflow) report.issues.push(`${item.id}:horizontal_overflow`);
    if (!audit.rootContained) report.issues.push(`${item.id}:root_not_contained`);
    if (audit.clipped.length > 0) report.issues.push(`${item.id}:clipped:${audit.clipped.map((x)=>x.name).join(',')}`);
    if (audit.tooSmall.length > 0) report.issues.push(`${item.id}:targets:${audit.tooSmall.map((x)=>x.label).join(',')}`);
    if (audit.focusOutline === 'none') report.issues.push(`${item.id}:focus_outline_missing`);
    if (!audit.fixtureLabel) report.issues.push(`${item.id}:fixture_label_missing`);
    if (menu !== null && (!menu.contained || menu.tooSmall.length > 0)) report.issues.push(`${item.id}:mobile_menu`);
    if (currentErrors.length > 0) report.issues.push(`${item.id}:errors:${currentErrors.join('|')}`);
    if (colors !== null) {
      report.semantic = colors;
      if (colors.request !== 'rgb(255, 59, 48)') report.issues.push(`${item.id}:request_red`);
      if (colors.qualify !== 'rgb(0, 229, 255)') report.issues.push(`${item.id}:qualify_cyan`);
      if (colors.prove !== 'rgb(255, 200, 0)') report.issues.push(`${item.id}:prove_gold`);
    }
    const file = path.join(captures, `${item.id}.png`);
    await screenshot(cdp, file);
    report.cases.push({ ...item, screenshot: path.relative(root, file), audit, mobileMenu: menu, errors: [...currentErrors], colors });
  }

  // Every canonical operation prerender must hydrate as an actual operation route.
  const catalog = JSON.parse(await readFile(path.join(root, 'generated/public/catalog.json'), 'utf8'));
  const ids = new Set();
  for (const family of catalog.observedTruth?.products ?? []) for (const id of family.operations ?? []) ids.add(id);
  for (const product of catalog.products ?? []) ids.add(product.operationId);
  for (const id of [...ids].sort()) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${webPort}/operations/${id}/` });
    await waitFor(cdp, `document.querySelector('.b12-operation')?.dataset.operationId === ${JSON.stringify(id)}`, `canonical_operation:${id}`);
    report.routeAudit.push(id);
  }

  // Reduced-motion interaction: state completion must not depend on long animation timing.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${webPort}/operations/search.web/` });
  await waitFor(cdp, `document.querySelector('.b12-operation')?.dataset.operationId === 'search.web'`, 'reduced_route');
  await setVerified(cdp);
  const reduced = await evaluate(cdp, `(() => { const el=document.querySelector('.b12-operation .b12-liquid'); return {state:document.querySelector('.b12-operation')?.dataset.executionState,transition:el?getComputedStyle(el).transitionDuration:null}; })()`);
  report.reducedMotion = reduced;
  if (reduced.state !== 'verified') report.issues.push('reduced_motion:verified_not_reached');

  await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(out, 'summary.md'), `# B12 Slice 5 integrated QA\n\n- Head: ${report.head}\n- Captures: ${report.cases.length}\n- Canonical operation routes audited: ${report.routeAudit.length}\n- Technical issues: ${report.issues.length}\n\n${report.issues.map((issue)=>`- ${issue}`).join('\n') || 'PASS'}\n`);
  assert(report.issues.length === 0, `slice5_qa_failed:${report.issues.join(',')}`);
  console.log(`B12 Slice 5 QA: PASS (${report.cases.length} viewport captures + ${report.routeAudit.length} canonical operation routes)`);
} finally {
  cdp.close();
  server.close();
  chrome.child.kill('SIGTERM');
  await rm(profile, { recursive: true, force: true });
}
