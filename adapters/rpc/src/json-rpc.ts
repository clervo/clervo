export interface RpcHttpResponse {
  status: number;
  contentType: string;
  body: Uint8Array;
}

export interface RpcHttpTransport {
  request(input: Readonly<{ url: string; body: Uint8Array; signal: AbortSignal; maximumResponseBytes: number }>): Promise<Readonly<RpcHttpResponse>>;
}

export function createBoundedRpcHttpTransport(fetcher: typeof globalThis.fetch = globalThis.fetch): RpcHttpTransport {
  return Object.freeze({
    async request(input: Parameters<RpcHttpTransport['request']>[0]): Promise<Readonly<RpcHttpResponse>> {
      const response = await fetcher(input.url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: Uint8Array.from(input.body).buffer,
        redirect: 'error',
        signal: input.signal,
      });
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^(?:0|[1-9][0-9]{0,15})$/u.test(declared) || Number(declared) > input.maximumResponseBytes)) throw new Error('rpc_response_too_large');
      if (response.body === null) throw new Error('rpc_response_empty');
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          total += next.value.byteLength;
          if (total > input.maximumResponseBytes) {
            await reader.cancel();
            throw new Error('rpc_response_too_large');
          }
          chunks.push(next.value);
        }
      } finally { reader.releaseLock(); }
      const body = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      return Object.freeze({ status: response.status, contentType: response.headers.get('content-type') ?? '', body });
    },
  });
}

export interface JsonRpcAdapterConfig {
  routeId: string;
  chainId: string;
  allowedHosts: readonly string[];
  maximumRequestBytes: number;
  maximumResponseBytes: number;
  timeoutMs: number;
}

export interface JsonRpcCall {
  method: string;
  params: unknown;
}

export type JsonRpcOutcome =
  | Readonly<{ id: number; ok: true; result: unknown }>
  | Readonly<{ id: number; ok: false; error: Readonly<{ code: number; message: string }> }>;

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('rpc_response_invalid');
  return value as Record<string, unknown>;
}

function endpoint(value: string, allowedHosts: readonly string[]): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('rpc_endpoint_invalid'); }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' || parsed.hash !== '' || !allowedHosts.includes(parsed.hostname)
    || /^(?:localhost|127(?:\.|$)|10(?:\.|$)|169\.254(?:\.|$)|192\.168(?:\.|$)|172\.(?:1[6-9]|2[0-9]|3[01])(?:\.|$)|0\.0\.0\.0$|\[?::1\]?$)/u.test(parsed.hostname)) throw new Error('rpc_endpoint_invalid');
  return parsed.href;
}

function config(input: Readonly<JsonRpcAdapterConfig>): void {
  if (!/^rpc\.route\.[a-z0-9][a-z0-9._-]{2,63}$/u.test(input.routeId) || !/^(?:eip155:[1-9][0-9]{0,9}|solana:[A-Za-z0-9]{8,64})$/u.test(input.chainId)
    || input.allowedHosts.length < 1 || input.allowedHosts.length > 16 || new Set(input.allowedHosts).size !== input.allowedHosts.length
    || input.allowedHosts.some((host) => !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u.test(host))
    || !Number.isSafeInteger(input.maximumRequestBytes) || input.maximumRequestBytes < 1_024 || input.maximumRequestBytes > 1_048_576
    || !Number.isSafeInteger(input.maximumResponseBytes) || input.maximumResponseBytes < 1_024 || input.maximumResponseBytes > 52_428_800
    || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 100 || input.timeoutMs > 60_000) throw new TypeError('rpc_adapter_config_invalid');
}

function parseOutcome(value: unknown, expectedIds: ReadonlySet<number>): JsonRpcOutcome {
  const response = record(value);
  if (response.jsonrpc !== '2.0' || !Number.isSafeInteger(response.id) || !expectedIds.has(response.id as number)) throw new Error('rpc_response_binding_invalid');
  const hasResult = Object.hasOwn(response, 'result');
  const hasError = Object.hasOwn(response, 'error');
  if (hasResult === hasError) throw new Error('rpc_response_invalid');
  const id = response.id as number;
  if (hasResult) return Object.freeze({ id, ok: true, result: response.result });
  const error = record(response.error);
  if (!Number.isSafeInteger(error.code) || (error.code as number) < -32_768 || (error.code as number) > 32_767 || typeof error.message !== 'string' || error.message.length < 1 || error.message.length > 512 || /[\u0000-\u001F\u007F]/u.test(error.message)) throw new Error('rpc_response_invalid');
  return Object.freeze({ id, ok: false, error: Object.freeze({ code: error.code as number, message: error.message }) });
}

export class JsonRpcAdapter {
  readonly routeId: string;
  readonly chainId: string;
  readonly #config: Readonly<JsonRpcAdapterConfig>;
  readonly #transport: RpcHttpTransport;
  readonly #resolveEndpoint: () => Promise<string>;

  constructor(input: Readonly<{ config: JsonRpcAdapterConfig; transport: RpcHttpTransport; resolveEndpoint(): Promise<string> }>) {
    config(input.config);
    this.routeId = input.config.routeId;
    this.chainId = input.config.chainId;
    this.#config = Object.freeze({ ...input.config, allowedHosts: Object.freeze([...input.config.allowedHosts]) });
    this.#transport = input.transport;
    this.#resolveEndpoint = input.resolveEndpoint;
  }

  async execute(calls: readonly Readonly<JsonRpcCall>[], signal?: AbortSignal): Promise<readonly JsonRpcOutcome[]> {
    if (calls.length < 1 || calls.length > 100 || calls.some(({ method }) => !/^[A-Za-z][A-Za-z0-9_]{1,63}$/u.test(method))) throw new TypeError('rpc_adapter_calls_invalid');
    const requests = calls.map(({ method, params }, index) => ({ jsonrpc: '2.0' as const, id: index + 1, method, params }));
    let body: Uint8Array;
    try { body = new TextEncoder().encode(JSON.stringify(requests.length === 1 ? requests[0] : requests)); }
    catch { throw new TypeError('rpc_adapter_calls_invalid'); }
    if (body.byteLength > this.#config.maximumRequestBytes) throw new TypeError('rpc_request_too_large');
    let url: string;
    try { url = endpoint(await this.#resolveEndpoint(), this.#config.allowedHosts); }
    catch { throw new Error('rpc_endpoint_unavailable'); }
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.#config.timeoutMs);
    let response: Readonly<RpcHttpResponse>;
    try {
      response = await this.#transport.request({ url, body, signal: controller.signal, maximumResponseBytes: this.#config.maximumResponseBytes });
    } catch {
      throw new Error('rpc_transport_failed');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    if (response.status !== 200 || response.body.byteLength < 1 || response.body.byteLength > this.#config.maximumResponseBytes || response.contentType.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new Error('rpc_http_failed');
    let decoded: unknown;
    try { decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body)); }
    catch { throw new Error('rpc_response_invalid'); }
    const values = requests.length === 1 ? [decoded] : Array.isArray(decoded) ? decoded : [];
    if (values.length !== requests.length) throw new Error('rpc_response_binding_invalid');
    const expectedIds = new Set(requests.map(({ id }) => id));
    const outcomes = values.map((value) => parseOutcome(value, expectedIds));
    if (new Set(outcomes.map(({ id }) => id)).size !== requests.length) throw new Error('rpc_response_binding_invalid');
    outcomes.sort((left, right) => left.id - right.id);
    return Object.freeze(outcomes);
  }
}
