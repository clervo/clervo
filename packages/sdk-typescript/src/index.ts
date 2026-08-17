import {
  ClervoConnect as SharedClervoConnect,
  type ConnectExecution,
  type ConnectStatus,
  type Diagnosis,
  type LocalUsage,
  type Quote,
  type Registry,
  type SpendLimits,
} from '@clervo/router';

export const CLERVO_CONTRACT_VERSION = '2026-07-29.1' as const;

export type ClervoProductId =
  | 'search.web'
  | 'ai.chat' | 'ai.embed' | 'ai.image' | 'ai.speech' | 'ai.video' | 'ai.music' | 'ai.virtual_try_on'
  | 'sandbox.run'
  | 'prediction.markets' | 'prediction.market' | 'prediction.compare' | 'prediction.history' | 'prediction.signal'
  | 'crypto.wallet.balances' | 'crypto.wallet.tokens' | 'crypto.wallet.transactions' | 'crypto.wallet.report';
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

export interface ClervoAiRequest {
  model: string;
  input: Record<string, unknown>;
  maximumOutputTokens?: number;
  maximumReasoningTokens?: number;
}

export interface ClervoAiRequestOptions {
  idempotencyKey?: string;
  paymentSignature?: string;
  paymentAuthorization?: string;
  signal?: AbortSignal;
}

export interface ClervoAiResult {
  contractVersion: typeof CLERVO_CONTRACT_VERSION;
  operationId: string;
  operation: 'ai.execute';
  productId: string;
  model: string;
  exactModelId: string;
  state: 'COMPLETED' | 'RECEIPTED';
  replayed: boolean;
  fundingMode: 'free' | 'paid';
  requestHash: string;
  result: Record<string, unknown>;
  receipt?: Record<string, unknown>;
}

export interface ClervoAiModel {
  id: string;
  object: 'model';
  owned_by: 'clervo';
  clervo: {
    identityKind: 'canonical' | 'alias';
    aliasFor?: string;
    productIds: string[];
    capabilities: string[];
    availability: string;
    health: string;
    publicSellable: boolean;
    billingMode: 'free' | 'metered';
    customerPricing: Record<string, unknown> | null;
    commerce: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface ClervoAiModelList {
  object: 'list';
  data: ClervoAiModel[];
  clervo: { catalogRevision: string; sourceValidUntil: string; inventory: { canonicalModels: number; aliases: number; callableIds: number }; [key: string]: unknown };
}

export interface ClervoClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  maxResponseBytes?: number;
  connect?: {
    /** Automatic payment is off unless this is literally true. Router limits
     * and the global reconciliation freeze still apply when it is enabled. */
    autoPay?: boolean;
    env?: NodeJS.ProcessEnv;
  };
}

export type ClervoRecoveryCode =
  | 'insufficient_funds'
  | 'wrong_network_or_asset'
  | 'expired_quote'
  | 'rejected'
  | 'timeout'
  | 'unknown_settlement';

export interface ClervoRecoveryAction {
  code: ClervoRecoveryCode;
  action: string;
  retry: 'after_action' | 'prohibited_until_reconciled';
}

const recoveryActions = Object.freeze([
  Object.freeze({
    code: 'insufficient_funds',
    problemCodes: Object.freeze(['insufficient_funds']),
    action: 'Add enough of the quoted asset on the quoted network, then request a fresh quote.',
    retry: 'after_action',
  }),
  Object.freeze({
    code: 'wrong_network_or_asset',
    problemCodes: Object.freeze(['wrong_network', 'wrong_asset', 'unsupported_network', 'unsupported_asset']),
    action: "Switch to the quote's exact network and asset, then request a fresh quote.",
    retry: 'after_action',
  }),
  Object.freeze({
    code: 'expired_quote',
    problemCodes: Object.freeze(['quote_expired', 'expired_quote']),
    action: 'Request a fresh quote and never reuse the expired authorization.',
    retry: 'after_action',
  }),
  Object.freeze({
    code: 'rejected',
    problemCodes: Object.freeze(['authorization_rejected', 'payment_rejected', 'user_rejected']),
    action: 'Review the maximum charge and approve again only if you still intend to pay.',
    retry: 'after_action',
  }),
  Object.freeze({
    code: 'timeout',
    problemCodes: Object.freeze(['authorization_timeout', 'payment_timeout']),
    action: 'Reconcile the existing idempotency key before deciding whether to retry.',
    retry: 'prohibited_until_reconciled',
  }),
  Object.freeze({
    code: 'unknown_settlement',
    problemCodes: Object.freeze(['settlement_unknown', 'unknown_settlement']),
    action: 'Reconcile the existing operation and do not authorize or retry until settlement is definitive.',
    retry: 'prohibited_until_reconciled',
  }),
] satisfies ReadonlyArray<ClervoRecoveryAction & { problemCodes: readonly string[] }>);

export function recoveryActionFor(value: unknown): Readonly<ClervoRecoveryAction> | undefined {
  const problemCode = value instanceof ClervoProblemError && typeof value.problem.code === 'string'
    ? value.problem.code
    : typeof value === 'string' ? value : undefined;
  if (problemCode === undefined) return undefined;
  const recovery = recoveryActions.find(({ problemCodes }) => problemCodes.includes(problemCode));
  if (recovery === undefined) return undefined;
  return Object.freeze({ code: recovery.code, action: recovery.action, retry: recovery.retry });
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

function throwConnectError(error: unknown): never {
  const code = error instanceof Error && typeof (error as Error & { code?: unknown }).code === 'string'
    ? (error as Error & { code: string }).code
    : undefined;
  if (code !== undefined) throw new ClervoProblemError(code === 'settlement_unknown' || code === 'unreconciled_operation_blocks_spend' ? 409 : code === 'payment_approval_required' ? 402 : 400, { code, detail: error instanceof Error ? error.message : code });
  throw error;
}

export class ClervoClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #maxResponseBytes: number;
  readonly #connect: SharedClervoConnect | undefined;

  readonly search: {
    web: (request: ClervoSearchRequest, options?: ClervoRequestOptions) => Promise<ClervoSearchResult>;
  };
  readonly models: { list: (options?: { signal?: AbortSignal }) => Promise<ClervoAiModelList> };
  readonly ai: { execute: (request: ClervoAiRequest, options?: ClervoAiRequestOptions) => Promise<ClervoAiResult> };
  readonly catalog: { list: () => Promise<Registry> };
  readonly commerce: {
    quote: (productId: ClervoProductId, body: Record<string, unknown>, idempotencyKey?: string) => Promise<Quote>;
    execute: (productId: ClervoProductId, body: Record<string, unknown>, idempotencyKey?: string, options?: { paid?: boolean }) => Promise<ConnectExecution>;
    reconcile: () => Promise<readonly unknown[]>;
  };
  readonly wallet: {
    status: () => ConnectStatus['wallet'];
    create: () => ReturnType<SharedClervoConnect['createWallet']>;
    backup: (confirmSecretExposure: boolean) => ReturnType<SharedClervoConnect['backupWallet']>;
    restore: (recoveryPhrase: string) => ReturnType<SharedClervoConnect['restoreWallet']>;
  };
  readonly limits: { get: () => SpendLimits; set: (values: { perOperationAtomic?: string; dailyAtomic?: string }) => SpendLimits };
  readonly usage: { get: () => LocalUsage };
  readonly diagnostics: { doctor: () => Promise<Diagnosis>; status: () => ConnectStatus };

  constructor(options: ClervoClientOptions = {}) {
    if (options === null || typeof options !== 'object') throw new TypeError('invalid_clervo_client_options');
    this.#baseUrl = assertBaseUrl(options.baseUrl ?? 'https://api.clervo.dev');
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== 'function') throw new TypeError('clervo_fetch_unavailable');
    this.#maxResponseBytes = options.maxResponseBytes ?? 2_097_152;
    if (!Number.isInteger(this.#maxResponseBytes) || this.#maxResponseBytes < 1_024 || this.#maxResponseBytes > 16_777_216) throw new TypeError('invalid_clervo_response_limit');
    this.#connect = options.connect === undefined ? undefined : new SharedClervoConnect({
      surface: 'typescript',
      autoPay: options.connect.autoPay === true,
      fetch: this.#fetch,
      ...(options.connect.env === undefined ? {} : { env: options.connect.env }),
    });
    this.search = Object.freeze({
      web: (request, requestOptions) => this.#execute('search.web', request, requestOptions),
    });
    this.models = Object.freeze({ list: (requestOptions) => this.#listModels(requestOptions) });
    this.ai = Object.freeze({ execute: (request, requestOptions) => this.#executeAi(request, requestOptions) });
    const requireConnect = (): SharedClervoConnect => {
      if (this.#connect === undefined) throw new TypeError('clervo_connect_not_enabled');
      return this.#connect;
    };
    this.catalog = Object.freeze({ list: () => requireConnect().registry() });
    this.commerce = Object.freeze({
      quote: (productId, body, key) => requireConnect().quote(productId, body, key),
      execute: (productId, body, key, executionOptions) => requireConnect().execute(productId, body, key, executionOptions),
      reconcile: () => requireConnect().reconcile(),
    });
    this.wallet = Object.freeze({
      status: () => requireConnect().wallet(),
      create: () => requireConnect().createWallet(),
      backup: (confirmSecretExposure) => requireConnect().backupWallet(confirmSecretExposure),
      restore: (recoveryPhrase) => requireConnect().restoreWallet(recoveryPhrase),
    });
    this.limits = Object.freeze({ get: () => requireConnect().limits(), set: (values) => requireConnect().setLimits(values) });
    this.usage = Object.freeze({ get: () => requireConnect().usage() });
    this.diagnostics = Object.freeze({ doctor: () => requireConnect().doctor(), status: () => requireConnect().status() });
  }

  async #listModels(options: { signal?: AbortSignal } = {}): Promise<ClervoAiModelList> {
    let response: Response;
    try { response = await this.#fetch(`${this.#baseUrl}/v1/models`, { method: 'GET', headers: { accept: 'application/json', 'x-clervo-client': '@clervo/sdk/0.5.2' }, redirect: 'error', ...(options.signal === undefined ? {} : { signal: options.signal }) }); }
    catch (error) { throw new ClervoTransportError('clervo_transport_failed', { cause: error }); }
    const value = parseJsonObject(await readResponseText(response, this.#maxResponseBytes));
    if (!response.ok) throw new ClervoProblemError(response.status, value);
    const data = Array.isArray(value.data) ? value.data as Record<string, unknown>[] : undefined;
    const metadata = value.clervo as Record<string, unknown> | undefined;
    const inventory = metadata?.inventory as Record<string, unknown> | undefined;
    if (value.object !== 'list' || data === undefined || metadata === undefined || inventory === undefined || data.some((entry) => typeof entry.id !== 'string' || entry.object !== 'model' || entry.owned_by !== 'clervo' || entry.clervo === null || typeof entry.clervo !== 'object') || Number(inventory.callableIds) !== data.length) throw new ClervoProtocolError('clervo_model_catalog_contract_mismatch');
    return value as unknown as ClervoAiModelList;
  }

  async #executeAi(request: ClervoAiRequest, options: ClervoAiRequestOptions = {}): Promise<ClervoAiResult> {
    if (request === null || typeof request !== 'object' || typeof request.model !== 'string' || request.model.length < 1 || request.model.length > 160 || request.input === null || typeof request.input !== 'object' || Array.isArray(request.input)) throw new TypeError('invalid_ai_request');
    if (options.paymentSignature !== undefined && options.paymentAuthorization !== undefined) throw new TypeError('ambiguous_ai_payment_authorization');
    const key = options.idempotencyKey ?? idempotencyKey();
    if (!/^[\x21-\x7E]{8,128}$/u.test(key)) throw new TypeError('invalid_idempotency_key');
    if (this.#connect !== undefined && options.paymentSignature === undefined && options.paymentAuthorization === undefined) {
      let execution: ConnectExecution;
      try {
        execution = await this.#connect.execute((request.input.kind === 'embedding' ? 'ai.embed' : request.input.kind === 'image' ? 'ai.image' : request.input.kind === 'speech' ? 'ai.speech' : request.input.kind === 'video' ? 'ai.video' : request.input.kind === 'music' ? 'ai.music' : request.input.kind === 'virtual_try_on' ? 'ai.virtual_try_on' : 'ai.chat'), request as unknown as Record<string, unknown>, key);
      } catch (error) {
        throwConnectError(error);
      }
      if (execution.status === 'payment_required') {
        throw new ClervoPaymentRequiredError({ code: 'payment_required', payable: true, quote: execution.quote, accepts: execution.quote.challenge.accepts }, null);
      }
      return execution.outcome.result as unknown as ClervoAiResult;
    }
    const headers: Record<string, string> = { accept: 'application/json, application/problem+json', 'content-type': 'application/json', 'idempotency-key': key, 'x-clervo-client': '@clervo/sdk/0.5.2' };
    if (options.paymentSignature !== undefined) headers['payment-signature'] = options.paymentSignature;
    if (options.paymentAuthorization !== undefined) headers.authorization = options.paymentAuthorization;
    let response: Response;
    try { response = await this.#fetch(`${this.#baseUrl}/v1/ai/execute`, { method: 'POST', headers, body: JSON.stringify(request), redirect: 'error', ...(options.signal === undefined ? {} : { signal: options.signal }) }); }
    catch (error) { throw new ClervoTransportError('clervo_transport_failed', { cause: error }); }
    const value = parseJsonObject(await readResponseText(response, this.#maxResponseBytes));
    if (response.status === 402) throw new ClervoPaymentRequiredError(value, response.headers.get('payment-required'));
    if (!response.ok) throw new ClervoProblemError(response.status, value);
    const free = value.fundingMode === 'free' && value.state === 'COMPLETED' && value.receipt === undefined;
    const paid = value.fundingMode === 'paid' && value.state === 'RECEIPTED' && value.receipt !== undefined;
    if (value.contractVersion !== CLERVO_CONTRACT_VERSION || value.operation !== 'ai.execute' || typeof value.operationId !== 'string' || typeof value.model !== 'string' || typeof value.exactModelId !== 'string' || typeof value.requestHash !== 'string' || typeof value.replayed !== 'boolean' || value.result === null || typeof value.result !== 'object' || (!free && !paid)) throw new ClervoProtocolError('clervo_ai_result_contract_mismatch');
    return value as unknown as ClervoAiResult;
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
      synthesize: false,
      ...(request.language === undefined ? {} : { language: request.language }),
      ...(request.region === undefined ? {} : { region: request.region }),
    };
    if (this.#connect !== undefined && productId === 'search.web') {
      let execution: ConnectExecution;
      try {
        execution = await this.#connect.execute(productId, body, requestIdempotencyKey, { paid: mode === 'challenge' });
      } catch (error) {
        throwConnectError(error);
      }
      if (execution.status === 'payment_required') throw new ClervoPaymentRequiredError({ code: 'payment_required', payable: true, quote: execution.quote, accepts: execution.quote.challenge.accepts }, null);
      return validateResult(execution.outcome.result, productId, fundingMode);
    }
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${target}`, {
        method: 'POST',
        headers: {
          accept: 'application/json, application/problem+json',
          'content-type': 'application/json',
          'idempotency-key': requestIdempotencyKey,
          'x-clervo-client': '@clervo/sdk/0.5.2',
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
