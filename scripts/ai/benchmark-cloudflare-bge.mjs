#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const credential = process.env.CLOUDFLARE_AI_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
if (typeof accountId !== 'string' || !/^[a-f0-9]{32}$/u.test(accountId) || typeof credential !== 'string' || credential.length < 8) throw new Error('embedding benchmark credentials are required');

const modelId = '@cf/baai/bge-m3';
const pairs = [
  ['query: How should duplicate payment retries be handled?', 'passage: Payment idempotency reuses one operation key so retries return the original receipt without a second charge.'],
  ['query: What protects outbound fetching from internal networks?', 'passage: SSRF defenses resolve and validate public addresses, reject redirects to private ranges, and enforce fixed egress policy.'],
  ['query: How are provider secrets kept out of customer responses?', 'passage: Credentials are resolved inside the adapter and are never placed in source, logs, receipts, errors, or downstream payloads.'],
  ['query: What happens when supplier usage is unknown?', 'passage: Unknown metering fails closed before settlement so the cost ceiling cannot be exceeded or silently estimated.'],
  ['query: How does Clervo avoid serving a substituted AI model?', 'passage: Exact route qualification compares observed identity with the requested immutable model and rejects any mismatch.'],
  ['query: What is required before deleting a customer artifact?', 'passage: Deletion requires tenant ownership, an exact object identity, an idempotent lifecycle operation, and an auditable result.'],
  ['query: How is free allocation prevented from becoming paid overage?', 'passage: An application ledger enforces a hard allowance ceiling and denies new work before any automatic paid upgrade or overage.'],
  ['query: What should happen after a transient primary provider failure?', 'passage: The router may use an independently qualified fallback only for retry-safe transient failures within the same bounded operation.'],
];
const distractors = [
  'passage: Watercolor painting uses transparent pigment layered on textured cotton paper.',
  'passage: A sourdough starter is refreshed with flour and water before baking bread.',
  'passage: Orbital mechanics predicts a satellite path using velocity and gravitational force.',
  'passage: Botanical gardens label plant species and maintain seasonal irrigation schedules.',
  'passage: Jazz harmony often adds seventh and ninth intervals to a chord progression.',
  'passage: Coastal weather changes as sea temperatures influence wind and cloud formation.',
  'passage: Ceramic glaze becomes glasslike when fired at sufficiently high temperature.',
  'passage: A bicycle derailleur moves the chain between gears to change mechanical advantage.',
];
const inputs = [...pairs.map(([query]) => query), ...pairs.map(([, passage]) => passage), ...distractors];
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const cosine = (left, right) => {
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) { dot += left[index] * right[index]; leftNorm += left[index] ** 2; rightNorm += right[index] ** 2; }
  return dot / Math.sqrt(leftNorm * rightNorm);
};

const started = performance.now();
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelId}`, {
  method: 'POST',
  headers: { accept: 'application/json', authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
  body: JSON.stringify({ text: inputs, pooling: 'cls' }),
  redirect: 'error',
  signal: AbortSignal.timeout(60_000),
});
const latencyMs = Math.round(performance.now() - started);
const body = await response.json().catch(() => null);
const result = body?.result ?? body;
const vectors = result?.data;
const shape = result?.shape;
if (!response.ok || !Array.isArray(vectors) || vectors.length !== inputs.length || !vectors.every((vector) => Array.isArray(vector) && vector.length === 1024 && vector.every(Number.isFinite)) || !Array.isArray(shape)) throw new Error(`embedding_benchmark_failed_${response.status}`);

const queries = vectors.slice(0, pairs.length);
const documents = vectors.slice(pairs.length);
const cases = queries.map((query, index) => {
  const scores = documents.map((document, documentIndex) => ({ documentIndex, similarity: cosine(query, document) })).sort((left, right) => right.similarity - left.similarity);
  const rank = scores.findIndex(({ documentIndex }) => documentIndex === index) + 1;
  const relevant = scores.find(({ documentIndex }) => documentIndex === index).similarity;
  const strongestWrong = scores.find(({ documentIndex }) => documentIndex !== index).similarity;
  return { caseId: `embedding_retrieval_${String(index + 1).padStart(2, '0')}`, relevantRank: rank, relevantCosine: Math.round(relevant * 1_000_000) / 1_000_000, strongestWrongCosine: Math.round(strongestWrong * 1_000_000) / 1_000_000, margin: Math.round((relevant - strongestWrong) * 1_000_000) / 1_000_000, passed: rank === 1 };
});
const usage = result?.usage ?? body?.usage;
const promptTokens = Number.isSafeInteger(usage?.prompt_tokens) ? usage.prompt_tokens : null;
const report = {
  schemaVersion: 'clervo.cloudflare-bge-retrieval.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.cloudflare_workers_ai',
  exactModelId: modelId,
  exactIdentityBasis: 'immutable_exact_model_endpoint_response_unlabeled',
  ownerCashSpentUsd: 0,
  fundingBasis: 'recurring_free_allocation',
  externalCalls: 1,
  credentialSlotsUsed: 1,
  customerDataUsed: false,
  syntheticInputsOnly: true,
  inputValuesRecorded: false,
  vectorValuesRecorded: false,
  inputCorpusHash: hash(Buffer.from(JSON.stringify(inputs))),
  observation: { status: response.status, latencyMs, vectorCount: vectors.length, dimensions: vectors[0].length, pooling: result?.pooling ?? 'unknown', responseShape: shape, promptTokens, usageReported: promptTokens !== null },
  cases,
  summary: { passed: cases.filter((item) => item.passed).length, total: cases.length, topOneAccuracyBasisPoints: Math.round(cases.filter((item) => item.passed).length / cases.length * 10_000), minimumMargin: Math.min(...cases.map(({ margin }) => margin)), qualityGrade: cases.every(({ passed }) => passed) ? 'good' : cases.filter(({ passed }) => passed).length >= 7 ? 'acceptable' : 'rejected' },
  decision: { adapterStatus: promptTokens === null ? 'blocked_missing_usage' : 'ready_to_implement', automaticPaidOverageAllowedByClervo: false },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
