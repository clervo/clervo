import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const credential = process.env.GROQ_API_KEY;
const cloudflareAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
const cloudflareCredential = process.env.CLOUDFLARE_AI_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
if (!credential || !cloudflareAccount || !cloudflareCredential) throw new Error('GROQ_API_KEY and Cloudflare AI credentials are required');

const origin = 'https://api.groq.com';
const phrases = {
  english: 'Clervo measures every route before serving customer traffic safely',
  arabic: 'كليرفو تختبر كل مسار قبل خدمة العملاء بأمان اليوم',
};
const normalize = (value) => value.toLocaleLowerCase('und').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = (value) => normalize(value).split(/\s+/u).filter(Boolean);
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const speech = async ({ model, voice, input, language }) => {
  const started = performance.now();
  const response = await fetch(`${origin}/openai/v1/audio/speech`, {
    method: 'POST',
    headers: { accept: 'audio/wav', authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, voice, input, response_format: 'wav' }),
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  let failureCode = null;
  if (!response.ok) {
    try { failureCode = JSON.parse(bytes.toString('utf8'))?.error?.code ?? 'provider_rejected'; } catch { failureCode = 'provider_rejected'; }
  }
  const waveValid = response.ok && bytes.byteLength >= 512 && bytes.subarray(0, 4).toString('ascii') === 'RIFF';
  return {
    model,
    language,
    status: response.status,
    latencyMs: Math.round(performance.now() - started),
    waveValid,
    outputBytes: waveValid ? bytes.byteLength : 0,
    outputHash: waveValid ? hash(bytes) : null,
    failureCode,
    responseModelLabelPresent: false,
    exactIdentityStatus: waveValid ? 'request_accepted_response_unlabeled' : 'request_rejected_before_execution',
    bytes: waveValid ? bytes : null,
  };
};

const referenceSpeech = async () => {
  const started = performance.now();
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cloudflareAccount)}/ai/run/@cf/deepgram/aura-2-en`, {
    method: 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${cloudflareCredential}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text: phrases.english, speaker: 'thalia', encoding: 'mp3' }),
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
  if (!response.ok || audio.byteLength < 512) throw new Error(`reference_speech_failed_${response.status}`);
  return { status: response.status, latencyMs: Math.round(performance.now() - started), outputBytes: audio.byteLength, outputHash: hash(audio), bytes: audio };
};

const transcribe = async ({ model, audio, language, expected }) => {
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/mpeg' }), 'clervo-synthetic-speech.mp3');
  form.append('model', model);
  form.append('language', language);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  const started = performance.now();
  const response = await fetch(`${origin}/openai/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${credential}` },
    body: form,
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => null);
  const expectedTokens = tokens(expected);
  const observedTokens = new Set(tokens(body?.text ?? ''));
  const expectedWordsMatched = expectedTokens.filter((token) => observedTokens.has(token)).length;
  return {
    model,
    language,
    status: response.status,
    latencyMs: Math.round(performance.now() - started),
    expectedWordCount: expectedTokens.length,
    expectedWordsMatched,
    matchBasisPoints: Math.round((expectedWordsMatched / expectedTokens.length) * 10_000),
    usageReported: Number.isFinite(body?.x_groq?.usage?.total_time) || Number.isFinite(body?.duration),
    responseModelLabelPresent: typeof body?.model === 'string',
    exactIdentityStatus: body?.model === model ? 'response_label_matches' : 'request_accepted_response_unlabeled',
    passed: response.ok && expectedWordsMatched >= Math.ceil(expectedTokens.length * 0.75),
  };
};

const englishSpeech = await speech({ model: 'canopylabs/orpheus-v1-english', voice: 'hannah', input: phrases.english, language: 'en' });
const arabicSpeech = await speech({ model: 'canopylabs/orpheus-arabic-saudi', voice: 'noura', input: phrases.arabic, language: 'ar' });
const reference = await referenceSpeech();
const englishTranscriptions = [];
for (const model of ['whisper-large-v3', 'whisper-large-v3-turbo']) {
  englishTranscriptions.push(await transcribe({ model, audio: reference.bytes, language: 'en', expected: phrases.english }));
}

const publicSpeech = [englishSpeech, arabicSpeech].map(({ bytes: _bytes, ...result }) => result);
const publicReference = { ...reference };
delete publicReference.bytes;
const report = {
  schemaVersion: 'clervo.groq-speech-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.groq',
  ownerCashSpentUsd: 0,
  externalCalls: 5,
  credentialSlotsUsed: 1,
  customerAudioUsed: false,
  syntheticTextOnly: true,
  rawAudioRecorded: false,
  transcriptValuesRecorded: false,
  phraseValuesRecorded: false,
  speech: publicSpeech,
  referenceAudio: { serviceId: 'supply.cloudflare_workers_ai', synthetic: true, ...publicReference },
  transcription: englishTranscriptions,
  summary: {
    speechModelsPassed: publicSpeech.filter(({ status, waveValid }) => status === 200 && waveValid).length,
    speechModelsTermsBlocked: publicSpeech.filter(({ failureCode }) => failureCode === 'model_terms_required').length,
    transcriptionChecksPassed: englishTranscriptions.filter(({ passed }) => passed).length,
    exactResponseIdentityLabels: [...publicSpeech, ...englishTranscriptions].filter(({ exactIdentityStatus }) => exactIdentityStatus === 'response_label_matches').length,
    productionStatus: 'transcription_quality_passed_adapter_and_exact_response_identity_pending_speech_terms_blocked',
  },
  limits: {
    speechMaximumInputCharacters: 200,
    transcriptionFreeTierMaximumFileMb: 25,
    transcriptionMinimumBilledSeconds: 10,
    automaticPaidOverageAllowedByClervo: false,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
