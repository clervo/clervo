#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaDirectory = path.join(root, 'packages/contracts/schemas');
const outputDirectory = path.join(root, 'generated/public');
const contractModule = await import(pathToFileURL(path.join(root, 'dist/packages/contracts/src/index.js')));
const openAiChatCompat = await import(pathToFileURL(path.join(root, 'apps/api/src/openai-chat-compat.mjs')));
const anthropicMessagesCompat = await import(pathToFileURL(path.join(root, 'apps/api/src/anthropic-messages-compat.mjs')));
const openAiResponsesCompat = await import(pathToFileURL(path.join(root, 'apps/api/src/openai-responses-compat.mjs')));
const schemaVisibility = JSON.parse(await readFile(path.join(root, 'packages/catalog/schema-visibility.v1.json'), 'utf8'));
const registry = JSON.parse(await readFile(path.join(root, 'packages/catalog/platform-registry.v1.json'), 'utf8'));
const onboarding = JSON.parse(await readFile(path.join(root, 'packages/distribution/onboarding.v1.json'), 'utf8'));
const launchState = JSON.parse(await readFile(path.join(root, 'packages/catalog/launch-state.v1.json'), 'utf8'));
const liveRegistry = JSON.parse(await readFile(path.join(root, 'packages/catalog/live-registry.json'), 'utf8'));
const modelCatalog = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-model-catalog.v1.json'), 'utf8'));
const b7Freeze = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-b7-production-freeze.v1.json'), 'utf8'));
const b7Pricing = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-b7-commercial-pricing.v1.json'), 'utf8'));
if (b7Pricing.currency !== 'USDC' || b7Pricing.decimals !== 6 || !/^[1-9][0-9]*$/u.test(b7Pricing.minimumBillableAtomic ?? '')) throw new Error('ai_pricing_authority_invalid');
const aiMaximumChargeAtomic = b7Pricing.models
  .filter(({ billingMode }) => billingMode === 'metered')
  .map(({ customerPricing }) => BigInt(contractModule.estimateAiSupplierCost(contractModule.AI_MAXIMUM_AUTHORIZATION_USAGE_BOUNDS, customerPricing).amountAtomic))
  .reduce((maximum, amount) => amount > maximum ? amount : maximum, 0n);
if (aiMaximumChargeAtomic < BigInt(b7Pricing.minimumBillableAtomic)) throw new Error('ai_price_range_invalid');
const b7Inventory = Object.freeze({ canonicalModels: b7Freeze.inventory.canonicalModels, aliases: b7Freeze.inventory.aliases, callableIds: b7Freeze.inventory.callableModelIds });
const b7PublicModels = JSON.parse(await readFile(path.join(root, 'generated/b7-ai/public/models.json'), 'utf8'));
const currentPaidDiscoveryModel = b7PublicModels.data
  .filter(({ clervo }) => clervo.identityKind === 'canonical'
    && clervo.publicSellable === true
    && clervo.availability === 'available'
    && clervo.billingMode === 'metered'
    && clervo.productIds.includes('ai.chat'))
  .map(({ id }) => id)
  .sort()[0];
const currentFreeModels = b7PublicModels.data
  .filter(({ clervo }) => clervo.identityKind === 'canonical'
    && clervo.publicSellable === true
    && clervo.availability === 'available'
    && clervo.billingMode === 'free')
  .map(({ id }) => id)
  .sort();
const currentAliases = b7PublicModels.data.filter(({ clervo }) => clervo.identityKind === 'alias' && clervo.publicSellable === true).map(({ id }) => id).sort();
if (typeof currentPaidDiscoveryModel !== 'string') throw new Error('ai_paid_discovery_model_missing');
const OPENAI_CHAT_COMPLETIONS_PATH = openAiChatCompat.OPENAI_CHAT_COMPLETIONS_PATH;
const openAiChatProbeExample = Object.freeze({
  model: currentPaidDiscoveryModel,
  messages: [{ role: 'user', content: 'Explain in one sentence why idempotency matters for paid API retries.' }],
  stream: false,
  max_completion_tokens: 64,
});
const openAiChatDiscovery = openAiChatCompat.createOpenAiChatDiscoveryContract(openAiChatProbeExample);

const ANTHROPIC_MESSAGES_PATH = anthropicMessagesCompat.ANTHROPIC_MESSAGES_PATH;
const anthropicMessagesProbeExample = Object.freeze({
  model: currentPaidDiscoveryModel,
  max_tokens: 64,
  messages: [{ role: 'user', content: 'Explain in one sentence why idempotency matters for paid API retries.' }],
  stream: false,
});
const anthropicMessagesDiscovery = anthropicMessagesCompat.createAnthropicMessagesDiscoveryContract(anthropicMessagesProbeExample);

const OPENAI_RESPONSES_PATH = openAiResponsesCompat.OPENAI_RESPONSES_PATH;
const openAiResponsesProbeExample = Object.freeze({
  model: currentPaidDiscoveryModel,
  input: 'Explain in one sentence why idempotency matters for paid API retries.',
  max_output_tokens: 64,
  stream: false,
  store: false,
  text: Object.freeze({
    format: Object.freeze({
      type: 'text',
    }),
  }),
});
const openAiResponsesDiscovery = openAiResponsesCompat.createOpenAiResponsesDiscoveryContract(openAiResponsesProbeExample);

const distributionRelease = JSON.parse(await readFile(path.join(root, 'packages/distribution/release-targets.v1.json'), 'utf8'));
const predictionPricing = JSON.parse(await readFile(path.join(root, 'packages/catalog/prediction-product-pricing.v1.json'), 'utf8'));
const cryptoPricing = JSON.parse(await readFile(path.join(root, 'packages/catalog/crypto-product-pricing.v1.json'), 'utf8'));
const rpcPricing = JSON.parse(await readFile(path.join(root, 'packages/catalog/rpc-product-pricing.v1.json'), 'utf8'));

function componentName(fileName) {
  return fileName
    .replace('.schema.json', '')
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const COMMERCIAL_DESCRIPTION = 'Clervo lets software use AI models and agent tools with pay-per-use x402 payments, without managing separate provider accounts or API keys.';
const SHARED_PUBLIC_BOUNDARY = Object.freeze({
  schemaVersion: 'clervo.shared-public-boundary.v1',
  request: Object.freeze({
    mediaType: 'application/json',
    maximumHeaderBytes: 32_768,
    maximumHeaderCount: 64,
    maximumJsonDepth: 32,
    maximumJsonNodes: 20_000,
    maximumArrayItems: 1_000,
    maximumBodyBytesByPath: Object.freeze({
      '/v1/search/free': 16_384, '/v1/search/paid': 16_384,
      '/v1/ai/execute': 10_485_760, '/v1/chat/completions': 10_485_760,
      '/v1/messages': 10_485_760, '/v1/responses': 10_485_760,
      '/v1/sandbox/execute': 1_500_000, '/v1/rpc/execute': 262_144,
      '/v1/prediction/execute': 262_144, '/v1/crypto/execute': 262_144,
    }),
  }),
  rateLimitsPerMinute: Object.freeze({ free: 12, unpaidQuote: 30, paid: 180 }),
  quoteTtlSeconds: 180,
  deadlineMillisecondsByPath: Object.freeze({
    '/v1/search/free': 12_000, '/v1/search/paid': 15_000,
    '/v1/ai/execute': 120_000, '/v1/chat/completions': 120_000,
    '/v1/messages': 120_000, '/v1/responses': 120_000,
    '/v1/sandbox/execute': 75_000, '/v1/rpc/execute': 35_000,
    '/v1/prediction/execute': 35_000, '/v1/crypto/execute': 35_000,
  }),
  retry: Object.freeze({ overload: [429, 503], deadline: 504, useSameIdempotencyKeyAfterUnknownOutcome: true }),
});

function decimalAtomic(amountAtomic, decimals) {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(String(amountAtomic)) || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new TypeError('atomic_decimal_invalid');
  const padded = String(amountAtomic).padStart(decimals + 1, '0');
  return decimals === 0 ? padded : `${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`;
}

const publicProblemSchema = Object.freeze({
  type: 'object',
  description: 'Fail-closed RFC 9457-style problem details.',
  additionalProperties: true,
});
const publicResultSchema = Object.freeze({
  type: 'object',
  required: ['operationId', 'state', 'replayed', 'requestHash'],
  properties: {
    operationId: { type: 'string' },
    state: { const: 'RECEIPTED' },
    replayed: { type: 'boolean' },
    requestHash: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    receipt: { type: 'object', additionalProperties: true },
    output: {
      type: 'object',
      properties: {
        route: {
          type: 'object',
          required: ['routeId', 'qualificationId', 'servingAdapters', 'degraded', 'fallback', 'cost'],
          properties: {
            routeId: { type: 'string' }, qualificationId: { type: 'string' }, servingAdapters: { type: 'array', items: { type: 'string' } }, degraded: { type: 'boolean' }, fallback: { type: 'boolean' }, cost: { type: 'object', additionalProperties: true },
          },
          additionalProperties: true,
        },
      },
      additionalProperties: true,
    },
    execution: { type: 'object', additionalProperties: true },
  },
  additionalProperties: true,
});
const searchProbeExample = Object.freeze({
  query: 'current x402 protocol documentation',
  maxResults: 3,
  synthesize: false,
  language: 'en',
  region: 'US',
});
const searchProbeSchema = Object.freeze({
  type: 'object',
  required: ['query', 'synthesize'],
  properties: {
    query: { type: 'string', minLength: 1, maxLength: 2000, default: searchProbeExample.query },
    maxResults: { type: 'integer', minimum: 1, maximum: 10, default: searchProbeExample.maxResults },
    synthesize: { type: 'boolean', const: false, default: false },
    language: { type: 'string', pattern: '^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$', default: 'en' },
    region: { type: 'string', pattern: '^[A-Z]{2}$', default: 'US' },
  },
  additionalProperties: false,
});
const searchResearchProbeSchema = Object.freeze({
  ...searchProbeSchema,
  properties: {
    ...searchProbeSchema.properties,
    synthesize: { type: 'boolean', default: true, description: 'false selects fast evidence; true selects bounded deep Research with multi-source synthesis, page reading, citations, conflicts, and uncertainty.' },
  },
});
const aiProbeExample = Object.freeze({
  model: currentPaidDiscoveryModel,
  input: {
    kind: 'chat',
    messages: [{ role: 'user', content: 'Explain in one sentence why idempotency matters for paid API retries.' }],
    responseFormat: 'text',
    stream: false,
  },
  maximumOutputTokens: 64,
});
const aiChatProbeSchema = Object.freeze({
  type: 'object',
  required: ['model', 'input', 'maximumOutputTokens'],
  properties: {
    model: {
      type: 'string',
      minLength: 1,
      maxLength: 160,
      description: 'Canonical Clervo model ID or a published stable alias. GET /v1/models is the current catalog authority; catalog state, not this schema, determines callability.',
      examples: [currentPaidDiscoveryModel, currentAliases[0], currentFreeModels[0]].filter(Boolean),
    },
    input: {
      type: 'object',
      required: ['kind', 'messages', 'responseFormat', 'stream'],
      properties: {
        kind: { type: 'string', const: 'chat', default: 'chat' },
        messages: {
          type: 'array',
          minItems: 1,
          maxItems: 128,
          default: aiProbeExample.input.messages,
          items: {
            type: 'object',
            required: ['role', 'content'],
            properties: {
              role: { type: 'string', enum: ['user'], default: 'user' },
              content: { type: 'string', minLength: 1, maxLength: 100000, default: aiProbeExample.input.messages[0].content },
            },
            additionalProperties: false,
          },
        },
        responseFormat: { type: 'string', enum: ['text'], default: 'text' },
        stream: { type: 'boolean', const: false, default: false },
      },
      additionalProperties: false,
      default: aiProbeExample.input,
    },
    maximumOutputTokens: { type: 'integer', minimum: 1, maximum: contractModule.AI_MAXIMUM_OUTPUT_TOKENS, default: aiProbeExample.maximumOutputTokens },
  },
  additionalProperties: false,
});
const sandboxProbeExample = Object.freeze({
  command: Object.freeze(['node', '-e', "process.stdout.write('ready')"]),
  limits: Object.freeze({ cpuMillis: 5_000, memoryBytes: 268_435_456, processes: 16, diskBytes: 67_108_864, outputBytes: 65_536, artifactBytes: 1_048_576, wallTimeMs: 10_000 }),
});
const sandboxProbeSchema = Object.freeze({
  type: 'object', additionalProperties: false,
  oneOf: [
    { required: ['command'], not: { anyOf: [{ required: ['runtime'] }, { required: ['code'] }, { required: ['args'] }] } },
    { required: ['runtime', 'code'], not: { required: ['command'] } },
  ],
  properties: {
    command: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 4096 }, default: sandboxProbeExample.command },
    runtime: { type: 'string', enum: ['node', 'python'] },
    code: { type: 'string', minLength: 1, maxLength: 262_144 },
    args: { type: 'array', maxItems: 29, items: { type: 'string', minLength: 1, maxLength: 4_096 } },
    stdinBase64: { type: 'string', maxLength: 1_398_104 },
    files: { type: 'array', maxItems: 32, description: 'Decoded code, stdin, and file content share a 1 MiB aggregate envelope.', items: { type: 'object', required: ['path', 'contentBase64'], additionalProperties: false, properties: { path: { type: 'string', minLength: 1, maxLength: 256 }, contentBase64: { type: 'string', maxLength: 1_398_104 } } } },
    artifactPaths: { type: 'array', maxItems: 32, items: { type: 'object', required: ['path'], additionalProperties: false, properties: { path: { type: 'string', minLength: 1, maxLength: 256 }, filename: { type: 'string', minLength: 1, maxLength: 128 }, mimeType: { type: 'string', minLength: 3, maxLength: 129 } } } },
    limits: {
      type: 'object', additionalProperties: false, default: sandboxProbeExample.limits,
      properties: {
        cpuMillis: { type: 'integer', minimum: 1, maximum: 30_000 },
        memoryBytes: { type: 'integer', minimum: 16_777_216, maximum: 536_870_912 },
        processes: { type: 'integer', minimum: 1, maximum: 64 },
        diskBytes: { type: 'integer', minimum: 1_048_576, maximum: 1_073_741_824 },
        outputBytes: { type: 'integer', minimum: 1, maximum: 1_048_576 },
        artifactBytes: { type: 'integer', minimum: 1, maximum: 1_048_576 },
        wallTimeMs: { type: 'integer', minimum: 100, maximum: 60_000 },
      },
    },
  },
});
const rpcChains = Object.freeze(['eip155:1', 'eip155:10', 'eip155:56', 'eip155:137', 'eip155:8453', 'eip155:42161', 'eip155:43114', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']);
const rpcProbeExample = Object.freeze({ chainId: 'eip155:1', call: Object.freeze({ method: 'eth_chainId', params: Object.freeze([]) }) });
const rpcCallSchema = Object.freeze({
  type: 'object', required: ['method', 'params'], additionalProperties: false,
  properties: { method: { type: 'string', minLength: 2, maxLength: 64 }, params: {} },
});
const rpcProbeSchema = Object.freeze({
  oneOf: [
    { type: 'object', required: ['chainId', 'call'], additionalProperties: false, properties: { chainId: { enum: rpcChains }, call: rpcCallSchema, quorum: { type: 'integer', minimum: 1, maximum: 3 } } },
    { type: 'object', required: ['chainId', 'calls'], additionalProperties: false, properties: { chainId: { enum: rpcChains }, calls: { type: 'array', minItems: 1, maxItems: 20, items: rpcCallSchema }, quorum: { type: 'integer', minimum: 1, maximum: 3 } } },
  ],
});
const predictionProbeExample = Object.freeze({ kind: 'markets', status: 'open', limit: 3 });
const predictionMarketRefSchema = Object.freeze({ type: 'string', pattern: '^pmkt_[a-f0-9]{32}$' });
const predictionProbeSchema = Object.freeze({
  oneOf: [
    {
      type: 'object', required: ['kind'], additionalProperties: false,
      properties: {
        kind: { enum: ['search', 'markets'], default: 'markets' }, query: { type: 'string', minLength: 1, maxLength: 500 }, category: { type: 'string', minLength: 1, maxLength: 100 },
        status: { enum: ['open', 'closed', 'resolved', 'cancelled'], default: 'open' }, venues: { type: 'array', minItems: 1, maxItems: 16, uniqueItems: true, items: { enum: ['polymarket', 'kalshi', 'manifold', 'limitless'] } },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 3 }, cursor: { type: 'string', minLength: 1, maxLength: 2048 },
      },
    },
    { type: 'object', required: ['kind', 'marketRef'], additionalProperties: false, properties: { kind: { const: 'market' }, marketRef: predictionMarketRefSchema } },
    { type: 'object', required: ['kind', 'marketRefs'], additionalProperties: false, properties: { kind: { const: 'compare' }, marketRefs: { type: 'array', minItems: 2, maxItems: 2, uniqueItems: true, items: predictionMarketRefSchema } } },
    { type: 'object', required: ['kind', 'marketRef'], additionalProperties: false, properties: { kind: { const: 'history' }, marketRef: predictionMarketRefSchema, afterSequence: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 } } },
    { type: 'object', required: ['kind', 'marketRef'], additionalProperties: false, properties: { kind: { const: 'signal' }, marketRef: predictionMarketRefSchema, compareMarketRef: predictionMarketRefSchema } },
  ],
});
const cryptoProbeExample = Object.freeze({ kind: 'report', address: '0x0000000000000000000000000000000000000000', chains: Object.freeze(['eip155:1', 'eip155:8453']), lookbackDays: 30, limit: 50 });
const cryptoAddressSchema = Object.freeze({ type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' });
const cryptoChainsSchema = Object.freeze({ type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: Object.freeze({ enum: Object.freeze(['eip155:1', 'eip155:8453']) }) });
const cryptoProbeSchema = Object.freeze({
  oneOf: [
    ...['balances', 'tokens'].map((kind) => Object.freeze({ type: 'object', required: ['kind', 'address', 'chains'], additionalProperties: false, properties: { kind: { const: kind }, address: cryptoAddressSchema, chains: cryptoChainsSchema } })),
    ...['transactions', 'report'].map((kind) => Object.freeze({ type: 'object', required: ['kind', 'address', 'chains', 'lookbackDays', 'limit'], additionalProperties: false, properties: { kind: { const: kind }, address: cryptoAddressSchema, chains: cryptoChainsSchema, lookbackDays: { type: 'integer', minimum: 1, maximum: 90 }, limit: { type: 'integer', minimum: 1, maximum: 50 } } })),
  ],
});

function scannerSafeOperation(operation, { requestSchema, example, paymentInfo, free = false, tags = [] }) {
  const cloned = structuredClone(operation);
  cloned.parameters = cloned.parameters.map((parameter) => ({
    ...parameter,
    // This is deliberately a non-reusable illustration. Callers must mint
    // their own key for every logical operation.
    schema: (() => {
      const { default: _default, ...schema } = parameter.schema ?? {};
      return schema;
    })(),
    example: 'my-unique-key-550e8400',
  }));
  cloned.requestBody.content['application/json'] = { schema: requestSchema, example };
  for (const response of Object.values(cloned.responses)) {
    if (response?.content === undefined) continue;
    for (const media of Object.values(response.content)) media.schema = response === cloned.responses['200'] ? publicResultSchema : publicProblemSchema;
  }
  // Payment is not authentication. Every current route is unauthenticated at
  // the OpenAPI layer; payable routes declare payment through 402 and
  // x-payment-info only.
  cloned.security = [];
  cloned.tags = tags;
  if (paymentInfo !== undefined) cloned['x-payment-info'] = paymentInfo;
  if (paymentInfo !== undefined && cloned.responses['200'] !== undefined) {
    cloned.responses['200'].headers = {
      ...(cloned.responses['200'].headers ?? {}),
      'PAYMENT-RESPONSE': { description: 'Base64-encoded x402 v2 settlement response when x402 was used.', schema: { type: 'string', contentEncoding: 'base64' } },
      'Payment-Receipt': { description: 'MPP receipt when MPP was used.', schema: { type: 'string' } },
      'Idempotency-Replayed': { description: 'true when the completed logical operation was replayed without another charge.', schema: { type: 'string', enum: ['true'] } },
    };
  }
  return cloned;
}

// Lifecycle state and payment availability come from the live registry, which is
// generated by probing the deployed system. They are never read from a
// hand-written field, because a hand-written status line is a bug: it is what
// let the published site deny that the API takes payment while the API was
// quoting real prices.
//
// `launch-state.v1.json` is still authoritative for what it uniquely owns —
// identity, repository, and published package versions — none of which a probe
// can observe.
if (liveRegistry.schemaVersion !== 'clervo.live-registry.v1') throw new Error('live_registry_schema_unrecognized');
if (liveRegistry.handEditingProhibited !== true) throw new Error('live_registry_hand_editing_marker_missing');

const LIFECYCLE_STATES = new Set(['live', 'supply_paused', 'unavailable']);
const PROOF_LEVELS = new Set(['none', 'quote_observed_unpaid', 'paid_outcome_verified', 'externally_repeated']);

function publicReason(reason) {
  return reason === null || reason === undefined
    ? null
    : 'temporarily_unavailable';
}

function registryProduct(productId) {
  const product = liveRegistry.products.find(({ id }) => id === productId);
  if (product === undefined) throw new Error(`live_registry_product_missing:${productId}`);
  if (!LIFECYCLE_STATES.has(product.state)) throw new Error(`live_registry_state_invalid:${productId}`);
  if (!PROOF_LEVELS.has(product.proof)) throw new Error(`live_registry_proof_invalid:${productId}`);
  return product;
}

// Observed truth about each family. `state` determines public availability;
// qualification evidence stays available to compatibility consumers but does
// not drive customer-facing copy.
const observed = Object.fromEntries(
  ['search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto_intelligence']
    .map((id) => [id, registryProduct(id)]),
);
const observedLive = Object.fromEntries(
  Object.entries(observed).map(([id, product]) => [id, product.state === 'live']),
);

const publicApiFlags = [
  launchState.distribution.publicApi.publicCallable,
  launchState.distribution.publicApi.publicTraffic,
  launchState.distribution.publicApi.customerEndpointAvailable,
];
const publicSearch = observedLive.search;
const publicAi = observedLive.ai;
const openAiChatCompatibility = observed.ai.compatibilityRoutes?.find(({ protocol }) => protocol === 'openai_chat_completions') ?? null;
const publicOpenAiChat = publicAi
  && openAiChatCompatibility?.state === 'live'
  && openAiChatCompatibility.observedQuote !== null;
const anthropicMessagesCompatibility = observed.ai.compatibilityRoutes?.find(({ protocol }) => protocol === 'anthropic_messages') ?? null;
const publicAnthropicMessages = publicAi
  && anthropicMessagesCompatibility?.state === 'live'
  && anthropicMessagesCompatibility.observedQuote !== null;
const openAiResponsesCompatibility = observed.ai.compatibilityRoutes?.find(({ protocol }) => protocol === 'openai_responses') ?? null;
const publicOpenAiResponses = publicAi
  && openAiResponsesCompatibility?.state === 'live'
  && openAiResponsesCompatibility.observedQuote !== null;
const aiOperationIds = Object.freeze(['ai.chat', 'ai.embed', 'ai.image', 'ai.speech', 'ai.video', 'ai.music', 'ai.virtual_try_on']);
const publicSandbox = observedLive.sandbox;
const publicRpc = observedLive.rpc;
const publicPrediction = observedLive.prediction;
const publicCrypto = observedLive.crypto_intelligence;

// The internal registry also records qualification evidence. Public product
// language uses availability, routes, and payment behavior; the field remains
// in this compatibility projection for released clients that already read it.
const observedTruth = Object.values(observed)
  .map((product) => ({
    id: product.id,
    label: product.label,
    operations: product.operations,
    lifecycleState: product.state,
    proofLevel: product.proof,
    reason: publicReason(product.reason),
    expectedReturnAt: product.expectedReturnAt,
    publiclyReachable: product.publiclyReachable,
    observedPrice: product.observedQuote === null ? null : {
      amountAtomic: product.observedQuote.amountAtomic,
      asset: product.observedQuote.asset,
      network: product.observedQuote.network,
      priceVersion: product.observedQuote.priceVersion,
    },
    freeEntry: product.freeEntry === null ? null : {
      route: product.freeEntry.route,
      acceptsNaiveRequest: product.freeEntry.acceptsNaiveRequest,
    },
  }))
  .sort((left, right) => left.id.localeCompare(right.id));

const runtimeRelease = liveRegistry.deployment.releaseId;
if (!/^[a-f0-9]{40}$/u.test(runtimeRelease ?? '')) {
  throw new Error('live_registry_runtime_release_invalid');
}

const observedProvenance = {
  source: 'Clervo production probe',
  generatedBy: 'Clervo discovery generator',
  observedAt: liveRegistry.observedAt,
  proofLevels: liveRegistry.proofLevels,
  states: liveRegistry.states,
};

// Qualification and transaction evidence stays in the internal live registry.
// Public callers need current availability, routes, prices, and limitations—not
// Clervo's internal evidence classification.
const publicObservedTruth = observedTruth.map(({ proofLevel: _proofLevel, ...product }) => product);
const publicObservedProvenance = {
  observedAt: observedProvenance.observedAt,
  states: observedProvenance.states,
};

const publicApiStatus = Object.freeze({
  state: launchState.distribution.publicApi.publicCallable
    ? 'available'
    : 'unavailable',
  endpoint: launchState.distribution.publicApi.endpoint,
  publicCallable: launchState.distribution.publicApi.publicCallable,
  publicTraffic: launchState.distribution.publicApi.publicTraffic,
  customerEndpointAvailable: launchState.distribution.publicApi.customerEndpointAvailable,
});

// CDP Bazaar state as the prober observed it, keyed by resource URL. Absent for
// a resource the prober did not reach — rendered as `null`, never as a claim.
function bazaarStateFor(resource) {
  const entry = (liveRegistry.bazaar?.resources ?? []).find((item) => item.resource === resource);
  if (entry === undefined) return null;
  return {
    validatorAccepted: entry.valid,
    indexed: entry.indexed,
    indexActive: entry.indexActive,
    indexLastCrawledAt: entry.indexLastCrawledAt,
    failedChecks: entry.failedChecks,
  };
}

if (
  onboarding.schemaVersion !== 'clervo.distribution-onboarding.v1'
  || onboarding.publicCallable !== publicSearch
  || onboarding.paymentImplemented !== publicSearch
  || onboarding.journey.map(({ step }) => step).join(',') !== 'install,ask,fund,approve,result,receipt'
  || onboarding.recovery.map(({ code }) => code).join(',') !== 'insufficient_funds,wrong_network_or_asset,expired_quote,rejected,timeout,unknown_settlement'
  || onboarding.recovery.some(({ action, retry, problemCodes }) =>
    typeof action !== 'string'
    || action.length < 20
    || !['after_action', 'prohibited_until_reconciled'].includes(retry)
    || !Array.isArray(problemCodes)
    || problemCodes.length < 1
  )
) throw new Error('distribution_onboarding_invalid');

if (
  launchState.schemaVersion !== 'clervo.launch-state.v1'
  || launchState.repository.url !== 'https://github.com/clervo/clervo'
  || launchState.distribution.packages.state !== distributionRelease.publication.state
  || launchState.distribution.packages.items.some((item) => !distributionRelease.packages.some((published) => (
    published.registry === item.registry
    && published.name === item.name
    && published.version === item.version
  )))
  // Drift detector, not a source of truth: the deployed system decides whether
  // the API is publicly callable, and this asserts the hand-written record has
  // not silently disagreed with it.
  || publicApiFlags.some((value) => value !== publicSearch)
  || launchState.products.length !== 6
  || launchState.products.some(({ id }) => !registry.pillars.some(({ pillarId }) => pillarId === id))
) throw new Error('launch_state_invalid');
const projection = publicSearch
  ? contractModule.PUBLIC_SEARCH_DISTRIBUTION_PROJECTION
  : contractModule.DEFAULT_DISTRIBUTION_PROJECTION;

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(path.join(outputDirectory, 'schemas', contractModule.CONTRACT_VERSION), { recursive: true });

const schemas = {};
const allSchemaFiles = (await readdir(schemaDirectory)).filter((name) => name.endsWith('.schema.json')).sort();
// ProductScope is internal release bookkeeping, not an invocation contract.
// It remains available to repository tooling but must not be republished as
// part of the external machine surface merely because its historical schema
// visibility predates the public/private discovery split.
const projectedSchemaFiles = contractModule.publicSchemaFiles(schemaVisibility, allSchemaFiles)
  .filter((name) => name !== 'product-scope.schema.json');
for (const fileName of projectedSchemaFiles) {
  const source = await readFile(path.join(schemaDirectory, fileName), 'utf8');
  const schema = JSON.parse(source);
  const declaration = schemaVisibility.schemas.find(({ file }) => file === fileName);
  if (!declaration || declaration.schemaId !== schema.$id) throw new Error(`schema visibility identity mismatch: ${fileName}`);
  if (fileName === 'search-http-result.schema.json') {
    schema.properties.productId.enum = ['search.web', 'search.answer'];
    schema.properties.productId.description = 'Callable public Research operation identity: search.web for fast evidence or search.answer for deep cited synthesis.';
  }
  if (fileName === 'search-http-request.schema.json') {
    schema.properties.synthesize.default = false;
    schema.properties.synthesize.description = 'Public HTTP omission selects false for fast evidence. Set true for bounded deep Research with multi-source synthesis and citations.';
  }
  schemas[componentName(fileName)] = schema;
  await writeFile(path.join(outputDirectory, 'schemas', contractModule.CONTRACT_VERSION, fileName), stableJson(schema));
}

const openapi = contractModule.createOpenApiDocument(schemas, projection);
const discovery = contractModule.createDiscoveryDocument(projection);
// Discovery documents are deployment artifacts, not frozen release prose. Tie
// their visible versions to the observed release day so clients can detect a
// stale edge document without changing the wire-contract version used by
// operation receipts and schemas.
const discoveryArtifactVersion = `${liveRegistry.observedAt.slice(0, 10)}.1`;
discovery.discoveryVersion = discoveryArtifactVersion;
discovery.contractVersion = discoveryArtifactVersion;
discovery.catalogVersion = discoveryArtifactVersion;
let llms = contractModule.createLlmsText(projection);
if (publicSearch) {
  openapi.servers = [{ url: 'https://api.clervo.dev' }];
  openapi.info.contact = { name: 'Clervo', email: 'mo@clervo.dev', url: 'https://github.com/clervo/clervo' };
  openapi.info['x-guidance'] = 'Use POST /v1/search/free for a bounded no-payment sample. Paid routes return x402 v2 exact-scheme and MPP EVM charge challenges before execution. x-payment-info prices are decimal USD discovery values; PAYMENT-REQUIRED carries the binding USDC amount in token atomic units, including a request-specific maximum where pricing is dynamic. Supply the required JSON body and a stable Idempotency-Key, inspect the exact payment requirements, and send either PAYMENT-SIGNATURE for x402 or Authorization: Payment for MPP only after approval. Reuse the same key to recover or replay a completed result without a second charge. Every unsupported capability fails closed.';
  openapi.info['x-agentcash-guidance'] = { llmsTxtUrl: 'https://api.clervo.dev/llms.txt' };
  openapi.paths['/v1/search/free'].post = scannerSafeOperation(openapi.paths['/v1/search/free'].post, {
    requestSchema: searchProbeSchema,
    example: searchProbeExample,
    free: true,
    tags: ['Search'],
  });
  openapi.paths['/v1/search/paid'].post = scannerSafeOperation(openapi.paths['/v1/search/paid'].post, {
    requestSchema: searchResearchProbeSchema,
    example: { ...searchProbeExample, synthesize: true },
    paymentInfo: {
      price: { mode: 'fixed', currency: 'USD', amount: '0.012000' },
      protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
    },
    tags: ['Search'],
  });
  openapi.paths['/v1/search/paid'].post.responses['200'].description = 'Fast cited Search or deep multi-source Research completed or replayed';
}
if (publicAi) {
  openapi.info.title = 'Clervo Search and AI API';
  openapi.info.description = `Public Search and provider-neutral AI across ${b7Inventory.canonicalModels} canonical models and ${b7Inventory.aliases} stable aliases. The authoritative model catalog publishes capability, availability, health, free/paid state, and request-derived pricing; unsupported model-capability combinations fail closed.`;
  openapi.paths['/v1/ai/execute'] = {
    post: {
      summary: 'Execute a provider-neutral Clervo AI model',
      description: 'Free models execute without payment within the published quota. Paid models return an exact request-bound x402 or MPP quote before execution. A completed idempotency key replays the same result and, when paid, the same receipt without another charge.',
      operationId: 'aiExecute',
      parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, description: 'Stable replay key. When omitted before payment, the service generates one and returns it in the response headers.', schema: { type: 'string', minLength: 8, maxLength: 128 } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AiHttpRequest' } } } },
      responses: {
        200: { description: 'Free or paid AI operation completed or replayed; paid results include truthful usage and settlement receipt', content: { 'application/json': { schema: { $ref: '#/components/schemas/AiHttpResult' } } } },
        400: { description: 'Invalid bounded AI request', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
        402: { description: 'x402 or MPP payment required', headers: { 'PAYMENT-REQUIRED': { schema: { type: 'string', contentEncoding: 'base64' } }, 'WWW-Authenticate': { schema: { type: 'string' } } } },
        409: { description: 'Idempotency or quote conflict', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
        404: { description: 'Requested model ID is not present in the current catalog', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
        422: { description: 'Known model is unavailable, unsellable, or incompatible with the requested input kind', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
        429: { description: 'Published free-tier quota exhausted; the request is not silently converted into a paid operation', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
        503: { description: 'No qualified route, capacity, or settlement path is available', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
      },
    },
  };
  openapi.paths['/v1/models'] = {
    get: {
      summary: 'List the authoritative provider-neutral Clervo AI catalog',
      description: `Returns ${b7Inventory.canonicalModels} frozen canonical model IDs and ${b7Inventory.aliases} stable aliases with capabilities, availability, health, free/paid state, pricing, and commerce metadata. Canonical IDs never silently substitute another model.`,
      operationId: 'aiListModels',
      security: [],
      responses: {
        200: {
          description: 'OpenAI-compatible model list with authoritative Clervo commercial metadata',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['object', 'data', 'clervo'],
                properties: {
                  object: { const: 'list' },
                  data: { type: 'array', items: { type: 'object', required: ['id', 'object', 'owned_by', 'clervo'] } },
                  clervo: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
  };
  if (publicOpenAiChat) {
    openapi.paths[OPENAI_CHAT_COMPLETIONS_PATH] = {
      post: {
        summary: 'Create an OpenAI-compatible chat completion',
        description: 'Thin OpenAI Chat Completions compatibility adapter over Clervo AI execution. stream=true returns SSE after the operation completes; paid SSE begins only after successful settlement. Unsupported non-default controls still fail closed.',
        operationId: 'openAiChatCompletions',
        security: [],
        tags: ['AI'],
        parameters: [{
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          description: 'Stable replay key. When omitted before payment, the service generates one and returns it in the response headers.',
          schema: { type: 'string', minLength: 8, maxLength: 128 },
        }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: openAiChatDiscovery.inputSchema,
              example: openAiChatDiscovery.input,
            },
          },
        },
        responses: {
          200: {
            description: 'OpenAI-compatible chat completion',
            headers: {
              'PAYMENT-RESPONSE': { description: 'Base64-encoded x402 v2 settlement response when x402 was used.', schema: { type: 'string', contentEncoding: 'base64' } },
              'Payment-Receipt': { description: 'MPP receipt when MPP was used.', schema: { type: 'string' } },
              'Idempotency-Replayed': { description: 'true when the completed logical operation was replayed without another charge.', schema: { type: 'string', enum: ['true'] } },
            },
            content: {
              'application/json': {
                schema: openAiChatDiscovery.output.schema,
                example: openAiChatDiscovery.output.example,
              },
            },
          },
          400: { description: 'Invalid compatibility request', content: { 'application/problem+json': { schema: publicProblemSchema } } },
          402: { description: 'x402 or MPP payment required', headers: { 'PAYMENT-REQUIRED': { schema: { type: 'string', contentEncoding: 'base64' } }, 'WWW-Authenticate': { schema: { type: 'string' } } } },
          404: { description: 'Requested model ID is not present in the current catalog', content: { 'application/problem+json': { schema: publicProblemSchema } } },
          409: { description: 'Idempotency or quote conflict', content: { 'application/problem+json': { schema: publicProblemSchema } } },
          422: { description: 'Unsupported compatibility behavior or unavailable model', content: { 'application/problem+json': { schema: publicProblemSchema } } },
          429: { description: 'Published free-tier quota exhausted', content: { 'application/problem+json': { schema: publicProblemSchema } } },
          503: { description: 'No qualified route, capacity, or settlement path is available', content: { 'application/problem+json': { schema: publicProblemSchema } } },
        },
        'x-payment-info': {
          price: {
            mode: 'dynamic',
            currency: 'USD',
            min: decimalAtomic(b7Pricing.minimumBillableAtomic, b7Pricing.decimals),
            max: decimalAtomic(aiMaximumChargeAtomic, b7Pricing.decimals),
          },
          protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
        },
      },
    };
  }

  if (publicAnthropicMessages) {
    openapi.paths[ANTHROPIC_MESSAGES_PATH] = {
      post: {
        summary: 'Create an Anthropic-compatible message',
        description: 'Thin Anthropic Messages compatibility adapter over Clervo AI execution. Text-only user/assistant messages and top-level system text are supported. stream=true returns SSE after the operation completes; paid SSE begins only after successful settlement. Unsupported richer content, tools, thinking, and non-default controls still fail closed.',
        operationId: 'anthropicMessages',
        security: [],
        tags: ['AI'],
        parameters: [{
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          description: 'Stable replay key. When omitted before payment, the service generates one and returns it in the response headers.',
          schema: { type: 'string', minLength: 8, maxLength: 128 },
        }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: anthropicMessagesDiscovery.inputSchema,
              example: anthropicMessagesDiscovery.input,
            },
          },
        },
        responses: {
          200: {
            description: 'Anthropic-compatible Message response',
            headers: {
              'PAYMENT-RESPONSE': { description: 'Base64-encoded x402 v2 settlement response when x402 was used.', schema: { type: 'string', contentEncoding: 'base64' } },
              'Payment-Receipt': { description: 'MPP receipt when MPP was used.', schema: { type: 'string' } },
              'Idempotency-Replayed': { description: 'true when the completed logical operation was replayed without another charge.', schema: { type: 'string', enum: ['true'] } },
            },
            content: {
              'application/json': {
                schema: anthropicMessagesDiscovery.output.schema,
                example: anthropicMessagesDiscovery.output.example,
              },
            },
          },
          400: { description: 'Invalid compatibility request', content: { 'application/problem+json': { schema: publicProblemSchema } } },
          402: { description: 'x402 or MPP payment required', headers: { 'PAYMENT-REQUIRED': { schema: { type: 'string', contentEncoding: 'base64' } }, 'WWW-Authenticate': { schema: { type: 'string' } } } },
          404: { description: 'Requested model ID is not present in the current catalog', content: { 'application/problem+json': { schema: publicProblemSchema } } },
          409: { description: 'Idempotency or quote conflict', content: { 'application/problem+json': { schema: publicProblemSchema } } },
          422: { description: 'Unsupported compatibility behavior or unavailable model', content: { 'application/problem+json': { schema: publicProblemSchema } } },
          429: { description: 'Published free-tier quota exhausted', content: { 'application/problem+json': { schema: publicProblemSchema } } },
          503: { description: 'No qualified route, capacity, or settlement path is available', content: { 'application/problem+json': { schema: publicProblemSchema } } },
        },
        'x-payment-info': {
          price: {
            mode: 'dynamic',
            currency: 'USD',
            min: decimalAtomic(b7Pricing.minimumBillableAtomic, b7Pricing.decimals),
            max: decimalAtomic(aiMaximumChargeAtomic, b7Pricing.decimals),
          },
          protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
        },
      },
    };
  }

  if (publicOpenAiResponses) {
    openapi.paths[OPENAI_RESPONSES_PATH] = {
      post: {
        summary: 'Create an OpenAI-compatible response',
        description: 'Thin stateless OpenAI Responses compatibility adapter over Clervo AI execution. store defaults to false when omitted; store=true remains unsupported. stream=true returns SSE after the operation completes; paid SSE begins only after successful settlement. Stateful continuation, tools, background execution, and unsupported controls fail closed.',
        operationId: 'openAiResponses',
        security: [],
        tags: ['AI'],
        parameters: [{
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          description: 'Stable replay key. When omitted before payment, the service generates one and returns it in the response headers.',
          schema: {
            type: 'string',
            minLength: 8,
            maxLength: 128,
          },
        }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: openAiResponsesDiscovery.inputSchema,
              example: openAiResponsesDiscovery.input,
            },
          },
        },
        responses: {
          200: {
            description: 'OpenAI-compatible Response object',
            headers: {
              'PAYMENT-RESPONSE': {
                description: 'Base64-encoded x402 v2 settlement response when x402 was used.',
                schema: {
                  type: 'string',
                  contentEncoding: 'base64',
                },
              },
              'Payment-Receipt': {
                description: 'MPP receipt when MPP was used.',
                schema: {
                  type: 'string',
                },
              },
              'Idempotency-Replayed': {
                description: 'true when the completed logical operation was replayed without another charge.',
                schema: {
                  type: 'string',
                  enum: ['true'],
                },
              },
            },
            content: {
              'application/json': {
                schema: openAiResponsesDiscovery.output.schema,
                example: openAiResponsesDiscovery.output.example,
              },
            },
          },
          400: {
            description: 'Invalid compatibility request',
            content: {
              'application/problem+json': {
                schema: publicProblemSchema,
              },
            },
          },
          402: {
            description: 'x402 or MPP payment required',
            headers: {
              'PAYMENT-REQUIRED': {
                schema: {
                  type: 'string',
                  contentEncoding: 'base64',
                },
              },
              'WWW-Authenticate': {
                schema: {
                  type: 'string',
                },
              },
            },
          },
          404: {
            description: 'Requested model ID is not present in the current catalog',
            content: {
              'application/problem+json': {
                schema: publicProblemSchema,
              },
            },
          },
          409: {
            description: 'Idempotency or quote conflict',
            content: {
              'application/problem+json': {
                schema: publicProblemSchema,
              },
            },
          },
          422: {
            description: 'Unsupported Responses behavior, unavailable model, or stateful request',
            content: {
              'application/problem+json': {
                schema: publicProblemSchema,
              },
            },
          },
          429: {
            description: 'Published free-tier quota exhausted',
            content: {
              'application/problem+json': {
                schema: publicProblemSchema,
              },
            },
          },
          503: {
            description: 'No qualified route, capacity, or settlement path is available',
            content: {
              'application/problem+json': {
                schema: publicProblemSchema,
              },
            },
          },
        },
        'x-payment-info': {
          price: {
            mode: 'dynamic',
            currency: 'USD',
            min: decimalAtomic(
              b7Pricing.minimumBillableAtomic,
              b7Pricing.decimals,
            ),
            max: decimalAtomic(
              aiMaximumChargeAtomic,
              b7Pricing.decimals,
            ),
          },
          protocols: [
            { x402: {} },
            {
              mpp: {
                method: 'evm',
                intent: 'charge',
                currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              },
            },
          ],
        },
      },
    };
  }

  // Compatibility SSE response documentation.
  // The payment/execution pipeline completes before these frames are emitted;
  // this is protocol streaming compatibility, not low-latency token passthrough.
  for (const [enabled, compatibilityPath, protocol] of [
    [publicOpenAiChat, OPENAI_CHAT_COMPLETIONS_PATH, 'OpenAI Chat Completions'],
    [publicAnthropicMessages, ANTHROPIC_MESSAGES_PATH, 'Anthropic Messages'],
    [publicOpenAiResponses, OPENAI_RESPONSES_PATH, 'OpenAI Responses'],
  ]) {
    if (!enabled) continue;
    openapi.paths[compatibilityPath].post.responses[200].content['text/event-stream'] = {
      schema: {
        type: 'string',
        description: `${protocol} SSE emitted after execution completes; paid streams begin only after settlement succeeds.`,
      },
    };
  }

  openapi.paths['/v1/ai/execute'].post = scannerSafeOperation(openapi.paths['/v1/ai/execute'].post, {
    requestSchema: aiChatProbeSchema,
    example: aiProbeExample,
    paymentInfo: {
      price: {
        mode: 'dynamic',
        currency: 'USD',
        min: decimalAtomic(b7Pricing.minimumBillableAtomic, b7Pricing.decimals),
        max: decimalAtomic(aiMaximumChargeAtomic, b7Pricing.decimals),
      },
      protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
    },
    tags: ['AI'],
  });
  openapi.paths['/v1/models'].get.tags = ['AI'];
  openapi['x-clervo-status'].operationIds = [...openapi['x-clervo-status'].operationIds, ...aiOperationIds];
  discovery.description = `Machine-readable public Search and complete provider-neutral AI catalog. ${b7Inventory.callableIds} stable model IDs are discoverable and callable through one normalized free-or-paid contract without exposing suppliers.`;
  discovery.products.push({
    productId: 'ai', operationId: 'ai.execute', operationIds: aiOperationIds, title: 'Clervo AI model catalog',
    summary: 'Provider-neutral chat, embeddings, image, speech, video, music, and virtual try-on with stable identities, normalized results, truthful usage, paid receipts, and no-charge replay.',
    lifecycle: observed.ai.proof === 'paid_outcome_verified' ? 'production' : 'preview', publicAvailable: true, deliveryModes: ['sync'],
    selection: { model: 'Stable canonical Clervo model ID or a published alias contract.', catalog: '/v1/models' },
    pricing: { model: 'authoritative_per_model_usage_pricing', displayPrice: null, freeAndPaid: true, maximumChargeRequiredForPaid: true, priceVersion: b7Pricing.revision },
    routes: {
      catalog: '/v1/models',
      execute: '/v1/ai/execute',
      ...(publicOpenAiChat ? { openAiChatCompletions: OPENAI_CHAT_COMPLETIONS_PATH } : {}),
      ...(publicAnthropicMessages ? { anthropicMessages: ANTHROPIC_MESSAGES_PATH } : {}),
      ...(publicOpenAiResponses ? { openAiResponses: OPENAI_RESPONSES_PATH } : {}),
    },
    payment: { freeModelsRequirePayment: false, paidModels: ['x402', 'mpp'], challengeImplemented: true, payable: true, mockExecutionAvailableByInjectionOnly: false },
    commercialProof: observed.ai.proof === 'paid_outcome_verified',
  });
  discovery.limitations = [
    `The catalog contains ${b7Inventory.canonicalModels} frozen canonical models and ${b7Inventory.aliases} aliases; it is not an open-ended promise to add or substitute models.`,
    'AI catalog prices are authoritative usage rates; a paid request returns the binding request-specific maximum charge before settlement.',
    observed.ai.proof === 'paid_outcome_verified' ? 'A bounded paid AI outcome, receipt, accounting record, and no-charge replay are verified.' : 'The AI production catalog and payment challenge are verified; a settled paid AI result remains pending.',
    'Secure Sandbox, RPC, Prediction, and Crypto Intelligence remain publicly unavailable.',
  ];
  llms = llms
    .replace('raw cited Search is callable; synthesized Search, AI, Secure Sandbox, RPC, Prediction, and Crypto Intelligence are unavailable', 'fast cited Search and paid deep Research, plus the complete provider-neutral Clervo AI catalog, are callable; Secure Sandbox, RPC, Prediction, and Crypto Intelligence are unavailable')
    .replace('Projected operation IDs: search.web, search.answer', `Projected operation IDs: search.web, search.answer, ${aiOperationIds.join(', ')}`)
    .replace('x402 public payment: available for search.web at a maximum charge of 0.006 USDC on Base', 'x402 public payment: available for search.web at a maximum charge of 0.006 USDC and for paid AI requests through an exact request-derived maximum-charge quote on Base; published free AI models require no payment');
  if (publicOpenAiChat) {
    llms += [
      '',
      '## OpenAI Chat Completions compatibility',
      '',
      `- \`POST ${projection.publicBaseUrl}${OPENAI_CHAT_COMPLETIONS_PATH}\`: OpenAI Chat Completions-compatible adapter with SSE support over the canonical Clervo AI execution stack.`,
      '- The same model catalog, request-derived pricing, x402/MPP payment boundary, idempotency, settlement, and replay behavior apply.',
      '- `stream: true` returns protocol-compatible SSE after the operation completes; paid streams begin only after settlement succeeds.',
      '',
    ].join('\n');
  }
  if (publicAnthropicMessages) {
    llms += [
      '',
      '## Anthropic Messages compatibility',
      '',
      `- \`POST ${projection.publicBaseUrl}${ANTHROPIC_MESSAGES_PATH}\`: Anthropic Messages-compatible adapter with SSE support over the canonical Clervo AI execution stack.`,
      '- Supports text-only user/assistant messages plus top-level system text; richer content blocks, tools, thinking, and unsupported non-default controls fail closed with 422.',
      '- The same model catalog, request-derived pricing, x402/MPP payment boundary, idempotency, settlement, and replay behavior apply.',
      '- `stream: true` returns protocol-compatible SSE after the operation completes; paid streams begin only after settlement succeeds.',
      '',
    ].join('\n');

  }
  if (publicOpenAiResponses) {
    llms += [
      '',
      '## OpenAI Responses compatibility',
      '',
      `- \`POST ${projection.publicBaseUrl}${OPENAI_RESPONSES_PATH}\`: stateless OpenAI Responses-compatible adapter with SSE support over the canonical Clervo AI execution stack.`,
      '- Supports string input, bounded text message input, optional instructions, max_output_tokens, and text/json_object output formatting.',
      '- `store` defaults to `false` when omitted; `store: true`, stored response state, previous-response continuation, conversations, tools, background execution, and reasoning controls fail closed with 422.',
      '- The same model catalog, request-derived pricing, x402/MPP payment boundary, idempotency, settlement, and replay behavior apply.',
      '- `stream: true` returns protocol-compatible SSE after the operation completes; paid streams begin only after settlement succeeds.',
      '',
    ].join('\n');
  }
}
if (publicSandbox) {
  openapi.info.title = 'Clervo Search, AI, and Secure Sandbox API';
  openapi.info.description = 'Public raw Search plus bounded paid AI chat and one-shot gVisor Sandbox previews. Every paid route is quote-bound, receipt-bearing, and replay-safe.';
  openapi.paths['/v1/sandbox/execute'] = {
    post: {
      summary: 'Request or settle a bounded one-shot Secure Sandbox execution',
      description: 'Runs one Node.js or Python program (or a raw command) in the pinned qualified gVisor image with no network, strict resources, bounded files and returned artifacts, cleanup, a receipt, and no-charge replay. Generated artifacts are hashed but explicitly not malware-scanned. The short class is 0.010 USDC; larger bounded requests quote the standard class. Sessions and artifact retrieval are not yet public.',
      operationId: 'sandboxExecute',
      parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 128 } }],
      requestBody: { required: true, content: { 'application/json': { schema: sandboxProbeSchema } } },
      responses: {
        200: { description: 'Sandbox execution completed or replayed', content: { 'application/json': { schema: publicResultSchema } } },
        400: { description: 'Invalid bounded Sandbox request', content: { 'application/problem+json': { schema: publicProblemSchema } } },
        402: { description: 'x402 or MPP payment required', headers: { 'PAYMENT-REQUIRED': { schema: { type: 'string', contentEncoding: 'base64' } }, 'WWW-Authenticate': { schema: { type: 'string' } } } },
        409: { description: 'Idempotency, quote, or execution reconciliation conflict', content: { 'application/problem+json': { schema: publicProblemSchema } } },
        503: { description: 'Capacity, execution, cleanup, or settlement path unavailable', content: { 'application/problem+json': { schema: publicProblemSchema } } },
      },
    },
  };
  openapi.paths['/v1/sandbox/execute'].post = scannerSafeOperation(openapi.paths['/v1/sandbox/execute'].post, {
    requestSchema: sandboxProbeSchema,
    example: sandboxProbeExample,
    paymentInfo: {
      price: { mode: 'dynamic', currency: 'USD', min: '0.010000', max: '0.060000' },
      protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
    },
    tags: ['Sandbox'],
  });
  openapi['x-clervo-status'].operationIds = [...openapi['x-clervo-status'].operationIds, 'sandbox.run'];
  discovery.description = 'Machine-readable public Search, paid AI chat, and paid one-shot Secure Sandbox. Each published operation returns real output through the production path; unsupported operations fail closed.';
  discovery.products.push({
    productId: 'sandbox.run', operationId: 'sandbox.run', title: 'Secure one-shot code execution',
    summary: 'Bounded Node.js execution in a pinned gVisor image with no network, strict resource ceilings, cleanup, receipt, and no-charge replay.',
    lifecycle: 'preview', publicAvailable: true, deliveryModes: ['sync'],
    selection: { image: 'Pinned qualified sandbox.nodejs-24-python3-12 image; caller cannot select an arbitrary image.' },
    pricing: { model: 'class_derived_quote', displayPrice: { asset: 'USDC', amountAtomic: '10000', decimals: 6 }, maximumChargeRequired: true, priceVersion: 'sandbox-run-short-2026-08-09.1', priceRange: { minimumAtomic: '10000', maximumAtomic: '60000' } },
    routes: { paidChallenge: '/v1/sandbox/execute' },
    payment: { challengeImplemented: true, payable: true, mockExecutionAvailableByInjectionOnly: false },
    commercialProof: false,
  });
  discovery.limitations = [
    'Raw cited Search, bounded paid AI chat, and bounded paid one-shot Secure Sandbox execution are publicly callable previews.',
    'The Sandbox has one qualified execution node; high availability, sessions, arbitrary images, network access, and public artifact retrieval are not claimed.',
    'Deep Research is bounded and callable; AI media, RPC, Prediction, and Crypto Intelligence remain unavailable.',
    'The Sandbox production origin, useful gVisor output, replay, and cleanup are verified; a bounded paid Sandbox proof remains pending.',
    'No external customer payment, revenue, or demand is claimed.',
  ];
  llms += '\n## Secure Sandbox preview\n\n- `POST /v1/sandbox/execute`: class-derived 0.010000–0.060000 USDC quote on Base for one bounded Node.js 24 or Python 3.12 gVisor execution.\n- Requests may include bounded stdin and files and may return requested artifacts; decoded code, stdin, and files share a 1 MiB envelope, artifact transport is capped at 1 MiB, and returned artifacts are hashed but not malware-scanned.\n- The short class is capped at 5 CPU seconds, 256 MiB, 16 processes, 64 MiB disk, 64 KiB output, 1 MiB artifacts, and 10 seconds wall time; larger requests use the standard class without weaker ceilings.\n- The public operation is one-shot, no-network, resource-capped, receipt-bearing, and replay-safe. Sessions and artifact retrieval remain unavailable.\n';
}
if (publicRpc) {
  const priceByProduct = new Map(rpcPricing.products.map((product) => [product.productId, product]));
  const publicRpcProducts = [
    ['rpc.call', 'Call one supported-chain RPC method', 'Execute one allowlisted read-only JSON-RPC method against a healthy route with failover.'],
    ['rpc.batch', 'Batch supported-chain RPC reads', 'Execute up to 20 allowlisted read-only JSON-RPC calls on one supported chain.'],
  ];
  openapi.paths['/v1/rpc/execute'] = {
    post: {
      summary: 'Request or settle a bounded Multi-chain RPC read',
      description: 'Serves allowlisted read-only methods across Ethereum, Optimism, BNB Smart Chain, Polygon, Base, Arbitrum One, Avalanche C-Chain, and Solana. Archive reads and transaction broadcast are not public operations.',
      operationId: 'rpcExecute',
      parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 128 } }],
      requestBody: { required: true, content: { 'application/json': { schema: rpcProbeSchema } } },
      responses: {
        200: { description: 'RPC read completed or replayed', content: { 'application/json': { schema: publicResultSchema } } },
        400: { description: 'Invalid chain, method, batch, quorum, or body', content: { 'application/problem+json': { schema: publicProblemSchema } } },
        402: { description: 'x402 or MPP payment required', headers: { 'PAYMENT-REQUIRED': { schema: { type: 'string', contentEncoding: 'base64' } }, 'WWW-Authenticate': { schema: { type: 'string' } } } },
        409: { description: 'Idempotency or quote conflict', content: { 'application/problem+json': { schema: publicProblemSchema } } },
        503: { description: 'Healthy RPC supply, capacity, or settlement is unavailable', content: { 'application/problem+json': { schema: publicProblemSchema } } },
      },
    },
  };
  openapi.paths['/v1/rpc/execute'].post = scannerSafeOperation(openapi.paths['/v1/rpc/execute'].post, {
    requestSchema: rpcProbeSchema,
    example: rpcProbeExample,
    paymentInfo: {
      price: { mode: 'dynamic', currency: 'USD', min: '0.001000', max: '0.020000' },
      protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
    },
    tags: ['RPC'],
  });
  openapi.paths['/v1/rpc/chains'] = {
    get: {
      summary: 'Read current health for all supported RPC chains', operationId: 'rpcListChains', security: [], tags: ['RPC'],
      responses: {
        200: { description: 'Every advertised chain has at least one semantically healthy route', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
        503: { description: 'One or more advertised chains could not be verified healthy', content: { 'application/problem+json': { schema: publicProblemSchema } } },
      },
    },
  };
  openapi['x-clervo-status'].operationIds = [...openapi['x-clervo-status'].operationIds, ...publicRpcProducts.map(([productId]) => productId)];
  for (const [productId, title, summary] of publicRpcProducts) {
    const price = priceByProduct.get(productId);
    if (price?.listingStatus !== 'sellable' || price.customerPriceMicrousd !== 1000) throw new Error(`public_rpc_price_invalid:${productId}`);
    discovery.products.push({
      productId, operationId: productId, title, summary,
      lifecycle: 'preview', publicAvailable: true, deliveryModes: ['sync'],
      selection: { chains: rpcChains, maximumBatchSize: 20, methods: 'Published read-only allowlist; unsafe namespaces, archive reads, and transaction broadcast fail closed.' },
      pricing: { model: productId === 'rpc.call' ? 'fixed_per_request' : 'fixed_per_call', displayPrice: { asset: 'USDC', amountAtomic: '1000', decimals: 6 }, maximumChargeRequired: true, priceVersion: `${rpcPricing.priceVersion}-${productId}` },
      routes: { paidChallenge: '/v1/rpc/execute', health: '/v1/rpc/chains' },
      payment: { challengeImplemented: true, payable: true, mockExecutionAvailableByInjectionOnly: false },
      commercialProof: observed.rpc.proof === 'paid_outcome_verified',
    });
  }
  llms += '\n## Multi-chain RPC\n\n- `POST /v1/rpc/execute`: 0.001000 USDC per read-only RPC call on Ethereum, Optimism, BNB Smart Chain, Polygon, Base, Arbitrum One, Avalanche C-Chain, or Solana; batches contain at most 20 calls on one chain.\n- `GET /v1/rpc/chains`: current semantic health for every advertised chain. Credentialed primary supply and independent read-only fallbacks are checked for chain identity, height, and finalized block consistency.\n- Public operations are `rpc.call` and `rpc.batch`. Archive reads and transaction broadcast remain unavailable. Same-key replay returns the completed result and receipt without another charge.\n';
}
if (publicPrediction) {
  const priceByProduct = new Map(predictionPricing.products.map((product) => [product.productId, product]));
  const publicPredictionProducts = [
    ['prediction.markets', 'Discover normalized markets', 'Search and paginate fresh normalized markets and conservative canonical events.'],
    ['prediction.market', 'Inspect one normalized market', 'Read one stable Clervo market identity with normalized probabilities, freshness, evidence, and supply attribution.'],
    ['prediction.compare', 'Compare equivalent markets', 'Compare two conservatively matched markets and return normalized disagreement evidence.'],
    ['prediction.history', 'Read durable market history', 'Read a bounded hash-linked history of Clervo normalized observations.'],
    ['prediction.signal', 'Derive market signals', 'Derive bounded movement or disagreement signals only when the evidence is sufficient.'],
  ];
  openapi.info.title = 'Clervo Search, AI, Secure Sandbox, and Prediction Intelligence API';
  openapi.info.description = 'Public raw Search plus bounded paid AI, Sandbox, and derived Prediction Intelligence. Prediction supply is normalized and transformed by Clervo, attributed to pdata and each upstream venue, and never exposed as a raw pdata proxy.';
  openapi.paths['/v1/prediction/execute'] = {
    post: {
      summary: 'Request or settle a bounded Prediction Intelligence operation',
      description: 'Discovers or analyzes prediction markets through stable Clervo identities, conservative matching, durable normalized observations, freshness, provenance, attribution, receipts, and no-charge replay.',
      operationId: 'predictionExecute',
      parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 128 } }],
      requestBody: { required: true, content: { 'application/json': { schema: predictionProbeSchema } } },
      responses: {
        200: { description: 'Prediction operation completed or replayed', content: { 'application/json': { schema: publicResultSchema } } },
        400: { description: 'Invalid bounded Prediction request', content: { 'application/problem+json': { schema: publicProblemSchema } } },
        402: { description: 'x402 or MPP payment required', headers: { 'PAYMENT-REQUIRED': { schema: { type: 'string', contentEncoding: 'base64' } }, 'WWW-Authenticate': { schema: { type: 'string' } } } },
        404: { description: 'Requested stable market identity was not found', content: { 'application/problem+json': { schema: publicProblemSchema } } },
        409: { description: 'Idempotency or quote conflict', content: { 'application/problem+json': { schema: publicProblemSchema } } },
        503: { description: 'Qualified supply, durable state, or settlement is unavailable', content: { 'application/problem+json': { schema: publicProblemSchema } } },
      },
    },
  };
  openapi.paths['/v1/prediction/execute'].post = scannerSafeOperation(openapi.paths['/v1/prediction/execute'].post, {
    requestSchema: predictionProbeSchema,
    example: predictionProbeExample,
    paymentInfo: {
      price: { mode: 'dynamic', currency: 'USD', min: '0.002000', max: '0.003000' },
      protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
    },
    tags: ['Prediction'],
  });
  openapi['x-clervo-status'].operationIds = [...openapi['x-clervo-status'].operationIds, ...publicPredictionProducts.map(([productId]) => productId)];
  for (const [productId, title, summary] of publicPredictionProducts) {
    const price = priceByProduct.get(productId);
    if (price?.listingStatus !== 'sellable' || price.supplierCostMicrousd !== 0) throw new Error(`public_prediction_price_invalid:${productId}`);
    discovery.products.push({
      productId, operationId: productId, title, summary,
      lifecycle: 'preview', publicAvailable: true, deliveryModes: ['sync'],
      selection: { venues: ['polymarket', 'kalshi', 'manifold', 'limitless'], identity: 'Stable Clervo market and event identities with conservative equivalent-event matching.' },
      pricing: { model: 'fixed_by_operation', displayPrice: { asset: 'USDC', amountAtomic: String(price.customerPriceMicrousd), decimals: 6 }, maximumChargeRequired: true, priceVersion: `${predictionPricing.priceVersion}-${productId}` },
      routes: { paidChallenge: '/v1/prediction/execute' },
      payment: { challengeImplemented: true, payable: true, mockExecutionAvailableByInjectionOnly: false },
      attribution: { source: 'pdata.world', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', transformedBy: 'Clervo normalization, stable identity, conservative matching, durable observations, signals, freshness, and provenance.' },
      commercialProof: false,
    });
  }
  discovery.limitations = [
    'Raw cited Search, bounded paid AI chat, one-shot Secure Sandbox execution, and derived Prediction Intelligence are publicly callable previews.',
    'Prediction uses the qualified pdata supply path for Polymarket, Kalshi, Manifold, and Limitless; unresolved direct venue adapters remain disabled.',
    'Prediction output is transformed and attributed under CC BY 4.0; Clervo does not redistribute the raw pdata feed or provide trading execution or custody.',
    'A 402 response is a quote, not payment authorization or settlement.',
    'RPC and Crypto Intelligence remain publicly unavailable.',
  ];
  llms += '\n## Prediction Intelligence preview\n\n- `POST /v1/prediction/execute`: `prediction.markets`, `prediction.market`, and `prediction.compare` cost at most 0.002000 USDC; `prediction.history` and `prediction.signal` cost at most 0.003000 USDC on Base.\n- Qualified zero-cost supply: pdata for Polymarket, Kalshi, Manifold, and Limitless. Direct venue adapters with unresolved commercial permission remain disabled.\n- Clervo returns normalized probabilities, stable market/event identities, conservative matching, durable observations, disagreement/movement signals, freshness, provenance, pdata/upstream attribution, an accurate receipt, and no-charge replay. It is not a raw pdata proxy and does not provide trading or custody.\n';
}
if (publicCrypto) {
  const priceByProduct = new Map(cryptoPricing.products.map((product) => [product.productId, product]));
  const publicCryptoProducts = [
    ['crypto.wallet.balances', 'Read wallet balances', 'Read exact native balances and bounded holding coverage across requested supported chains.'],
    ['crypto.wallet.tokens', 'Read token holdings', 'Read bounded ERC-20 holdings with exact atomic amounts and explicit missing valuation.'],
    ['crypto.wallet.transactions', 'Read wallet activity', 'Read bounded normalized native and ERC-20 activity with direction, status, freshness, and evidence.'],
    ['crypto.wallet.report', 'Derive wallet intelligence', 'Derive one bounded multichain wallet report with holdings, activity, flows, counterparties, deterministic signals, coverage, freshness, and provenance.'],
  ];
  openapi.paths['/v1/crypto/execute'] = {
    post: {
      summary: 'Request or settle bounded Crypto Intelligence',
      description: 'Returns provider-neutral observed wallet facts and deterministic Clervo derivations for Ethereum and Base. It never infers wallet identity, provides an opaque risk score, signs, trades, or resells raw upstream responses.',
      operationId: 'cryptoExecute',
      parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 128 } }],
      requestBody: { required: true, content: { 'application/json': { schema: cryptoProbeSchema } } },
      responses: {
        200: { description: 'Crypto Intelligence operation completed or replayed', content: { 'application/json': { schema: publicResultSchema } } },
        400: { description: 'Invalid bounded Crypto Intelligence request', content: { 'application/problem+json': { schema: publicProblemSchema } } },
        402: { description: 'x402 or MPP payment required', headers: { 'PAYMENT-REQUIRED': { schema: { type: 'string', contentEncoding: 'base64' } }, 'WWW-Authenticate': { schema: { type: 'string' } } } },
        409: { description: 'Idempotency or quote conflict', content: { 'application/problem+json': { schema: publicProblemSchema } } },
        503: { description: 'Qualified supply, durable state, or settlement is unavailable', content: { 'application/problem+json': { schema: publicProblemSchema } } },
      },
    },
  };
  openapi.paths['/v1/crypto/execute'].post = scannerSafeOperation(openapi.paths['/v1/crypto/execute'].post, {
    requestSchema: cryptoProbeSchema,
    example: cryptoProbeExample,
    paymentInfo: {
      price: { mode: 'dynamic', currency: 'USD', min: '0.002000', max: '0.004000' },
      protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
    },
    tags: ['Crypto Intelligence'],
  });
  openapi['x-clervo-status'].operationIds = [...openapi['x-clervo-status'].operationIds, ...publicCryptoProducts.map(([productId]) => productId)];
  for (const [productId, title, summary] of publicCryptoProducts) {
    const price = priceByProduct.get(productId);
    if (price?.listingStatus !== 'sellable' || price.supplierCostMicrousd !== 0 || price.customerPriceMicrousd <= price.infrastructureCostAllowanceMicrousd) throw new Error(`public_crypto_price_invalid:${productId}`);
    discovery.products.push({
      productId, operationId: productId, title, summary,
      lifecycle: 'preview', publicAvailable: true, deliveryModes: ['sync'],
      selection: { chains: ['Ethereum', 'Base'], lookbackDays: { minimum: 1, maximum: 90 }, identity: 'Caller-supplied EVM address only; no wallet-owner or third-party identity labels are inferred.' },
      pricing: { model: 'fixed_by_operation', displayPrice: { asset: 'USDC', amountAtomic: String(price.customerPriceMicrousd), decimals: 6 }, maximumChargeRequired: true, priceVersion: `${cryptoPricing.priceVersion}-${productId}` },
      routes: { paidChallenge: '/v1/crypto/execute' },
      payment: { challengeImplemented: true, payable: true, mockExecutionAvailableByInjectionOnly: false },
      attribution: { source: 'Blockscout PRO API', transformedBy: 'Clervo provider-neutral normalization and deterministic wallet intelligence; raw API responses, credentials, and essential service are not resold.' },
      commercialProof: observed.crypto_intelligence.proof === 'paid_outcome_verified',
    });
  }
  discovery.limitations = [
    'Publicly callable previews include bounded provider-neutral Crypto Intelligence for Ethereum and Base.',
    'Crypto amounts stay exact in asset-native atomic units; USD valuation and cross-asset concentration remain unavailable without commercially qualified price supply.',
    'Reports expose observed facts, deterministic signals, coverage, missing sources, freshness, evidence, and provenance; they do not infer wallet identity, risk, advice, custody, signing, or trading.',
    'A 402 response is a quote, not payment authorization or settlement.',
    'Solana and unsupported EVM chains fail closed.',
  ];
  llms += '\n## Crypto Intelligence preview\n\n- `POST /v1/crypto/execute`: balances and token holdings cost 0.002000 USDC, transactions cost 0.003000 USDC, and the wallet report costs 0.004000 USDC on Base.\n- Supported data chains: Ethereum and Base. The report returns bounded holdings, activity, flows, counterparties, deterministic signals, freshness, coverage, evidence, and provenance.\n- Output never infers wallet identity, opaque risk, advice, custody, signing, or trading. USD valuation and Solana are unavailable. Same-key replay returns the completed result and receipt without another charge.\n';
}
const liveApiFamilies = [
  publicSearch ? { title: 'Search', description: 'raw cited Search' } : null,
  publicAi ? { title: 'AI', description: 'bounded paid AI' } : null,
  publicSandbox ? { title: 'Secure Sandbox', description: 'bounded one-shot Secure Sandbox execution' } : null,
  publicRpc ? { title: 'Multi-chain RPC', description: 'bounded read-only Multi-chain RPC' } : null,
  publicPrediction ? { title: 'Prediction Intelligence', description: 'derived Prediction Intelligence' } : null,
  publicCrypto ? { title: 'Crypto Intelligence', description: 'bounded provider-neutral Crypto Intelligence' } : null,
].filter(Boolean);
if (liveApiFamilies.length > 0) {
  openapi.info.title = `Clervo ${liveApiFamilies.map(({ title }) => title).join(', ')} API`;
  openapi.info.description = `Publicly callable previews: ${liveApiFamilies.map(({ description }) => description).join(', ')}. Availability, routes, and prices are generated from the probed live registry; unavailable operations fail closed.`;
  const tagDescriptions = {
    Search: 'Free-first raw web evidence and paid replay-safe retrieval.',
    AI: 'Provider-neutral model discovery and normalized free-or-paid execution.',
    Sandbox: 'Bounded one-shot isolated code execution.',
    RPC: 'Bounded allowlisted reads across eight supported chains.',
    Prediction: 'Normalized prediction-market discovery and derived intelligence.',
    'Crypto Intelligence': 'Bounded wallet facts and deterministic on-chain derivations.',
  };
  const openApiTagName = { 'Secure Sandbox': 'Sandbox', 'Multi-chain RPC': 'RPC', 'Prediction Intelligence': 'Prediction', 'Crypto Intelligence': 'Crypto Intelligence' };
  openapi.tags = liveApiFamilies.map(({ title }) => {
    const name = openApiTagName[title] ?? title;
    return { name, description: tagDescriptions[name] };
  });
  if (Array.isArray(discovery.limitations) && discovery.limitations.length > 0) {
    discovery.limitations[0] = `Publicly callable previews: ${liveApiFamilies.map(({ description }) => description).join(', ')}.`;
  }
}
const catalog = contractModule.createCatalogDocument(projection);
catalog.catalogVersion = discoveryArtifactVersion;
if (publicAi || publicSandbox || publicRpc || publicPrediction || publicCrypto) catalog.products = discovery.products;

// Project lifecycle-sensitive summary rows from the same live registry and
// products used below. These rows must never become a second hand-maintained
// status source.
const lifecycleSummary = ['live', 'supply_paused', 'unavailable']
  .map((state) => {
    const labels = observedTruth.filter(({ lifecycleState }) => lifecycleState === state).map(({ label }) => label);
    return labels.length === 0 ? null : `${state}: ${labels.join(', ')}`;
  })
  .filter(Boolean)
  .join('; ');
const publicProducts = discovery.products.filter(({ publicAvailable }) => publicAvailable === true);
const publicOperationIds = [...new Set(publicProducts.flatMap(({ operationId, operationIds }) => operationIds ?? [operationId]))];
discovery.description = COMMERCIAL_DESCRIPTION;
openapi['x-clervo-status'].operationIds = publicOperationIds;
const publicOfferSummary = publicProducts.map(({ productId, pricing }) => {
  const price = pricing?.displayPrice;
  if (price === null || price === undefined) return `${productId} (request-derived quote)`;
  const display = (Number(price.amountAtomic) / 10 ** Number(price.decimals)).toFixed(Number(price.decimals));
  return `${productId} (${display} USDC maximum)`;
}).join(', ');
llms = llms
  .replace('> Clervo is outcome infrastructure for agents: Find, Understand, Act.', `> ${COMMERCIAL_DESCRIPTION}`)
  .replace(/^- API:.*$/mu, '- API: https://api.clervo.dev')
  .replace(/^- Search:.*$/mu, `- Product availability: ${lifecycleSummary}`)
  .replace(/^- Operation IDs:.*$/mu, `- Public operation IDs: ${publicOperationIds.join(', ')}`)
  .replace(/^- x402 public payment:.*$/mu, `- x402 public payment: available for ${publicOfferSummary}`)
  .replace(/^- Public price:.*$/mu, `- Public price: ${publicOfferSummary}`);
// Availability and pricing stay sourced from the probed registry rather than
// from customer-facing prose.
discovery.observedTruth = { provenance: publicObservedProvenance, products: publicObservedTruth };
catalog.observedTruth = discovery.observedTruth;
discovery.sharedBoundary = SHARED_PUBLIC_BOUNDARY;
catalog.sharedBoundary = SHARED_PUBLIC_BOUNDARY;
openapi['x-clervo-shared-boundary'] = SHARED_PUBLIC_BOUNDARY;
// The two agent-facing documents are advertised where an agent already looks,
// so finding them does not require guessing a filename.
const { claims: _obsoleteClaimsArtifact, ...discoveryArtifacts } = discovery.artifacts;
discovery.artifacts = { ...discoveryArtifacts, schemas: '/openapi.json', skill: '/skill.md', agent: '/agent.md', models: '/v1/models', x402: '/.well-known/x402', reference: '/llms.txt' };
if (publicSearch) contractModule.assertPublicArtifacts(openapi, discovery, llms, projection);
else contractModule.assertPreviewArtifacts(openapi, discovery, llms, projection);
delete openapi['x-clervo-status'].releaseCandidateId;
delete openapi['x-clervo-status'].interfaceHash;
openapi['x-clervo-status'].distribution = publicSearch ? 'public' : 'unavailable';
openapi.info.description = `${COMMERCIAL_DESCRIPTION} Current operations, routes, prices, and limitations are listed below.`;

// Public discovery describes how an external caller uses the deployed system.
// Historical release-candidate gates, B-number readiness, private proof ledgers,
// and frozen-core bookkeeping remain repository authority but are not part of
// that caller contract.
delete discovery.releaseScope;
discovery.distribution = {
  state: publicSearch ? 'public' : 'unavailable',
  publicAvailable: publicSearch,
  callable: publicSearch,
};
discovery.payment = {
  protocols: ['x402', 'mpp'],
  publicAvailable: publicSearch,
  network: 'eip155:8453',
  asset: 'USDC',
};
for (const product of discovery.products) {
  delete product.commercialProof;
  product.lifecycle = product.publicAvailable ? 'available' : 'unavailable';
}
// Compatibility-only and roadmap products remain in the internal registry,
// not in the invocable public inventory returned to unrelated agents.
discovery.products = discovery.products.filter(({ publicAvailable }) => publicAvailable === true);
catalog.products = discovery.products;
delete catalog.releaseScope;
catalog.distribution = discovery.distribution;
discovery.limitations = discovery.limitations
  .filter((line) => !/(proof|proven|pending|customer payment|revenue|demand)/iu.test(line))
  .map((line) => line
    .replace(/Publicly callable previews:/iu, 'Publicly callable operations:')
    .replace(/ without commercially qualified price supply/iu, '')
    .replace(/Qualified supply, /iu, '')
    .replace(/The qualified pdata supply path/iu, 'pdata')
    .replace(/ Direct venue adapters with unresolved commercial permission remain disabled\./iu, ''));
llms = llms
  .replace(/^- \[Launch claims\]\(\/claims\.json\):.*\n/mu, '')
  .replace(/^- \[JSON Schemas\]\([^\n]+\):.*$/mu, '- [Request and response schemas](/openapi.json): OpenAPI 3.1 operations with embedded JSON Schema 2020-12 contracts.')
  .replace(/^- \[Onboarding and recovery\].*$/mu, '- [Onboarding and recovery](/onboarding.json): client setup, payment approval, replay, and reconciliation actions.')
  .replace(/^- \[Pricing state\].*$/mu, '- [Pricing state](/pricing.json): current public offers and maximum-charge behavior.')
  .replace(/^- \[Status\].*$/mu, '- [Status](/status.json): current API, package, route, and product availability.')
  .replace(/^- \[Discovery document\].*$/mu, '- [Discovery document](/.well-known/clervo.json): public operations, routes, prices, and payment protocols.')
  .replace(/## Secure Sandbox preview/gu, '## Secure Sandbox')
  .replace(/## Prediction Intelligence preview/gu, '## Prediction Intelligence')
  .replace(/## Crypto Intelligence preview/gu, '## Crypto Intelligence')
  .replace(/Qualified zero-cost supply:/gu, 'Current market sources:');
llms += [
  '',
  '## Current product availability',
  '',
  `Current at ${publicObservedProvenance.observedAt}. An available product accepts requests; an unavailable product has no public execution route. The 402 returned for a paid request is the binding quote.`,
  '',
  '| Product | Availability | Price |',
  '|---|---|---|',
  ...publicObservedTruth.map((product) => `| ${product.label} | ${product.lifecycleState}${product.reason === null ? '' : ` (${product.reason})`} | ${product.observedPrice === null ? 'not offered' : `${decimalAtomic(product.observedPrice.amountAtomic, 6)} USDC maximum`} |`),
  '',
].join('\n');

await writeFile(path.join(outputDirectory, 'openapi.json'), stableJson(openapi));
await writeFile(path.join(outputDirectory, 'catalog.json'), stableJson(catalog));
await writeFile(path.join(outputDirectory, 'onboarding.json'), stableJson(onboarding));
await writeFile(path.join(outputDirectory, 'capabilities.json'), stableJson({
  schemaVersion: 'clervo.capabilities.v1',
  observedAt: launchState.observedAt,
  publicCallable: publicSearch,
  observedTruth: { provenance: publicObservedProvenance, products: publicObservedTruth },
  products: publicObservedTruth.map(({ id, label, operations, lifecycleState, reason, publiclyReachable }) => ({
    id,
    label,
    // An unavailable family can be described without advertising speculative
    // operation IDs as invocable.
    operations: lifecycleState === 'unavailable' ? [] : operations,
    lifecycleState,
    reason,
    publiclyReachable,
  })),
}));
await writeFile(path.join(outputDirectory, 'pricing.json'), stableJson(publicSearch ? {
  schemaVersion: 'clervo.public-pricing-state.v1',
  observedAt: launchState.observedAt,
  publicOfferAvailable: true,
  publicPrice: {
    productId: 'search.web',
    network: projection.paymentNetwork,
    asset: projection.paymentAsset,
    amountAtomic: '6000',
    decimals: 6,
    amountDisplay: '0.006 USDC',
    maximumCharge: true,
  },
  offers: discovery.products.map(({ productId, publicAvailable, pricing }) => ({ productId, publicAvailable, ...pricing })),
} : {
  schemaVersion: 'clervo.public-pricing-state.v1',
  observedAt: launchState.observedAt,
  publicOfferAvailable: false,
  publicPrice: null,
  fixturePrices: discovery.products.map(({ productId, pricing }) => ({ productId, ...pricing })),
}));
await writeFile(path.join(outputDirectory, 'status.json'), stableJson({
  schemaVersion: 'clervo.public-status.v1',
  observedAt: liveRegistry.observedAt,
  publicApi: publicApiStatus,
  sharedBoundary: SHARED_PUBLIC_BOUNDARY,
  packages: launchState.distribution.packages,
  observedTruth: { provenance: publicObservedProvenance, products: publicObservedTruth },
  conformanceDefectsOpen: liveRegistry.conformance.filter(({ conformant }) => !conformant),
  aiRoutes: {
    counts: liveRegistry.summary.aiCatalog ?? liveRegistry.summary.aiRoutes,
    // B7 status uses only stable customer model identities. Legacy route and
    // supplier identifiers never enter a public projection.
    paused: b7PublicModels.data
      .filter(({ clervo }) => clervo.publicSellable !== true)
      .map(({ id, clervo }) => ({
        modelId: id,
        reason: 'temporarily_unavailable',
        availability: clervo.availability,
        health: clervo.health,
      })),
  },
  products: publicObservedTruth.map(({ id, lifecycleState, reason, publiclyReachable }) => ({ id, lifecycleState, reason, publiclyReachable })),
}));
await mkdir(path.join(outputDirectory, '.well-known', 'mcp'), { recursive: true });
await mkdir(path.join(outputDirectory, 'v1'), { recursive: true });
await writeFile(path.join(outputDirectory, '.well-known', 'clervo.json'), stableJson(discovery));
await writeFile(path.join(outputDirectory, '.well-known', 'agent.json'), stableJson(discovery));
await writeFile(path.join(outputDirectory, '.well-known', 'ai-plugin.json'), stableJson({
  schema_version: 'v1',
  name_for_human: 'Clervo',
  name_for_model: 'clervo',
  description_for_human: COMMERCIAL_DESCRIPTION,
  description_for_model: `${COMMERCIAL_DESCRIPTION} Public operations: ${publicOperationIds.join(', ')}. Production API: ${projection.publicBaseUrl}.`,
  api: { type: 'openapi', url: 'https://api.clervo.dev/openapi.json' },
  auth: { type: 'none' },
}));
const mcpDiscovery = {
  schemaVersion: 'clervo.mcp-discovery.v1',
  name: '@clervo/mcp',
  version: launchState.distribution.packages.items.find(({ name }) => name === '@clervo/mcp').version,
  registryUrl: launchState.distribution.packages.items.find(({ name }) => name === '@clervo/mcp').url,
  transport: 'stdio',
  publicApiAvailable: publicSearch,
  ...(publicSearch ? { publicApiBaseUrl: projection.publicBaseUrl } : {}),
  configurationRequired: [],
  configurationOptional: ['CLERVO_BASE_URL', 'CLERVO_HOME', 'CLERVO_AUTO_PAY'],
  paymentSigningImplemented: true,
  automaticPaymentRetry: false,
  installCommand: `npx -y @clervo/mcp@${launchState.distribution.packages.items.find(({ name }) => name === '@clervo/mcp').version}`,
  claudeCodeCommand: 'claude mcp add clervo -s user -- npx -y @clervo/mcp',
  documentationUrl: 'https://clervo.dev/start/',
};
await writeFile(path.join(outputDirectory, '.well-known', 'mcp.json'), stableJson(mcpDiscovery));
await writeFile(path.join(outputDirectory, '.well-known', 'mcp', 'server.json'), stableJson(mcpDiscovery));
await writeFile(path.join(outputDirectory, '.well-known', 'security.txt'), [
  'Canonical: https://clervo.dev/.well-known/security.txt',
  'Contact: https://github.com/clervo/clervo/security/advisories/new',
  'Policy: https://clervo.dev/security/',
  '',
].join('\n'));
await writeFile(path.join(outputDirectory, 'openapi.yaml'), stableJson(openapi));

// `skill.md` and `agent.md` are the two documents an agent runtime looks for
// when it wants to use a service without a human reading marketing pages. They
// previously resolved to the site's HTML shell, which told an agent nothing.
//
// Both are generated from the probed registry for the same reason every other
// public surface is: a hand-written capability document drifts from the runtime
// the moment the runtime changes, and a stale skill file is worse than none —
// it makes an agent attempt an operation that fails closed.
const freeEntryRoute = observed.search.freeEntry?.route ?? null;
const naiveFreeAccepted = observed.search.freeEntry?.acceptsNaiveRequest === true;
const publicBaseUrl = publicSearch ? projection.publicBaseUrl : null;

// The one command a first-time caller runs. Built from the probed registry, so
// it can never advertise a header requirement the deployed system does not have:
// while the free route still demands a caller-supplied key the published command
// shows one, because a copy-pasteable example that returns 400 is worse than no
// example. Once the route accepts a naive request the key line disappears and
// the server reports the key it generated in the `idempotency-key` response
// header. The site renders the same command from the same registry field.
const quickStartCurl = publicBaseUrl === null
  ? null
  : [
    ...(naiveFreeAccepted ? [] : ['CLERVO_IDEMPOTENCY_KEY="$(uuidgen)"', '']),
    `curl -sS ${publicBaseUrl}/v1/search/free \\`,
    "  -H 'content-type: application/json' \\",
    `  -d '{"query":"World Wide Web","maxResults":3,"synthesize":false}'${naiveFreeAccepted ? '' : ' \\'}`,
    ...(naiveFreeAccepted ? [] : ['  -H "idempotency-key: $CLERVO_IDEMPOTENCY_KEY"']),
  ].join('\n');

function observedRows() {
  return observedTruth.map((product) => `| ${product.label} | \`${product.id}\` | ${product.lifecycleState}${product.reason === null ? '' : ` (${product.reason})`} | ${product.observedPrice === null ? 'not offered' : `${decimalAtomic(product.observedPrice.amountAtomic, 6)} USDC observed maximum`} |`);
}

const observedTable = [
  '| Product | ID | Availability | Price |',
  '|---|---|---|---|',
  ...observedRows(),
];

// The same command, published on the site and in llms.txt, so a reader of
// either runs the identical first call.
if (quickStartCurl !== null) {
  llms += [
    '',
    '## First call',
    '',
    naiveFreeAccepted
      ? 'No account, no API key, no wallet, no idempotency key:'
      : 'No account, no API key, no wallet:',
    '',
    '```bash',
    quickStartCurl,
    '```',
    '',
    naiveFreeAccepted
      ? 'The free sample accepts a request with no `idempotency-key` header. The server generates one and returns it in the `idempotency-key` response header; send that value back to replay the same operation without a second execution.'
      : 'The free sample currently rejects a request with no `idempotency-key` header; supply a stable value of 8 to 128 token characters.',
    '',
    `Paid requests go to \`POST ${publicBaseUrl}/v1/search/paid\`, which returns a 402 carrying the exact maximum charge before anything executes.`,
    '',
    '- [Agent skill](/skill.md): when to use Clervo and how to make the first call.',
    '- [Agent reference](/agent.md): identity, observed state, idempotency contract, and boundaries.',
    '',
  ].join('\n');
}

// The command-line client, described only when the free path it opens with is
// actually being served. A reader must not be told to install something whose
// first command would fail against the deployed system.
//
// Serving the free route is necessary but not sufficient: `npx @clervo/router`
// resolves against the npm registry, so until the package is actually published
// that first command fails for every reader no matter how healthy the route is.
// The section is therefore also gated on the published package, which is why it
// is absent while publication remains outstanding.
const routerPublished = await (async () => {
  try {
    const response = await fetch('https://registry.npmjs.org/@clervo/router', { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return false;
    const document = await response.json();
    return Object.keys(document?.versions ?? {}).length > 0;
  } catch {
    // An unreachable registry is not evidence of publication.
    return false;
  }
})();

if (freeEntryRoute !== null && publicBaseUrl !== null && routerPublished) {
  llms += [
    '',
    '## Command line',
    '',
    'One install, and a real result before a wallet exists:',
    '',
    '```bash',
    'npx @clervo/router search "World Wide Web"',
    '```',
    '',
    'No account, no API key, no wallet, no funding. The free path above is what that command calls.',
    '',
    'Paid use is opt-in and comes later, in this order:',
    '',
    '```bash',
    'clervo catalog                      # what is being served right now',
    'clervo quote search.web "<query>"   # the exact price, without paying it',
    'clervo wallet create                # a dedicated wallet, only when you want a paid product',
    'clervo wallet address               # fund it with USDC on Base mainnet',
    'clervo run search.web "<query>"     # pay for one call, with the price shown first',
    'clervo replay <key>                 # the same result again, never a second charge',
    'clervo doctor                       # check the machine end to end',
    '```',
    '',
    '`clervo wallet create` never overwrites an existing wallet, and `clervo wallet restore` refuses if the wallet it would replace holds a balance. Payment is a signed USDC authorization on Base, so no gas is paid from that wallet. If a call fails after the authorization was sent, the settlement is unknown: the client records it, refuses to spend again, and resolves it with `clervo reconcile`.',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Agent discovery documents
// ---------------------------------------------------------------------------
//
// An agent cannot open an account or read a marketing page. It reads three
// documents: a model list, a payment manifest, and a reference. All three are
// rendered from the probed registry for the same reason every other surface is
// — a hand-written model list drifts the moment supply changes, and a stale one
// is worse than none, because it makes an agent call a route that fails closed.
//
// The registry's own catalog rule decides what appears: `live` and
// `supply_paused` are in the catalog, the second carrying its reason and
// expected return date, and `unavailable` is absent. Dropping a paused route
// would erase supply we own; listing an unavailable one would advertise supply
// we do not have.
const CATALOGUED_STATES = new Set(['live', 'supply_paused']);
const routeQualifiedAt = new Map(modelCatalog.routes.map((route) => [route.routeId, route.qualification?.checkedAt ?? null]));
const epochSeconds = (value) => (value === null || Number.isNaN(Date.parse(value)) ? null : Math.floor(Date.parse(value) / 1_000));

// OpenAI's list shape, so a client that already speaks it works unmodified. The
// observed availability and price live under `clervo` rather
// than being folded into the standard fields: an OpenAI client ignores them,
// and an agent that reads them cannot mistake a priced route for a proven one.
const legacyModelList = {
  object: 'list',
  data: liveRegistry.aiRoutes
    .filter(({ state }) => CATALOGUED_STATES.has(state))
    .map((route) => ({
      id: route.exactModelId,
      object: 'model',
      created: epochSeconds(routeQualifiedAt.get(route.routeId) ?? null),
      owned_by: 'clervo',
      clervo: {
        productIds: route.productIds,
        capabilities: route.capabilities,
        route: '/v1/ai/execute',
        lifecycleState: route.state,
        sellable: route.sellable,
        reason: publicReason(route.reason),
        expectedReturnAt: null,
        observedPrice: route.observedQuote === null ? null : {
          amountAtomic: route.observedQuote.amountAtomic,
          asset: route.observedQuote.asset,
          network: route.observedQuote.network,
          decimals: 6,
          priceVersion: route.observedQuote.priceVersion,
          maximumCharge: true,
        },
      },
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
  clervo: {
    provenance: publicObservedProvenance,
    states: liveRegistry.states,
    counts: liveRegistry.summary.aiRoutes,
    note: 'A live route is selectable. A supply_paused route stays listed with its reason and is not selectable. The 402 returned for a request is the binding quote.',
  },
};

async function dynamicModelList() {
  const configured = process.env.CLERVO_AI_PUBLIC_MODEL_CATALOG_FILE ?? 'generated/b7-ai/public/models.json';
  if (configured === '') return null;
  const file = path.resolve(root, configured);
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error('dynamic_ai_public_catalog_path_invalid');
  const value = JSON.parse(await readFile(file, 'utf8'));
  if (value?.object !== 'list' || !Array.isArray(value.data) || value.clervo === null || typeof value.clervo !== 'object') throw new Error('dynamic_ai_public_catalog_invalid');
  const serialized = JSON.stringify(value);
  for (const prohibited of ['gatewaySupplyId', 'runtimeModelId', 'upstreamCost', 'supplyFamilyId', 'providerId', 'authorityRef', 'ownerDecisionRef']) if (serialized.includes(prohibited)) throw new Error(`dynamic_ai_public_catalog_private_field:${prohibited}`);
  if (value.data.some((entry) => typeof entry?.id !== 'string' || entry.id.length === 0 || entry.object !== 'model' || entry.owned_by !== 'clervo' || entry.clervo === null || typeof entry.clervo !== 'object')) throw new Error('dynamic_ai_public_catalog_model_invalid');
  if (new Set(value.data.map(({ id }) => id)).size !== value.data.length) throw new Error('dynamic_ai_public_catalog_identity_duplicate');
  if (typeof value.clervo.sourceValidUntil !== 'string' || Date.parse(value.clervo.sourceValidUntil) <= Date.now()) throw new Error('dynamic_ai_public_catalog_stale');
  return value;
}

// B7's frozen commercial catalog is now the default public AI authority. An
// explicit empty setting retains the legacy probe projection for historical
// validation only; normal catalog revisions change data, never this generator.
const dynamicModelSource = await dynamicModelList();
const dynamicModelAuthority = dynamicModelSource !== null;

function publicDynamicModel(entry) {
  const clervo = entry.clervo;
  return {
    id: entry.id,
    object: entry.object,
    ...(entry.created === undefined ? {} : { created: entry.created }),
    owned_by: entry.owned_by,
    clervo: {
      identityKind: clervo.identityKind,
      ...(Array.isArray(clervo.aliases) ? { aliases: clervo.aliases } : {}),
      ...(typeof clervo.aliasFor === 'string' ? { aliasFor: clervo.aliasFor } : {}),
      ...(typeof clervo.reasoningEffort === 'string' ? { reasoningEffort: clervo.reasoningEffort } : {}),
      name: clervo.name,
      description: clervo.description,
      productIds: clervo.productIds,
      capabilities: clervo.capabilities,
      inputTypes: clervo.inputTypes,
      outputTypes: clervo.outputTypes,
      ...(Number.isInteger(clervo.contextWindow) ? { contextWindow: clervo.contextWindow } : {}),
      ...(Array.isArray(clervo.inputModalities) ? { inputModalities: clervo.inputModalities } : {}),
      ...(Array.isArray(clervo.outputModalities) ? { outputModalities: clervo.outputModalities } : {}),
      ...(clervo.limits !== undefined ? { limits: clervo.limits } : {}),
      ...(typeof clervo.ownedBySemantics === 'string' ? { ownedBySemantics: clervo.ownedBySemantics } : {}),
      lifecycle: clervo.lifecycle,
      availability: clervo.availability,
      health: clervo.health,
      publicSellable: clervo.publicSellable,
      ...(clervo.publicSellable === false ? { availabilityReason: 'temporarily_unavailable' } : {}),
      customerPricing: clervo.customerPricing,
      billingMode: clervo.billingMode,
      commerce: {
        executionPath: clervo.commerce.executionPath,
        payment: clervo.commerce.payment,
        resultAccounting: clervo.commerce.resultAccounting,
        replaySafe: clervo.commerce.replaySafe,
      },
    },
  };
}

const modelList = dynamicModelSource === null
  ? legacyModelList
  : {
      ...dynamicModelSource,
      data: dynamicModelSource.data.map(publicDynamicModel),
    };

const prohibitedPublicModelFields = [
  'publicationBlockers',
  'pricingMethod',
  'competitiveComparison',
  'executionSupplier',
  'upstreamExecutionSupplier',
  'upstreamExecutionSupplierStatus',
  'modelCreatorStatus',
  'gatewaySupplyId',
  'runtimeModelId',
  'providerId',
  'authorityRef',
  'ownerDecisionRef',
];

const serializedPublicModelList = JSON.stringify(modelList);
for (const field of prohibitedPublicModelFields) {
  if (serializedPublicModelList.includes(`"${field}"`)) {
    throw new Error(`public_ai_model_catalog_internal_field:${field}`);
  }
}

const sellableModelCount = modelList.data.filter(({ clervo }) => clervo.publicSellable === true || clervo.sellable === true).length;
const modelInventory = modelList.clervo.inventory ?? { canonicalModels: modelList.data.length, aliases: 0, callableIds: modelList.data.length };

// The x402 v2 discovery listing shape: `items[]`, each with the resource URL and
// the `accepts` array the resource actually answers with. Every entry is the
// exact quote the deployed system returned during the probe, not a price copied
// from a pricing file, because a manifest that disagrees with the 402 sends an
// agent to sign the wrong amount.
//
// `/v1/ai/execute` has no single price: it quotes per request from the model the
// caller names. The example carried here is therefore taken from a specific live
// chat route and names that route, rather than from whichever route happened to
// sort first — the product-level quote is a speech route, and publishing a
// speech price under `ai.chat` would misprice the operation an agent calls.
const aiExampleRoute = liveRegistry.aiRoutes.find((route) => route.state === 'live'
  && route.productIds.includes('ai.chat')
  && route.observedQuote !== null) ?? null;
const aiExampleQuote = dynamicModelAuthority ? observed.ai.observedQuote : aiExampleRoute?.observedQuote ?? null;
const aiExampleRouteId = dynamicModelAuthority ? null : aiExampleRoute?.routeId ?? null;

const x402Resources = [
  { productId: 'search', path: '/v1/search/paid', operationId: 'search.web', priceModel: 'fixed_request', quote: observed.search.observedQuote, exampleRouteId: null },
  { productId: 'ai', path: '/v1/ai/execute', operationId: 'ai.chat', priceModel: 'request_derived_per_model', quote: aiExampleQuote, exampleRouteId: aiExampleRouteId },
  ...(publicOpenAiChat ? [{
    productId: 'ai',
    path: OPENAI_CHAT_COMPLETIONS_PATH,
    operationId: 'ai.chat',
    priceModel: 'request_derived_per_model',
    quote: openAiChatCompatibility.observedQuote,
    exampleRouteId: null,
  }] : []),
  ...(publicAnthropicMessages ? [{
    productId: 'ai',
    path: ANTHROPIC_MESSAGES_PATH,
    operationId: 'ai.chat',
    priceModel: 'request_derived_per_model',
    quote: anthropicMessagesCompatibility.observedQuote,
    exampleRouteId: null,
  }] : []),
  ...(publicOpenAiResponses ? [{
    productId: 'ai',
    path: OPENAI_RESPONSES_PATH,
    operationId: 'ai.chat',
    priceModel: 'request_derived_per_model',
    quote: openAiResponsesCompatibility.observedQuote,
    exampleRouteId: null,
  }] : []),
  { productId: 'sandbox', path: '/v1/sandbox/execute', operationId: 'sandbox.run', priceModel: 'class_derived_quote', quote: observed.sandbox.observedQuote, exampleRouteId: null },
  { productId: 'rpc', path: '/v1/rpc/execute', operationId: 'rpc.call', priceModel: 'request_derived_per_call', quote: observed.rpc.observedQuote, exampleRouteId: null },
  { productId: 'prediction', path: '/v1/prediction/execute', operationId: 'prediction.markets', priceModel: 'request_derived_per_operation', quote: observed.prediction.observedQuote, exampleRouteId: null },
  { productId: 'crypto_intelligence', path: '/v1/crypto/execute', operationId: 'crypto.wallet.report', priceModel: 'request_derived_per_operation', quote: observed.crypto_intelligence.observedQuote, exampleRouteId: null },
]
  .filter(({ productId, quote }) => observed[productId].state === 'live' && quote !== null)
  .map(({ productId, path: resourcePath, operationId, priceModel, quote, exampleRouteId }) => {
    const product = observed[productId];
    return {
      resource: `${publicBaseUrl}${resourcePath}`,
      type: 'http',
      x402Version: 2,
      accepts: [{
        scheme: quote.scheme,
        network: quote.network,
        amount: quote.amountAtomic,
        asset: quote.asset,
        payTo: quote.payTo,
        maxTimeoutSeconds: 60,
        extra: {
          clervo: {
            operationId,
            priceModel,
            priceVersion: quote.priceVersion,
            // The amount above is one observed quote. For a request-derived
            // price it is an example from the route named here, not a fixed
            // offer: the 402 the resource returns for the caller's own request
            // is the binding one.
            amountIsBinding: priceModel === 'fixed_request',
            exampleRouteId,
            lifecycleState: product.state,
          },
        },
      }],
      lastUpdated: epochSeconds(liveRegistry.observedAt),
      metadata: {
        category: productId,
        provider: 'clervo',
        description: quote.resourceDescription,
        method: 'POST',
        bodyType: 'json',
        idempotency: 'idempotency-key header; the same key with the same body replays without a second charge',
        bazaarExtensionPresent: quote.bazaarExtensionPresent,
        // Bazaar eligibility and Bazaar indexing are separate observed facts,
        // and both are published rather than implied. A resource CDP's
        // validator accepts is listable; it appears in the catalog only after a
        // payment settles through the CDP facilitator.
        bazaar: bazaarStateFor(`${publicBaseUrl}${resourcePath}`),
        ...(priceModel === 'request_derived_per_model' ? { modelList: `${publicBaseUrl}/v1/models` } : {}),
      },
    };
  });

const x402Manifest = {
  x402Version: 2,
  items: x402Resources,
  pagination: { limit: x402Resources.length, offset: 0, total: x402Resources.length },
  clervo: {
    provenance: publicObservedProvenance,
    states: liveRegistry.states,
    bazaar: liveRegistry.bazaar === undefined ? null : {
      facilitator: liveRegistry.bazaar.facilitator,
      validator: liveRegistry.bazaar.validator,
      indexedResourceCount: liveRegistry.bazaar.indexedResourceCount,
      note: liveRegistry.bazaar.note,
    },
    // A free path is not an x402 item — it carries no payment requirement — but
    // an agent that finds this manifest first should not have to pay to try the
    // service. It is advertised alongside, clearly separated.
    freeResources: [
      ...(observed.search.freeEntry === null ? [] : [{
        resource: observed.search.freeEntry.route,
        type: 'http',
        method: 'POST',
        bodyType: 'json',
        paymentRequired: false,
        acceptsRequestWithoutIdempotencyKey: observed.search.freeEntry.acceptsNaiveRequest,
        operationId: 'search.web',
        lifecycleState: observed.search.state,
        quota: 'Capped per caller and globally. Over the cap the route answers 429 free_quota_exceeded rather than executing.',
      }]),
      ...(modelList.data.some(({ clervo }) => clervo.billingMode === 'free' && clervo.publicSellable === true) ? [{
        resource: '/v1/ai/execute',
        type: 'http',
        method: 'POST',
        bodyType: 'json',
        paymentRequired: false,
        acceptsRequestWithoutIdempotencyKey: true,
        operationId: 'ai.execute',
        modelIds: modelList.data.filter(({ clervo }) => clervo.billingMode === 'free' && clervo.publicSellable === true).map(({ id }) => id),
        lifecycleState: 'available',
        quota: 'Capped per privacy-preserving caller subject and globally. Over the cap the route answers 429 ai_free_quota_exceeded and never converts to a paid call.',
      }] : []),
    ],
    documents: { models: `${publicBaseUrl}/v1/models`, reference: `${publicBaseUrl}/llms.txt`, discovery: `${publicBaseUrl}/.well-known/clervo.json`, openapi: `${publicBaseUrl}/openapi.json` },
  },
};

if (publicBaseUrl !== null) {
  llms += [
    '',
    '## Agent discovery',
    '',
    `- [\`GET ${publicBaseUrl}/v1/models\`](/models.json): ${dynamicModelAuthority ? 'the authoritative canonical AI catalog and stable aliases, with capability, availability, health, free/paid state, pricing, and commerce contract' : 'every catalogued AI route with its exact model identity, availability, and observed price'}. OpenAI list shape.`,
    `- [\`GET ${publicBaseUrl}/.well-known/x402\`](/.well-known/x402.json): the x402 v2 payment manifest. Each item carries the exact quote the resource returns.`,
    `- \`GET ${publicBaseUrl}/llms.txt\`: this document, served from the API host as well as the site.`,
    '',
    `Model list: ${modelInventory.callableIds} callable IDs (${modelInventory.canonicalModels} canonical, ${modelInventory.aliases} aliases), ${sellableModelCount} sellable. Payment manifest: ${x402Resources.length} paid resources.`,
    '',
  ].join('\n');
}
await writeFile(path.join(outputDirectory, 'llms.txt'), llms);
// Both agent documents are also written as plain files so the site host serves
// byte-identical copies. The API host serves them at their canonical agent
// paths — `/v1/models` and `/.well-known/x402` — from the same bytes.
await writeFile(path.join(outputDirectory, 'models.json'), stableJson(modelList));
await writeFile(path.join(outputDirectory, 'v1', 'models'), stableJson(modelList));
await writeFile(path.join(outputDirectory, '.well-known', 'x402.json'), stableJson(x402Manifest));
await writeFile(path.join(outputDirectory, '.well-known', 'x402'), stableJson(x402Manifest));

const skillDocument = [
  '# Clervo skill',
  '',
  COMMERCIAL_DESCRIPTION,
  '',
  'Payment, when required, uses x402 or MPP over USDC on Base and is always',
  'quoted before execution. Automatic payment is off by default.',
  '',
  `Current availability was generated at ${publicObservedProvenance.observedAt}.`,
  '',
  '## When to use this skill',
  '',
  `- You need an AI model call (${b7Inventory.callableIds} model IDs) — use \`POST /v1/ai/execute\`.`,
  '- You need cited web evidence for a question — use `POST /v1/search/free` or `POST /v1/search/paid`.',
  '- You need to run sandboxed Node.js or Python code safely with a receipt — use `POST /v1/sandbox/execute`.',
  '- You need read-only JSON-RPC on Ethereum, Optimism, BNB Smart Chain, Polygon, Base, Arbitrum One, Avalanche C-Chain, or Solana — use `POST /v1/rpc/execute`.',
  '- You need real-time prediction market data (Polymarket, Kalshi, Manifold, Limitless) — use `POST /v1/prediction/execute`.',
  '- You need EVM wallet intelligence for Ethereum or Base — use `POST /v1/crypto/execute`.',
  '- You want per-request payment with no account, no API key, and safe retry on failure.',
  '- You need the same request to be safely retryable without being charged twice.',
  '',
  '## Current availability',
  '',
  ...observedTable,
  '',
  'Availability is current at the time shown in the public status document. Paid routes return a 402',
  'before execution; inspect that request-specific quote before authorizing it.',
  '',
  ...(quickStartCurl === null ? [
    '## Calling it',
    '',
    'No public endpoint is served in this release. Do not construct a call.',
    '',
  ] : [
    '## First call',
    '',
    naiveFreeAccepted ? 'No key, no account, no wallet:' : 'No account, no wallet:',
    '',
    '```bash',
    quickStartCurl,
    '```',
    '',
    naiveFreeAccepted
      ? 'The free sample accepts a request with no `idempotency-key`. The server mints one and returns it in the `idempotency-key` response header; send that value back to replay the same operation without re-executing it.'
      : 'The free sample currently requires a caller-supplied `idempotency-key` header. Send a stable value of 8 to 128 token characters.',
    '',
    '## Paid call',
    '',
    `1. \`POST ${publicBaseUrl}/v1/search/paid\` with the same body and your own \`idempotency-key\`.`,
    '2. Read the 402 response: `accepts[0]` carries the exact maximum charge, asset, network, and expiry.',
    '3. Approve deliberately, then resend with `PAYMENT-SIGNATURE` (x402) or `Authorization: Payment` (MPP).',
    '4. Reuse the same key to replay the completed result. A replay never charges again.',
    '',
    '### Paid AI example',
    '',
    '```bash',
    [
      `curl -i -X POST ${publicBaseUrl}/v1/ai/execute`,
      "  -H 'content-type: application/json'",
      "  -H 'Idempotency-Key: my-unique-key-550e8400'",
      `  -d '{"model":"${currentPaidDiscoveryModel}","input":{"kind":"chat","messages":[{"role":"user","content":"Reply with ready."}],"responseFormat":"text","stream":false},"maximumOutputTokens":16}'`,
    ].join('\n'),
    '```',
    '',
    'The paid AI route returns a 402 with the exact request-derived quote before execution. Approve only that quote, then resend with x402 or MPP payment headers.',
    '',
    '## Failure behaviour',
    '',
    '- `400` the request was rejected before execution; fix it and resend.',
    '- `402` payment is required; the body carries the exact quote.',
    '- `409` the key is bound to a different request body; use a new key.',
    '- `429` the free quota is exhausted; wait for the window in `ratelimit-reset`.',
    '- `5xx` the operation failed closed. Retry the same key. Never retry a payment of unknown settlement state with a new key.',
    '',
  ]),
  '## Machine-readable contracts',
  '',
  '- `/.well-known/clervo.json` — discovery, products, and observed truth.',
  '- `/.well-known/x402` — x402 v2 payment manifest with the exact quote each paid resource returns.',
  `- \`/v1/models\` — ${dynamicModelAuthority ? 'authoritative AI catalog with stable IDs, aliases, capabilities, price, free/paid state, availability, health, and commerce contract' : 'catalogued AI routes with availability and observed price'}.`,
  '- `/openapi.json` — request and response contracts.',
  '- `/status.json` — current availability, health, and open conformance defects.',
  '- `/pricing.json` — the public offer boundary.',
  '- `/llms.txt` — this service as a documentation map.',
  '',
].join('\n');

const agentDocument = [
  '# Clervo for agents',
  '',
  COMMERCIAL_DESCRIPTION,
  '',
  'This document lists the callable routes, current prices, setup paths, and safe',
  'payment behavior an autonomous caller needs.',
  '',
  `Current availability was generated at ${publicObservedProvenance.observedAt}.`,
  '',
  '## Identity',
  '',
  `- API origin: ${publicBaseUrl ?? 'not publicly served in this release'}`,
  '- Site origin: https://clervo.dev',
  '- Payment protocols: x402 and MPP EVM charge intents, USDC on Base.',
  '- Authentication: none. The free sample needs no credential; paid routes need a payment, not an account.',
  '',
  '## Current availability',
  '',
  ...observedTable,
  '',
  'A `live` product accepts requests. Paid resources return their binding quote',
  'in the 402 response; unavailable resources have no public execution route.',
  '',
  ...(freeEntryRoute === null ? [] : [
    '## Free entry point',
    '',
    `- \`POST ${freeEntryRoute}\``,
    `- Accepts a request with no idempotency key: ${naiveFreeAccepted ? 'yes' : 'no'}`,
    '- Quota headers: `ratelimit-limit`, `ratelimit-remaining`, `ratelimit-reset`.',
    '- Over the cap the route answers `429 free_quota_exceeded` rather than executing. Do not treat 429 as a transport error.',
    '',
  ]),
  ...(quickStartCurl === null ? [] : [
    '## Minimum viable request',
    '',
    '```bash',
    quickStartCurl,
    '```',
    '',
  ]),
  '## Idempotency contract',
  '',
  '- A key is 8 to 128 visible ASCII token characters.',
  '- The same key with the same body replays the stored result and sets `idempotency-replayed: true`. No second execution, no second charge.',
  '- The same key with a different body returns `409 idempotency_conflict`.',
  '- If the free sample generates a key for you, it is returned in the `idempotency-key` response header. Keep it if you may need to replay.',
  '- On an unknown settlement state, retry with the same key only. A new key authorizes a new charge.',
  '',
  '## Discovery paths',
  '',
  '- `/.well-known/clervo.json`',
  '- `/.well-known/x402` — x402 v2 payment manifest; each item carries the exact quote its resource returns.',
  `- \`/v1/models\` — ${dynamicModelAuthority ? 'authoritative AI catalog, OpenAI list shape, including stable canonical IDs and aliases plus capability, price, availability, health, and commerce metadata' : 'every catalogued AI route, OpenAI list shape, with availability and observed price'}.`,
  '- `/openapi.json`',
  '- `/catalog.json`',
  '- `/capabilities.json`',
  '- `/pricing.json`',
  '- `/status.json`',
  '- `/onboarding.json`',
  '- `/llms.txt`',
  '',
  '## Model selection',
  '',
  `- ${modelInventory.callableIds} callable IDs: ${modelInventory.canonicalModels} canonical and ${modelInventory.aliases} stable aliases; ${sellableModelCount} sellable now.`,
  `- ${dynamicModelAuthority ? 'Send a canonical `id`, or an alias whose `clervo.aliasFor` contract you accept, as `model` on `POST /v1/ai/execute`.' : 'Send `clervo.routeId`\'s exact model identity as `model` on `POST /v1/ai/execute`.'}`,
  `- ${dynamicModelAuthority ? 'Use `clervo.availability`, `clervo.health`, and `clervo.publicSellable` before selection. Canonical IDs never substitute another model.' : 'A route with `clervo.lifecycleState: supply_paused` is listed with its reason and is not sellable. Do not select it; it stays listed because the supply is owned and returning.'}`,
  `- ${dynamicModelAuthority ? 'Use `clervo.customerPricing` and `clervo.billingMode` for discovery. A paid request\'s 402 is the binding maximum charge.' : '`clervo.observedPrice` is the quote observed at the probe above. The 402 returned for your own request is the binding one.'}`,
  '',
  '## Boundaries',
  '',
  ...(discovery.limitations ?? []).map((limitation) => `- ${limitation}`),
  '',
].join('\n');

const llmsFull = [
  llms.trimEnd(),
  '',
  '## Complete autonomous-caller guide',
  '',
  agentDocument.trim(),
  '',
  '## Installable skill interface',
  '',
  skillDocument.trim(),
  '',
].join('\n');

await writeFile(path.join(outputDirectory, 'skill.md'), skillDocument);
await writeFile(path.join(outputDirectory, 'agent.md'), agentDocument);
await writeFile(path.join(outputDirectory, 'agents.txt'), agentDocument);
await writeFile(path.join(outputDirectory, 'llms-full.txt'), llmsFull);

// The API edge is a Worker with no filesystem, so it cannot read these
// documents at request time. They are emitted as a module it imports, from the
// same strings written above, so the site host and the API host can never serve
// two different versions of the same document.
//
// `llms.txt` is here for that reason: it was already served from the site, and
// an agent that finds the API host first must get the identical reference
// rather than a 404 that makes the service look undocumented.
const workerDirectory = path.join(root, 'generated/worker');
await mkdir(workerDirectory, { recursive: true });
await writeFile(path.join(workerDirectory, 'agent-documents.js'), [
  '// Generated by scripts/generate-discovery.mjs. Do not edit.',
  '//',
  '// Imported by apps/worker/src/api-edge.js so api.clervo.dev serves byte-identical',
  '// copies of generated/public/skill.md, generated/public/agent.md, and',
  '// generated/public/llms.txt.',
  '',
  `export const SKILL_DOCUMENT = ${JSON.stringify(skillDocument)};`,
  '',
  `export const AGENT_DOCUMENT = ${JSON.stringify(agentDocument)};`,
  '',
  `export const LLMS_DOCUMENT = ${JSON.stringify(llms)};`,
  '',
].join('\n'));

const publicOperationCount = discovery.products.filter(({ publicAvailable }) => publicAvailable === true).length;
const liveFamilyLabels = observedTruth.filter(({ lifecycleState }) => lifecycleState === 'live').map(({ label }) => label);
console.log(`distribution discovery generation: PASS (${liveFamilyLabels.length === 0 ? 'no public families' : `public ${liveFamilyLabels.join(', ')}`}, ${publicOperationCount} operations, ${Object.keys(schemas).length} schemas)`);
