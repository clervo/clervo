const UPSTREAM_ORIGIN = 'https://clervo-api-production-jbtbib4yqa-uc.a.run.app';
const PRODUCT_PATHS = new Set(['/v1/search/free', '/v1/search/paid']);
const READ_PATHS = new Set(['/', '/v1/health', '/readyz']);
const MAXIMUM_REQUEST_BYTES = 16_384;

function cors(headers = new Headers()) {
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, idempotency-key, payment-signature');
  headers.set('access-control-expose-headers', 'payment-required, payment-response, idempotency-replayed, ratelimit-limit, ratelimit-remaining, ratelimit-reset, retry-after');
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

async function quotaSubject(request) {
  const address = request.headers.get('cf-connecting-ip') ?? 'cloudflare-unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export default {
  async fetch(request, env = {}) {
    const incoming = new URL(request.url);
    if (request.method === 'OPTIONS' && PRODUCT_PATHS.has(incoming.pathname)) return new Response(null, { status: 204, headers: cors() });
    if (incoming.search && incoming.pathname !== '/') return json(400, { code: 'query_parameters_not_allowed', status: 400 });
    if (READ_PATHS.has(incoming.pathname) && request.method !== 'GET') return json(405, { code: 'method_not_allowed', status: 405 });
    if (PRODUCT_PATHS.has(incoming.pathname) && request.method !== 'POST') return json(405, { code: 'method_not_allowed', status: 405 });
    if (!READ_PATHS.has(incoming.pathname) && !PRODUCT_PATHS.has(incoming.pathname)) return json(404, { code: 'not_found', status: 404 });
    if (incoming.pathname === '/') return json(200, {
      service: 'Clervo API',
      discovery: 'https://clervo.dev/.well-known/clervo.json',
      documentation: 'https://clervo.dev/docs/',
    });
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAXIMUM_REQUEST_BYTES) return json(413, { code: 'request_body_too_large', status: 413 });
    const upstream = new URL(incoming.pathname, UPSTREAM_ORIGIN);
    const headers = new Headers(request.headers);
    for (const name of ['cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-host', 'x-forwarded-proto']) headers.delete(name);
    if (typeof env.CLERVO_EDGE_AUTHORIZATION !== 'string' || env.CLERVO_EDGE_AUTHORIZATION.length < 32) return json(503, { code: 'edge_configuration_unavailable', status: 503 });
    headers.set('x-clervo-edge-authorization', `Bearer ${env.CLERVO_EDGE_AUTHORIZATION}`);
    headers.set('x-clervo-quota-subject', await quotaSubject(request));
    const response = await fetch(new Request(upstream, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    }));
    const responseHeaders = cors(new Headers(response.headers));
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  },
};
