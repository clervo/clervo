#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { canonicalPath, siteRouteInventory } from './site-route-inventory.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const defaultSite = path.join(root, 'apps/site/dist');
const site = defaultSite;
const out = path.join(root, 'apps/site/qa-recovery');
const useBuilt = has('--use-built');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const mime = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
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
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    try {
      let file = path.resolve(site, url.pathname.replace(/^\/+/, ''));
      if (!(file === site || file.startsWith(`${site}${path.sep}`))) throw new Error('path_traversal');
      let info; try { info = await stat(file); } catch { info = null; }
      if (info?.isDirectory() || (info === null && path.extname(file) === '')) file = path.join(file, 'index.html');
      const body = await readFile(file);
      response.writeHead(200, { 'cache-control': 'no-store', 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      const body = await readFile(path.join(site, '404.html'));
      response.writeHead(404, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : body);
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

async function waitForExit(child, timeoutMs = 2_000) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(true); };
    const timer = setTimeout(() => { child.off('exit', done); resolve(child.exitCode !== null || child.signalCode !== null); }, timeoutMs);
    child.once('exit', done);
  });
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
  once(method, timeout = 15_000) { return new Promise((resolve, reject) => { const timer = setTimeout(() => { off(); reject(new Error(`${method}_timeout`)); }, timeout); const off = this.on(method, (result) => { clearTimeout(timer); off(); resolve(result); }); }); }
  close() { this.ws.close(); }
}

async function launchChrome(port, profile) {
  const executable = await findChrome();
  const child = spawn(executable, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-extensions',
    '--disable-sync', '--mute-audio', '--no-first-run', '--hide-scrollbars', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  const end = Date.now() + 15_000; let page;
  while (!page && Date.now() < end) {
    try { page = (await fetchJson(`http://127.0.0.1:${port}/json/list`, 2_000)).find(({ type }) => type === 'page'); } catch { /* retry */ }
    if (!page) await sleep(100);
  }
  assert(page?.webSocketDebuggerUrl, 'chrome_page_target_missing');
  return { child, executable, ws: page.webSocketDebuggerUrl };
}

const inventory = await siteRouteInventory(root);
if (!useBuilt) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', 'build', '--workspace', '@clervo/site'], { cwd: root, encoding: 'utf8' });
  assert(result.status === 0, `site_build_failed:${result.status}`);
}
await access(site, constants.R_OK);
await mkdir(out, { recursive: true });

const webPort = await freePort();
const debugPort = await freePort();
const profile = await mkdtemp(path.join(os.tmpdir(), 'clervo-route-smoke-'));
const server = await serve(webPort);
let browser; let cdp;
const results = [];
try {
  browser = await launchChrome(debugPort, profile);
  cdp = new Cdp(browser.ws); await cdp.open();
  await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable'].map((method) => cdp.send(method)));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false, screenWidth: 1280, screenHeight: 720 });
  let consoleErrors = []; let pageErrors = [];
  cdp.on('Runtime.consoleAPICalled', ({ type, args: values }) => { if (type === 'error') consoleErrors.push(values.map(({ value: item, description }) => item ?? description ?? '').join(' ')); });
  cdp.on('Log.entryAdded', ({ entry }) => { if (entry.level === 'error') consoleErrors.push(entry.text); });
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => pageErrors.push(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'runtime_exception'));

  for (const item of inventory) {
    consoleErrors = []; pageErrors = [];
    const loaded = cdp.once('Page.loadEventFired');
    const nav = await cdp.send('Page.navigate', { url: `http://127.0.0.1:${webPort}${canonicalPath(item.route)}` });
    assert(!nav.errorText, `route_smoke_navigation:${item.route}:${nav.errorText}`); await loaded;
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts ? document.fonts.ready.then(() => true) : true', awaitPromise: true, returnByValue: true });
    await sleep(60);
    const diagnostics = (await cdp.send('Runtime.evaluate', { expression: `(() => {
      const routeJsonLd=document.querySelector('script[data-clervo-route-jsonld]'); let jsonLd=false;
      try{jsonLd=Boolean(JSON.parse(routeJsonLd?.textContent||'')?.['@context']);}catch{}
      const images=[...document.images].filter((img)=>{const r=img.getBoundingClientRect(),s=getComputedStyle(img);return r.width>0&&r.height>0&&s.display!=='none'});
      return {
        h1:document.querySelectorAll('main h1').length,
        width:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),
        client:document.documentElement.clientWidth,
        canonical:document.querySelector('link[rel="canonical"]')?.href||'',
        title:document.title,
        description:document.querySelector('meta[name="description"]')?.content||'',
        jsonLd,
        footer:Boolean(document.querySelector('.site-footer')),
        failedImages:images.filter((img)=>img.complete&&img.naturalWidth===0).map((img)=>img.currentSrc||img.src),
      };
    })()`, returnByValue: true })).result.value;
    results.push({ route: item.route, ...diagnostics, consoleErrors: [...new Set(consoleErrors)], pageErrors: [...new Set(pageErrors)] });
  }
} finally {
  try { cdp?.close(); } catch { /* noop */ }
  try {
    const child = browser?.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM'); if (!(await waitForExit(child))) child.kill('SIGKILL');
    }
  } catch { /* noop */ }
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

const issues = [];
for (const item of results) {
  const canonical = `https://clervo.dev${canonicalPath(item.route)}`;
  if (item.h1 !== 1) issues.push(`${item.route}:h1:${item.h1}`);
  if (item.width > item.client + 1) issues.push(`${item.route}:overflow:${item.width}/${item.client}`);
  if (item.canonical !== canonical) issues.push(`${item.route}:canonical:${item.canonical}`);
  if (!item.title.endsWith('— Clervo')) issues.push(`${item.route}:title:${item.title}`);
  if (item.description.length < 20) issues.push(`${item.route}:description`);
  if (!item.jsonLd) issues.push(`${item.route}:jsonld`);
  if (!item.footer) issues.push(`${item.route}:footer`);
  for (const error of item.consoleErrors) issues.push(`${item.route}:console:${error}`);
  for (const error of item.pageErrors) issues.push(`${item.route}:page:${error}`);
  for (const src of item.failedImages) issues.push(`${item.route}:failed_image:${src}`);
}

const report = { generatedAt: new Date().toISOString(), chrome: browser?.executable ?? null, routeCount: inventory.length, results, issues };
await writeFile(path.join(out, 'route-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
if (issues.length) throw new Error(`full_site_route_smoke_failed:${issues.length}`);
console.log(`full-site route smoke: PASS (${inventory.length} hydrated routes)`);
