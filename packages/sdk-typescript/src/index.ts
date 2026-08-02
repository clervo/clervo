export const CLERVO_CONTRACT_VERSION = '2026-07-29.1' as const;
export const CLERVO_RELEASE_CANDIDATE_ID = 'clervo-private-core-2026-08-02.1' as const;
export const CLERVO_RELEASE_CANDIDATE_INTERFACE_HASH = 'sha256:3a230339f444960f70c69e67c0b32dc600e7af8d7ae6c61101ee82226e536768' as const;

export type ClervoProductId = 'search.web' | 'search.answer';
export type ClervoExecutionMode = 'preview' | 'challenge';

export interface ClervoSearchRequest {
  query: string;
  maxResults?: number;
  language?: string;
  region?: string;
}

export interface ClervoSearchResult {
  contractVersion: typeof CLERVO_CONTRACT_VERSION;
  operationId: string;
  operation: 'search.query';
  productId: ClervoProductId;
  state: 'RECEIPTED';
  replayed: boolean;
  fundingMode: 'free' | 'paid';
  requestHash: string;
  output: {
    searchResponse: Record<string, unknown>;
    synthesisReport?: Record<string, unknown>;
  };
  receipt?: unknown;
}

export interface ClervoProblem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  operationId?: string;
  retryable?: boolean;
  [key: string]: unknown;
}

export interface ClervoRequestOptions {
  idempotencyKey?: string;
  mode?: ClervoExecutionMode;
  signal?: AbortSignal;
}

export interface ClervoClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  maxResponseBytes?: number;
}

function assertBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('invalid_clervo_base_url');
  }
  const loopback = parsed.hostname === 'localhost'
    || parsed.hostname === '127.0.0.1'
    || parsed.hostname === '[::1]';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) throw new TypeError('unsafe_clervo_base_url');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new TypeError('invalid_clervo_base_url');
  return parsed.toString().replace(/\/+$/u, '');
}

function assertSearchRequest(request: ClervoSearchRequest): void {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) throw new TypeError('invalid_search_request');
  if (
    typeof request.query !== 'string'
    || request.query.trim().length < 1
    || request.query.trim().length > 2_000
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(request.query)
  ) throw new TypeError('invalid_search_query');
  if (request.maxResults !== undefined && (!Number.isInteger(request.maxResults) || request.maxResults < 1 || request.maxResults > 10)) throw new TypeError('invalid_search_max_results');
  if (request.language !== undefined && (typeof request.language !== 'string' || !/^[a-z]{2,3}$/u.test(request.language))) throw new TypeError('invalid_search_language');
  if (request.region !== undefined && (typeof request.region !== 'string' || !/^[A-Z]{2}$/u.test(request.region))) throw new TypeError('invalid_search_region');
}

function idempotencyKey(): string {
  return `clervo_${crypto.randomUUID()}`;
}

async function readResponseText(response: Response, maximumBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new ClervoProtocolError('clervo_response_too_large');
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      throw new ClervoProtocolError('clervo_response_too_large');
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
  parts.push(decoder.decode());
  return parts.join('');
}

function parseJsonObject(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ClervoProtocolError('clervo_response_invalid_json');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ClervoProtocolError('clervo_response_invalid_shape');
  return value as Record<string, unknown>;
}

function validateResult(value: Record<string, unknown>, productId: ClervoProductId, fundingMode: 'free' | 'paid'): ClervoSearchResult {
  if (
    value.contractVersion !== CLERVO_CONTRACT_VERSION
    || value.operation !== 'search.query'
    || value.productId !== productId
    || value.state !== 'RECEIPTED'
    || value.fundingMode !== fundingMode
    || typeof value.operationId !== 'string'
    || typeof value.requestHash !== 'string'
    || typeof value.replayed !== 'boolean'
    || value.output === null
    || typeof value.output !== 'object'
    || Array.isArray(value.output)
  ) throw new ClervoProtocolError('clervo_result_contract_mismatch');
  return value as unknown as ClervoSearchResult;
}

export class ClervoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ClervoTransportError extends ClervoError {}
export class ClervoProtocolError extends ClervoError {}

export class ClervoProblemError extends ClervoError {
  constructor(
    readonly status: number,
    readonly problem: ClervoProblem,
  ) {
    super(typeof problem.code === 'string' ? problem.code : `clervo_http_${status}`);
  }
}

export class ClervoPaymentRequiredError extends ClervoProblemError {
  constructor(
    problem: ClervoProblem,
    readonly paymentRequired: string | null,
  ) {
    super(402, problem);
  }
}

export class ClervoClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #maxResponseBytes: number;

  readonly search: {
    web: (request: ClervoSearchRequest, options?: ClervoRequestOptions) => Promise<ClervoSearchResult>;
    answer: (request: ClervoSearchRequest, options?: ClervoRequestOptions) => Promise<ClervoSearchResult>;
  };

  constructor(options: ClervoClientOptions) {
    if (options === null || typeof options !== 'object') throw new TypeError('invalid_clervo_client_options');
    this.#baseUrl = assertBaseUrl(options.baseUrl);
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== 'function') throw new TypeError('clervo_fetch_unavailable');
    this.#maxResponseBytes = options.maxResponseBytes ?? 2_097_152;
    if (!Number.isInteger(this.#maxResponseBytes) || this.#maxResponseBytes < 1_024 || this.#maxResponseBytes > 16_777_216) throw new TypeError('invalid_clervo_response_limit');
    this.search = Object.freeze({
      web: (request, requestOptions) => this.#execute('search.web', request, requestOptions),
      answer: (request, requestOptions) => this.#execute('search.answer', request, requestOptions),
    });
  }

  async #execute(
    productId: ClervoProductId,
    request: ClervoSearchRequest,
    options: ClervoRequestOptions = {},
  ): Promise<ClervoSearchResult> {
    assertSearchRequest(request);
    if (options === null || typeof options !== 'object') throw new TypeError('invalid_clervo_request_options');
    const mode = options.mode ?? 'preview';
    if (mode !== 'preview' && mode !== 'challenge') throw new TypeError('invalid_clervo_execution_mode');
    const fundingMode = mode === 'preview' ? 'free' : 'paid';
    const target = mode === 'preview' ? '/v1/search/free' : '/v1/search/paid';
    const requestIdempotencyKey = options.idempotencyKey ?? idempotencyKey();
    if (!/^[\x21-\x7E]{8,128}$/u.test(requestIdempotencyKey)) throw new TypeError('invalid_idempotency_key');
    const body = {
      query: request.query.trim(),
      ...(request.maxResults === undefined ? {} : { maxResults: request.maxResults }),
      synthesize: productId === 'search.answer',
      ...(request.language === undefined ? {} : { language: request.language }),
      ...(request.region === undefined ? {} : { region: request.region }),
    };
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${target}`, {
        method: 'POST',
        headers: {
          accept: 'application/json, application/problem+json',
          'content-type': 'application/json',
          'idempotency-key': requestIdempotencyKey,
          'x-clervo-client': '@clervo/sdk/0.3.0',
        },
        body: JSON.stringify(body),
        redirect: 'error',
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error) {
      throw new ClervoTransportError('clervo_transport_failed', { cause: error });
    }
    const text = await readResponseText(response, this.#maxResponseBytes);
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== undefined && contentType !== 'application/json' && contentType !== 'application/problem+json') throw new ClervoProtocolError('clervo_response_unsupported_media_type');
    const value = parseJsonObject(text);
    if (response.status === 402) throw new ClervoPaymentRequiredError(value, response.headers.get('payment-required'));
    if (!response.ok) throw new ClervoProblemError(response.status, value);
    return validateResult(value, productId, fundingMode);
  }
}
