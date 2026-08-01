#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateBrowserResponse, validateBrowserTarget } from '../n4.27r/browser-boundary.mjs';

const exec = promisify(execFile);
const killSwitch = process.env.CLERVO_N427S_BROWSER_KILL_SWITCH ?? 'engaged';
const target = process.env.CLERVO_N427S_TARGET_URL ?? '';
const proxy = process.env.CLERVO_N427S_GATEWAY ?? '';
const marker = process.env.CLERVO_N427S_EXPECTED_MARKER ?? '';
const mode = process.env.CLERVO_N427S_MARKER_MODE ?? 'body';
const implementationDigest = process.env.CLERVO_N427S_IMPLEMENTATION_DIGEST ?? '';
if (killSwitch !== 'disengaged') throw new Error('browser_kill_switch_engaged');
const targetUrl = validateBrowserTarget(target);
const proxyUrl = new URL(proxy);
if (proxyUrl.protocol !== 'http:' || proxyUrl.username || proxyUrl.password || !/^sha256:[a-f0-9]{64}$/u.test(implementationDigest) || marker.length < 3 || !['body','quote_author'].includes(mode)) throw new Error('browser_runtime_attestation_required');

const stateRoot = await mkdtemp(path.join(tmpdir(), 'clervo-n427s-browser-'));
const profile = path.join(stateRoot, 'profile');
await mkdir(path.join(stateRoot, '.config/chromium/Crash Reports'), { recursive: true });
const started = performance.now();
const chromiumVersion = (await exec('/usr/bin/chromium', ['--version'], { timeout: 2_000 })).stdout.trim();

async function profileProcesses() {
  const matches = [];
  for (const pid of (await readdir('/proc')).filter((entry) => /^\d+$/u.test(entry))) {
    try { if ((await readFile(`/proc/${pid}/cmdline`, 'utf8')).includes(stateRoot)) matches.push(Number(pid)); } catch {}
  }
  return matches;
}
function executeChromium() {
  const args = ['--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-extensions','--disable-sync','--metrics-recording-only','--no-first-run','--disable-crash-reporter','--noerrdialogs','--disable-notifications','--disable-popup-blocking','--disable-features=DownloadBubble,OptimizationHints,MediaRouter,Translate','--disable-service-worker','--no-pings','--incognito',`--user-data-dir=${profile}`,`--proxy-server=${proxy}`,'--proxy-bypass-list=<-loopback>','--virtual-time-budget=1200','--dump-dom',targetUrl.href];
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/chromium', args, { detached: true, env: { ...process.env, HOME: stateRoot, XDG_CONFIG_HOME: `${stateRoot}/config`, XDG_CACHE_HOME: `${stateRoot}/cache` }, stdio: ['ignore','pipe','pipe'] });
    const stdout = []; let outputBytes = 0;
    child.stdout.on('data', (chunk) => { outputBytes += chunk.length; if (outputBytes <= 2_097_152) stdout.push(chunk); }); child.stderr.resume();
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 200).unref(); reject(new Error('browser_deadline_exceeded')); }, 5_500);
    child.once('error', reject); child.once('exit', (code, signal) => { clearTimeout(timer); if (code !== 0 || outputBytes > 2_097_152) reject(new Error(`browser_process_failed:${code ?? signal}`)); else resolve(Buffer.concat(stdout).toString('utf8')); });
  });
}

let output = '';
try {
  const preflight = await exec('/usr/bin/curl', ['--silent','--show-error','--location','--max-time','4','--max-filesize','2097152','--proxy',proxy,'--user-agent','Clervo-N4.27S-Browser/1.0 (mo@clervo.dev)','--output','/dev/null','--write-out','%{content_type} %{size_download}',targetUrl.href], { timeout: 5_000, maxBuffer: 64 * 1024 });
  const preflightFields = preflight.stdout.trim().split(/\s+/u);
  const sizeText = preflightFields.at(-1);
  const mime = preflightFields.slice(0, -1).join(' ');
  const preflightBytes = Math.ceil(Number(sizeText));
  validateBrowserResponse({ mime, compressedBytes: preflightBytes, decodedBytes: preflightBytes, outputCharacters: 1 });
  output = await executeChromium();
  const markerPresent = mode === 'quote_author' ? new RegExp(`<small class=["']author["']>${marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}</small>`, 'u').test(output) : output.includes(marker);
  if (!markerPresent) throw new Error('browser_expected_rendered_marker_missing');
  validateBrowserResponse({ mime: 'text/html', compressedBytes: Buffer.byteLength(output), decodedBytes: Buffer.byteLength(output), outputCharacters: output.length });
} finally {
  for (const pid of await profileProcesses()) { try { process.kill(pid, 'SIGTERM'); } catch {} }
  await new Promise((resolve) => setTimeout(resolve, 100));
  for (const pid of await profileProcesses()) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  await rm(stateRoot, { recursive: true, force: true });
}
const orphanCount = (await profileProcesses()).length;
if (orphanCount !== 0) throw new Error('browser_teardown_failed');
process.stdout.write(`${JSON.stringify({ schemaVersion: 'clervo.n4.27s.browser-worker-receipt.v1', workerId: 'worker_chromium_n427s', chromiumVersion, implementationDigest, targetScheme: 'https', targetHost: targetUrl.hostname, gatewayOnly: true, connectedAddressValidation: true, runAsNonRoot: process.getuid() !== 0, uid: process.getuid(), browserPages: 1, persistentState: false, downloadsAllowed: false, cookiesOrLoginUsed: false, callerScriptsAllowed: false, stealthAllowed: false, proxyRotationAllowed: false, durationMs: Number((performance.now() - started).toFixed(3)), outputCharacters: output.length, outputSha256: `sha256:${createHash('sha256').update(output).digest('hex')}`, stateRemoved: true, orphanCountAfterTeardown: orphanCount, payloadLogged: false })}\n`);
