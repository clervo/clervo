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

const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const publicChains = Object.freeze(['eip155:1', 'eip155:8453', SOLANA_MAINNET]);
const productByKind = Object.freeze({ wallet: 'crypto.wallet', token: 'crypto.token', transaction: 'crypto.transaction', protocol: 'crypto.protocol', report: 'crypto.report' });
const priceByProduct = Object.freeze({ 'crypto.wallet': 500n, 'crypto.token': 250n, 'crypto.transaction': 500n, 'crypto.protocol': 750n, 'crypto.report': 1_000n });
const allowedByKind = Object.freeze({
  wallet: ['kind', 'chainId', 'address'],
  token: ['kind', 'chainId', 'assetAddress'],
  transaction: ['kind', 'chainId', 'address', 'transactionId', 'limit'],
  protocol: ['kind', 'chainId', 'address'],
  report: ['kind', 'chainId', 'address'],
});

function object(value) {
  return assertOperationObject(value, 'crypto_http_request_invalid');
}
function exact(value, keys) {
  assertOperationKeys(value, keys, 'crypto_http_request_additional_property');
}
function address(value, selectedChain) {
  if (typeof value !== 'string') throw new TypeError('crypto_address_invalid');
  if (selectedChain === SOLANA_MAINNET) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(value)) throw new TypeError('crypto_address_invalid');
    return value;
  }
  if (!/^0x[a-fA-F0-9]{40}$/u.test(value)) throw new TypeError('crypto_address_invalid');
  return value.toLowerCase();
}
function chainId(value) {
  if (!publicChains.includes(value)) throw new TypeError('crypto_chain_unavailable');
  return value;
}

export function normalizeCryptoHttpRequest(value) {
  object(value);
  exact(value, ['kind', 'chainId', 'address', 'assetAddress', 'transactionId', 'limit']);
  const kind = value.kind;
  if (!Object.hasOwn(productByKind, kind)) throw new TypeError('crypto_kind_invalid');
  exact(value, allowedByKind[kind]);
  const selectedChain = chainId(value.chainId);
  let input;
  if (kind === 'protocol' && selectedChain === SOLANA_MAINNET) throw new TypeError('crypto_protocol_chain_unavailable');
  if (kind === 'token') input = { kind, chainId: selectedChain, assetAddress: address(value.assetAddress, selectedChain) };
  else if (kind === 'transaction') {
    const maximum = selectedChain === SOLANA_MAINNET ? 20 : 100;
    if (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > maximum) throw new TypeError('crypto_transaction_limit_invalid');
    if (value.transactionId !== undefined && (typeof value.transactionId !== 'string' || (selectedChain === SOLANA_MAINNET ? !/^[1-9A-HJ-NP-Za-km-z]{64,128}$/u.test(value.transactionId) : !/^0x[a-fA-F0-9]{64}$/u.test(value.transactionId)))) throw new TypeError('crypto_transaction_id_invalid');
    input = { kind, chainId: selectedChain, address: address(value.address, selectedChain), limit: value.limit, ...(value.transactionId === undefined ? {} : { transactionId: selectedChain === SOLANA_MAINNET ? value.transactionId : value.transactionId.toLowerCase() }) };
  } else input = { kind, chainId: selectedChain, address: address(value.address, selectedChain) };
  return Object.freeze({ productId: productByKind[kind], input: Object.freeze(input) });
}

export function cryptoHttpRequestHash(normalized) {
  return operationRequestHash({ resourcePath: CRYPTO_PAID_PATH, productId: normalized.productId, input: normalized.input });
}
export function cryptoPublicPricing(normalized) {
  return fixedPublicPricing({
    priceVersion: `crypto-public-2026-08-04.1-${normalized.productId}`,
    productId: normalized.productId,
    amountAtomic: priceByProduct[normalized.productId]?.toString(),
  });
}

export const CRYPTO_DISCOVERY = Object.freeze({
  method: 'POST', bodyType: 'json',
  input: Object.freeze({ kind: 'wallet', chainId: 'eip155:8453', address: '0x0000000000000000000000000000000000000000' }),
  inputSchema: Object.freeze({
    type: 'object', required: Object.freeze(['kind', 'chainId', 'address']), additionalProperties: false,
    properties: Object.freeze({ kind: Object.freeze({ const: 'wallet' }), chainId: Object.freeze({ enum: publicChains }), address: Object.freeze({ type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' }) }),
  }),
  output: Object.freeze({ example: Object.freeze({ productId: 'crypto.wallet', state: 'RECEIPTED', replayed: false, result: Object.freeze({ output: Object.freeze({ kind: 'wallet', state: 'available', chainId: 'eip155:8453' }) }), receipt: Object.freeze({ settlement: Object.freeze({ status: 'settled' }) }) }), schema: Object.freeze({ type: 'object', additionalProperties: true }) }),
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
              adapterId: 'adapter_crypto.qualified_source',
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
