import catalog from '../../../generated/public/catalog.json' with { type: 'json' };
import capabilities from '../../../generated/public/capabilities.json' with { type: 'json' };
import discovery from '../../../generated/public/.well-known/clervo.json' with { type: 'json' };
import aiPlugin from '../../../generated/public/.well-known/ai-plugin.json' with { type: 'json' };
import mcpDiscovery from '../../../generated/public/.well-known/mcp.json' with { type: 'json' };
import x402Manifest from '../../../generated/public/.well-known/x402.json' with { type: 'json' };
import models from '../../../generated/public/models.json' with { type: 'json' };
import onboarding from '../../../generated/public/onboarding.json' with { type: 'json' };
import openapi from '../../../generated/public/openapi.json' with { type: 'json' };
import pricing from '../../../generated/public/pricing.json' with { type: 'json' };
import status from '../../../generated/public/status.json' with { type: 'json' };
import { resolveCompatibilityModel } from '../../api/src/compatibility-model-map.mjs';
import { AGENT_DOCUMENT, LLMS_DOCUMENT, SKILL_DOCUMENT } from '../../../generated/worker/agent-documents.js';

const UPSTREAM_ORIGIN = 'https://clervo-api-production-jbtbib4yqa-uc.a.run.app';
const FAVICON = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\" data-clervo-logo=\"x402\">\n<title>Clervo</title>\n<defs>\n  <filter id=\"glow\" x=\"-20%\" y=\"-300%\" width=\"140%\" height=\"700%\">\n    <feGaussianBlur stdDeviation=\"2\"/>\n  </filter>\n</defs>\n<rect width=\"64\" height=\"64\" fill=\"#020202\"/>\n<g fill=\"none\" stroke-linecap=\"square\">\n  <path d=\"M0 32H23.5\" stroke=\"#fd1b21\" stroke-width=\"4\" opacity=\".36\" filter=\"url(#glow)\"/>\n  <path d=\"M23.5 32H40.5\" stroke=\"#46fdfd\" stroke-width=\"4\" opacity=\".34\" filter=\"url(#glow)\"/>\n  <path d=\"M40.5 32H64\" stroke=\"#fcd64f\" stroke-width=\"4\" opacity=\".34\" filter=\"url(#glow)\"/>\n  <path d=\"M0 32H23.5\" stroke=\"#ff1b22\" stroke-width=\"1.15\"/>\n  <path d=\"M23.5 32H40.5\" stroke=\"#46fbfd\" stroke-width=\"1.15\"/>\n  <path d=\"M40.5 32H64\" stroke=\"#ffd54a\" stroke-width=\"1.15\"/>\n</g>\n<path fill=\"#fff\" fill-rule=\"evenodd\"\n d=\"M32 17.75 45.9 44H18.1L32 17.75Zm0 6.55L24.25 39.7h15.5L32 24.3Z\"/>\n</svg>";
const PRODUCT_PATHS = new Set(['/v1/search/free', '/v1/search/paid', '/v1/ai/execute', '/v1/chat/completions', '/v1/messages', '/v1/responses', '/v1/sandbox/execute', '/v1/rpc/execute', '/v1/prediction/execute', '/v1/crypto/execute']);
const COMPATIBILITY_PATHS = new Set(['/v1/chat/completions', '/v1/messages', '/v1/responses']);
const DISCOVERY_DOCUMENTS = new Map([
  ['/.well-known/clervo.json', discovery],
  ['/.well-known/agent.json', discovery],
  ['/.well-known/ai-plugin.json', aiPlugin],
  ['/.well-known/mcp.json', mcpDiscovery],
  ['/.well-known/mcp/server.json', mcpDiscovery],
  // The three agent discovery paths. An agent reads a model list, a payment
  // manifest, and a reference; without them the service is invisible to its
  // actual customer. All three are generated from the probed live registry, so
  // they cannot advertise supply the deployed system does not serve.
  ['/.well-known/x402', x402Manifest],
  ['/v1/models', models],
  // Public alias reserved for the protected ai.clervo.dev hostname. Its
  // existing /v1/models path belongs to the authenticated VM gateway and must
  // not be shadowed when the normalized product route is attached there.
  ['/v1/catalog', models],
  ['/openapi.json', openapi],
  ['/catalog.json', catalog],
  ['/capabilities.json', capabilities],
  ['/pricing.json', pricing],
  ['/status.json', status],
  ['/onboarding.json', onboarding],
]);
const READ_PATHS = new Set(['/', '/favicon.ico', '/favicon.svg', '/v1/health', '/readyz', '/v1/rpc/chains', '/skill.md', '/agent.md', '/agents.txt', '/llms.txt', ...DISCOVERY_DOCUMENTS.keys()]);
// The agent-facing documents. An agent that discovers the API host first must
// not have to know that these live only on the site host.
const TEXT_DOCUMENTS = new Map([
  ['/skill.md', SKILL_DOCUMENT],
  ['/agent.md', AGENT_DOCUMENT],
]);
const PLAIN_TEXT_DOCUMENTS = new Map([
  ['/agents.txt', AGENT_DOCUMENT],
  ['/llms.txt', LLMS_DOCUMENT],
]);
const MAXIMUM_REQUEST_BYTES = Object.freeze({
  '/v1/search/free': 16_384,
  '/v1/search/paid': 16_384,
  '/v1/ai/execute': 10_485_760,
  '/v1/chat/completions': 10_485_760,
  '/v1/messages': 10_485_760,
  '/v1/responses': 10_485_760,
  '/v1/sandbox/execute': 1_500_000,
  '/v1/rpc/execute': 262_144,
  '/v1/prediction/execute': 262_144,
  '/v1/crypto/execute': 262_144,
});
const MAXIMUM_HEADER_BYTES = 32_768;
const MAXIMUM_HEADER_COUNT = 64;
const MAXIMUM_HEADER_VALUE_BYTES = 8_192;
const MAXIMUM_JSON_DEPTH = 32;
const MAXIMUM_JSON_NODES = 20_000;
const MAXIMUM_JSON_ARRAY_ITEMS = 1_000;
const REQUEST_DEADLINES_MS = Object.freeze({
  '/v1/search/free': 12_000,
  '/v1/search/paid': 15_000,
  '/v1/ai/execute': 120_000,
  '/v1/chat/completions': 120_000,
  '/v1/messages': 120_000,
  '/v1/responses': 120_000,
  '/v1/sandbox/execute': 75_000,
  '/v1/rpc/execute': 35_000,
  '/v1/prediction/execute': 35_000,
  '/v1/crypto/execute': 35_000,
});
const FORWARDED_REQUEST_HEADERS = new Set(['accept', 'authorization', 'content-type', 'idempotency-key', 'payment-signature', 'user-agent']);
const FORWARDED_RESPONSE_HEADERS = new Set([
  'content-type', 'content-length', 'payment-required', 'payment-response', 'payment-receipt', 'www-authenticate',
  'idempotency-key', 'idempotency-replayed', 'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset', 'retry-after',
  'x-clervo-artifact-sha256', 'x-clervo-artifact-expires',
]);
const ARTIFACT_PATH = /^\/v1\/artifacts\/tenant_[A-Za-z0-9]{20,64}\/[a-f0-9]{64}\/[a-z0-9]{3,8}\/[1-9][0-9]{9}\/[A-Za-z0-9_-]{43}$/u;

function cors(headers = new Headers()) {
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  headers.set('access-control-allow-headers', 'authorization, content-type, idempotency-key, payment-signature');
  headers.set('access-control-expose-headers', 'payment-required, payment-response, payment-receipt, www-authenticate, idempotency-key, idempotency-replayed, ratelimit-limit, ratelimit-remaining, ratelimit-reset, retry-after');
  headers.set('access-control-max-age', '86400');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('cache-control', 'no-store');
  return headers;
}

function json(status, body, { cache = false } = {}) {
  const headers = cors(new Headers({ 'content-type': 'application/json; charset=utf-8' }));
  if (cache) headers.set('cache-control', 'public, max-age=300, stale-while-revalidate=3600');
  return new Response(JSON.stringify(body), { status, headers });
}

function staticHeaders(contentType) {
  const headers = cors(new Headers({ 'content-type': contentType }));
  headers.set('cache-control', 'public, max-age=300, stale-while-revalidate=3600');
  return headers;
}

async function normalizeCompatibilityRequest(request, pathname) {
  if (!COMPATIBILITY_PATHS.has(pathname)) return request;

  let body;
  try {
    body = await request.clone().json();
  } catch {
    // Preserve the origin's existing error contract for malformed JSON.
    return request;
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return request;

  const model = resolveCompatibilityModel(body.model);
  const normalized = {
    ...body,
    ...(model === body.model ? {} : { model }),
    ...(pathname === '/v1/responses' && body.store === undefined
      ? { store: false }
      : {}),
  };
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(normalized),
    redirect: 'manual',
  });
}

function boundedHeaders(headers) {
  let count = 0;
  let bytes = 0;
  for (const [name, value] of headers) {
    count += 1;
    const valueBytes = new TextEncoder().encode(value).byteLength;
    bytes += new TextEncoder().encode(name).byteLength + valueBytes;
    if (count > MAXIMUM_HEADER_COUNT || valueBytes > MAXIMUM_HEADER_VALUE_BYTES || bytes > MAXIMUM_HEADER_BYTES) return false;
  }
  return true;
}

function assertJsonStructure(root) {
  let nodes = 0;
  const pending = [{ value: root, depth: 1 }];
  while (pending.length > 0) {
    const { value, depth } = pending.pop();
    nodes += 1;
    if (nodes > MAXIMUM_JSON_NODES || depth > MAXIMUM_JSON_DEPTH) throw new Error('request_structure_too_complex');
    if (Array.isArray(value)) {
      if (value.length > MAXIMUM_JSON_ARRAY_ITEMS) throw new Error('request_array_too_large');
      for (const item of value) if (item !== null && typeof item === 'object') pending.push({ value: item, depth: depth + 1 });
    } else if (value !== null && typeof value === 'object') {
      for (const item of Object.values(value)) if (item !== null && typeof item === 'object') pending.push({ value: item, depth: depth + 1 });
    }
  }
}

async function boundedBody(request, maximumBytes) {
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel('request_body_too_large');
        throw new Error('request_body_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

function filteredRequestHeaders(source) {
  const headers = new Headers();
  for (const [name, value] of source) if (FORWARDED_REQUEST_HEADERS.has(name.toLowerCase())) headers.append(name, value);
  return headers;
}

function filteredResponseHeaders(source) {
  const headers = new Headers();
  for (const [name, value] of source) if (FORWARDED_RESPONSE_HEADERS.has(name.toLowerCase())) headers.append(name, value);
  return headers;
}

async function rateLimit(env, request, pathname, subject) {
  const paidCredential = request.headers.has('payment-signature') || /^Payment\s+/iu.test(request.headers.get('authorization') ?? '');
  const kind = pathname === '/v1/search/free' ? 'free' : paidCredential ? 'paid' : 'quote';
  const binding = kind === 'free' ? env.CLERVO_FREE_RATE_LIMIT : kind === 'paid' ? env.CLERVO_PAID_RATE_LIMIT : env.CLERVO_QUOTE_RATE_LIMIT;
  if (binding === undefined) return undefined;
  const outcome = await binding.limit({ key: `${pathname}:${subject}` });
  return outcome.success ? undefined : json(429, { code: `${kind}_rate_limit_exceeded`, status: 429, retryable: true });
}

async function quotaSubject(request) {
  const address = request.headers.get('cf-connecting-ip') ?? 'cloudflare-unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function publicStatus(env, request) {
  let health;
  try {
    if (typeof env.CLERVO_EDGE_AUTHORIZATION !== 'string' || env.CLERVO_EDGE_AUTHORIZATION.length < 32) throw new Error('edge_configuration_unavailable');
    health = await fetch(new Request(new URL('/v1/health', UPSTREAM_ORIGIN), {
      method: 'GET',
      headers: {
        'x-clervo-edge-authorization': `Bearer ${env.CLERVO_EDGE_AUTHORIZATION}`,
        'x-clervo-quota-subject': await quotaSubject(request),
        'x-clervo-deadline-at': new Date(Date.now() + 6_000).toISOString(),
      },
      redirect: 'manual',
    }), { signal: AbortSignal.timeout(7_000) });
    if (!health.ok) throw new Error('origin_health_unavailable');
    health = await health.json();
  } catch {
    health = { lifecycle: 'unavailable', observedAt: new Date().toISOString(), products: {} };
  }
  const lifecycleState = health.lifecycle === 'healthy' ? 'available' : health.lifecycle === 'degraded' ? 'degraded' : 'unavailable';
  const products = status.observedTruth?.products?.map((product) => {
    const runtime = health.products?.[product.id];
    if (runtime === undefined) return product;
    const state = runtime.status === 'healthy' ? 'live' : runtime.status === 'degraded' ? 'degraded' : 'unavailable';
    return { ...product, lifecycleState: state, reason: state === 'live' ? null : state === 'degraded' ? 'supplier_or_route_degraded' : 'supplier_or_route_unavailable' };
  });
  return {
    ...status,
    observedAt: health.observedAt,
    publicApi: { ...status.publicApi, state: lifecycleState, customerEndpointAvailable: lifecycleState !== 'unavailable' },
    observedTruth: { ...status.observedTruth, provenance: { ...status.observedTruth?.provenance, observedAt: health.observedAt }, products },
    runtime: { lifecycle: health.lifecycle, observedAt: health.observedAt, products: health.products, capacity: health.capacity },
  };
}

export default {
  async fetch(request, env = {}) {
    const incoming = new URL(request.url);
    const artifactRequest = ARTIFACT_PATH.test(incoming.pathname);
    if (incoming.href.length > 4_096) return json(414, { code: 'request_target_too_long', status: 414 });
    if (!boundedHeaders(request.headers)) return json(431, { code: 'request_headers_too_large', status: 431 });
    if (['/v1/ai/execute', '/v1/chat/completions', '/v1/messages', '/v1/responses'].includes(incoming.pathname) && env.CLERVO_AI_PUBLIC_ENABLED !== 'true') return json(404, { code: 'not_found', status: 404 });
    if (incoming.pathname === '/v1/sandbox/execute' && env.CLERVO_SANDBOX_PUBLIC_ENABLED !== 'true') return json(404, { code: 'not_found', status: 404 });
    if (['/v1/rpc/execute', '/v1/rpc/chains'].includes(incoming.pathname) && env.CLERVO_RPC_PUBLIC_ENABLED !== 'true') return json(404, { code: 'not_found', status: 404 });
    if (incoming.pathname === '/v1/prediction/execute' && env.CLERVO_PREDICTION_PUBLIC_ENABLED !== 'true') return json(404, { code: 'not_found', status: 404 });
    if (incoming.pathname === '/v1/crypto/execute' && env.CLERVO_CRYPTO_PUBLIC_ENABLED !== 'true') return json(404, { code: 'not_found', status: 404 });
    if (request.method === 'OPTIONS' && (PRODUCT_PATHS.has(incoming.pathname) || artifactRequest)) return new Response(null, { status: 204, headers: cors() });
    if (incoming.search && incoming.pathname !== '/') return json(400, { code: 'query_parameters_not_allowed', status: 400 });
    if (READ_PATHS.has(incoming.pathname) && request.method !== 'GET') return json(405, { code: 'method_not_allowed', status: 405 });
    if (PRODUCT_PATHS.has(incoming.pathname) && request.method !== 'POST') return json(405, { code: 'method_not_allowed', status: 405 });
    if (artifactRequest && request.method !== 'GET') return json(405, { code: 'method_not_allowed', status: 405 });
    if (!READ_PATHS.has(incoming.pathname) && !PRODUCT_PATHS.has(incoming.pathname) && !artifactRequest) return json(404, { code: 'not_found', status: 404 });
    if (incoming.pathname === '/') return json(200, {
      service: 'Clervo API',
      discovery: 'https://api.clervo.dev/.well-known/clervo.json',
      openapi: 'https://api.clervo.dev/openapi.json',
      models: 'https://api.clervo.dev/v1/models',
      x402: 'https://api.clervo.dev/.well-known/x402',
      reference: 'https://api.clervo.dev/llms.txt',
    }, { cache: true });
    if (['/favicon.ico', '/favicon.svg'].includes(incoming.pathname)) return new Response(FAVICON, {
      status: 200,
      headers: staticHeaders('image/svg+xml; charset=utf-8'),
    });
    if (incoming.pathname === '/status.json') return json(200, await publicStatus(env, request));
    if (DISCOVERY_DOCUMENTS.has(incoming.pathname)) return json(200, DISCOVERY_DOCUMENTS.get(incoming.pathname), { cache: true });
    if (TEXT_DOCUMENTS.has(incoming.pathname)) return new Response(TEXT_DOCUMENTS.get(incoming.pathname), {
      status: 200,
      headers: staticHeaders('text/markdown; charset=utf-8'),
    });
    if (PLAIN_TEXT_DOCUMENTS.has(incoming.pathname)) return new Response(PLAIN_TEXT_DOCUMENTS.get(incoming.pathname), {
      status: 200,
      headers: staticHeaders('text/plain; charset=utf-8'),
    });
    const declaredHeader = request.headers.get('content-length');
    const declared = Number(declaredHeader);
    const maximumRequestBytes = MAXIMUM_REQUEST_BYTES[incoming.pathname];
    if (declaredHeader !== null && (!/^(?:0|[1-9][0-9]*)$/u.test(declaredHeader) || !Number.isSafeInteger(declared))) return json(400, { code: 'invalid_content_length', status: 400 });
    if (Number.isFinite(declared) && maximumRequestBytes !== undefined && declared > maximumRequestBytes) return json(413, { code: 'request_body_too_large', status: 413 });
    const subject = await quotaSubject(request);
    if (PRODUCT_PATHS.has(incoming.pathname)) {
      const limited = await rateLimit(env, request, incoming.pathname, subject);
      if (limited !== undefined) return limited;
    }
    let requestBody;
    if (maximumRequestBytes !== undefined) {
      try { requestBody = await boundedBody(request, maximumRequestBytes); }
      catch { return json(413, { code: 'request_body_too_large', status: 413 }); }
      if (requestBody.byteLength > 0) {
        const mediaType = (request.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
        if (mediaType !== 'application/json') return json(415, { code: 'unsupported_media_type', status: 415 });
        try {
          const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(requestBody));
          if (value === null || typeof value !== 'object' || Array.isArray(value)) return json(400, { code: 'request_body_object_required', status: 400 });
          assertJsonStructure(value);
        } catch (error) {
          const code = ['request_structure_too_complex', 'request_array_too_large'].includes(error?.message) ? error.message : 'invalid_json';
          return json(code === 'invalid_json' ? 400 : 422, { code, status: code === 'invalid_json' ? 400 : 422 });
        }
      }
    }
    const bufferedHeaders = filteredRequestHeaders(request.headers);
    bufferedHeaders.delete('content-length');
    const bufferedRequest = new Request(request.url, {
      method: request.method,
      headers: bufferedHeaders,
      body: requestBody?.byteLength > 0 ? requestBody : undefined,
      redirect: 'manual',
    });
    const forwardedRequest = await normalizeCompatibilityRequest(bufferedRequest, incoming.pathname);
    const upstream = new URL(incoming.pathname, UPSTREAM_ORIGIN);
    const headers = filteredRequestHeaders(forwardedRequest.headers);
    if (typeof env.CLERVO_EDGE_AUTHORIZATION !== 'string' || env.CLERVO_EDGE_AUTHORIZATION.length < 32) return json(503, { code: 'edge_configuration_unavailable', status: 503 });
    headers.set('x-clervo-edge-authorization', `Bearer ${env.CLERVO_EDGE_AUTHORIZATION}`);
    headers.set('x-clervo-quota-subject', subject);
    const deadlineMs = REQUEST_DEADLINES_MS[incoming.pathname] ?? 15_000;
    headers.set('x-clervo-deadline-at', new Date(Date.now() + deadlineMs).toISOString());
    const upstreamInit = {
      method: forwardedRequest.method,
      headers,
      body: forwardedRequest.body,
      redirect: 'manual',
    };
    // Node/Undici requires duplex when forwarding a ReadableStream body.
    // Propagate it only when the current Request implementation exposes it.
    if (
      forwardedRequest.body !== null
      && forwardedRequest.duplex === 'half'
    ) {
      upstreamInit.duplex = 'half';
    }
    let response;
    try {
      response = await fetch(new Request(upstream, upstreamInit), { signal: AbortSignal.timeout(deadlineMs + 1_000) });
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      return json(timedOut ? 504 : 502, { code: timedOut ? 'request_deadline_exceeded' : 'origin_unavailable', status: timedOut ? 504 : 502, retryable: true });
    }
    const responseHeaders = cors(filteredResponseHeaders(response.headers));
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  },
};
