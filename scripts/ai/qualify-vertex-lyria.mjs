#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const projectId = execFileSync('gcloud', ['config', 'get-value', 'project'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const accessToken = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/u.test(projectId) || accessToken.length < 8 || /[\r\n]/u.test(accessToken)) throw new Error('vertex_lyria_configuration_invalid');

const modelId = 'lyria-002';
const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/us-central1/publishers/google/models/${modelId}:predict`;
const started = performance.now();
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({
    instances: [{
      prompt: 'A calm minimal instrumental cue with warm piano, soft strings, and a gentle hopeful resolution at a moderate tempo.',
      negative_prompt: 'vocals, speech, recognizable melody, aggressive percussion',
      seed: 260802,
    }],
    parameters: {},
  }),
  redirect: 'error',
  signal: AbortSignal.timeout(180_000),
});
const latencyMs = Math.round(performance.now() - started);
const body = await response.json().catch(() => ({}));
const prediction = Array.isArray(body.predictions) && body.predictions.length === 1 ? body.predictions[0] : undefined;
const encodedAudio = typeof prediction?.audioContent === 'string'
  ? prediction.audioContent
  : typeof prediction?.bytesBase64Encoded === 'string'
    ? prediction.bytesBase64Encoded
    : typeof prediction?.audio?.bytesBase64Encoded === 'string'
      ? prediction.audio.bytesBase64Encoded
      : '';
const audio = encodedAudio === '' ? Buffer.alloc(0) : Buffer.from(encodedAudio, 'base64');
const wavHeaderValid = audio.byteLength >= 44 && audio.subarray(0, 4).toString('ascii') === 'RIFF' && audio.subarray(8, 12).toString('ascii') === 'WAVE';
const responseIdentityPresent = typeof body.model === 'string';
const identityMatches = responseIdentityPresent ? body.model.endsWith(`/models/${modelId}`) : endpoint.includes(`/models/${modelId}:predict`);
const observedMimeType = prediction?.mimeType ?? prediction?.mime_type ?? prediction?.audio?.mimeType;
const passed = response.status === 200 && (observedMimeType === 'audio/wav' || wavHeaderValid) && audio.byteLength > 44 && wavHeaderValid && identityMatches;

const report = {
  schemaVersion: 'clervo.vertex-lyria-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.google_vertex',
  exactModelId: modelId,
  productId: 'ai.music',
  externalCalls: 1,
  ownerCashSpentUsd: 0,
  creditBacked: true,
  maximumShadowCreditDebitUsd: 0.06,
  promptOrAudioPayloadRecorded: false,
  audioRetained: false,
  observation: {
    status: response.status,
    latencyMs,
    topLevelFieldNames: Object.keys(body).sort(),
    predictionFieldNames: prediction && typeof prediction === 'object' ? Object.keys(prediction).sort() : [],
    responseIdentityPresent,
    identityEvidence: responseIdentityPresent ? 'response_and_exact_endpoint' : 'immutable_exact_publisher_endpoint',
    identityMatches,
    mimeTypeMatches: observedMimeType === 'audio/wav',
    wavHeaderValid,
    audioByteLength: audio.byteLength,
    audioSha256: audio.byteLength === 0 ? null : `sha256:${createHash('sha256').update(audio).digest('hex')}`,
    passed,
    failureCode: passed ? null : response.status === 200 ? 'response_shape_mismatch' : `http_${response.status}`,
  },
  constraints: {
    durationSeconds: 30,
    instrumentalOnly: true,
    promptLanguage: 'en-US',
    outputFormat: 'audio/wav',
    outputSampleRateHz: 48000,
    safetyFiltersAppliedBySupplier: true,
    synthIdWatermarkAppliedBySupplier: true,
  },
  supplierPricing: { currency: 'USD', supplierPricePerThirtySecondsUsd: 0.06 },
  terms: {
    status: 'restricted',
    documentationUrl: 'https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/lyria-music-generation',
    pricingUrl: 'https://cloud.google.com/vertex-ai/generative-ai/pricing',
    valueAddedCustomerApplicationUseAllowed: true,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
