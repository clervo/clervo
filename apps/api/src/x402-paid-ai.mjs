import {
  createAiExecutionRequest,
  createAiHttpResult,
} from '../../../dist/packages/contracts/src/index.js';
import { executeAiOperation } from '../../../dist/services/ai/src/execution.js';
import { createAiDiscoveryContract } from './ai-discovery.mjs';
import { createX402PaidOperationProcessor } from './x402-paid-operation.mjs';

function refuse(code, status = 503) {
  throw Object.assign(new Error(code), { status });
}

export function createX402PaidAiProcessor({ service, stateStore, publicPricing, adapters, adapterFactory, runtimeBindings, acquireExecution, monitor } = {}) {
  if (!publicPricing || typeof publicPricing.quote !== 'function' || typeof publicPricing.discoveryRequest !== 'function') throw new TypeError('invalid_ai_public_pricing');
  if (!Array.isArray(adapters) || adapters.some((adapter) => typeof adapter?.routeId !== 'string' || typeof adapter?.execute !== 'function')) throw new TypeError('invalid_ai_adapters');
  if (adapterFactory !== undefined && typeof adapterFactory !== 'function') throw new TypeError('invalid_ai_adapter_factory');
  const processor = createX402PaidOperationProcessor({ service, stateStore, acquireExecution });

  return Object.freeze({
    mode: processor.mode,
    durable: processor.durable,
    async process({ idempotencyKey, requestHash, operationId, normalized, paymentHeader, authorizationHeader, now }) {
      let prepared;
      return processor.process({
        idempotencyKey,
        requestHash,
        operationId,
        productId: normalized.productId,
        paymentHeader,
        authorizationHeader,
        now,
        resourcePath: '/v1/ai/execute',
        overloadCode: 'ai_overloaded',
        prepare() {
          const quote = publicPricing.quote({ normalized, operationId, now });
          const deadlineMs = ['ai.video', 'ai.music', 'ai.virtual_try_on'].includes(normalized.productId) ? 600_000 : 120_000;
          const request = createAiExecutionRequest({
            normalized,
            operationId,
            maximumSupplierCost: quote.decision.maximumSupplierCost,
            deadlineAt: new Date(Date.parse(now) + deadlineMs).toISOString(),
          });
          prepared = Object.freeze({ quote, request });
          return Object.freeze({
            pricing: quote.pricing,
            executionInput: request,
            discovery: createAiDiscoveryContract(publicPricing.discoveryRequest(now)),
          });
        },
        async execute(request, { authorization }) {
          if (prepared === undefined) throw new TypeError('ai_execution_not_prepared');
          const executionAdapters = adapterFactory === undefined ? adapters : adapterFactory(authorization);
          if (!Array.isArray(executionAdapters) || executionAdapters.some((adapter) => typeof adapter?.routeId !== 'string' || typeof adapter?.execute !== 'function')) throw new TypeError('invalid_ai_execution_adapters');
          const outcome = await executeAiOperation({
            request,
            catalog: prepared.quote.catalog,
            routes: prepared.quote.routes,
            adapters: executionAdapters,
            runtimeBindings: prepared.quote.runtimeBindings ?? runtimeBindings,
            aliasTargets: prepared.quote.aliasTargets,
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
