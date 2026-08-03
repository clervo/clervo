import { createHash } from 'node:crypto';
import {
  CONTRACT_VERSION,
  assertSearchExecutionOutput,
  createSearchHttpResult,
  hashJson,
  isQuoteExpired,
  sealQuote,
  sealReceipt,
} from '../../../dist/packages/contracts/src/index.js';

const PRICING = Object.freeze({
  'search.web': Object.freeze({
    priceVersion: 'search-web-usdc-2026-08-03.1',
    maximumCharge: Object.freeze({ asset: 'USDC', amountAtomic: '6000', decimals: 6 }),
    supplierCost: Object.freeze({ asset: 'usd', amountAtomic: '400', decimals: 6 }),
  }),
  'search.answer': Object.freeze({
    priceVersion: 'search-answer-usdc-2026-08-03.1',
    maximumCharge: Object.freeze({ asset: 'USDC', amountAtomic: '12000', decimals: 6 }),
    supplierCost: Object.freeze({ asset: 'usd', amountAtomic: '1500', decimals: 6 }),
  }),
});

function identifier(prefix, seed) {
  return `${prefix}_${createHash('sha256').update(seed).digest('hex').slice(0, 32)}`;
}

function refuse(code, status = 409) {
  throw Object.assign(new Error(code), { status });
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

export function x402SearchPricing(productId) {
  const pricing = PRICING[productId];
  if (!pricing) throw new TypeError('unsupported_x402_search_product');
  return pricing;
}

export function createX402PaidSearchProcessor({ service, stateStore, executor, acquireExecution } = {}) {
  if (!service || !['challenge_only', 'settlement_enabled'].includes(service.mode)) throw new TypeError('invalid_x402_service');
  if (!stateStore || typeof stateStore.lookup !== 'function' || typeof stateStore.complete !== 'function' || typeof stateStore.markExecutionUnknown !== 'function') throw new TypeError('invalid_x402_state_store');
  if (!executor || typeof executor.execute !== 'function') throw new TypeError('search executor is required');
  if (acquireExecution !== undefined && typeof acquireExecution !== 'function') throw new TypeError('invalid_x402_execution_acquirer');

  return Object.freeze({
    mode: service.mode,
    durable: stateStore.durable === true,
    async process({ idempotencyKey, requestHash, operationId, productId, normalized, paymentHeader, now }) {
      const pricing = x402SearchPricing(productId);
      const base = { idempotencyKey, requestHash, operationId, now };
      let state = await stateStore.lookup(base);
      if (state.kind === 'conflict') refuse('idempotency_conflict');
      if (state.kind === 'replay') {
        return Object.freeze({ status: 200, headers: Object.freeze({ 'idempotency-replayed': 'true' }), body: Object.freeze({ ...state.response, replayed: true }) });
      }
      if (state.kind === 'unknown') refuse(state.state, 503);
      if (['executing', 'settling'].includes(state.kind)) refuse('idempotency_in_progress');

      if (state.kind === 'missing') {
        const issuedAt = now;
        const quote = sealQuote({
          contractVersion: CONTRACT_VERSION,
          quoteId: identifier('quote', `${operationId}:${requestHash}`),
          operationId,
          productId,
          requestHash,
          priceVersion: pricing.priceVersion,
          maximumCharge: pricing.maximumCharge,
          issuedAt,
          expiresAt: new Date(Date.parse(issuedAt) + 300_000).toISOString(),
        });
        const challenge = await service.challenge({ quote, description: `Bounded ${productId} execution`, now });
        state = await stateStore.challenge({ ...base, quote, challenge });
      }
      if (state.kind === 'conflict') refuse('idempotency_conflict');
      if (isQuoteExpired(state.quote, now)) refuse('quote_expired');
      if (paymentHeader === undefined) return challengeResponse(state);
      if (service.mode !== 'settlement_enabled') refuse('x402_settlement_disabled', 503);

      const authorization = await service.authorize({ paymentHeader, challenge: state.challenge });
      let execution = state.execution;
      if (state.state === 'challenged') {
        const claimed = await stateStore.claimExecution({ ...base, paymentFingerprint: authorization.fingerprint });
        if (claimed.kind === 'payment_conflict') refuse('x402_payment_already_bound');
        if (claimed.kind !== 'claimed') refuse(claimed.kind === 'unknown' ? claimed.state : 'idempotency_in_progress', claimed.kind === 'unknown' ? 503 : 409);
        const release = acquireExecution?.();
        if (acquireExecution !== undefined && release === undefined) refuse('search_overloaded', 503);
        try {
          const input = Object.freeze({ ...normalized, operationId, productId, requestHash, fundingMode: 'paid' });
          const output = await executor.execute(input);
          assertSearchExecutionOutput(output, input);
          execution = Object.freeze({
            output,
            supplierCost: pricing.supplierCost,
            provenance: Object.freeze([{
              adapterId: 'adapter_search.recorded_release_candidate',
              qualificationId: identifier('qual', operationId),
              providerReferenceHash: requestHash,
            }]),
          });
          await stateStore.recordExecution({ idempotencyKey, leaseId: claimed.leaseId, execution, now });
        } catch (error) {
          await stateStore.markExecutionUnknown({ idempotencyKey, leaseId: claimed.leaseId, now });
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
      const input = Object.freeze({ ...normalized, operationId, productId, requestHash, fundingMode: 'paid' });
      const response = createSearchHttpResult(input, execution.output, false, receipt);
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
