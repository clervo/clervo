#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sources = {
  hcnsec_gateway: { serviceId: 'supply.hcnsec_gateway', baseUrl: 'https://api.hcnsec.cn/v1/', secrets: ['AI_GATEWAY_KEY'], fundingBasis: 'owner_reported_balance' },
  cerebras: { serviceId: 'supply.cerebras', baseUrl: 'https://api.cerebras.ai/v1/', secrets: ['CEREBRAS_API_KEY'], fundingBasis: 'recurring_free_or_promotional' },
  mistral: { serviceId: 'supply.mistral', baseUrl: 'https://api.mistral.ai/v1/', secrets: ['MISTRAL_API_KEY'], fundingBasis: 'unknown' },
  nvidia: { serviceId: 'supply.nvidia', baseUrl: 'https://integrate.api.nvidia.com/v1/', secrets: ['NVIDIA_API_KEY'], fundingBasis: 'recurring_free_or_promotional' },
  openrouter: { serviceId: 'supply.openrouter', baseUrl: 'https://openrouter.ai/api/v1/', secrets: ['OPENROUTER_API_KEY'], fundingBasis: 'unknown' },
  sambanova: { serviceId: 'supply.sambanova', baseUrl: 'https://api.sambanova.ai/v1/', secrets: ['SAMBANOVA_API_KEY'], fundingBasis: 'recurring_free_or_promotional' },
  siliconflow: { serviceId: 'supply.siliconflow', baseUrl: 'https://api.siliconflow.com/v1/', secrets: ['SILICONFLOW_API_KEY'], fundingBasis: 'owner_reported_balance' },
  zai: { serviceId: 'supply.zai', baseUrl: 'https://api.z.ai/api/paas/v4/', secrets: ['ZAI_API_KEY'], fundingBasis: 'owner_reported_balance_or_promotional' },
};

const sourceName = process.env.OWNED_BENCHMARK_SOURCE;
const source = sources[sourceName];
if (source === undefined) throw new TypeError('owned_benchmark_source_invalid');
if (source.fundingBasis === 'unknown') throw new TypeError('owned_benchmark_funding_guard_unresolved');
const credential = source.secrets.map((name) => process.env[name]).find((value) => typeof value === 'string' && value.length >= 8 && value.length <= 8_192 && !/[\r\n]/u.test(value));
if (credential === undefined) throw new TypeError('owned_benchmark_credential_missing');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const corpusPath = path.join(root, 'benchmarks/stage6/clervo-gateway-quality-screen.v1.json');
const discovery = JSON.parse(await readFile(path.join(root, 'docs/evidence/supply-foundation/owned-ai-source-discovery.v1.json'), 'utf8'));
const discovered = discovery.sources.find(({ serviceId }) => serviceId === source.serviceId)?.modelIds ?? [];
const models = process.env.OWNED_BENCHMARK_MODELS?.split(',').filter(Boolean) ?? [];
if (models.length === 0 || models.length > 8 || new Set(models).size !== models.length || models.some((model) => !discovered.includes(model))) throw new TypeError('owned_benchmark_models_invalid');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * quantile) - 1] ?? null;
}

async function complete(model, task) {
  const started = performance.now();
  const response = await fetch(new URL('chat/completions', source.baseUrl), {
    method: 'POST',
    headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: 'Return only one JSON object matching the requested answer shape. Do not use Markdown or add keys.' }, ...task.messages],
      temperature: 0,
      max_tokens: 512,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  const latencyMs = Math.round((performance.now() - started) * 100) / 100;
  const text = await response.text();
  if (text.length > 1_000_000) throw new TypeError('owned_benchmark_response_too_large');
  if (!response.ok) return { status: response.status, latencyMs, failureCode: `http_${response.status}` };
  try {
    const body = JSON.parse(text);
    const content = body?.choices?.[0]?.message?.content;
    return { status: response.status, latencyMs, modelIdentity: body?.model, usage: body?.usage, parsed: typeof content === 'string' ? JSON.parse(content) : undefined, failureCode: null };
  } catch { return { status: response.status, latencyMs, failureCode: 'invalid_json' }; }
}

const corpusBytes = await readFile(corpusPath);
const corpus = JSON.parse(corpusBytes.toString('utf8'));
if (!Array.isArray(corpus.tasks) || corpus.tasks.length !== 10) throw new TypeError('owned_benchmark_corpus_invalid');
const report = {
  schemaVersion: 'clervo.owned-chat-quality-run.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: source.serviceId,
  fundingBasis: source.fundingBasis,
  corpusSha256: `sha256:${createHash('sha256').update(corpusBytes).digest('hex')}`,
  ownerCashSpentUsd: 0,
  promptOrOutputPayloadsRecorded: false,
  externalCalls: 0,
  models: [],
};

for (const model of models) {
  const results = [];
  for (const task of corpus.tasks) {
    const observed = await complete(model, task);
    report.externalCalls += 1;
    const identityMatches = observed.modelIdentity === model;
    const answerMatches = observed.parsed !== undefined && JSON.stringify(canonical(observed.parsed)) === JSON.stringify(canonical(task.expected));
    const usageValid = Number.isSafeInteger(observed.usage?.prompt_tokens) && observed.usage.prompt_tokens > 0 && Number.isSafeInteger(observed.usage?.completion_tokens) && observed.usage.completion_tokens > 0;
    results.push({ taskId: task.taskId, category: task.category, passed: observed.status === 200 && identityMatches && answerMatches && usageValid, status: observed.status, latencyMs: observed.latencyMs, identityMatches, answerMatches, usageValid, failureCode: observed.failureCode });
  }
  const passed = results.filter(({ passed }) => passed).length;
  report.models.push({ model, passed, total: results.length, scoreBasisPoints: passed * 1000, latencyMsP50: percentile(results.map(({ latencyMs }) => latencyMs), 0.5), latencyMsP95: percentile(results.map(({ latencyMs }) => latencyMs), 0.95), results });
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
