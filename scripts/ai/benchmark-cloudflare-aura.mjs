#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const cloudflareAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
const cloudflareCredential = process.env.CLOUDFLARE_AI_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
const groqCredential = process.env.GROQ_API_KEY;
if (!cloudflareAccount || !cloudflareCredential || !groqCredential) throw new Error('Cloudflare and Groq credentials are required');
if (!/^[a-f0-9]{32}$/u.test(cloudflareAccount)) throw new Error('Cloudflare account configuration is invalid');

const model = '@cf/deepgram/aura-2-en';
const transcriber = 'whisper-large-v3-turbo';
const phrases = [
  'Clervo checks every route before serving customer traffic safely.',
  'Seven quiet lanterns remained beside the northern garden gate.',
  'Payment retries must preserve one receipt for each operation.',
  'The coral robot packed twelve blue notebooks before sunrise.',
  'Reliable systems reject unknown states and recover without duplication.',
];

const normalize = (value) => value.toLocaleLowerCase('en').normalize('NFKC').replace(/[^a-z0-9]+/gu, ' ').trim();
const tokens = (value) => normalize(value).split(/\s+/u).filter(Boolean);
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const percentile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};

function parseAudio(bytes, contentType) {
  if (!contentType.includes('json')) return bytes;
  const body = JSON.parse(bytes.toString('utf8'));
  const value = body?.result?.audio ?? body?.result?.data ?? body?.result ?? body?.audio;
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) return Buffer.alloc(0);
  return Buffer.from(value, 'base64');
}

async function synthesize(text) {
  const started = performance.now();
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cloudflareAccount}/ai/run/${model}`, {
    method: 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${cloudflareCredential}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text, speaker: 'thalia', encoding: 'mp3' }),
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  const responseBytes = Buffer.from(await response.arrayBuffer());
  const audio = parseAudio(responseBytes, response.headers.get('content-type') ?? '');
  const valid = response.ok && audio.byteLength >= 512 && (audio.subarray(0, 3).toString('ascii') === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0));
  return { status: response.status, latencyMs: Math.round(performance.now() - started), audio: valid ? audio : null };
}

async function transcribe(audio, expected) {
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/mpeg' }), 'synthetic.mp3');
  form.append('model', transcriber);
  form.append('language', 'en');
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  const started = performance.now();
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${groqCredential}` },
    body: form,
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => null);
  const expectedTokens = tokens(expected);
  const observed = new Set(tokens(body?.text ?? ''));
  const matched = expectedTokens.filter((token) => observed.has(token)).length;
  return {
    status: response.status,
    latencyMs: Math.round(performance.now() - started),
    expectedWordCount: expectedTokens.length,
    expectedWordsMatched: matched,
    matchBasisPoints: Math.round((matched / expectedTokens.length) * 10_000),
    usageReported: Number.isFinite(body?.x_groq?.usage?.total_time) || Number.isFinite(body?.duration),
  };
}

const results = [];
for (const [index, phrase] of phrases.entries()) {
  const speech = await synthesize(phrase);
  const transcription = speech.audio === null ? null : await transcribe(speech.audio, phrase);
  const passed = speech.status === 200 && speech.audio !== null && transcription?.status === 200 && transcription.matchBasisPoints >= 7_500;
  results.push({
    caseId: `aura_quality_${String(index + 1).padStart(2, '0')}`,
    status: speech.status,
    speechLatencyMs: speech.latencyMs,
    outputBytes: speech.audio?.byteLength ?? 0,
    outputHash: speech.audio === null ? null : hash(speech.audio),
    transcriptionStatus: transcription?.status ?? null,
    transcriptionLatencyMs: transcription?.latencyMs ?? null,
    expectedWordCount: transcription?.expectedWordCount ?? tokens(phrase).length,
    expectedWordsMatched: transcription?.expectedWordsMatched ?? 0,
    matchBasisPoints: transcription?.matchBasisPoints ?? 0,
    transcriptionUsageReported: transcription?.usageReported ?? false,
    passed,
  });
}

const report = {
  schemaVersion: 'clervo.cloudflare-aura-quality.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.cloudflare_workers_ai',
  exactModelId: model,
  exactIdentityBasis: 'immutable_exact_model_endpoint_response_unlabeled',
  speaker: 'thalia',
  format: 'mp3',
  independentEvaluator: { serviceId: 'supply.groq', exactModelId: transcriber },
  ownerCashSpentUsd: 0,
  fundingBasis: 'recurring_free_allocations',
  externalCalls: results.length * 2,
  credentialSlotsUsed: { synthesis: 1, transcription: 1 },
  customerDataUsed: false,
  syntheticTextOnly: true,
  rawAudioRecorded: false,
  phraseValuesRecorded: false,
  transcriptValuesRecorded: false,
  results,
  summary: {
    passed: results.filter((result) => result.passed).length,
    total: results.length,
    aggregateMatchBasisPoints: Math.round(results.reduce((total, result) => total + result.expectedWordsMatched, 0) / results.reduce((total, result) => total + result.expectedWordCount, 0) * 10_000),
    speechLatencyMsP95: percentile(results.map(({ speechLatencyMs }) => speechLatencyMs), 0.95),
    transcriptionLatencyMsP95: percentile(results.map(({ transcriptionLatencyMs }) => transcriptionLatencyMs ?? 60_000), 0.95),
    qualityGrade: results.every(({ passed }) => passed) ? 'good' : results.filter(({ passed }) => passed).length >= 4 ? 'acceptable' : 'rejected',
  },
  limits: {
    maximumInputCharacters: 2_000,
    customerPricePerThousandCharactersUsd: 0.012,
    shadowSupplierPricePerThousandCharactersUsd: 0.03,
    automaticPaidOverageAllowedByClervo: false,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
