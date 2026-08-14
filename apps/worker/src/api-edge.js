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
const READ_PATHS = new Set(['/', '/favicon.ico', '/favicon.svg', '/v1/health', '/readyz', '/skill.md', '/agent.md', '/agents.txt', '/llms.txt', ...DISCOVERY_DOCUMENTS.keys()]);
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

function json(status, body) {
  const headers = cors(new Headers({ 'content-type': 'application/json; charset=utf-8' }));
  return new Response(JSON.stringify(body), { status, headers });
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

async function quotaSubject(request) {
  const address = request.headers.get('cf-connecting-ip') ?? 'cloudflare-unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export default {
  async fetch(request, env = {}) {
    const incoming = new URL(request.url);
    const artifactRequest = ARTIFACT_PATH.test(incoming.pathname);
    if (['/v1/ai/execute', '/v1/chat/completions', '/v1/messages', '/v1/responses'].includes(incoming.pathname) && env.CLERVO_AI_PUBLIC_ENABLED !== 'true') return json(404, { code: 'not_found', status: 404 });
    if (incoming.pathname === '/v1/sandbox/execute' && env.CLERVO_SANDBOX_PUBLIC_ENABLED !== 'true') return json(404, { code: 'not_found', status: 404 });
    if (incoming.pathname === '/v1/rpc/execute' && env.CLERVO_RPC_PUBLIC_ENABLED !== 'true') return json(404, { code: 'not_found', status: 404 });
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
    });
    if (['/favicon.ico', '/favicon.svg'].includes(incoming.pathname)) return new Response(FAVICON, {
      status: 200,
      headers: cors(new Headers({ 'content-type': 'image/svg+xml; charset=utf-8' })),
    });
    if (DISCOVERY_DOCUMENTS.has(incoming.pathname)) return json(200, DISCOVERY_DOCUMENTS.get(incoming.pathname));
    if (TEXT_DOCUMENTS.has(incoming.pathname)) return new Response(TEXT_DOCUMENTS.get(incoming.pathname), {
      status: 200,
      headers: cors(new Headers({ 'content-type': 'text/markdown; charset=utf-8' })),
    });
    if (PLAIN_TEXT_DOCUMENTS.has(incoming.pathname)) return new Response(PLAIN_TEXT_DOCUMENTS.get(incoming.pathname), {
      status: 200,
      headers: cors(new Headers({ 'content-type': 'text/plain; charset=utf-8' })),
    });
    const declared = Number(request.headers.get('content-length'));
    const maximumRequestBytes = MAXIMUM_REQUEST_BYTES[incoming.pathname];
    if (Number.isFinite(declared) && maximumRequestBytes !== undefined && declared > maximumRequestBytes) return json(413, { code: 'request_body_too_large', status: 413 });
    const forwardedRequest = await normalizeCompatibilityRequest(request, incoming.pathname);
    const upstream = new URL(incoming.pathname, UPSTREAM_ORIGIN);
    const headers = new Headers(forwardedRequest.headers);
    for (const name of ['cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-host', 'x-forwarded-proto']) headers.delete(name);
    if (typeof env.CLERVO_EDGE_AUTHORIZATION !== 'string' || env.CLERVO_EDGE_AUTHORIZATION.length < 32) return json(503, { code: 'edge_configuration_unavailable', status: 503 });
    headers.set('x-clervo-edge-authorization', `Bearer ${env.CLERVO_EDGE_AUTHORIZATION}`);
    headers.set('x-clervo-quota-subject', await quotaSubject(request));
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
    const response = await fetch(new Request(upstream, upstreamInit));
    const responseHeaders = cors(new Headers(response.headers));
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  },
};
