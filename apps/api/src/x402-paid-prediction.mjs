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

export const PREDICTION_PAID_PATH = '/v1/prediction/execute';
export const PREDICTION_MAX_BODY_BYTES = 262_144;
export const PREDICTION_REQUEST_SCHEMA_VERSION = 'prediction-operation-request.v1';
export const PREDICTION_RESULT_SCHEMA_VERSION = 'prediction-operation-result.v1';

const productByKind = Object.freeze({ markets: 'prediction.markets', market: 'prediction.market', compare: 'prediction.compare', history: 'prediction.history', signal: 'prediction.signal' });
const priceByProduct = Object.freeze({ 'prediction.markets': 10n, 'prediction.market': 2n, 'prediction.compare': 5n, 'prediction.history': 5n, 'prediction.signal': 5n });
const allowedByKind = Object.freeze({
  markets: ['kind', 'query', 'category', 'status', 'venues', 'limit', 'cursor'],
  market: ['kind', 'marketRef'], compare: ['kind', 'marketRefs'],
  history: ['kind', 'marketRef', 'afterSequence', 'limit'],
  signal: ['kind', 'marketRef', 'compareMarketRef'],
});

function object(value, code = 'prediction_http_request_invalid') {
  return assertOperationObject(value, code);
}
function exact(value, keys) {
  assertOperationKeys(value, keys, 'prediction_http_request_additional_property');
}
function marketRef(value) {
  if (typeof value !== 'string' || !/^pmkt_[a-f0-9]{32}$/u.test(value)) throw new TypeError('prediction_market_ref_invalid');
  return value;
}

export function normalizePredictionHttpRequest(value) {
  object(value); exact(value, ['kind', 'query', 'category', 'status', 'venues', 'limit', 'cursor', 'marketRef', 'marketRefs', 'afterSequence', 'compareMarketRef']);
  const kind = value.kind;
  if (!Object.hasOwn(productByKind, kind)) throw new TypeError('prediction_kind_invalid');
  exact(value, allowedByKind[kind]);
  let input;
  if (kind === 'markets') {
    if (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 100) throw new TypeError('prediction_limit_invalid');
    if (value.query !== undefined && (typeof value.query !== 'string' || value.query.trim().length < 1 || value.query.length > 500)) throw new TypeError('prediction_query_invalid');
    if (value.category !== undefined && (typeof value.category !== 'string' || value.category.trim().length < 1 || value.category.length > 100)) throw new TypeError('prediction_category_invalid');
    if (value.status !== undefined && !['open', 'closed', 'resolved', 'cancelled'].includes(value.status)) throw new TypeError('prediction_status_invalid');
    if (value.venues !== undefined && (!Array.isArray(value.venues) || value.venues.length < 1 || value.venues.length > 2 || new Set(value.venues).size !== value.venues.length || value.venues.some((venue) => !['polymarket', 'kalshi'].includes(venue)))) throw new TypeError('prediction_venues_invalid');
    if (value.cursor !== undefined && (typeof value.cursor !== 'string' || value.cursor.length < 1 || value.cursor.length > 512)) throw new TypeError('prediction_cursor_invalid');
    input = { kind, limit: value.limit, ...(value.query === undefined ? {} : { query: value.query.trim() }), ...(value.category === undefined ? {} : { category: value.category.trim() }), ...(value.status === undefined ? {} : { status: value.status }), ...(value.venues === undefined ? {} : { venues: Object.freeze([...value.venues]) }), ...(value.cursor === undefined ? {} : { cursor: value.cursor }) };
  } else if (kind === 'market') input = { kind, marketRef: marketRef(value.marketRef) };
  else if (kind === 'compare') {
    if (!Array.isArray(value.marketRefs) || value.marketRefs.length !== 2 || new Set(value.marketRefs).size !== 2) throw new TypeError('prediction_comparison_refs_invalid');
    input = { kind, marketRefs: Object.freeze(value.marketRefs.map(marketRef)) };
  } else if (kind === 'history') {
    if (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 100 || value.afterSequence !== undefined && (!Number.isSafeInteger(value.afterSequence) || value.afterSequence < 0)) throw new TypeError('prediction_history_query_invalid');
    input = { kind, marketRef: marketRef(value.marketRef), limit: value.limit, ...(value.afterSequence === undefined ? {} : { afterSequence: value.afterSequence }) };
  } else input = { kind, marketRef: marketRef(value.marketRef), ...(value.compareMarketRef === undefined ? {} : { compareMarketRef: marketRef(value.compareMarketRef) }) };
  return Object.freeze({ productId: productByKind[kind], input: Object.freeze(input) });
}

export function predictionHttpRequestHash(normalized) {
  return operationRequestHash({ resourcePath: PREDICTION_PAID_PATH, productId: normalized.productId, input: normalized.input });
}
export function predictionPublicPricing(normalized) {
  return fixedPublicPricing({
    priceVersion: `prediction-public-2026-08-04.1-${normalized.productId}`,
    productId: normalized.productId,
    amountAtomic: priceByProduct[normalized.productId]?.toString(),
  });
}

export const PREDICTION_DISCOVERY = Object.freeze({
  method: 'POST', bodyType: 'json',
  input: Object.freeze({ kind: 'markets', status: 'open', limit: 3 }),
  inputSchema: Object.freeze({ type: 'object', required: ['kind', 'limit'], additionalProperties: false, properties: Object.freeze({ kind: Object.freeze({ const: 'markets' }), query: Object.freeze({ type: 'string', minLength: 1, maxLength: 500 }), category: Object.freeze({ type: 'string', minLength: 1, maxLength: 100 }), status: Object.freeze({ enum: Object.freeze(['open', 'closed', 'resolved', 'cancelled']) }), venues: Object.freeze({ type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: Object.freeze({ enum: Object.freeze(['polymarket', 'kalshi']) }) }), limit: Object.freeze({ type: 'integer', minimum: 1, maximum: 100 }) }) }),
  output: Object.freeze({ example: Object.freeze({ productId: 'prediction.markets', state: 'RECEIPTED', replayed: false, result: Object.freeze({ output: Object.freeze({ kind: 'markets', state: 'available', markets: Object.freeze([]) }) }), receipt: Object.freeze({ settlement: Object.freeze({ status: 'settled' }) }) }), schema: Object.freeze({ type: 'object', additionalProperties: true }) }),
});

function validResult(value, request) {
  return verifiedRuntimeResult(value, request, PREDICTION_RESULT_SCHEMA_VERSION);
}

export function createX402PaidPredictionProcessor({ service, stateStore, runtime, acquireExecution } = {}) {
  if (!runtime || typeof runtime.execute !== 'function' || runtime.durable !== true) throw new TypeError('invalid_public_prediction_runtime');
  const processor = createX402PaidOperationProcessor({ service, stateStore, acquireExecution });
  return Object.freeze({ mode: processor.mode, durable: processor.durable,
    async process({ idempotencyKey, requestHash, operationId, normalized, paymentHeader, authorizationHeader, now }) {
      const pricing = predictionPublicPricing(normalized);
      /* Bounded by the customer charge, as crypto is and for the same reason:
       * prediction is served from indexed state, so supplier cost is 0. */
      const request = operationExecutionRequest({
        schemaVersion: PREDICTION_REQUEST_SCHEMA_VERSION,
        operationId,
        productId: normalized.productId,
        input: normalized.input,
        boundAmountAtomic: pricing.maximumCharge.amountAtomic,
        now,
        deadlineMs: 30_000,
      });
      return processor.process({ idempotencyKey, requestHash, operationId, productId: normalized.productId, executionInput: request, paymentHeader, authorizationHeader, now, pricing, resourcePath: PREDICTION_PAID_PATH, discovery: PREDICTION_DISCOVERY, overloadCode: 'prediction_overloaded',
        async execute(executionRequest) {
          const completed = await runtime.execute(executionRequest);
          if (!validResult(completed?.result, executionRequest)) throw new TypeError('prediction_runtime_result_invalid');
          return Object.freeze({
            output: completed.result,
            supplierCost: pricing.supplierCost,
            provenance: qualifiedProvenance({
              adapterId: 'adapter_prediction.qualified_source',
              qualificationIds: completed.qualificationIds,
              providerReferenceHash: completed.result.resultHash,
              code: 'prediction_runtime_result_invalid',
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
