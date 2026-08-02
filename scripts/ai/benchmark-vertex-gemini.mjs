#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const corpusPath = path.join(root, 'benchmarks/stage6/clervo-gateway-quality-screen.v1.json');
const models = [
  { modelId: 'gemini-3.5-flash-lite', inputMicrosPerMillion: 300_000, outputMicrosPerMillion: 2_500_000 },
  { modelId: 'gemini-3.6-flash', inputMicrosPerMillion: 1_500_000, outputMicrosPerMillion: 7_500_000 },
  { modelId: 'gemini-3.5-flash', inputMicrosPerMillion: 1_500_000, outputMicrosPerMillion: 9_000_000 },
];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * quantile) - 1] ?? null;
}

function configuration() {
  const projectId = execFileSync('gcloud', ['config', 'get-value', 'project'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const accessToken = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/u.test(projectId) || accessToken.length < 8 || /[\r\n]/u.test(accessToken)) throw new TypeError('vertex_benchmark_configuration_invalid');
  return { projectId, accessToken };
}

async function request(config, model, task) {
  const system = [
    'Return only one JSON object matching the requested answer shape. Do not use Markdown or add keys.',
    ...task.messages.filter(({ role }) => role === 'system').map(({ content }) => content),
  ].join('\n');
  const contents = task.messages.filter(({ role }) => role !== 'system').map(({ role, content }) => ({ role: role === 'assistant' ? 'model' : 'user', parts: [{ text: content }] }));
  const started = performance.now();
  const response = await fetch(`https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/locations/global/publishers/google/models/${model.modelId}:generateContent`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.accessToken}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 1_024, responseModalities: ['TEXT'], responseMimeType: 'application/json' } }),
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  const latencyMs = Math.round((performance.now() - started) * 100) / 100;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { status: response.status, latencyMs, failureCode: `http_${response.status}` };
  const parts = body?.candidates?.[0]?.content?.parts ?? [];
  const content = parts.filter((part) => part?.thought !== true && typeof part?.text === 'string').map(({ text }) => text).join('');
  let parsed;
  try { parsed = JSON.parse(content); } catch { return { status: response.status, latencyMs, modelIdentity: body.modelVersion, usage: body.usageMetadata, failureCode: 'invalid_json' }; }
  return { status: response.status, latencyMs, modelIdentity: body.modelVersion, usage: body.usageMetadata, parsed, failureCode: null };
}

function shadowCostMicros(usage, model) {
  const input = Number.isSafeInteger(usage?.promptTokenCount) ? usage.promptTokenCount : 0;
  const output = (Number.isSafeInteger(usage?.candidatesTokenCount) ? usage.candidatesTokenCount : 0) + (Number.isSafeInteger(usage?.thoughtsTokenCount) ? usage.thoughtsTokenCount : 0);
  return Math.ceil((input * model.inputMicrosPerMillion + output * model.outputMicrosPerMillion) / 1_000_000);
}

const corpusBytes = await readFile(corpusPath);
const corpus = JSON.parse(corpusBytes.toString('utf8'));
if (corpus.schemaVersion !== 'clervo.stage6.gateway-quality-corpus.v1' || !Array.isArray(corpus.tasks) || corpus.tasks.length !== 10) throw new TypeError('vertex_benchmark_corpus_invalid');
const config = configuration();
const report = {
  schemaVersion: 'clervo.stage6.vertex-gemini-quality-run.v1',
  evaluatedAt: new Date().toISOString(),
  corpusSha256: `sha256:${createHash('sha256').update(corpusBytes).digest('hex')}`,
  ownerCashSpentUsd: 0,
  creditBacked: true,
  promptOrOutputPayloadsRecorded: false,
  externalCalls: 0,
  maximumShadowCreditDebitMicros: 0,
  models: [],
};

for (const model of models) {
  const results = [];
  let modelShadowMicros = 0;
  for (const task of corpus.tasks) {
    const observed = await request(config, model, task);
    report.externalCalls += 1;
    const identityMatches = observed.modelIdentity === model.modelId;
    const answerMatches = observed.parsed !== undefined && JSON.stringify(canonical(observed.parsed)) === JSON.stringify(canonical(task.expected));
    const usageValid = Number.isSafeInteger(observed.usage?.promptTokenCount) && observed.usage.promptTokenCount > 0 && Number.isSafeInteger(observed.usage?.totalTokenCount) && observed.usage.totalTokenCount > 0;
    const shadowMicros = shadowCostMicros(observed.usage, model);
    modelShadowMicros += shadowMicros;
    results.push({ taskId: task.taskId, category: task.category, passed: observed.status === 200 && identityMatches && answerMatches && usageValid, status: observed.status, latencyMs: observed.latencyMs, identityMatches, answerMatches, usageValid, shadowCreditDebitMicros: shadowMicros, failureCode: observed.failureCode });
  }
  report.maximumShadowCreditDebitMicros += modelShadowMicros;
  const passed = results.filter(({ passed }) => passed).length;
  const latencies = results.map(({ latencyMs }) => latencyMs);
  report.models.push({ model: model.modelId, passed, total: results.length, scoreBasisPoints: Math.round((passed / results.length) * 10_000), latencyMsP50: percentile(latencies, 0.5), latencyMsP95: percentile(latencies, 0.95), shadowCreditDebitMicros: modelShadowMicros, results });
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
