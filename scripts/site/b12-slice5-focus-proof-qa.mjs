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
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      const info = await stat(file).catch(() => null);
      if (info?.isDirectory() || (info === null && path.extname(file) === '')) file = path.join(file, 'index.html');
      const body = await readFile(file);
      response.writeHead(200, { 'cache-control': 'no-store', 'content-type': path.extname(file) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
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
  constructor(url) { this.ws = new WebSocket(url); this.id = 1; this.pending = new Map(); }
  async open() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('cdp_open_timeout')), 8_000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('cdp_socket_error')); }, { once: true });
    });
    this.ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id); if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result ?? {});
    });
  }
  send(method, params = {}) { const id = this.id++; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  close() { this.ws.close(); }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails !== undefined) throw new Error(`evaluate_exception:${result.exceptionDetails.text}`);
  return result.result?.value;
}

async function waitFor(cdp, expression, code) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(cdp, expression) === true) return;
    await sleep(50);
  }
  throw new Error(`${code}_timeout`);
}

const port = await freePort();
const debugPort = await freePort();
const server = await serve(port);
const profile = await mkdtemp(path.join(os.tmpdir(), 'clervo-s5-focus-'));
const chromePath = await findChrome();
const child = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let cdp;
try {
  let page;
  for (let attempt = 0; attempt < 100 && page === undefined; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) page = (await response.json()).find(({ type }) => type === 'page');
    } catch { /* retry */ }
    if (page === undefined) await sleep(100);
  }
  assert(page?.webSocketDebuggerUrl, 'chrome_page_target_missing');
  cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/operations/search.web/` });
  await waitFor(cdp, `document.querySelector('.b12-operation')?.dataset.operationId === 'search.web'`, 'operation_route');
  await sleep(150);

  const focusTrail = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await sleep(20);
    const current = await evaluate(cdp, `(() => { const el=document.activeElement; if (!(el instanceof HTMLElement)) return null; const s=getComputedStyle(el); return {tag:el.tagName,label:(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,80),inOperation:Boolean(el.closest('.b12-operation')),outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineColor:s.outlineColor}; })()`);
    if (current !== null) focusTrail.push(current);
    if (current?.inOperation && current.outlineStyle !== 'none' && current.outlineWidth !== '0px') break;
  }
  const focusedOperationControl = focusTrail.find((entry) => entry.inOperation && entry.outlineStyle !== 'none' && entry.outlineWidth !== '0px') ?? null;
  assert(focusedOperationControl !== null, 'keyboard_focus_visible_missing');

  await evaluate(cdp, `document.querySelector('#s5-proof')?.scrollIntoView({block:'center',behavior:'instant'})`);
  await sleep(120);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await mkdir(captures, { recursive: true });
  const screenshot = path.join(captures, 'operation-search-web-390-proof.png');
  await writeFile(screenshot, Buffer.from(shot.data, 'base64'));

  const proof = await evaluate(cdp, `(() => { const earned=document.querySelector('.s5-proof-panel.earned'); if (!(earned instanceof HTMLElement)) return null; const title=earned.querySelector('h3'); return {text:earned.textContent?.replace(/\s+/g,' ').trim().slice(0,240),titleColor:title?getComputedStyle(title).color:null,contained:earned.getBoundingClientRect().left>=-1&&earned.getBoundingClientRect().right<=document.documentElement.clientWidth+1}; })()`);
  assert(proof !== null && proof.contained, 'mobile_proof_not_contained');
  assert(proof.titleColor === 'rgb(255, 200, 0)', 'mobile_proof_gold_missing');

  await writeFile(path.join(out, 'focus-proof.json'), `${JSON.stringify({ focusTrail, focusedOperationControl, mobileProof: proof, screenshot: path.relative(root, screenshot) }, null, 2)}\n`);
  console.log('B12 Slice 5 keyboard focus + mobile proof: PASS');
} finally {
  cdp?.close();
  server.close();
  child.kill('SIGTERM');
  await sleep(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
