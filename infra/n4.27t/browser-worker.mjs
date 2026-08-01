#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { validateBrowserResponse, validateBrowserTarget } from '../n4.27r/browser-boundary.mjs';
import { browserRuntimePolicy, frozenPolicyDigest, validateBrowserRuntimePolicy } from './browser-runtime.mjs';

const exec = promisify(execFile);
const policy = validateBrowserRuntimePolicy();
const killSwitch = process.env.CLERVO_N427T_BROWSER_KILL_SWITCH ?? 'engaged';
const target = process.env.CLERVO_N427T_TARGET_URL ?? '';
const proxy = process.env.CLERVO_N427T_GATEWAY ?? '';
const marker = process.env.CLERVO_N427T_EXPECTED_MARKER ?? '';
const mode = process.env.CLERVO_N427T_MARKER_MODE ?? 'body';
const implementationDigest = process.env.CLERVO_N427T_IMPLEMENTATION_DIGEST ?? '';
const expectedPolicyDigest = process.env.CLERVO_N427T_POLICY_DIGEST ?? '';

if (killSwitch !== 'disengaged') throw new Error('browser_kill_switch_engaged');
const targetUrl = validateBrowserTarget(target);
const proxyUrl = new URL(proxy);
if (
  proxyUrl.protocol !== 'http:'
  || proxyUrl.username
  || proxyUrl.password
  || !/^sha256:[a-f0-9]{64}$/u.test(implementationDigest)
  || expectedPolicyDigest !== frozenPolicyDigest()
  || marker.length < 8
  || !['body', 'hostile_evidence'].includes(mode)
) throw new Error('browser_runtime_attestation_required');

const stateRoot = await mkdtemp(path.join(tmpdir(), 'clervo-n427t-browser-'));
const profile = path.join(stateRoot, 'profile');
await mkdir(path.join(stateRoot, '.config/chromium/Crash Reports'), { recursive: true });
const started = performance.now();
let chromiumVersion = '';
let chromiumChild;

async function profileProcesses() {
  const matches = [];
  for (const pid of (await readdir('/proc')).filter((entry) => /^\d+$/u.test(entry))) {
    try {
      if ((await readFile(`/proc/${pid}/cmdline`, 'utf8')).includes(stateRoot)) matches.push(Number(pid));
    } catch {}
  }
  return matches;
}

function signalProcessGroup(child, signal) {
  if (child?.pid === undefined) return;
  try { process.kill(-child.pid, signal); } catch {}
}

async function terminateBrowserGroup() {
  signalProcessGroup(chromiumChild, 'SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, Math.min(250, policy.cleanupTimeoutMs)));
  signalProcessGroup(chromiumChild, 'SIGKILL');
  for (const pid of await profileProcesses()) {
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }
}

function executeChromium() {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--disable-crash-reporter',
    '--noerrdialogs',
    '--disable-notifications',
    '--disable-popup-blocking',
    '--disable-features=DownloadBubble,OptimizationHints,MediaRouter,Translate',
    '--disable-service-worker',
    '--no-pings',
    '--incognito',
    `--user-data-dir=${profile}`,
    `--proxy-server=${proxy}`,
    '--proxy-bypass-list=<-loopback>',
    '--virtual-time-budget=1500',
    '--dump-dom',
    targetUrl.href,
  ];
  return new Promise((resolve, reject) => {
    chromiumChild = spawn('/usr/bin/chromium', args, {
      detached: true,
      env: {
        ...process.env,
        HOME: stateRoot,
        XDG_CONFIG_HOME: `${stateRoot}/config`,
        XDG_CACHE_HOME: `${stateRoot}/cache`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    let outputBytes = 0;
    let settled = false;
    const settle = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error === undefined) resolve(value); else reject(error);
    };
    chromiumChild.stdout.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes <= policy.maximumRenderedBytes) stdout.push(chunk);
    });
    chromiumChild.stderr.resume();
    const timer = setTimeout(() => {
      signalProcessGroup(chromiumChild, 'SIGKILL');
      settle(new Error('browser_render_deadline_exceeded'));
    }, policy.renderTimeoutMs);
    chromiumChild.once('error', (error) => settle(error));
    chromiumChild.once('exit', (code, signal) => {
      if (code !== 0 || outputBytes > policy.maximumRenderedBytes) settle(new Error(`browser_process_failed:${code ?? signal}`));
      else settle(undefined, Buffer.concat(stdout).toString('utf8'));
    });
  });
}

let output = '';
try {
  chromiumVersion = (await exec('/usr/bin/chromium', ['--version'], { timeout: policy.preflightTimeoutMs })).stdout.trim();
  const preflight = await exec('/usr/bin/curl', [
    '--silent',
    '--show-error',
    '--location',
    '--max-time',
    String(policy.preflightTimeoutMs / 1_000),
    '--max-filesize',
    String(policy.maximumPreflightBytes),
    '--proxy',
    proxy,
    '--user-agent',
    'Clervo-N4.27T-Browser/1.0 (security@clervo.dev)',
    '--output',
    '/dev/null',
    '--write-out',
    '%{content_type} %{size_download}',
    targetUrl.href,
  ], { timeout: policy.preflightTimeoutMs + 500, maxBuffer: 64 * 1024 });
  const preflightFields = preflight.stdout.trim().split(/\s+/u);
  const sizeText = preflightFields.at(-1);
  const mime = preflightFields.slice(0, -1).join(' ');
  const preflightBytes = Math.ceil(Number(sizeText));
  validateBrowserResponse({ mime, compressedBytes: preflightBytes, decodedBytes: preflightBytes, outputCharacters: 1 });
  output = await executeChromium();
  if (!output.includes(marker)) throw new Error('browser_expected_rendered_marker_missing');
  validateBrowserResponse({
    mime: 'text/html',
    compressedBytes: Buffer.byteLength(output),
    decodedBytes: Buffer.byteLength(output),
    outputCharacters: output.length,
  });
} finally {
  await terminateBrowserGroup();
  await rm(stateRoot, { recursive: true, force: true });
}

const orphanCount = (await profileProcesses()).length;
if (orphanCount !== 0) throw new Error('browser_teardown_failed');
process.stdout.write(`${JSON.stringify({
  schemaVersion: 'clervo.n4.27t.browser-worker-receipt.v1',
  workerId: 'worker_chromium_n427t',
  chromiumVersion,
  implementationDigest,
  policyDigest: expectedPolicyDigest,
  evidenceAuthority: mode === 'hostile_evidence' ? 'untrusted_evidence_only' : 'rendered_fixture_only',
  targetScheme: 'https',
  targetHost: targetUrl.hostname,
  gatewayOnly: true,
  connectedAddressValidation: true,
  runAsNonRoot: process.getuid() !== 0,
  uid: process.getuid(),
  browserPages: 1,
  persistentState: false,
  downloadsAllowed: false,
  cookiesOrLoginUsed: false,
  callerScriptsAllowed: false,
  stealthAllowed: false,
  proxyRotationAllowed: false,
  durationMs: Number((performance.now() - started).toFixed(3)),
  outputCharacters: output.length,
  outputSha256: `sha256:${createHash('sha256').update(output).digest('hex')}`,
  outputReturned: false,
  stateRemoved: true,
  orphanCountAfterTeardown: orphanCount,
  payloadLogged: false,
})}\n`);
