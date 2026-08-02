#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const cloudflareCredential = process.env.CLOUDFLARE_AI_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
const projectId = execFileSync('gcloud', ['config', 'get-value', 'project'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const vertexCredential = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
if (typeof accountId !== 'string' || !/^[a-f0-9]{32}$/u.test(accountId) || typeof cloudflareCredential !== 'string' || cloudflareCredential.length < 8 || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/u.test(projectId) || vertexCredential.length < 8) throw new Error('image benchmark credentials are required');

const modelId = '@cf/black-forest-labs/flux-1-schnell';
const evaluatorModelId = 'gemini-3.6-flash';
const tasks = [
  { caseId: 'flux_quality_01', seed: 117, prompt: 'A red square centered on a plain white background, minimal icon.', criteria: 'One red square is centered on a plain white background; no other object or readable text is present.' },
  { caseId: 'flux_quality_02', seed: 229, prompt: 'Minimal flat vector icon: one green triangle centered directly above one purple square on a clean white background, no text.', criteria: 'One green triangle is above one purple square; the background is white; no readable text is present.' },
  { caseId: 'flux_quality_03', seed: 331, prompt: 'A soft watercolor painting of a white lighthouse on a rocky island at sunset, with two small sailboats on calm water.', criteria: 'A white lighthouse stands on a rocky island at sunset; two sailboats are visible on calm water; the style resembles watercolor.' },
  { caseId: 'flux_quality_04', seed: 443, prompt: 'A realistic black cat wearing a bright orange scarf, sitting in fresh snow beneath an evergreen tree, daylight.', criteria: 'A black cat wears an orange scarf while sitting in snow; an evergreen tree is visible; the scene is daylight.' },
  { caseId: 'flux_quality_05', seed: 557, prompt: 'Overhead food photograph of exactly three green apples beside one wooden spoon on a pale linen cloth, natural window light.', criteria: 'Exactly three green apples and one wooden spoon are visible from overhead on pale linen in natural-looking light.' },
];
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const percentile = (values, fraction) => [...values].sort((left, right) => left - right)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];
let externalCalls = 0;

function jpegDimensions(bytes) {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('generated_image_not_jpeg');
  let offset = 2;
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === undefined || marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = (bytes[offset + 2] ?? 0) * 256 + (bytes[offset + 3] ?? 0);
    if (length < 2 || offset + length + 2 > bytes.byteLength) break;
    if (marker >= 0xc0 && marker <= 0xc3) return { width: (bytes[offset + 7] ?? 0) * 256 + (bytes[offset + 8] ?? 0), height: (bytes[offset + 5] ?? 0) * 256 + (bytes[offset + 6] ?? 0) };
    offset += length + 2;
  }
  throw new Error('generated_image_dimensions_missing');
}

async function generate(task) {
  externalCalls += 1;
  const started = performance.now();
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelId}`, {
    method: 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${cloudflareCredential}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: task.prompt, seed: task.seed, steps: 4 }),
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => null);
  const encoded = body?.result?.image ?? body?.image;
  const bytes = typeof encoded === 'string' ? Buffer.from(encoded, 'base64') : Buffer.alloc(0);
  if (!response.ok || bytes.byteLength < 1_024) return { status: response.status, failureCode: body?.errors?.[0]?.code ?? 'unknown', bytes: null, latencyMs: Math.round(performance.now() - started), width: null, height: null };
  return { status: response.status, failureCode: null, bytes, latencyMs: Math.round(performance.now() - started), ...jpegDimensions(bytes) };
}

async function evaluate(task, image) {
  externalCalls += 1;
  const started = performance.now();
  const response = await fetch(`https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${evaluatorModelId}:generateContent`, {
    method: 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${vertexCredential}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Evaluate only the supplied image against the criteria. Return JSON with exactly: requiredElementsPresent boolean, forbiddenContradictionsAbsent boolean, score integer 0 through 5. A score of 4 means all material requirements are clear; 5 means excellent adherence.' }] },
      contents: [{ role: 'user', parts: [{ text: task.criteria }, { inlineData: { mimeType: 'image/jpeg', data: image.bytes.toString('base64') } }] }],
      generationConfig: {
        maxOutputTokens: 1_024,
        responseModalities: ['TEXT'],
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          required: ['requiredElementsPresent', 'forbiddenContradictionsAbsent', 'score'],
          properties: {
            requiredElementsPresent: { type: 'BOOLEAN' },
            forbiddenContradictionsAbsent: { type: 'BOOLEAN' },
            score: { type: 'INTEGER', minimum: 0, maximum: 5 },
          },
        },
      },
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => null);
  const text = body?.candidates?.[0]?.content?.parts?.filter((part) => part?.thought !== true && typeof part?.text === 'string').map((part) => part.text).join('') ?? '';
  let score;
  try { score = JSON.parse(text); } catch { score = null; }
  const valid = score !== null && typeof score === 'object' && typeof score.requiredElementsPresent === 'boolean' && typeof score.forbiddenContradictionsAbsent === 'boolean' && Number.isInteger(score.score) && score.score >= 0 && score.score <= 5;
  const usage = body?.usageMetadata;
  return {
    status: response.status,
    latencyMs: Math.round(performance.now() - started),
    evaluatorIdentityMatches: body?.modelVersion === evaluatorModelId,
    usageReported: Number.isSafeInteger(usage?.promptTokenCount) && Number.isSafeInteger(usage?.totalTokenCount),
    responseShapeValid: valid,
    requiredElementsPresent: valid ? score.requiredElementsPresent : false,
    forbiddenContradictionsAbsent: valid ? score.forbiddenContradictionsAbsent : false,
    score: valid ? score.score : 0,
    passed: response.ok && body?.modelVersion === evaluatorModelId && valid && score.requiredElementsPresent && score.forbiddenContradictionsAbsent && score.score >= 4,
  };
}

const results = [];
for (const task of tasks) {
  const image = await generate(task);
  const evaluation = image.bytes === null ? { status: null, latencyMs: null, evaluatorIdentityMatches: false, usageReported: false, responseShapeValid: false, requiredElementsPresent: false, forbiddenContradictionsAbsent: false, score: 0, passed: false } : await evaluate(task, image);
  results.push({ caseId: task.caseId, generationStatus: image.status, generationFailureCode: image.failureCode, generationLatencyMs: image.latencyMs, outputBytes: image.bytes?.byteLength ?? 0, outputHash: image.bytes === null ? null : hash(image.bytes), width: image.width, height: image.height, ...evaluation });
}

const passed = results.filter((result) => result.passed).length;
const report = {
  schemaVersion: 'clervo.cloudflare-flux-quality.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.cloudflare_workers_ai',
  exactModelId: modelId,
  exactIdentityBasis: 'immutable_exact_model_endpoint_response_unlabeled',
  independentEvaluator: { serviceId: 'supply.google_vertex', exactModelId: evaluatorModelId },
  ownerCashSpentUsd: 0,
  maximumShadowCreditDebitUsd: 0.05,
  externalCalls,
  credentialSlotsUsed: 2,
  customerDataUsed: false,
  syntheticPromptsOnly: true,
  promptValuesRecorded: false,
  imagePayloadsRecorded: false,
  evaluatorOutputPayloadsRecorded: false,
  results,
  summary: { passed, total: results.length, safetyRejected: results.filter(({ generationFailureCode }) => generationFailureCode === 3030).length, averageScore: results.reduce((total, result) => total + result.score, 0) / results.length, generationLatencyMsP50: percentile(results.map(({ generationLatencyMs }) => generationLatencyMs), 0.5), generationLatencyMsP95: percentile(results.map(({ generationLatencyMs }) => generationLatencyMs), 0.95), outputDimensions: [...new Set(results.filter(({ width }) => width !== null).map(({ width, height }) => `${width}x${height}`))], qualityGrade: passed === 5 ? 'good' : passed >= 4 ? 'acceptable' : 'rejected' },
  limits: { promptCharacters: 2_048, steps: 4, outputsPerRequest: 1, outputFormat: 'image/jpeg', automaticPaidOverageAllowedByClervo: false },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
