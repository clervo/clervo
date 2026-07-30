import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fetchRetrieval } from '../../dist/packages/contracts/src/index.js';

const now = () => new Date('2026-07-30T21:00:00.000Z');
const deadlineAt = '2026-07-30T21:00:05.000Z';
const fetchId = 'fetch_01JZ8Q5Y4QFD48Q24H6M5F4K9P';
const publicAddress = '93.184.216.34';

function request(overrides = {}) {
  return {
    fetchId,
    url: 'https://example.com/article',
    mode: 'transient_extraction',
    providerAllowedContentUse: ['transient_extraction'],
    maximumBytes: 1024,
    deadlineAt,
    userAgent: 'ClervoBot/0.1',
    ...overrides,
  };
}

function response({ status = 200, headers = {}, remoteAddress = publicAddress, chunks = [], stalled = false } = {}) {
  let aborted = false;
  return {
    value: {
      status,
      headers,
      remoteAddress,
      body: {
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) yield Buffer.from(chunk);
          if (stalled) await new Promise(() => {});
        },
      },
      abort: () => { aborted = true; },
    },
    aborted: () => aborted,
  };
}

function mockNetwork(routes, addresses = {}) {
  const calls = [];
  return {
    calls,
    resolve: async (hostname) => addresses[hostname] ?? [publicAddress],
    request: async (input) => {
      calls.push({ url: input.url.href, address: input.address });
      const route = routes[input.url.href];
      if (route === undefined) throw new Error(`unexpected_request_${input.url.href}`);
      return typeof route === 'function' ? route(input) : route;
    },
  };
}

test('bounded fetch pins DNS, enforces robots, caches policy, hashes bytes, and freezes receipts', async () => {
  const robots = response({ headers: { 'content-type': 'text/plain' }, chunks: ['User-agent: *\nAllow: /\n'] });
  const content = response({ headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': '5' }, chunks: ['hello'] });
  const network = mockNetwork({
    'https://example.com/robots.txt': robots.value,
    'https://example.com/article': content.value,
  });
  const cache = new Map();
  const first = await fetchRetrieval(request(), { ...network, now, robotsCache: cache });
  const second = await fetchRetrieval(request({ fetchId: 'fetch_11JZ8Q5Y4QFD48Q24H6M5F4K9P' }), { ...network, now, robotsCache: cache });
  assert.equal(first.receipt.outcome, 'succeeded');
  assert.equal(first.receipt.bodySha256, `sha256:${createHash('sha256').update('hello').digest('hex')}`);
  assert.deepEqual(first.receipt.hops.map((hop) => hop.kind), ['robots', 'content']);
  assert.equal(second.receipt.robots[0].cacheHit, true);
  assert.equal(network.calls.filter((call) => call.url.endsWith('/robots.txt')).length, 1);
  assert.equal(Object.isFrozen(first.receipt), true);
  assert.equal(Object.isFrozen(first.receipt.hops[0].resolvedAddresses), true);
});

test('private DNS answers fail before transport and connection-time rebinding fails closed', async () => {
  const privateNetwork = mockNetwork({}, { 'example.com': ['10.0.0.5'] });
  const privateResult = await fetchRetrieval(request(), { ...privateNetwork, now });
  assert.equal(privateResult.receipt.failureCode, 'unsafe_resolved_address');
  assert.equal(privateNetwork.calls.length, 0);

  const mismatch = response({ remoteAddress: '127.0.0.1', headers: { 'content-type': 'text/plain' }, chunks: ['User-agent: *\nAllow: /\n'] });
  const reboundNetwork = mockNetwork({ 'https://example.com/robots.txt': mismatch.value });
  const rebound = await fetchRetrieval(request(), { ...reboundNetwork, now });
  assert.equal(rebound.receipt.failureCode, 'connected_address_mismatch');
  assert.equal(mismatch.aborted(), true);

  for (const unsafe of ['::ffff:7f00:1', 'ff02::1', '64:ff9b::7f00:1', '2001:db8::1']) {
    const unsafeNetwork = mockNetwork({}, { 'example.com': [unsafe] });
    const unsafeResult = await fetchRetrieval(request(), { ...unsafeNetwork, now });
    assert.equal(unsafeResult.receipt.failureCode, 'unsafe_resolved_address');
    assert.equal(unsafeNetwork.calls.length, 0);
  }
});

test('every cross-origin redirect is re-resolved and robots-checked before redirected content traffic', async () => {
  const network = mockNetwork({
    'https://example.com/robots.txt': response({ chunks: ['User-agent: *\nAllow: /\n'] }).value,
    'https://example.com/article': response({ status: 302, headers: { location: 'https://redirect.example/private' } }).value,
    'https://redirect.example/robots.txt': response({ remoteAddress: '93.184.216.35', chunks: ['User-agent: *\nDisallow: /private\n'] }).value,
  }, { 'redirect.example': ['93.184.216.35'] });
  const result = await fetchRetrieval(request(), { ...network, now });
  assert.equal(result.receipt.failureCode, 'robots_disallowed');
  assert.deepEqual(result.receipt.robots.map((entry) => entry.status), ['allowed', 'disallowed']);
  assert.equal(network.calls.some((call) => call.url === 'https://redirect.example/private'), false);
});

test('robots unavailability and unsupported content use fail closed', async () => {
  const unavailable = mockNetwork({ 'https://example.com/robots.txt': response({ status: 503 }).value });
  const unavailableResult = await fetchRetrieval(request(), { ...unavailable, now });
  assert.equal(unavailableResult.receipt.failureCode, 'robots_unavailable');
  assert.equal(unavailableResult.receipt.robots[0].status, 'unavailable');
  const noUse = await fetchRetrieval(request({ providerAllowedContentUse: ['search_metadata'] }), { ...unavailable, now });
  assert.equal(noUse.receipt.failureCode, 'content_use_not_allowed');
  assert.equal(unavailable.calls.length, 1);
});

test('robots matching normalizes percent-encoded unreserved octets', async () => {
  const network = mockNetwork({
    'https://example.com/robots.txt': response({ chunks: ['User-agent: *\nDisallow: /private\n'] }).value,
  });
  const result = await fetchRetrieval(request({ url: 'https://example.com/%70rivate' }), { ...network, now });
  assert.equal(result.receipt.failureCode, 'robots_disallowed');
  assert.equal(network.calls.some((call) => call.url === 'https://example.com/%70rivate'), false);
});

test('robots precedence uses normalized path length and the most-specific user-agent group', async () => {
  const encodedPrecedence = mockNetwork({
    'https://example.com/robots.txt': response({ chunks: ['User-agent: *\nAllow: /%70rivate\nDisallow: /private/x\n'] }).value,
  });
  const encodedResult = await fetchRetrieval(request({ url: 'https://example.com/private/x' }), { ...encodedPrecedence, now });
  assert.equal(encodedResult.receipt.failureCode, 'robots_disallowed');

  const agentPrecedence = mockNetwork({
    'https://example.com/robots.txt': response({ chunks: ['User-agent: Clervo\nAllow: /private\n\nUser-agent: ClervoBot\nDisallow: /private\n'] }).value,
  });
  const agentResult = await fetchRetrieval(request({ url: 'https://example.com/private' }), { ...agentPrecedence, now });
  assert.equal(agentResult.receipt.failureCode, 'robots_disallowed');
});

test('failed redirect receipts preserve network hops already issued', async () => {
  const network = mockNetwork({
    'https://example.com/robots.txt': response({ chunks: ['User-agent: *\nAllow: /\n'] }).value,
    'https://example.com/article': response({ status: 302, headers: { location: 'https://blocked.example/next' } }).value,
    'https://blocked.example/robots.txt': response({ chunks: ['User-agent: *\nAllow: /\n'] }).value,
  }, { 'blocked.example': ['10.0.0.8'] });
  const result = await fetchRetrieval(request(), { ...network, now });
  assert.equal(result.receipt.failureCode, 'unsafe_resolved_address');
  assert.deepEqual(result.receipt.hops.map((hop) => hop.url), ['https://example.com/robots.txt', 'https://example.com/article']);
});

test('declared and streamed byte ceilings abort responses without returning partial bodies', async () => {
  const robotsBody = response({ chunks: ['User-agent: *\nAllow: /\n'] });
  const declared = response({ headers: { 'content-type': 'text/plain', 'content-length': '1025' }, chunks: ['ignored'] });
  const declaredNetwork = mockNetwork({ 'https://example.com/robots.txt': robotsBody.value, 'https://example.com/article': declared.value });
  const declaredResult = await fetchRetrieval(request(), { ...declaredNetwork, now });
  assert.equal(declaredResult.receipt.failureCode, 'response_too_large');
  assert.equal(declared.aborted(), true);
  assert.equal(declaredResult.body, undefined);

  const streamed = response({ headers: { 'content-type': 'text/plain' }, chunks: ['a'.repeat(700), 'b'.repeat(400)] });
  const streamedNetwork = mockNetwork({ 'https://example.com/robots.txt': robotsBody.value, 'https://example.com/article': streamed.value });
  const streamedResult = await fetchRetrieval(request(), { ...streamedNetwork, now, robotsCache: new Map() });
  assert.equal(streamedResult.receipt.failureCode, 'response_too_large');
  assert.equal(streamed.aborted(), true);
});

test('MIME policy rejects active/binary types before body parsing', async () => {
  const binary = response({ headers: { 'content-type': 'application/octet-stream' }, chunks: ['payload'] });
  const network = mockNetwork({
    'https://example.com/robots.txt': response({ chunks: ['User-agent: *\nAllow: /\n'] }).value,
    'https://example.com/article': binary.value,
  });
  const result = await fetchRetrieval(request(), { ...network, now });
  assert.equal(result.receipt.failureCode, 'content_type_not_allowed');
  assert.equal(binary.aborted(), true);
});

test('absolute deadlines abort stalled streams', async () => {
  const stalled = response({ headers: { 'content-type': 'text/plain' }, stalled: true });
  const network = mockNetwork({ 'https://example.com/article': stalled.value });
  const result = await fetchRetrieval(request({ mode: 'archive_replay', providerAllowedContentUse: ['archive_replay'], robotsPolicy: 'not_applicable', deadlineAt: '2026-07-30T21:00:00.010Z' }), { ...network, now });
  assert.equal(result.receipt.failureCode, 'deadline_exceeded');
  assert.equal(stalled.aborted(), true);
  assert.deepEqual(result.receipt.robots, [{ status: 'not_applicable', cacheHit: false }]);
});

test('robots bypass is rejected outside archive replay before any network traffic', async () => {
  const network = mockNetwork({});
  const result = await fetchRetrieval(request({ robotsPolicy: 'not_applicable' }), { ...network, now });
  assert.equal(result.receipt.failureCode, 'robots_not_applicable_for_mode');
  assert.equal(network.calls.length, 0);
});

test('request bounds reject unsafe headers, TTLs, and process-sized bodies', async () => {
  await assert.rejects(() => fetchRetrieval(request({ userAgent: 'ClervoBot\r\nX-Evil: yes' }), { now }), /invalid_retrieval_user_agent/u);
  await assert.rejects(() => fetchRetrieval(request({ maximumBytes: 16 * 1024 * 1024 + 1 }), { now }), /invalid_retrieval_maximum_bytes/u);
  await assert.rejects(() => fetchRetrieval(request(), { now, robotsTtlMs: 999 }), /invalid_robots_ttl/u);
});

test('absolute deadlines cover stalled DNS and transport establishment', async () => {
  const archiveRequest = request({
    mode: 'archive_replay',
    providerAllowedContentUse: ['archive_replay'],
    robotsPolicy: 'not_applicable',
    deadlineAt: '2026-07-30T21:00:00.010Z',
  });
  const stalledDns = await fetchRetrieval(archiveRequest, { resolve: async () => new Promise(() => {}), now });
  assert.equal(stalledDns.receipt.failureCode, 'deadline_exceeded');

  let lateAborted = false;
  const stalledTransport = await fetchRetrieval(archiveRequest, {
    resolve: async () => [publicAddress],
    request: async () => new Promise((resolve) => setTimeout(() => resolve({
      ...response().value,
      abort: () => { lateAborted = true; },
    }), 20)),
    now,
  });
  assert.equal(stalledTransport.receipt.failureCode, 'deadline_exceeded');
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(lateAborted, true);
});

test('archive replay may explicitly skip robots but still enforces DNS, MIME, bytes, and content-use policy', async () => {
  const content = response({ headers: { 'content-type': 'application/json' }, chunks: ['{"ok":true}'] });
  const network = mockNetwork({ 'https://archive.example/object': content.value });
  const result = await fetchRetrieval(request({
    url: 'https://archive.example/object',
    mode: 'archive_replay',
    providerAllowedContentUse: ['archive_replay'],
    robotsPolicy: 'not_applicable',
  }), { ...network, now });
  assert.equal(result.receipt.outcome, 'succeeded');
  assert.deepEqual(network.calls.map((call) => call.url), ['https://archive.example/object']);
  assert.deepEqual(result.receipt.robots, [{ status: 'not_applicable', cacheHit: false }]);
});