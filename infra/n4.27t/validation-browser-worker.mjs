#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { validateBrowserResponse, validateBrowserTarget } from '../n4.27r/browser-boundary.mjs';
import { frozenPolicyDigest, validateBrowserRuntimePolicy } from './browser-runtime.mjs';

const exec = promisify(execFile);
const policy = validateBrowserRuntimePolicy();
const target = process.env.CLERVO_N427T_TARGET_URL ?? '';
const proxy = process.env.CLERVO_N427T_GATEWAY ?? '';
const marker = process.env.CLERVO_N427T_EXPECTED_MARKER ?? '';
const mode = process.env.CLERVO_N427T_MARKER_MODE ?? '';
const implementationDigest = process.env.CLERVO_N427T_IMPLEMENTATION_DIGEST ?? '';
const expectedPolicyDigest = process.env.CLERVO_N427T_POLICY_DIGEST ?? '';
const fixtureSpki = process.env.CLERVO_N427T_FIXTURE_SPKI_SHA256 ?? '';

const targetUrl = validateBrowserTarget(target);
const proxyUrl = new URL(proxy);
if (
  targetUrl.hostname !== 'fixtures.clervo.invalid'
  || proxyUrl.href !== 'http://127.0.0.1:18080/'
  || !/^[A-Za-z0-9+/]{43}=$/u.test(fixtureSpki)
  || !/^sha256:[a-f0-9]{64}$/u.test(implementationDigest)
  || expectedPolicyDigest !== frozenPolicyDigest()
  || marker.length < 8
  || !['body', 'hostile_evidence'].includes(mode)
) throw new Error('validation_browser_runtime_attestation_required');

const stateRoot = await mkdtemp(path.join(tmpdir(), 'clervo-n427t-validation-browser-'));
const profile = path.join(stateRoot, 'profile');
await mkdir(path.join(stateRoot, '.config/chromium/Crash Reports'), { recursive: true });
const started = performance.now();
let chromiumChild;

async function profileProcesses() {
  const matches = [];
  for (const pid of (await readdir('/proc')).filter((entry) => /^\d+$/u.test(entry))) {
    try { if ((await readFile(`/proc/${pid}/cmdline`, 'utf8')).includes(stateRoot)) matches.push(Number(pid)); } catch {}
  }
  return matches;
}
function signalGroup(signal) { try { if (chromiumChild?.pid !== undefined) process.kill(-chromiumChild.pid, signal); } catch {} }
async function cleanup() {
  signalGroup('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, Math.min(250, policy.cleanupTimeoutMs)));
  signalGroup('SIGKILL');
  for (const pid of await profileProcesses()) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  await rm(stateRoot, { recursive: true, force: true });
}
function render() {
  const args = [
    '--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-component-update',
    '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only',
    '--no-first-run', '--disable-crash-reporter', '--noerrdialogs', '--disable-notifications',
    '--disable-popup-blocking', '--disable-features=DownloadBubble,OptimizationHints,MediaRouter,Translate',
    '--disable-service-worker', '--no-pings', '--incognito', `--user-data-dir=${profile}`,
    `--proxy-server=${proxy}`, '--proxy-bypass-list=<-loopback>',
    `--ignore-certificate-errors-spki-list=${fixtureSpki}`, '--virtual-time-budget=1500', '--dump-dom', targetUrl.href,
  ];
  return new Promise((resolve, reject) => {
    chromiumChild = spawn('/usr/bin/chromium', args, {
      detached: true,
      env: { ...process.env, HOME: stateRoot, XDG_CONFIG_HOME: `${stateRoot}/config`, XDG_CACHE_HOME: `${stateRoot}/cache` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = []; let bytes = 0; let settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error === undefined ? resolve(value) : reject(error); };
    chromiumChild.stdout.on('data', (chunk) => { bytes += chunk.length; if (bytes <= policy.maximumRenderedBytes) stdout.push(chunk); });
    chromiumChild.stderr.resume();
    const timer = setTimeout(() => { signalGroup('SIGKILL'); finish(new Error('browser_render_deadline_exceeded')); }, policy.renderTimeoutMs);
    chromiumChild.once('error', (error) => finish(error));
    chromiumChild.once('exit', (code, signal) => code === 0 && bytes <= policy.maximumRenderedBytes
      ? finish(undefined, Buffer.concat(stdout).toString('utf8'))
      : finish(new Error(`browser_process_failed:${code ?? signal}`)));
  });
}

let output = '';
let chromiumVersion = '';
try {
  chromiumVersion = (await exec('/usr/bin/chromium', ['--version'], { timeout: policy.preflightTimeoutMs })).stdout.trim();
  const preflight = await exec('/usr/bin/curl', [
    '--silent', '--show-error', '--location', '--insecure', '--pinnedpubkey', `sha256//${fixtureSpki}`,
    '--max-time', String(policy.preflightTimeoutMs / 1_000), '--max-filesize', String(policy.maximumPreflightBytes),
    '--proxy', proxy, '--user-agent', 'Clervo-N4.27T-Validation/1.0 (security@clervo.dev)',
    '--output', '/dev/null', '--write-out', '%{content_type} %{size_download}', targetUrl.href,
  ], { timeout: policy.preflightTimeoutMs + 500, maxBuffer: 64 * 1024 });
  const fields = preflight.stdout.trim().split(/\s+/u);
  const size = Math.ceil(Number(fields.at(-1)));
  validateBrowserResponse({ mime: fields.slice(0, -1).join(' '), compressedBytes: size, decodedBytes: size, outputCharacters: 1 });
  output = await render();
  if (!output.includes(marker)) throw new Error('browser_expected_rendered_marker_missing');
  validateBrowserResponse({ mime: 'text/html', compressedBytes: Buffer.byteLength(output), decodedBytes: Buffer.byteLength(output), outputCharacters: output.length });
} finally { await cleanup(); }

const orphans = (await profileProcesses()).length;
if (orphans !== 0) throw new Error('browser_teardown_failed');
process.stdout.write(`${JSON.stringify({
  schemaVersion: 'clervo.n4.27t.validation-browser-receipt.v1', chromiumVersion, implementationDigest,
  policyDigest: expectedPolicyDigest, evidenceAuthority: mode === 'hostile_evidence' ? 'untrusted_evidence_only' : 'rendered_fixture_only',
  fixtureTlsPinned: true, gatewayOnly: true, runAsNonRoot: process.getuid() !== 0, browserPages: 1,
  persistentState: false, downloadsAllowed: false, cookiesOrLoginUsed: false, callerScriptsAllowed: false,
  durationMs: Number((performance.now() - started).toFixed(3)), outputSha256: `sha256:${createHash('sha256').update(output).digest('hex')}`,
  outputReturned: false, stateRemoved: true, orphanCountAfterTeardown: orphans, payloadLogged: false,
})}\n`);
