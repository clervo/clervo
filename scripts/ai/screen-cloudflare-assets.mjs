#!/usr/bin/env node

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const credential = process.env.CLOUDFLARE_AI_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
if (typeof accountId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/u.test(accountId) || typeof credential !== 'string' || credential.length < 20 || /[\r\n]/u.test(credential)) throw new TypeError('cloudflare_screen_configuration_invalid');

const endpoint = new URL(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search`);
endpoint.searchParams.set('per_page', '100');
endpoint.searchParams.set('hide_experimental', 'true');
const response = await fetch(endpoint, { headers: { authorization: `Bearer ${credential}`, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
const text = await response.text();
if (text.length > 5_000_000) throw new TypeError('cloudflare_screen_response_too_large');
let body;
try { body = JSON.parse(text); } catch { throw new TypeError('cloudflare_screen_response_invalid'); }
if (!response.ok || body?.success !== true || !Array.isArray(body.result)) throw new TypeError('cloudflare_screen_request_failed');

function properties(model) {
  return new Map((Array.isArray(model.properties) ? model.properties : []).map(({ property_id: key, value }) => [key, value]));
}

function roundPrice(value) {
  return Number(Math.max(value * 0.4, 0.000001).toFixed(7));
}

function categoryPrice(task) {
  switch (task) {
    case 'Text Generation': return [{ unit: 'per M input tokens', price: 0.05 }, { unit: 'per M output tokens', price: 0.2 }];
    case 'Text Embeddings': return [{ unit: 'per M input tokens', price: 0.005 }];
    case 'Text-to-Image': return [{ unit: 'per generated image', price: 0.005 }];
    case 'Text-to-Speech': return [{ unit: 'per 1k characters', price: 0.01 }];
    case 'Automatic Speech Recognition': return [{ unit: 'per audio minute', price: 0.0004 }];
    case 'Image-to-Text': return [{ unit: 'per M input tokens', price: 0.1 }, { unit: 'per M output tokens', price: 0.4 }];
    case 'Translation': return [{ unit: 'per M input tokens', price: 0.1 }, { unit: 'per M output tokens', price: 0.1 }];
    case 'Dumb Pipe': return [{ unit: 'per audio minute', price: 0.0002 }];
    default: return [{ unit: 'per inference request', price: 0.00001 }];
  }
}

const assets = body.result.map((model) => {
  const values = properties(model);
  const task = typeof model.task?.name === 'string' ? model.task.name : typeof model.task === 'string' ? model.task : 'Unknown Task';
  const sourcePrices = Array.isArray(values.get('price')) ? values.get('price') : [];
  const supplierPrices = sourcePrices.filter(({ unit, price, currency }) => typeof unit === 'string' && Number.isFinite(price) && price >= 0 && currency === 'USD').map(({ unit, price }) => ({ unit, price }));
  const paid = values.get('require_workers_paid') === 'true';
  const beta = values.get('beta') === 'true';
  return {
    modelId: model.name,
    task,
    lifecycle: beta ? 'beta' : 'production',
    accessStatus: paid ? 'requires_paid_plan' : 'free_allocation_available',
    listingStatus: paid ? 'priced_requires_paid_plan' : 'priced_pending_qualification',
    qualityGrade: 'unranked',
    supplierPriceKnown: supplierPrices.length > 0 && supplierPrices.every(({ price }) => price > 0),
    supplierPrices,
    customerPrices: supplierPrices.length > 0 && supplierPrices.some(({ price }) => price > 0) ? supplierPrices.map(({ unit, price }) => ({ unit, price: roundPrice(price) })) : categoryPrice(task),
    pricingMethod: supplierPrices.length > 0 && supplierPrices.some(({ price }) => price > 0) ? 'introductory_40_percent_shadow' : 'category_introductory_price',
    termsUrl: typeof values.get('terms') === 'string' && values.get('terms').startsWith('https://') ? values.get('terms') : null,
  };
}).sort((left, right) => left.modelId.localeCompare(right.modelId));

if (assets.length !== 61 || new Set(assets.map(({ modelId }) => modelId)).size !== assets.length) throw new TypeError('cloudflare_screen_catalog_count_invalid');
const output = {
  schemaVersion: 'clervo.ai-edge-free-pricing.v1',
  priceVersion: '2026-08-02.1',
  evaluatedAt: new Date().toISOString(),
  currency: 'USD',
  providerVisibility: 'internal_only',
  policy: { customerFreeByDefault: false, positiveMarginRequiredAtLaunch: false, unknownSupplierDebitBlocksPricing: false, qualifiedRoutesAreSellable: true, paidPlanAssetsSellable: false, providerPassThroughAllowed: false, thirdPartyModelTermsRequired: true },
  freeGuard: { dailyNeurons: 10_000, resetTimeUtc: '00:00', automaticPaidUpgradeAllowed: false, automaticPaidOverageAllowed: false, hardStopRequired: true, applicationUsageLedgerRequired: true },
  discovery: { authenticated: true, hideExperimental: true, includeDeprecated: false, modelCount: assets.length, externalCalls: 2, ownerCashSpentUsd: 0, secretValuesRecorded: false },
  assets,
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
