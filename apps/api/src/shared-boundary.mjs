const DEFAULT_PRODUCT_LIMITS = Object.freeze({
  search: 6,
  ai: 6,
  sandbox: 2,
  rpc: 6,
  prediction: 4,
  crypto: 4,
});

const DEFAULT_RATE_LIMITS = Object.freeze({
  free: Object.freeze({ limit: 12, windowMs: 60_000 }),
  quote: Object.freeze({ limit: 30, windowMs: 60_000 }),
  paid: Object.freeze({ limit: 180, windowMs: 60_000 }),
});

const REQUEST_BUDGETS_MS = Object.freeze({
  '/v1/search/free': 12_000,
  '/v1/search/paid': 15_000,
  '/v1/ai/execute': 120_000,
  '/v1/chat/completions': 120_000,
  '/v1/messages': 120_000,
  '/v1/responses': 120_000,
  '/v1/sandbox/execute': 75_000,
  '/v1/rpc/execute': 35_000,
  '/v1/prediction/execute': 35_000,
  '/v1/crypto/execute': 35_000,
});

function family(productId) {
  const value = typeof productId === 'string' ? productId.split('.', 1)[0] : 'unknown';
  return value === 'crypto' ? 'crypto' : value;
}

function stableSubject(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value)
    ? value
    : 'untrusted-subject';
}

export class SharedCapacityController {
  #active = 0;
  #activeFree = 0;
  #activeQuotes = 0;
  #activeProducts = new Map();
  #rates = new Map();

  constructor({
    maximumExecutions = 16,
    maximumFreeExecutions = Math.max(1, Math.floor(maximumExecutions / 4)),
    maximumConcurrentQuotes = Math.max(2, Math.floor(maximumExecutions / 2)),
    productLimits = DEFAULT_PRODUCT_LIMITS,
    rateLimits = DEFAULT_RATE_LIMITS,
    maximumTrackedSubjects = 10_000,
    clock = () => Date.now(),
  } = {}) {
    if (!Number.isInteger(maximumExecutions) || maximumExecutions < 2 || maximumExecutions > 256) throw new TypeError('invalid_capacity_execution_limit');
    if (!Number.isInteger(maximumFreeExecutions) || maximumFreeExecutions < 1 || maximumFreeExecutions >= maximumExecutions) throw new TypeError('invalid_capacity_free_limit');
    if (!Number.isInteger(maximumConcurrentQuotes) || maximumConcurrentQuotes < 1 || maximumConcurrentQuotes > maximumExecutions) throw new TypeError('invalid_capacity_quote_limit');
    if (!Number.isInteger(maximumTrackedSubjects) || maximumTrackedSubjects < 100 || maximumTrackedSubjects > 100_000) throw new TypeError('invalid_capacity_subject_limit');
    this.maximumExecutions = maximumExecutions;
    this.maximumFreeExecutions = maximumFreeExecutions;
    this.maximumConcurrentQuotes = maximumConcurrentQuotes;
    this.productLimits = Object.freeze({ ...productLimits });
    this.rateLimits = Object.freeze({ ...rateLimits });
    this.maximumTrackedSubjects = maximumTrackedSubjects;
    this.clock = clock;
  }

  rate({ kind, subject }) {
    const policy = this.rateLimits[kind];
    if (policy === undefined) throw new TypeError('invalid_capacity_rate_kind');
    const now = this.clock();
    const key = `${kind}:${stableSubject(subject)}`;
    let current = this.#rates.get(key);
    if (current === undefined || now >= current.resetAt) current = { count: 0, resetAt: now + policy.windowMs };
    current.count += 1;
    this.#rates.delete(key);
    this.#rates.set(key, current);
    while (this.#rates.size > this.maximumTrackedSubjects) this.#rates.delete(this.#rates.keys().next().value);
    return Object.freeze({
      allowed: current.count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - current.count),
      resetAt: new Date(current.resetAt).toISOString(),
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    });
  }

  acquireQuote() {
    if (this.#activeQuotes >= this.maximumConcurrentQuotes) return undefined;
    this.#activeQuotes += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#activeQuotes -= 1;
    };
  }

  acquireExecution({ productId, fundingMode = 'paid' } = {}) {
    const productFamily = family(productId);
    const productLimit = this.productLimits[productFamily] ?? this.maximumExecutions;
    const productActive = this.#activeProducts.get(productFamily) ?? 0;
    if (this.#active >= this.maximumExecutions || productActive >= productLimit) return undefined;
    if (fundingMode === 'free' && this.#activeFree >= this.maximumFreeExecutions) return undefined;
    this.#active += 1;
    if (fundingMode === 'free') this.#activeFree += 1;
    this.#activeProducts.set(productFamily, productActive + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#active -= 1;
      if (fundingMode === 'free') this.#activeFree -= 1;
      const next = (this.#activeProducts.get(productFamily) ?? 1) - 1;
      if (next === 0) this.#activeProducts.delete(productFamily);
      else this.#activeProducts.set(productFamily, next);
    };
  }

  snapshot() {
    return Object.freeze({
      activeExecutions: this.#active,
      activeFreeExecutions: this.#activeFree,
      activePaidExecutions: this.#active - this.#activeFree,
      activeQuotes: this.#activeQuotes,
      maximumExecutions: this.maximumExecutions,
      maximumFreeExecutions: this.maximumFreeExecutions,
      maximumConcurrentQuotes: this.maximumConcurrentQuotes,
      products: Object.freeze(Object.fromEntries(this.#activeProducts)),
    });
  }
}

export function requestDeadline({ pathname, supplied, now = Date.now() }) {
  const budget = REQUEST_BUDGETS_MS[pathname] ?? 15_000;
  const local = now + budget;
  const parsed = Date.parse(supplied ?? '');
  const deadlineMs = Number.isFinite(parsed) && parsed > now && parsed <= now + 610_000
    ? Math.min(local, parsed)
    : local;
  return Object.freeze({ deadlineAt: new Date(deadlineMs).toISOString(), remainingMs: Math.max(1, deadlineMs - now) });
}

export class SupplierCircuitBreaker {
  #states = new Map();

  constructor({ threshold = 3, cooldownMs = 30_000, maximumKeys = 1_000, clock = () => Date.now() } = {}) {
    if (!Number.isInteger(threshold) || threshold < 2 || threshold > 20) throw new TypeError('invalid_supplier_circuit_threshold');
    if (!Number.isInteger(cooldownMs) || cooldownMs < 1_000 || cooldownMs > 3_600_000) throw new TypeError('invalid_supplier_circuit_cooldown');
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.maximumKeys = maximumKeys;
    this.clock = clock;
  }

  async execute(key, operation) {
    const now = this.clock();
    const current = this.#states.get(key) ?? { failures: 0, openedAt: undefined, probe: false };
    if (current.openedAt !== undefined && now - current.openedAt < this.cooldownMs) throw Object.assign(new Error('supplier_circuit_open'), { status: 503 });
    if (current.openedAt !== undefined && current.probe) throw Object.assign(new Error('supplier_circuit_half_open'), { status: 503 });
    if (current.openedAt !== undefined) current.probe = true;
    this.#states.set(key, current);
    try {
      const result = await operation();
      this.#states.set(key, { failures: 0, openedAt: undefined, probe: false });
      return result;
    } catch (error) {
      const failures = current.failures + 1;
      this.#states.set(key, { failures, openedAt: failures >= this.threshold ? now : undefined, probe: false });
      while (this.#states.size > this.maximumKeys) this.#states.delete(this.#states.keys().next().value);
      throw error;
    }
  }

  snapshot() {
    const now = this.clock();
    let open = 0;
    for (const state of this.#states.values()) if (state.openedAt !== undefined && now - state.openedAt < this.cooldownMs) open += 1;
    return Object.freeze({ tracked: this.#states.size, open, threshold: this.threshold, cooldownMs: this.cooldownMs });
  }
}

export function containSupplierRuntime(runtime, circuit, keyForRequest) {
  if (runtime === undefined) return undefined;
  if (typeof runtime.execute !== 'function' || typeof keyForRequest !== 'function') throw new TypeError('invalid_supplier_runtime');
  return Object.freeze({
    ...runtime,
    execute: (request) => circuit.execute(keyForRequest(request), () => runtime.execute(request)),
    circuitHealth: () => circuit.snapshot(),
  });
}

export const SHARED_REQUEST_BUDGETS_MS = REQUEST_BUDGETS_MS;
