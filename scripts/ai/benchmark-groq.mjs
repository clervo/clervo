#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const corpusPath = path.join(root, 'benchmarks/stage6/clervo-gateway-quality-screen.v1.json');
const supportedModels = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.6-27b',
];
const requestedModels = process.env.GROQ_BENCHMARK_MODELS?.split(',').filter(Boolean);
const models = requestedModels === undefined ? supportedModels : requestedModels;
if (models.length === 0 || models.some((model) => !supportedModels.includes(model))) throw new TypeError('groq_benchmark_model_selection_invalid');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * quantile) - 1] ?? null;
}

async function request(apiKey, model, task) {
  const reasoning = model.startsWith('openai/gpt-oss-')
    ? { reasoning_effort: 'low', reasoning_format: 'hidden', max_completion_tokens: 512 }
    : model.startsWith('qwen/')
      ? { reasoning_effort: 'none', max_completion_tokens: 256 }
      : { max_completion_tokens: 256 };
  const started = performance.now();
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Return only one JSON object matching the requested answer shape. Do not use Markdown or add keys.' },
        ...task.messages,
      ],
      response_format: { type: 'json_object' },
      ...reasoning,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(45_000),
  });
  const latencyMs = Math.round((performance.now() - started) * 100) / 100;
  const text = await response.text();
  if (text.length > 1_000_000) throw new TypeError('groq_benchmark_response_too_large');
  if (!response.ok) {
    let errorType = null;
    try { errorType = JSON.parse(text)?.error?.type ?? null; } catch { /* body is intentionally not retained */ }
    return { status: response.status, latencyMs, failureCode: `http_${response.status}`, errorType };
  }
  try {
    const body = JSON.parse(text);
    const content = body?.choices?.[0]?.message?.content;
    return { status: response.status, latencyMs, modelIdentity: body?.model, usage: body?.usage, parsed: typeof content === 'string' ? JSON.parse(content) : undefined, failureCode: null };
  } catch { return { status: response.status, latencyMs, failureCode: 'invalid_json' }; }
}

const credential = process.env.GROQ_API_KEY;
if (typeof credential !== 'string' || credential.length < 8 || /[\r\n]/u.test(credential)) throw new TypeError('groq_benchmark_configuration_invalid');
const corpusBytes = await readFile(corpusPath);
const corpus = JSON.parse(corpusBytes.toString('utf8'));
if (corpus.schemaVersion !== 'clervo.stage6.gateway-quality-corpus.v1' || !Array.isArray(corpus.tasks) || corpus.tasks.length !== 10) throw new TypeError('groq_benchmark_corpus_invalid');
const report = {
  schemaVersion: 'clervo.stage6.groq-quality-run.v1',
  evaluatedAt: new Date().toISOString(),
  corpusSha256: `sha256:${createHash('sha256').update(corpusBytes).digest('hex')}`,
  ownerCashSpentUsd: 0,
  freeTierBacked: true,
  promptOrOutputPayloadsRecorded: false,
  externalCalls: 0,
  models: [],
};

for (const model of models) {
  const results = [];
  for (const task of corpus.tasks) {
    const observed = await request(credential, model, task);
    report.externalCalls += 1;
    const identityMatches = observed.modelIdentity === model;
    const answerMatches = observed.parsed !== undefined && JSON.stringify(canonical(observed.parsed)) === JSON.stringify(canonical(task.expected));
    const usageValid = Number.isSafeInteger(observed.usage?.prompt_tokens) && observed.usage.prompt_tokens > 0 && Number.isSafeInteger(observed.usage?.completion_tokens) && observed.usage.completion_tokens > 0;
    results.push({ taskId: task.taskId, category: task.category, passed: observed.status === 200 && identityMatches && answerMatches && usageValid, status: observed.status, latencyMs: observed.latencyMs, identityMatches, answerMatches, usageValid, failureCode: observed.failureCode });
  }
  const passed = results.filter(({ passed }) => passed).length;
  const latencies = results.map(({ latencyMs }) => latencyMs);
  report.models.push({ model, passed, total: results.length, scoreBasisPoints: Math.round((passed / results.length) * 10_000), latencyMsP50: percentile(latencies, 0.5), latencyMsP95: percentile(latencies, 0.95), results });
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
