const RECEIVER = '0xBd11d82d8Dbd01Ba3eed279d3bACf74659fFca28';
const PAYER = '0x1ada6E2EACb799f16bfC1A395c06D7fb52369207';
const ASSET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const NETWORK = 'eip155:8453';
const FACILITATOR = 'https://api.cdp.coinbase.com/platform/v2/x402';
const profiles = Object.freeze({
  '/proof/b10-search': Object.freeze({
    productId: 'search.web', route: '/v1/search/paid', resource: 'https://api.clervo.dev/v1/search/paid',
    amountAtomic: '6000', amountDisplay: '0.006 USDC', supplierCostCeilingAtomic: '0',
    idempotencyKey: 'idem_b10_search_proof_20260810f',
    request: Object.freeze({ query: 'Python programming', maxResults: 3, synthesize: false, language: 'en', region: 'US' }),
  }),
  '/proof/b10-sandbox': Object.freeze({
    productId: 'sandbox.run', route: '/v1/sandbox/execute', resource: 'https://api.clervo.dev/v1/sandbox/execute',
    amountAtomic: '10000', amountDisplay: '0.010 USDC', supplierCostCeilingAtomic: '8000',
    idempotencyKey: 'idem_b10_sandbox_proof_20260810c',
    request: Object.freeze({ command: Object.freeze(['node', '-e', 'process.stdout.write("B10 sandbox proof")']), limits: Object.freeze({ cpuMillis: 5000, memoryBytes: 268435456, processes: 16, diskBytes: 67108864, outputBytes: 65536, artifactBytes: 1048576, wallTimeMs: 10000 }) }),
  }),
});

function profile(pathname) {
  const key = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return Object.entries(profiles).find(([prefix]) => key === prefix || key.startsWith(`${prefix}/`))?.[1];
}

function basePath(pathname) {
  const key = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return Object.entries(profiles).find(([prefix]) => key === prefix || key.startsWith(`${prefix}/`))?.[0];
}

function equalJson(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function equalAddress(left, right) { return typeof left === 'string' && left.toLowerCase() === right.toLowerCase(); }

function paymentPayer(value) {
  try {
    const decoded = JSON.parse(atob(value));
    if (decoded?.x402Version !== 2 || decoded?.accepted?.scheme !== 'exact' || decoded?.accepted?.network !== NETWORK) return undefined;
    return decoded?.payload?.authorization?.from;
  } catch { return undefined; }
}

async function readBody(request) {
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > 1_500_000) throw new Error('proof_request_too_large');
  return new Uint8Array(bytes);
}

function configFor(value) {
  return Object.freeze({ network: NETWORK, chainIdHex: '0x2105', asset: ASSET, amountAtomic: value.amountAtomic, amountDisplay: value.amountDisplay, payTo: RECEIVER, payer: PAYER, facilitator: FACILITATOR, payerBalanceCapAtomic: '300000', supplierCostCeilingAtomic: value.supplierCostCeilingAtomic, productId: value.productId, resource: value.resource, idempotencyKey: value.idempotencyKey, request: value.request });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const prefix = basePath(url.pathname);
    const value = profile(url.pathname);
    if (prefix === undefined || value === undefined) return env.ASSETS.fetch(request);
    if (request.method === 'GET' && url.pathname === `${prefix}/config`) return Response.json(configFor(value), { headers: { 'cache-control': 'no-store' } });
    if (request.method !== 'POST' || url.pathname !== `${prefix}/api/paid-operation`) return new Response('Not found', { status: 404 });
    try {
      const key = request.headers.get('idempotency-key');
      if (key !== value.idempotencyKey) return Response.json({ code: 'idempotency_key_drift' }, { status: 400 });
      const body = await readBody(request);
      const parsed = JSON.parse(new TextDecoder().decode(body));
      if (!equalJson(parsed, value.request)) return Response.json({ code: 'request_body_drift' }, { status: 400 });
      const headers = new Headers({ 'content-type': 'application/json', 'idempotency-key': key });
      const payment = request.headers.get('payment-signature');
      if (payment !== null) {
        if (payment.length > 32768) return Response.json({ code: 'payment_header_invalid' }, { status: 400 });
        if (!equalAddress(paymentPayer(payment), PAYER)) return Response.json({ code: 'payment_payer_refused' }, { status: 400 });
        headers.set('payment-signature', payment);
      }
      const upstream = await fetch(`https://api.clervo.dev${value.route}`, { method: 'POST', headers, body, redirect: 'manual' });
      const returned = await upstream.arrayBuffer();
      if (returned.byteLength > 512 * 1024) return Response.json({ code: 'proof_response_too_large' }, { status: 502 });
      const output = new Headers({ 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
      for (const name of ['payment-required', 'www-authenticate', 'payment-response', 'idempotency-replayed']) { const header = upstream.headers.get(name); if (header !== null) output.set(name, header); }
      return new Response(returned, { status: upstream.status, headers: output });
    } catch { return Response.json({ code: 'proof_proxy_refused', recovery: 'stop_and_reconcile_without_retry' }, { status: 502, headers: { 'cache-control': 'no-store' } }); }
  },
};
