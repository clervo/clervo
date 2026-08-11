import { randomUUID } from 'node:crypto';
import { x402Client } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { CLERVO_ROUTER_USER_AGENT } from './version.js';
import { assertWithinLimits, loadLimits, type SpendLimits } from './limits.js';
import { assertNothingUnreconciled, readOperation, requestBodyHash, saveReceipt, spentTodayAtomic, writeOperation, assertIdempotencyKey, type ConnectSurface, type OperationRecord } from './store.js';
import { loadWalletAccount } from './wallet.js';
import { apiOrigin, capabilityFor, type Registry } from './registry.js';
import { formatUsdc } from './chain.js';
import { OPERATION_SCHEMA_VERSION } from './store.js';
import { acquireCommerceLock } from './lock.js';

const MAXIMUM_RESPONSE_BYTES = 8_388_608;

export class RouterError extends Error {
  constructor(readonly code: string, message?: string, readonly detail?: unknown) {
    super(message ?? code);
    this.name = 'RouterError';
  }
}

export function newIdempotencyKey(): string {
  return `clervo_${randomUUID().replace(/-/gu, '')}`;
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAXIMUM_RESPONSE_BYTES) throw new RouterError('response_too_large');
  const text = await response.text();
  if (Buffer.byteLength(text) > MAXIMUM_RESPONSE_BYTES) throw new RouterError('response_too_large');
  try {
    const value = JSON.parse(text) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
    return value as Record<string, unknown>;
  } catch {
    throw new RouterError('response_invalid_json', `${response.status} response from the API was not a JSON object`);
  }
}

export interface FreeOutcome {
  readonly funding: 'free';
  readonly productId: string;
  readonly operationId: string;
  readonly requestHash: string;
  readonly result: Record<string, unknown>;
  readonly replayed: boolean;
}

export async function callAiFree({ registry, body, idempotencyKey, env = process.env, fetchImpl = fetch, timeoutMs = 600_000, surface = 'unknown' }: { registry: Registry; body: Record<string, unknown>; idempotencyKey?: string; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; timeoutMs?: number; surface?: ConnectSurface }): Promise<FreeOutcome> {
  const key = idempotencyKey === undefined ? newIdempotencyKey() : assertIdempotencyKey(idempotencyKey);
  const resource = `${registry.origin}/v1/ai/execute`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(resource, { method: 'POST', headers: { accept: 'application/json, application/problem+json', 'content-type': 'application/json', 'idempotency-key': key, 'user-agent': CLERVO_ROUTER_USER_AGENT }, body: JSON.stringify(body), redirect: 'error', signal: controller.signal });
  } catch (error) {
    throw new RouterError('transport_failed', `could not reach ${resource}`, (error as Error)?.name);
  } finally { clearTimeout(timer); }
  const value = await readJsonResponse(response);
  if (!response.ok) throw new RouterError(typeof value.code === 'string' ? value.code : `http_${response.status}`, typeof value.detail === 'string' ? value.detail : `the API returned ${response.status}`, value);
  if (value.state !== 'COMPLETED' || value.fundingMode !== 'free' || value.operation !== 'ai.execute') throw new RouterError('free_result_contract_mismatch', 'the free AI result did not match the published contract');
  const completedAt = new Date().toISOString();
  writeOperation({ schemaVersion: OPERATION_SCHEMA_VERSION, idempotencyKey: key, productId: typeof value.productId === 'string' ? value.productId : 'ai.chat', resource, requestBodyHash: requestBodyHash(body), requestBody: body, state: 'free', startedAt: completedAt, completedAt, quotedAtomic: '0', chargedAtomic: '0', operationId: typeof value.operationId === 'string' ? value.operationId : null, receiptId: null, settlementReferenceHash: null, replayed: value.replayed === true, reason: null, surface }, env);
  return Object.freeze({ funding: 'free', productId: 'ai.chat', operationId: typeof value.operationId === 'string' ? value.operationId : '', requestHash: typeof value.requestHash === 'string' ? value.requestHash : '', result: value, replayed: value.replayed === true });
}

/*
 * The free call. No wallet, no key, no funding, no signature.
 *
 * This is deliberately the first thing the CLI can do and the only path that
 * touches none of the wallet code: a customer gets a real, useful result from
 * the production system before being asked to create anything or fund anything.
 */
export async function callFree({
  registry,
  productId,
  body,
  env = process.env,
  fetchImpl = fetch,
  idempotencyKey,
  timeoutMs = 60_000,
  surface = 'unknown',
}: {
  registry: Registry;
  productId: string;
  body: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  idempotencyKey?: string;
  timeoutMs?: number;
  surface?: ConnectSurface;
}): Promise<FreeOutcome> {
  const capability = capabilityFor(registry, productId);
  if (!capability.freeCallable || capability.freeRoute === null) {
    throw new RouterError('free_path_unavailable', `${productId} has no free path in the live catalog`);
  }
  const key = idempotencyKey === undefined ? newIdempotencyKey() : assertIdempotencyKey(idempotencyKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(`${registry.origin}${capability.freeRoute}`, {
      method: 'POST',
      headers: {
        accept: 'application/json, application/problem+json',
        'content-type': 'application/json',
        'idempotency-key': key,
        'user-agent': CLERVO_ROUTER_USER_AGENT,
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: controller.signal,
    });
  } catch (error) {
    throw new RouterError('transport_failed', `could not reach ${registry.origin}${capability.freeRoute}`, (error as Error)?.name);
  } finally {
    clearTimeout(timer);
  }
  const value = await readJsonResponse(response);
  if (!response.ok) throw new RouterError(typeof value.code === 'string' ? value.code : `http_${response.status}`, typeof value.detail === 'string' ? value.detail : `the API returned ${response.status}`, value);
  if (value.state !== 'RECEIPTED' || value.fundingMode !== 'free') throw new RouterError('free_result_contract_mismatch', 'the free result did not match the published contract');
  writeOperation({
    schemaVersion: OPERATION_SCHEMA_VERSION,
    idempotencyKey: key,
    productId,
    resource: `${registry.origin}${capability.freeRoute}`,
    requestBodyHash: requestBodyHash(body),
    requestBody: body,
    state: 'free',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    quotedAtomic: '0',
    chargedAtomic: '0',
    operationId: typeof value.operationId === 'string' ? value.operationId : null,
    receiptId: null,
    settlementReferenceHash: null,
    replayed: value.replayed === true,
    reason: null,
    surface,
    authorizationCreated: false,
  }, env);
  return Object.freeze({
    funding: 'free',
    productId,
    operationId: typeof value.operationId === 'string' ? value.operationId : '',
    requestHash: typeof value.requestHash === 'string' ? value.requestHash : '',
    result: value,
    replayed: value.replayed === true,
  });
}

export interface Quote {
  readonly idempotencyKey: string;
  readonly productId: string;
  readonly resource: string;
  readonly quoteId: string;
  readonly amountAtomic: string;
  readonly amount: string;
  readonly asset: string;
  readonly network: string;
  readonly payTo: string;
  readonly priceVersion: string;
  readonly expiresAt: string;
  readonly operationId: string;
  readonly requestHash: string;
  /* The whole 402 body, kept because the payment payload is built from it. */
  readonly challenge: Record<string, unknown>;
}

function readQuote(productId: string, resource: string, idempotencyKey: string, challenge: Record<string, unknown>): Quote {
  const accepts = Array.isArray(challenge.accepts) ? challenge.accepts as Record<string, unknown>[] : [];
  const accepted = accepts[0];
  const quote = (challenge.quote as Record<string, unknown> | undefined) ?? {};
  const clervo = ((accepted?.extra as Record<string, unknown> | undefined)?.clervo as Record<string, unknown> | undefined) ?? {};
  const amountAtomic = typeof accepted?.amount === 'string' ? accepted.amount : undefined;
  if (accepted === undefined || amountAtomic === undefined) throw new RouterError('challenge_missing_price', 'the 402 challenge carried no payable amount');
  if (accepted.network !== 'eip155:8453') throw new RouterError('challenge_wrong_network', `this router only pays on Base mainnet; the challenge asked for ${String(accepted.network)}`);
  return Object.freeze({
    idempotencyKey,
    productId,
    resource,
    quoteId: typeof clervo.quoteId === 'string' ? clervo.quoteId : '',
    amountAtomic,
    amount: formatUsdc(amountAtomic),
    asset: typeof accepted.asset === 'string' ? accepted.asset : '',
    network: 'eip155:8453',
    payTo: typeof accepted.payTo === 'string' ? accepted.payTo : '',
    priceVersion: typeof clervo.priceVersion === 'string' ? clervo.priceVersion : '',
    expiresAt: typeof clervo.quoteExpiresAt === 'string' ? clervo.quoteExpiresAt : (typeof quote.expiresAt === 'string' ? quote.expiresAt : ''),
    operationId: typeof clervo.operationId === 'string' ? clervo.operationId : '',
    requestHash: typeof clervo.requestHash === 'string' ? clervo.requestHash : '',
    challenge,
  });
}

/*
 * Ask the price without paying it.
 *
 * The same request with the same idempotency key is what will later be paid, so
 * the key is the caller's and is reused across the quote and the payment. That is
 * the protocol's own design: the quote is bound to the request hash, and sending
 * the payment under a different key would buy a different operation.
 */
export async function requestQuote({
  registry,
  productId,
  body,
  idempotencyKey,
  fetchImpl = fetch,
  timeoutMs = 60_000,
}: {
  registry: Registry;
  productId: string;
  body: Record<string, unknown>;
  idempotencyKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<Quote> {
  const capability = capabilityFor(registry, productId);
  if (!capability.paidCallable || capability.paidRoute === null) {
    throw new RouterError('paid_path_unavailable', `${productId} is not payable in the live catalog${capability.reason === null ? '' : ` (${capability.reason})`}`);
  }
  const resource = `${registry.origin}${capability.paidRoute}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(resource, {
      method: 'POST',
      headers: {
        accept: 'application/json, application/problem+json',
        'content-type': 'application/json',
        'idempotency-key': assertIdempotencyKey(idempotencyKey),
        'user-agent': CLERVO_ROUTER_USER_AGENT,
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: controller.signal,
    });
  } catch (error) {
    throw new RouterError('transport_failed', `could not reach ${resource}`, (error as Error)?.name);
  } finally {
    clearTimeout(timer);
  }
  const value = await readJsonResponse(response);
  /* A 200 here means this key already bought this exact request. */
  if (response.status === 200) throw new RouterError('already_settled', 'this idempotency key has already been paid and settled — use `clervo replay` to fetch the result again', value);
  if (response.status !== 402) throw new RouterError(typeof value.code === 'string' ? value.code : `http_${response.status}`, typeof value.detail === 'string' ? value.detail : `expected a 402 quote and got ${response.status}`, value);
  return readQuote(productId, resource, idempotencyKey, value);
}

export interface PaidOutcome {
  readonly funding: 'paid';
  readonly productId: string;
  readonly operationId: string;
  readonly requestHash: string;
  readonly chargedAtomic: string;
  readonly charged: string;
  readonly receipt: Record<string, unknown> | null;
  readonly receiptId: string | null;
  readonly result: Record<string, unknown>;
  readonly replayed: boolean;
}

/*
 * Whether a failed paid request could have taken the money anyway.
 *
 * This is the single most consequential judgement in the client, so it is a list
 * rather than a heuristic. Every code here means "a settlement may exist that
 * this machine cannot see", and each one puts the operation into `unknown`, which
 * blocks all further spending until it is reconciled. Anything not on the list is
 * treated as a refusal that happened before money could move — which is only safe
 * because the codes that *are* ambiguous are enumerated.
 */
const AMBIGUOUS_CODES = Object.freeze(new Set([
  'settlement_unknown',
  'unknown_settlement',
  'x402_settlement_evidence_invalid',
  'x402_execution_state_missing',
  'x402_payment_already_bound',
  'idempotency_in_progress',
  'execution_state_unknown',
  'settlement_state_unknown',
]));

function settlementIsAmbiguous(status: number, code: string | undefined): boolean {
  if (code !== undefined && AMBIGUOUS_CODES.has(code)) return true;
  /* A gateway that never answered, or answered with nothing we can read, is the
   * same ambiguity: the signature was already on the wire. */
  return status === 502 || status === 504 || status === 0;
}

/* The receipt is a server document, so every field is read defensively. A
 * missing or non-string reference hash is recorded as absent rather than
 * guessed at, because this value is what an operator uses to find the
 * settlement on Base. */
function settlementReferenceHashOf(receipt: Record<string, unknown> | null): string | null {
  const settlement = receipt === null ? undefined : (receipt.settlement as Record<string, unknown> | undefined);
  const reference = settlement?.referenceHash;
  return typeof reference === 'string' && reference !== '' ? reference : null;
}

function settledOutcome(productId: string, value: Record<string, unknown>, replayed: boolean): PaidOutcome {
  const receipt = (value.receipt as Record<string, unknown> | undefined) ?? null;
  const customerCharge = (receipt?.customerCharge as Record<string, unknown> | undefined) ?? undefined;
  const chargedAtomic = typeof customerCharge?.amountAtomic === 'string' ? customerCharge.amountAtomic : '0';
  return Object.freeze({
    funding: 'paid',
    productId,
    operationId: typeof value.operationId === 'string' ? value.operationId : '',
    requestHash: typeof value.requestHash === 'string' ? value.requestHash : '',
    chargedAtomic,
    charged: formatUsdc(chargedAtomic),
    receipt,
    receiptId: typeof receipt?.receiptId === 'string' ? receipt.receiptId : null,
    result: value,
    replayed,
  });
}

export interface PaidCallOptions {
  readonly registry: Registry;
  readonly productId: string;
  readonly body: Record<string, unknown>;
  readonly idempotencyKey?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  /* Called with the quote before anything is signed. Returning false aborts with
   * nothing spent — this is where an interactive confirmation goes. */
  readonly approve?: (quote: Quote, limits: SpendLimits) => Promise<boolean> | boolean;
  readonly limits?: SpendLimits;
  readonly surface?: ConnectSurface;
}

/*
 * The paid call, in the only order that is safe.
 *
 * 1. Refuse if any earlier operation is unreconciled. An unknown settlement is
 *    not a warning; it is a hard stop, because spending again on top of one is
 *    how a double charge becomes invisible.
 * 2. Replay from the server if this key already settled. The result comes back
 *    without a second authorization.
 * 3. Quote, then check the buyer's own limits, then ask for approval. All three
 *    happen before a signature exists.
 * 4. Record `authorizing` on disk *before* signing, so a process killed mid-flight
 *    leaves evidence that a payment may exist.
 * 5. Send, then classify the answer as settled, refused, or ambiguous.
 */
export async function callPaid(options: PaidCallOptions): Promise<PaidOutcome> {
  const {
    registry, productId, body, env = process.env, fetchImpl = fetch, timeoutMs = 90_000, approve, surface = 'unknown',
  } = options;
  const key = options.idempotencyKey === undefined ? newIdempotencyKey() : assertIdempotencyKey(options.idempotencyKey);
  const bodyHash = requestBodyHash(body);

  const existing = readOperation(key, env);
  if (existing !== undefined && existing.requestBodyHash !== bodyHash) {
    throw new RouterError('idempotency_key_reused_with_different_body', `idempotency key ${key} was already used for a different request body — use a new key`);
  }
  if (existing?.state === 'settled') {
    return replayPaid({ registry, productId, body, idempotencyKey: key, env, fetchImpl, timeoutMs });
  }
  /* The reservation is serialized across processes. Without this small local
   * lock, two surfaces could both observe the same remaining daily budget and
   * sign before either operation became visible to the other. The lock is
   * released as soon as `authorizing` is durable; that record then becomes the
   * global fail-closed barrier while the payment is in flight. */
  const releaseCommerceLock = acquireCommerceLock(env);
  const reservation = await (async () => {
    try {
      const current = readOperation(key, env);
      if (current !== undefined && current.requestBodyHash !== bodyHash) throw new RouterError('idempotency_key_reused_with_different_body', `idempotency key ${key} was already used for a different request body — use a new key`);
      if (current?.state === 'settled') return Object.freeze({ replay: true as const });
      /* Step 1. Includes any `authorizing` record for this very key. */
      assertNothingUnreconciled(env);
      const limits = options.limits ?? loadLimits(env);
      const quote = await requestQuote({ registry, productId, body, idempotencyKey: key, fetchImpl, timeoutMs });
      assertWithinLimits({ limits, quotedAtomic: quote.amountAtomic, spentTodayAtomic: spentTodayAtomic(env) });
      if (approve === undefined) throw new RouterError('payment_approval_required', 'automatic payment is disabled; explicitly opt in and supply an approval decision');
      if ((await approve(quote, limits)) !== true) throw new RouterError('payment_not_approved', 'the payment was not approved, so nothing was signed or spent');
      const account = loadWalletAccount(env);
      const startedAt = new Date().toISOString();
      const record: OperationRecord = {
        schemaVersion: OPERATION_SCHEMA_VERSION,
        idempotencyKey: key,
        productId,
        resource: quote.resource,
        requestBodyHash: bodyHash,
        requestBody: body,
        state: 'authorizing',
        startedAt,
        completedAt: null,
        quotedAtomic: quote.amountAtomic,
        chargedAtomic: null,
        operationId: quote.operationId,
        receiptId: null,
        settlementReferenceHash: null,
        replayed: false,
        reason: null,
        surface,
      };
      writeOperation(record, env);
      return Object.freeze({ replay: false as const, account, quote, record });
    } finally {
      releaseCommerceLock();
    }
  })();
  if (reservation.replay) return replayPaid({ registry, productId, body, idempotencyKey: key, env, fetchImpl, timeoutMs });
  const { account, quote, record } = reservation;
  const paymentClient = new x402Client();
  registerExactEvmScheme(paymentClient, { signer: account });

  let paymentHeader: string;
  try {
    const payload = await paymentClient.createPaymentPayload(quote.challenge as never);
    paymentHeader = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  } catch (error) {
    /* Nothing was sent, so nothing can have settled. */
    writeOperation({ ...record, state: 'refused', completedAt: new Date().toISOString(), reason: 'payment_signing_failed' }, env);
    throw new RouterError('payment_signing_failed', 'the payment could not be signed, so nothing was sent', (error as Error)?.message);
  }

  const authorizedRecord: OperationRecord = { ...record, authorizationCreated: true };
  writeOperation(authorizedRecord, env);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(quote.resource, {
      method: 'POST',
      headers: {
        accept: 'application/json, application/problem+json',
        'content-type': 'application/json',
        'idempotency-key': key,
        'payment-signature': paymentHeader,
        'user-agent': CLERVO_ROUTER_USER_AGENT,
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: controller.signal,
    });
  } catch (error) {
    /* The signature was on the wire. This is ambiguous by definition. */
    writeOperation({ ...authorizedRecord, state: 'unknown', reason: 'transport_failed_after_authorization' }, env);
    throw new RouterError(
      'settlement_unknown',
      `the request failed after the payment was sent, so it may have settled. Run \`clervo reconcile\` — do not retry until it resolves.`,
      (error as Error)?.name,
    );
  } finally {
    clearTimeout(timer);
  }

  let value: Record<string, unknown>;
  try {
    value = await readJsonResponse(response);
  } catch (error) {
    writeOperation({ ...authorizedRecord, state: 'unknown', reason: 'unreadable_response_after_authorization' }, env);
    throw error;
  }

  if (response.status === 200) {
    const outcome = settledOutcome(productId, value, response.headers.get('idempotency-replayed') === 'true');
    const receiptId = outcome.receipt === null ? null : saveReceipt(outcome.receipt, env);
    writeOperation({
      ...authorizedRecord,
      state: 'settled',
      completedAt: new Date().toISOString(),
      chargedAtomic: outcome.chargedAtomic,
      operationId: outcome.operationId === '' ? authorizedRecord.operationId : outcome.operationId,
      receiptId,
      settlementReferenceHash: settlementReferenceHashOf(outcome.receipt),
      replayed: outcome.replayed,
    }, env);
    return outcome;
  }

  const code = typeof value.code === 'string' ? value.code : undefined;
  if (settlementIsAmbiguous(response.status, code)) {
    writeOperation({ ...authorizedRecord, state: 'unknown', reason: code ?? `http_${response.status}` }, env);
    throw new RouterError(
      'settlement_unknown',
      `the API answered ${response.status}${code === undefined ? '' : ` (${code})`} after the payment was sent, so it may have settled. Run \`clervo reconcile\` — do not retry until it resolves.`,
      value,
    );
  }
  writeOperation({ ...authorizedRecord, state: 'refused', completedAt: new Date().toISOString(), reason: code ?? `http_${response.status}` }, env);
  throw new RouterError(code ?? `http_${response.status}`, typeof value.detail === 'string' ? value.detail : `the API refused the payment with ${response.status}`, value);
}

/*
 * Fetch a settled result again.
 *
 * Safe because it is the server's replay, not a second purchase: the same key
 * with the same body returns the same operation and does not authorize anything.
 * No payment header is sent, which is what makes it impossible for this call to
 * charge even if the local record is wrong.
 */
export async function replayPaid({
  registry,
  productId,
  body,
  idempotencyKey,
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 60_000,
}: {
  registry: Registry;
  productId: string;
  body: Record<string, unknown>;
  idempotencyKey: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<PaidOutcome> {
  const capability = capabilityFor(registry, productId);
  if (capability.paidRoute === null) throw new RouterError('paid_path_unavailable', `${productId} has no paid route`);
  const resource = `${registry.origin}${capability.paidRoute}`;
  const key = assertIdempotencyKey(idempotencyKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(resource, {
      method: 'POST',
      headers: {
        accept: 'application/json, application/problem+json',
        'content-type': 'application/json',
        'idempotency-key': key,
        'user-agent': CLERVO_ROUTER_USER_AGENT,
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: controller.signal,
    });
  } catch (error) {
    throw new RouterError('transport_failed', `could not reach ${resource}`, (error as Error)?.name);
  } finally {
    clearTimeout(timer);
  }
  const value = await readJsonResponse(response);
  if (response.status === 402) throw new RouterError('not_settled', 'this idempotency key has not been paid, so there is nothing to replay', value);
  if (!response.ok) throw new RouterError(typeof value.code === 'string' ? value.code : `http_${response.status}`, typeof value.detail === 'string' ? value.detail : `the API returned ${response.status}`, value);
  const outcome = settledOutcome(productId, value, response.headers.get('idempotency-replayed') === 'true' || value.replayed === true);
  if (outcome.receipt !== null) saveReceipt(outcome.receipt, env);
  const existing = readOperation(key, env);
  const bodyHash = requestBodyHash(body);
  writeOperation({
    schemaVersion: OPERATION_SCHEMA_VERSION,
    idempotencyKey: key,
    productId,
    resource,
    requestBodyHash: bodyHash,
    requestBody: body,
    state: 'settled',
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    completedAt: existing?.completedAt ?? new Date().toISOString(),
    quotedAtomic: existing?.quotedAtomic ?? outcome.chargedAtomic,
    chargedAtomic: outcome.chargedAtomic,
    operationId: outcome.operationId,
    receiptId: outcome.receiptId,
    settlementReferenceHash: settlementReferenceHashOf(outcome.receipt),
    /* Provenance only: this record's charge was observed through a replay rather
     * than created here. It still counts once toward the day's spend, because it
     * is the same single charge for this key — see `spentTodayAtomic`. */
    replayed: true,
    reason: null,
    surface: existing?.surface ?? 'unknown',
  }, env);
  return outcome;
}

export interface ReconcileResult {
  readonly idempotencyKey: string;
  readonly productId: string;
  readonly resolved: 'settled' | 'not_settled' | 'still_unknown';
  readonly chargedAtomic: string | null;
  readonly receiptId: string | null;
  readonly detail: string;
}

/*
 * Resolve an ambiguous operation by asking the server what it knows.
 *
 * The probe is a replay — the same key and body with no payment header — so
 * reconciliation itself can never charge. A 200 proves it settled; a 402 proves
 * it did not, because the server would not still be quoting a request it had
 * already been paid for.
 */
export async function reconcileOperation({
  registry,
  record,
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 60_000,
}: {
  registry: Registry;
  record: OperationRecord;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ReconcileResult> {
  const body = record.requestBody;
  if (body === null || typeof body !== 'object') {
    return Object.freeze({
      idempotencyKey: record.idempotencyKey,
      productId: record.productId,
      resolved: 'still_unknown',
      chargedAtomic: null,
      receiptId: null,
      detail: 'this record predates request-body capture and cannot be replayed automatically; check the receipt on Base for this operation',
    });
  }
  try {
    const outcome = await replayPaid({ registry, productId: record.productId, body, idempotencyKey: record.idempotencyKey, env, fetchImpl, timeoutMs });
    /* It settled. The charge is real and counts against today. */
    writeOperation({
      ...record,
      state: 'settled',
      completedAt: record.completedAt ?? new Date().toISOString(),
      chargedAtomic: outcome.chargedAtomic,
      operationId: outcome.operationId,
      receiptId: outcome.receiptId,
      settlementReferenceHash: settlementReferenceHashOf(outcome.receipt),
      replayed: false,
      reason: null,
    }, env);
    return Object.freeze({
      idempotencyKey: record.idempotencyKey,
      productId: record.productId,
      resolved: 'settled',
      chargedAtomic: outcome.chargedAtomic,
      receiptId: outcome.receiptId,
      detail: `settled and charged ${outcome.charged} USDC`,
    });
  } catch (error) {
    if (error instanceof RouterError && error.code === 'not_settled') {
      writeOperation({ ...record, state: 'refused', completedAt: new Date().toISOString(), chargedAtomic: '0', reason: 'reconciled_not_settled' }, env);
      return Object.freeze({
        idempotencyKey: record.idempotencyKey,
        productId: record.productId,
        resolved: 'not_settled',
        chargedAtomic: '0',
        receiptId: null,
        detail: 'no payment settled for this key; nothing was charged',
      });
    }
    return Object.freeze({
      idempotencyKey: record.idempotencyKey,
      productId: record.productId,
      resolved: 'still_unknown',
      chargedAtomic: null,
      receiptId: null,
      detail: error instanceof Error ? `${error.message}` : 'the server could not be reached',
    });
  }
}
