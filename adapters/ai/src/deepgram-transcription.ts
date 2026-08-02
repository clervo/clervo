import { createHash } from 'node:crypto';
import type { AiHttpTransport } from './openai-compatible.js';

export interface TranscriptionRequest {
  operationId: string;
  exactModelId: 'nova-3';
  language: 'en-US';
  audio: Readonly<{
    bytes: Uint8Array;
    mimeType: 'audio/mpeg' | 'audio/wav';
    sha256: string;
  }>;
  maximumAudioSeconds: number;
  signal: AbortSignal;
}

export interface TranscriptionResult {
  operationId: string;
  exactModelId: 'nova-3';
  observedModelFamily: 'general-nova-3';
  observedModelVersion: string;
  completedAt: string;
  transcript: string;
  confidence: number;
  usage: Readonly<{ audioSeconds: number }>;
}

export interface DeepgramTranscriptionAdapterConfig {
  routeId: string;
  secretName: string;
  maximumAudioBytes: number;
  maximumResponseBytes: number;
}

function hash(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function validAudio(bytes: Uint8Array, mimeType: TranscriptionRequest['audio']['mimeType']): boolean {
  if (bytes.byteLength < 512) return false;
  if (mimeType === 'audio/wav') return Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WAVE';
  return Buffer.from(bytes.subarray(0, 3)).toString('ascii') === 'ID3' || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('deepgram_transcription_response_invalid');
  return value as Record<string, unknown>;
}

function parse(bytes: Uint8Array): Record<string, unknown> {
  try { return object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
  catch { throw new TypeError('deepgram_transcription_response_invalid'); }
}

export class DeepgramTranscriptionAdapter {
  readonly routeId: string;
  readonly #config: Readonly<DeepgramTranscriptionAdapterConfig>;
  readonly #transport: AiHttpTransport;
  readonly #secret: (name: string) => Promise<string>;
  readonly #clock: () => string;

  constructor(input: {
    config: DeepgramTranscriptionAdapterConfig;
    transport: AiHttpTransport;
    secret(name: string): Promise<string>;
    clock?: () => string;
  }) {
    if (!/^ai\.route\.[a-z0-9_]+$/u.test(input.config.routeId)
      || !/^[A-Z][A-Z0-9_]{2,63}$/u.test(input.config.secretName)
      || !Number.isInteger(input.config.maximumAudioBytes)
      || input.config.maximumAudioBytes < 512
      || input.config.maximumAudioBytes > 25_000_000
      || !Number.isInteger(input.config.maximumResponseBytes)
      || input.config.maximumResponseBytes < 1_024
      || input.config.maximumResponseBytes > 5_000_000) throw new TypeError('deepgram_transcription_config_invalid');
    this.routeId = input.config.routeId;
    this.#config = Object.freeze({ ...input.config });
    this.#transport = input.transport;
    this.#secret = input.secret;
    this.#clock = input.clock ?? (() => new Date().toISOString());
  }

  async execute(request: Readonly<TranscriptionRequest>): Promise<Readonly<TranscriptionResult>> {
    if (!/^op_[A-Za-z0-9]{20,64}$/u.test(request.operationId) || request.exactModelId !== 'nova-3' || request.language !== 'en-US') throw new TypeError('deepgram_transcription_request_invalid');
    if (!Number.isFinite(request.maximumAudioSeconds) || request.maximumAudioSeconds <= 0 || request.maximumAudioSeconds > 14_400) throw new TypeError('deepgram_transcription_duration_limit_invalid');
    if (request.audio.bytes.byteLength > this.#config.maximumAudioBytes || request.audio.sha256 !== hash(request.audio.bytes) || !validAudio(request.audio.bytes, request.audio.mimeType)) throw new TypeError('deepgram_transcription_audio_invalid');
    let credential: string;
    try { credential = await this.#secret(this.#config.secretName); }
    catch { throw new TypeError('deepgram_transcription_credential_unavailable'); }
    if (credential.length < 8 || credential.length > 8_192 || /[\r\n]/u.test(credential)) throw new TypeError('deepgram_transcription_credential_invalid');

    const endpoint = new URL('https://api.deepgram.com/v1/listen');
    endpoint.searchParams.set('model', 'nova-3');
    endpoint.searchParams.set('language', request.language);
    endpoint.searchParams.set('smart_format', 'true');
    endpoint.searchParams.set('mip_opt_out', 'true');
    let response;
    try {
      response = await this.#transport.request({
        url: endpoint.href,
        headers: Object.freeze({ authorization: `Token ${credential}`, accept: 'application/json', 'content-type': request.audio.mimeType }),
        body: request.audio.bytes,
        signal: request.signal,
        maximumResponseBytes: this.#config.maximumResponseBytes,
      });
    } catch { throw new TypeError('deepgram_transcription_transport_failed'); }
    if (response.status < 200 || response.status >= 300 || response.contentType.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new TypeError('deepgram_transcription_http_failed');

    const body = parse(response.body);
    const metadata = object(body.metadata);
    const duration = metadata.duration;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > request.maximumAudioSeconds) throw new TypeError('deepgram_transcription_usage_invalid');
    const modelInfo = object(metadata.model_info);
    const observed = Object.values(modelInfo).map(object).find((entry) => entry.name === 'general-nova-3');
    if (observed === undefined || typeof observed.version !== 'string' || observed.version.length === 0 || observed.version.length > 80) throw new TypeError('deepgram_transcription_identity_invalid');
    const results = object(body.results);
    if (!Array.isArray(results.channels) || results.channels.length !== 1) throw new TypeError('deepgram_transcription_response_invalid');
    const channel = object(results.channels[0]);
    if (!Array.isArray(channel.alternatives) || channel.alternatives.length < 1) throw new TypeError('deepgram_transcription_response_invalid');
    const alternative = object(channel.alternatives[0]);
    if (typeof alternative.transcript !== 'string' || alternative.transcript.length === 0 || alternative.transcript.length > 1_000_000 || typeof alternative.confidence !== 'number' || !Number.isFinite(alternative.confidence) || alternative.confidence < 0 || alternative.confidence > 1) throw new TypeError('deepgram_transcription_response_invalid');
    return Object.freeze({
      operationId: request.operationId,
      exactModelId: 'nova-3',
      observedModelFamily: 'general-nova-3',
      observedModelVersion: observed.version,
      completedAt: this.#clock(),
      transcript: alternative.transcript,
      confidence: alternative.confidence,
      usage: Object.freeze({ audioSeconds: duration }),
    });
  }
}
