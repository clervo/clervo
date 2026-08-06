#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.join(root, 'apps/site/dist');
const out = path.join(root, 'apps/site/qa-artifacts');
const shots = path.join(out, 'screenshots');
const manifest = JSON.parse(await readFile(path.join(root, 'apps/site/routes.json'), 'utf8'));
const core = ['/', '/start', '/product', '/catalog', '/operations/search.web', '/proof', '/docs', '/pricing', '/status', '/security'];
const matrices = [
  ['desktop-1280', 1280, 900, manifest.routes.map(({ path: route }) => route), false],
  ['mobile-390', 390, 844, manifest.routes.map(({ path: route }) => route), true],
  ['desktop-1600', 1600, 1000, core, true],
  ['mobile-320', 320, 720, core, true],
];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const fail = (condition, code) => { if (!condition) throw new Error(code); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const slug = (route) => route === '/' ? 'home' : route.slice(1).replaceAll('/', '--').replaceAll(/[^a-zA-Z0-9_-]/gu, '-');

async function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const address = socket.address();
      socket.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}
async function staticServer(port) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
      let file = path.resolve(dist, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
      fail(file === dist || file.startsWith(`${dist}${path.sep}`), 'path_traversal');
      let info; try { info = await stat(file); } catch { info = null; }
      if (info?.isDirectory() || (info === null && path.extname(file) === '')) file = path.join(file, 'index.html');
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(404).end('not found'); }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
  return server;
}
async function findChrome() {
  for (const candidate of [process.env.CHROME_PATH, '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* next */ }
  }
  throw new Error('chrome_executable_missing');
}
async function json(url, timeout = 15_000) {
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
async function chrome(port, profile) {
  const executable = await findChrome();
  const child = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--mute-audio', '--no-first-run', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  const end = Date.now() + 15_000; let page;
  while (!page && Date.now() < end) { try { page = (await json(`http://127.0.0.1:${port}/json/list`, 2_000)).find(({ type }) => type === 'page'); } catch { /* retry */ } if (!page) await sleep(100); }
  fail(page?.webSocketDebuggerUrl, 'chrome_page_target_missing');
  return { child, executable, ws: page.webSocketDebuggerUrl };
}
const audit = `(() => {
 const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0&&r.width>0&&r.height>0};
 const labelled=e=>(e.getAttribute('aria-labelledby')||'').split(/\\s+/).filter(Boolean).map(id=>document.getElementById(id)?.textContent||'').join(' ');
 const name=e=>(e.getAttribute('aria-label')||labelled(e)||e.getAttribute('alt')||e.getAttribute('title')||e.getAttribute('placeholder')||e.textContent||'').replace(/\\s+/g,' ').trim();
 const interactive=[...document.querySelectorAll('button,a,input,select,textarea,[role="button"],[role="link"]')].filter(visible);
 const controls=[...document.querySelectorAll('button,input:not([type="checkbox"]):not([type="radio"]),select,textarea,.liquid-capsule,.global-nav a,.mobile-navigation-panel a')].filter(visible);
 const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
 const h1=[...document.querySelectorAll('h1')].filter(visible);
 const clipped=[...document.querySelectorAll('h1,h2,h3,p,button,a,code')].filter(visible).filter(e=>{const s=getComputedStyle(e);return(s.overflowX==='hidden'||s.overflowX==='clip')&&e.scrollWidth>e.clientWidth+1}).slice(0,8).map(e=>({tag:e.tagName,text:(e.textContent||'').trim().slice(0,80)}));
 return {overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,scrollY,headings:h1.map(e=>e.textContent.trim()),headingTop:h1[0]?.getBoundingClientRect().top??null,unnamed:interactive.filter(e=>!name(e)).length,small:controls.map(e=>[e,e.getBoundingClientRect()]).filter(([,r])=>r.width<43.5||r.height<43.5).slice(0,8).map(([e,r])=>({name:name(e),w:Math.round(r.width),h:Math.round(r.height)})),duplicates:[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))],clipped,canonical:document.querySelector('link[rel="canonical"]')?.href||'',logo:document.querySelector('[data-logo-authority="hollow-apex-v1.0"]')?.getAttribute('data-logo-authority')||'',mobile:(()=>{const e=document.querySelector('.mobile-menu-trigger');return e?visible(e):false})()};
})()`;
const duration = (value) => Math.max(...value.split(',').map((item) => item.trim().endsWith('ms') ? Number.parseFloat(item) / 1000 : Number.parseFloat(item) || 0), 0);

fail(typeof WebSocket === 'function', 'node_websocket_unavailable');
await rm(out, { recursive: true, force: true }); await mkdir(shots, { recursive: true });
const webPort = await freePort(), debugPort = await freePort(), profile = await mkdtemp(path.join(os.tmpdir(), 'clervo-chrome-'));
const server = await staticServer(webPort); let browser, cdp; const results = [], failures = [];
try {
  browser = await chrome(debugPort, profile); cdp = new Cdp(browser.ws); await cdp.open();
  await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'].map((method) => cdp.send(method)));
  let diagnostics;
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => diagnostics?.push(`runtime_exceptions:${exceptionDetails.text}`));
  cdp.on('Runtime.consoleAPICalled', ({ type, args }) => { if (type === 'error') diagnostics?.push(`console_errors:${args.map(({ value, description }) => value ?? description ?? '').join(' ')}`); });
  cdp.on('Log.entryAdded', ({ entry }) => { if (entry.level === 'error') diagnostics?.push(`console_errors:${entry.text}`); });
  cdp.on('Network.loadingFailed', ({ canceled, errorText, type }) => { if (!canceled) diagnostics?.push(`network_failures:${type}:${errorText}`); });
  cdp.on('Network.responseReceived', ({ response, type }) => { if (response.status >= 400) diagnostics?.push(`http_errors:${type}:${response.status}:${response.url}`); });
  for (const [id, width, height, routes, screenshot] of matrices) {
    const mobile = width <= 768;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
    await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [] });
    for (const route of routes) {
      diagnostics = []; const loaded = cdp.once('Page.loadEventFired');
      const navigation = await cdp.send('Page.navigate', { url: `http://127.0.0.1:${webPort}${route}` });
      if (navigation.errorText) diagnostics.push(`navigation_failed:${navigation.errorText}`); else await loaded;
      await cdp.send('Runtime.evaluate', { expression: 'document.fonts?document.fonts.ready.then(()=>true):true', awaitPromise: true, returnByValue: true }); await sleep(120);
      const page = (await cdp.send('Runtime.evaluate', { expression: audit, returnByValue: true })).result.value;
      const errors = [...diagnostics];
      if (page.overflow > 1) errors.push(`horizontal_overflow:${page.overflow}`);
      if (!page.headings.length) errors.push('visible_h1_missing');
      if (page.headingTop !== null && page.headingTop < 64) errors.push(`heading_under_header:${page.headingTop}`);
      if (page.unnamed) errors.push(`accessible_name_missing:${page.unnamed}`);
      if (page.small.length) errors.push(`small_targets:${JSON.stringify(page.small)}`);
      if (page.duplicates.length) errors.push(`duplicate_ids:${page.duplicates.join(',')}`);
      if (page.clipped.length) errors.push(`clipped_text:${JSON.stringify(page.clipped)}`);
      if (page.scrollY !== 0) errors.push(`initial_scroll_not_zero:${page.scrollY}`);
      if (page.canonical !== `https://clervo.dev${route}`) errors.push(`canonical_mismatch:${page.canonical}`);
      if (page.logo !== 'hollow-apex-v1.0') errors.push('logo_authority_missing');
      if (mobile !== page.mobile) errors.push(mobile ? 'mobile_menu_trigger_missing' : 'mobile_menu_trigger_visible_on_desktop');
      if (mobile && core.includes(route)) {
        const opened = (await cdp.send('Runtime.evaluate', { expression: `(()=>{const b=document.querySelector('.mobile-menu-trigger');b?.click();return[b?.getAttribute('aria-expanded'),document.querySelector('.mobile-navigation')?.classList.contains('is-open')]})()`, returnByValue: true })).result.value; await sleep(80);
        if (opened[0] !== 'true' || opened[1] !== true) errors.push('mobile_menu_open_failed');
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }); await sleep(80);
        const closed = (await cdp.send('Runtime.evaluate', { expression: `(()=>{const b=document.querySelector('.mobile-menu-trigger');return[b?.getAttribute('aria-expanded'),document.querySelector('.mobile-navigation')?.classList.contains('is-open')]})()`, returnByValue: true })).result.value;
        if (closed[0] !== 'false' || closed[1] !== false) errors.push('mobile_menu_escape_failed');
      }
      if (screenshot && core.includes(route)) {
        const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
        await writeFile(path.join(shots, `${id}--${slug(route)}.png`), Buffer.from(image.data, 'base64'));
      }
      results.push({ matrix: id, width, height, route, page, errors });
      failures.push(...errors.map((error) => `${id}:${route}:${error}`));
    }
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
  await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const loaded = cdp.once('Page.loadEventFired'); await cdp.send('Page.navigate', { url: `http://127.0.0.1:${webPort}/` }); await loaded;
  const reduced = (await cdp.send('Runtime.evaluate', { expression: `(()=>{const e=document.querySelector('.liquid-capsule'),s=e?getComputedStyle(e):null;return{transition:s?.transitionDuration||'',animation:s?.animationDuration||'',scroll:getComputedStyle(document.documentElement).scrollBehavior}})()`, returnByValue: true })).result.value;
  if (duration(reduced.transition) > .01 || duration(reduced.animation) > .01 || reduced.scroll !== 'auto') failures.push(`reduced_motion_not_collapsed:${JSON.stringify(reduced)}`);
  const screenshotCount = matrices.filter(([, , , , value]) => value).reduce((total, [, , , routes]) => total + routes.filter((route) => core.includes(route)).length, 0);
  const report = { schemaVersion: 'clervo.browser-qa.v1', generatedAt: new Date().toISOString(), chrome: browser.executable, routeCount: manifest.routes.length, assertions: results.length, screenshotCount, reducedMotion: reduced, failures, results };
  await writeFile(path.join(out, 'browser-qa-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const summary = ['# Clervo Step 8 browser QA', '', `- Canonical routes: ${manifest.routes.length}`, `- Route/viewport assertions: ${results.length}`, `- Screenshots: ${screenshotCount}`, `- Failures: ${failures.length}`, `- Reduced motion: \`${JSON.stringify(reduced)}\``, '', failures.length ? '**FAIL**' : '**PASS**', ...failures.map((error) => `- ${error}`), ''].join('\n');
  await writeFile(path.join(out, 'browser-qa-summary.md'), summary); if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag: 'a' });
  fail(!failures.length, `browser_qa_failed:${failures.length}`); console.log(`Step 8 browser QA: PASS (${results.length} assertions, ${screenshotCount} screenshots)`);
} finally {
  cdp?.close(); browser?.child.kill('SIGTERM'); await new Promise((resolve) => server.close(resolve)); await rm(profile, { recursive: true, force: true });
}
