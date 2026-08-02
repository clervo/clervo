#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogFiles = [
  'ai-credit-backed-pricing.v1.json', 'ai-edge-free-pricing.v1.json', 'ai-free-tier-pricing.v1.json',
  'ai-gateway-pricing.v1.json', 'ai-launch-pricing.v1.json', 'ai-owned-source-pricing.v1.json',
  'ai-speech-pricing.v1.json', 'blockchain-data-supply-pricing.v1.json', 'payment-supply-pricing.v1.json',
  'platform-integration-supply-pricing.v1.json', 'rpc-supply-pricing.v1.json', 'search-supply-pricing.v1.json',
  'storage-supply-pricing.v1.json',
];

const load = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
const catalogs = new Map(await Promise.all(catalogFiles.map(async (file) => [file, await load(`packages/catalog/${file}`)])));
const aiCatalog = await load('packages/catalog/ai-model-catalog.v1.json');
const market = await load('docs/evidence/supply-foundation/market-sourcing-gap-evaluation.v1.json');

function assets(document) {
  return ['routes', 'assets', 'models', 'chatRoutes', 'embeddingRoutes', 'imageRoutes', 'videoRoutes', 'musicRoutes', 'speechRoutes', 'transcriptionRoutes'].flatMap((key) => Array.isArray(document[key]) ? document[key] : []);
}

function positiveCustomerPrice(asset) {
  const numbers = [];
  function collect(value, customerScope = false) {
    if (typeof value === 'number' && customerScope) numbers.push(value);
    else if (Array.isArray(value)) value.forEach((item) => collect(item, customerScope));
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) collect(child, customerScope || key.toLowerCase().startsWith('customer'));
  }
  collect(asset);
  return numbers.length > 0 && numbers.every((value) => value > 0);
}

const ref = (file) => `packages/catalog/${file}`;
const catalogCoverage = catalogFiles.map((file) => {
  const rows = assets(catalogs.get(file));
  return {
    catalog: ref(file),
    assetCount: rows.length,
    positiveCustomerPriceCount: rows.filter(positiveCustomerPrice).length,
    sellableCount: rows.filter(({ listingStatus }) => ['sellable', 'sellable_preview'].includes(listingStatus)).length,
  };
});
if (catalogCoverage.some(({ assetCount, positiveCustomerPriceCount }) => assetCount !== positiveCustomerPriceCount)) throw new TypeError('supply_matrix_nonpositive_customer_price');

function publicModelId(modelId) {
  if (modelId.startsWith('@cf/')) return modelId.split('/').at(-1);
  if (/^[a-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(modelId)) return modelId.split('/')[1];
  return modelId;
}

const publicModels = (modelIds) => [...new Set(modelIds.map(publicModelId))].sort();
const qualified = (product) => publicModels(aiCatalog.routes.filter(({ productIds }) => productIds.includes(product)).map(({ exactModelId }) => exactModelId));
const priced = (file, predicate = () => true) => assets(catalogs.get(file)).filter(predicate).map((asset) => asset.modelId ?? asset.publicAssetId ?? asset.productId);
const evidence = (name) => `docs/evidence/supply-foundation/${name}`;
const capabilities = [
  {
    capabilityId: 'ai.chat', publicAssets: qualified('ai.chat'), lifecycle: 'mixed', routeState: 'qualified_portfolio_exact_fallback_partial',
    primaryServices: ['supply.clervo_ai_gateway', 'supply.google_vertex', 'supply.groq', 'supply.cloudflare_workers_ai'], fallbackServices: ['supply.groq', 'supply.cloudflare_workers_ai'],
    pricingCatalogs: [ref('ai-launch-pricing.v1.json'), ref('ai-credit-backed-pricing.v1.json'), ref('ai-free-tier-pricing.v1.json'), ref('ai-edge-free-pricing.v1.json')], quality: 'mixed', termsStatus: 'restricted',
    quotaRunway: 'Existing gateway budget, reported Vertex credit, recurring free allocations, and hard deny-on-unknown usage guards; exact expiry and remaining balances are not fully observable.',
    healthMethod: [evidence('cloudflare-production-chat-quality.v1.json'), evidence('cloudflare-expanded-chat-qualification.v1.json'), 'docs/evidence/stage6/groq-supply-screen.v1.json', 'docs/evidence/stage6/vertex-multimodal-screen.v1.json'],
    secretLocations: ['runtime:CLERVO_AI_API_KEY', 'application_default:GCP_ADC', 'legacy_import:GROQ_API_KEY,CLOUDFLARE_API_TOKEN'],
    replacementPlan: 'Retain only exact qualified identities. Add official paid supplier accounts after revenue, prioritizing missing proprietary families; never use opaque or silently substituting aggregators.'
  },
  {
    capabilityId: 'ai.embed', publicAssets: qualified('ai.embed'), lifecycle: 'production', routeState: 'qualified_single_family', primaryServices: ['supply.google_vertex'], fallbackServices: [],
    pricingCatalogs: [ref('ai-credit-backed-pricing.v1.json'), ref('ai-edge-free-pricing.v1.json')], quality: 'best', termsStatus: 'restricted', quotaRunway: 'Allocated from the reported Vertex credit with deny-on-unknown usage. The recurring-free BGE-M3 candidate passed 7/8 retrieval cases but its synchronous responses omit token usage, so it cannot enter customer accounting.',
    healthMethod: [evidence('cloudflare-modality-screen.v1.json'), evidence('cloudflare-bge-retrieval.v1.json'), 'docs/evidence/stage6/vertex-embedding-screen.v1.json'], secretLocations: ['application_default:GCP_ADC', 'legacy_import:CLOUDFLARE_API_TOKEN'], replacementPlan: 'Keep BGE-M3 blocked unless the synchronous API reports exact token usage or an exact compatible tokenizer is integrated; do not estimate metered usage. Source another independent embedding family only if funded Vertex runway becomes insufficient.'
  },
  {
    capabilityId: 'ai.image', publicAssets: qualified('ai.image'), lifecycle: 'production', routeState: 'qualified_single_family', primaryServices: ['supply.google_vertex'], fallbackServices: [],
    pricingCatalogs: [ref('ai-credit-backed-pricing.v1.json'), ref('ai-edge-free-pricing.v1.json')], quality: 'mixed', termsStatus: 'restricted', quotaRunway: 'Allocated from the reported Vertex credit; generated-image size and ledger ceilings remain mandatory.',
    healthMethod: [evidence('cloudflare-modality-screen.v1.json'), evidence('cloudflare-flux-safety-probe.v1.json'), evidence('cloudflare-flux-quality-final.v1.json'), evidence('cloudflare-dreamshaper-quality-final.v1.json'), 'docs/evidence/stage6/vertex-multimodal-screen.v1.json'], secretLocations: ['application_default:GCP_ADC', 'legacy_import:CLOUDFLARE_API_TOKEN'], replacementPlan: 'Keep FLUX Schnell and DreamShaper rejected after independent 1/5 prompt-adherence results, and keep the newer BFL routes terms-blocked; source a different zero-owner-cash image family only if the funded primary runway becomes insufficient.'
  },
  {
    capabilityId: 'ai.video', publicAssets: priced('ai-credit-backed-pricing.v1.json', ({ listingStatus, modelId }) => modelId?.startsWith('veo-') && listingStatus === 'sellable'), lifecycle: 'production', routeState: 'qualified_single_family', primaryServices: ['supply.google_vertex'], fallbackServices: [],
    pricingCatalogs: [ref('ai-credit-backed-pricing.v1.json')], quality: 'mixed', termsStatus: 'restricted', quotaRunway: 'USD 500 shadow allocation within the reported credit and USD 25 total daily shadow debit ceiling; no owner-cash overage.',
    healthMethod: ['docs/evidence/stage6/vertex-multimodal-screen.v1.json'], secretLocations: ['application_default:GCP_ADC'], replacementPlan: 'Keep the preview lite route unavailable and source a second production video family only after the primary route has customer demand.'
  },
  {
    capabilityId: 'ai.music', publicAssets: priced('ai-credit-backed-pricing.v1.json', ({ modelId }) => modelId === 'lyria-002'), lifecycle: 'preview', routeState: 'qualified_adapter_ready_contract_pending', primaryServices: ['supply.google_vertex'], fallbackServices: [],
    pricingCatalogs: [ref('ai-credit-backed-pricing.v1.json')], quality: 'unranked', termsStatus: 'restricted', quotaRunway: 'USD 100 shadow allocation within the reported credit, USD 0.06 supplier price per 30-second clip, and the shared USD 25 daily debit ceiling; no owner-cash overage.',
    healthMethod: [evidence('vertex-lyria-qualification.v1.json'), 'tests/contract/vertex-lyria-adapter.test.mjs'], secretLocations: ['application_default:GCP_ADC'], replacementPlan: 'Add the explicit ai.music execution wire contract and a perceptual quality benchmark before public listing; retain the exact immutable endpoint and WAV integrity checks.'
  },
  {
    capabilityId: 'ai.tts', publicAssets: qualified('ai.speech'), lifecycle: 'production', routeState: 'qualified_resilient', primaryServices: ['supply.deepgram'], fallbackServices: ['supply.cloudflare_workers_ai'],
    pricingCatalogs: [ref('ai-speech-pricing.v1.json'), ref('ai-edge-free-pricing.v1.json'), ref('ai-free-tier-pricing.v1.json')], quality: 'good', termsStatus: 'restricted', quotaRunway: 'USD 160 primary shadow allocation with USD 5 daily debit and USD 20 remaining-balance hard stop; fallback uses recurring free neurons with an application ledger, hard stop, and no paid overage.',
    healthMethod: ['docs/evidence/stage6/deepgram-speech-screen.v1.json', evidence('cloudflare-modality-screen.v1.json'), evidence('cloudflare-aura-quality.v1.json'), evidence('groq-speech-qualification.v1.json')], secretLocations: ['legacy_import:DEEPGRAM_API_KEY,CLOUDFLARE_API_TOKEN,GROQ_API_KEY'], replacementPlan: 'Keep the two independently operated Aura routes health-scored and fail over only on transient failures; preview Orpheus routes remain blocked on organization terms acceptance.'
  },
  {
    capabilityId: 'ai.stt', publicAssets: publicModels([...priced('ai-speech-pricing.v1.json', ({ modelId }) => modelId === 'nova-3'), ...priced('ai-free-tier-pricing.v1.json', ({ assetType }) => assetType === 'transcription'), ...priced('ai-edge-free-pricing.v1.json', ({ task }) => task === 'Automatic Speech Recognition')]), lifecycle: 'mixed', routeState: 'qualified_adapter_ready_contract_pending', primaryServices: ['supply.deepgram'], fallbackServices: ['supply.groq', 'supply.cloudflare_workers_ai'],
    pricingCatalogs: [ref('ai-speech-pricing.v1.json'), ref('ai-free-tier-pricing.v1.json'), ref('ai-edge-free-pricing.v1.json')], quality: 'best', termsStatus: 'restricted', quotaRunway: 'The funded primary has a USD 30 allocation and USD 5 shared daily debit ceiling; two recurring-free fallbacks have hard free-allocation stops and no paid overage. All five clean-English routes passed 5/5 cases.',
    healthMethod: [evidence('groq-speech-qualification.v1.json'), evidence('cloudflare-modality-screen.v1.json'), evidence('transcription-source-benchmark.v1.json'), 'tests/contract/deepgram-transcription-adapter.test.mjs', 'docs/evidence/stage6/deepgram-speech-screen.v1.json'], secretLocations: ['legacy_import:DEEPGRAM_API_KEY,GROQ_API_KEY,CLOUDFLARE_API_TOKEN'], replacementPlan: 'Add the explicit ai.transcribe wire contract required to expose the completed primary adapter, then implement the two qualified fallback adapters and route exact identities without model substitution.'
  },
  {
    capabilityId: 'search.web', publicAssets: priced('search-supply-pricing.v1.json'), lifecycle: 'production', routeState: 'qualified_provider_neutral_adapters_ready', primaryServices: ['supply.brave_search'], fallbackServices: ['supply.serper'], pricingCatalogs: [ref('search-supply-pricing.v1.json')], quality: 'best', termsStatus: 'restricted', quotaRunway: 'The primary has a recurring 1,000-call monthly credit and a matching hard ceiling; the independent fallback has an unexposed starter remainder and its own ceiling. Automatic paid overage and account pooling are disabled.', healthMethod: [evidence('brave-search-qualification.v1.json'), evidence('serper-qualification.v1.json'), 'tests/contract/search-supply-routing.test.mjs'], secretLocations: ['legacy_import:BRAVE_SEARCH_API_KEY,SERPER_API_KEY'], replacementPlan: 'Compose the ready provider-neutral router into the next production search deployment, retain transient-only processing, and move to official paid capacity after revenue.'
  },
  {
    capabilityId: 'rpc.multichain', publicAssets: priced('rpc-supply-pricing.v1.json'), lifecycle: 'internal_only', routeState: 'dedicated_technical_routes_terms_blocked', primaryServices: [], fallbackServices: [], pricingCatalogs: [ref('rpc-supply-pricing.v1.json')], quality: 'mixed', termsStatus: 'blocked', quotaRunway: 'The dedicated key has a pooled 210 million CU allowance per 30 days. Ten networks passed all five stability samples, Base and Optimism recovered after cooldown, and BSC remained custom-rate-limited; none may serve customers without compatible downstream terms.', healthMethod: [evidence('drpc-stability-qualification.v1.json'), evidence('drpc-recovery-qualification.v1.json'), evidence('drpc-terms-review.v1.json'), evidence('public-rpc-mesh-qualification.v1.json'), evidence('helius-qualification.v1.json')], secretLocations: ['legacy_import:DRPC_API_KEY', 'none:NO_CUSTOMER_ROUTE'], replacementPlan: 'Obtain written raw-RPC gateway permission or source an expressly resale-compatible provider; retain the dedicated and public routes for qualification and emergency internal reads only.'
  },
  {
    capabilityId: 'blockchain.data', publicAssets: priced('blockchain-data-supply-pricing.v1.json'), lifecycle: 'mixed', routeState: 'qualified_value_added_routes', primaryServices: ['supply.blockscout_pro'], fallbackServices: [], pricingCatalogs: [ref('blockchain-data-supply-pricing.v1.json')], quality: 'mixed', termsStatus: 'mixed', quotaRunway: 'The selected no-card multichain source advertises 100,000 daily credits and 5 RPS with a 100,000-call hard ceiling. The existing local-development source remains terms-blocked and is not a customer fallback.', healthMethod: [evidence('blockscout-market-preflight.v1.json'), evidence('blockscout-qualification.v1.json'), evidence('zerion-qualification.v1.json'), 'tests/contract/blockchain-data-adapter.test.mjs'], secretLocations: ['runtime:BLOCKSCOUT_API_KEY', 'legacy_import:ZERION_API_KEY'], replacementPlan: 'Operate only normalized value-added wallet, token, and transaction routes behind the bounded adapter; add an independent terms-compatible data family after revenue and keep raw RPC and protocol-directory scopes separate.'
  },
  {
    capabilityId: 'storage.object', publicAssets: priced('storage-supply-pricing.v1.json'), lifecycle: 'preview', routeState: 'qualified_bounded_adapter', primaryServices: ['supply.cloudflare_r2'], fallbackServices: [], pricingCatalogs: [ref('storage-supply-pricing.v1.json')], quality: 'good', termsStatus: 'restricted', quotaRunway: 'Published recurring free allowance and strict per-process storage/read/write/delete ceilings are known; account usage and automatic overage state are not exposed by S3, so horizontally scaled production remains blocked on a durable global ledger.', healthMethod: [evidence('cloudflare-r2-qualification.v1.json'), evidence('r2-control-plane-diagnostic.v1.json'), evidence('r2-lifecycle-qualification.v1.json'), 'tests/contract/object-storage-adapter.test.mjs'], secretLocations: ['runtime:R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY,R2_S3_ENDPOINT'], replacementPlan: 'Add a durable global usage ledger before horizontal production scaling, keep the bucket private and credential single-bucket scoped, and source an independent storage family after revenue if availability requires it.'
  },
  {
    capabilityId: 'payment.x402', publicAssets: priced('payment-supply-pricing.v1.json'), lifecycle: 'mixed', routeState: 'blocked_payment_proof_and_fallback', primaryServices: ['supply.cdp_x402'], fallbackServices: [], pricingCatalogs: [ref('payment-supply-pricing.v1.json')], quality: 'good', termsStatus: 'restricted', quotaRunway: 'Discovery is free; production verification and settlement require a hard billing guard. The public testnet facilitator is never a production fallback.', healthMethod: [evidence('x402-facilitator-qualification.v1.json')], secretLocations: ['legacy_import:CDP_API_KEY_ID,CDP_API_KEY_SECRET'], replacementPlan: 'After explicit owner approval, run one bounded settlement proof with idempotency, replay, reconciliation, and cost controls; source a separate production fallback later.'
  },
  {
    capabilityId: 'platform.integrations', publicAssets: priced('platform-integration-supply-pricing.v1.json'), lifecycle: 'mixed', routeState: 'qualified_auth_mutations_pending', primaryServices: ['supply.github_source', 'supply.devto', 'supply.hashnode', 'supply.telegram'], fallbackServices: [], pricingCatalogs: [ref('platform-integration-supply-pricing.v1.json')], quality: 'mixed', termsStatus: 'mixed', quotaRunway: 'Authentication probes were read-only; owner credentials are internal and never delegated. Publishing and messaging quotas remain unmeasured until bounded mutations are approved by product work.', healthMethod: [evidence('platform-integration-qualification.v1.json')], secretLocations: ['legacy_import:GITHUB_TOKEN,DEVTO_API_KEY,HASHNODE_API_KEY,TELEGRAM_BOT_TOKEN'], replacementPlan: 'Use customer OAuth or app-scoped credentials for delegated features; retain internal identity infrastructure only for Clervo authentication.'
  }
];

const ownerBlockers = [
  { blockerId: 'owner.rpc_commercial_permission', requiredAction: 'Obtain written permission for paid customer-facing RPC gateway use or approve an expressly compatible replacement after the remaining zero-cash market check.', unblocks: ['rpc.multichain'], spendingAuthorized: false },
];

const output = {
  schemaVersion: 'clervo.supply-route-matrix.v1', evaluatedAt: market.evaluatedAt,
  policy: { providerNamesPublic: false, exactModelSubstitutionAllowed: false, automaticPaidOverageAllowed: false, customerFreeByDefault: false, pricingIsReferencedNotDuplicated: true },
  catalogCoverage, capabilities, ownerBlockers,
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
