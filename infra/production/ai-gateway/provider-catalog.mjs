import { HCNSEC_MODELS } from './hcnsec.mjs';
import { OPENAI_COMPATIBLE_ROUTES } from './openai-compatible-routes.mjs';

export const SERVICE_ALIAS_TARGETS = Object.freeze({
  'clervo/fast': 'clervo/gpt-oss-20b',
  'clervo/smart': 'clervo/gpt-oss-120b',
  'clervo/code': 'clervo/kimi-k2.7-code',
  'clervo/deep': 'clervo/gpt-oss-120b',
});

const route = (id, provider, upstream, capability, endpoints, extra = {}) => Object.freeze({
  id, provider, upstream, capability, endpoints: Object.freeze([...endpoints]), ...extra,
});

export const NVIDIA_ROUTES = Object.freeze([
  route('clervo/llama-3.1-8b-instruct', 'nvidia', 'meta/llama-3.1-8b-instruct', 'text', ['/v1/chat/completions', '/v1/responses']),
  route('clervo/llama-3.2-11b-vision-instruct', 'nvidia', 'meta/llama-3.2-11b-vision-instruct', 'vlm', ['/v1/chat/completions', '/v1/responses']),
  route('clervo/llama-3.1-nemoguard-8b-content-safety', 'nvidia', 'nvidia/llama-3.1-nemoguard-8b-content-safety', 'safety', ['/v1/chat/completions', '/v1/responses']),
  route('clervo/llama-3.1-nemotron-nano-vl-8b-v1', 'nvidia', 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1', 'vlm', ['/v1/chat/completions', '/v1/responses']),
  route('clervo/llama-3.1-nemotron-safety-guard-8b-v3', 'nvidia', 'nvidia/llama-3.1-nemotron-safety-guard-8b-v3', 'safety', ['/v1/chat/completions', '/v1/responses']),
  route('clervo/nemotron-3-embed-1b', 'nvidia', 'nvidia/nemotron-3-embed-1b', 'embedding', ['/v1/embeddings']),
  route('clervo/nemotron-3.5-content-safety', 'nvidia', 'nvidia/nemotron-3.5-content-safety', 'safety', ['/v1/chat/completions', '/v1/responses']),
  route('clervo/nv-embed-v1', 'nvidia', 'nvidia/nv-embed-v1', 'embedding', ['/v1/embeddings']),
  route('clervo/llama-3.1-70b-instruct', 'nvidia', 'meta/llama-3.1-70b-instruct', 'text', ['/v1/chat/completions', '/v1/responses']),
  route('clervo/nemotron-3-nano-omni-30b-a3b-reasoning', 'nvidia', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 'vlm', ['/v1/chat/completions', '/v1/responses'], { reasoning: true, smokeOutputTokens: 256 }),
  route('clervo/gpt-oss-120b', 'nvidia', 'openai/gpt-oss-120b', 'text', ['/v1/chat/completions', '/v1/responses'], { reasoning: true, smokeOutputTokens: 256 }),
  route('clervo/llama-3.2-90b-vision-instruct', 'nvidia', 'meta/llama-3.2-90b-vision-instruct', 'vlm', ['/v1/chat/completions', '/v1/responses']),
  route('clervo/glm-5.2', 'nvidia', 'z-ai/glm-5.2', 'text', ['/v1/chat/completions', '/v1/responses']),
]);

export const GOOGLE_ROUTES = Object.freeze([
  route('clervo/gemini-3.5-flash-lite', 'google', 'gemini-3.5-flash-lite', 'text', ['/v1/chat/completions', '/v1/responses']),
  route('clervo/gemini-2.5-flash', 'google', 'gemini-2.5-flash', 'text', ['/v1/chat/completions', '/v1/responses']),
  route('clervo/gemini-2.5-flash-image', 'google', 'gemini-2.5-flash-image', 'image', ['/v1/images/generations']),
  route('clervo/gemini-3-pro-image', 'google', 'gemini-3-pro-image', 'image', ['/v1/images/generations']),
  route('clervo/gemini-3.1-flash-image', 'google', 'gemini-3.1-flash-image', 'image', ['/v1/images/generations']),
  route('clervo/gemini-3.1-flash-lite-image', 'google', 'gemini-3.1-flash-lite-image', 'image', ['/v1/images/generations']),
  route('clervo/gemini-embedding-001', 'google', 'gemini-embedding-001', 'embedding', ['/v1/embeddings'], { dimension: 3072 }),
  route('clervo/text-embedding-005', 'google', 'text-embedding-005', 'embedding', ['/v1/embeddings'], { dimension: 768 }),
  route('clervo/text-multilingual-embedding-002', 'google', 'text-multilingual-embedding-002', 'embedding', ['/v1/embeddings'], { dimension: 768 }),
  route('clervo/text-embedding-large-exp-03-07', 'google', 'text-embedding-large-exp-03-07', 'embedding', ['/v1/embeddings'], { dimension: 3072, lifecycle: 'experimental' }),
  route('clervo/multimodalembedding-001', 'google', 'multimodalembedding@001', 'embedding', ['/v1/embeddings'], { dimension: 128 }),
  route('clervo/gemini-3.1-flash-tts-preview', 'google', 'gemini-3.1-flash-tts-preview', 'tts', ['/v1/audio/speech']),
  route('clervo/gemini-2.5-flash-tts', 'google', 'gemini-2.5-flash-tts', 'tts', ['/v1/audio/speech']),
  route('clervo/gemini-2.5-flash-lite-preview-tts', 'google', 'gemini-2.5-flash-lite-preview-tts', 'tts', ['/v1/audio/speech']),
  route('clervo/gemini-2.5-pro-tts', 'google', 'gemini-2.5-pro-tts', 'tts', ['/v1/audio/speech']),
  route('clervo/veo-3.1-generate-001', 'google', 'veo-3.1-generate-001', 'video', ['/v1/videos/generations']),
  route('clervo/veo-3.1-fast-generate-001', 'google', 'veo-3.1-fast-generate-001', 'video', ['/v1/videos/generations']),
  route('clervo/veo-3.1-lite-generate-001', 'google', 'veo-3.1-lite-generate-001', 'video', ['/v1/videos/generations']),
  route('clervo/lyria-3-clip-preview', 'google', 'lyria-3-clip-preview', 'music', ['/v1/music/generations']),
  route('clervo/lyria-3-pro-preview', 'google', 'lyria-3-pro-preview', 'music', ['/v1/music/generations']),
  route('clervo/gemini-omni-flash-preview', 'google', 'gemini-omni-flash-preview', 'video', ['/v1/videos/generations'], { protocol: 'interactions' }),
  route('clervo/virtual-try-on-001', 'google', 'virtual-try-on-001', 'virtual_try_on', ['/v1/virtual-try-on']),
]);

// Direct public smoke followed by three spaced requalification rounds on 2026-08-10
// showed these routes were not stable enough for the launch lock. Historical
// qualification and production evidence remain untouched; this is a current
// runtime exposure decision only.
export const LAUNCH_STABILITY_EXCLUDED_IDS = Object.freeze(new Set([
  'clervo/qwen3.6-35b-a3b',
  'clervo/deepseek-v4-flash',
  'clervo/llama-3.2-90b-vision-instruct',
  'clervo/glm-4.6v-flash',
  'clervo/deepseek-v3.1',
]));

const HCNSEC_ROUTES = Object.entries(HCNSEC_MODELS)
  .filter(([id]) => !LAUNCH_STABILITY_EXCLUDED_IDS.has(id))
  .map(([id, upstream]) => route(id, 'hcnsec', upstream, 'text', ['/v1/chat/completions', '/v1/responses']));
const NVIDIA_LAUNCH_ROUTES = NVIDIA_ROUTES.filter((item) => !LAUNCH_STABILITY_EXCLUDED_IDS.has(item.id));
const OPENAI_COMPATIBLE_LAUNCH_ROUTES = OPENAI_COMPATIBLE_ROUTES.filter((item) => !LAUNCH_STABILITY_EXCLUDED_IDS.has(item.id));

export { OPENAI_COMPATIBLE_ROUTES };
export const CANONICAL_ROUTES = Object.freeze([
  ...HCNSEC_ROUTES,
  ...GOOGLE_ROUTES,
  ...NVIDIA_LAUNCH_ROUTES,
  ...OPENAI_COMPATIBLE_LAUNCH_ROUTES,
]);
const CANONICAL_BY_ID = new Map(CANONICAL_ROUTES.map((item) => [item.id, item]));
const SERVICE_ALIASES = Object.entries(SERVICE_ALIAS_TARGETS).map(([id, target]) => {
  const canonical = CANONICAL_BY_ID.get(target);
  if (!canonical) throw new Error(`service_alias_target_missing_${id}`);
  return route(id, canonical.provider, canonical.upstream, canonical.capability, canonical.endpoints, {
    alias: true,
    aliasTarget: target,
    ...(canonical.reasoning ? { reasoning: true } : {}),
  });
});
export const PUBLIC_ROUTES = Object.freeze([...CANONICAL_ROUTES, ...SERVICE_ALIASES]);
export const ROUTES_BY_ID = Object.freeze(Object.fromEntries(PUBLIC_ROUTES.map((item) => [item.id, item])));

if (LAUNCH_STABILITY_EXCLUDED_IDS.size !== 5) throw new Error('launch_stability_exclusion_count_mismatch');
if (CANONICAL_ROUTES.length !== 75) throw new Error(`qualified_route_count_mismatch_${CANONICAL_ROUTES.length}`);
if (new Set(CANONICAL_ROUTES.map((item) => item.id)).size !== 75) throw new Error('canonical_route_id_collision');
if (PUBLIC_ROUTES.length !== 79) throw new Error(`public_route_count_mismatch_${PUBLIC_ROUTES.length}`);
if (CANONICAL_ROUTES.some(({ provider, id }) => provider === 'codex' || provider === 'mwapi' || id.includes('gpt-5.6') || id.includes('claude'))) throw new Error('temporarily_unavailable_route_exposed');
for (const id of LAUNCH_STABILITY_EXCLUDED_IDS) {
  if (ROUTES_BY_ID[id]) throw new Error(`launch_stability_excluded_route_exposed_${id}`);
}
