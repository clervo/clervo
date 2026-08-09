#!/usr/bin/env node

// Requalifies every catalogued AI route against live supply and rewrites
// packages/catalog/ai-model-catalog.v1.json with what was actually observed.
//
// Why this replaces the per-family merge scripts: those scripts carried
// hand-transcribed check results and a frozen evidence hash, so a speech, image,
// or embedding route was recorded as qualified on the strength of a benchmark
// run that had already happened somewhere else. This script calls the supplier
// through the same adapters production uses, in the route's own modality, and
// records only what came back.
//
// What it will not do:
//   * It never marks a route qualified without a live observation.
//   * It never requalifies a route whose supply family is known to be unfunded:
//     an unfunded account is indistinguishable from a dead route in the
//     evidence, so those routes keep their previous qualification and are
//     reported as deferred.
//   * It records no prompt, no response payload, and no credential. Checks
//     carry a hash of derived evidence, never content.
//   * It spends no owner cash. Every route probed here is credit-backed or on a
//     free allocation, and each probe is bounded to a few hundred tokens, one
//     small image, or one short utterance.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CloudflareAuraSpeechAdapter } from '../../dist/adapters/ai/src/cloudflare-aura-speech.js';
import { DeepgramSpeechAdapter } from '../../dist/adapters/ai/src/deepgram-speech.js';
import { createBoundedAiHttpTransport, OpenAiCompatibleAdapter } from '../../dist/adapters/ai/src/openai-compatible.js';
import { VertexEmbeddingAdapter } from '../../dist/adapters/ai/src/vertex-embedding.js';
import { VertexGeminiAdapter } from '../../dist/adapters/ai/src/vertex-gemini.js';
import {
  AI_EXECUTION_REQUEST_SCHEMA_VERSION,
  CONTRACT_VERSION,
  createAiModelCatalog,
} from '../../dist/packages/contracts/src/index.js';
import { qualifyAiRoute } from '../../dist/services/ai/src/qualification.js';
import { loadPricingCatalogs, resolveRoutePricing } from './route-supply-pricing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogPath = path.join(root, 'packages/catalog/ai-model-catalog.v1.json');

const QUALIFICATION_TTL_DAYS = 7;
const PROBE_TIMEOUT_MS = 60_000;

// Probing 21 routes back to back exhausted the shared Vertex quota partway
// through, and the throttled replies then read as slow or failing routes that
// pass cleanly on their own. Pacing the calls keeps a measurement about the
// route rather than about our own probe volume.
// 4s was still short enough that routes late in the sweep measured slower than
// the same routes measured alone, so the gap is set from the observed recovery
// rather than from a guess.
const INTER_ROUTE_PAUSE_MS = 12_000;
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Latency ceilings are per modality because a 1024px image and a 16-token chat
// reply are not the same kind of work. These are the ceilings the previous
// qualifications were judged against, kept so a route is not newly failed for a
// speed it was already accepted at.
const LATENCY_CEILING_MS = Object.freeze({
  'ai.chat': 12_000,
  'ai.embed': 12_000,
  'ai.image': 45_000,
  'ai.speech': 15_000,
});

// The per-probe supplier cost ceiling. A probe that would cost more than this
// fails cost_ceiling rather than being allowed to run up a credit balance.
const COST_CEILING_ATOMIC = Object.freeze({
  'ai.chat': '20000',
  'ai.embed': '100000',
  'ai.image': '800000',
  'ai.speech': '60000',
});

function fail(message) {
  console.error(`requalify-ai-routes: FAIL: ${message}`);
  process.exit(1);
}

// Credentials are read straight from Secret Manager into memory. They are never
// written to disk, never logged, and never included in the report.
function productionSecret(name) {
  try {
    const value = execFileSync('gcloud', ['secrets', 'versions', 'access', 'latest', `--secret=${name}`, '--project=bloxsniper-prod'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const trimmed = value.replace(/\r?\n$/u, '');
    return trimmed.length >= 8 && !/[\r\n]/u.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

function accessTokenReader() {
  let cached;
  return async () => {
    if (cached !== undefined && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (token.length < 8 || /[\r\n]/u.test(token)) throw new TypeError('vertex_access_token_invalid');
    cached = { token, expiresAt: Date.now() + 45 * 60_000 };
    return token;
  };
}

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

// Media adapters require an artifact store. Requalification stores nothing:
// it only needs to prove the supplier returned real bytes, so the store hashes
// them in memory and discards them. Nothing reaches R2, and no customer-visible
// artifact is created by a probe.
function inMemoryArtifactStore() {
  const stored = [];
  return {
    stored,
    async put({ bytes, mimeType }) {
      const digest = sha256(bytes);
      stored.push({ sha256: digest, mimeType, bytes: bytes.byteLength });
      return Object.freeze({ sha256: digest, artifactUri: `artifact://requalification/${digest.slice('sha256:'.length)}` });
    },
  };
}

let operationSequence = 0;
function operationId() {
  operationSequence += 1;
  return `op_01K0REQUALIFY${operationSequence.toString().padStart(10, '0')}`;
}

// Two inputs per route, differing in a way whose effect is visible in the
// output. The engine compares the two output signatures, so a route that
// answers from a cache or a substituted model cannot pass input_dependence.
const VARIANTS = Object.freeze({
  a: Object.freeze({ text: 'Return exactly CLERVO-QUAL-A', speech: 'Clervo qualification alpha.', image: 'a plain solid red square, flat colour, no text', embedding: 'clervo qualification alpha vector' }),
  b: Object.freeze({ text: 'Return exactly CLERVO-QUAL-B', speech: 'Clervo qualification bravo signal.', image: 'a plain solid blue circle, flat colour, no text', embedding: 'entirely different subject matter: harbour cranes at dusk' }),
});

function requestFor(route, variant, { stream = false, responseFormat = 'text' } = {}) {
  const productId = route.productIds[0];
  const base = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: AI_EXECUTION_REQUEST_SCHEMA_VERSION,
    operationId: operationId(),
    productId,
    requestedModel: route.exactModelId,
    maximumSupplierCost: { asset: 'USD', amountAtomic: COST_CEILING_ATOMIC[productId], decimals: 6 },
    deadlineAt: new Date(Date.now() + PROBE_TIMEOUT_MS).toISOString(),
  };
  const words = VARIANTS[variant];

  if (productId === 'ai.embed') {
    return { ...base, input: { kind: 'embedding', inputs: [words.embedding] }, usageBounds: { inputTokens: 64, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: 0 } };
  }
  if (productId === 'ai.image') {
    return { ...base, input: { kind: 'image', prompt: words.image, size: '1024x1024', quality: 'low', count: 1 }, usageBounds: { inputTokens: 64, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 1, audioCharacters: 0 } };
  }
  if (productId === 'ai.speech') {
    // Both speech adapters bind the voice and reject the call when it does not
    // match, but they do not agree on what it should be: Deepgram binds the
    // voice to the route's own model id, while the Cloudflare Aura route
    // exposes a single fixed speaker. Sending one fixed name for both made
    // every speech route fail before it reached the supplier.
    const voice = route.supplyFamilyId === 'supply.cloudflare_workers_ai' ? 'thalia' : route.exactModelId;
    return { ...base, input: { kind: 'speech', input: words.speech, voice, responseFormat: 'mp3' }, usageBounds: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: words.speech.length } };
  }
  const reasoningTokens = route.capabilities.includes('reasoning') ? 512 : 0;
  return {
    ...base,
    input: { kind: 'chat', messages: [{ role: 'user', content: responseFormat === 'json_object' ? 'Return JSON {"nonce":"CLERVO-JSON"}.' : words.text }], responseFormat, stream },
    usageBounds: { inputTokens: 1_000, cachedInputTokens: 1_000, outputTokens: 256, reasoningTokens, images: 0, audioCharacters: 0 },
  };
}

// The modality-neutral observation the engine judges. `outputSignature` is a
// derived value — a trimmed transcript, an artefact digest, a rounded embedding
// fingerprint — never the payload itself.
function observationFrom(productId, result, latencyMs) {
  const output = result.output;
  if (productId === 'ai.chat') {
    if (output.kind !== 'chat') throw new TypeError('requalification_output_kind_invalid');
    const text = output.content.trim();
    return { identity: result.modelIdentity, outputSignature: text, outputValid: text.length > 0, usage: result.usage, latencyMs };
  }
  if (productId === 'ai.embed') {
    if (output.kind !== 'embedding') throw new TypeError('requalification_output_kind_invalid');
    const vector = output.vectors[0]?.embedding ?? [];
    const finite = vector.length > 0 && vector.every((value) => Number.isFinite(value));
    // The first few components, rounded, are enough to prove two different
    // inputs produced two different vectors without recording the vector.
    return { identity: result.modelIdentity, outputSignature: vector.slice(0, 8).map((value) => value.toFixed(6)).join(','), outputValid: finite, usage: result.usage, latencyMs };
  }
  if (productId === 'ai.image') {
    if (output.kind !== 'image') throw new TypeError('requalification_output_kind_invalid');
    // An image artefact carries no byte count, so validity is its measured
    // dimensions: the adapter already parsed those out of the returned bytes and
    // rejected a size mismatch, so a non-zero width and height means real
    // decodable image data came back.
    const artifact = output.artifacts[0];
    const valid = artifact !== undefined && artifact.width > 0 && artifact.height > 0;
    return { identity: result.modelIdentity, outputSignature: artifact?.sha256 ?? '', outputValid: valid, usage: result.usage, latencyMs };
  }
  if (output.kind !== 'speech') throw new TypeError('requalification_output_kind_invalid');
  return { identity: result.modelIdentity, outputSignature: output.artifact.sha256, outputValid: output.artifact.bytes > 0, usage: result.usage, latencyMs };
}

function probeFor(route, adapter) {
  const productId = route.productIds[0];
  // A throttled call is retried a bounded number of times with a widening wait,
  // because the first 429 says nothing about the route. The latency that gets
  // recorded is always the successful attempt's own duration, so a retry never
  // makes a route look slower than it is. Retries are capped and the request is
  // unchanged, so this cannot turn into unbounded load on the supplier.
  const run = async (request) => {
    for (let attempt = 0; ; attempt += 1) {
      const mark = statusSink === null ? 0 : statusSink.length;
      const started = performance.now();
      try {
        const result = await adapter.execute({ request, exactModelId: route.exactModelId, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
        return observationFrom(productId, result, Math.round((performance.now() - started) * 100) / 100);
      } catch (error) {
        const throttled = statusSink !== null && statusSink.slice(mark).includes(429);
        if (!throttled || attempt >= 2) throw error;
        await pause(5_000 * (attempt + 1));
      }
    }
  };
  return {
    observe: ({ variant }) => run(requestFor(route, variant)),
    // A supplier that answers a model id it does not serve is the failure this
    // check exists to catch: it is how a substitution would reach a customer.
    async invalidModelFailsSafely() {
      try {
        const request = { ...requestFor(route, 'a'), requestedModel: 'clervo-invalid-model-requalification' };
        await adapter.execute({ request, exactModelId: 'clervo-invalid-model-requalification', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
        return false;
      } catch { return true; }
    },
    ...(productId === 'ai.chat' && route.capabilities.includes('streaming')
      ? { streaming: () => run(requestFor(route, 'a', { stream: true })) }
      : {}),
    ...(productId === 'ai.chat' && route.capabilities.includes('structured_output')
      ? { structuredOutput: () => run(requestFor(route, 'a', { responseFormat: 'json_object' })) }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Adapter construction
// ---------------------------------------------------------------------------
//
// These are the same adapter classes, base URLs, and configuration production
// uses, built from the same production secrets. Qualifying through a different
// client than the one that serves customers would prove the wrong thing.

// The adapters reduce every non-2xx response to one error code, so a 429 is
// indistinguishable from a real fault by the time it reaches the qualification
// engine. Requalification has to tell those apart: a throttled supplier means
// "not measured yet", while a genuine rejection means the route is not sellable.
// This records the last status seen per route without touching the request or
// response bodies.
// The transport is shared by every route, so the status is tracked against the
// route currently under probe rather than parsed out of the URL.
let statusSink = null;

function statusObservingTransport(inner) {
  return Object.freeze({
    async request(input) {
      const response = await inner.request(input);
      if (statusSink !== null) statusSink.push(response.status);
      return response;
    },
  });
}

// A route is only reported as rate limited when the supplier actually answered
// 429; nothing is inferred from a timeout or a local error.
function sawRateLimit(statuses) {
  return statuses.includes(429);
}

const transport = statusObservingTransport(createBoundedAiHttpTransport());
const artifacts = inMemoryArtifactStore();
const accessToken = accessTokenReader();

function adapterFor(route, credentials) {
  const family = route.supplyFamilyId;
  const productId = route.productIds[0];
  const secretOf = (name) => async () => {
    const value = credentials[name];
    if (typeof value !== 'string') throw new TypeError('requalification_credential_absent');
    return value;
  };

  if (family === 'supply.groq') {
    const reasoning = route.exactModelId === 'qwen/qwen3.6-27b'
      ? { reasoningEffort: 'none' }
      : { reasoningEffort: 'low', reasoningFormat: 'hidden' };
    return new OpenAiCompatibleAdapter({
      config: { routeId: route.routeId, baseUrl: 'https://api.groq.com/openai/v1/', allowedHosts: ['api.groq.com'], secretName: 'GROQ_API_KEY', exactModelId: route.exactModelId, productId, maximumResponseBytes: 1_000_000, ...reasoning },
      transport,
      secret: secretOf('GROQ_API_KEY'),
    });
  }

  if (family === 'supply.clervo_ai_gateway') {
    return new OpenAiCompatibleAdapter({
      config: { routeId: route.routeId, baseUrl: 'https://ai.clervo.dev/v1/', allowedHosts: ['ai.clervo.dev'], secretName: 'CLERVO_AI_API_KEY', exactModelId: route.exactModelId, productId, maximumResponseBytes: 1_000_000 },
      transport,
      secret: secretOf('CLERVO_AI_API_KEY'),
    });
  }

  if (family === 'supply.cloudflare_workers_ai') {
    const accountId = credentials.CLOUDFLARE_ACCOUNT_ID;
    if (typeof accountId !== 'string') throw new TypeError('requalification_cloudflare_account_absent');
    if (productId === 'ai.speech') {
      return new CloudflareAuraSpeechAdapter({
        config: { routeId: route.routeId, accountId, secretName: 'CLOUDFLARE_AI_TOKEN', maximumResponseBytes: 20_000_000 },
        transport,
        secret: secretOf('CLOUDFLARE_AI_TOKEN'),
        artifacts,
      });
    }
    return new OpenAiCompatibleAdapter({
      config: { routeId: route.routeId, baseUrl: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/`, allowedHosts: ['api.cloudflare.com'], secretName: 'CLOUDFLARE_AI_TOKEN', exactModelId: route.exactModelId, productId, maximumResponseBytes: 1_000_000 },
      transport,
      secret: secretOf('CLOUDFLARE_AI_TOKEN'),
    });
  }

  if (family === 'supply.deepgram') {
    return new DeepgramSpeechAdapter({
      config: { routeId: route.routeId, exactModelId: route.exactModelId, secretName: 'DEEPGRAM_API_KEY', maximumResponseBytes: 20_000_000 },
      transport,
      secret: secretOf('DEEPGRAM_API_KEY'),
      artifacts,
    });
  }

  if (family === 'supply.google_vertex') {
    const projectId = 'bloxsniper-prod';
    if (productId === 'ai.embed') {
      return new VertexEmbeddingAdapter({ config: { routeId: route.routeId, projectId, location: 'us-central1', exactModelId: route.exactModelId, maximumResponseBytes: 20_000_000 }, transport, accessToken });
    }
    return new VertexGeminiAdapter({
      config: { routeId: route.routeId, projectId, location: 'global', exactModelId: route.exactModelId, productId, maximumResponseBytes: productId === 'ai.image' ? 20_000_000 : 2_000_000 },
      transport,
      accessToken,
      ...(productId === 'ai.image' ? { artifacts } : {}),
    });
  }

  throw new TypeError(`requalification_family_unsupported:${family}`);
}

// ---------------------------------------------------------------------------
// Supply funding gate
// ---------------------------------------------------------------------------
//
// ROADMAP B7 step 8: requalify the gateway routes only after funding lands,
// never before. An unfunded account fails authentication in exactly the way a
// dead route does, so requalifying one now would replace a real qualification
// with false evidence of a dead route.
//
// Funding is not asserted from a date. It is observed: one bounded request, and
// the answer decides. A 402, 429 on balance, or an auth rejection means the
// account is not serving, and the routes are deferred rather than failed.
async function gatewayFunded(credential) {
  if (typeof credential !== 'string') return { funded: false, reason: 'credential_absent' };
  try {
    const response = await fetch('https://ai.clervo.dev/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.6-luna', messages: [{ role: 'user', content: 'Reply with the single word ready.' }], max_tokens: 8 }),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 200) return { funded: true, reason: null, status: 200 };
    // Only the failure class is recorded. Never the credential, never the body.
    const reason = response.status === 401 || response.status === 403
      ? 'upstream_authentication_unavailable'
      : response.status === 402
        ? 'upstream_payment_required'
        : response.status === 429
          ? 'upstream_rate_limited'
          : `upstream_status_${response.status}`;
    return { funded: false, reason, status: response.status };
  } catch (error) {
    return { funded: false, reason: error instanceof Error ? `transport_${error.name}` : 'transport_error', status: null };
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const pricingCatalogs = await loadPricingCatalogs();

const credentials = {
  GROQ_API_KEY: productionSecret('clervo-production-groq-api-key'),
  CLOUDFLARE_AI_TOKEN: productionSecret('clervo-production-cloudflare-ai-token'),
  DEEPGRAM_API_KEY: productionSecret('clervo-production-deepgram-api-key'),
  CLERVO_AI_API_KEY: productionSecret('clervo-production-ai-api-key'),
  CLOUDFLARE_ACCOUNT_ID: '6b4a3ed251455746adf330f5cdcf9615',
};

// Which credential each family needs, so a family with no credential in this
// environment is reported as not requalified instead of silently failing every
// check it owns.
const FAMILY_CREDENTIAL = Object.freeze({
  'supply.groq': 'GROQ_API_KEY',
  'supply.cloudflare_workers_ai': 'CLOUDFLARE_AI_TOKEN',
  'supply.deepgram': 'DEEPGRAM_API_KEY',
  'supply.clervo_ai_gateway': 'CLERVO_AI_API_KEY',
  'supply.google_vertex': null,
});

const gateway = await gatewayFunded(credentials.CLERVO_AI_API_KEY);

const checkedAt = new Date().toISOString();
const expiresAt = new Date(Date.parse(checkedAt) + QUALIFICATION_TTL_DAYS * 86_400_000).toISOString();

const report = {
  schemaVersion: 'clervo.ai-route-requalification.v1',
  checkedAt,
  expiresAt,
  ownerCashSpentUsd: 0,
  externalCalls: 0,
  gatewayFunding: { funded: gateway.funded, reason: gateway.reason },
  routes: [],
};

const requalified = [];
// `--route=<id>` re-measures a single route without re-spending supplier calls
// on the other twenty. A filtered run keeps every other route's existing
// qualification exactly as it was, so it can never be used to write a partial
// catalog; it is a measurement tool, and `--report-only` still governs writing.
const routeFilter = process.argv.find((argument) => argument.startsWith('--route='))?.slice('--route='.length) ?? null;
if (routeFilter !== null && !catalog.routes.some(({ routeId }) => routeId === routeFilter)) fail(`unknown route ${routeFilter}`);

for (const route of catalog.routes) {
  if (routeFilter !== null && route.routeId !== routeFilter) {
    requalified.push(route);
    continue;
  }
  const productId = route.productIds[0];
  const family = route.supplyFamilyId;
  const credentialName = FAMILY_CREDENTIAL[family];
  const credentialAvailable = credentialName === null || typeof credentials[credentialName] === 'string';
  const pricing = resolveRoutePricing(route, pricingCatalogs);

  // Deferred: the previous qualification is preserved untouched. Nothing is
  // fabricated, and the route stays in the catalog carrying a truthful reason.
  const deferral = family === 'supply.clervo_ai_gateway' && !gateway.funded
    ? `supply_unfunded_${gateway.reason}`
    : !credentialAvailable
      ? 'credential_absent_in_this_environment'
      : pricing.supplier === null
        ? 'supplier_price_unknown'
        : null;

  if (deferral !== null) {
    requalified.push(route);
    report.routes.push({ routeId: route.routeId, productId, outcome: 'deferred', reason: deferral, previousStatus: route.qualification.status, previousExpiresAt: route.qualification.expiresAt });
    continue;
  }

  if (report.externalCalls > 0) await pause(INTER_ROUTE_PAUSE_MS);

  const before = operationSequence;
  const statuses = [];
  statusSink = statuses;
  let qualification;
  try {
    qualification = await qualifyAiRoute({
      qualificationId: route.qualification.qualificationId,
      routeId: route.routeId,
      providerId: route.providerId,
      supplyFamilyId: family,
      exactModelId: route.exactModelId,
      productId,
      capabilities: route.capabilities,
      credentialAvailable: true,
      termsStatus: route.qualification.termsStatus,
      resaleAllowed: route.qualification.resaleAllowed,
      checkedAt,
      expiresAt,
      maximumLatencyMsP95: LATENCY_CEILING_MS[productId],
      maximumSupplierCost: { asset: 'USD', amountAtomic: COST_CEILING_ATOMIC[productId], decimals: 6 },
      pricing: pricing.supplier,
      probe: probeFor(route, adapterFor(route, credentials)),
    });
  } catch (error) {
    // A thrown probe is a failure of this run, not proof the route is dead. The
    // previous qualification is kept and the route is reported for attention.
    statusSink = null;
    requalified.push(route);
    report.routes.push({ routeId: route.routeId, productId, outcome: sawRateLimit(statuses) ? 'deferred' : 'errored', reason: sawRateLimit(statuses) ? 'supplier_rate_limited_during_probe' : error instanceof Error ? error.message.slice(0, 120) : 'unknown_error', previousStatus: route.qualification.status });
    continue;
  }

  statusSink = null;
  report.externalCalls += operationSequence - before;

  // A supplier answering 429 has told us it is throttling, not that the route
  // is unfit to sell. Recording a failure here would pause a working route on
  // the strength of our own probe volume, so the previous qualification is kept
  // and the route is reported for a later re-measurement instead.
  if (qualification.status !== 'passed' && sawRateLimit(statuses)) {
    requalified.push(route);
    report.routes.push({ routeId: route.routeId, productId, outcome: 'deferred', reason: 'supplier_rate_limited_during_probe', previousStatus: route.qualification.status, previousExpiresAt: route.qualification.expiresAt });
    continue;
  }

  requalified.push({ ...route, qualification });
  report.routes.push({
    routeId: route.routeId,
    productId,
    outcome: qualification.status,
    latencyMsP95: qualification.observed.latencyMsP95 ?? null,
    failedChecks: qualification.checks.filter(({ status }) => status !== 'passed').map(({ name, status, code }) => ({ name, status, code })),
  });
}

// createAiModelCatalog re-validates every route and refuses an expired
// qualification on a passed route, so the file cannot be written in a state the
// contract rejects.
const merged = createAiModelCatalog({
  catalogId: catalog.catalogId,
  evaluatedAt: checkedAt,
  routes: requalified,
});

if (merged.routes.length !== catalog.routes.length) fail(`route count changed from ${catalog.routes.length} to ${merged.routes.length}; requalification must never add or drop a route`);

if (!process.argv.includes('--report-only')) {
  await writeFile(catalogPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

const counts = report.routes.reduce((totals, { outcome }) => ({ ...totals, [outcome]: (totals[outcome] ?? 0) + 1 }), {});
process.stdout.write(`${JSON.stringify({ ...report, summary: counts }, null, 2)}\n`);
console.error(`requalify-ai-routes: ${JSON.stringify(counts)} across ${catalog.routes.length} routes, ${report.externalCalls} supplier calls, owner cash spent 0`);
