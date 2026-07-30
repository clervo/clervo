import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { retrieveJavaScriptRendered } from '../../dist/packages/contracts/src/index.js';

const publicAddress = '93.184.216.34';
const createdAt = '2026-07-31T00:00:00.000Z';
const deadlineAt = '2026-07-31T00:00:05.000Z';
const isolation = { runtime: 'browser_process', lifecycle: 'disposable_per_render', sandboxed: true, storage: 'ephemeral', serviceWorkers: 'blocked', downloads: 'blocked', permissions: 'denied', networkInterception: 'core_authorized_same_origin' };

function preflight(overrides = {}) {
  return { contractVersion: '2026-07-29.1', fetchId: 'fetch_01JZ8Q5Y4QFD48Q24H6M5F4K9P', outcome: 'succeeded', requestedUrl: 'https://example.com/article', finalUrl: 'https://example.com/article', startedAt: '2026-07-30T23:59:59.800Z', completedAt: '2026-07-30T23:59:59.900Z', hops: [{ kind: 'robots', url: 'https://example.com/robots.txt', resolvedAddresses: [publicAddress], connectedAddress: publicAddress, status: 200 }, { kind: 'content', url: 'https://example.com/article', resolvedAddresses: [publicAddress], connectedAddress: publicAddress, status: 200 }], robots: [{ status: 'allowed', cacheHit: false, robotsUrl: 'https://example.com/robots.txt', fetchedAt: '2026-07-30T23:59:59.810Z', expiresAt: '2026-07-31T00:59:59.810Z' }], contentType: 'text/html', contentLengthBytes: 5, bodySha256: `sha256:${createHash('sha256').update('hello').digest('hex')}`, ...overrides };
}

function request(overrides = {}) {
  return { renderId: 'render_01JZ8Q5Y4QFD48Q24H6M5F4K9P', preflightReceipt: preflight(), createdAt, deadlineAt, userAgent: 'ClervoBrowser/0.1', maximumRequestCount: 4, maximumNetworkBytes: 2048, maximumRenderedBytes: 1024, ...overrides };
}

function successfulAdapter(body = '<main>ready</main>') {
  return { async render(input) { const authorization = await input.authorizeRequest({ url: input.url, resourceType: 'document' }); return { finalUrl: input.url, status: 200, contentType: 'text/html', body: Buffer.from(body), requests: [{ ...authorization, connectedAddress: publicAddress, status: 200, transferredBytes: 256 }], isolation }; } };
}

test('renders only after robots-compliant preflight with frozen core policy, public DNS authorization, and isolation attestation', async () => {
  let adapterRequest;
  const adapter = successfulAdapter();
  const result = await retrieveJavaScriptRendered(request(), { adapter: { async render(input) { adapterRequest = input; return adapter.render(input); } }, resolve: async () => [publicAddress], now: () => createdAt });
  assert.equal(result.receipt.outcome, 'succeeded');
  assert.equal(result.receipt.preflightBodySha256, request().preflightReceipt.bodySha256);
  assert.equal(result.receipt.bodySha256, `sha256:${createHash('sha256').update('<main>ready</main>').digest('hex')}`);
  assert.equal(adapterRequest.policy.sameOriginRequestsOnly, true);
  assert.equal(adapterRequest.policy.javaScriptEnabled, true);
  assert.equal(Object.isFrozen(adapterRequest), true);
  assert.equal(Object.isFrozen(adapterRequest.policy), true);
  assert.equal(Object.isFrozen(result.receipt), true);
  assert.equal(Object.isFrozen(result.receipt.requests[0].resolvedAddresses), true);
  assert.notEqual(result.body, undefined);
});

test('missing, stale, non-HTML, or robots-bypassed preflight fails before browser invocation', async () => {
  let calls = 0;
  const adapter = { async render() { calls += 1; throw new Error('must not run'); } };
  await assert.rejects(() => retrieveJavaScriptRendered(request({ preflightReceipt: preflight({ outcome: 'rejected', failureCode: 'robots_disallowed', finalUrl: undefined, contentType: undefined, contentLengthBytes: undefined, bodySha256: undefined }) }), { adapter }), /requires_successful_preflight/u);
  await assert.rejects(() => retrieveJavaScriptRendered(request({ preflightReceipt: preflight({ robots: [{ status: 'not_applicable', cacheHit: false }] }) }), { adapter }), /requires_robots_allowance/u);
  await assert.rejects(() => retrieveJavaScriptRendered(request({ preflightReceipt: preflight({ contentType: 'application/pdf' }) }), { adapter }), /content_not_renderable/u);
  await assert.rejects(() => retrieveJavaScriptRendered(request({ preflightReceipt: preflight({ completedAt: '2026-07-30T23:58:00.000Z' }) }), { adapter }), /preflight_stale/u);
  assert.equal(calls, 0);
});

test('core request authorization rejects cross-origin and private DNS targets without releasing rendered output', async () => {
  for (const scenario of [
    { url: 'https://tracker.example/pixel', resolve: async () => [publicAddress] },
    { url: 'https://example.com/internal', resolve: async () => ['127.0.0.1'] },
  ]) {
    const adapter = { async render(input) { await input.authorizeRequest({ url: scenario.url, resourceType: 'fetch' }); throw new Error('unreachable'); } };
    const result = await retrieveJavaScriptRendered(request(), { adapter, resolve: scenario.resolve, now: () => createdAt });
    assert.equal(result.receipt.outcome, 'rejected');
    assert.equal(result.receipt.failureCode, 'adapter_failed');
    assert.equal(result.body, undefined);
    assert.deepEqual(result.receipt.requests, []);
  }
});

test('forged isolation, hidden requests, rebinding, unsafe redirects, MIME, and resource limits reject output atomically', async () => {
  const mutations = [
    (response) => { response.isolation = { ...isolation, sandboxed: false }; },
    (response) => { response.requests.push({ ...response.requests[0], url: 'https://example.com/hidden.js' }); },
    (response) => { response.requests[0].connectedAddress = '127.0.0.1'; },
    (response) => { response.finalUrl = 'https://other.example/'; },
    (response) => { response.contentType = 'application/pdf'; },
    (response) => { response.requests[0].transferredBytes = 4096; },
    (response) => { response.body = Buffer.alloc(1025); },
  ];
  for (const mutate of mutations) {
    const adapter = { async render(input) { const authorization = await input.authorizeRequest({ url: input.url, resourceType: 'document' }); const response = { finalUrl: input.url, status: 200, contentType: 'text/html', body: Buffer.from('ok'), requests: [{ ...authorization, connectedAddress: publicAddress, status: 200, transferredBytes: 100 }], isolation: { ...isolation } }; mutate(response); return response; } };
    const result = await retrieveJavaScriptRendered(request(), { adapter, resolve: async () => [publicAddress], now: () => createdAt });
    assert.equal(result.receipt.invocation, 'output_rejected');
    assert.equal(result.receipt.failureCode, 'invalid_renderer_output');
    assert.equal(result.body, undefined);
  }
});

test('deadlines and caller cancellation stop non-cooperative renderers with safe receipts', async () => {
  const stalled = { async render() { return await new Promise(() => {}); } };
  const deadline = await retrieveJavaScriptRendered(request({ deadlineAt: '2026-07-31T00:00:00.020Z' }), { adapter: stalled, resolve: async () => [publicAddress], now: () => createdAt });
  assert.equal(deadline.receipt.invocation, 'deadline_exceeded');
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const cancelled = await retrieveJavaScriptRendered(request({ signal: controller.signal }), { adapter: { async render() { calls += 1; throw new Error('must not run'); } }, now: () => createdAt });
  assert.equal(cancelled.receipt.failureCode, 'caller_cancelled');
  assert.equal(calls, 0);
  const liveController = new AbortController();
  setTimeout(() => liveController.abort(), 10);
  const liveCancelled = await retrieveJavaScriptRendered(request({ signal: liveController.signal }), { adapter: stalled, now: () => createdAt });
  assert.equal(liveCancelled.receipt.invocation, 'cancelled');
});

test('adapter exceptions are reduced to safe codes and request bounds fail closed', async () => {
  const failed = await retrieveJavaScriptRendered(request(), { adapter: { async render() { throw new Error('secret renderer token'); } }, now: () => createdAt });
  assert.equal(failed.receipt.failureCode, 'adapter_failed');
  assert.equal(JSON.stringify(failed).includes('secret renderer token'), false);
  await assert.rejects(() => retrieveJavaScriptRendered(request({ userAgent: 'bad\r\nheader' }), { adapter: successfulAdapter() }), /invalid_javascript_retrieval_user_agent/u);
  await assert.rejects(() => retrieveJavaScriptRendered(request({ maximumRequestCount: 65 }), { adapter: successfulAdapter() }), /invalid_javascript_retrieval_request_limit/u);
  await assert.rejects(() => retrieveJavaScriptRendered(request({ maximumNetworkBytes: 16 * 1024 * 1024 + 1 }), { adapter: successfulAdapter() }), /invalid_javascript_retrieval_network_limit/u);
});