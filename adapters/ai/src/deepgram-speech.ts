import { createHash } from 'node:crypto';
import type { AiExecutionRequest } from '../../../packages/contracts/src/index.js';
import type { AiAdapterExecution, AiExecutionAdapter } from '../../../services/ai/src/execution.js';
import type { AiArtifactStore, AiHttpTransport } from './openai-compatible.js';

export interface DeepgramSpeechAdapterConfig {
  routeId: string;
  exactModelId: string;
  secretName: string;
  maximumResponseBytes: number;
}

const formats = {
  mp3: { query: { encoding: 'mp3' }, responseType: 'audio/mpeg', artifactType: 'audio/mpeg' },
  opus: { query: { encoding: 'opus', container: 'ogg' }, responseType: 'audio/ogg', artifactType: 'audio/ogg' },
  aac: { query: { encoding: 'aac' }, responseType: 'audio/aac', artifactType: 'audio/aac' },
  flac: { query: { encoding: 'flac' }, responseType: 'audio/flac', artifactType: 'audio/flac' },
  wav: { query: { encoding: 'linear16', container: 'wav', sample_rate: '24000' }, responseType: 'audio/wav', artifactType: 'audio/wav' },
  pcm: { query: { encoding: 'linear16', container: 'none', sample_rate: '24000' }, responseType: 'audio/l16', artifactType: 'audio/pcm' },
} as const;

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function signatureValid(bytes: Uint8Array, format: keyof typeof formats): boolean {
  if (bytes.byteLength < 4) return false;
  if (format === 'wav') return Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF';
  if (format === 'opus') return Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'OggS';
  if (format === 'flac') return Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'fLaC';
  if (format === 'aac') return bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xf0) === 0xf0;
  if (format === 'mp3') return Buffer.from(bytes.subarray(0, 3)).toString('ascii') === 'ID3' || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);
  return bytes.byteLength % 2 === 0;
}

export class DeepgramSpeechAdapter implements AiExecutionAdapter {
  readonly routeId: string;
  readonly #config: Readonly<DeepgramSpeechAdapterConfig>;
  readonly #transport: AiHttpTransport;
  readonly #secret: (name: string) => Promise<string>;
  readonly #artifacts: AiArtifactStore;
  readonly #clock: () => string;

  constructor(input: {
    config: DeepgramSpeechAdapterConfig;
    transport: AiHttpTransport;
    secret(name: string): Promise<string>;
    artifacts: AiArtifactStore;
    clock?: () => string;
  }) {
    if (!/^ai\.route\.[a-z0-9_]+$/u.test(input.config.routeId)
      || !/^aura-(?:1|2)-[a-z0-9-]{2,80}$/u.test(input.config.exactModelId)
      || !/^[A-Z][A-Z0-9_]{2,63}$/u.test(input.config.secretName)
      || !Number.isInteger(input.config.maximumResponseBytes)
      || input.config.maximumResponseBytes < 1
      || input.config.maximumResponseBytes > 20_000_000) throw new TypeError('deepgram_config_invalid');
    this.routeId = input.config.routeId;
    this.#config = Object.freeze({ ...input.config });
    this.#transport = input.transport;
    this.#secret = input.secret;
    this.#artifacts = input.artifacts;
    this.#clock = input.clock ?? (() => new Date().toISOString());
  }

  async execute(input: Readonly<{ request: AiExecutionRequest; exactModelId: string; signal: AbortSignal }>): Promise<Readonly<AiAdapterExecution>> {
    if (input.exactModelId !== this.#config.exactModelId || input.request.productId !== 'ai.speech' || input.request.input.kind !== 'speech') throw new TypeError('deepgram_request_binding_invalid');
    if (input.request.input.voice !== input.exactModelId) throw new TypeError('deepgram_voice_binding_invalid');
    if (input.request.input.input.length > 2_000 || input.request.usageBounds.audioCharacters < input.request.input.input.length) throw new TypeError('deepgram_character_limit_exceeded');
    let credential: string;
    try { credential = await this.#secret(this.#config.secretName); }
    catch { throw new TypeError('deepgram_credential_unavailable'); }
    if (credential.length < 8 || credential.length > 8_192 || /[\r\n]/u.test(credential)) throw new TypeError('deepgram_credential_invalid');

    const format = formats[input.request.input.responseFormat];
    const endpoint = new URL('https://api.deepgram.com/v1/speak');
    endpoint.searchParams.set('model', input.exactModelId);
    endpoint.searchParams.set('mip_opt_out', 'true');
    for (const [name, value] of Object.entries(format.query)) endpoint.searchParams.set(name, value);
    let response;
    try {
      response = await this.#transport.request({
        url: endpoint.href,
        headers: Object.freeze({ authorization: `Token ${credential}`, 'content-type': 'application/json', accept: format.responseType }),
        body: new TextEncoder().encode(JSON.stringify({ text: input.request.input.input })),
        signal: input.signal,
        maximumResponseBytes: this.#config.maximumResponseBytes,
      });
    } catch { throw new TypeError('deepgram_transport_failed'); }
    if (response.status < 200 || response.status >= 300 || response.body.byteLength === 0) throw new TypeError('deepgram_http_failed');
    const mediaType = response.contentType.split(';')[0]?.trim().toLowerCase();
    const observedModel = response.responseHeaders?.['dg-model-name'];
    const observedCharacters = response.responseHeaders?.['dg-char-count'];
    if (mediaType !== format.responseType || observedModel !== input.exactModelId || observedCharacters !== String(input.request.input.input.length) || !signatureValid(response.body, input.request.input.responseFormat)) throw new TypeError('deepgram_response_invalid');
    const stored = await this.#artifacts.put({ bytes: response.body, mimeType: format.artifactType });
    if (stored.sha256 !== sha256(response.body)) throw new TypeError('deepgram_artifact_hash_invalid');
    return Object.freeze({
      modelIdentity: observedModel,
      completedAt: this.#clock(),
      usage: Object.freeze({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: input.request.input.input.length, videoSeconds: 0, musicGenerations: 0, virtualTryOnImages: 0 }),
      output: Object.freeze({ kind: 'speech', artifact: Object.freeze({ ...stored, mimeType: format.artifactType, bytes: response.body.byteLength }) }),
    });
  }
}
