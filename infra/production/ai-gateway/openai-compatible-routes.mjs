const CHAT_ENDPOINTS = Object.freeze(['/v1/chat/completions', '/v1/responses']);

const route = (id, provider, upstream, capability, supplyKey, extra = {}) => Object.freeze({
  id,
  provider,
  upstream,
  capability,
  supplyKey,
  endpoints: CHAT_ENDPOINTS,
  ...extra,
});

export const OPENAI_COMPATIBLE_ROUTES = Object.freeze([
  route('clervo/allam-2-7b', 'groq', 'allam-2-7b', 'text', 'allam-2-7b'),
  route('clervo/gpt-oss-20b', 'groq', 'openai/gpt-oss-20b', 'text', 'gpt-oss-20b', { reasoning: true, smokeOutputTokens: 256 }),
  route('clervo/gpt-oss-safeguard-20b', 'groq', 'openai/gpt-oss-safeguard-20b', 'safety', 'gpt-oss-safeguard-20b'),
  route('clervo/llama-3.3-70b-instruct', 'groq', 'llama-3.3-70b-versatile', 'text', 'llama-3-3-70b'),
  route('clervo/qwen3.6-27b', 'groq', 'qwen/qwen3.6-27b', 'text', 'qwen3-6-27b'),

  route('clervo/glm-4.6v-flash', 'zai', 'glm-4.6v-flash', 'vlm', 'glm-4-6v-flash'),

  route('clervo/deepseek-v3.1', 'sambanova', 'DeepSeek-V3.1', 'text', 'deepseek-v3-1'),
  route('clervo/gemma-4-31b-it', 'sambanova', 'gemma-4-31B-it', 'text', 'gemma-4-31b-it'),

  route('clervo/laguna-s-2.1', 'openrouter', 'poolside/laguna-s-2.1:free', 'text', 'laguna-s-2-1'),

  route('clervo/mistral-medium-2505', 'mistral', 'mistral-medium-2505', 'vlm', 'mistral-medium-2505'),
  route('clervo/mistral-medium-2508', 'mistral', 'mistral-medium-2508', 'vlm', 'mistral-medium-2508'),

  route('clervo/deepseek-r1', 'siliconflow', 'deepseek-ai/DeepSeek-R1', 'text', 'deepseek-r1', { reasoning: true, smokeOutputTokens: 512 }),
  route('clervo/deepseek-v3', 'siliconflow', 'deepseek-ai/DeepSeek-V3', 'text', 'deepseek-v3'),
  route('clervo/deepseek-v3.1-terminus', 'siliconflow', 'deepseek-ai/DeepSeek-V3.1-Terminus', 'text', 'deepseek-v3-1-terminus'),
  route('clervo/deepseek-v3.2-exp', 'siliconflow', 'deepseek-ai/DeepSeek-V3.2-Exp', 'text', 'deepseek-v3-2-exp'),
  route('clervo/deepseek-v4-pro', 'siliconflow', 'deepseek-ai/DeepSeek-V4-Pro', 'text', 'deepseek-v4-pro'),
  route('clervo/gemma-4-12b-it', 'siliconflow', 'google/gemma-4-12B-it', 'text', 'gemma-4-12b-it'),
  route('clervo/gemma-4-26b-a4b-it', 'siliconflow', 'google/gemma-4-26B-A4B-it', 'text', 'gemma-4-26b-a4b-it'),
  route('clervo/glm-4.5-air', 'siliconflow', 'zai-org/GLM-4.5-Air', 'text', 'glm-4-5-air'),
  route('clervo/hunyuan-a13b-instruct', 'siliconflow', 'tencent/Hunyuan-A13B-Instruct', 'text', 'hunyuan-a13b'),
  route('clervo/hy3', 'siliconflow', 'tencent/Hy3', 'text', 'hy3'),
  route('clervo/kimi-k2.5', 'siliconflow', 'moonshotai/Kimi-K2.5', 'text', 'kimi-k2-5'),
  route('clervo/kimi-k2.6', 'siliconflow', 'moonshotai/Kimi-K2.6', 'text', 'kimi-k2-6'),
  route('clervo/kimi-k2.7-code', 'siliconflow', 'moonshotai/Kimi-K2.7-Code', 'text', 'kimi-k2-7-code'),
  route('clervo/kimi-k3', 'siliconflow', 'moonshotai/Kimi-K3', 'text', 'kimi-k3'),
  route('clervo/ling-flash-2.0', 'siliconflow', 'inclusionAI/Ling-flash-2.0', 'text', 'ling-flash-2-0'),
  route('clervo/longcat-2.0', 'siliconflow', 'meituan-longcat/LongCat-2.0', 'text', 'longcat-2-0'),
  route('clervo/minimax-m2.5', 'siliconflow', 'MiniMaxAI/MiniMax-M2.5', 'text', 'minimax-m2-5'),
  route('clervo/nex-n2-pro', 'siliconflow', 'nex-agi/Nex-N2-Pro', 'text', 'nex-n2-pro'),
  route('clervo/qwen2.5-72b-instruct', 'siliconflow', 'Qwen/Qwen2.5-72B-Instruct', 'text', 'qwen2-5-72b'),
  route('clervo/qwen3-14b', 'siliconflow', 'Qwen/Qwen3-14B', 'text', 'qwen3-14b'),
  route('clervo/qwen3-30b-a3b-instruct-2507', 'siliconflow', 'Qwen/Qwen3-30B-A3B-Instruct-2507', 'text', 'qwen3-30b-a3b-instruct-2507'),
  route('clervo/qwen3-32b', 'siliconflow', 'Qwen/Qwen3-32B', 'text', 'qwen3-32b'),
  route('clervo/qwen3.5-397b-a17b', 'siliconflow', 'Qwen/Qwen3.5-397B-A17B', 'text', 'qwen3-5-397b-a17b'),
  route('clervo/qwen3-8b', 'siliconflow', 'Qwen/Qwen3-8B', 'text', 'qwen3-8b'),
  route('clervo/qwen3-coder-30b-a3b-instruct', 'siliconflow', 'Qwen/Qwen3-Coder-30B-A3B-Instruct', 'text', 'qwen3-coder-30b-a3b'),
  route('clervo/qwen3-vl-30b-a3b-instruct', 'siliconflow', 'Qwen/Qwen3-VL-30B-A3B-Instruct', 'vlm', 'qwen3-vl-30b-a3b'),
  route('clervo/qwen3-vl-30b-a3b-thinking', 'siliconflow', 'Qwen/Qwen3-VL-30B-A3B-Thinking', 'vlm', 'qwen3-vl-30b-a3b-thinking', { reasoning: true, smokeOutputTokens: 256 }),
  route('clervo/qwen3-vl-32b-instruct', 'siliconflow', 'Qwen/Qwen3-VL-32B-Instruct', 'vlm', 'qwen3-vl-32b'),
  route('clervo/qwen3-vl-32b-thinking', 'siliconflow', 'Qwen/Qwen3-VL-32B-Thinking', 'vlm', 'qwen3-vl-32b-thinking', { reasoning: true, smokeOutputTokens: 256 }),
  route('clervo/qwen3-vl-8b-instruct', 'siliconflow', 'Qwen/Qwen3-VL-8B-Instruct', 'vlm', 'qwen3-vl-8b'),
  route('clervo/seed-oss-36b-instruct', 'siliconflow', 'ByteDance-Seed/Seed-OSS-36B-Instruct', 'text', 'seed-oss-36b'),
]);

export const OPENAI_COMPATIBLE_PROVIDER_NAMES = Object.freeze(new Set([
  'groq',
  'zai',
  'sambanova',
  'openrouter',
  'mistral',
  'siliconflow',
]));

if (OPENAI_COMPATIBLE_ROUTES.length !== 42) {
  throw new Error(`openai_compatible_route_count_mismatch_${OPENAI_COMPATIBLE_ROUTES.length}`);
}

if (new Set(OPENAI_COMPATIBLE_ROUTES.map((item) => item.id)).size !== 42) {
  throw new Error('openai_compatible_public_id_collision');
}

if (new Set(OPENAI_COMPATIBLE_ROUTES.map((item) => item.supplyKey)).size !== 42) {
  throw new Error('openai_compatible_supply_key_collision');
}
