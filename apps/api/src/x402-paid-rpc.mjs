import {
  CONTRACT_VERSION,
  RPC_OPERATION_REQUEST_SCHEMA_VERSION,
  assertRpcOperationRequest,
  verifyRpcOperationResult,
} from '../../../dist/packages/contracts/src/index.js';
import {
  assertOperationKeys,
  assertOperationObject,
  createX402PaidOperationProcessor,
  operationExecutionRequest,
  operationHttpResult,
  operationRequestHash,
  qualifiedProvenance,
} from './x402-paid-operation.mjs';

export const RPC_PAID_PATH = '/v1/rpc/execute';
export const RPC_HEALTH_PATH = '/v1/rpc/chains';
export const RPC_MAX_BODY_BYTES = 262_144;

const pricingByKind = Object.freeze({ call: 1_000n, batch: 1_000n });

function object(value, code) {
  return assertOperationObject(value, code);
}

function exactKeys(value, allowed, code) {
  assertOperationKeys(value, allowed, code);
}

export function normalizeRpcHttpRequest(value) {
  object(value, 'rpc_http_request_invalid');
  exactKeys(value, ['chainId', 'call', 'calls', 'quorum'], 'rpc_http_request_additional_property');
  const hasCall = value.call !== undefined;
  const hasCalls = value.calls !== undefined;
  if (hasCall === hasCalls) throw new TypeError('rpc_http_calls_invalid');
  const input = hasCall
    ? Object.freeze({ kind: 'call', chainId: value.chainId, call: structuredClone(value.call), ...(value.quorum === undefined ? {} : { quorum: value.quorum }) })
    : Object.freeze({ kind: 'batch', chainId: value.chainId, calls: Object.freeze(structuredClone(value.calls)), ...(value.quorum === undefined ? {} : { quorum: value.quorum }) });
  const productId = input.kind === 'call' ? 'rpc.call' : 'rpc.batch';
  const probe = { contractVersion: CONTRACT_VERSION, schemaVersion: RPC_OPERATION_REQUEST_SCHEMA_VERSION, operationId: `op_${'0'.repeat(32)}`, productId, input, maximumCharge: { asset: 'USD', amountAtomic: '1000000', decimals: 6 }, deadlineAt: '2099-01-01T00:00:00.000Z' };
  assertRpcOperationRequest(probe);
  return Object.freeze({ productId, input });
}

export function rpcHttpRequestHash(normalized) {
  return operationRequestHash({ resourcePath: RPC_PAID_PATH, productId: normalized.productId, input: normalized.input });
}

export function rpcPublicPricing(normalized) {
  const units = normalized.input.kind === 'batch' ? BigInt(normalized.input.calls.length) : 1n;
  const amountAtomic = (pricingByKind[normalized.input.kind] * units).toString();
  return Object.freeze({
    priceVersion: `rpc-read-public-2026-08-15.1-${normalized.productId}`,
    maximumCharge: Object.freeze({ asset: 'USDC', amountAtomic, decimals: 6 }),
    supplierCost: Object.freeze({ asset: 'usd', amountAtomic: '0', decimals: 6 }),
  });
}

export const RPC_DISCOVERY = Object.freeze({
  method: 'POST', bodyType: 'json',
  input: Object.freeze({ chainId: 'eip155:1', call: Object.freeze({ method: 'eth_chainId', params: Object.freeze([]) }) }),
  inputSchema: Object.freeze({
    type: 'object', required: ['chainId'], additionalProperties: false,
    oneOf: Object.freeze([{ required: ['call'] }, { required: ['calls'] }]),
    properties: Object.freeze({
      chainId: Object.freeze({ type: 'string' }),
      call: Object.freeze({ type: 'object', required: ['method', 'params'], additionalProperties: false, properties: Object.freeze({ method: Object.freeze({ type: 'string' }), params: Object.freeze({}) }) }),
      calls: Object.freeze({ type: 'array', minItems: 1, maxItems: 20 }),
      quorum: Object.freeze({ type: 'integer', minimum: 1, maximum: 3 }),
    }),
  }),
  output: Object.freeze({ example: Object.freeze({ productId: 'rpc.call', state: 'RECEIPTED', replayed: false, result: Object.freeze({ output: Object.freeze({ kind: 'rpc', chainId: 'eip155:1' }) }), receipt: Object.freeze({ settlement: Object.freeze({ status: 'settled' }) }) }), schema: Object.freeze({ type: 'object', additionalProperties: true }) }),
});

export function createX402PaidRpcProcessor({ service, stateStore, runtime, acquireExecution, acquireQuote } = {}) {
  if (!runtime || typeof runtime.execute !== 'function' || runtime.durable !== true) throw new TypeError('invalid_public_rpc_runtime');
  const processor = createX402PaidOperationProcessor({ service, stateStore, acquireExecution, acquireQuote });
  return Object.freeze({
    mode: processor.mode,
    durable: processor.durable,
    async process({ idempotencyKey, requestHash, operationId, normalized, paymentHeader, authorizationHeader, now, deadlineAt, signal }) {
      const selectedPricing = rpcPublicPricing(normalized);
      /* RPC bounds execution by the represented supplier cost. The current
       * owned allocations have zero marginal cost; their finite usage is
       * independently bounded by the production runtime call ceiling. */
      const request = operationExecutionRequest({
        schemaVersion: RPC_OPERATION_REQUEST_SCHEMA_VERSION,
        operationId,
        productId: normalized.productId,
        input: normalized.input,
        boundAmountAtomic: selectedPricing.supplierCost.amountAtomic,
        now,
        deadlineMs: 30_000,
        deadlineAt,
      });
      assertRpcOperationRequest(request);
      return processor.process({
        idempotencyKey, requestHash, operationId, productId: normalized.productId, executionInput: request,
        paymentHeader, authorizationHeader, now, pricing: selectedPricing, resourcePath: RPC_PAID_PATH,
        discovery: RPC_DISCOVERY, overloadCode: 'rpc_overloaded',
        deadlineAt, signal,
        async execute(executionRequest) {
          const completed = await runtime.execute(executionRequest);
          if (!completed?.result || !verifyRpcOperationResult(completed.result, executionRequest)) throw new TypeError('rpc_runtime_result_invalid');
          return Object.freeze({
            output: completed.result,
            supplierCost: selectedPricing.supplierCost,
            provenance: qualifiedProvenance({
              adapterId: 'adapter_rpc.qualified_route',
              qualificationIds: [completed.qualificationId],
              providerReferenceHash: completed.result.resultHash,
              code: 'rpc_runtime_result_invalid',
            }),
          });
        },
        createResponse({ output, receipt }) {
          return operationHttpResult({ operationId, productId: normalized.productId, requestHash, output, receipt });
        },
      });
    },
  });
}
