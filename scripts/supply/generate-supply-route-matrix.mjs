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
  return ['routes', 'assets', 'models', 'chatRoutes', 'embeddingRoutes', 'imageRoutes', 'videoRoutes', 'speechRoutes', 'transcriptionRoutes'].flatMap((key) => Array.isArray(document[key]) ? document[key] : []);
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

const qualified = (product) => aiCatalog.routes.filter(({ productIds }) => productIds.includes(product)).map(({ exactModelId }) => exactModelId);
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
    pricingCatalogs: [ref('ai-credit-backed-pricing.v1.json'), ref('ai-edge-free-pricing.v1.json')], quality: 'best', termsStatus: 'restricted', quotaRunway: 'Allocated from the reported Vertex credit with deny-on-unknown usage; the edge BGE-M3 candidate lacks final accounting and adapter qualification.',
    healthMethod: [evidence('cloudflare-modality-screen.v1.json'), 'docs/evidence/stage6/vertex-embedding-screen.v1.json'], secretLocations: ['application_default:GCP_ADC', 'legacy_import:CLOUDFLARE_API_TOKEN'], replacementPlan: 'Finish BGE-M3 accounting and adapter qualification as the independent embedding fallback.'
  },
  {
    capabilityId: 'ai.image', publicAssets: qualified('ai.image'), lifecycle: 'production', routeState: 'qualified_single_family', primaryServices: ['supply.google_vertex'], fallbackServices: [],
    pricingCatalogs: [ref('ai-credit-backed-pricing.v1.json'), ref('ai-edge-free-pricing.v1.json')], quality: 'mixed', termsStatus: 'restricted', quotaRunway: 'Allocated from the reported Vertex credit; generated-image size and ledger ceilings remain mandatory.',
    healthMethod: [evidence('cloudflare-modality-screen.v1.json'), 'docs/evidence/stage6/vertex-multimodal-screen.v1.json'], secretLocations: ['application_default:GCP_ADC', 'legacy_import:CLOUDFLARE_API_TOKEN'], replacementPlan: 'Finish FLUX image-size, quality, accounting, and adapter checks before enabling it as an independent fallback.'
  },
  {
    capabilityId: 'ai.video', publicAssets: priced('ai-credit-backed-pricing.v1.json', ({ listingStatus, modelId }) => modelId?.startsWith('veo-') && listingStatus === 'sellable'), lifecycle: 'production', routeState: 'qualified_single_family', primaryServices: ['supply.google_vertex'], fallbackServices: [],
    pricingCatalogs: [ref('ai-credit-backed-pricing.v1.json')], quality: 'mixed', termsStatus: 'restricted', quotaRunway: 'USD 500 shadow allocation within the reported credit and USD 25 total daily shadow debit ceiling; no owner-cash overage.',
    healthMethod: ['docs/evidence/stage6/vertex-multimodal-screen.v1.json'], secretLocations: ['application_default:GCP_ADC'], replacementPlan: 'Keep the preview lite route unavailable and source a second production video family only after the primary route has customer demand.'
  },
  {
    capabilityId: 'ai.tts', publicAssets: qualified('ai.speech'), lifecycle: 'production', routeState: 'qualified_single_family', primaryServices: ['supply.deepgram'], fallbackServices: [],
    pricingCatalogs: [ref('ai-speech-pricing.v1.json'), ref('ai-edge-free-pricing.v1.json'), ref('ai-free-tier-pricing.v1.json')], quality: 'good', termsStatus: 'restricted', quotaRunway: 'USD 160 shadow allocation from the reported balance with USD 5 daily debit and USD 20 remaining-balance hard stop.',
    healthMethod: ['docs/evidence/stage6/deepgram-speech-screen.v1.json', evidence('cloudflare-modality-screen.v1.json'), evidence('groq-speech-qualification.v1.json')], secretLocations: ['legacy_import:DEEPGRAM_API_KEY,CLOUDFLARE_API_TOKEN,GROQ_API_KEY'], replacementPlan: 'Qualify the edge Aura route after accounting integration; preview Orpheus routes remain blocked on organization terms acceptance.'
  },
  {
    capabilityId: 'ai.stt', publicAssets: [...new Set([...priced('ai-speech-pricing.v1.json', ({ modelId }) => modelId === 'nova-3'), ...priced('ai-free-tier-pricing.v1.json', ({ assetType }) => assetType === 'transcription'), ...priced('ai-edge-free-pricing.v1.json', ({ task }) => task === 'Automatic Speech Recognition')])], lifecycle: 'mixed', routeState: 'qualified_integration_pending', primaryServices: ['supply.deepgram'], fallbackServices: ['supply.groq', 'supply.cloudflare_workers_ai'],
    pricingCatalogs: [ref('ai-speech-pricing.v1.json'), ref('ai-free-tier-pricing.v1.json'), ref('ai-edge-free-pricing.v1.json')], quality: 'mixed', termsStatus: 'restricted', quotaRunway: 'The funded primary and two recurring-free families were bounded live; customer accounting and response contracts still block production listing.',
    healthMethod: [evidence('groq-speech-qualification.v1.json'), evidence('cloudflare-modality-screen.v1.json'), 'docs/evidence/stage6/deepgram-speech-screen.v1.json'], secretLocations: ['legacy_import:DEEPGRAM_API_KEY,GROQ_API_KEY,CLOUDFLARE_API_TOKEN'], replacementPlan: 'Implement the normalized transcription adapter and usage ledger, then route exact identities without transcription-model substitution.'
  },
  {
    capabilityId: 'search.web', publicAssets: priced('search-supply-pricing.v1.json'), lifecycle: 'production', routeState: 'qualified_not_integrated_single_family', primaryServices: ['supply.serper'], fallbackServices: [], pricingCatalogs: [ref('search-supply-pricing.v1.json')], quality: 'good', termsStatus: 'allowed', quotaRunway: 'Starter balance is not exposed by the API; enforce the application ledger and single-account limit.', healthMethod: [evidence('serper-qualification.v1.json')], secretLocations: ['legacy_import:SERPER_API_KEY'], replacementPlan: 'Add the selected independent-index search key, benchmark the same corpus, and retain attribution and content-rights controls.'
  },
  {
    capabilityId: 'rpc.multichain', publicAssets: priced('rpc-supply-pricing.v1.json'), lifecycle: 'internal_only', routeState: 'dedicated_technical_routes_terms_blocked', primaryServices: [], fallbackServices: [], pricingCatalogs: [ref('rpc-supply-pricing.v1.json')], quality: 'mixed', termsStatus: 'blocked', quotaRunway: 'The dedicated key has a pooled 210 million CU allowance per 30 days. Ten networks passed all five stability samples, Base and Optimism recovered after cooldown, and BSC remained custom-rate-limited; none may serve customers without compatible downstream terms.', healthMethod: [evidence('drpc-stability-qualification.v1.json'), evidence('drpc-recovery-qualification.v1.json'), evidence('drpc-terms-review.v1.json'), evidence('public-rpc-mesh-qualification.v1.json'), evidence('helius-qualification.v1.json')], secretLocations: ['legacy_import:DRPC_API_KEY', 'none:NO_CUSTOMER_ROUTE'], replacementPlan: 'Obtain written raw-RPC gateway permission or source an expressly resale-compatible provider; retain the dedicated and public routes for qualification and emergency internal reads only.'
  },
  {
    capabilityId: 'blockchain.data', publicAssets: priced('blockchain-data-supply-pricing.v1.json'), lifecycle: 'internal_only', routeState: 'blocked_terms', primaryServices: [], fallbackServices: [], pricingCatalogs: [ref('blockchain-data-supply-pricing.v1.json')], quality: 'good', termsStatus: 'blocked', quotaRunway: 'The local-development key works at 5 RPS and 100 requests per day but prohibits production resale or service-bureau use.', healthMethod: [evidence('zerion-qualification.v1.json')], secretLocations: ['legacy_import:ZERION_API_KEY'], replacementPlan: 'Keep the technically complete adapter internal and source a production commercial agreement only when revenue can support it.'
  },
  {
    capabilityId: 'storage.object', publicAssets: priced('storage-supply-pricing.v1.json'), lifecycle: 'production', routeState: 'blocked_owner_credential', primaryServices: [], fallbackServices: [], pricingCatalogs: [ref('storage-supply-pricing.v1.json')], quality: 'unranked', termsStatus: 'restricted', quotaRunway: 'Published recurring free allowance is known, but account usage and automatic overage state are not exposed by S3.', healthMethod: [evidence('cloudflare-r2-qualification.v1.json')], secretLocations: ['legacy_import:R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY'], replacementPlan: 'Replace the rejected key with least privilege to one dedicated bucket, prove isolation and lifecycle, and fail closed before any billable overage.'
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
  { blockerId: 'owner.brave_search_account', requiredAction: 'Complete the recurring-free-credit Search subscription and card verification without approving a charge, then provide the dedicated key.', unblocks: ['search.web'], spendingAuthorized: false },
  { blockerId: 'owner.r2_key_reissue', requiredAction: 'Create a least-privilege object-storage key for one dedicated Clervo bucket and provide the bucket name through the secret channel.', unblocks: ['storage.object'], spendingAuthorized: false },
];

const output = {
  schemaVersion: 'clervo.supply-route-matrix.v1', evaluatedAt: market.evaluatedAt,
  policy: { providerNamesPublic: false, exactModelSubstitutionAllowed: false, automaticPaidOverageAllowed: false, customerFreeByDefault: false, pricingIsReferencedNotDuplicated: true },
  catalogCoverage, capabilities, ownerBlockers,
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
