#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { chown, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateBrowserResponse, validateBrowserTarget } from './browser-boundary.mjs';

const killSwitch = process.env.CLERVO_N427R_BROWSER_KILL_SWITCH ?? 'engaged';
if (killSwitch !== 'disengaged') throw new Error('browser_kill_switch_engaged');
const target = process.env.CLERVO_N427R_TARGET_URL ?? '';
const proxy = process.env.CLERVO_N427R_GATEWAY ?? '';
const marker = process.env.CLERVO_N427R_EXPECTED_MARKER ?? '';
const certificateSpki = process.env.CLERVO_N427R_CERTIFICATE_SPKI ?? '';
const implementationDigest = process.env.CLERVO_N427R_IMPLEMENTATION_DIGEST ?? '';
const targetUrl = validateBrowserTarget(target);
if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(proxy) || !/^[A-Za-z0-9+/=]{40,64}$/u.test(certificateSpki) || marker.length < 8 || !/^sha256:[a-f0-9]{64}$/u.test(implementationDigest)) throw new Error('browser_runtime_attestation_required');

const stateRoot = await mkdtemp(path.join(tmpdir(), 'clervo-n427r-browser-'));
await chown(stateRoot, 65534, 65534);
const profile = path.join(stateRoot, 'profile');
const started = performance.now();
const command = '/usr/sbin/runuser';
const args = ['-u','nobody','--','env',`HOME=${stateRoot}`,`XDG_CONFIG_HOME=${stateRoot}/config`,`XDG_CACHE_HOME=${stateRoot}/cache`,
  '/usr/bin/chromium','--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-extensions','--disable-sync','--metrics-recording-only','--no-first-run','--disable-crash-reporter','--noerrdialogs','--disable-notifications','--disable-popup-blocking','--disable-features=DownloadBubble,OptimizationHints,MediaRouter,Translate','--disable-service-worker','--no-pings','--incognito',`--user-data-dir=${profile}`,`--proxy-server=${proxy}`,'--proxy-bypass-list=<-loopback>',`--ignore-certificate-errors-spki-list=${certificateSpki}`,'--virtual-time-budget=1200','--dump-dom',targetUrl.href];

function execute() {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: ['ignore','pipe','pipe'] });
    const stdout = [];
    let outputBytes = 0;
    child.stdout.on('data', (chunk) => { outputBytes += chunk.length; if (outputBytes <= 2_097_152) stdout.push(chunk); });
    child.stderr.resume();
    const timeout = setTimeout(() => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 200).unref(); reject(new Error('browser_deadline_exceeded')); }, 5_500);
    child.once('error', reject);
    child.once('exit', (code, signal) => { clearTimeout(timeout); if (code !== 0) reject(new Error(`browser_process_failed:${code ?? signal}`)); else resolve(Buffer.concat(stdout).toString('utf8')); });
  });
}

async function profileProcesses() {
  const pids = (await readdir('/proc')).filter((entry) => /^\d+$/u.test(entry));
  const matches = [];
  for (const pid of pids) {
    try { if ((await readFile(`/proc/${pid}/cmdline`, 'utf8')).includes(stateRoot)) matches.push(Number(pid)); } catch {}
  }
  return matches;
}

let output = '';
try {
  output = await execute();
  if (!output.includes(marker)) throw new Error('browser_expected_marker_missing');
  validateBrowserResponse({ mime: 'text/html', compressedBytes: Buffer.byteLength(output), decodedBytes: Buffer.byteLength(output), outputCharacters: output.length });
} finally {
  for (const pid of await profileProcesses()) { try { process.kill(pid, 'SIGTERM'); } catch {} }
  await new Promise((resolve) => setTimeout(resolve, 100));
  for (const pid of await profileProcesses()) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  await rm(stateRoot, { recursive: true, force: true });
}
const orphanCount = (await profileProcesses()).length;
if (orphanCount !== 0) throw new Error('browser_teardown_failed');
const receipt = { schemaVersion: 'clervo.n4.27r.browser-worker-receipt.v1', workerId: 'worker_chromium_150_n427r', chromiumVersion: '150.0.7871.181', implementationDigest, targetScheme: 'https', gatewayOnly: true, runAsNonRoot: true, uid: 65534, browserPages: 1, persistentState: false, downloadsAllowed: false, cookiesOrLoginUsed: false, callerScriptsAllowed: false, stealthAllowed: false, proxyRotationAllowed: false, durationMs: Number((performance.now() - started).toFixed(3)), outputCharacters: output.length, outputSha256: `sha256:${createHash('sha256').update(output).digest('hex')}`, stateRemoved: true, orphanCountAfterTeardown: orphanCount, payloadLogged: false };
process.stdout.write(`${JSON.stringify(receipt)}\n`);
