#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { canonicalPath, siteRouteInventory } from './site-route-inventory.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const site = path.join(root, 'apps/site/dist');
const out = path.join(root, 'apps/site/qa-recovery/coherence');
const captures = path.join(out, 'captures');
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

class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.id = 1; this.pending = new Map(); }
  async open() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('cdp_open_timeout')), 10_000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('cdp_socket_error')); }, { once: true });
    });
    this.ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.id === undefined) return;
      const call = this.pending.get(message.id); if (!call) return;
      this.pending.delete(message.id);
      message.error ? call.reject(new Error(`${call.method}:${message.error.message}`)) : call.resolve(message.result ?? {});
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
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

async function setViewport(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width <= 900, screenWidth: width, screenHeight: height,
  });
}

async function navigate(cdp, url) {
  await cdp.send('Page.navigate', { url });
  const end = Date.now() + 12_000;
  while (Date.now() < end) {
    const ready = (await cdp.send('Runtime.evaluate', { expression: `document.readyState==='complete'`, returnByValue: true })).result?.value;
    if (ready) break;
    await sleep(60);
  }
  await cdp.send('Runtime.evaluate', { expression: 'document.fonts ? document.fonts.ready.then(() => true) : true', awaitPromise: true, returnByValue: true });
  await sleep(120);
}

async function scrollTo(cdp, selector) {
  if (!selector) {
    await cdp.send('Runtime.evaluate', { expression: 'scrollTo(0,0)' });
    return true;
  }
  return (await cdp.send('Runtime.evaluate', {
    expression: `(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!(el instanceof HTMLElement))return false; el.scrollIntoView({block:'center',inline:'nearest'}); return true; })()`,
    returnByValue: true,
  })).result?.value === true;
}

async function inspect(cdp, route) {
  return (await cdp.send('Runtime.evaluate', { expression: `(() => {
    const transparent=(value)=>value==='rgba(0, 0, 0, 0)'||value==='transparent';
    const style=(selector)=>{const el=document.querySelector(selector);if(!(el instanceof HTMLElement))return null;const s=getComputedStyle(el),r=el.getBoundingClientRect();return{backgroundColor:s.backgroundColor,backgroundImage:s.backgroundImage,borderRadius:s.borderRadius,borderRightWidth:s.borderRightWidth,height:r.height,width:r.width,display:s.display}};
    const header=style('.site-header__inner.shell');
    const cta=style('.site-header__cta');
    const subnav=[...document.querySelectorAll('.s6-subnav a')].map((el)=>getComputedStyle(el).borderRightWidth);
    const familyLabels=['.s4-router-label.search','.s4-router-label.ai','.s4-router-label.sandbox','.s4-router-label.rpc','.s4-router-label.prediction','.s4-router-label.crypto'].map((selector)=>style(selector)?.display).filter(Boolean);
    const contract=style('.s4-contract-grid');
    const boundary=style('.s4-boundary-grid');
    const searchButton=style('.s4-search-main .b12-button');
    const pageLead=style('.page-lead');
    return{
      route:${JSON.stringify(route)},
      overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-document.documentElement.clientWidth,
      header,
      cta,
      subnav,
      visibleFamilyLabels:familyLabels.filter((display)=>display!=='none').length,
      contract,
      boundary,
      searchButton,
      pageLead,
      contractTransparent:contract?transparent(contract.backgroundColor)&&contract.backgroundImage==='none':true,
      boundaryTransparent:boundary?transparent(boundary.backgroundColor)&&boundary.backgroundImage==='none':true,
      searchButtonQuiet:searchButton?transparent(searchButton.backgroundColor)&&searchButton.backgroundImage==='none':true,
    };
  })()`, returnByValue: true })).result.value;
}

const inventory = await siteRouteInventory(root);
const firstModel = inventory.find(({ kind }) => kind === 'model')?.route;
const firstOperation = inventory.find(({ kind }) => kind === 'operation')?.route;
const cases = [
  { id: 'product-top-desktop', route: '/product', width: 1600, height: 900 },
  { id: 'product-contract-desktop', route: '/product', width: 1600, height: 900, selector: '.s4-contract-grid' },
  { id: 'product-boundary-desktop', route: '/product', width: 1600, height: 900, selector: '.s4-boundary-grid' },
  { id: 'product-mobile', route: '/product', width: 390, height: 844 },
  { id: 'catalog-desktop', route: '/catalog', width: 1600, height: 900 },
  { id: 'catalog-mobile', route: '/catalog', width: 390, height: 844 },
  { id: 'docs-desktop', route: '/docs', width: 1600, height: 900 },
  { id: 'docs-mobile', route: '/docs', width: 390, height: 844 },
  { id: 'pricing-desktop', route: '/pricing', width: 1600, height: 900 },
  { id: 'pricing-mobile', route: '/pricing', width: 390, height: 844 },
  { id: 'trust-desktop', route: '/trust', width: 1600, height: 900 },
  ...(firstModel ? [{ id: 'model-detail-desktop', route: firstModel, width: 1600, height: 900 }] : []),
  ...(firstOperation ? [{ id: 'operation-detail-desktop', route: firstOperation, width: 1600, height: 900 }] : []),
];

assert(typeof WebSocket === 'function', 'node_websocket_unavailable');
await access(site, constants.R_OK);
await rm(out, { recursive: true, force: true });
await mkdir(captures, { recursive: true });
const webPort = await freePort();
const debugPort = await freePort();
const profile = await mkdtemp(path.join(os.tmpdir(), 'clervo-coherence-'));
const server = await serve(webPort);
let browser; let cdp;
const results = []; const issues = [];

try {
  browser = await launchChrome(debugPort, profile);
  cdp = new Cdp(browser.ws); await cdp.open();
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  for (const item of cases) {
    await setViewport(cdp, item.width, item.height);
    await navigate(cdp, `http://127.0.0.1:${webPort}${canonicalPath(item.route)}`);
    const targetFound = await scrollTo(cdp, item.selector);
    await sleep(120);
    const diagnostics = await inspect(cdp, item.route);
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(captures, `${item.id}.png`), Buffer.from(screenshot.data, 'base64'));
    results.push({ ...item, targetFound, diagnostics });
  }
} finally {
  try { cdp?.close(); } catch { /* noop */ }
  try { if (browser?.child && browser.child.exitCode === null) browser.child.kill('SIGTERM'); } catch { /* noop */ }
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

for (const result of results) {
  const d = result.diagnostics;
  if (d.overflow > 1) issues.push(`${result.id}:horizontal_overflow:${d.overflow}`);
  if (d.header) {
    if (parseFloat(d.header.borderRadius) > 1) issues.push(`${result.id}:internal_header_capsule:${d.header.borderRadius}`);
    if (d.header.backgroundImage !== 'none') issues.push(`${result.id}:internal_header_gradient:${d.header.backgroundImage}`);
  }
  if (d.cta && d.cta.height < 44) issues.push(`${result.id}:header_cta_below_44:${d.cta.height}`);
  if (d.subnav.some((value) => parseFloat(value) > 0)) issues.push(`${result.id}:boxed_secondary_nav`);
  if (result.route === '/product' && d.visibleFamilyLabels !== 0) issues.push(`${result.id}:product_hero_repeats_family_labels:${d.visibleFamilyLabels}`);
  if (result.route === '/product' && !d.contractTransparent) issues.push(`${result.id}:product_contract_surface_not_open`);
  if (result.route === '/product' && !d.boundaryTransparent) issues.push(`${result.id}:product_boundary_surface_not_open`);
  if (result.route === '/catalog' && !d.searchButtonQuiet) issues.push(`${result.id}:catalog_search_button_surface`);
  if (result.selector && !result.targetFound) issues.push(`${result.id}:target_missing:${result.selector}`);
}

const report = { generatedAt: new Date().toISOString(), chrome: browser?.executable ?? null, cases: results.length, issues, results };
await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(out, 'summary.md'), [
  '# Clervo visual coherence audit', '',
  `- Targeted browser captures: ${results.length}`,
  `- Issues: ${issues.length}`,
  `- Capture directory: apps/site/qa-recovery/coherence/captures`, '',
  ...(issues.length ? ['## Issues', '', ...issues.map((issue) => `- ${issue}`), ''] : ['## Result', '', '- PASS', '']),
].join('\n'));
if (issues.length) throw new Error(`visual_coherence_audit_failed:${issues.length}`);
console.log(`visual coherence audit: PASS (${results.length} targeted captures)`);
