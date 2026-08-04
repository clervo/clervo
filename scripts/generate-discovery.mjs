#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaDirectory = path.join(root, 'packages/contracts/schemas');
const outputDirectory = path.join(root, 'generated/public');
const contractModule = await import(pathToFileURL(path.join(root, 'dist/packages/contracts/src/index.js')));
const schemaVisibility = JSON.parse(await readFile(path.join(root, 'packages/catalog/schema-visibility.v1.json'), 'utf8'));
const releaseCandidate = JSON.parse(await readFile(path.join(root, 'packages/catalog/release-candidate-freeze.v1.json'), 'utf8'));
const registry = JSON.parse(await readFile(path.join(root, releaseCandidate.baseRegistry.file), 'utf8'));
const onboarding = JSON.parse(await readFile(path.join(root, 'packages/distribution/onboarding.v1.json'), 'utf8'));
const launchState = JSON.parse(await readFile(path.join(root, 'packages/catalog/launch-state.v1.json'), 'utf8'));
const distributionRelease = JSON.parse(await readFile(path.join(root, 'packages/distribution/release-targets.v1.json'), 'utf8'));
const x402Proof = JSON.parse(await readFile(path.join(root, 'infra/production/gcp/x402-proof.v1.json'), 'utf8'));

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
const aiProbeExample = Object.freeze({
  model: 'gpt-5.6-luna',
  input: {
    kind: 'chat',
    messages: [{ role: 'user', content: 'Reply with the single word ready.' }],
    responseFormat: 'text',
    stream: false,
  },
  maximumOutputTokens: 16,
});
const aiChatProbeSchema = Object.freeze({
  type: 'object',
  required: ['model', 'input', 'maximumOutputTokens'],
  properties: {
    model: { type: 'string', enum: ['gpt-5.6-luna'], default: aiProbeExample.model },
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
    maximumOutputTokens: { type: 'integer', minimum: 1, maximum: 16384, default: aiProbeExample.maximumOutputTokens },
  },
  additionalProperties: false,
});
const sandboxProbeExample = Object.freeze({
  command: Object.freeze(['node', '-e', "process.stdout.write('ready')"]),
  limits: Object.freeze({ wallTimeMs: 5_000, memoryBytes: 67_108_864 }),
});
const sandboxProbeSchema = Object.freeze({
  type: 'object', required: ['command'], additionalProperties: false,
  properties: {
    command: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 4096 }, default: sandboxProbeExample.command },
    stdinBase64: { type: 'string' },
    limits: {
      type: 'object', additionalProperties: false, default: sandboxProbeExample.limits,
      properties: {
        cpuMillis: { type: 'integer', minimum: 1, maximum: 30_000 },
        memoryBytes: { type: 'integer', minimum: 16_777_216, maximum: 536_870_912 },
        processes: { type: 'integer', minimum: 1, maximum: 64 },
        diskBytes: { type: 'integer', minimum: 1_048_576, maximum: 1_073_741_824 },
        outputBytes: { type: 'integer', minimum: 1, maximum: 1_048_576 },
        artifactBytes: { type: 'integer', minimum: 1, maximum: 10_485_760 },
        wallTimeMs: { type: 'integer', minimum: 100, maximum: 60_000 },
      },
    },
  },
});

function scannerSafeOperation(operation, { requestSchema, example, paymentInfo, free = false }) {
  const cloned = structuredClone(operation);
  cloned.parameters = cloned.parameters.map((parameter) => ({
    ...parameter,
    schema: { ...parameter.schema, default: 'x402scan-clervo-probe' },
    example: 'x402scan-clervo-probe',
  }));
  cloned.requestBody.content['application/json'] = { schema: requestSchema, example };
  for (const response of Object.values(cloned.responses)) {
    if (response?.content === undefined) continue;
    for (const media of Object.values(response.content)) media.schema = response === cloned.responses['200'] ? publicResultSchema : publicProblemSchema;
  }
  if (free) cloned.security = [];
  if (paymentInfo !== undefined) cloned['x-payment-info'] = paymentInfo;
  return cloned;
}

const { interfaceHash, ...unsignedReleaseCandidate } = releaseCandidate;
const publicApiFlags = [
  launchState.distribution.publicApi.publicCallable,
  launchState.distribution.publicApi.publicTraffic,
  launchState.distribution.publicApi.customerEndpointAvailable,
];
const publicSearch = publicApiFlags.every((value) => value === true)
  && launchState.paymentProof.publicCustomerPaymentAvailable === true
  && launchState.products.find(({ id }) => id === 'search')?.customerLifecycle === 'preview_publicly_callable';
const privateCandidate = publicApiFlags.every((value) => value === false)
  && launchState.paymentProof.publicCustomerPaymentAvailable === false
  && launchState.products.find(({ id }) => id === 'search')?.customerLifecycle === 'preview_not_publicly_callable';
const publicAi = publicSearch
  && launchState.products.find(({ id }) => id === 'ai')?.customerLifecycle === 'preview_publicly_callable';
const publicSandbox = publicAi
  && launchState.products.find(({ id }) => id === 'sandbox')?.customerLifecycle === 'preview_publicly_callable';

if (
  releaseCandidate.state !== 'private_core_frozen'
  || releaseCandidate.noPublicDistribution !== true
  || interfaceHash !== contractModule.hashJson(unsignedReleaseCandidate)
) throw new Error('distribution_release_candidate_invalid');
if (
  releaseCandidate.coreQualifications.length !== 6
  || releaseCandidate.coreQualifications.some(({ privateCoreQualified }) => privateCoreQualified !== true)
) throw new Error('distribution_private_core_qualification_incomplete');
if (
  releaseCandidate.operationSet.publicOperationIds.join(',') !== 'search.web,search.answer'
  || releaseCandidate.operationSet.publicOperationIds.some((operationId) => {
    const operation = registry.operations.find((candidate) => candidate.operationId === operationId);
    const inputVisibility = schemaVisibility.schemas.find(({ schemaId }) => schemaId === operation?.inputSchema)?.visibility;
    const outputVisibility = schemaVisibility.schemas.find(({ schemaId }) => schemaId === operation?.outputSchema)?.visibility;
    return operation?.lifecycle !== 'preview'
      || operation.visibility !== 'internal'
      || operation.route === null
      || inputVisibility !== 'public_wire'
      || outputVisibility !== 'public_wire';
  })
) throw new Error('distribution_operation_projection_invalid');
if (
  releaseCandidate.lifecycleProjection.length !== registry.pillars.length
  || releaseCandidate.lifecycleProjection.some(({ pillarId, lifecycle }) => {
    const pillar = registry.pillars.find((candidate) => candidate.pillarId === pillarId);
    return pillar?.lifecycle !== lifecycle;
  })
) throw new Error('distribution_lifecycle_projection_invalid');

const frozenProjection = Object.freeze({
  releaseCandidateId: releaseCandidate.releaseCandidateId,
  interfaceHash,
  noPublicDistribution: true,
  publicOperationIds: Object.freeze([...releaseCandidate.operationSet.publicOperationIds]),
});
if (
  onboarding.schemaVersion !== 'clervo.distribution-onboarding.v1'
  || onboarding.releaseCandidateId !== frozenProjection.releaseCandidateId
  || onboarding.interfaceHash !== frozenProjection.interfaceHash
  || onboarding.publicCallable !== false
  || onboarding.paymentImplemented !== false
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
  || (!privateCandidate && !publicSearch)
  || launchState.paymentProof.state !== 'owner_funded_private_proof'
  || launchState.paymentProof.productId !== x402Proof.productId
  || launchState.paymentProof.amountAtomic !== x402Proof.observedSettlement.customerChargeAtomic
  || launchState.paymentProof.settlementConfirmed !== (x402Proof.state === 'settled_reconciled')
  || launchState.paymentProof.replaySameReceipt !== x402Proof.observedReplay.sameReceipt
  || launchState.paymentProof.secondCharge !== x402Proof.observedReplay.secondCharge
  || launchState.paymentProof.revenueEvidence !== x402Proof.observedSettlement.revenueEvidence
  || launchState.paymentProof.demandEvidence !== x402Proof.observedSettlement.demandEvidence
  || launchState.products.length !== 6
  || launchState.products.some(({ id }) => !registry.pillars.some(({ pillarId }) => pillarId === id))
) throw new Error('launch_state_invalid');
const projection = publicSearch ? Object.freeze({
  ...contractModule.PUBLIC_SEARCH_DISTRIBUTION_PROJECTION,
  releaseCandidateId: releaseCandidate.releaseCandidateId,
  interfaceHash,
}) : frozenProjection;
const projectedOnboarding = publicSearch ? {
  ...onboarding,
  publicCallable: true,
  paymentImplemented: true,
  journey: onboarding.journey.map((step) => ({
    ...step,
    ...(step.step === 'ask' ? { state: 'public_raw_search', action: 'Submit one bounded raw Search request with an idempotency key.' } : {}),
    ...(step.step === 'fund' ? { state: 'user_managed', action: 'Hold enough exact quoted USDC on Base before approving a paid request.' } : {}),
    ...(step.step === 'approve' ? { state: 'explicit_wallet_action', action: 'Inspect the exact maximum charge, network, asset, resource, and expiry before signing.' } : {}),
    ...(step.step === 'result' ? { state: 'public_raw_search', action: 'Verify the normalized result and its source citations.' } : {}),
    ...(step.step === 'receipt' ? { state: 'public_verified', action: 'Inspect the payment response, receipt, request hash, and no-charge replay behavior.' } : {}),
  })),
} : onboarding;

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(path.join(outputDirectory, 'schemas', contractModule.CONTRACT_VERSION), { recursive: true });

const schemas = {};
const allSchemaFiles = (await readdir(schemaDirectory)).filter((name) => name.endsWith('.schema.json')).sort();
const projectedSchemaFiles = contractModule.publicSchemaFiles(schemaVisibility, allSchemaFiles);
for (const fileName of projectedSchemaFiles) {
  const source = await readFile(path.join(schemaDirectory, fileName), 'utf8');
  const schema = JSON.parse(source);
  const declaration = schemaVisibility.schemas.find(({ file }) => file === fileName);
  if (!declaration || declaration.schemaId !== schema.$id) throw new Error(`schema visibility identity mismatch: ${fileName}`);
  schemas[componentName(fileName)] = schema;
  await writeFile(path.join(outputDirectory, 'schemas', contractModule.CONTRACT_VERSION, fileName), stableJson(schema));
}

const openapi = contractModule.createOpenApiDocument(schemas, projection);
const discovery = contractModule.createDiscoveryDocument(projection);
let llms = contractModule.createLlmsText(projection);
if (publicSearch) {
  openapi.servers = [{ url: 'https://api.clervo.dev' }];
  openapi.info.contact = { name: 'Clervo', email: 'mo@clervo.dev', url: 'https://github.com/clervo/clervo' };
  openapi.info['x-guidance'] = 'Use POST /v1/search/free for a bounded no-payment sample. Paid routes return x402 v2 and MPP EVM charge challenges before execution. Supply the required JSON body and a stable Idempotency-Key, inspect the exact payment requirements, and send either PAYMENT-SIGNATURE for x402 or Authorization: Payment for MPP only after approval. Reuse the same key to recover or replay a completed result without a second charge. Every unsupported capability fails closed.';
  openapi.paths['/v1/search/free'].post = scannerSafeOperation(openapi.paths['/v1/search/free'].post, {
    requestSchema: searchProbeSchema,
    example: searchProbeExample,
    free: true,
  });
  openapi.paths['/v1/search/paid'].post = scannerSafeOperation(openapi.paths['/v1/search/paid'].post, {
    requestSchema: searchProbeSchema,
    example: searchProbeExample,
    paymentInfo: {
      price: { mode: 'fixed', currency: 'USD', amount: '0.006000' },
      protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
    },
  });
  openapi.paths['/v1/search/paid'].post.responses['200'].description = 'Raw cited Search completed or replayed';
}
if (publicAi) {
  openapi.info.title = 'Clervo Search and AI API';
  openapi.info.description = 'Public Search and bounded paid AI preview. AI quotes are request-derived from current qualified exact-model routes; unsupported modalities fail closed.';
  openapi.paths['/v1/ai/execute'] = {
    post: {
      summary: 'Request or settle a bounded AI operation',
      description: 'Returns an exact x402 quote for a qualified AI request. A completed idempotency key replays the same result and receipt without another charge.',
      operationId: 'aiExecute',
      parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 128 } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AiHttpRequest' } } } },
      responses: {
        200: { description: 'AI operation completed or replayed', content: { 'application/json': { schema: { $ref: '#/components/schemas/AiHttpResult' } } } },
        400: { description: 'Invalid bounded AI request', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
        402: { description: 'x402 or MPP payment required', headers: { 'PAYMENT-REQUIRED': { schema: { type: 'string', contentEncoding: 'base64' } }, 'WWW-Authenticate': { schema: { type: 'string' } } } },
        409: { description: 'Idempotency or quote conflict', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
        503: { description: 'No qualified route, capacity, or settlement path is available', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
      },
    },
  };
  openapi.paths['/v1/ai/execute'].post = scannerSafeOperation(openapi.paths['/v1/ai/execute'].post, {
    requestSchema: aiChatProbeSchema,
    example: aiProbeExample,
    paymentInfo: {
      price: { mode: 'dynamic', currency: 'USD', min: '0.000001', max: '2.621440' },
      protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
    },
  });
  openapi['x-clervo-status'].operationIds = [...openapi['x-clervo-status'].operationIds, 'ai.chat'];
  openapi['x-clervo-status'].runtimeRelease = launchState.sourceCommit;
  discovery.description = 'Machine-readable public Search and paid AI preview. Raw Search and qualified bounded AI chat requests are callable; unsupported AI modalities and the remaining product cores fail closed. No external customer revenue or demand is claimed.';
  discovery.products.push({
    productId: 'ai.chat', operationId: 'ai.chat', title: 'Qualified AI chat',
    summary: 'Bounded provider-neutral chat with exact returned model identity, usage, receipt, and no-charge replay.',
    lifecycle: 'preview', publicAvailable: true, deliveryModes: ['sync'],
    selection: { model: 'Exact qualified model ID or supported Clervo alias.' },
    pricing: { model: 'x402_request_quote', displayPrice: null, maximumChargeRequired: true, priceVersion: 'qualified-route-request-derived' },
    routes: { paidChallenge: '/v1/ai/execute' },
    payment: { challengeImplemented: true, payable: true, mockExecutionAvailableByInjectionOnly: false },
    commercialProof: false,
  });
  discovery.runtimeRelease = { sourceCommit: launchState.sourceCommit, operationIds: ['search.web', 'ai.chat'] };
  discovery.limitations = [
    'Raw cited Search and bounded paid AI chat are publicly callable previews; Search synthesis and AI media remain unavailable.',
    'AI prices are exact per-request maximum-charge quotes, not one fixed model price.',
    'The AI production origin and stable challenge are verified; an owner-signed paid AI result remains pending.',
    'Secure Sandbox, RPC, Prediction, and Crypto Intelligence remain publicly unavailable.',
    'No external customer payment, revenue, or demand is claimed.',
  ];
  llms = llms
    .replace('raw cited Search is callable; synthesized Search, AI, Secure Sandbox, RPC, Prediction, and Crypto Intelligence are unavailable', 'raw cited Search and bounded paid AI chat are callable; synthesized Search, AI media, Secure Sandbox, RPC, Prediction, and Crypto Intelligence are unavailable')
    .replace('Projected operation IDs: search.web, search.answer', 'Projected operation IDs: search.web, search.answer, ai.chat')
    .replace('x402 public payment: available for search.web at a maximum charge of 0.006 USDC on Base', 'x402 public payment: available for search.web at a maximum charge of 0.006 USDC and for ai.chat through an exact request-derived maximum-charge quote on Base');
}
if (publicSandbox) {
  openapi.info.title = 'Clervo Search, AI, and Secure Sandbox API';
  openapi.info.description = 'Public raw Search plus bounded paid AI chat and one-shot gVisor Sandbox previews. Every paid route is quote-bound, receipt-bearing, and replay-safe.';
  openapi.paths['/v1/sandbox/execute'] = {
    post: {
      summary: 'Request or settle a bounded one-shot Secure Sandbox execution',
      description: 'Runs one command in the pinned qualified Node.js gVisor image with no network, strict resources, cleanup, a receipt, and no-charge replay. Sessions and artifact retrieval are not yet public.',
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
      price: { mode: 'fixed', currency: 'USD', amount: '0.120000' },
      protocols: [{ x402: {} }, { mpp: { method: 'evm', intent: 'charge', currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } }],
    },
  });
  openapi['x-clervo-status'].operationIds = [...openapi['x-clervo-status'].operationIds, 'sandbox.run'];
  discovery.description = 'Machine-readable public Search, paid AI chat, and paid one-shot Secure Sandbox previews. Each published operation returns real output through the production path; unsupported operations fail closed. No external customer revenue or demand is claimed.';
  discovery.products.push({
    productId: 'sandbox.run', operationId: 'sandbox.run', title: 'Secure one-shot code execution',
    summary: 'Bounded Node.js execution in a pinned gVisor image with no network, strict resource ceilings, cleanup, receipt, and no-charge replay.',
    lifecycle: 'preview', publicAvailable: true, deliveryModes: ['sync'],
    selection: { image: 'Pinned qualified sandbox.nodejs-24 image; caller cannot select an arbitrary image.' },
    pricing: { model: 'fixed_request', displayPrice: { asset: 'USDC', amountAtomic: '120000', decimals: 6 }, maximumChargeRequired: true, priceVersion: 'sandbox-run-public-2026-08-04.1' },
    routes: { paidChallenge: '/v1/sandbox/execute' },
    payment: { challengeImplemented: true, payable: true, mockExecutionAvailableByInjectionOnly: false },
    commercialProof: false,
  });
  discovery.runtimeRelease = { sourceCommit: launchState.sourceCommit, operationIds: ['search.web', 'ai.chat', 'sandbox.run'] };
  discovery.limitations = [
    'Raw cited Search, bounded paid AI chat, and bounded paid one-shot Secure Sandbox execution are publicly callable previews.',
    'The Sandbox has one qualified execution node; high availability, sessions, arbitrary images, network access, and public artifact retrieval are not claimed.',
    'Search synthesis, AI media, RPC, Prediction, and Crypto Intelligence remain unavailable.',
    'The Sandbox production origin, useful gVisor output, replay, and cleanup are verified; an owner-signed public paid Sandbox result remains pending.',
    'No external customer payment, revenue, or demand is claimed.',
  ];
  llms += '\n## Secure Sandbox preview\n\n- `POST /v1/sandbox/execute`: fixed maximum charge 0.120000 USDC on Base for one bounded Node.js gVisor execution.\n- The public operation is one-shot, no-network, resource-capped, receipt-bearing, and replay-safe. Sessions and artifact retrieval remain unavailable.\n';
}
const catalog = contractModule.createCatalogDocument(projection);
if (publicAi || publicSandbox) catalog.products = discovery.products;
if (publicSearch) contractModule.assertPublicArtifacts(openapi, discovery, llms, projection);
else contractModule.assertPreviewArtifacts(openapi, discovery, llms, projection);
await writeFile(path.join(outputDirectory, 'openapi.json'), stableJson(openapi));
await writeFile(path.join(outputDirectory, 'catalog.json'), stableJson(catalog));
await writeFile(path.join(outputDirectory, 'onboarding.json'), stableJson(projectedOnboarding));
await writeFile(path.join(outputDirectory, 'claims.json'), stableJson(launchState));
await writeFile(path.join(outputDirectory, 'capabilities.json'), stableJson({
  schemaVersion: 'clervo.capabilities.v1',
  observedAt: launchState.observedAt,
  publicCallable: publicSearch,
  products: launchState.products.map(({ id, label, operations, engineeringState, customerLifecycle }) => ({
    id,
    label,
    operations,
    engineeringState,
    customerLifecycle,
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
  privateProof: {
    productId: launchState.paymentProof.productId,
    amountDisplay: launchState.paymentProof.amountDisplay,
    label: 'Owner-funded private proof amount; not a public customer offer.',
  },
  offers: discovery.products.map(({ productId, publicAvailable, pricing }) => ({ productId, publicAvailable, ...pricing })),
} : {
  schemaVersion: 'clervo.public-pricing-state.v1',
  observedAt: launchState.observedAt,
  publicOfferAvailable: false,
  publicPrice: null,
  privateProof: {
    productId: launchState.paymentProof.productId,
    amountDisplay: launchState.paymentProof.amountDisplay,
    label: 'Owner-funded private proof amount; not a public customer offer.',
  },
  fixturePrices: discovery.products.map(({ productId, pricing }) => ({ productId, ...pricing })),
}));
await writeFile(path.join(outputDirectory, 'status.json'), stableJson({
  schemaVersion: 'clervo.public-status.v1',
  observedAt: launchState.observedAt,
  publicApi: launchState.distribution.publicApi,
  packages: launchState.distribution.packages,
  paymentProof: launchState.paymentProof,
  products: launchState.products.map(({ id, engineeringState, customerLifecycle, commercialProof }) => ({
    id,
    engineeringState,
    customerLifecycle,
    commercialProof,
  })),
}));
await mkdir(path.join(outputDirectory, '.well-known'), { recursive: true });
await writeFile(path.join(outputDirectory, '.well-known', 'clervo.json'), stableJson(discovery));
await writeFile(path.join(outputDirectory, '.well-known', 'mcp.json'), stableJson({
  schemaVersion: 'clervo.mcp-discovery.v1',
  name: '@clervo/mcp',
  version: launchState.distribution.packages.items.find(({ name }) => name === '@clervo/mcp').version,
  registryUrl: launchState.distribution.packages.items.find(({ name }) => name === '@clervo/mcp').url,
  transport: 'stdio',
  publicApiAvailable: publicSearch,
  ...(publicSearch ? { publicApiBaseUrl: projection.publicBaseUrl } : {}),
  configurationRequired: ['CLERVO_BASE_URL'],
  paymentSigningImplemented: false,
  automaticPaymentRetry: false,
}));
await writeFile(path.join(outputDirectory, '.well-known', 'security.txt'), [
  'Canonical: https://clervo.dev/.well-known/security.txt',
  'Contact: https://github.com/clervo/clervo/security/advisories/new',
  'Policy: https://clervo.dev/security/',
  '',
].join('\n'));
await writeFile(path.join(outputDirectory, 'openapi.yaml'), stableJson(openapi));
await writeFile(path.join(outputDirectory, 'llms.txt'), llms);

const publicOperationCount = projection.publicOperationIds.length + (publicAi ? 1 : 0) + (publicSandbox ? 1 : 0);
console.log(`distribution discovery generation: PASS (${publicSandbox ? 'public Search, AI, and Sandbox preview' : publicAi ? 'public Search and AI preview' : publicSearch ? 'public Search preview' : 'private candidate'}, ${publicOperationCount} operations, ${Object.keys(schemas).length} schemas)`);
