import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { browserPolicyDigest, classifyBrowserTermination, stage4BrowserPolicy } from '../../infra/stage4/browser-policy.mjs';
import { createRecordedSearchExecutor } from '../../dist/services/search/src/recorded-pipeline.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import { validateStage4SourceBindings } from '../../scripts/verify-stage4-exit.mjs';

const text = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('browser termination diagnostics preserve uppercase signals without exposing stderr', () => {
  const trapped = classifyBrowserTermination({ code: null, signal: 'SIGTRAP', stderr: 'sensitive diagnostic text' });
  assert.deepEqual({ failureCode: trapped.failureCode, exitCode: trapped.exitCode, signal: trapped.signal }, { failureCode: 'browser_process_failed:signal_SIGTRAP', exitCode: null, signal: 'SIGTRAP' });
  assert.match(trapped.stderrSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(trapped), /sensitive diagnostic/u);
  assert.equal(classifyBrowserTermination({ code: 134, signal: null, stderr: '' }).failureCode, 'browser_process_failed:exit_134');
});

test('stage browser policy keeps one development smoke and one final product gate', () => {
  assert.equal(stage4BrowserPolicy.developmentJavascriptRuns, 1);
  assert.equal(stage4BrowserPolicy.developmentHostileRuns, 1);
  assert.equal(stage4BrowserPolicy.finalJavascriptRuns, 20);
  assert.equal(stage4BrowserPolicy.finalHostileRuns, 8);
  assert.ok(stage4BrowserPolicy.preflightTimeoutMs + stage4BrowserPolicy.renderTimeoutMs + stage4BrowserPolicy.cleanupTimeoutMs <= stage4BrowserPolicy.supervisorTimeoutMs);
  assert.match(browserPolicyDigest(), /^sha256:[a-f0-9]{64}$/u);
});

test('stage browser image stays nonroot and uses the bounded outer seccomp profile', async () => {
  const dockerfile = await text('infra/stage4/browser.Dockerfile');
  const worker = await text('infra/stage4/browser-worker.mjs');
  const seccomp = JSON.parse(await text('infra/stage4/chromium-seccomp.json'));
  assert.match(dockerfile, /USER 65534:65534/u);
  assert.doesNotMatch(worker, /--no-sandbox|--disable-dev-shm-usage/u);
  assert.equal(seccomp.defaultAction, 'SCMP_ACT_ALLOW');
  const denied = new Set(seccomp.syscalls.flatMap(({ names }) => names));
  for (const syscall of ['mount', 'ptrace', 'bpf', 'keyctl']) assert.ok(denied.has(syscall));
  for (const required of ['clone', 'clone3', 'unshare', 'setns']) assert.equal(denied.has(required), false);
});

test('mock-paid staging execution is restricted to an explicit loopback qualification profile', async () => {
  const main = await text('apps/api/src/staging-search-main.mjs');
  const smoke = await text('infra/stage4/commerce-smoke.mjs');
  assert.match(main, /environment !== 'stage4-private-qualification'/u);
  assert.match(main, /private_mock_commerce_boundary_invalid/u);
  assert.match(main, /allowMockPaidExecution: privateMockCommerceEnabled/u);
  assert.match(smoke, /paymentMode: 'private_mock_only'/u);
  assert.match(smoke, /realPayment: false/u);
  assert.match(smoke, /usdcSpent: 0/u);
});

test('a challenged quote remains stable when the real clock advances before authorization', async () => {
  let tick = 0;
  const server = createSearchServer({ executor: createRecordedSearchExecutor(), allowMockPaidExecution: true, now: () => new Date(Date.parse('2026-08-01T21:00:00.000Z') + tick++ * 1_000).toISOString() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address(); const origin = `http://127.0.0.1:${port}`; const key = 'stage4-dynamic-clock'; const body = { query: 'dynamic clock quote binding', synthesize: false };
    const post = (payment) => fetch(`${origin}/v1/search/paid`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key, ...(payment ? { 'x-clervo-mock-payment': Buffer.from(JSON.stringify(payment)).toString('base64') } : {}) }, body: JSON.stringify(body) });
    const challenged = await post(); assert.equal(challenged.status, 402); const { quote } = await challenged.json();
    const payment = { mode: 'mock', paymentId: 'mock:stage4-dynamic-clock', quoteId: quote.quoteId, quoteHash: quote.quoteHash, requestHash: quote.requestHash, amount: quote.maximumCharge };
    const completed = await post(payment); assert.equal(completed.status, 200); const result = await completed.json();
    assert.equal(result.receipt.quoteHash, quote.quoteHash);
  } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test('historical N4.27S outcomes remain bound without preventing later Stage 4 closure', async () => {
  const evidence = JSON.parse(await text('infra/staging/stage4-exit-evidence.json'));
  evidence.checks = evidence.checks.map((check) => ({ ...check, status: 'staging_verified', stagingVerified: true }));
  const binding = await validateStage4SourceBindings(new URL('../../', import.meta.url).pathname, evidence);
  assert.equal(binding.currentBinding.schemaVersion, 'clervo.n4.27s.stage4-binding.v1');
});
