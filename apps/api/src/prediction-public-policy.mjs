import { readFileSync } from 'node:fs';

const sourceRegistryUrl = new URL('../../../infra/prediction/source-routes.v1.json', import.meta.url);
const pricingRegistryUrl = new URL('../../../packages/catalog/prediction-product-pricing.v1.json', import.meta.url);

function readJson(url, code) {
  try { return JSON.parse(readFileSync(url, 'utf8')); }
  catch { throw new Error(code); }
}

export const PREDICTION_SOURCE_REGISTRY = Object.freeze(readJson(sourceRegistryUrl, 'prediction_source_registry_invalid'));
export const PREDICTION_PRICING_REGISTRY = Object.freeze(readJson(pricingRegistryUrl, 'prediction_pricing_registry_invalid'));

export function declaredPredictionVenueIds(registry = PREDICTION_SOURCE_REGISTRY) {
  if (!registry || !Array.isArray(registry.sources)) throw new TypeError('prediction_source_registry_invalid');
  const venues = [...new Set(registry.sources.flatMap((source) => source.venueIds ?? [source.venueId]))];
  if (venues.length < 1 || venues.length > 16 || venues.some((venue) => !/^[a-z][a-z0-9_]{1,63}$/u.test(venue ?? ''))) throw new TypeError('prediction_source_registry_invalid');
  return Object.freeze(venues);
}

export function sellablePredictionSources(registry = PREDICTION_SOURCE_REGISTRY, nowMs = Date.now()) {
  if (!registry || registry.schemaVersion !== 'clervo.prediction-source-routes.v1' || !Array.isArray(registry.sources) || !Number.isSafeInteger(nowMs) || nowMs < 0) throw new TypeError('prediction_source_registry_invalid');
  const sources = registry.sources.filter((source) => source.technicalQualification === 'qualified'
    && Number.isFinite(Date.parse(source.technicalObservedAt)) && Date.parse(source.technicalObservedAt) <= nowMs
    && Number.isFinite(Date.parse(source.technicalExpiresAt)) && Date.parse(source.technicalExpiresAt) > nowMs
    && source.commercialPermission === 'approved'
    && source.publicSellable === true
    && source.customerRoutingEnabled === true);
  if (registry.customerRoutingEnabled !== true || sources.length < 1) throw new Error('prediction_public_sources_unapproved');
  const normalized = sources.map((source) => {
    const venueIds = source.venueIds ?? [source.venueId];
    if (!Array.isArray(venueIds) || venueIds.length < 1 || venueIds.length > 16 || new Set(venueIds).size !== venueIds.length
      || venueIds.some((venueId) => !/^[a-z][a-z0-9_]{1,63}$/u.test(venueId ?? ''))) throw new TypeError('prediction_source_registry_invalid');
    const sourceId = source.sourceId ?? `prediction.source.${venueIds[0]}_legacy`;
    const adapterId = source.adapterId ?? `adapter_prediction.${venueIds[0] === 'polymarket' ? 'polymarket_gamma' : venueIds[0] === 'kalshi' ? 'kalshi_market_data' : 'unavailable'}`;
    return Object.freeze({ ...source, sourceId, adapterId, venueIds: Object.freeze([...venueIds]) });
  });
  const boundVenues = normalized.flatMap(({ venueIds }) => venueIds);
  if (new Set(boundVenues).size !== boundVenues.length) throw new Error('prediction_public_venue_binding_ambiguous');
  return Object.freeze(normalized);
}

export function predictionProductPrice(productId, registry = PREDICTION_PRICING_REGISTRY) {
  if (!registry || registry.schemaVersion !== 'clervo.prediction-product-pricing.v1' || !Array.isArray(registry.products)) throw new TypeError('prediction_pricing_registry_invalid');
  const product = registry.products.find((entry) => entry.productId === productId);
  if (!product || !Number.isSafeInteger(product.customerPriceMicrousd) || !Number.isSafeInteger(product.supplierCostMicrousd)
    || !Number.isSafeInteger(product.infrastructureCostAllowanceMicrousd)
    || product.customerPriceMicrousd < registry.minimumBillableMicrousd
    || product.customerPriceMicrousd <= product.supplierCostMicrousd + product.infrastructureCostAllowanceMicrousd) throw new TypeError('prediction_pricing_invalid');
  return Object.freeze({
    priceVersion: `${registry.priceVersion}-${productId}`,
    amountAtomic: String(product.customerPriceMicrousd),
    supplierCostAtomic: String(product.supplierCostMicrousd),
  });
}
