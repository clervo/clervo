import { createHash } from 'node:crypto';
import {
  CONTRACT_VERSION,
  hashJson,
  isQuoteExpired,
  sealQuote,
  sealReceipt,
} from '../../../dist/packages/contracts/src/index.js';

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
      overloadCode = 'operation_overloaded',
    }) {
      if (typeof execute !== 'function' || typeof createResponse !== 'function') throw new TypeError('invalid_x402_operation_handler');
      if (prepare !== undefined && typeof prepare !== 'function') throw new TypeError('invalid_x402_operation_prepare');
      if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/u.test(productId ?? '')) throw new TypeError('invalid_x402_product_id');
      const effectiveResourcePath = resourcePath ?? (productId.startsWith('ai.') ? '/v1/ai/execute' : '/v1/search/paid');
      if (!['/v1/search/paid', '/v1/ai/execute'].includes(effectiveResourcePath)) throw new TypeError('invalid_x402_operation_resource');
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
        const challenge = await service.challenge({ quote, description: `Bounded ${productId} execution`, now, resourcePath: effectiveResourcePath });
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
          const completed = await execute(effectiveExecutionInput);
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
