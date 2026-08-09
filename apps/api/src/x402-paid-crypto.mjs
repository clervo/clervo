import {
  assertOperationKeys,
  assertOperationObject,
  createX402PaidOperationProcessor,
  fixedPublicPricing,
  operationExecutionRequest,
  operationHttpResult,
  operationRequestHash,
  qualifiedProvenance,
  verifiedRuntimeResult,
} from './x402-paid-operation.mjs';

export const CRYPTO_PAID_PATH = '/v1/crypto/execute';
export const CRYPTO_MAX_BODY_BYTES = 262_144;
export const CRYPTO_REQUEST_SCHEMA_VERSION = 'crypto-operation-request.v1';
export const CRYPTO_RESULT_SCHEMA_VERSION = 'crypto-operation-result.v1';

export const CRYPTO_PUBLIC_CHAINS = Object.freeze(['eip155:1', 'eip155:8453']);
export const CRYPTO_PUBLIC_OPERATIONS = Object.freeze(['crypto.wallet.balances', 'crypto.wallet.tokens', 'crypto.wallet.transactions', 'crypto.wallet.report']);
const productByKind = Object.freeze({ balances: 'crypto.wallet.balances', tokens: 'crypto.wallet.tokens', transactions: 'crypto.wallet.transactions', report: 'crypto.wallet.report' });
const priceByProduct = Object.freeze({ 'crypto.wallet.balances': 2_000n, 'crypto.wallet.tokens': 2_000n, 'crypto.wallet.transactions': 3_000n, 'crypto.wallet.report': 4_000n });
const allowedByKind = Object.freeze({
  balances: ['kind', 'address', 'chains'],
  tokens: ['kind', 'address', 'chains'],
  transactions: ['kind', 'address', 'chains', 'lookbackDays', 'limit'],
  report: ['kind', 'address', 'chains', 'lookbackDays', 'limit'],
});

function object(value) {
  return assertOperationObject(value, 'crypto_http_request_invalid');
}
function exact(value, keys) {
  assertOperationKeys(value, keys, 'crypto_http_request_additional_property');
}
function address(value) {
  if (typeof value !== 'string') throw new TypeError('crypto_address_invalid');
  if (!/^0x[a-fA-F0-9]{40}$/u.test(value)) throw new TypeError('crypto_address_invalid');
  return value.toLowerCase();
}
function chains(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > CRYPTO_PUBLIC_CHAINS.length || new Set(value).size !== value.length || value.some((chainId) => !CRYPTO_PUBLIC_CHAINS.includes(chainId))) throw new TypeError('crypto_chain_unavailable');
  return Object.freeze(CRYPTO_PUBLIC_CHAINS.filter((chainId) => value.includes(chainId)));
}

export function normalizeCryptoHttpRequest(value) {
  object(value);
  exact(value, ['kind', 'address', 'chains', 'lookbackDays', 'limit']);
  const kind = value.kind;
  if (!Object.hasOwn(productByKind, kind)) throw new TypeError('crypto_kind_invalid');
  exact(value, allowedByKind[kind]);
  const input = { kind, address: address(value.address), chains: chains(value.chains) };
  if (kind === 'transactions' || kind === 'report') {
    if (!Number.isSafeInteger(value.lookbackDays) || value.lookbackDays < 1 || value.lookbackDays > 90) throw new TypeError('crypto_lookback_invalid');
    if (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 50) throw new TypeError('crypto_transaction_limit_invalid');
    input.lookbackDays = value.lookbackDays;
    input.limit = value.limit;
  }
  return Object.freeze({ productId: productByKind[kind], input: Object.freeze(input) });
}

export function cryptoHttpRequestHash(normalized) {
  return operationRequestHash({ resourcePath: CRYPTO_PAID_PATH, productId: normalized.productId, input: normalized.input });
}
export function cryptoPublicPricing(normalized) {
  return fixedPublicPricing({
    priceVersion: `crypto-public-2026-08-09.1-${normalized.productId}`,
    productId: normalized.productId,
    amountAtomic: priceByProduct[normalized.productId]?.toString(),
  });
}

export const CRYPTO_DISCOVERY = Object.freeze({
  method: 'POST', bodyType: 'json',
  input: Object.freeze({ kind: 'report', address: '0x0000000000000000000000000000000000000000', chains: Object.freeze(['eip155:1', 'eip155:8453']), lookbackDays: 30, limit: 50 }),
  inputSchema: Object.freeze({
    type: 'object', required: Object.freeze(['kind', 'address', 'chains', 'lookbackDays', 'limit']), additionalProperties: false,
    properties: Object.freeze({
      kind: Object.freeze({ const: 'report' }),
      address: Object.freeze({ type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' }),
      chains: Object.freeze({ type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: Object.freeze({ enum: CRYPTO_PUBLIC_CHAINS }) }),
      lookbackDays: Object.freeze({ type: 'integer', minimum: 1, maximum: 90 }),
      limit: Object.freeze({ type: 'integer', minimum: 1, maximum: 50 }),
    }),
  }),
  output: Object.freeze({ example: Object.freeze({ productId: 'crypto.wallet.report', state: 'RECEIPTED', replayed: false, result: Object.freeze({ output: Object.freeze({ kind: 'report', state: 'available', requestedChains: CRYPTO_PUBLIC_CHAINS }) }), receipt: Object.freeze({ settlement: Object.freeze({ status: 'settled' }) }) }), schema: Object.freeze({ type: 'object', additionalProperties: true }) }),
});

function validResult(value, request) {
  return verifiedRuntimeResult(value, request, CRYPTO_RESULT_SCHEMA_VERSION);
}

export function createX402PaidCryptoProcessor({ service, stateStore, runtime, acquireExecution } = {}) {
  if (!runtime || typeof runtime.execute !== 'function' || runtime.durable !== true) throw new TypeError('invalid_public_crypto_runtime');
  const processor = createX402PaidOperationProcessor({ service, stateStore, acquireExecution });
  return Object.freeze({
    mode: processor.mode, durable: processor.durable,
    async process({ idempotencyKey, requestHash, operationId, normalized, paymentHeader, authorizationHeader, now }) {
      const pricing = cryptoPublicPricing(normalized);
      /* Crypto bounds the runtime by the customer charge: it buys nothing per
       * call, so the supplier cost is 0 and would bound the request to zero. */
      const request = operationExecutionRequest({
        schemaVersion: CRYPTO_REQUEST_SCHEMA_VERSION,
        operationId,
        productId: normalized.productId,
        input: normalized.input,
        boundAmountAtomic: pricing.maximumCharge.amountAtomic,
        now,
        deadlineMs: 30_000,
      });
      return processor.process({
        idempotencyKey, requestHash, operationId, productId: normalized.productId, executionInput: request,
        paymentHeader, authorizationHeader, now, pricing, resourcePath: CRYPTO_PAID_PATH, discovery: CRYPTO_DISCOVERY, overloadCode: 'crypto_overloaded',
        async execute(executionRequest) {
          const completed = await runtime.execute(executionRequest);
          if (!validResult(completed?.result, executionRequest)) throw new TypeError('crypto_runtime_result_invalid');
          return Object.freeze({
            output: completed.result,
            supplierCost: pricing.supplierCost,
            provenance: qualifiedProvenance({
              adapterId: 'adapter_crypto.blockscout_value_added',
              qualificationIds: completed.qualificationIds,
              providerReferenceHash: completed.result.resultHash,
              code: 'crypto_runtime_result_invalid',
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
