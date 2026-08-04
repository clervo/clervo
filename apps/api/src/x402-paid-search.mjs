import { createHash } from 'node:crypto';
import {
  assertSearchExecutionOutput,
  createSearchHttpResult,
} from '../../../dist/packages/contracts/src/index.js';
import { createX402PaidOperationProcessor } from './x402-paid-operation.mjs';

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

export function x402SearchPricing(productId) {
  const pricing = PRICING[productId];
  if (!pricing) throw new TypeError('unsupported_x402_search_product');
  return pricing;
}

export function createX402PaidSearchProcessor({ service, stateStore, executor, acquireExecution } = {}) {
  if (!executor || typeof executor.execute !== 'function') throw new TypeError('search executor is required');
  const processor = createX402PaidOperationProcessor({ service, stateStore, acquireExecution });

  return Object.freeze({
    mode: processor.mode,
    durable: processor.durable,
    async process({ idempotencyKey, requestHash, operationId, productId, normalized, paymentHeader, now }) {
      const pricing = x402SearchPricing(productId);
      const executionInput = Object.freeze({ ...normalized, operationId, productId, requestHash, fundingMode: 'paid' });
      return processor.process({
        idempotencyKey,
        requestHash,
        operationId,
        productId,
        executionInput,
        paymentHeader,
        now,
        pricing,
        overloadCode: 'search_overloaded',
        async execute(input) {
          const output = await executor.execute(input);
          assertSearchExecutionOutput(output, input);
          return Object.freeze({
            output,
            provenance: Object.freeze([{
              adapterId: 'adapter_search.recorded_release_candidate',
              qualificationId: identifier('qual', operationId),
              providerReferenceHash: requestHash,
            }]),
          });
        },
        createResponse({ executionInput: input, output, receipt }) {
          return createSearchHttpResult(input, output, false, receipt);
        },
      });
    },
  });
}
