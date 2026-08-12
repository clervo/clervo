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
const has = (flag) => args.includes(flag);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1] ?? null;
};
const defaultSite = path.join(root, 'apps/site/dist');
const site = path.resolve(value('--site-root') ?? defaultSite);
const out = path.resolve(value('--out') ?? path.join(root, 'apps/site/qa-recovery'));
const useBuilt = has('--use-built') || site !== defaultSite;
const captures = path.join(out, 'captures');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const mime = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml; charset=utf-8',
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

async function waitForExit(child, timeoutMs = 2_000) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const onExit = () => { clearTimeout(timer); resolve(true); };
    const timer = setTimeout(() => { child.off('exit', onExit); resolve(child.exitCode !== null || child.signalCode !== null); }, timeoutMs);
    child.once('exit', onExit);
  });
}

async function serve(port) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
      const raw = url.pathname.replace(/^\/+/, '');
      let file = path.resolve(site, raw);
      assert(file === site || file.startsWith(`${site}${path.sep}`), 'path_traversal');
      let info; try { info = await stat(file); } catch { info = null; }
      if (info?.isDirectory() || (info === null && path.extname(file) === '')) file = path.join(file, 'index.html');
      try {
        const body = await readFile(file);
        response.writeHead(200, { 'cache-control': 'no-store', 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' });
        response.end(request.method === 'HEAD' ? undefined : body);
      } catch {
        const fallback = await readFile(path.join(site, '404.html'));
        response.writeHead(404, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' });
        response.end(request.method === 'HEAD' ? undefined : fallback);
      }
    } catch {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('server error');
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
  on(method, callback) { const list = this.events.get(method) ?? []; list.push(callback); this.events.set(method, list); return () => this.events.set(method, (this.events.get(method) ?? []).filter((item) => item !== callback)); }
  once(method, timeout = 15_000) { return new Promise((resolve, reject) => { const timer = setTimeout(() => { off(); reject(new Error(`${method}_timeout`)); }, timeout); const off = this.on(method, (result) => { clearTimeout(timer); off(); resolve(result); }); }); }
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

async function inspectMobileMenu(cdp, width) {
  if (width > 900) return null;
  const opened = await cdp.send('Runtime.evaluate', { expression: `(() => {
    const button = document.querySelector('.site-header__menu');
    if (!(button instanceof HTMLButtonElement) || getComputedStyle(button).display === 'none') return false;
    button.click(); return true;
  })()`, returnByValue: true });
  if (opened.result?.value !== true) return { present: false };
  await waitForExpression(cdp, `document.querySelector('.mobile-nav')?.classList.contains('is-open') === true`, 'mobile_menu_open');
  const result = (await cdp.send('Runtime.evaluate', { expression: `(() => {
    const panel = document.querySelector('.mobile-nav__panel');
    if (!(panel instanceof HTMLElement)) return { present:false };
    const box = panel.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const links = [...panel.querySelectorAll('a[href],button')].filter((node) => {
      const r = node.getBoundingClientRect(), s = getComputedStyle(node);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    }).map((node) => { const r=node.getBoundingClientRect(); return { label: node.textContent?.trim().slice(0,60) || node.getAttribute('aria-label'), width:r.width, height:r.height, contained:r.left>=-1&&r.right<=vw+1&&r.top>=-1&&r.bottom<=vh+1 }; });
    return { present:true, contained:box.left>=-1&&box.right<=vw+1&&box.top>=-1&&box.bottom<=vh+1, count:links.length, tooSmall:links.filter((x)=>x.width<44||x.height<44).map((x)=>x.label), outside:links.filter((x)=>!x.contained).map((x)=>x.label) };
  })()`, returnByValue: true })).result.value;
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.mobile-nav__close')?.click()` });
  return result;
}

async function inspectPage(cdp, capture) {
  return (await cdp.send('Runtime.evaluate', { expression: `(() => {
    const vw=document.documentElement.clientWidth, vh=document.documentElement.clientHeight;
    const visible=(node)=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>.01};
    const controls=[...document.querySelectorAll('button,[role="button"],input,select,.button,.b12-button,.s6-button,.site-header a[href]')].filter(visible).map((node)=>{const r=node.getBoundingClientRect();return{label:node.getAttribute('aria-label')||node.textContent?.trim().slice(0,70)||node.tagName,width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom}});
    const positioned=[...document.querySelectorAll('body *')].filter((node)=>{const s=getComputedStyle(node);return(s.position==='fixed'||s.position==='sticky')&&visible(node)}).map((node)=>{const r=node.getBoundingClientRect();return{label:node.id?'#'+node.id:'.'+[...node.classList].join('.'),left:r.left,right:r.right,top:r.top,bottom:r.bottom}});
    const images=[...document.images].filter((img)=>visible(img)).map((img)=>({src:img.currentSrc||img.src,complete:img.complete,naturalWidth:img.naturalWidth}));
    const routeJsonLd=document.querySelector('script[data-clervo-route-jsonld]');
    let routeJsonLdValid=false; try{const value=JSON.parse(routeJsonLd?.textContent||'');routeJsonLdValid=Boolean(value&&value['@context']);}catch{}
    const hero=document.querySelector('.clervo-home-hero');
    const marquee=document.querySelector('.clervo-home-hero__ecosystem');
    return {
      h1Count:document.querySelectorAll('main h1').length,
      scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth), clientWidth:vw,
      scrollHeight:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),
      title:document.title,
      description:document.querySelector('meta[name="description"]')?.content||'',
      canonical:document.querySelector('link[rel="canonical"]')?.href||'',
      ogTitle:document.querySelector('meta[property="og:title"]')?.content||'',
      twitterTitle:document.querySelector('meta[name="twitter:title"]')?.content||'',
      routeJsonLdValid,
      footer:Boolean(document.querySelector('.site-footer')),
      failedImages:images.filter((img)=>img.complete&&img.naturalWidth===0).map((img)=>img.src),
      controlsTooSmall:${capture.width <= 900 ? `controls.filter((x)=>x.width<44||x.height<44).map((x)=>x.label)` : '[]'},
      controlsOutside:controls.filter((x)=>x.left<-1||x.right>vw+1).map((x)=>x.label),
      positionedOutside:positioned.filter((x)=>x.left<-1||x.right>vw+1||x.top<-1||x.bottom>vh+1).map((x)=>x.label),
      homeState:hero?.getAttribute('data-state')||null,
      homeMarqueeAnimation:marquee?getComputedStyle(marquee).animationName:null,
      rpcUnavailable:${JSON.stringify(capture.path === '/products/rpc')} ? document.querySelector('main')?.textContent?.toLowerCase().includes('unavailable')===true : true,
    };
  })()`, returnByValue: true })).result.value;
}

async function runStartWalkthrough(cdp) {
  const indexes = (await cdp.send('Runtime.evaluate', { expression: `[...document.querySelectorAll('[data-start-stage-button]')].map((button)=>button.getAttribute('data-start-stage-button')).filter(Boolean)`, returnByValue: true })).result.value ?? [];
  const visited = [];
  for (const index of indexes) {
    const clicked = await cdp.send('Runtime.evaluate', { expression: `(() => { const b=document.querySelector('[data-start-stage-button="${index}"]'); if(!(b instanceof HTMLButtonElement))return false;b.click();return true;})()`, returnByValue: true });
    if (clicked.result?.value !== true) continue;
    await waitForExpression(cdp, `document.querySelector('.stage-panel')?.getAttribute('data-stage-index') === ${JSON.stringify(String(index))}`, `start_stage_${index}`, 4_000);
    visited.push(String(index));
  }
  return { available: indexes.map(String), visited };
}

const inventory = await siteRouteInventory(root);
const firstModel = inventory.find(({ kind }) => kind === 'model')?.route;
const firstOperation = inventory.find(({ kind }) => kind === 'operation')?.route;
const representative = [
  '/', '/start', '/product', '/catalog', '/docs', '/docs/quickstart', '/pricing', '/proof', '/status', '/trust',
  '/products/ai', '/products/rpc', firstModel, firstOperation,
].filter(Boolean);
const matrix = representative.flatMap((route) => [
  { id: `${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}-desktop`, path: route, width: 1600, height: 900 },
  { id: `${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}-mobile`, path: route, width: 390, height: 844 },
]);
matrix.push(
  { id: 'home-short', path: '/', width: 1280, height: 720 },
  { id: 'home-narrow', path: '/', width: 320, height: 700 },
  { id: 'start-short', path: '/start', width: 1280, height: 720 },
  { id: 'docs-tablet', path: '/docs', width: 768, height: 1024 },
);

assert(typeof WebSocket === 'function', 'node_websocket_unavailable');
await rm(out, { recursive: true, force: true });
await mkdir(captures, { recursive: true });
let build = { command: 'npm run build --workspace @clervo/site', skipped: useBuilt, exitCode: 0 };
if (!useBuilt) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', 'build', '--workspace', '@clervo/site'], { cwd: root, encoding: 'utf8' });
  build.exitCode = result.status;
  await writeFile(path.join(out, 'build.log'), `${result.stdout ?? ''}${result.stderr ?? ''}`);
  assert(result.status === 0, `site_build_failed:${result.status}`);
}
await access(site, constants.R_OK);

const webPort = await freePort();
const debugPort = await freePort();
const profile = await mkdtemp(path.join(os.tmpdir(), 'clervo-recovery-chrome-'));
const server = await serve(webPort);
let browser; let cdp; const results = []; const routeHttp = [];
try {
  // Every canonical route must exist as a static document before browser QA.
  for (const item of inventory) {
    const url = `http://127.0.0.1:${webPort}${canonicalPath(item.route)}`;
    const response = await fetch(url, { redirect: 'manual' });
    routeHttp.push({ route: item.route, status: response.status });
  }
  const missing = await fetch(`http://127.0.0.1:${webPort}/definitely-not-a-clervo-route/`, { redirect: 'manual' });
  routeHttp.push({ route: '/definitely-not-a-clervo-route/', status: missing.status });

  browser = await launchChrome(debugPort, profile);
  cdp = new Cdp(browser.ws); await cdp.open();
  await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable'].map((method) => cdp.send(method)));
  let consoleErrors = []; let pageErrors = [];
  cdp.on('Runtime.consoleAPICalled', ({ type, args: values }) => { if (type === 'error') consoleErrors.push(values.map(({ value: item, description }) => item ?? description ?? '').join(' ')); });
  cdp.on('Log.entryAdded', ({ entry }) => { if (entry.level === 'error') consoleErrors.push(entry.text); });
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => pageErrors.push(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'runtime_exception'));

  for (const capture of matrix) {
    consoleErrors = []; pageErrors = [];
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: capture.width, height: capture.height, deviceScaleFactor: 1, mobile: false, screenWidth: capture.width, screenHeight: capture.height });
    await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [] });
    const loaded = cdp.once('Page.loadEventFired');
    const navigation = await cdp.send('Page.navigate', { url: `http://127.0.0.1:${webPort}${capture.path}` });
    assert(!navigation.errorText, `navigation_failed:${capture.path}:${navigation.errorText}`); await loaded;
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts ? document.fonts.ready.then(() => true) : true', awaitPromise: true, returnByValue: true });
    if (capture.path === '/') await waitForExpression(cdp, `document.querySelector('.clervo-home-hero')?.getAttribute('data-state') === 'prove'`, 'home_prove', 6_000);
    await sleep(160);
    const walkthrough = capture.path === '/start' && capture.width === 1600 ? await runStartWalkthrough(cdp) : null;
    await cdp.send('Runtime.evaluate', { expression: 'scrollTo(0,0)' });
    const mobileMenu = await inspectMobileMenu(cdp, capture.width);
    const diagnostics = await inspectPage(cdp, capture);
    const screenshot = path.join(captures, `${capture.id}.png`);
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    await writeFile(screenshot, Buffer.from(image.data, 'base64'));
    const layout = await cdp.send('Page.getLayoutMetrics');
    const contentSize = layout.cssContentSize ?? layout.contentSize;
    const full = path.join(captures, `${capture.id}--full.png`);
    const fullImage = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width: contentSize.width, height: contentSize.height, scale: 1 } });
    await writeFile(full, Buffer.from(fullImage.data, 'base64'));
    results.push({ ...capture, ...diagnostics, walkthrough, mobileMenu, consoleErrors: [...new Set(consoleErrors)], pageErrors: [...new Set(pageErrors)], screenshot: path.relative(root, screenshot), fullScreenshot: path.relative(root, full) });
  }

  // Reduced-motion is a separate behavioural contract: no entrance dependency
  // and no perpetual mobile brand marquee.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false, screenWidth: 390, screenHeight: 844 });
  await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const reducedLoaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${webPort}/` }); await reducedLoaded; await sleep(250);
  const reducedMotion = (await cdp.send('Runtime.evaluate', { expression: `(() => ({state:document.querySelector('.clervo-home-hero')?.getAttribute('data-state'),brandAnimation:getComputedStyle(document.querySelector('.clervo-home-hero__ecosystem')).animationName}))()`, returnByValue: true })).result.value;
  results.push({ id: 'home-reduced-motion', path: '/', width: 390, height: 844, reducedMotion });
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
for (const { route, status } of routeHttp) {
  if (route === '/definitely-not-a-clervo-route/' ? status !== 404 : status !== 200) issues.push(`http:${route}:${status}`);
}
for (const item of results) {
  if (item.id === 'home-reduced-motion') {
    if (item.reducedMotion?.state !== 'prove') issues.push(`reduced_motion:home_not_proved:${item.reducedMotion?.state ?? 'missing'}`);
    if (item.reducedMotion?.brandAnimation !== 'none') issues.push(`reduced_motion:brand_loop_active:${item.reducedMotion?.brandAnimation ?? 'missing'}`);
    continue;
  }
  for (const error of item.consoleErrors) issues.push(`${item.id}:console:${error}`);
  for (const error of item.pageErrors) issues.push(`${item.id}:page:${error}`);
  if (item.scrollWidth > item.clientWidth + 1) issues.push(`${item.id}:horizontal_overflow:${item.scrollWidth}/${item.clientWidth}`);
  if (item.h1Count !== 1) issues.push(`${item.id}:h1_count:${item.h1Count}`);
  if (!item.title.endsWith('— Clervo')) issues.push(`${item.id}:title:${item.title}`);
  if (item.description.length < 20) issues.push(`${item.id}:description_missing`);
  if (!item.canonical.startsWith('https://clervo.dev/')) issues.push(`${item.id}:canonical_missing:${item.canonical}`);
  if (item.ogTitle.length < 3 || item.twitterTitle.length < 3) issues.push(`${item.id}:social_meta_missing`);
  if (!item.routeJsonLdValid) issues.push(`${item.id}:route_jsonld_invalid`);
  if (!item.footer) issues.push(`${item.id}:footer_missing`);
  for (const src of item.failedImages) issues.push(`${item.id}:failed_image:${src}`);
  for (const label of item.controlsTooSmall) issues.push(`${item.id}:control_below_44px:${label}`);
  for (const label of item.controlsOutside) issues.push(`${item.id}:control_outside_viewport:${label}`);
  for (const label of item.positionedOutside) issues.push(`${item.id}:fixed_or_sticky_outside:${label}`);
  if (item.path === '/' && item.homeState !== 'prove') issues.push(`${item.id}:home_not_proved:${item.homeState ?? 'missing'}`);
  if (item.path === '/' && item.width <= 900 && item.homeMarqueeAnimation !== 'clervo-hero-brand-loop') issues.push(`${item.id}:mobile_brand_loop_missing:${item.homeMarqueeAnimation ?? 'missing'}`);
  if (item.path === '/products/rpc' && !item.rpcUnavailable) issues.push(`${item.id}:rpc_unavailable_truth_missing`);
  if (item.mobileMenu !== null) {
    if (!item.mobileMenu.present || !item.mobileMenu.contained || item.mobileMenu.count < 8) issues.push(`${item.id}:mobile_menu_invalid`);
    for (const label of item.mobileMenu.tooSmall ?? []) issues.push(`${item.id}:mobile_menu_target_below_44px:${label}`);
    for (const label of item.mobileMenu.outside ?? []) issues.push(`${item.id}:mobile_menu_target_outside:${label}`);
  }
  if (item.walkthrough && item.walkthrough.visited.length !== item.walkthrough.available.length) issues.push(`${item.id}:start_walkthrough_incomplete:${item.walkthrough.visited.join(',')}/${item.walkthrough.available.join(',')}`);
}

const report = { generatedAt: new Date().toISOString(), build, chrome: browser?.executable ?? null, routeHttp, results, issues };
await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(out, 'summary.md'), [
  '# Clervo full-site recovery QA', '',
  `- Build: ${build.exitCode === 0 ? 'PASS' : 'FAIL'}`,
  `- Static routes checked: ${routeHttp.length - 1}`,
  `- Browser captures: ${matrix.length}`,
  `- Issues: ${issues.length}`,
  '',
  ...(issues.length ? ['## Issues', '', ...issues.map((issue) => `- ${issue}`)] : ['PASS: no recovery QA issues found.']),
  '',
].join('\n'));

if (issues.length) throw new Error(`full_site_recovery_qa_failed:${issues.length}`);
console.log(`full-site recovery QA: PASS (${routeHttp.length - 1} routes, ${matrix.length} browser captures, setup walkthrough, reduced motion)`);
