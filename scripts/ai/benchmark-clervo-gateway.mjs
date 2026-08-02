#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const corpusPath = path.join(root, 'benchmarks/stage6/clervo-gateway-quality-screen.v1.json');
const models = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function percentile(values, quantile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * quantile) - 1] ?? null;
}

async function configuration() {
  const file = await readFile(path.join(root, '.env'), 'utf8');
  const local = Object.fromEntries(file.split(/\r?\n/u).filter((line) => line !== '' && !line.startsWith('#')).map((line) => {
    const separator = line.indexOf('=');
    return separator < 1 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
  }));
  const baseUrl = process.env.CLERVO_AI_BASE_URL ?? local.CLERVO_AI_BASE_URL;
  const opaqueCredential = process.env.CLERVO_AI_API_KEY ?? local.CLERVO_AI_API_KEY;
  if (typeof baseUrl !== 'string' || typeof opaqueCredential !== 'string' || opaqueCredential.length < 8 || /[\r\n]/u.test(opaqueCredential)) throw new TypeError('clervo_benchmark_configuration_invalid');
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.hostname !== 'ai.clervo.dev' || base.username !== '' || base.password !== '' || base.search !== '' || base.hash !== '') throw new TypeError('clervo_benchmark_base_url_invalid');
  return { endpoint: new URL(`${base.pathname.replace(/\/$/u, '')}/chat/completions`, base.origin), opaqueCredential };
}

async function request(config, model, messages) {
  const started = performance.now();
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.opaqueCredential}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Return only one JSON object matching the requested answer shape. Do not use Markdown or add keys.' },
        ...messages,
      ],
      response_format: { type: 'json_object' },
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(45_000),
  });
  const latencyMs = Math.round((performance.now() - started) * 100) / 100;
  const text = await response.text();
  if (text.length > 1_000_000) throw new TypeError('clervo_benchmark_response_too_large');
  if (!response.ok) return { passed: false, status: response.status, latencyMs, modelIdentity: null, usage: null, failureCode: `http_${response.status}` };
  try {
    const body = JSON.parse(text);
    const content = body?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : undefined;
    const usage = body?.usage;
    return {
      passed: false,
      status: response.status,
      latencyMs,
      modelIdentity: typeof body?.model === 'string' ? body.model : null,
      usage: {
        inputTokens: Number.isSafeInteger(usage?.prompt_tokens) ? usage.prompt_tokens : null,
        outputTokens: Number.isSafeInteger(usage?.completion_tokens) ? usage.completion_tokens : null,
      },
      parsed,
      failureCode: null,
    };
  } catch {
    return { passed: false, status: response.status, latencyMs, modelIdentity: null, usage: null, failureCode: 'invalid_json' };
  }
}

const corpusBytes = await readFile(corpusPath);
const corpus = JSON.parse(corpusBytes.toString('utf8'));
if (corpus.schemaVersion !== 'clervo.stage6.gateway-quality-corpus.v1' || !Array.isArray(corpus.tasks) || corpus.tasks.length !== 10 || new Set(corpus.tasks.map(({ taskId }) => taskId)).size !== corpus.tasks.length) throw new TypeError('clervo_benchmark_corpus_invalid');
const config = await configuration();
const report = {
  schemaVersion: 'clervo.stage6.gateway-quality-run.v1',
  evaluatedAt: new Date().toISOString(),
  corpusSha256: `sha256:${createHash('sha256').update(corpusBytes).digest('hex')}`,
  ownerCashSpentUsd: 0,
  supplierBalanceDebitKnown: false,
  promptOrOutputPayloadsRecorded: false,
  externalCalls: 0,
  models: [],
};

for (const model of models) {
  const results = [];
  for (const task of corpus.tasks) {
    const observed = await request(config, model, task.messages);
    report.externalCalls += 1;
    const identityMatches = observed.modelIdentity === model;
    const answerMatches = observed.parsed !== undefined && JSON.stringify(canonical(observed.parsed)) === JSON.stringify(canonical(task.expected));
    const usageValid = observed.usage?.inputTokens > 0 && observed.usage?.outputTokens > 0;
    results.push({ taskId: task.taskId, category: task.category, passed: observed.status === 200 && identityMatches && answerMatches && usageValid, status: observed.status, latencyMs: observed.latencyMs, identityMatches, answerMatches, usageValid, failureCode: observed.failureCode });
  }
  const passed = results.filter((result) => result.passed).length;
  const latencies = results.map(({ latencyMs }) => latencyMs);
  report.models.push({ model, passed, total: results.length, scoreBasisPoints: Math.round((passed / results.length) * 10_000), latencyMsP50: percentile(latencies, 0.5), latencyMsP95: percentile(latencies, 0.95), results });
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
