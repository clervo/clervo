#!/usr/bin/env node

const sourceDefinitions = [
  { serviceId: 'supply.hcnsec_gateway', url: 'https://api.hcnsec.cn/v1/models', secrets: ['AI_GATEWAY_KEY'] },
  { serviceId: 'supply.cerebras', url: 'https://api.cerebras.ai/v1/models', secrets: ['CEREBRAS_API_KEY'] },
  { serviceId: 'supply.cohere', url: 'https://api.cohere.com/v1/models?page_size=1000', secrets: ['COHERE_API_KEY'] },
  { serviceId: 'supply.google_gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', secrets: ['GEMINI_API_KEY'], auth: 'google' },
  { serviceId: 'supply.github_models', url: 'https://models.github.ai/catalog/models', secrets: ['GITHUB_MODELS_PAT', 'GITHUB_MODELS_TOKEN'], auth: 'github' },
  { serviceId: 'supply.mistral', url: 'https://api.mistral.ai/v1/models', secrets: ['MISTRAL_API_KEY'] },
  { serviceId: 'supply.nvidia', url: 'https://integrate.api.nvidia.com/v1/models', secrets: ['NVIDIA_API_KEY'] },
  { serviceId: 'supply.openrouter', url: 'https://openrouter.ai/api/v1/models', secrets: ['OPENROUTER_API_KEY'] },
  { serviceId: 'supply.sambanova', url: 'https://api.sambanova.ai/v1/models', secrets: ['SAMBANOVA_API_KEY'] },
  { serviceId: 'supply.siliconflow', url: 'https://api.siliconflow.com/v1/models', secrets: ['SILICONFLOW_API_KEY'] },
  { serviceId: 'supply.zai', url: 'https://api.z.ai/api/paas/v4/models', secrets: ['ZAI_API_KEY'] },
];

function credential(names) {
  return names.map((name) => process.env[name]).find((value) => typeof value === 'string' && value.length >= 8 && value.length <= 8_192 && !/[\r\n]/u.test(value));
}

function modelIds(body) {
  const values = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : Array.isArray(body?.models) ? body.models : [];
  return [...new Set(values.map((entry) => typeof entry === 'string' ? entry : entry?.id ?? entry?.name ?? entry?.model).filter((value) => typeof value === 'string' && value.length > 0 && value.length <= 200))].sort((left, right) => left.localeCompare(right, 'en-US'));
}

const checkedAt = new Date().toISOString();
const sources = [];
for (const definition of sourceDefinitions) {
  const secret = credential(definition.secrets);
  if (secret === undefined) {
    sources.push({ serviceId: definition.serviceId, status: 'credential_missing', httpStatus: null, modelCount: 0, modelIds: [] });
    continue;
  }
  const requestHeaders = definition.auth === 'google'
    ? { 'x-goog-api-key': secret, accept: 'application/json' }
    : definition.auth === 'github'
      ? { authorization: `Bearer ${secret}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2026-03-10' }
      : { authorization: `Bearer ${secret}`, accept: 'application/json' };
  try {
    const response = await fetch(definition.url, { headers: requestHeaders, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 5_000_000) throw new TypeError('owned_source_discovery_response_too_large');
    let body;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { body = null; }
    const ids = response.ok ? modelIds(body) : [];
    sources.push({ serviceId: definition.serviceId, status: response.ok && ids.length > 0 ? 'working' : response.ok ? 'unexpected_shape' : 'http_failed', httpStatus: response.status, modelCount: ids.length, modelIds: ids });
  } catch {
    sources.push({ serviceId: definition.serviceId, status: 'transport_failed', httpStatus: null, modelCount: 0, modelIds: [] });
  }
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: 'clervo.owned-openai-source-discovery.v1',
  checkedAt,
  externalCalls: sources.filter(({ status }) => status !== 'credential_missing').length,
  ownerCashSpentUsd: 0,
  secretValuesRecorded: false,
  hcnsecCredentialSlotsUsed: 1,
  hcnsecAccountPoolingAttempted: false,
  sources,
}, null, 2)}\n`);
