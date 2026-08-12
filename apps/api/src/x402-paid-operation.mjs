import { createHash } from 'node:crypto';
import {
  CONTRACT_VERSION,
  hashJson,
  isQuoteExpired,
  sealQuote,
  sealReceipt,
} from '../../../dist/packages/contracts/src/index.js';
import { PAYABLE_RESOURCE_PATHS } from './x402-resource.mjs';

const payableResourcePaths = new Set(PAYABLE_RESOURCE_PATHS);

function identifier(prefix, seed) {
  return `${prefix}_${createHash('sha256').update(seed).digest('hex').slice(0, 32)}`;
}

function refuse(code, status = 409) {
  throw Object.assign(new Error(code), { status });
}

function assertAmount(value, asset, code) {
  if (value?.asset !== asset || value.decimals !== 6 || !/^(?:0|[1-9][0-9]{0,77})$/u.test(value.amountAtomic ?? '')) {
    throw new TypeError(code);
  }
}

function assertPricing(value) {
  if (!value || typeof value.priceVersion !== 'string' || value.priceVersion.length < 3 || value.priceVersion.length > 128) {
    throw new TypeError('invalid_x402_operation_pricing');
  }
  assertAmount(value.maximumCharge, 'USDC', 'invalid_x402_operation_maximum_charge');
  assertAmount(value.supplierCost, 'usd', 'invalid_x402_operation_supplier_cost');
}

function sameAmount(left, right) {
  return left?.asset === right?.asset
    && left?.amountAtomic === right?.amountAtomic
    && left?.decimals === right?.decimals;
}

function executionSupplierCost(value, maximum) {
  if (value === undefined) return maximum;
  assertAmount(value, 'usd', 'invalid_x402_operation_supplier_cost');
  if (BigInt(value.amountAtomic) > BigInt(maximum.amountAtomic)) throw new TypeError('x402_operation_supplier_cost_exceeded');
  return Object.freeze({ ...value });
}

function challengeResponse(record) {
  return Object.freeze({
    status: 402,
    headers: record.challenge.headers,
    body: Object.freeze({ ...record.challenge.body, quote: record.quote }),
  });
}

/*
 * --- The shared commerce surface -------------------------------------------
 *
 * Everything below is the part of the money path that four products had each
 * written out by hand: the request envelope handed to a runtime, the response
 * envelope handed back to a customer, the request hash that binds a payment to
 * one exact request, the public price lookup, and the result verification that
 * decides whether a runtime may be believed.
 *
 * The copies had already drifted in the ways copies do. `crypto` and
 * `prediction` carried byte-identical result verifiers that differed only in a
 * schema-version constant, so a fix to one was a fix to one. `rpc` denominated
 * its request ceiling in supplier cost while `crypto` and `prediction`
 * denominated theirs in the customer charge — a difference no reader could
 * attribute to intent rather than accident.
 *
 * These helpers change where that logic lives, never what it does. Each takes
 * the values that genuinely vary per product — schema version, error code,
 * which amount bounds the request — as arguments, so no product's observable
 * behaviour moves by a byte.
 */

/* A request-shaped object, or the product's own error. Guard, not a parser. */
export function assertOperationObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value;
}

/* No key the product did not name. Unknown input is refused, never ignored:
 * a silently dropped field is a customer who paid for a request we did not
 * run. */
export function assertOperationKeys(value, allowed, code) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError(code);
}

/*
 * The hash that binds one payment to one exact request. Target, product, and
 * input — nothing else, and in this order, because the value is compared
 * across processes and across deploys.
 */
export function operationRequestHash({ resourcePath, productId, input }) {
  return hashJson({ target: resourcePath, productId, input });
}

/*
 * The public price for a fixed-price product. `supplierCostAtomic` defaults to
 * '0' because a product we serve from our own indexed state has no per-call
 * supplier cost; a product that buys from someone else states its own.
 */
export function fixedPublicPricing({ priceVersion, productId, amountAtomic, supplierCostAtomic = '0' }) {
  if (amountAtomic === undefined) throw new TypeError(`${productId.split('.')[0]}_pricing_invalid`);
  return Object.freeze({
    priceVersion,
    maximumCharge: Object.freeze({ asset: 'USDC', amountAtomic, decimals: 6 }),
    supplierCost: Object.freeze({ asset: 'usd', amountAtomic: supplierCostAtomic, decimals: 6 }),
  });
}

/*
 * The envelope a runtime is executed against.
 *
 * `boundAmountAtomic` is the caller's, not this function's guess: it is the
 * ceiling the runtime must not exceed, and which amount that is — the customer
 * charge or the supplier cost — is a product decision with real money behind
 * it. Passing it explicitly is what keeps the two readings from silently
 * swapping during a refactor.
 */
export function operationExecutionRequest({
  schemaVersion,
  operationId,
  productId,
  input,
  boundAmountAtomic,
  now,
  deadlineMs,
}) {
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    schemaVersion,
    operationId,
    productId,
    input,
    maximumCharge: Object.freeze({ asset: 'USD', amountAtomic: boundAmountAtomic, decimals: 6 }),
    deadlineAt: new Date(Date.parse(now) + deadlineMs).toISOString(),
  });
}

/*
 * The settled response envelope. `state` is always RECEIPTED and `replayed` is
 * always false here: a replay is served from the store in `process` above and
 * never reaches this function, so a `true` written here would be unreachable
 * and misleading.
 */
export function operationHttpResult({ operationId, productId, requestHash, output, receipt }) {
  return Object.freeze({
    operationId,
    productId,
    state: 'RECEIPTED',
    replayed: false,
    requestHash,
    result: output,
    receipt,
  });
}

/*
 * Whether a runtime's result may be believed.
 *
 * The result carries its own hash, so the check is not "does this look right"
 * but "does this hash to what it claims, over the fields it claims" — a
 * runtime that returns a well-formed lie fails here. The unsigned projection
 * must stay in this exact key order: it is hashed, and a reordering would
 * invalidate every result the runtimes currently produce.
 */
export function verifiedRuntimeResult(value, request, schemaVersion) {
  if (!value
    || value.contractVersion !== CONTRACT_VERSION
    || value.schemaVersion !== schemaVersion
    || value.operationId !== request.operationId
    || value.productId !== request.productId
    || value.output?.kind !== request.input.kind
    || !/^sha256:[a-f0-9]{64}$/u.test(value.resultHash ?? '')) return false;
  const unsigned = {
    contractVersion: value.contractVersion,
    schemaVersion: value.schemaVersion,
    operationId: value.operationId,
    productId: value.productId,
    completedAt: value.completedAt,
    meteredCharge: value.meteredCharge,
    output: value.output,
  };
  return value.resultHash === hashJson(unsigned);
}

/*
 * Provenance from a set of qualification ids. Every entry must be a real
 * qualification: provenance is what a receipt cites, so an unqualified source
 * is refused here rather than recorded as evidence.
 */
export function qualifiedProvenance({ adapterId, qualificationIds, providerReferenceHash, code }) {
  if (!Array.isArray(qualificationIds)
    || qualificationIds.length < 1
    || qualificationIds.some((id) => !/^qual_[A-Za-z0-9]{20,64}$/u.test(id ?? ''))) throw new TypeError(code);
  return Object.freeze(qualificationIds.map((qualificationId) => Object.freeze({
    adapterId,
    qualificationId,
    providerReferenceHash,
  })));
}


function safeSettlement(settled, operationId, observedAt) {
  const network = settled?.settlement?.network;
  const transaction = settled?.settlement?.transaction;
  if (network !== 'eip155:8453' || !/^0x[a-fA-F0-9]{64}$/u.test(transaction ?? '')) refuse('x402_settlement_evidence_invalid', 502);
  const referenceHash = hashJson({ network, transaction: transaction.toLowerCase() });
  return Object.freeze({
    settlementId: identifier('settle', `${operationId}:${referenceHash}`),
    network,
    referenceHash,
    observedAt,
  });
}

export function createX402PaidOperationProcessor({ service, stateStore, acquireExecution } = {}) {
  if (!service || !['challenge_only', 'settlement_enabled'].includes(service.mode)) throw new TypeError('invalid_x402_service');
  const requiredStoreMethods = ['lookup', 'challenge', 'claimExecution', 'recordExecution', 'markExecutionUnknown', 'claimSettlement', 'markSettlementUnknown', 'complete'];
  if (!stateStore || requiredStoreMethods.some((method) => typeof stateStore[method] !== 'function')) throw new TypeError('invalid_x402_state_store');
  if (acquireExecution !== undefined && typeof acquireExecution !== 'function') throw new TypeError('invalid_x402_execution_acquirer');

  return Object.freeze({
    mode: service.mode,
    durable: stateStore.durable === true,
    async process({
      idempotencyKey,
      requestHash,
      operationId,
      productId,
      executionInput,
      paymentHeader,
      authorizationHeader,
      now,
      pricing,
      prepare,
      execute,
      createResponse,
      resourcePath,
      discovery,
      overloadCode = 'operation_overloaded',
    }) {
      if (typeof execute !== 'function' || typeof createResponse !== 'function') throw new TypeError('invalid_x402_operation_handler');
      if (prepare !== undefined && typeof prepare !== 'function') throw new TypeError('invalid_x402_operation_prepare');
      if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u.test(productId ?? '')) throw new TypeError('invalid_x402_product_id');
      const effectiveResourcePath = resourcePath ?? (productId.startsWith('ai.') ? '/v1/ai/execute' : '/v1/search/paid');
      if (!payableResourcePaths.has(effectiveResourcePath)) throw new TypeError('invalid_x402_operation_resource');
      const base = { idempotencyKey, requestHash, operationId, now };
      let state = await stateStore.lookup(base);
      if (state.kind === 'conflict') refuse('idempotency_conflict');
      if (state.kind === 'replay') {
        return Object.freeze({ status: 200, headers: Object.freeze({ 'idempotency-replayed': 'true' }), body: Object.freeze({ ...state.response, replayed: true }) });
      }
      if (state.kind === 'unknown') refuse(state.state, 503);
      if (['executing', 'settling'].includes(state.kind)) refuse('idempotency_in_progress');

      const prepared = prepare === undefined ? undefined : await prepare();
      const effectivePricing = prepared?.pricing ?? pricing;
      const effectiveExecutionInput = prepared?.executionInput ?? executionInput;
      const effectiveDiscovery = prepared?.discovery ?? discovery;
      assertPricing(effectivePricing);

      if (state.kind === 'missing') {
        const quote = sealQuote({
          contractVersion: CONTRACT_VERSION,
          quoteId: identifier('quote', `${operationId}:${requestHash}`),
          operationId,
          productId,
          requestHash,
          priceVersion: effectivePricing.priceVersion,
          maximumCharge: effectivePricing.maximumCharge,
          issuedAt: now,
          expiresAt: new Date(Date.parse(now) + 300_000).toISOString(),
        });
        const challenge = await service.challenge({ quote, description: `Bounded ${productId} execution`, now, resourcePath: effectiveResourcePath, discovery: effectiveDiscovery });
        state = await stateStore.challenge({ ...base, quote, challenge });
      }
      if (state.kind === 'conflict') refuse('idempotency_conflict');
      if (state.quote.priceVersion !== effectivePricing.priceVersion || !sameAmount(state.quote.maximumCharge, effectivePricing.maximumCharge)) refuse('quote_pricing_changed');
      if (isQuoteExpired(state.quote, now)) refuse('quote_expired');
      if (paymentHeader === undefined && authorizationHeader === undefined) return challengeResponse(state);
      if (service.mode !== 'settlement_enabled') refuse('x402_settlement_disabled', 503);

      const authorization = await service.authorize({ paymentHeader, authorizationHeader, challenge: state.challenge });
      let execution = state.execution;
      if (state.state === 'challenged') {
        const release = acquireExecution?.();
        if (acquireExecution !== undefined && release === undefined) refuse(overloadCode, 503);
        let claimed;
        try {
          claimed = await stateStore.claimExecution({ ...base, paymentFingerprint: authorization.fingerprint });
          if (claimed.kind === 'payment_conflict') refuse('x402_payment_already_bound');
          if (claimed.kind !== 'claimed') refuse(claimed.kind === 'unknown' ? claimed.state : 'idempotency_in_progress', claimed.kind === 'unknown' ? 503 : 409);
          const completed = await execute(effectiveExecutionInput, Object.freeze({ authorization, quote: state.quote, operationId, productId, requestHash }));
          if (!completed || typeof completed !== 'object' || !Array.isArray(completed.provenance) || completed.provenance.length < 1) throw new TypeError('x402_operation_execution_invalid');
          execution = Object.freeze({
            output: completed.output,
            supplierCost: executionSupplierCost(completed.supplierCost, effectivePricing.supplierCost),
            provenance: Object.freeze(completed.provenance.map((entry) => Object.freeze({ ...entry }))),
          });
          await stateStore.recordExecution({ idempotencyKey, leaseId: claimed.leaseId, execution, now });
        } catch (error) {
          if (claimed?.kind === 'claimed') await stateStore.markExecutionUnknown({ idempotencyKey, leaseId: claimed.leaseId, now });
          throw error;
        } finally {
          release?.();
        }
      }
      if (!execution) refuse('x402_execution_state_missing', 503);

      const settlementClaim = await stateStore.claimSettlement({ ...base, paymentFingerprint: authorization.fingerprint });
      if (settlementClaim.kind !== 'claimed') refuse(settlementClaim.kind === 'unknown' ? settlementClaim.state : 'idempotency_in_progress', settlementClaim.kind === 'unknown' ? 503 : 409);
      const settled = await service.settle(authorization);
      if (settled.kind !== 'settled') {
        await stateStore.markSettlementUnknown({ idempotencyKey, leaseId: settlementClaim.leaseId, settlement: { kind: 'unknown', reason: settled.reason ?? 'settlement_unknown' }, now });
        refuse('settlement_unknown', 503);
      }
      const settlement = safeSettlement(settled, operationId, now);
      const receipt = sealReceipt({
        contractVersion: CONTRACT_VERSION,
        receiptId: identifier('rcpt', `${operationId}:${settlement.referenceHash}`),
        operationId,
        productId,
        requestHash,
        quoteId: state.quote.quoteId,
        quoteHash: state.quote.quoteHash,
        fundingMode: 'paid',
        customerCharge: state.quote.maximumCharge,
        supplierCost: execution.supplierCost,
        settlement: { status: 'settled', referenceHash: settlement.referenceHash },
        resultHash: hashJson(execution.output),
        provenance: execution.provenance,
        completedAt: now,
      });
      const response = createResponse({ executionInput: effectiveExecutionInput, output: execution.output, receipt });
      await stateStore.complete({
        idempotencyKey,
        leaseId: settlementClaim.leaseId,
        settlement,
        response,
        accountingInput: {
          settlementId: settlement.settlementId,
          operationId,
          authorizationId: identifier('auth', `${operationId}:${authorization.fingerprint}`),
          receiptHash: receipt.receiptHash,
          settlementReferenceHash: settlement.referenceHash,
          customerCharge: { ...state.quote.maximumCharge, asset: 'usdc' },
          supplierCost: execution.supplierCost,
          occurredAt: now,
        },
        now,
      });
      return Object.freeze({ status: 200, headers: settled.headers, body: response });
    },
  });
}
