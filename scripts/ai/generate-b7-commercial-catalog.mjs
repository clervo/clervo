#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const observedAt = '2026-08-10T19:09:36.000Z';
const validUntil = '2026-09-09T19:09:36.000Z';
const permissionValidUntil = '2027-08-10T19:09:36.000Z';
const ownerDecisionRef = 'owner://instruction/2026-08-10/b7-frozen-production-commercialization';

const zeroPricing = Object.freeze({
  currency: 'USD', decimals: 6,
  inputTokenMicrosPerMillion: 0,
  cachedInputTokenMicrosPerMillion: 0,
  outputTokenMicrosPerMillion: 0,
  reasoningTokenMicrosPerMillion: 0,
  imageMicrosEach: 0,
  audioMicrosPerThousandCharacters: 0,
  videoMicrosPerSecond: 0,
  musicMicrosPerGeneration: 0,
  virtualTryOnMicrosPerImage: 0,
});

const freeModels = new Set([
  'clervo/gemma-4-26b-a4b-it',
  'clervo/gpt-oss-20b',
  'clervo/laguna-s-2.1',
  'clervo/nemotron-3-nano-omni-30b-a3b-reasoning',
]);

const aliasContracts = Object.freeze({
  'clervo/gpt-5.6-luna': ['clervo/fast'],
  'clervo/gpt-5.6-terra': ['clervo/smart'],
  'clervo/gpt-5.6-sol': ['clervo/code', 'clervo/deep'],
});

const officialMediaFloors = Object.freeze({
  'clervo/gemini-2.5-flash-image': { field: 'imageMicrosEach', amount: 39_000, source: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing', basis: 'exact_model_1k_image' },
  'clervo/gemini-3.1-flash-lite-image': { field: 'imageMicrosEach', amount: 34_000, source: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing', basis: 'exact_model_1k_image' },
  'clervo/gemini-3.1-flash-image': { field: 'imageMicrosEach', amount: 67_000, source: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing', basis: 'exact_model_1k_image' },
  'clervo/gemini-3-pro-image': { field: 'imageMicrosEach', amount: 134_000, source: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing', basis: 'exact_model_1k_image' },
  'clervo/veo-3.1-generate-001': { field: 'videoMicrosPerSecond', amount: 400_000, source: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing', basis: 'exact_model_720p_video_with_audio_second' },
  'clervo/veo-3.1-fast-generate-001': { field: 'videoMicrosPerSecond', amount: 100_000, source: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing', basis: 'exact_model_720p_video_with_audio_second' },
  'clervo/veo-3.1-lite-generate-001': { field: 'videoMicrosPerSecond', amount: 50_000, source: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing', basis: 'exact_model_720p_video_with_audio_second' },
  'clervo/gemini-omni-flash-preview': { field: 'videoMicrosPerSecond', amount: 50_000, source: 'https://blockrun.ai/docs/api-reference/video-generation', basis: 'durable_market_video_second_floor' },
  'clervo/lyria-3-clip-preview': { field: 'musicMicrosPerGeneration', amount: 40_000, source: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing', basis: 'exact_model_30_second_clip' },
  'clervo/lyria-3-pro-preview': { field: 'musicMicrosPerGeneration', amount: 80_000, source: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing', basis: 'exact_model_full_song' },
  'clervo/virtual-try-on-001': { field: 'virtualTryOnMicrosPerImage', amount: 60_000, source: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing', basis: 'exact_model_image' },
});

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function normalize(value) { return value.toLowerCase().replace(/[^a-z0-9]/gu, ''); }
function stable(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function roundAtomic(value) { return Math.max(0, Math.round(value)); }

async function json(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new TypeError(`b7_market_http_${response.status}`);
  return response.json();
}

function identityFor(model) {
  const digest = hash(model.id);
  return Object.freeze({
    gatewaySupplyId: `aisupply_b7_${digest.slice(0, 24)}`,
    customerModelId: model.id,
    routeId: `ai.route.dynamic_${digest.slice(0, 20)}`,
    assignedAt: observedAt,
    assignment: 'owner_assigned',
    aliases: aliasContracts[model.id] ?? [],
  });
}

function shapeFor(model) {
  const reasoning = model.reasoning === true;
  if (['text', 'safety', 'vlm'].includes(model.capability)) return {
    modality: 'chat', inputTypes: model.capability === 'vlm' ? ['text', 'image'] : ['text'], outputTypes: ['text'],
    capabilities: ['text_input', ...(model.capability === 'vlm' ? ['image_input'] : []), 'text_output', ...(reasoning ? ['reasoning'] : [])],
  };
  if (model.capability === 'embedding') return { modality: 'embedding', inputTypes: ['text'], outputTypes: ['embedding'], capabilities: ['text_input', 'embedding_output'] };
  if (model.capability === 'image') return { modality: 'image', inputTypes: ['text'], outputTypes: ['image'], capabilities: ['text_input', 'image_output'] };
  if (model.capability === 'tts') return { modality: 'speech', inputTypes: ['text'], outputTypes: ['audio'], capabilities: ['text_input', 'audio_output'] };
  if (model.capability === 'video') return { modality: 'video', inputTypes: ['text'], outputTypes: ['video'], capabilities: ['text_input', 'video_output'] };
  if (model.capability === 'music') return { modality: 'music', inputTypes: ['text'], outputTypes: ['audio'], capabilities: ['text_input', 'audio_output', 'music_output'] };
  if (model.capability === 'virtual_try_on') return { modality: 'virtual_try_on', inputTypes: ['image'], outputTypes: ['image'], capabilities: ['image_input', 'image_output'] };
  throw new TypeError(`b7_capability_unsupported:${model.capability}`);
}

function title(modelId) {
  return modelId.slice('clervo/'.length).split('-').map((part) => part.length <= 3 && /^\d+(?:\.\d+)*$/u.test(part) ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function fallbackTokenFloor(modelId) {
  if (/(?:7b|8b|12b|14b|20b|a13b|nano|flash|safeguard|safety|guard|allam|laguna)/iu.test(modelId)) return { input: 100_000, output: 400_000, basis: 'economy_market_basket_floor' };
  if (/(?:27b|30b|31b|32b|36b|70b|72b|medium|m2\.5|v3)/iu.test(modelId)) return { input: 300_000, output: 1_200_000, basis: 'standard_market_basket_floor' };
  return { input: 1_000_000, output: 4_000_000, basis: 'advanced_market_basket_floor' };
}

function strategic(modelId) {
  return /(?:gpt-5\.6|claude-(?:opus|sonnet)|deepseek-v4-pro|kimi-k3|qwen3\.5-397b|glm-5\.2|minimax-m2\.5)/iu.test(modelId);
}

function discounted(amount, basisPoints) { return roundAtomic((amount * (10_000 - basisPoints)) / 10_000); }

const freeze = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-b7-production-freeze.v1.json'), 'utf8'));
if (freeze.inventory.canonicalModels !== freeze.canonicalModels.length || freeze.inventory.aliases !== freeze.aliases.length) throw new TypeError('b7_freeze_inventory_mismatch');
const [blockrun, openrouter] = await Promise.all([
  json('https://blockrun.ai/api/v1/models'),
  json('https://openrouter.ai/api/v1/models'),
]);
const blockrunModels = blockrun.models ?? blockrun.data;
const openrouterModels = openrouter.data;
if (!Array.isArray(blockrunModels) || !Array.isArray(openrouterModels)) throw new TypeError('b7_market_shape_invalid');

const evidence = [];
const identities = freeze.canonicalModels.map(identityFor);
const identityByModel = new Map(identities.map((entry) => [entry.customerModelId, entry]));
const authorityModels = [];
const supplyModels = [];
const permissions = [];
const overrides = [];

for (const model of freeze.canonicalModels) {
  const identity = identityByModel.get(model.id);
  const shape = shapeFor(model);
  let floor = { ...zeroPricing };
  let evidenceRefs = [];
  let marketBasis;
  let discountBasisPoints = 2_500;

  if (shape.modality === 'chat') {
    const suffix = normalize(model.id.slice('clervo/'.length));
    const offers = [];
    for (const item of openrouterModels.filter((entry) => normalize(entry.id.split('/').at(-1).replace(/:free$/u, '')) === suffix)) {
      // OpenRouter publishes USD per token. Convert to atomic micro-USD per
      // million tokens: USD/token * 1e6 tokens * 1e6 micro-USD/USD.
      const input = Number(item.pricing?.prompt) * 1_000_000_000_000;
      const output = Number(item.pricing?.completion) * 1_000_000_000_000;
      if (Number.isFinite(input) && Number.isFinite(output) && input > 0 && output > 0) offers.push({ input: roundAtomic(input), output: roundAtomic(output), source: 'https://openrouter.ai/api/v1/models', competitor: 'OpenRouter', marketId: item.id });
    }
    for (const item of blockrunModels.filter((entry) => normalize(entry.id.split('/').at(-1)) === suffix)) {
      // BlockRun publishes USD per million tokens, so only the USD-to-micro-USD
      // conversion is required here.
      const input = Number(item.pricing?.input) * 1_000_000;
      const output = Number(item.pricing?.output) * 1_000_000;
      if (Number.isFinite(input) && Number.isFinite(output) && input > 0 && output > 0) offers.push({ input: roundAtomic(input), output: roundAtomic(output), source: 'https://blockrun.ai/api/v1/models', competitor: 'BlockRun', marketId: item.id });
    }
    const selected = offers.sort((left, right) => left.input + left.output - right.input - right.output)[0];
    const fallback = fallbackTokenFloor(model.id);
    const input = selected?.input ?? fallback.input;
    const output = selected?.output ?? fallback.output;
    marketBasis = selected === undefined ? fallback.basis : 'exact_model_durable_market_floor';
    if (freeModels.has(model.id)) discountBasisPoints = 10_000;
    else if (strategic(model.id)) discountBasisPoints = 5_000;
    else if (input <= 100_000 && output <= 400_000) discountBasisPoints = 1_000;
    floor = { ...zeroPricing, inputTokenMicrosPerMillion: input, cachedInputTokenMicrosPerMillion: input, outputTokenMicrosPerMillion: output, reasoningTokenMicrosPerMillion: output };
    if (selected !== undefined) {
      const ref = `market_${hash(`${selected.source}:${selected.marketId}:${input}:${output}`).slice(0, 20)}`;
      evidence.push({ evidenceId: ref, competitor: selected.competitor, marketModelId: selected.marketId, source: selected.source, observedAt, validUntil, pricing: { currency: 'USD', decimals: 6, inputTokenMicrosPerMillion: input, outputTokenMicrosPerMillion: output } });
      evidenceRefs = [ref];
    }
  } else if (shape.modality === 'embedding') {
    const amount = model.id.includes('multimodal') ? 800_000 : model.id.includes('gemini-embedding') ? 150_000 : 100_000;
    floor = { ...zeroPricing, inputTokenMicrosPerMillion: amount, cachedInputTokenMicrosPerMillion: amount };
    marketBasis = 'official_embedding_market_floor';
    discountBasisPoints = 1_000;
    evidenceRefs = ['market_official_embedding_20260810'];
  } else if (shape.modality === 'speech') {
    floor = { ...zeroPricing, audioMicrosPerThousandCharacters: 50_000 };
    marketBasis = 'durable_tts_market_floor';
    evidenceRefs = ['market_tts_floor_20260810'];
  } else {
    const media = officialMediaFloors[model.id];
    if (media === undefined) throw new TypeError(`b7_media_price_missing:${model.id}`);
    floor = { ...zeroPricing, [media.field]: media.amount };
    marketBasis = media.basis;
    const ref = `market_${hash(`${media.source}:${model.id}:${media.amount}`).slice(0, 20)}`;
    evidence.push({ evidenceId: ref, competitor: 'Official market source', marketModelId: model.id, source: media.source, observedAt, validUntil, pricing: { currency: 'USD', decimals: 6, [media.field]: media.amount } });
    evidenceRefs = [ref];
  }

  const customerPricing = Object.fromEntries(Object.entries(floor).map(([key, value]) => [key, typeof value === 'number' && !['decimals'].includes(key) ? discounted(value, discountBasisPoints) : value]));
  const billingMode = freeModels.has(model.id) ? 'free' : 'metered';
  const pricingClass = billingMode === 'free' ? 'durable_market_free' : strategic(model.id) ? 'strategic_half_market' : discountBasisPoints === 1_000 ? 'extremely_cheap_sensible_undercut' : 'normal_quarter_below_market';
  authorityModels.push({ modelId: model.id, billingMode, pricingClass, marketBasis, discountBasisPoints, evidenceRefs, customerPricing });
  const cost = { ...zeroPricing };
  supplyModels.push({
    gatewaySupplyId: identity.gatewaySupplyId,
    runtimeModelId: model.id,
    marketModelId: model.id,
    display: { name: title(model.id), description: `${title(model.id)} through Clervo's normalized ${shape.modality.replaceAll('_', ' ')} contract.` },
    modalities: [shape.modality], inputTypes: shape.inputTypes, outputTypes: shape.outputTypes, capabilities: shape.capabilities,
    limits: {},
    qualification: { state: 'qualified', checkedAt: observedAt, expiresAt: validUntil, evidenceRef: `production://ai.clervo.dev/catalog/${freeze.inventory.idFingerprint}` },
    availability: { state: 'available', reason: null, observedAt },
    upstreamCost: { state: 'known', pricing: cost, authorityRef: 'owner://instruction/2026-08-10/b7-low-zero-current-supply-cost', observedAt, validUntil },
    quality: { score: model.reasoning === true ? 0.9 : 0.8, evidenceRef: `production://ai.clervo.dev/catalog/${freeze.inventory.catalogFingerprint}` },
  });
  permissions.push({ gatewaySupplyId: identity.gatewaySupplyId, state: 'approved', ownerDecisionRef, observedAt, validUntil: permissionValidUntil });
  overrides.push({ gatewaySupplyId: identity.gatewaySupplyId, customerPricing, maximumSubsidy: zeroPricing, ownerAuthorizationRef: ownerDecisionRef, budgetRef: billingMode === 'free' ? 'budget://b7-zero-cost-free-tier-capped' : 'budget://b7-no-subsidy', startsAt: observedAt, expiresAt: validUntil });
}

evidence.push(
  { evidenceId: 'market_official_embedding_20260810', competitor: 'Official market source', marketModelId: 'embedding-market-floor', source: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing', observedAt, validUntil, pricing: { currency: 'USD', decimals: 6, inputTokenMicrosPerMillion: 100_000 } },
  { evidenceId: 'market_tts_floor_20260810', competitor: 'Durable market floor', marketModelId: 'tts-market-floor', source: 'https://www.blockrun.ai/docs/api-reference/text-to-speech', observedAt, validUntil, pricing: { currency: 'USD', decimals: 6, audioMicrosPerThousandCharacters: 50_000 } },
);

const outputs = Object.freeze({
  'ai-b7-market-price-evidence.v1.json': { schemaVersion: 'ai-b7-market-price-evidence.v1', revision: `b7market_${hash(stable(evidence)).slice(0, 24)}`, observedAt, validUntil, evidence: evidence.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)) },
  'ai-b7-commercial-pricing.v1.json': { schemaVersion: 'ai-b7-commercial-pricing.v1', revision: `b7price_${hash(stable(authorityModels)).slice(0, 24)}`, effectiveAt: observedAt, validUntil, currency: 'USDC', decimals: 6, minimumBillableAtomic: '1000', providerNamesPublic: false, policy: { strategicDiscountBasisPoints: 5_000, normalDiscountBasisPoints: 2_500, extremelyCheapDiscountBasisPoints: 1_000, internalSupplierCostDeterminesCustomerPrice: false, freeRequiresExactMarketEvidenceAndZeroCurrentSupplyCost: true }, freeTier: { enabled: true, perWalletDailyRequests: 20, globalDailyRequests: 2_000, automaticPaidOverageAllowed: false }, models: authorityModels.sort((left, right) => left.modelId.localeCompare(right.modelId)) },
  'ai-b7-qualified-supply.v1.json': { schemaVersion: 'qualified-ai-supply-catalog.v1', catalogRevision: `b7supply_${freeze.inventory.idFingerprint.slice('sha256:'.length, 'sha256:'.length + 24)}`, generatedAt: observedAt, sourceObservedAt: observedAt, validUntil, models: supplyModels },
  'ai-b7-customer-identity-registry.v1.json': { schemaVersion: 'ai-customer-identity-registry.v1', revision: `b7identity_${hash(stable(identities)).slice(0, 24)}`, entries: identities },
  'ai-b7-commercial-permission.v1.json': { revision: `b7permission_${hash(stable(permissions)).slice(0, 24)}`, defaultState: 'unresolved', decisions: permissions, ownerDecisionLedger: [ownerDecisionRef] },
  'ai-b7-strategic-pricing-overrides.v1.json': { revision: `b7override_${hash(stable(overrides)).slice(0, 24)}`, overrides },
});

const directory = path.join(root, 'packages/catalog');
await mkdir(directory, { recursive: true });
for (const [name, value] of Object.entries(outputs)) {
  const target = path.join(directory, name);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, stable(value), { mode: 0o644 });
  await rename(temporary, target);
}
process.stdout.write(`B7 commercial catalog: PASS (${authorityModels.length} canonical, ${freeModels.size} free, ${authorityModels.length - freeModels.size} paid, ${evidence.length} market evidence records)\n`);
