#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const corpusPath = path.join(root, 'benchmarks/stage6/clervo-gateway-quality-screen.v1.json');
const supportedModels = [
  '@cf/openai/gpt-oss-20b',
  '@cf/openai/gpt-oss-120b',
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/zai-org/glm-4.7-flash',
  '@cf/ibm-granite/granite-4.0-h-micro',
];
const requested = process.env.CLOUDFLARE_BENCHMARK_MODELS?.split(',').filter(Boolean);
const models = requested ?? supportedModels;
if (models.length === 0 || models.some((model) => !supportedModels.includes(model))) throw new TypeError('cloudflare_benchmark_model_selection_invalid');
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const credential = process.env.CLOUDFLARE_AI_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
if (typeof accountId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/u.test(accountId) || typeof credential !== 'string' || credential.length < 20 || /[\r\n]/u.test(credential)) throw new TypeError('cloudflare_benchmark_configuration_invalid');

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
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: 'Return only one JSON object matching the requested answer shape. Do not use Markdown or add keys.' }, ...task.messages], response_format: { type: 'json_object' }, max_tokens: 512 }),
    redirect: 'error',
    signal: AbortSignal.timeout(45_000),
  });
  const latencyMs = Math.round((performance.now() - started) * 100) / 100;
  const text = await response.text();
  if (text.length > 1_000_000) throw new TypeError('cloudflare_benchmark_response_too_large');
  if (!response.ok) return { status: response.status, latencyMs, failureCode: `http_${response.status}` };
  try {
    const body = JSON.parse(text);
    const content = body?.choices?.[0]?.message?.content;
    return { status: response.status, latencyMs, modelIdentity: body?.model, usage: body?.usage, parsed: typeof content === 'string' ? JSON.parse(content) : undefined, failureCode: null };
  } catch { return { status: response.status, latencyMs, failureCode: 'invalid_json' }; }
}

const corpusBytes = await readFile(corpusPath);
const corpus = JSON.parse(corpusBytes.toString('utf8'));
if (!Array.isArray(corpus.tasks) || corpus.tasks.length !== 10) throw new TypeError('cloudflare_benchmark_corpus_invalid');
const report = { schemaVersion: 'clervo.cloudflare-chat-quality-run.v1', evaluatedAt: new Date().toISOString(), corpusSha256: `sha256:${createHash('sha256').update(corpusBytes).digest('hex')}`, ownerCashSpentUsd: 0, freeAllocationBacked: true, promptOrOutputPayloadsRecorded: false, externalCalls: 0, models: [] };

for (const model of models) {
  const results = [];
  for (const task of corpus.tasks) {
    const observed = await complete(model, task); report.externalCalls += 1;
    const identityMatches = observed.modelIdentity === model;
    const answerMatches = observed.parsed !== undefined && JSON.stringify(canonical(observed.parsed)) === JSON.stringify(canonical(task.expected));
    const usageValid = Number.isSafeInteger(observed.usage?.prompt_tokens) && observed.usage.prompt_tokens > 0 && Number.isSafeInteger(observed.usage?.completion_tokens) && observed.usage.completion_tokens > 0;
    results.push({ taskId: task.taskId, category: task.category, passed: observed.status === 200 && identityMatches && answerMatches && usageValid, status: observed.status, latencyMs: observed.latencyMs, identityMatches, answerMatches, usageValid, failureCode: observed.failureCode });
  }
  const passed = results.filter(({ passed }) => passed).length;
  report.models.push({ model, passed, total: results.length, scoreBasisPoints: passed * 1000, latencyMsP50: percentile(results.map(({ latencyMs }) => latencyMs), 0.5), latencyMsP95: percentile(results.map(({ latencyMs }) => latencyMs), 0.95), results });
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
