#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const credentials = {
  cloudflareAccount: process.env.CLOUDFLARE_ACCOUNT_ID,
  cloudflare: process.env.CLOUDFLARE_AI_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN,
  deepgram: process.env.DEEPGRAM_API_KEY,
  groq: process.env.GROQ_API_KEY,
};
if (Object.values(credentials).some((value) => typeof value !== 'string' || value.length < 8)) throw new Error('transcription benchmark credentials are required');

const phrases = [
  'Clervo preserves payment idempotency across every retry and timeout.',
  'Seven bright lanterns remained beside the northern garden gate.',
  'The coral robot packed twelve blue notebooks before sunrise.',
  'Reliable systems reject unknown states without duplicating customer work.',
  'A quiet silver train crossed the valley at twenty minutes past six.',
];
const sources = [
  { sourceId: 'deepgram_nova_3', serviceId: 'supply.deepgram', modelId: 'nova-3', identityBasis: 'exact_request_and_response_model_family' },
  { sourceId: 'groq_whisper_large_v3', serviceId: 'supply.groq', modelId: 'whisper-large-v3', identityBasis: 'exact_request_endpoint_response_unlabeled' },
  { sourceId: 'groq_whisper_large_v3_turbo', serviceId: 'supply.groq', modelId: 'whisper-large-v3-turbo', identityBasis: 'exact_request_endpoint_response_unlabeled' },
  { sourceId: 'cloudflare_nova_3', serviceId: 'supply.cloudflare_workers_ai', modelId: '@cf/deepgram/nova-3', identityBasis: 'immutable_exact_model_endpoint_response_unlabeled' },
  { sourceId: 'cloudflare_whisper_large_v3_turbo', serviceId: 'supply.cloudflare_workers_ai', modelId: '@cf/openai/whisper-large-v3-turbo', identityBasis: 'immutable_exact_model_endpoint_response_unlabeled' },
];

const normalize = (value) => value.toLocaleLowerCase('en').normalize('NFKC').replace(/[^a-z0-9]+/gu, ' ').trim();
const tokens = (value) => normalize(value).split(/\s+/u).filter(Boolean);
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const percentile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};
const transcriptText = (body) => [
  body?.result?.text,
  body?.result?.transcription_info?.text,
  body?.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript,
  body?.results?.channels?.[0]?.alternatives?.[0]?.transcript,
  body?.text,
].find((value) => typeof value === 'string') ?? '';

async function synthesize(text) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${credentials.cloudflareAccount}/ai/run/@cf/deepgram/aura-2-en`, {
    method: 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${credentials.cloudflare}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text, speaker: 'thalia', encoding: 'mp3' }),
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  let audio = bytes;
  if ((response.headers.get('content-type') ?? '').includes('json')) {
    const body = JSON.parse(bytes.toString('utf8'));
    const encoded = body?.result?.audio ?? body?.result?.data ?? body?.result ?? body?.audio;
    audio = typeof encoded === 'string' ? Buffer.from(encoded, 'base64') : Buffer.alloc(0);
  }
  if (!response.ok || audio.byteLength < 512) throw new Error(`synthetic_audio_failed_${response.status}`);
  return audio;
}

function result(body, response, started, expected) {
  const expectedTokens = tokens(expected);
  const observed = new Set(tokens(transcriptText(body)));
  const matched = expectedTokens.filter((token) => observed.has(token)).length;
  const matchBasisPoints = Math.round(matched / expectedTokens.length * 10_000);
  return {
    status: response.status,
    latencyMs: Math.round(performance.now() - started),
    expectedWordCount: expectedTokens.length,
    expectedWordsMatched: matched,
    matchBasisPoints,
    passed: response.ok && matchBasisPoints >= 7_500,
  };
}

async function transcribeDeepgram(audio, expected) {
  const started = performance.now();
  const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=en-US&smart_format=true&mip_opt_out=true', {
    method: 'POST', headers: { accept: 'application/json', authorization: `Token ${credentials.deepgram}`, 'content-type': 'audio/mpeg' }, body: audio, redirect: 'error', signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => null);
  return { ...result(body, response, started, expected), durationSeconds: Number.isFinite(body?.metadata?.duration) ? body.metadata.duration : null, responseModelFamily: Object.values(body?.metadata?.model_info ?? {}).some((value) => value?.name === 'general-nova-3') };
}

async function transcribeGroq(audio, expected, modelId) {
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/mpeg' }), 'synthetic.mp3');
  form.append('model', modelId);
  form.append('language', 'en');
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  const started = performance.now();
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { accept: 'application/json', authorization: `Bearer ${credentials.groq}` }, body: form, redirect: 'error', signal: AbortSignal.timeout(60_000) });
  const body = await response.json().catch(() => null);
  return { ...result(body, response, started, expected), durationSeconds: Number.isFinite(body?.duration) ? body.duration : null, responseModelLabelPresent: typeof body?.model === 'string' };
}

async function transcribeCloudflare(audio, expected, modelId) {
  const query = modelId === '@cf/deepgram/nova-3' ? '?language=en-US&mip_opt_out=true' : '';
  const started = performance.now();
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${credentials.cloudflareAccount}/ai/run/${modelId}${query}`, {
    method: 'POST', headers: { accept: 'application/json', authorization: `Bearer ${credentials.cloudflare}`, 'content-type': 'audio/mpeg' }, body: audio, redirect: 'error', signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => null);
  return { ...result(body, response, started, expected), durationSeconds: null, responseModelLabelPresent: false };
}

const cases = [];
for (const [index, phrase] of phrases.entries()) {
  const audio = await synthesize(phrase);
  const outputs = [];
  for (const source of sources) {
    const observed = source.sourceId === 'deepgram_nova_3'
      ? await transcribeDeepgram(audio, phrase)
      : source.serviceId === 'supply.groq'
        ? await transcribeGroq(audio, phrase, source.modelId)
        : await transcribeCloudflare(audio, phrase, source.modelId);
    outputs.push({ sourceId: source.sourceId, ...observed });
  }
  cases.push({ caseId: `transcription_quality_${String(index + 1).padStart(2, '0')}`, audioBytes: audio.byteLength, audioHash: hash(audio), outputs });
}

const rankings = sources.map((source) => {
  const rows = cases.map(({ outputs }) => outputs.find(({ sourceId }) => sourceId === source.sourceId));
  const passed = rows.filter((row) => row.passed).length;
  const aggregateMatchBasisPoints = Math.round(rows.reduce((total, row) => total + row.expectedWordsMatched, 0) / rows.reduce((total, row) => total + row.expectedWordCount, 0) * 10_000);
  return { ...source, passed, total: rows.length, aggregateMatchBasisPoints, latencyMsP50: percentile(rows.map(({ latencyMs }) => latencyMs), 0.5), latencyMsP95: percentile(rows.map(({ latencyMs }) => latencyMs), 0.95), qualityGrade: passed === 5 && aggregateMatchBasisPoints >= 9_500 ? 'best' : passed === 5 ? 'good' : passed >= 4 ? 'acceptable' : 'rejected' };
}).sort((left, right) => right.aggregateMatchBasisPoints - left.aggregateMatchBasisPoints || left.latencyMsP50 - right.latencyMsP50);

const report = {
  schemaVersion: 'clervo.transcription-source-benchmark.v1',
  evaluatedAt: new Date().toISOString(),
  ownerCashSpentUsd: 0,
  maximumEstimatedPromotionalCreditDebitUsd: 0.01,
  fundingBasis: 'funded_primary_and_recurring_free_fallbacks',
  externalCalls: phrases.length * (sources.length + 1),
  credentialSlotsUsed: 3,
  customerDataUsed: false,
  syntheticAudioOnly: true,
  phraseValuesRecorded: false,
  transcriptValuesRecorded: false,
  rawAudioRecorded: false,
  sources,
  cases,
  rankings,
  decision: {
    minimumPerCaseMatchBasisPoints: 7_500,
    primarySourceId: rankings[0].sourceId,
    independentSupplyFamilies: new Set(rankings.filter(({ qualityGrade }) => qualityGrade !== 'rejected').map(({ serviceId }) => serviceId)).size,
    productionContractStatus: 'integration_pending',
    automaticPaidOverageAllowedByClervo: false,
  },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
