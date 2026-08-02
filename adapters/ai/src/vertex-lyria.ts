import type { AiArtifactStore, AiHttpTransport } from './openai-compatible.js';

export interface VertexLyriaConfig {
  projectId: string;
  exactModelId: 'lyria-002';
  location: 'us-central1';
  maximumResponseBytes: number;
}

export interface VertexLyriaResult {
  modelIdentity: 'lyria-002';
  durationSeconds: 30;
  instrumentalOnly: true;
  artifact: Readonly<{ artifactUri: string; sha256: string; mimeType: 'audio/wav'; bytes: number }>;
  supplierCostMicrousd: 60000;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('vertex_lyria_response_invalid');
  return value as Record<string, unknown>;
}

export class VertexLyriaAdapter {
  constructor(readonly dependencies: Readonly<{ config: VertexLyriaConfig; transport: AiHttpTransport; accessToken: () => Promise<string>; artifacts: AiArtifactStore }>) {
    const { config } = dependencies;
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/u.test(config.projectId) || config.exactModelId !== 'lyria-002' || config.location !== 'us-central1' || !Number.isSafeInteger(config.maximumResponseBytes) || config.maximumResponseBytes < 1_000_000 || config.maximumResponseBytes > 16_000_000) throw new Error('vertex_lyria_configuration_invalid');
  }

  async generate(input: Readonly<{ prompt: string; negativePrompt?: string; seed: number; maximumSupplierCostMicrousd: number; signal: AbortSignal }>): Promise<Readonly<VertexLyriaResult>> {
    if (input.prompt.length < 1 || input.prompt.length > 2_000 || /[\u0000-\u001F\u007F]/u.test(input.prompt) || input.negativePrompt !== undefined && (input.negativePrompt.length > 1_000 || /[\u0000-\u001F\u007F]/u.test(input.negativePrompt)) || !Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 4_294_967_295 || input.maximumSupplierCostMicrousd < 60_000) throw new Error('vertex_lyria_request_invalid');
    const accessToken = await this.dependencies.accessToken();
    if (accessToken.length < 8 || /[\r\n]/u.test(accessToken)) throw new Error('vertex_lyria_credential_invalid');
    const { config } = this.dependencies;
    const url = `https://${config.location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/locations/${config.location}/publishers/google/models/${config.exactModelId}:predict`;
    const payload = { instances: [{ prompt: input.prompt, ...(input.negativePrompt === undefined ? {} : { negative_prompt: input.negativePrompt }), seed: input.seed }], parameters: {} };
    let response;
    try {
      response = await this.dependencies.transport.request({ url, headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json', 'content-type': 'application/json' }, body: new TextEncoder().encode(JSON.stringify(payload)), signal: input.signal, maximumResponseBytes: config.maximumResponseBytes });
    } catch { throw new Error('vertex_lyria_transport_failed'); }
    if (response.status !== 200 || response.contentType !== 'application/json') throw new Error('vertex_lyria_unavailable');
    let body: Record<string, unknown>;
    try { body = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body))); } catch { throw new Error('vertex_lyria_response_invalid'); }
    if (!Array.isArray(body.predictions) || body.predictions.length !== 1) throw new Error('vertex_lyria_response_invalid');
    const prediction = record(body.predictions[0]);
    const encoded = typeof prediction.bytesBase64Encoded === 'string' ? prediction.bytesBase64Encoded : typeof prediction.audioContent === 'string' ? prediction.audioContent : '';
    const audio = encoded === '' ? new Uint8Array() : new Uint8Array(Buffer.from(encoded, 'base64'));
    if (audio.byteLength < 44 || audio.byteLength > config.maximumResponseBytes || Buffer.from(audio.subarray(0, 4)).toString('ascii') !== 'RIFF' || Buffer.from(audio.subarray(8, 12)).toString('ascii') !== 'WAVE') throw new Error('vertex_lyria_audio_invalid');
    const stored = await this.dependencies.artifacts.put({ bytes: audio, mimeType: 'audio/wav' });
    return Object.freeze({ modelIdentity: 'lyria-002', durationSeconds: 30, instrumentalOnly: true, artifact: Object.freeze({ ...stored, mimeType: 'audio/wav', bytes: audio.byteLength }), supplierCostMicrousd: 60_000 });
  }
}
