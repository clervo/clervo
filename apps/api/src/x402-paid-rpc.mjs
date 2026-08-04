import {
  CONTRACT_VERSION,
  RPC_OPERATION_REQUEST_SCHEMA_VERSION,
  assertRpcOperationRequest,
  hashJson,
  verifyRpcOperationResult,
} from '../../../dist/packages/contracts/src/index.js';
import { createX402PaidOperationProcessor } from './x402-paid-operation.mjs';

export const RPC_PAID_PATH = '/v1/rpc/execute';
export const RPC_MAX_BODY_BYTES = 262_144;

const pricingByKind = Object.freeze({ call: 1n, batch: 1n });

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value;
}

function exactKeys(value, allowed, code) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError(code);
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
  return hashJson({ target: RPC_PAID_PATH, productId: normalized.productId, input: normalized.input });
}

export function rpcPublicPricing(normalized) {
  const units = normalized.input.kind === 'batch' ? BigInt(normalized.input.calls.length) : 1n;
  const amountAtomic = (pricingByKind[normalized.input.kind] * units).toString();
  return Object.freeze({
    priceVersion: `rpc-read-public-2026-08-04.1-${normalized.productId}`,
    maximumCharge: Object.freeze({ asset: 'USDC', amountAtomic, decimals: 6 }),
    supplierCost: Object.freeze({ asset: 'usd', amountAtomic, decimals: 6 }),
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

export function createX402PaidRpcProcessor({ service, stateStore, runtime, acquireExecution } = {}) {
  if (!runtime || typeof runtime.execute !== 'function' || runtime.durable !== true) throw new TypeError('invalid_public_rpc_runtime');
  const processor = createX402PaidOperationProcessor({ service, stateStore, acquireExecution });
  return Object.freeze({
    mode: processor.mode,
    durable: processor.durable,
    async process({ idempotencyKey, requestHash, operationId, normalized, paymentHeader, authorizationHeader, now }) {
      const selectedPricing = rpcPublicPricing(normalized);
      const request = Object.freeze({
        contractVersion: CONTRACT_VERSION,
        schemaVersion: RPC_OPERATION_REQUEST_SCHEMA_VERSION,
        operationId,
        productId: normalized.productId,
        input: normalized.input,
        maximumCharge: Object.freeze({ asset: 'USD', amountAtomic: selectedPricing.supplierCost.amountAtomic, decimals: 6 }),
        deadlineAt: new Date(Date.parse(now) + 30_000).toISOString(),
      });
      assertRpcOperationRequest(request);
      return processor.process({
        idempotencyKey, requestHash, operationId, productId: normalized.productId, executionInput: request,
        paymentHeader, authorizationHeader, now, pricing: selectedPricing, resourcePath: RPC_PAID_PATH,
        discovery: RPC_DISCOVERY, overloadCode: 'rpc_overloaded',
        async execute(executionRequest) {
          const completed = await runtime.execute(executionRequest);
          if (!completed?.result || !verifyRpcOperationResult(completed.result, executionRequest) || !/^qual_[A-Za-z0-9]{20,64}$/u.test(completed.qualificationId ?? '')) throw new TypeError('rpc_runtime_result_invalid');
          return Object.freeze({
            output: completed.result,
            supplierCost: selectedPricing.supplierCost,
            provenance: Object.freeze([Object.freeze({ adapterId: 'adapter_rpc.qualified_route', qualificationId: completed.qualificationId, providerReferenceHash: completed.result.resultHash })]),
          });
        },
        createResponse({ output, receipt }) {
          return Object.freeze({ operationId, productId: normalized.productId, state: 'RECEIPTED', replayed: false, requestHash, result: output, receipt });
        },
      });
    },
  });
}
