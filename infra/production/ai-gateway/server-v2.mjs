import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createHcnsecPool, chatCompletionToResponse, responsesToChatPayload } from './hcnsec.mjs';
import { CANONICAL_ROUTES, PUBLIC_ROUTES, ROUTES_BY_ID } from './provider-catalog.mjs';
import { requestNvidia } from './nvidia.mjs';
import { createVertexClient } from './vertex.mjs';
import { OPENAI_COMPATIBLE_PROVIDER_NAMES } from './openai-compatible-routes.mjs';
import { OPENAI_COMPATIBLE_PROVIDER_DEFAULTS, requestOpenAICompatible } from './openai-compatible.mjs';

const POST_PATHS = new Set([
  '/v1/chat/completions', '/v1/responses', '/v1/embeddings', '/v1/images/generations',
  '/v1/audio/speech', '/v1/videos/generations', '/v1/music/generations', '/v1/virtual-try-on',
]);

function integer(value, fallback, minimum, maximum, name) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`invalid_${name}`);
  return parsed;
}
function boolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}
function secretFromFile(path, name, minimum = 20) {
  const value = readFileSync(path, 'utf8').trim();
  if (value.length < minimum || value.length > 2048) throw new Error(`invalid_${name}`);
  return value;
}
function secureEqual(left, right) {
  const a = Buffer.from(left ?? ''); const b = Buffer.from(right ?? '');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
function json(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', ...headers });
  response.end(body);
}
function apiError(response, status, code, message, requestId, headers = {}) {
  return json(response, status, { error: { type: 'clervo_gateway_error', code, message }, request_id: requestId }, { 'x-request-id': requestId, ...headers });
}
async function readJson(request, maximumBytes) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) { const error = new Error('request_too_large'); error.code = 'request_too_large'; throw error; }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('invalid');
    return body;
  } catch { const error = new Error('invalid_json'); error.code = 'invalid_json'; throw error; }
}
function hcnsecAccountsFromFile(path) {
  const keys = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 100) throw new Error('invalid_hcnsec_account_keys');
  return keys.map((key, index) => {
    if (typeof key !== 'string' || key.length < 16 || key.length > 2048) throw new Error(`invalid_hcnsec_key_${index + 1}`);
    return { id: `hcnsec-${String(index + 1).padStart(2, '0')}`, key };
  });
}
function rateLimiter(limit) {
  let started = Date.now(); let used = 0;
  return { take() { const now = Date.now(); if (now - started >= 60_000) { started = now; used = 0; } if (used >= limit) return { allowed: false, retry: Math.max(1, Math.ceil((60_000 - (now - started)) / 1000)) }; used += 1; return { allowed: true, remaining: limit - used }; } };
}
function normalizedErrorStatus(status) {
  if (status === 429) return 429;
  if (status === 503) return 503;
  if (status === 400 || status === 404 || status === 422) return 400;
  return 502;
}
function validateOutputTokens(payload, maximum) {
  for (const field of ['max_output_tokens', 'max_completion_tokens', 'max_tokens']) {
    if (payload[field] !== undefined && (!Number.isInteger(payload[field]) || payload[field] < 1 || payload[field] > maximum)) return false;
  }
  return true;
}
function publicRouteHeaders(route, publicProviderNames) {
  return {
    'x-clervo-provider': publicProviderNames ? route.provider : 'clervo',
    'x-clervo-route-model': publicProviderNames ? route.upstream : route.id,
  };
}
function providerConfig(environment, provider, keyFileVariable, defaultKeyFile, baseUrlVariable) {
  const defaults = OPENAI_COMPATIBLE_PROVIDER_DEFAULTS[provider];
  return Object.freeze({
    apiKey: secretFromFile(environment[keyFileVariable] ?? defaultKeyFile, `${provider}_key`, 16),
    baseUrl: environment[baseUrlVariable] ?? defaults.baseUrl,
    headers: defaults.headers ?? {},
  });
}

export function createGateway(options) {
  const limiter = rateLimiter(options.requestsPerMinute ?? 120);
  const maximumBodyBytes = options.maximumBodyBytes ?? 10_485_760;
  const maximumOutputTokens = options.maximumOutputTokens ?? 32_768;
  const maximumConcurrency = options.maximumConcurrency ?? 8;
  const timeoutMs = options.timeoutMs ?? 600_000;
  const hcnsecPool = options.hcnsecPool ?? (options.hcnsecAccounts?.length ? createHcnsecPool({ baseUrl: options.hcnsecBaseUrl, accounts: options.hcnsecAccounts, cooldownMs: options.hcnsecCooldownMs }) : undefined);
  const vertex = options.vertexClient ?? createVertexClient({ projectId: options.vertexProjectId, metadataTokenUrl: options.vertexMetadataTokenUrl, requestTimeoutMs: timeoutMs });
  const openAIRequest = options.openAICompatibleRequest ?? requestOpenAICompatible;
  const openAIProviders = options.openAIProviders ?? {};
  const publicProviderNames = options.publicProviderNames === true;
  let active = 0;
  if (!options.builderKey || !options.nvidiaKey || secureEqual(options.builderKey, options.nvidiaKey)) throw new Error('invalid_gateway_keys');

  return createServer(async (request, response) => {
    const startedAt = Date.now(); const requestId = request.headers['x-request-id']?.toString().slice(0, 128) || randomUUID();
    const url = new URL(request.url ?? '/', 'http://gateway.internal');
    let status = 500; let routedModel; let routedProvider;
    response.setHeader('x-request-id', requestId); response.setHeader('x-content-type-options', 'nosniff');
    try {
      if (request.method === 'GET' && url.pathname === '/health') { status = 200; return json(response, 200, { status: 'ok', service: 'clervo-ai-gateway', canonical_models: CANONICAL_ROUTES.length }); }
      const supplied = String(request.headers.authorization ?? '').startsWith('Bearer ') ? String(request.headers.authorization).slice(7) : '';
      if (!secureEqual(supplied, options.builderKey)) { status = 401; return apiError(response, 401, 'invalid_api_key', 'Invalid API key.', requestId); }
      const rate = limiter.take(); if (!rate.allowed) { status = 429; return apiError(response, 429, 'rate_limit_exceeded', 'Request rate exceeded.', requestId, { 'retry-after': String(rate.retry) }); }
      response.setHeader('x-ratelimit-remaining-requests', String(rate.remaining));

      if (request.method === 'GET' && url.pathname === '/v1/models') {
        status = 200;
        return json(response, 200, { object: 'list', data: PUBLIC_ROUTES.map((route) => ({
          id: route.id, object: 'model', created: 0, owned_by: 'clervo', provider: publicProviderNames ? route.provider : 'clervo',
          capability: route.capability, endpoints: route.endpoints, canonical: route.alias !== true,
          ...(route.reasoning ? { reasoning: true } : {}),
          ...(route.lifecycle ? { lifecycle: route.lifecycle } : {}),
        })) });
      }
      if (request.method !== 'POST' || !POST_PATHS.has(url.pathname)) { status = 404; return apiError(response, 404, 'route_not_found', 'Route not found.', requestId); }
      if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) { status = 415; return apiError(response, 415, 'unsupported_media_type', 'Content-Type must be application/json.', requestId); }
      if (active >= maximumConcurrency) { status = 429; return apiError(response, 429, 'concurrency_limit_exceeded', 'Concurrency limit exceeded.', requestId, { 'retry-after': '2' }); }
      const payload = await readJson(request, maximumBodyBytes);
      if (typeof payload.model !== 'string') { status = 400; return apiError(response, 400, 'model_required', 'A model is required.', requestId); }
      const route = ROUTES_BY_ID[payload.model];
      if (!route) { status = 400; return apiError(response, 400, 'model_not_allowed', 'Use a model returned by /v1/models.', requestId); }
      if (!route.endpoints.includes(url.pathname)) { status = 400; return apiError(response, 400, 'endpoint_not_supported', `Model ${route.id} is callable at: ${route.endpoints.join(', ')}`, requestId); }
      if (!validateOutputTokens(payload, maximumOutputTokens)) { status = 400; return apiError(response, 400, 'max_output_tokens_exceeded', `Output tokens must be between 1 and ${maximumOutputTokens}.`, requestId); }
      if (payload.stream === true && route.provider !== 'codex') { status = 400; return apiError(response, 400, 'stream_not_supported', 'Streaming is not yet normalized for this model.', requestId); }
      if (route.provider === 'hcnsec' && !hcnsecPool) { status = 503; return apiError(response, 503, 'provider_not_configured', 'Provider is not configured.', requestId); }
      routedModel = route.upstream; routedProvider = route.provider; active += 1;
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(new Error('upstream_timeout')), timeoutMs);
      const disconnect = () => controller.abort(new Error('client_aborted'));
      request.once('aborted', disconnect);
      response.once('close', disconnect);
      try {
        if (route.provider === 'hcnsec') {
          const providerPayload = url.pathname === '/v1/responses' ? responsesToChatPayload(payload, route.upstream) : { ...payload, model: route.upstream };
          const { response: upstream } = await hcnsecPool.request({ path: '/chat/completions', payload: providerPayload, requestId, signal: controller.signal });
          status = upstream.status;
          const headers = publicRouteHeaders(route, publicProviderNames);
          if (!upstream.ok) return apiError(response, normalizedErrorStatus(upstream.status), upstream.status === 429 ? 'upstream_rate_limited' : 'upstream_unavailable', 'Route is temporarily unavailable.', requestId, headers);
          const chat = await upstream.json(); const body = url.pathname === '/v1/responses' ? chatCompletionToResponse(chat, route.id) : { ...chat, model: route.id };
          return json(response, 200, body, headers);
        }

        if (route.provider === 'nvidia') {
          const result = await requestNvidia({ route, path: url.pathname, payload, apiKey: options.nvidiaKey, baseUrl: options.nvidiaBaseUrl, signal: controller.signal, requestId });
          status = result.status;
          const headers = publicRouteHeaders(route, publicProviderNames);
          if (!result.ok) return apiError(response, normalizedErrorStatus(result.status), result.status === 429 ? 'upstream_rate_limited' : 'upstream_rejected_request', result.body?.error?.message?.slice?.(0, 500) ?? 'Upstream rejected request.', requestId, headers);
          return json(response, result.status, result.body, headers);
        }

        if (OPENAI_COMPATIBLE_PROVIDER_NAMES.has(route.provider)) {
          const result = await openAIRequest({
            route,
            path: url.pathname,
            payload,
            providerConfig: openAIProviders[route.provider],
            signal: controller.signal,
            requestId,
          });
          status = result.status;
          const headers = publicRouteHeaders(route, publicProviderNames);
          if (!result.ok) {
            const code = result.errorClass === 'rate_limit'
              ? 'upstream_rate_limited'
              : result.errorClass === 'wrong_identity'
                ? 'upstream_wrong_identity'
                : result.errorClass === 'provider_not_configured'
                  ? 'provider_not_configured'
                  : 'upstream_rejected_request';
            return apiError(
              response,
              normalizedErrorStatus(result.status),
              code,
              result.body?.error?.message?.slice?.(0, 500) ?? 'Upstream rejected request.',
              requestId,
              headers,
            );
          }
          return json(response, result.status, result.body, headers);
        }

        const result = await vertex.request({ route, path: url.pathname, payload, signal: controller.signal }); status = result.status;
        const headers = publicRouteHeaders(route, publicProviderNames);
        if (!result.ok) return apiError(response, normalizedErrorStatus(result.status), result.body?.error?.code ?? 'upstream_rejected_request', result.body?.error?.message ?? 'Upstream rejected request.', requestId, headers);
        if (result.kind === 'binary') {
          response.writeHead(200, { 'content-type': result.contentType ?? 'application/octet-stream', 'content-length': result.body.length, 'cache-control': 'no-store', 'x-request-id': requestId, ...headers, ...(result.headers ?? {}) });
          response.end(result.body); return;
        }
        return json(response, result.status, result.body, headers);
      } finally {
        clearTimeout(timer);
        request.removeListener('aborted', disconnect);
        response.removeListener('close', disconnect);
        active -= 1;
      }
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      if (error.code === 'request_too_large') { status = 413; return apiError(response, 413, 'request_too_large', `Request body exceeds ${maximumBodyBytes} bytes.`, requestId); }
      if (error.code === 'invalid_json') { status = 400; return apiError(response, 400, 'invalid_json', 'Request body must be a JSON object.', requestId); }
      if (error.code === 'invalid_responses_input') { status = 400; return apiError(response, 400, 'invalid_responses_input', 'Responses input must contain at least one supported message.', requestId); }
      status = /timeout|Abort/u.test(String(error?.name) + String(error?.message)) ? 504 : 502;
      return apiError(response, status, status === 504 ? 'upstream_timeout' : 'upstream_unavailable', status === 504 ? 'Upstream request timed out.' : 'Upstream is unavailable.', requestId);
    } finally {
      process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), request_id: requestId, method: request.method, path: url.pathname, status, duration_ms: Date.now() - startedAt, ...(routedModel ? { routed_model: routedModel } : {}), ...(routedProvider ? { routed_provider: routedProvider } : {}) })}\n`);
    }
  });
}

export function loadEnvironment(environment = process.env) {
  return {
    builderKey: secretFromFile(environment.BUILDER_API_KEY_FILE ?? '/run/secrets/builder-key', 'builder_key', 32),
    nvidiaKey: secretFromFile(environment.NVIDIA_API_KEY_FILE ?? '/run/secrets/nvidia-key', 'nvidia_key', 20),
    nvidiaBaseUrl: environment.NVIDIA_NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    vertexProjectId: environment.VERTEX_PROJECT_ID ?? 'bloxsniper-prod',
    vertexMetadataTokenUrl: environment.VERTEX_METADATA_TOKEN_URL ?? 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    hcnsecBaseUrl: environment.HCNSEC_BASE_URL ?? 'https://api.hcnsec.cn/v1',
    hcnsecAccounts: hcnsecAccountsFromFile(environment.HCNSEC_ACCOUNT_KEYS_FILE ?? '/run/secrets/provider-hcnsec-keys'),
    hcnsecCooldownMs: integer(environment.HCNSEC_COOLDOWN_MS, 30_000, 1_000, 600_000, 'hcnsec_cooldown_ms'),
    openAIProviders: Object.freeze({
      groq: providerConfig(environment, 'groq', 'GROQ_API_KEY_FILE', '/run/secrets/provider-groq-key', 'GROQ_BASE_URL'),
      sambanova: providerConfig(environment, 'sambanova', 'SAMBANOVA_API_KEY_FILE', '/run/secrets/provider-sambanova-key', 'SAMBANOVA_BASE_URL'),
      openrouter: providerConfig(environment, 'openrouter', 'OPENROUTER_API_KEY_FILE', '/run/secrets/provider-openrouter-key', 'OPENROUTER_BASE_URL'),
      mistral: providerConfig(environment, 'mistral', 'MISTRAL_API_KEY_FILE', '/run/secrets/provider-mistral-key', 'MISTRAL_BASE_URL'),
      siliconflow: providerConfig(environment, 'siliconflow', 'SILICONFLOW_API_KEY_FILE', '/run/secrets/provider-siliconflow-key', 'SILICONFLOW_BASE_URL'),
    }),
    publicProviderNames: boolean(environment.PUBLIC_PROVIDER_NAMES, false),
    maximumBodyBytes: integer(environment.MAX_BODY_BYTES, 10_485_760, 1_024, 52_428_800, 'max_body_bytes'),
    maximumOutputTokens: integer(environment.MAX_OUTPUT_TOKENS, 32_768, 1, 131_072, 'max_output_tokens'),
    maximumConcurrency: integer(environment.MAX_CONCURRENCY, 8, 1, 100, 'max_concurrency'),
    requestsPerMinute: integer(environment.REQUESTS_PER_MINUTE, 120, 1, 10_000, 'requests_per_minute'),
    timeoutMs: integer(environment.UPSTREAM_TIMEOUT_MS, 600_000, 1_000, 1_800_000, 'upstream_timeout_ms'),
    port: integer(environment.PORT, 8080, 1, 65_535, 'port'),
  };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = loadEnvironment(); const server = createGateway(options);
  server.listen(options.port, '0.0.0.0', () => process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), event: 'gateway_started', port: options.port, canonical_models: CANONICAL_ROUTES.length })}\n`));
}
