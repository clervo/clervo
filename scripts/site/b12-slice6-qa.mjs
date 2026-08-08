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
const out = path.join(root, 'apps/site/qa-artifacts/slice6');
const captures = path.join(out, 'captures');
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pages = ['pricing', 'proof', 'docs', 'status', 'security', 'benchmarks', 'changelog', 'legal'];
const sizes = [
  { label: '1600', width: 1600, height: 900 },
  { label: '1024', width: 1024, height: 768 },
  { label: '390', width: 390, height: 844 },
  { label: '320', width: 320, height: 700 },
];
const matrix = [];
for (const size of sizes) for (const page of pages) matrix.push({ id: `${page}-${size.label}-hero`, page, ...size, target: '.s6-hero', action: null });
matrix.push(
  { id: 'pricing-1600-quote', page: 'pricing', width: 1600, height: 900, target: '.s6-quote-shell', action: 'pricing-approved' },
  { id: 'proof-1600-owner-proof', page: 'proof', width: 1600, height: 900, target: '.s6-proof-layout', action: 'proof-owner' },
  { id: 'pricing-390-approved', page: 'pricing', width: 390, height: 844, target: '.s6-quote-shell', action: 'pricing-approved' },
  { id: 'pricing-320-refused', page: 'pricing', width: 320, height: 700, target: '.s6-quote-shell', action: 'pricing-refused' },
  { id: 'proof-390-owner-proof', page: 'proof', width: 390, height: 844, target: '.s6-proof-layout', action: 'proof-owner' },
  { id: 'proof-390-unproven', page: 'proof', width: 390, height: 844, target: '.s6-proof-layout', action: 'proof-unproven' },
  { id: 'docs-390-provider-unbound', page: 'docs', width: 390, height: 844, target: '.s6-docs-shell', action: 'docs-provider' },
  { id: 'status-390-unbound', page: 'status', width: 390, height: 844, target: '.s6-two-col', action: null },
  { id: 'security-390-controls', page: 'security', width: 390, height: 844, target: '.s6-control-grid', action: null },
  { id: 'benchmarks-390-empty', page: 'benchmarks', width: 390, height: 844, target: '.s6-benchmark-shell', action: null },
  { id: 'changelog-390-records', page: 'changelog', width: 390, height: 844, target: '.s6-changelog-list', action: null },
  { id: 'legal-390-payments', page: 'legal', width: 390, height: 844, target: '.s6-legal-shell', action: 'legal-payments' },
);

const mime = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.yaml': 'application/yaml; charset=utf-8',
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
      let info = await stat(file).catch(() => null);
      if (info?.isDirectory() || (info === null && path.extname(file) === '')) file = path.join(file, 'index.html');
      info = await stat(file).catch(() => null);
      if (info === null) throw new Error('not_found');
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
  for (const candidate of [process.env.CHROME_PATH, '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)) {
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
        const call = this.pending.get(message.id); if (!call) return;
        this.pending.delete(message.id);
        message.error ? call.reject(new Error(`${call.method}:${message.error.message}`)) : call.resolve(message.result ?? {});
      } else for (const callback of this.events.get(message.method) ?? []) callback(message.params ?? {});
    });
  }
  send(method, params = {}) { const id = this.id++; return new Promise((resolve, reject) => { this.pending.set(id, { method, resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  on(method, callback) { const list = this.events.get(method) ?? []; list.push(callback); this.events.set(method, list); return () => this.events.set(method, (this.events.get(method) ?? []).filter((item) => item !== callback)); }
  close() { this.ws.close(); }
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails !== undefined) throw new Error(`evaluate_exception:${response.exceptionDetails.text}`);
  return response.result?.value;
}

async function waitFor(cdp, expression, code, timeout = 8_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(cdp, expression) === true) return;
    await sleep(50);
  }
  throw new Error(`${code}_timeout`);
}

async function launchChrome(port, profile) {
  const executable = await findChrome();
  const child = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--mute-audio', '--no-first-run', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let page;
  for (let attempt = 0; attempt < 150 && page === undefined; attempt += 1) {
    try { const response = await fetch(`http://127.0.0.1:${port}/json/list`); if (response.ok) page = (await response.json()).find(({ type }) => type === 'page'); } catch { /* retry */ }
    if (page === undefined) await sleep(100);
  }
  assert(page?.webSocketDebuggerUrl, 'chrome_page_target_missing');
  return { child, executable, ws: page.webSocketDebuggerUrl };
}

async function screenshot(cdp, file) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(file, Buffer.from(shot.data, 'base64'));
}

async function clickByText(cdp, selector, text) {
  const ok = await evaluate(cdp, `(() => { const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find((node)=>node.textContent?.trim().includes(${JSON.stringify(text)})); if (!(el instanceof HTMLElement)) return false; el.click(); return true; })()`);
  assert(ok, `click_missing:${text}`);
  await sleep(80);
}

async function applyAction(cdp, action) {
  if (action === 'pricing-approved') await clickByText(cdp, '.s6-quote-card button', 'Preview approval boundary');
  if (action === 'pricing-refused') await clickByText(cdp, '.s6-quote-card button', 'Preview refusal');
  if (action === 'proof-owner') await clickByText(cdp, '.s6-proof-menu button', 'Private owner-funded proof');
  if (action === 'proof-unproven') await clickByText(cdp, '.s6-proof-menu button', 'Unproven claims');
  if (action === 'docs-provider') await clickByText(cdp, '.s6-objective-grid button', 'Publish a provider');
  if (action === 'legal-payments') await clickByText(cdp, '.s6-legal-menu button', 'Payments');
}

async function inspectMobileMenu(cdp, width) {
  if (width > 900) return null;
  const opened = await evaluate(cdp, `(() => { const button=document.querySelector('.site-header__menu'); if (!(button instanceof HTMLButtonElement) || getComputedStyle(button).display==='none') return false; button.click(); return true; })()`);
  if (!opened) return { present: false, contained: false, controlsContained: false, tooSmall: ['menu trigger missing'] };
  await waitFor(cdp, `document.querySelector('.mobile-nav')?.classList.contains('is-open')===true && document.querySelector('.mobile-nav')?.hidden===false`, 'mobile_menu_open');
  const audit = await evaluate(cdp, `(() => { const panel=document.querySelector('.mobile-nav__panel'); if (!(panel instanceof HTMLElement)) return null; const w=document.documentElement.clientWidth,h=document.documentElement.clientHeight,r=panel.getBoundingClientRect(); const controls=[...panel.querySelectorAll('a[href],button')].filter((el)=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&b.width>0&&b.height>0}).map((el)=>{const b=el.getBoundingClientRect();return {label:(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,70),width:b.width,height:b.height,contained:b.left>=-1&&b.right<=w+1&&b.top>=-1&&b.bottom<=h+1};}); return {present:true,contained:r.left>=-1&&r.right<=w+1&&r.top>=-1&&r.bottom<=h+1,controlsContained:controls.every((x)=>x.contained),tooSmall:controls.filter((x)=>x.width<44||x.height<44).map((x)=>x.label)}; })()`);
  await evaluate(cdp, `(() => { const button=document.querySelector('.mobile-nav__close'); if (button instanceof HTMLButtonElement) {button.click(); return true;} return false; })()`);
  await sleep(60);
  return audit;
}

async function keyboardFocusAudit(cdp) {
  await evaluate(cdp, `document.activeElement instanceof HTMLElement && document.activeElement.blur()`);
  const trail = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await sleep(15);
    const item = await evaluate(cdp, `(() => { const el=document.activeElement; if (!(el instanceof HTMLElement)) return null; const s=getComputedStyle(el); return {label:(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,80),inside:Boolean(el.closest('.b12-trust-support')),outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineColor:s.outlineColor}; })()`);
    if (item) trail.push(item);
    if (item?.inside && item.outlineStyle !== 'none' && item.outlineWidth !== '0px') return { pass: true, focused: item, trail };
  }
  return { pass: false, focused: null, trail };
}

async function pageAudit(cdp, page, width) {
  return evaluate(cdp, `(() => {
    const w=document.documentElement.clientWidth;
    const root=document.querySelector('.b12-trust-support');
    const visible=(el)=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
    const important=[...document.querySelectorAll('.s6-hero__grid,.s6-section-head,.s6-principles,.s6-ledger,.s6-quote-shell,.s6-proof-layout,.s6-objective-grid,.s6-docs-shell,.s6-status-strip,.s6-health-ledger,.s6-control-grid,.s6-security-ledger,.s6-benchmark-shell,.s6-changelog-list,.s6-legal-shell,.site-footer')].filter(visible).map((el)=>{const r=el.getBoundingClientRect();return {name:el.className,left:r.left,right:r.right,width:r.width,contained:r.left>=-1&&r.right<=w+1};});
    const controls=[...document.querySelectorAll('.s6-subnav a,.s6-button,.s6-proof-menu button,.s6-objective-grid button,.s6-docs-tree a,.s6-benchmark-menu button,.s6-legal-menu button,.s6-quote-card button,.s6-quote-copy select')].filter(visible).map((el)=>{const r=el.getBoundingClientRect();return {label:(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,80),width:r.width,height:r.height,contained:r.left>=-1&&r.right<=w+1};});
    const gold='rgb(255, 200, 0)'; const red='rgb(255, 59, 48)'; const cyan='rgb(0, 229, 255)';
    const semantic=[...document.querySelectorAll('.b12-trust-support .s6-state')].filter(visible).map((el)=>({text:el.textContent?.trim(),color:getComputedStyle(el).color,dot:getComputedStyle(el,'::before').backgroundColor,insideVerified:Boolean(el.closest('[data-proof="verified"]'))}));
    const illegalGold=semantic.filter((x)=>((x.color===gold||x.dot===gold)&&!x.insideVerified));
    const text=(root?.textContent||'').replace(/\s+/g,' ');
    const currentPage=root?.dataset.supportPage;
    const truth={
      pricing: currentPage!=='pricing'||(text.includes('Design fixture')&&text.includes('No wallet, payment, settlement, or receipt action occurs')&&text.includes('Customer revenue evidence')),
      proof: currentPage!=='proof'||(text.includes('owner-funded private proof')&&text.includes('does not establish customer revenue or demand')),
      docs: currentPage!=='docs'||(text.includes('Provider publication contract: not publicly bound')||text.includes('Set up Clervo using https://clervo.dev/skill.md')),
      status: currentPage!=='status'||text.includes('No canonical incident/history feed'),
      security: currentPage!=='security'||(text.includes('No SOC 2')&&text.includes('Independent certification')),
      benchmarks: currentPage!=='benchmarks'||(text.includes('No public measured benchmark record is bound')&&text.includes('No superiority number is published')),
      changelog: currentPage!=='changelog'||text.includes('Customer revenue and demand remain unproven'),
      legal: currentPage!=='legal'||(text.includes('Not final legal terms')&&text.includes('No legal entity')),
    };
    return {
      page: ${JSON.stringify(page)}, width: ${JSON.stringify(width)}, root:Boolean(root), header:Boolean(document.querySelector('.site-header')), footer:Boolean(document.querySelector('.site-footer')),
      horizontalOverflow:document.documentElement.scrollWidth>w+1, clipped:important.filter((x)=>!x.contained), tooSmall:controls.filter((x)=>x.width<44||x.height<44), controlsOutside:controls.filter((x)=>!x.contained),
      semantic, illegalGold, colors:{gold,red,cyan}, truth, title:document.title,
    };
  })()`);
}

await mkdir(captures, { recursive: true });
const webPort = await freePort();
const debugPort = await freePort();
const server = await serve(webPort);
const profile = await mkdtemp(path.join(os.tmpdir(), 'clervo-s6-chrome-'));
const chrome = await launchChrome(debugPort, profile);
const cdp = new Cdp(chrome.ws);
const report = { head: process.env.GITHUB_SHA ?? null, cases: [], issues: [], reducedMotion: null, routeAudit: [] };
let currentErrors = [];

try {
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => currentErrors.push(`page:${exceptionDetails?.text ?? 'exception'}`));
  cdp.on('Runtime.consoleAPICalled', ({ type, args }) => { if (type === 'error') currentErrors.push(`console:${args?.map((arg)=>arg.value ?? arg.description ?? '').join(' ').slice(0,240)}`); });

  for (const item of matrix) {
    currentErrors = [];
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: item.width, height: item.height, deviceScaleFactor: 1, mobile: item.width <= 700 });
    await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${webPort}/${item.page}/` });
    await waitFor(cdp, `document.querySelector('.b12-trust-support')?.dataset.supportPage===${JSON.stringify(item.page)} && Boolean(document.querySelector('.site-header'))`, `route:${item.id}`);
    await sleep(120);
    const menu = await inspectMobileMenu(cdp, item.width);
    if (item.action) await applyAction(cdp, item.action);
    if (item.target) {
      await evaluate(cdp, `(() => { const el=document.querySelector(${JSON.stringify(item.target)}); if (!(el instanceof HTMLElement)) return false; el.scrollIntoView({block:${JSON.stringify(item.target === '.s6-hero' ? 'start' : 'center')},behavior:'instant'}); return true; })()`);
      await sleep(100);
    }
    const audit = await pageAudit(cdp, item.page, item.width);
    const focus = item.width === 390 && item.id.endsWith('-hero') ? await keyboardFocusAudit(cdp) : null;
    const file = path.join(captures, `${item.id}.png`);
    await screenshot(cdp, file);
    const result = { ...item, screenshot: path.relative(root, file), audit, mobileMenu: menu, keyboardFocus: focus, errors: [...currentErrors] };
    report.cases.push(result);
    if (!audit.root || !audit.header || !audit.footer) report.issues.push(`${item.id}:shell_missing`);
    if (audit.horizontalOverflow) report.issues.push(`${item.id}:horizontal_overflow`);
    if (audit.clipped.length) report.issues.push(`${item.id}:clipped:${audit.clipped.map((x)=>x.name).join('|')}`);
    if (audit.tooSmall.length) report.issues.push(`${item.id}:targets:${audit.tooSmall.map((x)=>x.label).join('|')}`);
    if (audit.controlsOutside.length) report.issues.push(`${item.id}:controls_outside`);
    if (audit.illegalGold.length) report.issues.push(`${item.id}:gold_outside_verified:${audit.illegalGold.map((x)=>x.text).join('|')}`);
    if (Object.values(audit.truth).some((value)=>value===false)) report.issues.push(`${item.id}:truth_label_missing`);
    if (currentErrors.length) report.issues.push(`${item.id}:errors:${currentErrors.join('|')}`);
    if (menu && (!menu.present || !menu.contained || !menu.controlsContained || menu.tooSmall.length)) report.issues.push(`${item.id}:mobile_menu`);
    if (focus && !focus.pass) report.issues.push(`${item.id}:keyboard_focus`);
  }

  for (const page of pages) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${webPort}/${page}/` });
    await waitFor(cdp, `document.querySelector('.b12-trust-support')?.dataset.supportPage===${JSON.stringify(page)}`, `route_audit:${page}`);
    const reached = await evaluate(cdp, `Boolean(document.querySelector('.site-header')&&document.querySelector('.site-footer')&&document.querySelector('.s6-subnav'))`);
    if (!reached) report.issues.push(`route_audit:${page}:shared_shell_missing`);
    report.routeAudit.push(page);
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${webPort}/pricing/` });
  await waitFor(cdp, `document.querySelector('.b12-trust-support')?.dataset.supportPage==='pricing'`, 'reduced_route');
  report.reducedMotion = await evaluate(cdp, `(() => { const nodes=[...document.querySelectorAll('.b12-trust-support *')]; const durations=nodes.map((el)=>({t:getComputedStyle(el).transitionDuration,a:getComputedStyle(el).animationDuration})); const max=(value)=>Math.max(0,...String(value).split(',').map((x)=>parseFloat(x)||0)); return {matches:matchMedia('(prefers-reduced-motion: reduce)').matches,maxTransition:Math.max(...durations.map((x)=>max(x.t))),maxAnimation:Math.max(...durations.map((x)=>max(x.a)))}; })()`);
  if (!report.reducedMotion.matches || report.reducedMotion.maxTransition > 0.0011 || report.reducedMotion.maxAnimation > 0.0011) report.issues.push('reduced_motion');

  await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(out, 'summary.md'), `# B12 Slice 6 integrated QA\n\n- Head: ${report.head}\n- Viewport captures: ${report.cases.length}\n- Routes audited: ${report.routeAudit.length}\n- Technical issues: ${report.issues.length}\n\n${report.issues.map((issue)=>`- ${issue}`).join('\n') || 'PASS'}\n`);
  assert(report.issues.length === 0, `slice6_qa_failed:${report.issues.join(',')}`);
  console.log(`B12 Slice 6 QA: PASS (${report.cases.length} viewport captures + ${report.routeAudit.length} routes)`);
} finally {
  cdp.close();
  server.close();
  chrome.child.kill('SIGTERM');
  await sleep(350);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
