#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const credential = process.env.MISTRAL_API_KEY;
if (typeof credential !== 'string' || credential.length < 8 || credential.length > 8_192 || /[\r\n]/u.test(credential)) throw new TypeError('mistral_modal_credential_missing');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const headers = { authorization: `Bearer ${credential}`, 'content-type': 'application/json', accept: 'application/json' };
let externalCalls = 0;

async function jsonRequest(url, body, maximumBytes = 2_000_000) {
  externalCalls += 1;
  const started = performance.now();
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(60_000) });
  const text = await response.text();
  if (text.length > maximumBytes) throw new TypeError('mistral_modal_response_too_large');
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  return { status: response.status, latencyMs: Math.round((performance.now() - started) * 100) / 100, body: parsed };
}

const embeddings = [];
for (const model of ['mistral-embed', 'codestral-embed']) {
  const observed = await jsonRequest('https://api.mistral.ai/v1/embeddings', { model, input: ['Clervo retrieval qualification.', 'Independent fallback route.'], encoding_format: 'float' });
  const vectors = observed.body?.data?.map(({ embedding }) => embedding) ?? [];
  const dimension = Array.isArray(vectors[0]) ? vectors[0].length : 0;
  embeddings.push({
    model,
    status: observed.status,
    modelMatches: observed.body?.model === model,
    vectorCount: vectors.length,
    dimension,
    finite: vectors.length === 2 && dimension > 0 && vectors.every((vector) => Array.isArray(vector) && vector.length === dimension && vector.every(Number.isFinite)),
    usageReported: Number.isSafeInteger(observed.body?.usage?.prompt_tokens) && observed.body.usage.prompt_tokens > 0,
    latencyMs: observed.latencyMs,
  });
}

externalCalls += 1;
const voicesResponse = await fetch('https://api.mistral.ai/v1/audio/voices?type=preset&limit=100', { headers: { authorization: `Bearer ${credential}`, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
const voicesText = await voicesResponse.text();
if (voicesText.length > 1_000_000) throw new TypeError('mistral_voices_response_too_large');
let voicesBody;
try { voicesBody = JSON.parse(voicesText); } catch { voicesBody = null; }
const voice = Array.isArray(voicesBody?.items) ? voicesBody.items.find(({ slug, id }) => slug === 'en_paul_neutral' && typeof id === 'string') : undefined;

const ttsModel = 'voxtral-mini-tts-2603';
const tts = await jsonRequest('https://api.mistral.ai/v1/audio/speech', { model: ttsModel, input: 'The quick brown fox jumps over the lazy dog.', response_format: 'wav', stream: false, voice_id: voice?.id });
const audio = typeof tts.body?.audio_data === 'string' && tts.body.audio_data.length <= 1_500_000 ? Buffer.from(tts.body.audio_data, 'base64') : Buffer.alloc(0);
const waveValid = audio.length > 44 && audio.subarray(0, 4).toString('ascii') === 'RIFF' && audio.subarray(8, 12).toString('ascii') === 'WAVE';

externalCalls += 1;
const transcriptionStarted = performance.now();
const form = new FormData();
form.append('model', 'voxtral-mini-2602');
form.append('language', 'en');
form.append('file', new Blob([audio], { type: 'audio/wav' }), 'clervo-modal.wav');
const transcriptionResponse = await fetch('https://api.mistral.ai/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${credential}`, accept: 'application/json' }, body: form, redirect: 'error', signal: AbortSignal.timeout(60_000) });
const transcriptionText = await transcriptionResponse.text();
if (transcriptionText.length > 1_000_000) throw new TypeError('mistral_transcription_response_too_large');
let transcriptionBody;
try { transcriptionBody = JSON.parse(transcriptionText); } catch { transcriptionBody = null; }
const normalizedTranscript = typeof transcriptionBody?.text === 'string' ? transcriptionBody.text.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim() : '';

const image = await readFile(path.join(root, 'apps/site/visual-baseline/home-320.png'));
const ocr = await jsonRequest('https://api.mistral.ai/v1/ocr', { model: 'mistral-ocr-4', document: { type: 'image_url', image_url: `data:image/png;base64,${image.toString('base64')}` }, include_image_base64: false }, 4_000_000);
const ocrMarkdown = Array.isArray(ocr.body?.pages) ? ocr.body.pages.map(({ markdown }) => typeof markdown === 'string' ? markdown : '').join('\n') : '';

process.stdout.write(`${JSON.stringify({
  schemaVersion: 'clervo.mistral-modal-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.mistral',
  fundingBasis: 'free_mode_evaluation_only',
  externalCalls,
  ownerCashSpentUsd: 0,
  secretValuesRecorded: false,
  promptOrOutputPayloadsRecorded: false,
  embeddings,
  speech: {
    tts: { model: ttsModel, status: tts.status, presetVoiceAvailable: voice !== undefined, audioBytes: audio.length, waveValid, latencyMs: tts.latencyMs },
    transcription: {
      model: 'voxtral-mini-2602',
      status: transcriptionResponse.status,
      modelMatches: transcriptionBody?.model === 'voxtral-mini-2602',
      transcriptTokenMatches: ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'the', 'lazy', 'dog'].filter((token) => normalizedTranscript.split(' ').includes(token)).length,
      usageReported: Number.isFinite(transcriptionBody?.usage?.prompt_audio_seconds) && transcriptionBody.usage.prompt_audio_seconds > 0,
      latencyMs: Math.round((performance.now() - transcriptionStarted) * 100) / 100,
    },
  },
  ocr: {
    model: 'mistral-ocr-4',
    status: ocr.status,
    modelMatches: ocr.body?.model === 'mistral-ocr-4' || ocr.body?.model === undefined,
    pages: Array.isArray(ocr.body?.pages) ? ocr.body.pages.length : 0,
    textCharacters: ocrMarkdown.length,
    clervoTextObserved: /clervo/iu.test(ocrMarkdown),
    latencyMs: ocr.latencyMs,
  },
}, null, 2)}\n`);
