#!/usr/bin/env node

// Generates packages/catalog/live-registry.json by probing the deployed system.
//
// Rules this script exists to enforce (ROADMAP.md, Step 2 Part 2 and Step 5):
//   * Exactly three states: live, supply_paused, unavailable.
//   * A failed probe yields supply_paused with a reason and, where known, an
//     expected return date. A failed probe NEVER removes a route.
//   * Only a route that is absent from the catalog becomes unavailable.
//   * The output file is generated, never hand-edited.
//
// Safety: this script performs no payment. It sends no PAYMENT-SIGNATURE
// header, so paid routes answer with a 402 quote and nothing settles. Supplier
// credentials are read to probe supply health; only status codes and provider
// error codes are recorded, never credential material or response bodies.

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'packages/catalog/live-registry.json');

const STATE_LIVE = 'live';
const STATE_PAUSED = 'supply_paused';
const STATE_UNAVAILABLE = 'unavailable';

const API_ORIGIN = 'https://api.clervo.dev';
const SITE_ORIGIN = 'https://clervo.dev';
const GATEWAY_HOST = 'ai.clervo.dev';

// Dates that move on their own. Sourced from ROADMAP.md, not invented here.
const GATEWAY_FUNDING_RESUMES_AT = '2026-08-09T00:00:00Z';

const PROBE_TIMEOUT_MS = 30_000;

function fail(message) {
  console.error(`probe-live-registry: FAIL: ${message}`);
  process.exit(1);
}

function sortedKeys(value) {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedKeys(value[key])]));
}

async function localEnvironment() {
  try {
    const file = await readFile(path.join(root, '.env'), 'utf8');
    return Object.fromEntries(file.split(/\r?\n/u)
      .filter((line) => line !== '' && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        return separator < 1 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
      }));
  } catch {
    return {};
  }
}

// Every network observation funnels through here so the registry can never
// contain a claim that was not produced by an actual request.
async function observe(id, url, init = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }
    return {
      id,
      url,
      method: init.method ?? 'GET',
      reachable: true,
      status: response.status,
      latencyMs: Date.now() - started,
      contentType: response.headers.get('content-type'),
      bodyBytes: text.length,
      body,
    };
  } catch (error) {
    return {
      id,
      url,
      method: init.method ?? 'GET',
      reachable: false,
      status: null,
      latencyMs: Date.now() - started,
      transportError: error instanceof Error ? error.name : 'unknown_error',
      body: null,
    };
  }
}

function postJson(body, idempotencyKey) {
  const headers = { 'content-type': 'application/json' };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  return { method: 'POST', headers, body: JSON.stringify(body) };
}

// A 402 body carries the exact quote the deployed system charges. It is the
// only price the registry ever records: prices are observed, not asserted.
function quoteFrom(observation) {
  const accepts = observation.body?.accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) return null;
  const offer = accepts[0];
  const clervo = offer.extra?.clervo ?? {};
  return {
    amountAtomic: offer.amount ?? null,
    asset: offer.asset ?? null,
    network: offer.network ?? null,
    payTo: offer.payTo ?? null,
    scheme: offer.scheme ?? null,
    priceVersion: clervo.priceVersion ?? null,
    bazaarExtensionPresent: Boolean(observation.body?.extensions?.bazaar),
    resourceDescription: observation.body?.resource?.description ?? null,
  };
}

function problemCode(observation) {
  return observation.body?.code ?? observation.body?.error?.code ?? null;
}

const environment = await localEnvironment();
const observedAt = new Date().toISOString();
let sourceCommit = null;
try {
  sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
} catch {
  sourceCommit = null;
}

const catalog = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-model-catalog.v1.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Surface probes
// ---------------------------------------------------------------------------

const probeNonce = observedAt.replace(/[^0-9]/gu, '');

const surfaceProbes = await Promise.all([
  observe('api.health', `${API_ORIGIN}/v1/health`),
  observe('api.well_known_x402', `${API_ORIGIN}/.well-known/x402`),
  observe('api.llms_txt', `${API_ORIGIN}/llms.txt`),
  observe('api.models', `${API_ORIGIN}/v1/models`),
  observe('api.search_free_naive', `${API_ORIGIN}/v1/search/free`,
    postJson({ query: 'clervo live registry probe', maxResults: 1, synthesize: false })),
  observe('api.search_free_keyed', `${API_ORIGIN}/v1/search/free`,
    postJson({ query: 'clervo live registry probe', maxResults: 1, synthesize: false }, `idem_probe_free_${probeNonce}`)),
  observe('api.search_paid', `${API_ORIGIN}/v1/search/paid`,
    postJson({ query: 'clervo live registry probe', maxResults: 1, synthesize: false }, `idem_probe_paid_${probeNonce}`)),
  observe('api.sandbox_execute', `${API_ORIGIN}/v1/sandbox/execute`,
    postJson({ command: ['node', '-e', "process.stdout.write('ready')"], limits: { wallTimeMs: 5_000, memoryBytes: 67_108_864 } }, `idem_probe_sandbox_${probeNonce}`)),
  observe('site.root', `${SITE_ORIGIN}/`),
  observe('site.llms_txt', `${SITE_ORIGIN}/llms.txt`),
  observe('site.sitemap', `${SITE_ORIGIN}/sitemap.xml`),
  observe('site.unknown_route', `${SITE_ORIGIN}/clervo-live-registry-probe-nonexistent`),
]);

const surfaceById = Object.fromEntries(surfaceProbes.map((probe) => [probe.id, probe]));

if (!surfaceById['api.health'].reachable) {
  fail('the deployed API was unreachable; refusing to write a registry that would understate live capability');
}

// ---------------------------------------------------------------------------
// Supply health probes
// ---------------------------------------------------------------------------
//
// Supply health is probed only where a credential is present in this
// environment. Where it is absent the result is `not_probed` — which is not a
// failure and must never downgrade a route on its own.

async function probeClervoGateway() {
  const baseUrl = process.env.CLERVO_AI_BASE_URL ?? environment.CLERVO_AI_BASE_URL;
  const credential = process.env.CLERVO_AI_API_KEY ?? environment.CLERVO_AI_API_KEY;
  if (typeof baseUrl !== 'string' || typeof credential !== 'string' || credential.length < 8) {
    return { supplyFamilyId: 'supply.clervo_ai_gateway', outcome: 'not_probed', reason: 'credential_absent_in_this_environment' };
  }
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.hostname !== GATEWAY_HOST) {
    return { supplyFamilyId: 'supply.clervo_ai_gateway', outcome: 'not_probed', reason: 'base_url_not_permitted' };
  }
  const prefix = base.href.replace(/\/$/u, '');
  const authorization = { authorization: `Bearer ${credential}` };

  const models = await observe('supply.clervo_ai_gateway.models', `${prefix}/models`, { headers: authorization });
  const modelIds = Array.isArray(models.body?.data) ? models.body.data.map((entry) => entry.id).sort() : [];

  const completion = await observe('supply.clervo_ai_gateway.completion', `${prefix}/chat/completions`, {
    method: 'POST',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-5.6-luna', messages: [{ role: 'user', content: 'Reply with the single word ready.' }], max_tokens: 16 }),
  });

  const catalogueReachable = models.status === 200;
  const completionOk = completion.status === 200;
  const providerCode = problemCode(completion);

  if (catalogueReachable && completionOk) {
    return { supplyFamilyId: 'supply.clervo_ai_gateway', outcome: 'passed', modelIdsAdvertised: modelIds, catalogueStatus: models.status, completionStatus: completion.status };
  }
  return {
    supplyFamilyId: 'supply.clervo_ai_gateway',
    outcome: 'failed',
    // Deliberately coarse: the reason names the failure class, never the
    // credential, the request, or the provider response body.
    reason: completion.status === 401 || completion.status === 403
      ? 'upstream_authentication_unavailable'
      : completion.status === 429
        ? 'upstream_rate_limited'
        : 'upstream_completion_failed',
    providerErrorCode: providerCode,
    catalogueStatus: models.status,
    completionStatus: completion.status,
    modelIdsAdvertised: modelIds,
    expectedReturnAt: GATEWAY_FUNDING_RESUMES_AT,
  };
}

const supplyProbes = [await probeClervoGateway()];
const supplyByFamily = Object.fromEntries(supplyProbes.map((probe) => [probe.supplyFamilyId, probe]));

// ---------------------------------------------------------------------------
// AI route probes
// ---------------------------------------------------------------------------

// A route is probed with the input shape its own product declares. Probing
// every route as chat is wrong: the contract rejects a chat body on an image,
// embedding, or speech route, and the rejection looks identical to paused
// supply. Each route gets the shape it actually accepts.
function probeBodyFor(route) {
  const model = route.exactModelId;
  if (route.productIds.includes('ai.embed')) {
    return { model, input: { kind: 'embedding', inputs: ['clervo live registry probe'] } };
  }
  if (route.productIds.includes('ai.image')) {
    return { model, input: { kind: 'image', prompt: 'a plain red square', size: '1024x1024', quality: 'low', count: 1 } };
  }
  if (route.productIds.includes('ai.speech')) {
    return { model, input: { kind: 'speech', input: 'clervo live registry probe', voice: 'arcas', responseFormat: 'mp3' } };
  }
  return {
    model,
    input: { kind: 'chat', messages: [{ role: 'user', content: 'Reply with the single word ready.' }], responseFormat: 'text', stream: false },
    maximumOutputTokens: 16,
  };
}

const routeProbes = [];
for (const route of catalog.routes) {
  const key = `idem_probe_ai_${route.routeId.replace(/[^a-zA-Z0-9]/gu, '_')}_${probeNonce}`;
  routeProbes.push(await observe(`ai.route.${route.routeId}`, `${API_ORIGIN}/v1/ai/execute`, postJson(probeBodyFor(route), key)));
}
const routeProbeById = Object.fromEntries(routeProbes.map((probe, index) => [catalog.routes[index].routeId, probe]));

function classifyRoute(route) {
  const probe = routeProbeById[route.routeId];
  const qualification = route.qualification ?? null;
  const supply = supplyByFamily[route.supplyFamilyId] ?? null;
  const quote = quoteFrom(probe);
  const expiresAt = qualification?.expiresAt ?? null;
  const qualificationExpired = expiresAt !== null && Date.parse(expiresAt) <= Date.parse(observedAt);

  const evidence = {
    edgeStatus: probe.status,
    edgeCode: problemCode(probe),
    edgeQuoted: quote !== null,
    supplyOutcome: supply?.outcome ?? 'not_probed',
    supplyReason: supply?.reason ?? null,
    qualificationExpiresAt: expiresAt,
    qualificationExpired,
    resaleAllowed: qualification?.resaleAllowed === true,
  };

  // A supplier-level failure pauses every route on that supply family. This is
  // the case the three gateway routes are in: qualified and owned, temporarily
  // unfunded. They stay in the catalog.
  if (supply?.outcome === 'failed') {
    return { state: STATE_PAUSED, reason: supply.reason, expectedReturnAt: supply.expectedReturnAt ?? null, quote, proof: 'none', evidence };
  }

  if (!probe.reachable) {
    return { state: STATE_PAUSED, reason: 'edge_unreachable', expectedReturnAt: null, quote, proof: 'none', evidence };
  }

  // The edge answers 503 ai_route_unavailable for a catalogued route it does
  // not currently serve. That is paused supply, not a route that stopped
  // existing — removal here would erase supply we own.
  if (probe.status === 503) {
    return { state: STATE_PAUSED, reason: problemCode(probe) ?? 'edge_route_unavailable', expectedReturnAt: null, quote, proof: 'none', evidence };
  }

  if (qualificationExpired) {
    return { state: STATE_PAUSED, reason: 'qualification_expired', expectedReturnAt: null, quote, proof: 'none', evidence };
  }

  if (qualification?.resaleAllowed !== true) {
    return { state: STATE_PAUSED, reason: 'resale_not_permitted', expectedReturnAt: null, quote, proof: 'none', evidence };
  }

  if (probe.status === 402 && quote !== null) {
    // A 402 is a real, request-derived quote from the deployed system. It
    // proves the route is offered and priced. It does not prove a paid result,
    // because probing never pays — `proof` records that distinction so no
    // rendered surface can overstate it.
    return { state: STATE_LIVE, reason: null, expectedReturnAt: null, quote, proof: 'quote_observed_unpaid', evidence };
  }

  return { state: STATE_PAUSED, reason: `edge_unexpected_status_${probe.status}`, expectedReturnAt: null, quote, proof: 'none', evidence };
}

const aiRoutes = catalog.routes.map((route) => {
  const classification = classifyRoute(route);
  return {
    routeId: route.routeId,
    exactModelId: route.exactModelId,
    supplyFamilyId: route.supplyFamilyId,
    productIds: [...route.productIds].sort(),
    capabilities: [...(route.capabilities ?? [])].sort(),
    state: classification.state,
    reason: classification.reason,
    expectedReturnAt: classification.expectedReturnAt,
    sellable: classification.state === STATE_LIVE,
    proof: classification.proof,
    observedQuote: classification.quote,
    evidence: classification.evidence,
  };
}).sort((left, right) => left.routeId.localeCompare(right.routeId));

// ---------------------------------------------------------------------------
// Product records
// ---------------------------------------------------------------------------

function productFromProbes({ id, label, operations, probeIds, freeProbeId = null, commercialBlocker = null }) {
  if (commercialBlocker !== null) {
    return {
      id,
      label,
      operations: [...operations].sort(),
      state: STATE_UNAVAILABLE,
      reason: commercialBlocker,
      expectedReturnAt: null,
      publiclyReachable: false,
      observedQuote: null,
      freeEntry: null,
      evidence: { probed: false, basis: 'no_public_route_is_served' },
    };
  }

  const paid = surfaceById[probeIds.paid];
  const quote = quoteFrom(paid);
  const free = freeProbeId === null ? null : surfaceById[freeProbeId];
  const naive = freeProbeId === null ? null : surfaceById[`${freeProbeId}`.replace('_keyed', '_naive')];

  let state = STATE_PAUSED;
  let reason = paid.reachable ? `edge_unexpected_status_${paid.status}` : 'edge_unreachable';
  if (paid.status === 402 && quote !== null) {
    state = STATE_LIVE;
    reason = null;
  } else if (paid.status === 503) {
    reason = problemCode(paid) ?? 'edge_route_unavailable';
  }

  return {
    id,
    label,
    operations: [...operations].sort(),
    state,
    reason,
    expectedReturnAt: null,
    publiclyReachable: paid.reachable && paid.status !== 404,
    observedQuote: quote,
    freeEntry: free === null ? null : {
      route: free.url,
      withIdempotencyKeyStatus: free.status,
      withoutIdempotencyKeyStatus: naive?.status ?? null,
      acceptsNaiveRequest: naive?.status === 200,
      naiveRejectionCode: naive?.status === 200 ? null : problemCode(naive ?? {}),
    },
    evidence: { probed: true, edgeStatus: paid.status, edgeCode: problemCode(paid) },
  };
}

// AI has no single paid endpoint state: it is probed per route. The product is
// live while at least one catalogued route is live, and paused otherwise —
// never unavailable, because the routes stay in the catalog either way.
const aiRouteStates = aiRoutes.reduce((counts, route) => ({ ...counts, [route.state]: (counts[route.state] ?? 0) + 1 }), {});
const aiLiveRoutes = aiRoutes.filter((route) => route.state === STATE_LIVE);
const aiProductRecord = {
  id: 'ai',
  label: 'AI',
  operations: ['ai.chat', 'ai.embed', 'ai.image', 'ai.speech'].sort(),
  state: aiLiveRoutes.length > 0 ? STATE_LIVE : STATE_PAUSED,
  reason: aiLiveRoutes.length > 0 ? null : 'no_route_currently_live',
  expectedReturnAt: null,
  publiclyReachable: surfaceById['api.health'].reachable,
  observedQuote: aiLiveRoutes[0]?.observedQuote ?? null,
  freeEntry: null,
  evidence: { probed: true, routeStates: aiRouteStates, liveRouteCount: aiLiveRoutes.length, totalRouteCount: aiRoutes.length },
};

const products = [
  productFromProbes({
    id: 'search',
    label: 'Research',
    operations: ['search.web', 'search.answer'],
    probeIds: { paid: 'api.search_paid' },
    freeProbeId: 'api.search_free_keyed',
  }),
  aiProductRecord,
  productFromProbes({
    id: 'sandbox',
    label: 'Secure Sandbox',
    operations: ['sandbox.run', 'sandbox.session.create', 'sandbox.session.exec', 'sandbox.artifact.get', 'sandbox.session.destroy'],
    probeIds: { paid: 'api.sandbox_execute' },
  }),
  productFromProbes({
    id: 'rpc',
    label: 'Multi-chain RPC',
    operations: ['rpc.call', 'rpc.batch', 'rpc.health', 'rpc.archive', 'rpc.broadcast'],
    probeIds: {},
    commercialBlocker: 'commercial_rights_blocked',
  }),
  productFromProbes({
    id: 'prediction',
    label: 'Prediction Intelligence',
    operations: ['prediction.markets', 'prediction.market', 'prediction.compare', 'prediction.history', 'prediction.signal'],
    probeIds: {},
    commercialBlocker: 'commercial_rights_blocked',
  }),
  productFromProbes({
    id: 'crypto_intelligence',
    label: 'Crypto Intelligence',
    operations: ['crypto.wallet', 'crypto.token', 'crypto.transaction', 'crypto.protocol', 'crypto.report'],
    probeIds: {},
    commercialBlocker: 'commercial_rights_blocked',
  }),
].sort((left, right) => left.id.localeCompare(right.id));

// ---------------------------------------------------------------------------
// Discovery surfaces
// ---------------------------------------------------------------------------

const discoverySurfaces = [
  { id: 'api.well_known_x402', purpose: 'agent_resource_manifest' },
  { id: 'api.llms_txt', purpose: 'llm_api_reference' },
  { id: 'api.models', purpose: 'public_model_list' },
  { id: 'site.llms_txt', purpose: 'llm_api_reference' },
  { id: 'site.sitemap', purpose: 'crawler_index' },
].map(({ id, purpose }) => {
  const probe = surfaceById[id];
  // A surface that was never built is `unavailable` — it does not exist. It is
  // not `supply_paused`, which would imply supply we hold and will restore.
  const state = probe.status === 200 ? STATE_LIVE : STATE_UNAVAILABLE;
  return {
    id,
    url: probe.url,
    purpose,
    observedStatus: probe.status,
    state,
    reason: state === STATE_LIVE ? null : `not_served_status_${probe.status}`,
  };
}).sort((left, right) => left.id.localeCompare(right.id));

// Conformance checks are defects in a surface that is otherwise served. They
// are not lifecycle states and deliberately do not use the three-state vocabulary.
const soft404 = surfaceById['site.unknown_route'];
const naiveFree = surfaceById['api.search_free_naive'];
const conformance = [
  {
    id: 'site.not_found_is_404',
    url: soft404.url,
    expectation: 'a nonexistent site URL returns 404',
    observedStatus: soft404.status,
    conformant: soft404.status === 404,
  },
  {
    id: 'api.search_free_accepts_naive_request',
    url: naiveFree.url,
    expectation: 'free search succeeds without a caller-supplied idempotency-key',
    observedStatus: naiveFree.status,
    observedCode: problemCode(naiveFree),
    conformant: naiveFree.status === 200,
  },
].sort((left, right) => left.id.localeCompare(right.id));

// ---------------------------------------------------------------------------
// Assemble and write
// ---------------------------------------------------------------------------

const health = surfaceById['api.health'].body ?? {};

const registry = sortedKeys({
  schemaVersion: 'clervo.live-registry.v1',
  generatedBy: 'scripts/probe-live-registry.mjs',
  handEditingProhibited: true,
  observedAt,
  sourceCommit,
  states: {
    live: 'probed; the deployed system serves it now',
    supply_paused: 'in the catalog, temporarily not serving; carries a reason and, where known, an expected return date',
    unavailable: 'absent from the catalog or has no public route at all',
  },
  deployment: {
    apiOrigin: API_ORIGIN,
    siteOrigin: SITE_ORIGIN,
    releaseId: health.releaseId ?? null,
    environment: health.environment ?? null,
    paidExecutionEnabled: health.paidExecutionEnabled ?? null,
    aiPaidEnabled: health.aiPaidEnabled ?? null,
    sandboxPaidEnabled: health.sandboxPaidEnabled ?? null,
    stateBackend: health.stateBackend ?? null,
    trafficMode: health.trafficMode ?? null,
  },
  summary: {
    products: products.reduce((counts, product) => ({ ...counts, [product.state]: (counts[product.state] ?? 0) + 1 }), {}),
    aiRoutes: aiRouteStates,
    discoverySurfaces: discoverySurfaces.reduce((counts, surface) => ({ ...counts, [surface.state]: (counts[surface.state] ?? 0) + 1 }), {}),
  },
  products,
  aiRoutes,
  discoverySurfaces,
  supplyFamilies: supplyProbes.map((probe) => ({
    supplyFamilyId: probe.supplyFamilyId,
    outcome: probe.outcome,
    reason: probe.reason ?? null,
    expectedReturnAt: probe.expectedReturnAt ?? null,
    providerErrorCode: probe.providerErrorCode ?? null,
    modelIdsAdvertised: probe.modelIdsAdvertised ?? [],
  })).sort((left, right) => left.supplyFamilyId.localeCompare(right.supplyFamilyId)),
});

await writeFile(outputPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

const removed = catalog.routes.length - aiRoutes.length;
if (removed !== 0) fail(`the prober dropped ${removed} catalogued routes; a probe failure must never remove a route`);

console.log(`probe-live-registry: wrote ${path.relative(root, outputPath)}`);
console.log(`  products        ${JSON.stringify(registry.summary.products)}`);
console.log(`  aiRoutes        ${JSON.stringify(registry.summary.aiRoutes)}`);
console.log(`  discovery       ${JSON.stringify(registry.summary.discoverySurfaces)}`);
