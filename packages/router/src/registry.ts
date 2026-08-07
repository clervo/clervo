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

  const capabilities = products.map((product): RegistryCapability => {
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
    return Object.freeze({
      productId,
      family,
      title: typeof product.title === 'string' ? product.title : productId,
      summary: typeof product.summary === 'string' ? product.summary : '',
      lifecycleState,
      proofLevel: typeof observedFamily?.proofLevel === 'string' ? observedFamily.proofLevel : 'none',
      reason: typeof observedFamily?.reason === 'string' ? observedFamily.reason : null,
      freeRoute,
      paidRoute,
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
      paidCallable: familyReachable && product.publicAvailable === true && payment.payable === true && paidRoute !== null,
      freeCallable: familyReachable && freeRoute !== null && product.publicAvailable === true,
    });
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
