#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { browserRuntimePolicy, buildDevelopmentBrowserPlan, validateBrowserRuntimePolicy } from './browser-runtime.mjs';

const policy = validateBrowserRuntimePolicy();
const corpusUrl = new URL('../../benchmarks/n4.27t/development-corpus.v1.json', import.meta.url);
const corpusBytes = await readFile(corpusUrl);
const corpus = JSON.parse(corpusBytes.toString('utf8'));
const fixtureBaseUrl = process.env.CLERVO_N427T_FIXTURE_BASE_URL ?? '';
const gateway = process.env.CLERVO_N427T_GATEWAY ?? '';
const implementationDigest = process.env.CLERVO_N427T_IMPLEMENTATION_DIGEST ?? '';
if (!/^sha256:[a-f0-9]{64}$/u.test(implementationDigest)) throw new Error('browser_implementation_digest_required');
const plan = buildDevelopmentBrowserPlan(corpus, fixtureBaseUrl);
const worker = new URL('./browser-worker.mjs', import.meta.url).pathname;

function execute(item) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [worker], {
      env: {
        ...process.env,
        CLERVO_N427T_BROWSER_KILL_SWITCH: 'disengaged',
        CLERVO_N427T_TARGET_URL: item.url,
        CLERVO_N427T_GATEWAY: gateway,
        CLERVO_N427T_EXPECTED_MARKER: item.marker,
        CLERVO_N427T_MARKER_MODE: item.markerMode,
        CLERVO_N427T_IMPLEMENTATION_DIGEST: implementationDigest,
        CLERVO_N427T_POLICY_DIGEST: item.policyDigest,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish({ id: item.id, passed: false, failureCode: 'browser_supervisor_deadline' }); }, policy.supervisorTimeoutMs);
    child.once('error', () => finish({ id: item.id, passed: false, failureCode: 'browser_worker_spawn_failed' }));
    child.once('close', (code) => {
      if (code !== 0) {
        const failureCode = Buffer.concat(stderr).toString('utf8').match(/browser_[a-z0-9_:.-]+/u)?.[0] ?? 'browser_worker_failed';
        finish({ id: item.id, passed: false, failureCode });
        return;
      }
      try { finish({ id: item.id, passed: true, receipt: JSON.parse(Buffer.concat(stdout).toString('utf8')) }); }
      catch { finish({ id: item.id, passed: false, failureCode: 'browser_worker_receipt_invalid' }); }
    });
  });
}

const attempts = [];
for (const item of plan) attempts.push(await execute(item));
const passed = attempts.filter((attempt) => attempt.passed).length;
process.stdout.write(`${JSON.stringify({
  schemaVersion: 'clervo.n4.27t.browser-development-result.v1',
  corpusSha256: `sha256:${createHash('sha256').update(corpusBytes).digest('hex')}`,
  implementationDigest,
  attempts,
  passed,
  failed: attempts.length - passed,
  developmentGatePass: passed === attempts.length,
  validationExecuted: false,
})}\n`);
