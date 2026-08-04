import { CONTRACT_VERSION, hashJson } from '../../../dist/packages/contracts/src/index.js';
import { createX402PaidOperationProcessor } from './x402-paid-operation.mjs';

export const CRYPTO_PAID_PATH = '/v1/crypto/execute';
export const CRYPTO_MAX_BODY_BYTES = 262_144;
export const CRYPTO_REQUEST_SCHEMA_VERSION = 'crypto-operation-request.v1';
export const CRYPTO_RESULT_SCHEMA_VERSION = 'crypto-operation-result.v1';

const publicChains = Object.freeze(['eip155:1', 'eip155:8453']);
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('crypto_http_request_invalid');
  return value;
}
function exact(value, keys) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new TypeError('crypto_http_request_additional_property');
}
function address(value) {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{40}$/u.test(value)) throw new TypeError('crypto_address_invalid');
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
  if (kind === 'token') input = { kind, chainId: selectedChain, assetAddress: address(value.assetAddress) };
  else if (kind === 'transaction') {
    if (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 100) throw new TypeError('crypto_transaction_limit_invalid');
    if (value.transactionId !== undefined && (typeof value.transactionId !== 'string' || !/^0x[a-fA-F0-9]{64}$/u.test(value.transactionId))) throw new TypeError('crypto_transaction_id_invalid');
    input = { kind, chainId: selectedChain, address: address(value.address), limit: value.limit, ...(value.transactionId === undefined ? {} : { transactionId: value.transactionId.toLowerCase() }) };
  } else input = { kind, chainId: selectedChain, address: address(value.address) };
  return Object.freeze({ productId: productByKind[kind], input: Object.freeze(input) });
}

export function cryptoHttpRequestHash(normalized) { return hashJson({ target: CRYPTO_PAID_PATH, productId: normalized.productId, input: normalized.input }); }
export function cryptoPublicPricing(normalized) {
  const amountAtomic = priceByProduct[normalized.productId]?.toString();
  if (amountAtomic === undefined) throw new TypeError('crypto_pricing_invalid');
  return Object.freeze({
    priceVersion: `crypto-public-2026-08-04.1-${normalized.productId}`,
    maximumCharge: Object.freeze({ asset: 'USDC', amountAtomic, decimals: 6 }),
    supplierCost: Object.freeze({ asset: 'usd', amountAtomic: '0', decimals: 6 }),
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
  if (!value || value.contractVersion !== CONTRACT_VERSION || value.schemaVersion !== CRYPTO_RESULT_SCHEMA_VERSION || value.operationId !== request.operationId || value.productId !== request.productId || value.output?.kind !== request.input.kind || !/^sha256:[a-f0-9]{64}$/u.test(value.resultHash ?? '')) return false;
  const unsigned = { contractVersion: value.contractVersion, schemaVersion: value.schemaVersion, operationId: value.operationId, productId: value.productId, completedAt: value.completedAt, meteredCharge: value.meteredCharge, output: value.output };
  return value.resultHash === hashJson(unsigned);
}

export function createX402PaidCryptoProcessor({ service, stateStore, runtime, acquireExecution } = {}) {
  if (!runtime || typeof runtime.execute !== 'function' || runtime.durable !== true) throw new TypeError('invalid_public_crypto_runtime');
  const processor = createX402PaidOperationProcessor({ service, stateStore, acquireExecution });
  return Object.freeze({
    mode: processor.mode, durable: processor.durable,
    async process({ idempotencyKey, requestHash, operationId, normalized, paymentHeader, authorizationHeader, now }) {
      const pricing = cryptoPublicPricing(normalized);
      const request = Object.freeze({ contractVersion: CONTRACT_VERSION, schemaVersion: CRYPTO_REQUEST_SCHEMA_VERSION, operationId, productId: normalized.productId, input: normalized.input, maximumCharge: Object.freeze({ asset: 'USD', amountAtomic: pricing.maximumCharge.amountAtomic, decimals: 6 }), deadlineAt: new Date(Date.parse(now) + 30_000).toISOString() });
      return processor.process({
        idempotencyKey, requestHash, operationId, productId: normalized.productId, executionInput: request,
        paymentHeader, authorizationHeader, now, pricing, resourcePath: CRYPTO_PAID_PATH, discovery: CRYPTO_DISCOVERY, overloadCode: 'crypto_overloaded',
        async execute(executionRequest) {
          const completed = await runtime.execute(executionRequest);
          if (!validResult(completed?.result, executionRequest) || !Array.isArray(completed.qualificationIds) || completed.qualificationIds.length < 1 || completed.qualificationIds.some((id) => !/^qual_[A-Za-z0-9]{20,64}$/u.test(id))) throw new TypeError('crypto_runtime_result_invalid');
          return Object.freeze({ output: completed.result, supplierCost: pricing.supplierCost, provenance: Object.freeze(completed.qualificationIds.map((qualificationId) => Object.freeze({ adapterId: 'adapter_crypto.qualified_source', qualificationId, providerReferenceHash: completed.result.resultHash }))) });
        },
        createResponse({ output, receipt }) { return Object.freeze({ operationId, productId: normalized.productId, state: 'RECEIPTED', replayed: false, requestHash, result: output, receipt }); },
      });
    },
  });
}
