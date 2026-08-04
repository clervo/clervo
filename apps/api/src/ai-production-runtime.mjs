import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CloudflareAuraSpeechAdapter } from '../../../dist/adapters/ai/src/cloudflare-aura-speech.js';
import { DeepgramSpeechAdapter } from '../../../dist/adapters/ai/src/deepgram-speech.js';
import { createBoundedAiHttpTransport, OpenAiCompatibleAdapter } from '../../../dist/adapters/ai/src/openai-compatible.js';
import { VertexEmbeddingAdapter } from '../../../dist/adapters/ai/src/vertex-embedding.js';
import { VertexGeminiAdapter } from '../../../dist/adapters/ai/src/vertex-gemini.js';
import { createAiPublicPricing } from './ai-public-pricing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const catalogFiles = Object.freeze({
  model: 'ai-model-catalog.v1.json',
  gateway: 'ai-launch-pricing.v1.json',
  credit: 'ai-credit-backed-pricing.v1.json',
  speech: 'ai-speech-pricing.v1.json',
  recurring: 'ai-free-tier-pricing.v1.json',
  edge: 'ai-edge-free-pricing.v1.json',
});
const allowedFamilies = new Set(['clervo_gateway', 'groq', 'cloudflare', 'vertex', 'deepgram']);

async function catalogs() {
  return Object.freeze(Object.fromEntries(await Promise.all(Object.entries(catalogFiles).map(async ([name, file]) => [name, JSON.parse(await readFile(path.join(root, 'packages/catalog', file), 'utf8'))]))));
}

function required(env, name, minimum = 8) {
  const value = env[name];
  if (typeof value !== 'string' || value.length < minimum || value.length > 8_192 || /[\r\n]/u.test(value)) throw new TypeError(`ai_runtime_${name.toLowerCase()}_invalid`);
  return value;
}

function parseFamilies(value) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('ai_runtime_families_required');
  const families = [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))];
  if (families.length === 0 || families.some((entry) => !allowedFamilies.has(entry))) throw new TypeError('ai_runtime_families_invalid');
  return families;
}

function metadataAccessToken(fetcher) {
  let cached;
  return async () => {
    const current = Date.now();
    if (cached !== undefined && cached.expiresAt - 60_000 > current) return cached.token;
    const response = await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'metadata-flavor': 'Google' },
      redirect: 'error',
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new TypeError('vertex_metadata_token_unavailable');
    const value = await response.json();
    if (typeof value?.access_token !== 'string' || value.access_token.length < 8 || !Number.isSafeInteger(value.expires_in) || value.expires_in < 60) throw new TypeError('vertex_metadata_token_invalid');
    cached = Object.freeze({ token: value.access_token, expiresAt: current + value.expires_in * 1_000 });
    return cached.token;
  };
}

function secret(env) {
  return async (name) => required(env, name);
}

function catalogRouteId(exactModelId) {
  return `ai.route.${exactModelId.replace(/[^a-zA-Z0-9]+/gu, '_').replace(/^_|_$/gu, '').toLowerCase()}`;
}

export async function createAiProductionRuntime({ env = process.env, fetcher = globalThis.fetch, artifactStore } = {}) {
  const families = parseFamilies(env.CLERVO_AI_ROUTE_FAMILIES);
  if (typeof fetcher !== 'function') throw new TypeError('ai_runtime_fetcher_invalid');
  const transport = createBoundedAiHttpTransport(fetcher);
  const adapters = [];
  const resolveSecret = secret(env);

  if (families.includes('clervo_gateway')) {
    const baseUrl = required(env, 'CLERVO_AI_BASE_URL');
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'ai.clervo.dev' || parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') throw new TypeError('ai_runtime_clervo_base_url_invalid');
    required(env, 'CLERVO_AI_API_KEY');
    for (const [suffix, exactModelId] of [['luna', 'gpt-5.6-luna'], ['terra', 'gpt-5.6-terra'], ['sol', 'gpt-5.6-sol']]) adapters.push(new OpenAiCompatibleAdapter({
      config: { routeId: `ai.route.gpt_5_6_${suffix}`, baseUrl: parsed.href, allowedHosts: ['ai.clervo.dev'], secretName: 'CLERVO_AI_API_KEY', exactModelId, productId: 'ai.chat', maximumResponseBytes: 1_000_000 },
      transport,
      secret: resolveSecret,
    }));
  }

  if (families.includes('groq')) {
    required(env, 'GROQ_API_KEY');
    const specs = [
      ['ai.route.gpt_oss_20b', 'openai/gpt-oss-20b', 'low', 'hidden'],
      ['ai.route.gpt_oss_120b', 'openai/gpt-oss-120b', 'low', 'hidden'],
      ['ai.route.qwen3_6_27b', 'qwen/qwen3.6-27b', 'none', undefined],
    ];
    for (const [routeId, exactModelId, reasoningEffort, reasoningFormat] of specs) adapters.push(new OpenAiCompatibleAdapter({
      config: { routeId, baseUrl: 'https://api.groq.com/openai/v1/', allowedHosts: ['api.groq.com'], secretName: 'GROQ_API_KEY', exactModelId, productId: 'ai.chat', maximumResponseBytes: 1_000_000, reasoningEffort, ...(reasoningFormat === undefined ? {} : { reasoningFormat }) },
      transport,
      secret: resolveSecret,
    }));
  }

  if (families.includes('cloudflare')) {
    const accountId = required(env, 'CLOUDFLARE_ACCOUNT_ID');
    const tokenName = typeof env.CLOUDFLARE_AI_TOKEN === 'string' ? 'CLOUDFLARE_AI_TOKEN' : 'CLOUDFLARE_API_TOKEN';
    required(env, tokenName, 20);
    const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/`;
    const models = [
      ['ai.route.cf_meta_llama_4_scout_17b_16e_instruct', '@cf/meta/llama-4-scout-17b-16e-instruct'],
      ['ai.route.cf_nvidia_nemotron_3_120b_a12b', '@cf/nvidia/nemotron-3-120b-a12b'],
      ['ai.route.cf_openai_gpt_oss_120b', '@cf/openai/gpt-oss-120b'],
      ['ai.route.cf_openai_gpt_oss_20b', '@cf/openai/gpt-oss-20b'],
      ['ai.route.cf_qwen_qwen3_30b_a3b_fp8', '@cf/qwen/qwen3-30b-a3b-fp8'],
    ];
    for (const [routeId, exactModelId] of models) adapters.push(new OpenAiCompatibleAdapter({
      config: { routeId, baseUrl, allowedHosts: ['api.cloudflare.com'], secretName: tokenName, exactModelId, productId: 'ai.chat', maximumResponseBytes: 1_000_000 },
      transport,
      secret: resolveSecret,
    }));
    if (artifactStore !== undefined) adapters.push(new CloudflareAuraSpeechAdapter({ config: { routeId: 'ai.route.cloudflare_aura_2_en', accountId, secretName: tokenName, maximumResponseBytes: 20_000_000 }, transport, secret: resolveSecret, artifacts: artifactStore }));
  }

  if (families.includes('vertex')) {
    const projectId = required(env, 'CLERVO_VERTEX_PROJECT_ID');
    const accessToken = metadataAccessToken(fetcher);
    for (const exactModelId of ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash']) adapters.push(new VertexGeminiAdapter({
      config: { routeId: catalogRouteId(exactModelId), projectId, location: 'global', exactModelId, productId: 'ai.chat', maximumResponseBytes: 2_000_000 },
      transport,
      accessToken,
    }));
    adapters.push(new VertexEmbeddingAdapter({ config: { routeId: 'ai.route.gemini_embedding_001', projectId, location: 'us-central1', exactModelId: 'gemini-embedding-001', maximumResponseBytes: 20_000_000 }, transport, accessToken }));
    if (artifactStore !== undefined) for (const exactModelId of ['gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image']) adapters.push(new VertexGeminiAdapter({
      config: { routeId: catalogRouteId(exactModelId), projectId, location: 'global', exactModelId, productId: 'ai.image', maximumResponseBytes: 20_000_000 },
      transport,
      accessToken,
      artifacts: artifactStore,
    }));
  }

  if (families.includes('deepgram')) {
    if (artifactStore === undefined) throw new TypeError('ai_runtime_artifact_store_required');
    required(env, 'DEEPGRAM_API_KEY');
    for (const exactModelId of ['aura-2-thalia-en', 'aura-2-arcas-en']) adapters.push(new DeepgramSpeechAdapter({ config: { routeId: `ai.route.${exactModelId.replaceAll('-', '_')}`, exactModelId, secretName: 'DEEPGRAM_API_KEY', maximumResponseBytes: 20_000_000 }, transport, secret: resolveSecret, artifacts: artifactStore }));
  }

  const values = await catalogs();
  return Object.freeze({ adapters: Object.freeze(adapters), publicPricing: createAiPublicPricing(values, { enabledRouteIds: adapters.map(({ routeId }) => routeId) }), families: Object.freeze(families) });
}
