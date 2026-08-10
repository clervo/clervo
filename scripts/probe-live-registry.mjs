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
// header, so paid routes answer with a 402 quote and nothing settles. A paid
// proof level may only come from a separately recorded, settled, reconciled
// production proof that this script validates against the currently deployed
// release and current quote. Supplier credentials are read to probe supply
// health; only status codes and provider error codes are recorded, never
// credential material or response bodies.

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

// A single transient blip must never publish an outage. Any observation that
// would pause a route is retried before it is believed. Attempts are recorded
// in the observation so the registry shows how hard we tried.
const PROBE_ATTEMPTS = 3;
const PROBE_RETRY_DELAY_MS = 2_000;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

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

// Supplier credentials are not in the local `.env`, so reading only that file
// would leave every family `not_probed` and verify nothing. These are read from
// the same Secret Manager entries the production runtime uses, so a probe
// observes the credential that actually serves customer traffic.
//
// The value is held in memory for the length of the run and never logged,
// written to the registry, or included in any reason string.
const secretNames = Object.freeze({
  GROQ_API_KEY: 'clervo-production-groq-api-key',
  CLOUDFLARE_AI_TOKEN: 'clervo-production-cloudflare-ai-token',
  DEEPGRAM_API_KEY: 'clervo-production-deepgram-api-key',
});

function productionSecret(key) {
  const local = process.env[key] ?? environment[key];
  if (typeof local === 'string' && local.length >= 8) return local;
  const secret = secretNames[key];
  if (secret === undefined) return undefined;
  try {
    const value = execFileSync('gcloud', ['secrets', 'versions', 'access', 'latest', `--secret=${secret}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return value.length >= 8 && !/[\r\n]/u.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

// Every network observation funnels through here so the registry can never
// contain a claim that was not produced by an actual request.
async function attemptObserve(id, url, init = {}) {
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

// An observation that would downgrade a route is not believed on first sight.
// Transport failures, upstream 5xx, timeouts, and rate limits are the shapes a
// transient blip takes; a 402, a 200, or a 404 is a real answer from a
// responsive system and is believed immediately.
function isTransientFailure(observation) {
  if (!observation.reachable) return true;
  if (observation.status === null) return true;
  return observation.status >= 500 || observation.status === 408 || observation.status === 429;
}

async function observe(id, url, init = {}) {
  let observation = await attemptObserve(id, url, init);
  let attempts = 1;
  while (attempts < PROBE_ATTEMPTS && isTransientFailure(observation)) {
    await sleep(PROBE_RETRY_DELAY_MS * attempts);
    attempts += 1;
    observation = await attemptObserve(id, url, init);
  }
  return { ...observation, attempts };
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
// Commercial permission gates sellability alongside technical qualification.
// If the document is unreadable the gate fails closed rather than open: every
// route pauses as `commercial_permission_unrecorded`.
const permission = await (async () => {
  try {
    return JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-commercial-permission.v1.json'), 'utf8'));
  } catch {
    return null;
  }
})();
const permissionByFamily = Object.fromEntries((permission?.families ?? []).map((family) => [family.supplyFamilyId, family]));
const predictionPaidProof = await (async () => {
  try {
    return JSON.parse(await readFile(path.join(root, 'infra/production/gcp/prediction-x402-proof.v1.json'), 'utf8'));
  } catch {
    return null;
  }
})();
const cryptoPaidProof = await (async () => {
  try {
    return JSON.parse(await readFile(path.join(root, 'infra/production/gcp/crypto-x402-proof.v1.json'), 'utf8'));
  } catch {
    return null;
  }
})();
const searchSandboxPaidProof = await (async () => {
  try {
    return JSON.parse(await readFile(path.join(root, 'infra/production/gcp/search-sandbox-x402-proof.v1.json'), 'utf8'));
  } catch {
    return null;
  }
})();

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
  observe('api.sandbox_short_execute', `${API_ORIGIN}/v1/sandbox/execute`,
    postJson({ command: ['node', '-e', "process.stdout.write('ready')"], limits: { cpuMillis: 5_000, memoryBytes: 268_435_456, processes: 16, diskBytes: 67_108_864, outputBytes: 65_536, artifactBytes: 1_048_576, wallTimeMs: 10_000 } }, `idem_probe_sandbox_short_${probeNonce}`)),
  observe('api.prediction_execute', `${API_ORIGIN}/v1/prediction/execute`,
    postJson({ kind: 'markets', status: 'open', limit: 3 }, `idem_probe_prediction_${probeNonce}`)),
  observe('api.crypto_execute', `${API_ORIGIN}/v1/crypto/execute`,
    postJson({ kind: 'report', address: '0x0000000000000000000000000000000000000000', chains: ['eip155:1', 'eip155:8453'], lookbackDays: 30, limit: 50 }, `idem_probe_crypto_${probeNonce}`)),
  observe('site.root', `${SITE_ORIGIN}/`),
  observe('site.llms_txt', `${SITE_ORIGIN}/llms.txt`),
  observe('site.sitemap', `${SITE_ORIGIN}/sitemap.xml`),
  observe('site.unknown_route', `${SITE_ORIGIN}/clervo-live-registry-probe-nonexistent`),
]);

const surfaceById = Object.fromEntries(surfaceProbes.map((probe) => [probe.id, probe]));

if (!surfaceById['api.health'].reachable) {
  fail('the deployed API was unreachable; refusing to write a registry that would understate live capability');
}

const health = surfaceById['api.health'].body ?? {};

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

// The other four families are probed the same way, and for the same reason: an
// edge 402 proves only that we offer and price a route. It is produced from the
// catalog and the price model, and it would keep being produced after a supplier
// credential was revoked or an account stopped serving. Until every family is
// probed, `live` means "offered", not "callable".
//
// Each probe below is a zero-cost credential and account check against the
// supplier's own listing or verification endpoint — never an inference call, so
// nothing here consumes an allocation or a credit. Only status codes and failure
// classes are recorded. Where no credential is present the outcome is
// `not_probed`, which never downgrades a route on its own.

function classifySupplyFailure(status) {
  if (status === 401 || status === 403) return 'upstream_authentication_unavailable';
  if (status === 402) return 'upstream_payment_required';
  if (status === 429) return 'upstream_rate_limited';
  return `upstream_status_${status}`;
}

async function probeCredentialedSupply({ supplyFamilyId, credential, url, id, headers, modelsFrom }) {
  if (typeof credential !== 'string' || credential.length < 8) {
    return { supplyFamilyId, outcome: 'not_probed', reason: 'credential_absent_in_this_environment' };
  }
  const probe = await observe(id, url, { headers });
  if (probe.status === 200) {
    return { supplyFamilyId, outcome: 'passed', catalogueStatus: probe.status, modelIdsAdvertised: modelsFrom?.(probe) ?? [] };
  }
  return {
    supplyFamilyId,
    outcome: probe.reachable ? 'failed' : 'failed',
    reason: probe.reachable ? classifySupplyFailure(probe.status) : 'upstream_unreachable',
    providerErrorCode: problemCode(probe),
    catalogueStatus: probe.status,
    modelIdsAdvertised: [],
  };
}

function probeGroq() {
  const credential = productionSecret('GROQ_API_KEY');
  return probeCredentialedSupply({
    supplyFamilyId: 'supply.groq',
    credential,
    id: 'supply.groq.models',
    url: 'https://api.groq.com/openai/v1/models',
    headers: { authorization: `Bearer ${credential}` },
    modelsFrom: (probe) => (Array.isArray(probe.body?.data) ? probe.body.data.map((entry) => entry.id).sort() : []),
  });
}

function probeCloudflare() {
  const credential = productionSecret('CLOUDFLARE_AI_TOKEN');
  // The token verify endpoint reports whether the credential is still active
  // without touching the inference API or any allocation.
  return probeCredentialedSupply({
    supplyFamilyId: 'supply.cloudflare_workers_ai',
    credential,
    id: 'supply.cloudflare_workers_ai.token',
    url: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
    headers: { authorization: `Bearer ${credential}` },
  });
}

function probeDeepgram() {
  const credential = productionSecret('DEEPGRAM_API_KEY');
  return probeCredentialedSupply({
    supplyFamilyId: 'supply.deepgram',
    credential,
    id: 'supply.deepgram.projects',
    url: 'https://api.deepgram.com/v1/projects',
    headers: { authorization: `Token ${credential}` },
  });
}

// Vertex authenticates with the service account this process already runs as,
// so there is no credential to read. Reachability is established by listing the
// publisher model the routes name, which costs nothing.
async function probeVertex() {
  const projectId = process.env.CLERVO_VERTEX_PROJECT_ID ?? environment.CLERVO_VERTEX_PROJECT_ID ?? 'bloxsniper-prod';
  let token;
  try {
    token = execFileSync('gcloud', ['auth', 'print-access-token'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return { supplyFamilyId: 'supply.google_vertex', outcome: 'not_probed', reason: 'application_credentials_absent_in_this_environment' };
  }
  if (token.length < 8) return { supplyFamilyId: 'supply.google_vertex', outcome: 'not_probed', reason: 'application_credentials_absent_in_this_environment' };
  // A GET on the publisher model path returns 404 even for models that serve
  // traffic, so it cannot be used to tell a revoked credential from a healthy
  // one. Listing the project's own Vertex endpoints exercises the same
  // credential and project against a resource that really does respond, and
  // costs nothing because it is a list call rather than inference.
  const probe = await observe('supply.google_vertex.endpoints', `https://us-central1-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/us-central1/endpoints?pageSize=1`, { headers: { authorization: `Bearer ${token}` } });
  if (probe.status === 200) return { supplyFamilyId: 'supply.google_vertex', outcome: 'passed', catalogueStatus: probe.status, modelIdsAdvertised: [] };
  return {
    supplyFamilyId: 'supply.google_vertex',
    outcome: 'failed',
    reason: probe.reachable ? classifySupplyFailure(probe.status) : 'upstream_unreachable',
    providerErrorCode: problemCode(probe),
    catalogueStatus: probe.status,
    modelIdsAdvertised: [],
  };
}

const supplyProbes = await Promise.all([probeClervoGateway(), probeGroq(), probeCloudflare(), probeDeepgram(), probeVertex()]);
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
    edgeAttempts: probe.attempts ?? 1,
    supplyOutcome: supply?.outcome ?? 'not_probed',
    supplyReason: supply?.reason ?? null,
    qualificationExpiresAt: expiresAt,
    qualificationExpired,
    qualificationStatus: qualification?.status ?? 'absent',
    resaleAllowed: qualification?.resaleAllowed === true,
    permissionBasis: permissionByFamily[route.supplyFamilyId]?.permissionBasis ?? 'unrecorded',
    permissionRestricted: (permissionByFamily[route.supplyFamilyId]?.restrictionFound ?? null) !== null,
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

  // Only expiry and resale were consulted here, so a route whose qualification
  // had actually failed its checks still went live on the strength of an edge
  // 402 — and the edge quotes from the catalogue and the price model, so it
  // answers 402 whether or not the supplier can serve the call. A failed
  // qualification is a truthful pause, not a sellable route.
  if (qualification?.status !== undefined && qualification.status !== 'passed') {
    return { state: STATE_PAUSED, reason: `qualification_${qualification.status}`, expectedReturnAt: null, quote, proof: 'none', evidence };
  }

  // Commercial gate. Technical qualification proves the route works; it says
  // nothing about whether we are permitted to sell it. Selling on unresolved
  // permission is the failure mode this closes, so an unresolved or restricted
  // family pauses regardless of how healthy its routes are. `resaleAllowed` is
  // an owner operating decision and is deliberately NOT accepted as evidence
  // of supplier permission.
  const permissionRecord = permissionByFamily[route.supplyFamilyId] ?? null;
  if (permissionRecord === null) {
    return { state: STATE_PAUSED, reason: 'commercial_permission_unrecorded', expectedReturnAt: null, quote, proof: 'none', evidence };
  }
  if (permissionRecord.restrictionFound !== null && permissionRecord.documentedException !== true) {
    return { state: STATE_PAUSED, reason: 'commercial_permission_restricted', expectedReturnAt: null, quote, proof: 'none', evidence };
  }
  if (permissionRecord.permissionBasis !== 'supplier_confirmed' && permissionRecord.permissionBasis !== 'owner_operated_documented') {
    return { state: STATE_PAUSED, reason: 'commercial_permission_unresolved', expectedReturnAt: null, quote, proof: 'none', evidence };
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

// Proof level is not lifecycle state. Lifecycle answers "does the deployed
// system serve this"; proof answers "what have we actually demonstrated". A
// route can be live and still have proved nothing beyond its own price.
//
// This script never pays, so a live HTTP probe can establish at most
// `quote_observed_unpaid`. It may elevate a product to
// `paid_outcome_verified` only after validating an explicit settled proof
// against the current release and the fresh 402 above. It never writes
// `externally_repeated`: owner-funded production proof is not unrelated-customer
// demand, however many times the bounded mechanism was exercised.
const PROOF_NONE = 'none';
const PROOF_QUOTED = 'quote_observed_unpaid';
const PROOF_PAID = 'paid_outcome_verified';

function b10ProofBaseInvariant(proof) {
  const operations = Array.isArray(proof?.operations) ? proof.operations : [];
  return proof?.schemaVersion === 'clervo.search-sandbox-x402-proof.v1'
    && proof.state === 'settled_reconciled'
    && proof.publicOrigin === `${API_ORIGIN}/`
    && proof.releaseCommit === health.releaseId
    && proof.network === 'eip155:8453'
    && proof.asset === '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    && proof.payTo === '0xBd11d82d8Dbd01Ba3eed279d3bACf74659fFca28'
    && proof.facilitatorUrl === 'https://api.cdp.coinbase.com/platform/v2/x402'
    && proof.ownerAuthorization?.originalMaximumSpendAtomic === '16000'
    && proof.ownerAuthorization?.additionalSandboxMaximumSpendAtomic === '10000'
    && proof.ownerAuthorization?.cumulativeMaximumSpendAtomic === '26000'
    && proof.ownerAuthorization?.maximumExecutionCount === 3
    && proof.ownerAuthorization?.paymentEffects === 3
    && proof.ownerAuthorization?.automaticRetry === false
    && operations.length === 3
    && new Set(operations.map(({ operationId }) => operationId)).size === 3
    && new Set(operations.map(({ receiptId }) => receiptId)).size === 3
    && new Set(operations.map(({ transactionHash }) => transactionHash)).size === 3
    && operations.every((operation) => operation.settlementStatus === 'settled'
      && operation.chainStatus === 'confirmed'
      && operation.exactTransferCount === 1
      && operation.replay?.sameOperation === true
      && operation.replay?.sameReceipt === true
      && operation.replay?.sameResult === true
      && operation.replay?.idempotencyReplayed === true
      && operation.replay?.paymentHeaderSent === false
      && operation.replay?.secondAuthorization === false
      && operation.replay?.secondUpstreamExecution === false
      && operation.replay?.secondSettlement === false
      && operation.replay?.secondCharge === false
      && operation.durable?.state === 'completed'
      && operation.durable?.operationRows === 1
      && operation.durable?.accountingRows === 1)
    && operations.reduce((sum, operation) => sum + BigInt(operation.customerChargeAtomic), 0n) === 26000n
    && proof.challengeOnly?.state === 'challenged'
    && proof.challengeOnly?.paymentFingerprint === false
    && proof.challengeOnly?.execution === false
    && proof.challengeOnly?.settlement === false
    && proof.challengeOnly?.response === false
    && proof.challengeOnly?.accountingRows === 0
    && proof.observedBalances?.payerDeltaAtomic === '-26000'
    && proof.observedBalances?.receiverDeltaAtomic === '26000'
    && proof.observedDurability?.databaseIdentityVerified === true
    && proof.observedDurability?.fundedOperationRows === 3
    && proof.observedDurability?.accountingRowsForOperations === 3
    && proof.observedDurability?.receiverLedgerEntryCount === 9
    && proof.observedDurability?.receiverLedgerChainValid === true
    && proof.observedDurability?.receiverLedgerBalanced === true
    && proof.observedDurability?.ambiguousRows === 0
    && proof.observedDurability?.temporaryJobRemoved === true
    && proof.observedDurability?.credentialsLogged === false
    && proof.observedDurability?.customerPayloadsLogged === false
    && proof.proofClassification?.proofLevel === PROOF_PAID
    && proof.proofClassification?.ownerFunded === true
    && proof.proofClassification?.commercialMechanismVerified === true
    && proof.proofClassification?.revenueEvidence === false
    && proof.proofClassification?.demandEvidence === false
    && proof.proofClassification?.unrelatedCustomerEvidence === false
    && proof.proofClassification?.externallyRepeatedClaimAllowed === false;
}

function searchPaidProofValidation(quote) {
  const proof = searchSandboxPaidProof;
  const operation = proof?.operations?.find(({ productId }) => productId === 'search.web');
  const challenge = proof?.observedChallenges?.search;
  const accepted = b10ProofBaseInvariant(proof)
    && challenge?.endpoint === `${API_ORIGIN}/v1/search/paid`
    && challenge?.status === 402
    && challenge?.amountAtomic === quote?.amountAtomic
    && proof.network === quote?.network
    && proof.asset === quote?.asset
    && proof.payTo === quote?.payTo
    && challenge?.networkMatched === true
    && challenge?.assetMatched === true
    && challenge?.payToMatched === true
    && challenge?.facilitatorMatched === true
    && operation?.operationId === 'op_553529bd92403f8bfe16b3c1ae82df3c'
    && operation?.receiptId === 'rcpt_3f185f8ddb2cfe8349b5dcf66a0b326b'
    && operation?.customerChargeAtomic === '6000'
    && operation?.supplierCostAtomic === '2000'
    && operation?.usefulResult === true
    && operation?.resultSummary?.resultCount >= 1
    && operation?.resultSummary?.citationCount >= 1
    && /^clervo\.search\./u.test(operation?.resultSummary?.routeId ?? '')
    && /^qual_[A-Za-z0-9]{20,64}$/u.test(operation?.resultSummary?.qualificationId ?? '')
    && operation?.resultSummary?.degraded === false
    && operation?.resultSummary?.fallback === false;
  if (!accepted) return { accepted: false, reason: proof === null ? 'paid_proof_absent' : 'paid_proof_invariant_failed' };
  return {
    accepted: true, reason: null, proofLevel: PROOF_PAID,
    source: 'infra/production/gcp/search-sandbox-x402-proof.v1.json',
    releaseCommit: proof.releaseCommit, operationCount: 1, totalChargeAtomic: '6000',
    usefulResultCount: 1, replayNoSecondChargeCount: 1, ownerFunded: true,
    revenueEvidence: false, demandEvidence: false, externallyRepeated: false,
  };
}

function sandboxPaidProofValidation() {
  const proof = searchSandboxPaidProof;
  const shortQuote = quoteFrom(surfaceById['api.sandbox_short_execute']);
  const sandbox = proof?.operations?.filter(({ productId }) => productId === 'sandbox.run') ?? [];
  const failed = sandbox.find(({ outcome }) => outcome === 'finished_product_rejected');
  const useful = sandbox.find(({ outcome }) => outcome === 'useful');
  const challenge = proof?.observedChallenges?.sandboxShort;
  const limits = useful?.resultSummary?.requestedLimits;
  const accepted = b10ProofBaseInvariant(proof)
    && surfaceById['api.sandbox_short_execute']?.status === 402
    && shortQuote?.amountAtomic === '10000'
    && shortQuote?.network === proof.network
    && shortQuote?.asset === proof.asset
    && shortQuote?.payTo === proof.payTo
    && challenge?.endpoint === `${API_ORIGIN}/v1/sandbox/execute`
    && challenge?.classId === 'sandbox.short'
    && challenge?.status === 402
    && challenge?.amountAtomic === shortQuote?.amountAtomic
    && challenge?.supplierCostCeilingAtomic === '8000'
    && challenge?.networkMatched === true
    && challenge?.assetMatched === true
    && challenge?.payToMatched === true
    && challenge?.facilitatorMatched === true
    && sandbox.length === 2
    && failed?.operationId === 'op_c73a903173d645b136425e6fe5a3314f'
    && failed?.customerChargeAtomic === '10000'
    && failed?.supplierCostAtomic === '8000'
    && failed?.usefulResult === false
    && failed?.resultSummary?.classId === 'sandbox.short'
    && failed?.resultSummary?.exitCode === 134
    && failed?.resultSummary?.cleanupState === 'destroyed'
    && useful?.operationId === 'op_99abcbe82ce886227475a5e0544d79e9'
    && useful?.receiptId === 'rcpt_aed44093ada8b439088a81344a57a51d'
    && useful?.customerChargeAtomic === '10000'
    && useful?.supplierCostAtomic === '8000'
    && useful?.usefulResult === true
    && useful?.resultSummary?.kind === 'execution'
    && useful?.resultSummary?.classId === 'sandbox.short'
    && useful?.resultSummary?.exitCode === 0
    && useful?.resultSummary?.stdoutBase64 === 'QjEwIHNhbmRib3ggcHJvb2Y='
    && useful?.resultSummary?.sessionState === 'destroyed'
    && useful?.resultSummary?.cleanupState === 'destroyed'
    && useful?.resultSummary?.runtimeIsolation === 'gvisor'
    && useful?.resultSummary?.runtimeImageDigest === 'sha256:07685aab603d011ab3c881a359911f14b7a11bbf175285fdb17a4156eb7d025a'
    && JSON.stringify(limits) === JSON.stringify({ artifactBytes: 1048576, cpuMillis: 5000, diskBytes: 67108864, memoryBytes: 268435456, outputBytes: 65536, processes: 16, wallTimeMs: 10000 })
    && proof.apiReplayEvidence?.paidExecutionCount === 1
    && proof.apiReplayEvidence?.replayCount === 1
    && proof.apiReplayEvidence?.sandboxExecutionRows === 1
    && proof.apiReplayEvidence?.settlementRows === 1
    && proof.apiReplayEvidence?.accountingRows === 1
    && proof.cleanup?.sandboxClaimCount === 0
    && proof.cleanup?.sandboxTemplateCount === 0
    && proof.cleanup?.podCount === 0
    && proof.cleanup?.temporaryManagedJobRemoved === true;
  if (!accepted) return { accepted: false, reason: proof === null ? 'paid_proof_absent' : 'paid_proof_invariant_failed' };
  return {
    accepted: true, reason: null, proofLevel: PROOF_PAID,
    source: 'infra/production/gcp/search-sandbox-x402-proof.v1.json',
    releaseCommit: proof.releaseCommit, operationCount: 2, totalChargeAtomic: '20000',
    usefulResultCount: 1, replayNoSecondChargeCount: 2, ownerFunded: true,
    revenueEvidence: false, demandEvidence: false, externallyRepeated: false,
  };
}

function predictionPaidProofValidation(quote) {
  const proof = predictionPaidProof;
  if (proof === null) return { accepted: false, reason: 'paid_proof_absent' };

  const expectedOperations = ['prediction.markets', 'prediction.market'];
  const operations = Array.isArray(proof.operations) ? proof.operations : [];
  const operationIds = new Set(operations.map(({ operationId }) => operationId));
  const receiptIds = new Set(operations.map(({ receiptId }) => receiptId));
  const requestHashes = new Set(operations.map(({ requestHash }) => requestHash));
  const resultHashes = new Set(operations.map(({ resultHash }) => resultHash));
  const transactionHashes = new Set(operations.map(({ transactionHash }) => transactionHash));

  const invariant = proof.schemaVersion === 'clervo.prediction-x402-proof.v1'
    && proof.state === 'settled_reconciled'
    && proof.publicOrigin === `${API_ORIGIN}/`
    && proof.endpoint === `${API_ORIGIN}/v1/prediction/execute`
    && proof.releaseCommit === health.releaseId
    && proof.network === quote?.network
    && proof.asset === quote?.asset
    && proof.payTo === quote?.payTo
    && proof.observedChallenge?.status === 402
    && proof.observedChallenge?.amountAtomic === quote?.amountAtomic
    && proof.observedChallenge?.networkMatched === true
    && proof.observedChallenge?.assetMatched === true
    && proof.observedChallenge?.payToMatched === true
    && proof.observedChallenge?.facilitatorMatched === true
    && proof.observedChallenge?.paymentAttemptedBeforeOwnerAuthorization === false
    && proof.ownerAuthorization?.maximumSpendAtomic === '4000'
    && proof.ownerAuthorization?.maximumExecutionCount === 2
    && proof.ownerAuthorization?.amountAtomicPerOperation === '2000'
    && proof.ownerAuthorization?.paymentEffects === 2
    && proof.ownerAuthorization?.automaticRetry === false
    && JSON.stringify(proof.ownerAuthorization?.operationsInOrder) === JSON.stringify(expectedOperations)
    && operations.length === 2
    && JSON.stringify(operations.map(({ productId }) => productId)) === JSON.stringify(expectedOperations)
    && operationIds.size === 2
    && receiptIds.size === 2
    && requestHashes.size === 2
    && resultHashes.size === 2
    && transactionHashes.size === 2
    && operations.every((operation) => operation.customerChargeAtomic === '2000'
      && operation.supplierCostAtomic === '0'
      && operation.settlementStatus === 'settled'
      && operation.chainStatus === 'confirmed'
      && operation.exactTransferCount === 1
      && operation.usefulResult === true
      && operation.resultSummary?.freshnessState === 'fresh'
      && operation.resultSummary?.adapterId === 'adapter_prediction.pdata_rest'
      && operation.resultSummary?.sourceId === 'pdata'
      && operation.resultSummary?.license === 'CC BY 4.0'
      && operation.replay?.sameOperation === true
      && operation.replay?.sameReceipt === true
      && operation.replay?.sameResult === true
      && operation.replay?.idempotencyReplayed === true
      && operation.replay?.paymentHeaderSent === false
      && operation.replay?.secondAuthorization === false
      && operation.replay?.secondCharge === false
      && operation.durable?.state === 'completed'
      && operation.durable?.operationRows === 1
      && operation.durable?.accountingRows === 1)
    && operations.reduce((sum, operation) => sum + BigInt(operation.customerChargeAtomic), 0n) === 4000n
    && proof.observedBalances?.payerDeltaAtomic === '-4000'
    && proof.observedBalances?.receiverDeltaAtomic === '4000'
    && proof.observedDurability?.databaseIdentityVerified === true
    && proof.observedDurability?.operationRows === 2
    && proof.observedDurability?.accountingRowsForOperations === 2
    && proof.observedDurability?.receiverLedgerChainValid === true
    && proof.observedDurability?.receiverLedgerBalanced === true
    && proof.observedDurability?.temporaryJobRemoved === true
    && proof.proofClassification?.proofLevel === PROOF_PAID
    && proof.proofClassification?.ownerFunded === true
    && proof.proofClassification?.commercialMechanismVerified === true
    && proof.proofClassification?.revenueEvidence === false
    && proof.proofClassification?.demandEvidence === false
    && proof.proofClassification?.unrelatedCustomerEvidence === false
    && proof.proofClassification?.externallyRepeatedClaimAllowed === false
    && proof.cleanup?.loopbackServersStopped === true
    && proof.cleanup?.browserTunnelsStopped === true
    && proof.cleanup?.temporaryManagedJobRemoved === true;

  if (!invariant) return { accepted: false, reason: 'paid_proof_invariant_failed' };
  return {
    accepted: true,
    reason: null,
    proofLevel: PROOF_PAID,
    source: 'infra/production/gcp/prediction-x402-proof.v1.json',
    releaseCommit: proof.releaseCommit,
    operationCount: operations.length,
    totalChargeAtomic: '4000',
    usefulResultCount: operations.filter(({ usefulResult }) => usefulResult).length,
    replayNoSecondChargeCount: operations.filter(({ replay }) => replay?.secondCharge === false).length,
    ownerFunded: true,
    revenueEvidence: false,
    demandEvidence: false,
    externallyRepeated: false,
  };
}

function cryptoPaidProofValidation(quote) {
  const proof = cryptoPaidProof;
  if (proof === null) return { accepted: false, reason: 'paid_proof_absent' };

  const expectedOperations = ['crypto.wallet.report', 'crypto.wallet.transactions'];
  const expectedCharges = ['4000', '3000'];
  const operations = Array.isArray(proof.operations) ? proof.operations : [];
  const unique = (field) => new Set(operations.map((operation) => operation[field])).size === operations.length;
  const invariant = proof.schemaVersion === 'clervo.crypto-x402-proof.v1'
    && proof.state === 'settled_reconciled'
    && proof.publicOrigin === `${API_ORIGIN}/`
    && proof.endpoint === `${API_ORIGIN}/v1/crypto/execute`
    && proof.releaseCommit === health.releaseId
    && proof.network === quote?.network
    && proof.asset === quote?.asset
    && proof.payTo === quote?.payTo
    && proof.observedChallenge?.status === 402
    && proof.observedChallenge?.amountAtomic === quote?.amountAtomic
    && proof.observedChallenge?.networkMatched === true
    && proof.observedChallenge?.assetMatched === true
    && proof.observedChallenge?.payToMatched === true
    && proof.observedChallenge?.facilitatorMatched === true
    && proof.observedChallenge?.paymentAttemptedBeforeOwnerAuthorization === false
    && proof.ownerAuthorization?.maximumSpendAtomic === '7000'
    && proof.ownerAuthorization?.maximumExecutionCount === 2
    && proof.ownerAuthorization?.paymentEffects === 2
    && proof.ownerAuthorization?.automaticRetry === false
    && JSON.stringify(proof.ownerAuthorization?.operationsInOrder) === JSON.stringify(expectedOperations)
    && JSON.stringify(proof.ownerAuthorization?.amountAtomicByOperation) === JSON.stringify(Object.fromEntries(expectedOperations.map((operation, index) => [operation, expectedCharges[index]])))
    && operations.length === 2
    && JSON.stringify(operations.map(({ productId }) => productId)) === JSON.stringify(expectedOperations)
    && JSON.stringify(operations.map(({ customerChargeAtomic }) => customerChargeAtomic)) === JSON.stringify(expectedCharges)
    && ['operationId', 'receiptId', 'requestHash', 'resultHash', 'transactionHash'].every(unique)
    && operations.every((operation) => operation.supplierCostAtomic === '0'
      && operation.settlementStatus === 'settled'
      && operation.chainStatus === 'confirmed'
      && operation.exactTransferCount === 1
      && operation.usefulResult === true
      && operation.resultSummary?.freshnessState === 'fresh'
      && operation.resultSummary?.adapterId === 'adapter_crypto.blockscout_value_added'
      && operation.resultSummary?.sourceClass === 'indexed_public_blockchain_data'
      && operation.resultSummary?.thirdPartyLabelsUsed === false
      && Array.isArray(operation.resultSummary?.servedChains)
      && operation.resultSummary.servedChains.length >= 1
      && operation.replay?.sameOperation === true
      && operation.replay?.sameReceipt === true
      && operation.replay?.sameResult === true
      && operation.replay?.idempotencyReplayed === true
      && operation.replay?.paymentHeaderSent === false
      && operation.replay?.secondAuthorization === false
      && operation.replay?.secondUpstreamExecution === false
      && operation.replay?.secondCharge === false
      && operation.durable?.state === 'completed'
      && operation.durable?.operationRows === 1
      && operation.durable?.accountingRows === 1)
    && operations.reduce((sum, operation) => sum + BigInt(operation.customerChargeAtomic), 0n) === 7000n
    && proof.observedBalances?.payerDeltaAtomic === '-7000'
    && proof.observedBalances?.receiverDeltaAtomic === '7000'
    && proof.observedDurability?.databaseIdentityVerified === true
    && proof.observedDurability?.operationRows === 2
    && proof.observedDurability?.accountingRowsForOperations === 2
    && proof.observedDurability?.receiverLedgerChainValid === true
    && proof.observedDurability?.receiverLedgerBalanced === true
    && proof.observedDurability?.temporaryJobRemoved === true
    && proof.proofClassification?.proofLevel === PROOF_PAID
    && proof.proofClassification?.ownerFunded === true
    && proof.proofClassification?.commercialMechanismVerified === true
    && proof.proofClassification?.revenueEvidence === false
    && proof.proofClassification?.demandEvidence === false
    && proof.proofClassification?.unrelatedCustomerEvidence === false
    && proof.proofClassification?.externallyRepeatedClaimAllowed === false
    && proof.cleanup?.temporaryManagedJobRemoved === true;

  if (!invariant) return { accepted: false, reason: 'paid_proof_invariant_failed' };
  return {
    accepted: true,
    reason: null,
    proofLevel: PROOF_PAID,
    source: 'infra/production/gcp/crypto-x402-proof.v1.json',
    releaseCommit: proof.releaseCommit,
    operationCount: operations.length,
    totalChargeAtomic: '7000',
    usefulResultCount: operations.filter(({ usefulResult }) => usefulResult).length,
    replayNoSecondChargeCount: operations.filter(({ replay }) => replay?.secondCharge === false).length,
    ownerFunded: true,
    revenueEvidence: false,
    demandEvidence: false,
    externallyRepeated: false,
  };
}

function productFromProbes({ id, label, operations, probeIds, freeProbeId = null, commercialBlocker = null, paidProof = null }) {
  if (commercialBlocker !== null) {
    return {
      id,
      label,
      operations: [...operations].sort(),
      state: STATE_UNAVAILABLE,
      reason: commercialBlocker,
      expectedReturnAt: null,
      publiclyReachable: false,
      proof: PROOF_NONE,
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

  const paidOutcome = typeof paidProof === 'function' ? paidProof(quote) : null;
  const proof = state === STATE_LIVE
    ? paidOutcome?.accepted === true ? paidOutcome.proofLevel : PROOF_QUOTED
    : PROOF_NONE;

  return {
    id,
    label,
    operations: [...operations].sort(),
    state,
    reason,
    expectedReturnAt: null,
    publiclyReachable: paid.reachable && paid.status !== 404,
    proof,
    observedQuote: quote,
    freeEntry: free === null ? null : {
      route: free.url,
      withIdempotencyKeyStatus: free.status,
      withoutIdempotencyKeyStatus: naive?.status ?? null,
      acceptsNaiveRequest: naive?.status === 200,
      naiveRejectionCode: naive?.status === 200 ? null : problemCode(naive ?? {}),
      // An observed 200 on a free path is a real free outcome from a public
      // URL. It is recorded as an observation, never promoted into a paid
      // proof level.
      freeOutcomeObserved: free.status === 200,
    },
    evidence: {
      probed: true,
      edgeStatus: paid.status,
      edgeCode: problemCode(paid),
      edgeAttempts: paid.attempts ?? 1,
      ...(paidOutcome === null ? {} : { paidOutcome }),
    },
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
  proof: aiLiveRoutes.length > 0 ? PROOF_QUOTED : PROOF_NONE,
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
    paidProof: searchPaidProofValidation,
  }),
  aiProductRecord,
  productFromProbes({
    id: 'sandbox',
    label: 'Secure Sandbox',
    operations: ['sandbox.run', 'sandbox.session.create', 'sandbox.session.exec', 'sandbox.artifact.get', 'sandbox.session.destroy'],
    probeIds: { paid: 'api.sandbox_execute' },
    paidProof: sandboxPaidProofValidation,
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
    probeIds: { paid: 'api.prediction_execute' },
    paidProof: predictionPaidProofValidation,
  }),
  productFromProbes({
    id: 'crypto_intelligence',
    label: 'Crypto Intelligence',
    operations: ['crypto.wallet.balances', 'crypto.wallet.tokens', 'crypto.wallet.transactions', 'crypto.wallet.report'],
    probeIds: { paid: 'api.crypto_execute' },
    paidProof: cryptoPaidProofValidation,
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
// CDP x402 Bazaar state
// ---------------------------------------------------------------------------
//
// Bazaar listing is a fact about our resources that lives outside our own
// system, so it is observed the same way everything else here is: by asking CDP
// and recording what it answered. Two independent questions are asked.
//
//   * The validator says whether a resource is *eligible* to be indexed —
//     whether the 402 it serves passes every required check. It reads the live
//     402 itself and needs no credential.
//   * The merchant discovery endpoint says whether a resource is *actually
//     indexed*. Only a settled payment through the CDP facilitator puts it
//     there, so this stays empty until a real settlement happens. It is
//     recorded either way, because "not indexed" is the honest current answer.
//
// Neither call pays, signs, or authorizes anything.

const BAZAAR_VALIDATE_URL = 'https://api.cdp.coinbase.com/platform/v2/x402/validate';
const BAZAAR_MERCHANT_URL = 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant';

const bazaarResourcePaths = [
  { productId: 'search', resourcePath: '/v1/search/paid' },
  { productId: 'ai', resourcePath: '/v1/ai/execute' },
  { productId: 'sandbox', resourcePath: '/v1/sandbox/execute' },
  { productId: 'prediction', resourcePath: '/v1/prediction/execute' },
  { productId: 'crypto_intelligence', resourcePath: '/v1/crypto/execute' },
];

// The receiver is read from the quote the deployed system actually returned,
// never from configuration, so the merchant lookup can only ever ask about the
// address production is really advertising.
const observedPayTo = [surfaceById['api.search_paid'], surfaceById['api.sandbox_execute'], surfaceById['api.prediction_execute'], surfaceById['api.crypto_execute'], ...routeProbes]
  .map((probe) => quoteFrom(probe)?.payTo)
  .find((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/u.test(value)) ?? null;

const merchantProbe = observedPayTo === null
  ? null
  : await observe('bazaar.merchant', `${BAZAAR_MERCHANT_URL}?payTo=${observedPayTo}`);

const indexedByResource = new Map();
for (const item of Array.isArray(merchantProbe?.body?.resources) ? merchantProbe.body.resources : []) {
  if (typeof item?.resource === 'string') indexedByResource.set(item.resource, item);
}

const bazaarResources = [];
for (const { productId, resourcePath } of bazaarResourcePaths) {
  const resource = `${API_ORIGIN}${resourcePath}`;
  const validation = await observe(`bazaar.validate.${productId}`, BAZAAR_VALIDATE_URL,
    postJson({ resource, method: 'POST' }));
  const checks = Array.isArray(validation.body?.preflight) ? validation.body.preflight : [];
  const indexed = indexedByResource.get(resource) ?? null;
  bazaarResources.push({
    productId,
    resource,
    // `valid` is CDP's own verdict on the live 402. Recorded as observed, and
    // null when the validator itself could not be reached — an unreachable
    // validator is not a failed resource.
    validatorReachable: validation.reachable && validation.status === 200,
    valid: validation.body?.valid ?? null,
    // Only the checks that actually failed, and only their identity and
    // severity. Enough to act on, and it cannot grow into a copy of CDP's
    // response inside our registry.
    failedChecks: checks.filter((check) => check.passed === false)
      .map((check) => ({ check: check.check ?? null, severity: check.severity ?? null, expected: check.expected ?? null, actual: check.actual ?? null }))
      .sort((left, right) => String(left.check).localeCompare(String(right.check))),
    // Indexing is a separate fact from eligibility: a resource can be fully
    // valid and still be absent from the catalog until a payment settles. The
    // merchant listing proves presence; the validator carries the crawl state.
    indexed: indexed !== null,
    indexActive: validation.body?.index?.active ?? indexed?.index?.active ?? null,
    indexLastCrawledAt: validation.body?.index?.lastCrawledAt ?? indexed?.index?.lastCrawledAt ?? null,
  });
}

const bazaar = {
  facilitator: 'https://api.cdp.coinbase.com/platform/v2/x402',
  validator: BAZAAR_VALIDATE_URL,
  payTo: observedPayTo,
  merchantLookupReachable: merchantProbe !== null && merchantProbe.reachable && merchantProbe.status === 200,
  indexedResourceCount: bazaarResources.filter((entry) => entry.indexed).length,
  note: 'Indexing triggers only on a payment settled through the CDP facilitator. A valid resource that has never been paid for is eligible and unindexed, which is not a defect.',
  resources: bazaarResources.sort((left, right) => left.resource.localeCompare(right.resource)),
};

// ---------------------------------------------------------------------------
// Assemble and write
// ---------------------------------------------------------------------------

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
  // Lifecycle state and proof level are different things, and conflating them
  // is what once let a quote be mistaken for a working product. Every public
  // surface renders both.
  proofLevels: {
    none: 'nothing demonstrated',
    quote_observed_unpaid: 'publicly offered, a price was returned, and a valid payment challenge was formed; nothing else',
    paid_outcome_verified: 'we paid once, a useful result came back, the receipt was accurate, the replay matched, and the retry did not double-charge',
    externally_repeated: 'an unrelated party did it, more than once',
  },
  proofCeiling: {
    level: products.some(({ proof }) => proof === PROOF_PAID) ? PROOF_PAID : PROOF_QUOTED,
    reason: products.some(({ proof }) => proof === PROOF_PAID)
      ? 'the live probe itself never pays; paid_outcome_verified additionally requires a settled proof record validated against the current release and current quote; externally_repeated still requires unrelated-customer evidence'
      : 'this prober never pays and no current-release settled proof record was accepted, so it cannot establish a paid or externally repeated proof level',
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
    conformanceDefectsOpen: conformance.filter((check) => !check.conformant).length,
    bazaarValidResources: bazaar.resources.filter((entry) => entry.valid === true).length,
    bazaarIndexedResources: bazaar.indexedResourceCount,
  },
  products,
  aiRoutes,
  bazaar,
  discoverySurfaces,
  conformance,
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
console.log(`  bazaar          valid ${registry.summary.bazaarValidResources}/${bazaar.resources.length}, indexed ${registry.summary.bazaarIndexedResources}`);
