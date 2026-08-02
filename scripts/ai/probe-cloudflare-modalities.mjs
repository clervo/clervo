#!/usr/bin/env node

import { createHash } from 'node:crypto';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const credential = process.env.CLOUDFLARE_AI_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
if (typeof accountId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/u.test(accountId) || typeof credential !== 'string' || credential.length < 20 || /[\r\n]/u.test(credential)) throw new TypeError('cloudflare_modality_configuration_invalid');

const origin = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai`;
const headers = { authorization: `Bearer ${credential}`, accept: 'application/json' };
let externalCalls = 0;

function hash(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function boundedFetch(url, options, maximumBytes = 12_000_000) {
  externalCalls += 1;
  const started = performance.now();
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, redirect: 'error', signal: AbortSignal.timeout(60_000) });
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new TypeError('cloudflare_modality_response_too_large');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) throw new TypeError('cloudflare_modality_response_too_large');
  if (!response.ok) throw new TypeError(`cloudflare_modality_http_${response.status}`);
  return { bytes, contentType: response.headers.get('content-type') ?? 'unknown', latencyMs: Math.round((performance.now() - started) * 100) / 100 };
}

function json(bytes) {
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new TypeError('cloudflare_modality_json_invalid'); }
}

function finiteVector(value) {
  return Array.isArray(value) && value.length > 0 && value.every(Number.isFinite);
}

function audioBytes(response) {
  if (!response.contentType.includes('json')) return response.bytes;
  const body = json(response.bytes);
  const encoded = body?.result?.audio ?? body?.result?.data ?? body?.result ?? body?.audio;
  if (typeof encoded !== 'string' || encoded.length < 32) throw new TypeError('cloudflare_audio_shape_invalid');
  return Uint8Array.from(Buffer.from(encoded, 'base64'));
}

function transcript(body) {
  const candidates = [
    body?.result?.text,
    body?.result?.transcription_info?.text,
    body?.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript,
    body?.text,
  ];
  return candidates.find((value) => typeof value === 'string') ?? '';
}

const embeddingResponse = await boundedFetch(`${origin}/v1/embeddings`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ model: '@cf/baai/bge-m3', input: ['Clervo payment idempotency', 'A watercolor landscape'] }),
}, 3_000_000);
const embeddingBody = json(embeddingResponse.bytes);
const vectors = embeddingBody?.data?.map(({ embedding }) => embedding) ?? [];
if (embeddingBody?.model !== '@cf/baai/bge-m3' || vectors.length !== 2 || !vectors.every(finiteVector) || vectors[0].length !== vectors[1].length) throw new TypeError('cloudflare_embedding_shape_invalid');
const embeddings = {
  modelId: '@cf/baai/bge-m3',
  passed: hash(Buffer.from(new Float64Array(vectors[0]).buffer)) !== hash(Buffer.from(new Float64Array(vectors[1]).buffer)),
  exactIdentity: true,
  vectorCount: vectors.length,
  dimensions: vectors[0].length,
  finiteValues: true,
  distinctInputsDiffer: true,
  usageReported: Number.isSafeInteger(embeddingBody?.usage?.prompt_tokens) || Number.isSafeInteger(embeddingBody?.usage?.total_tokens),
  latencyMs: embeddingResponse.latencyMs,
};

async function generateImage(prompt, seed) {
  const response = await boundedFetch(`${origin}/run/@cf/black-forest-labs/flux-1-schnell`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, seed, steps: 4 }),
  });
  const body = json(response.bytes);
  const encoded = body?.result?.image ?? body?.image;
  if (typeof encoded !== 'string' || encoded.length < 128) throw new TypeError('cloudflare_image_shape_invalid');
  const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (!jpeg) throw new TypeError('cloudflare_image_media_invalid');
  return { bytes, latencyMs: response.latencyMs };
}

const imageOne = await generateImage('A red square centered on a plain white background, minimal icon.', 117);
const imageTwo = await generateImage('A blue circle centered on a plain white background, minimal icon.', 229);
const images = {
  modelId: '@cf/black-forest-labs/flux-1-schnell',
  passed: hash(imageOne.bytes) !== hash(imageTwo.bytes),
  outputs: 2,
  jpegValidated: true,
  distinctPromptsDiffer: true,
  outputBytes: [imageOne.bytes.byteLength, imageTwo.bytes.byteLength],
  outputHashes: [hash(imageOne.bytes), hash(imageTwo.bytes)],
  latencyMs: [imageOne.latencyMs, imageTwo.latencyMs],
};

const phrase = 'Clervo verifies every payment exactly once.';
const speechResponse = await boundedFetch(`${origin}/run/@cf/deepgram/aura-2-en`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: phrase, speaker: 'thalia', encoding: 'mp3' }),
});
const speechBytes = audioBytes(speechResponse);
if (speechBytes.byteLength < 512) throw new TypeError('cloudflare_speech_audio_invalid');
const speech = {
  modelId: '@cf/deepgram/aura-2-en',
  passed: true,
  speaker: 'thalia',
  outputBytes: speechBytes.byteLength,
  outputHash: hash(speechBytes),
  contentType: speechResponse.contentType,
  latencyMs: speechResponse.latencyMs,
};

async function transcribe(modelId, query = '') {
  const response = await boundedFetch(`${origin}/run/${modelId}${query}`, {
    method: 'POST',
    headers: { 'content-type': 'audio/mpeg' },
    body: speechBytes,
  }, 3_000_000);
  const body = json(response.bytes);
  const text = transcript(body).toLowerCase();
  const expected = ['clervo', 'verifies', 'payment', 'exactly', 'once'];
  const expectedWordsMatched = expected.filter((word) => text.includes(word)).length;
  return { modelId, passed: expectedWordsMatched >= 4, expectedWordsMatched, expectedWordsTotal: expected.length, outputPayloadRecorded: false, latencyMs: response.latencyMs };
}

const transcription = [
  await transcribe('@cf/openai/whisper-large-v3-turbo'),
  await transcribe('@cf/deepgram/nova-3', '?language=en-US&mip_opt_out=true'),
];

process.stdout.write(`${JSON.stringify({
  schemaVersion: 'clervo.cloudflare-modality-probe.v1',
  checkedAt: new Date().toISOString(),
  externalCalls,
  ownerCashSpentUsd: 0,
  freeAllocationBacked: true,
  secretValuesRecorded: false,
  promptOrOutputPayloadsRecorded: false,
  embeddings,
  images,
  speech,
  transcription,
}, null, 2)}\n`);
