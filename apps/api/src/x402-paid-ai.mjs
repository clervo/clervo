import {
  createAiExecutionRequest,
  createAiHttpResult,
} from '../../../dist/packages/contracts/src/index.js';
import { executeAiOperation } from '../../../dist/services/ai/src/execution.js';
import { createX402PaidOperationProcessor } from './x402-paid-operation.mjs';

function refuse(code, status = 503) {
  throw Object.assign(new Error(code), { status });
}

export function createX402PaidAiProcessor({ service, stateStore, publicPricing, adapters, acquireExecution, monitor } = {}) {
  if (!publicPricing || typeof publicPricing.quote !== 'function') throw new TypeError('invalid_ai_public_pricing');
  if (!Array.isArray(adapters) || adapters.some((adapter) => typeof adapter?.routeId !== 'string' || typeof adapter?.execute !== 'function')) throw new TypeError('invalid_ai_adapters');
  const processor = createX402PaidOperationProcessor({ service, stateStore, acquireExecution });

  return Object.freeze({
    mode: processor.mode,
    durable: processor.durable,
    async process({ idempotencyKey, requestHash, operationId, normalized, paymentHeader, now }) {
      let prepared;
      return processor.process({
        idempotencyKey,
        requestHash,
        operationId,
        productId: normalized.productId,
        paymentHeader,
        now,
        overloadCode: 'ai_overloaded',
        prepare() {
          const quote = publicPricing.quote({ normalized, operationId, now });
          const request = createAiExecutionRequest({
            normalized,
            operationId,
            maximumSupplierCost: quote.decision.maximumSupplierCost,
            deadlineAt: new Date(Date.parse(now) + 120_000).toISOString(),
          });
          prepared = Object.freeze({ quote, request });
          return Object.freeze({ pricing: quote.pricing, executionInput: request });
        },
        async execute(request) {
          if (prepared === undefined) throw new TypeError('ai_execution_not_prepared');
          const outcome = await executeAiOperation({
            request,
            catalog: prepared.quote.catalog,
            routes: prepared.quote.routes,
            adapters,
            startedAt: now,
            clock: () => Date.parse(now),
            monitor,
          });
          if (outcome.outcome !== 'completed') refuse(`ai_execution_${outcome.failureCode}`);
          return Object.freeze({
            output: outcome.result,
            supplierCost: Object.freeze({ ...outcome.result.supplierCost, asset: 'usd' }),
            provenance: Object.freeze([Object.freeze({
              adapterId: 'adapter_ai.qualified_route',
              qualificationId: prepared.quote.selected.definition.qualification.qualificationId,
              providerReferenceHash: outcome.result.resultHash,
            })]),
          });
        },
        createResponse({ executionInput: request, output: result, receipt }) {
          return createAiHttpResult({ request, requestHash, result, receipt });
        },
      });
    },
  });
}
