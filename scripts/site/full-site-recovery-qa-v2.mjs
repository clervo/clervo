#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { canonicalPath, siteRouteInventory } from './site-route-inventory.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const useBuilt = args.includes('--use-built');
const site = path.join(root, 'apps/site/dist');
const out = path.join(root, 'apps/site/qa-recovery');
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
  on(method, callback) {
    const list = this.events.get(method) ?? [];
    list.push(callback); this.events.set(method, list);
    return () => this.events.set(method, (this.events.get(method) ?? []).filter((item) => item !== callback));
  }
  once(method, timeout = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error(`${method}_timeout`)); }, timeout);
      const off = this.on(method, (result) => { clearTimeout(timer); off(); resolve(result); });
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
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width <= 900, screenWidth: width, screenHeight: height,
  });
}

async function navigate(cdp, url) {
  const loaded = cdp.once('Page.loadEventFired');
  const nav = await cdp.send('Page.navigate', { url });
  assert(!nav.errorText, `navigation:${url}:${nav.errorText}`);
  await loaded;
  await cdp.send('Runtime.evaluate', { expression: 'document.fonts ? document.fonts.ready.then(() => true) : true', awaitPromise: true, returnByValue: true });
  await sleep(80);
}

async function inspectMobileMenu(cdp, width) {
  if (width > 900) return null;
  const opened = (await cdp.send('Runtime.evaluate', { expression: `(() => {
    const button=document.querySelector('.site-header__menu');
    if(!(button instanceof HTMLButtonElement)||getComputedStyle(button).display==='none')return false;
    button.click();return true;
  })()`, returnByValue: true })).result.value;
  if (!opened) return { present: false };
  await waitForExpression(cdp, `document.querySelector('.mobile-nav')?.classList.contains('is-open')===true`, 'mobile_menu_open');
  const result = (await cdp.send('Runtime.evaluate', { expression: `(() => {
    const panel=document.querySelector('.mobile-nav__panel');
    if(!(panel instanceof HTMLElement))return{present:false};
    const vw=document.documentElement.clientWidth,vh=document.documentElement.clientHeight,box=panel.getBoundingClientRect();
    const links=[...panel.querySelectorAll('a[href],button')].filter((node)=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'}).map((node)=>{const r=node.getBoundingClientRect();return{label:node.getAttribute('aria-label')||node.textContent?.trim().slice(0,60)||node.tagName,width:r.width,height:r.height,horizontal:r.left>=-1&&r.right<=vw+1}});
    return{present:true,panelContained:box.left>=-1&&box.right<=vw+1&&box.top>=-1&&box.bottom<=vh+1,scrollable:panel.scrollHeight>=panel.clientHeight,count:links.length,tooSmall:links.filter((x)=>x.width<44||x.height<44).map((x)=>x.label),outside:links.filter((x)=>!x.horizontal).map((x)=>x.label)};
  })()`, returnByValue: true })).result.value;
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.mobile-nav__close')?.click()` });
  return result;
}

async function inspectPage(cdp, width, route) {
  return (await cdp.send('Runtime.evaluate', { expression: `(() => {
    const vw=document.documentElement.clientWidth,vh=document.documentElement.clientHeight;
    const visible=(node)=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>.01};
    const horizontalScroller=(node)=>{let parent=node.parentElement;while(parent&&parent!==document.body){const s=getComputedStyle(parent);if(/auto|scroll/.test(s.overflowX)&&parent.scrollWidth>parent.clientWidth+1)return true;parent=parent.parentElement}return false};
    const controls=[...document.querySelectorAll('button,[role="button"],input,select,.button,.b12-button,.s6-button,.site-header a[href]')].filter(visible).map((node)=>{const r=node.getBoundingClientRect();return{label:node.getAttribute('aria-label')||node.textContent?.trim().slice(0,70)||node.tagName,width:r.width,height:r.height,left:r.left,right:r.right,inScroller:horizontalScroller(node)}});
    const positioned=[...document.querySelectorAll('body *')].filter((node)=>{const s=getComputedStyle(node);return(s.position==='fixed'||s.position==='sticky')&&visible(node)&&!node.classList.contains('skip-link')}).map((node)=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return{label:node.id?'#'+node.id:'.'+[...node.classList].join('.'),position:s.position,left:r.left,right:r.right,top:r.top,bottom:r.bottom}});
    const routeJsonLd=document.querySelector('script[data-clervo-route-jsonld]');let jsonLd=false;try{jsonLd=Boolean(JSON.parse(routeJsonLd?.textContent||'')?.['@context'])}catch{}
    const images=[...document.images].filter(visible).map((img)=>({src:img.currentSrc||img.src,complete:img.complete,naturalWidth:img.naturalWidth}));
    return{
      h1:document.querySelectorAll('main h1').length,
      width:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),client:vw,
      title:document.title,description:document.querySelector('meta[name="description"]')?.content||'',
      canonical:document.querySelector('link[rel="canonical"]')?.href||'',og:document.querySelector('meta[property="og:title"]')?.content||'',twitter:document.querySelector('meta[name="twitter:title"]')?.content||'',jsonLd,
      footer:Boolean(document.querySelector('.site-footer')),
      failedImages:images.filter((img)=>img.complete&&img.naturalWidth===0).map((img)=>img.src),
      tooSmall:${width <= 900 ? `controls.filter((x)=>x.width<44||x.height<44).map((x)=>x.label)` : '[]'},
      controlsOutside:controls.filter((x)=>(x.left<-1||x.right>vw+1)&&!x.inScroller).map((x)=>x.label),
      positionedOutside:positioned.filter((x)=>x.left<-1||x.right>vw+1||(x.position==='fixed'&&(x.top<-1||x.bottom>vh+1))).map((x)=>x.label),
      homeState:document.querySelector('.clervo-home-hero')?.getAttribute('data-state')||null,
      homeMarquee:getComputedStyle(document.querySelector('.clervo-home-hero__ecosystem')||document.documentElement).animationName,
      rpcTruth:${JSON.stringify(route === '/products/rpc')}?document.querySelector('main')?.textContent?.toLowerCase().includes('live')===true&&!document.querySelector('main')?.textContent?.toLowerCase().includes('unavailable'):true,
    };
  })()`, returnByValue: true })).result.value;
}

async function runStartWalkthrough(cdp) {
  return (await cdp.send('Runtime.evaluate', { expression: `(() => {
    const text=document.querySelector('.start-page')?.textContent||'';
    return {
      canonicalSkill:text.includes('Set up https://clervo.dev/skill.md'),
      hostedApi:text.includes('https://api.clervo.dev/v1'),
      localProxy:text.includes('http://127.0.0.1:8402/v1'),
      paymentBoundary:text.includes('HTTP 402')&&text.includes('nothing is charged'),
      supportedInterfaces:document.querySelectorAll('.start-interface-ledger article').length,
    };
  })()`, returnByValue: true })).result.value;
}

if (!useBuilt) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', 'build', '--workspace', '@clervo/site'], { cwd: root, encoding: 'utf8' });
  assert(result.status === 0, `site_build_failed:${result.status}`);
}
await access(site, constants.R_OK);
await rm(out, { recursive: true, force: true });
await mkdir(captures, { recursive: true });

const inventory = await siteRouteInventory(root);
const firstModel = inventory.find(({ kind }) => kind === 'model')?.route;
const firstOperation = inventory.find(({ kind }) => kind === 'operation')?.route;
const representative = ['/', '/start', '/product', '/catalog', '/docs', '/docs/quickstart', '/pricing', '/status', '/security', '/products/ai', '/products/rpc', firstModel, firstOperation].filter(Boolean);
const matrix = representative.flatMap((route) => [
  { id: `${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}-desktop`, route, width: 1600, height: 900 },
  { id: `${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}-mobile`, route, width: 390, height: 844 },
]);
matrix.push(
  { id: 'home-short', route: '/', width: 1280, height: 720 },
  { id: 'home-narrow', route: '/', width: 320, height: 700 },
  { id: 'start-short', route: '/start', width: 1280, height: 720 },
  { id: 'docs-tablet', route: '/docs', width: 768, height: 1024 },
);

const webPort = await freePort();
const debugPort = await freePort();
const profile = await mkdtemp(path.join(os.tmpdir(), 'clervo-recovery-qa-v2-'));
const server = await serve(webPort);
let browser; let cdp;
const results = []; const issues = [];
let consoleErrors = []; let pageErrors = [];
try {
  browser = await launchChrome(debugPort, profile);
  cdp = new Cdp(browser.ws); await cdp.open();
  await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable'].map((method) => cdp.send(method)));
  cdp.on('Runtime.consoleAPICalled', ({ type, args: values }) => { if (type === 'error') consoleErrors.push(values.map(({ value: item, description }) => item ?? description ?? '').join(' ')); });
  cdp.on('Log.entryAdded', ({ entry }) => { if (entry.level === 'error') consoleErrors.push(entry.text); });
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => pageErrors.push(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'runtime_exception'));

  for (const capture of matrix) {
    consoleErrors = []; pageErrors = [];
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await setViewport(cdp, capture.width, capture.height);
    await navigate(cdp, `http://127.0.0.1:${webPort}${canonicalPath(capture.route)}`);
    if (capture.route === '/') await waitForExpression(cdp, `document.querySelector('.clervo-home-hero')?.getAttribute('data-state')==='result'`, `${capture.id}_home_result`, 6_000);
    const menu = await inspectMobileMenu(cdp, capture.width);
    const diagnostics = await inspectPage(cdp, capture.width, capture.route);
    const start = capture.route === '/start' && capture.width === 1600 ? await runStartWalkthrough(cdp) : null;
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(captures, `${capture.id}.png`), Buffer.from(screenshot.data, 'base64'));
    results.push({ ...capture, diagnostics, menu, start, consoleErrors: [...new Set(consoleErrors)], pageErrors: [...new Set(pageErrors)] });
  }

  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await setViewport(cdp, 390, 844);
  await navigate(cdp, `http://127.0.0.1:${webPort}/`);
  await waitForExpression(cdp, `document.querySelector('.clervo-home-hero')?.getAttribute('data-state')==='result'`, 'reduced_home_result', 2_000);
  const reduced = await inspectPage(cdp, 390, '/');
  if (reduced.homeMarquee !== 'none') issues.push(`home-reduced:marquee_animation:${reduced.homeMarquee}`);
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

for (const result of results) {
  const { id, route, diagnostics: d, menu, start, consoleErrors: ce, pageErrors: pe } = result;
  const expectedCanonical = `https://clervo.dev${canonicalPath(route)}`;
  if (d.h1 !== 1) issues.push(`${id}:h1:${d.h1}`);
  if (d.width > d.client + 1) issues.push(`${id}:document_overflow:${d.width}/${d.client}`);
  if (d.canonical !== expectedCanonical) issues.push(`${id}:canonical:${d.canonical}`);
  if (!d.title.endsWith('— Clervo')) issues.push(`${id}:title:${d.title}`);
  if (d.description.length < 20) issues.push(`${id}:description`);
  if (!d.og || !d.twitter || !d.jsonLd) issues.push(`${id}:social_or_jsonld`);
  if (!d.footer) issues.push(`${id}:footer`);
  if (route === '/' && d.homeState !== 'result') issues.push(`${id}:home_state:${d.homeState}`);
  if (!d.rpcTruth) issues.push(`${id}:rpc_truth_missing`);
  for (const label of d.tooSmall) issues.push(`${id}:control_below_44px:${label}`);
  for (const label of d.controlsOutside) issues.push(`${id}:control_outside_document:${label}`);
  for (const label of d.positionedOutside) issues.push(`${id}:fixed_or_sticky_horizontal_escape:${label}`);
  for (const src of d.failedImages) issues.push(`${id}:failed_image:${src}`);
  for (const error of ce) issues.push(`${id}:console:${error}`);
  for (const error of pe) issues.push(`${id}:page:${error}`);
  if (menu) {
    if (!menu.present) issues.push(`${id}:mobile_menu_missing`);
    else {
      if (!menu.panelContained) issues.push(`${id}:mobile_menu_panel_escape`);
      if (menu.count < 4) issues.push(`${id}:mobile_menu_links:${menu.count}`);
      for (const label of menu.tooSmall) issues.push(`${id}:mobile_menu_below_44px:${label}`);
      for (const label of menu.outside) issues.push(`${id}:mobile_menu_horizontal_escape:${label}`);
    }
  }
  if (start && (!start.canonicalSkill || !start.hostedApi || !start.localProxy || !start.paymentBoundary || start.supportedInterfaces !== 6)) {
    issues.push(`${id}:start_activation_contract:${JSON.stringify(start)}`);
  }
}

const report = { generatedAt: new Date().toISOString(), chrome: browser?.executable ?? null, staticRoutes: inventory.length, captures: results.length, issues, results };
await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(out, 'summary.md'), [
  '# Clervo full-site recovery QA v2', '',
  `- Build: ${useBuilt ? 'prebuilt' : 'PASS'}`,
  `- Static routes checked: ${inventory.length}`,
  `- Browser captures: ${results.length}`,
  `- Issues: ${issues.length}`, '',
  ...(issues.length ? ['## Issues', '', ...issues.map((issue) => `- ${issue}`), ''] : ['## Result', '', '- PASS', '']),
].join('\n'));
if (issues.length) throw new Error(`full_site_recovery_qa_v2_failed:${issues.length}`);
console.log(`full-site recovery QA v2: PASS (${results.length} captures, ${inventory.length} static routes)`);
