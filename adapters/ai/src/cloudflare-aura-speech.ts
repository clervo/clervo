import { createHash } from 'node:crypto';
import type { AiExecutionRequest } from '../../../packages/contracts/src/index.js';
import type { AiAdapterExecution, AiExecutionAdapter } from '../../../services/ai/src/execution.js';
import type { AiArtifactStore, AiHttpTransport } from './openai-compatible.js';

const exactModelId = '@cf/deepgram/aura-2-en';
const endpointModelPath = '@cf/deepgram/aura-2-en';
const supportedVoice = 'thalia';

export interface CloudflareAuraSpeechAdapterConfig {
  routeId: string;
  accountId: string;
  secretName: string;
  maximumResponseBytes: number;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function validMp3(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 512
    && (Buffer.from(bytes.subarray(0, 3)).toString('ascii') === 'ID3'
      || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0));
}

function parseJsonAudio(bytes: Uint8Array, maximumResponseBytes: number): Uint8Array {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new TypeError('cloudflare_aura_response_invalid'); }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('cloudflare_aura_response_invalid');
  const body = value as Record<string, unknown>;
  if (body.success !== undefined && body.success !== true) throw new TypeError('cloudflare_aura_response_invalid');
  const result = body.result;
  let encoded: unknown;
  if (typeof result === 'string') encoded = result;
  else if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    const record = result as Record<string, unknown>;
    encoded = record.audio ?? record.data;
  } else encoded = body.audio;
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > Math.ceil(maximumResponseBytes * 4 / 3) + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) throw new TypeError('cloudflare_aura_response_invalid');
  const audio = Uint8Array.from(Buffer.from(encoded, 'base64'));
  if (audio.byteLength > maximumResponseBytes) throw new TypeError('cloudflare_aura_response_invalid');
  return audio;
}

export class CloudflareAuraSpeechAdapter implements AiExecutionAdapter {
  readonly routeId: string;
  readonly #config: Readonly<CloudflareAuraSpeechAdapterConfig>;
  readonly #transport: AiHttpTransport;
  readonly #secret: (name: string) => Promise<string>;
  readonly #artifacts: AiArtifactStore;
  readonly #clock: () => string;

  constructor(input: {
    config: CloudflareAuraSpeechAdapterConfig;
    transport: AiHttpTransport;
    secret(name: string): Promise<string>;
    artifacts: AiArtifactStore;
    clock?: () => string;
  }) {
    if (!/^ai\.route\.[a-z0-9_]+$/u.test(input.config.routeId)
      || !/^[a-f0-9]{32}$/u.test(input.config.accountId)
      || !/^[A-Z][A-Z0-9_]{2,63}$/u.test(input.config.secretName)
      || !Number.isInteger(input.config.maximumResponseBytes)
      || input.config.maximumResponseBytes < 512
      || input.config.maximumResponseBytes > 20_000_000) throw new TypeError('cloudflare_aura_config_invalid');
    this.routeId = input.config.routeId;
    this.#config = Object.freeze({ ...input.config });
    this.#transport = input.transport;
    this.#secret = input.secret;
    this.#artifacts = input.artifacts;
    this.#clock = input.clock ?? (() => new Date().toISOString());
  }

  async execute(input: Readonly<{ request: AiExecutionRequest; exactModelId: string; signal: AbortSignal }>): Promise<Readonly<AiAdapterExecution>> {
    if (input.exactModelId !== exactModelId || input.request.productId !== 'ai.speech' || input.request.input.kind !== 'speech') throw new TypeError('cloudflare_aura_request_binding_invalid');
    if (input.request.input.voice !== supportedVoice || input.request.input.responseFormat !== 'mp3') throw new TypeError('cloudflare_aura_voice_or_format_invalid');
    if (input.request.input.input.length > 2_000 || input.request.usageBounds.audioCharacters < input.request.input.input.length) throw new TypeError('cloudflare_aura_character_limit_exceeded');
    let credential: string;
    try { credential = await this.#secret(this.#config.secretName); }
    catch { throw new TypeError('cloudflare_aura_credential_unavailable'); }
    if (credential.length < 8 || credential.length > 8_192 || /[\r\n]/u.test(credential)) throw new TypeError('cloudflare_aura_credential_invalid');

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.#config.accountId}/ai/run/${endpointModelPath}`;
    let response;
    try {
      response = await this.#transport.request({
        url,
        headers: Object.freeze({ authorization: `Bearer ${credential}`, accept: 'application/json', 'content-type': 'application/json' }),
        body: new TextEncoder().encode(JSON.stringify({ text: input.request.input.input, speaker: supportedVoice, encoding: 'mp3' })),
        signal: input.signal,
        maximumResponseBytes: this.#config.maximumResponseBytes,
      });
    } catch { throw new TypeError('cloudflare_aura_transport_failed'); }
    if (response.status < 200 || response.status >= 300 || response.body.byteLength === 0) throw new TypeError('cloudflare_aura_http_failed');
    const mediaType = response.contentType.split(';')[0]?.trim().toLowerCase();
    const audio = mediaType === 'application/json'
      ? parseJsonAudio(response.body, this.#config.maximumResponseBytes)
      : mediaType === 'audio/mpeg' ? response.body : new Uint8Array();
    if (!validMp3(audio)) throw new TypeError('cloudflare_aura_response_invalid');
    const stored = await this.#artifacts.put({ bytes: audio, mimeType: 'audio/mpeg' });
    if (stored.sha256 !== sha256(audio)) throw new TypeError('cloudflare_aura_artifact_hash_invalid');
    return Object.freeze({
      // This identity is endpoint-bound. Workers AI does not echo a model label.
      modelIdentity: exactModelId,
      completedAt: this.#clock(),
      usage: Object.freeze({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, images: 0, audioCharacters: input.request.input.input.length, videoSeconds: 0, musicGenerations: 0, virtualTryOnImages: 0 }),
      output: Object.freeze({ kind: 'speech', artifact: Object.freeze({ ...stored, mimeType: 'audio/mpeg', bytes: audio.byteLength }) }),
    });
  }
}
