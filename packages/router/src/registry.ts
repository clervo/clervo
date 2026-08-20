import { CLERVO_ROUTER_USER_AGENT } from './version.js';

export const DEFAULT_API_ORIGIN = 'https://api.clervo.dev' as const;
export const DISCOVERY_PATH = '/.well-known/clervo.json' as const;
const MAXIMUM_DISCOVERY_BYTES = 4_194_304;

export class RegistryError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'RegistryError';
  }
}

/*
 * The origin the router talks to.
 *
 * Overridable so the sequence can be proved against a staging origin, but never
 * downgradable: a payment authorization sent over plain HTTP is a payment
 * authorization an intercepting proxy can replay. Loopback is allowed because a
 * local test server is not a network.
 */
export function apiOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CLERVO_API_ORIGIN;
  if (configured === undefined || configured.trim().length < 1) return DEFAULT_API_ORIGIN;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new RegistryError('invalid_api_origin');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new RegistryError('unsafe_api_origin');
  if (url.username || url.password || url.search || url.hash) throw new RegistryError('invalid_api_origin');
  return url.origin;
}

export interface RegistryCapability {
  readonly productId: string;
  readonly family: string;
  readonly title: string;
  readonly summary: string;
  /* `live`, `supply_paused`, or `unavailable`, as the registry observed it. */
  readonly lifecycleState: string;
  readonly proofLevel: string;
  readonly reason: string | null;
  readonly freeRoute: string | null;
  readonly paidRoute: string | null;
  readonly priceAtomic: string | null;
  readonly priceVersion: string | null;
  readonly priceIsBinding: boolean;
  /* True only when the registry says the family is live and the product's own
   * entry says it is publicly available and payable. */
  readonly paidCallable: boolean;
  readonly freeCallable: boolean;
}

export interface Registry {
  readonly origin: string;
  readonly contractVersion: string;
  readonly discoveryVersion: string;
  readonly observedAt: string;
  readonly releaseId: string;
  readonly capabilities: readonly RegistryCapability[];
  readonly fetchedAt: string;
}

export interface AiCatalogModel {
  readonly id: string;
  readonly identityKind: 'canonical' | 'alias';
  readonly aliasFor: string | null;
  readonly productIds: readonly string[];
  readonly capabilities: readonly string[];
  readonly availability: string;
  readonly availabilityReason: string | null;
  readonly health: string;
  readonly publicSellable: boolean;
  readonly billingMode: 'free' | 'metered';
  readonly customerPricing: Readonly<Record<string, unknown>> | null;
  readonly commerce: Readonly<Record<string, unknown>>;
}

export interface AiModelCatalog {
  readonly origin: string;
  readonly revision: string;
  readonly sourceValidUntil: string;
  readonly inventory: Readonly<{ canonicalModels: number; aliases: number; callableIds: number }>;
  readonly models: readonly AiCatalogModel[];
}

/* Pricing models whose advertised amount is a per-call figure rather than
 * something derived from the request. Observed live: `x402_exact` and
 * `fixed_request` carry a `displayPrice`; `x402_request_quote` does not price
 * until it sees the request; `unavailable` is not for sale. */
const FIXED_PRICE_MODELS = Object.freeze(new Set(['x402_exact', 'fixed_request']));

function familyOf(productId: string): string {
  const family = productId.split('.', 1)[0] ?? '';
  /* The registry keys the Crypto family `crypto_intelligence` while its
   * operations are `crypto.*`. Mapping it here keeps the join honest instead of
   * silently reporting the family as absent. */
  return family === 'crypto' ? 'crypto_intelligence' : family;
}

async function readJson(response: Response, maximumBytes: number): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new RegistryError('registry_response_too_large');
  const text = await response.text();
  if (Buffer.byteLength(text) > maximumBytes) throw new RegistryError('registry_response_too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new RegistryError('registry_response_invalid_json');
  }
}

/*
 * Load the live catalog.
 *
 * Two views are joined, and both must agree before the router offers anything.
 * `products` carries the routes and the public price; `observedTruth.products`
 * carries what a probe of the deployed system actually saw. A product that
 * declares itself payable inside a family the probe found unreachable is not
 * offered — that disagreement is exactly the case where a client that trusted
 * the declaration alone would quote a customer for a 404.
 */
export async function loadRegistry({
  env = process.env,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
  timeoutMs = 20_000,
}: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: () => string; timeoutMs?: number } = {}): Promise<Registry> {
  const origin = apiOrigin(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(`${origin}${DISCOVERY_PATH}`, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': CLERVO_ROUTER_USER_AGENT },
      redirect: 'error',
      signal: controller.signal,
    });
  } catch (error) {
    throw new RegistryError('registry_unreachable', `could not reach ${origin}${DISCOVERY_PATH}: ${(error as Error)?.name ?? 'network error'}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new RegistryError('registry_status_unexpected', `${origin}${DISCOVERY_PATH} returned ${response.status}`);
  const document = await readJson(response, MAXIMUM_DISCOVERY_BYTES) as Record<string, unknown>;
  const products = Array.isArray(document.products) ? document.products as Record<string, unknown>[] : undefined;
  const observed = (document.observedTruth as Record<string, unknown> | undefined);
  const observedProducts = Array.isArray(observed?.products) ? observed.products as Record<string, unknown>[] : [];
  const provenance = (observed?.provenance as Record<string, unknown> | undefined) ?? {};
  if (products === undefined || typeof document.contractVersion !== 'string') throw new RegistryError('registry_shape_unexpected');

  const familyState = new Map<string, Record<string, unknown>>();
  for (const family of observedProducts) {
    if (typeof family.id === 'string') familyState.set(family.id, family);
  }

  const capabilities = products.flatMap((product): readonly RegistryCapability[] => {
    const productId = typeof product.productId === 'string' ? product.productId : '';
    const family = familyOf(productId);
    const observedFamily = familyState.get(family);
    const pricing = (product.pricing as Record<string, unknown> | undefined) ?? {};
    const displayPrice = (pricing.displayPrice as Record<string, unknown> | undefined) ?? undefined;
    const routes = (product.routes as Record<string, unknown> | undefined) ?? {};
    const payment = (product.payment as Record<string, unknown> | undefined) ?? {};
    const lifecycleState = typeof observedFamily?.lifecycleState === 'string' ? observedFamily.lifecycleState : 'unavailable';
    const familyReachable = observedFamily?.publiclyReachable === true && lifecycleState === 'live';
    const freeRoute = typeof routes.freeSample === 'string' ? routes.freeSample : null;
    const paidRoute = typeof routes.paidChallenge === 'string' ? routes.paidChallenge : null;
    const priceAtomic = typeof displayPrice?.amountAtomic === 'string' ? displayPrice.amountAtomic : null;
    const operationIds = productId === 'ai' && Array.isArray(product.operationIds)
      ? product.operationIds.filter((value): value is string => typeof value === 'string')
      : [productId];
    const aiExecute = productId === 'ai' && typeof routes.execute === 'string' ? routes.execute : null;
    const productPaidRoute = paidRoute ?? aiExecute;
    const productFreeRoute = freeRoute ?? aiExecute;
    return Object.freeze(operationIds.map((operationId) => Object.freeze({
      productId: operationId,
      family,
      title: typeof product.title === 'string' ? product.title : productId,
      summary: typeof product.summary === 'string' ? product.summary : '',
      lifecycleState,
      proofLevel: typeof observedFamily?.proofLevel === 'string' ? observedFamily.proofLevel : 'none',
      reason: typeof observedFamily?.reason === 'string' ? observedFamily.reason : null,
      freeRoute: productFreeRoute,
      paidRoute: productPaidRoute,
      priceAtomic,
      priceVersion: typeof pricing.priceVersion === 'string' ? pricing.priceVersion : null,
      /* A displayed price is only worth showing as a number for a product the
       * seller prices per call. `x402_request_quote` products such as `ai.chat`
       * are priced from the request itself, so no figure is shown for them and
       * the price is discovered from the 402.
       *
       * Even for a fixed-price product this is the registry's advertised figure,
       * not a promise: the 402 is the only binding quote, and `clervo run`
       * always shows the quoted amount before anything is signed. The registry's
       * `priceVersion` is observed to lag the live quote's, which is exactly why
       * this value is never used to authorize a payment. */
      priceIsBinding: priceAtomic !== null && FIXED_PRICE_MODELS.has(pricing.model as string),
      paidCallable: familyReachable && product.publicAvailable === true && payment.payable === true && productPaidRoute !== null,
      freeCallable: familyReachable && productFreeRoute !== null && product.publicAvailable === true,
    })));
  }).filter((capability) => capability.productId.length > 0);

  return Object.freeze({
    origin,
    contractVersion: document.contractVersion,
    discoveryVersion: typeof document.discoveryVersion === 'string' ? document.discoveryVersion : 'unknown',
    observedAt: typeof provenance.observedAt === 'string' ? provenance.observedAt : 'unknown',
    releaseId: typeof provenance.releaseId === 'string' ? provenance.releaseId : 'unknown',
    capabilities: Object.freeze(capabilities),
    fetchedAt: now(),
  });
}

export function capabilityFor(registry: Registry, productId: string): RegistryCapability {
  const capability = registry.capabilities.find((entry) => entry.productId === productId);
  if (capability === undefined) throw new RegistryError('capability_not_in_registry', `${productId} is not in the live catalog`);
  return capability;
}

export async function loadAiModelCatalog({ env = process.env, fetchImpl = fetch }: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}): Promise<AiModelCatalog> {
  const origin = apiOrigin(env);
  const response = await fetchImpl(`${origin}/v1/models`, { method: 'GET', headers: { accept: 'application/json', 'user-agent': CLERVO_ROUTER_USER_AGENT }, redirect: 'error' });
  if (!response.ok) throw new RegistryError('ai_catalog_status_unexpected', `${origin}/v1/models returned ${response.status}`);
  const value = await readJson(response, MAXIMUM_DISCOVERY_BYTES) as Record<string, unknown>;
  const data = Array.isArray(value.data) ? value.data as Record<string, unknown>[] : undefined;
  const metadata = value.clervo as Record<string, unknown> | undefined;
  const inventory = metadata?.inventory as Record<string, unknown> | undefined;
  if (value.object !== 'list' || data === undefined || metadata === undefined || inventory === undefined) throw new RegistryError('ai_catalog_shape_unexpected');
  const models = data.map((entry): AiCatalogModel => {
    const clervo = entry.clervo as Record<string, unknown> | undefined;
    if (typeof entry.id !== 'string' || entry.object !== 'model' || entry.owned_by !== 'clervo' || clervo === undefined || !Array.isArray(clervo.productIds) || !Array.isArray(clervo.capabilities) || !['canonical', 'alias'].includes(String(clervo.identityKind)) || !['free', 'metered'].includes(String(clervo.billingMode))) throw new RegistryError('ai_catalog_model_invalid');
    return Object.freeze({
      id: entry.id,
      identityKind: clervo.identityKind as 'canonical' | 'alias',
      aliasFor: typeof clervo.aliasFor === 'string' ? clervo.aliasFor : null,
      productIds: Object.freeze(clervo.productIds.map(String)),
      capabilities: Object.freeze(clervo.capabilities.map(String)),
      availability: String(clervo.availability ?? 'unavailable'),
      availabilityReason: typeof clervo.availabilityReason === 'string' ? clervo.availabilityReason : null,
      health: String(clervo.health ?? 'unavailable'),
      publicSellable: clervo.publicSellable === true,
      billingMode: clervo.billingMode as 'free' | 'metered',
      customerPricing: clervo.customerPricing !== null && typeof clervo.customerPricing === 'object' ? Object.freeze({ ...(clervo.customerPricing as Record<string, unknown>) }) : null,
      commerce: clervo.commerce !== null && typeof clervo.commerce === 'object' ? Object.freeze({ ...(clervo.commerce as Record<string, unknown>) }) : Object.freeze({}),
    });
  });
  if (new Set(models.map(({ id }) => id)).size !== models.length || Number(inventory.callableIds) !== models.length) throw new RegistryError('ai_catalog_inventory_mismatch');
  return Object.freeze({ origin, revision: String(metadata.catalogRevision ?? ''), sourceValidUntil: String(metadata.sourceValidUntil ?? ''), inventory: Object.freeze({ canonicalModels: Number(inventory.canonicalModels), aliases: Number(inventory.aliases), callableIds: Number(inventory.callableIds) }), models: Object.freeze(models) });
}
