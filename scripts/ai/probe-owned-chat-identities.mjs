#!/usr/bin/env node

const sources = {
  hcnsec_gateway: { serviceId: 'supply.hcnsec_gateway', baseUrl: 'https://api.hcnsec.cn/v1/', secrets: ['AI_GATEWAY_KEY'] },
  cerebras: { serviceId: 'supply.cerebras', baseUrl: 'https://api.cerebras.ai/v1/', secrets: ['CEREBRAS_API_KEY'] },
  nvidia: { serviceId: 'supply.nvidia', baseUrl: 'https://integrate.api.nvidia.com/v1/', secrets: ['NVIDIA_API_KEY'] },
  sambanova: { serviceId: 'supply.sambanova', baseUrl: 'https://api.sambanova.ai/v1/', secrets: ['SAMBANOVA_API_KEY'] },
  siliconflow: { serviceId: 'supply.siliconflow', baseUrl: 'https://api.siliconflow.com/v1/', secrets: ['SILICONFLOW_API_KEY'] },
  zai: { serviceId: 'supply.zai', baseUrl: 'https://api.z.ai/api/paas/v4/', secrets: ['ZAI_API_KEY'] },
};

const source = sources[process.env.OWNED_BENCHMARK_SOURCE];
const models = process.env.OWNED_BENCHMARK_MODELS?.split(',').filter(Boolean) ?? [];
if (source === undefined || models.length === 0 || models.length > 8 || new Set(models).size !== models.length) throw new TypeError('owned_identity_probe_configuration_invalid');
const credential = source.secrets.map((name) => process.env[name]).find((value) => typeof value === 'string' && value.length >= 8 && value.length <= 8_192 && !/[\r\n]/u.test(value));
if (credential === undefined) throw new TypeError('owned_identity_probe_credential_missing');

const results = [];
for (const requestedModel of models) {
  const started = performance.now();
  const response = await fetch(new URL('chat/completions', source.baseUrl), {
    method: 'POST',
    headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ model: requestedModel, messages: [{ role: 'user', content: 'Reply with exactly OK.' }], temperature: 0, max_tokens: 8 }),
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  const latencyMs = Math.round((performance.now() - started) * 100) / 100;
  const text = await response.text();
  if (text.length > 1_000_000) throw new TypeError('owned_identity_probe_response_too_large');
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  const observedModel = typeof body?.model === 'string' && body.model.length <= 200 ? body.model : null;
  results.push({ requestedModel, observedModel, identityMatches: requestedModel === observedModel, status: response.status, usageReported: Number.isSafeInteger(body?.usage?.prompt_tokens) && Number.isSafeInteger(body?.usage?.completion_tokens), latencyMs });
}

process.stdout.write(`${JSON.stringify({ schemaVersion: 'clervo.owned-chat-identity-probe.v1', checkedAt: new Date().toISOString(), serviceId: source.serviceId, externalCalls: results.length, ownerCashSpentUsd: 0, secretValuesRecorded: false, promptOrOutputPayloadsRecorded: false, results }, null, 2)}\n`);
