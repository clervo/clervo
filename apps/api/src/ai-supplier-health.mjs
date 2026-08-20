function finiteStatus(error) {
  return Number.isInteger(error?.supplierStatus) ? error.supplierStatus : undefined;
}

function retryAfterMs(error, fallback) {
  const seconds = Number(error?.retryAfter);
  return Number.isFinite(seconds) && seconds >= 1 && seconds <= 3_600 ? seconds * 1_000 : fallback;
}

function blank() {
  return {
    attempts: 0, successes: 0, totalLatencyMs: 0, ttftTotalMs: 0, ttftCount: 0,
    retries: 0, timeouts: 0, authFailures: 0, quotaFailures: 0, serverFailures: 0,
    schemaFailures: 0, toolFailures: 0, streamFailures: 0, malformedResponses: 0,
    wrongIdentityFailures: 0, supplierCostAtomic: 0n, retryWasteAtomic: 0n,
    consecutiveFailures: 0, cooldownUntil: 0, quarantineUntil: 0,
    lastSuccessfulQualification: null,
  };
}

export class AiSupplierHealthRegistry {
  #states = new Map();

  constructor({ clock = () => Date.now(), transientThreshold = 3, cooldownMs = 30_000, authenticationQuarantineMs = 900_000 } = {}) {
    this.clock = clock;
    this.transientThreshold = transientThreshold;
    this.cooldownMs = cooldownMs;
    this.authenticationQuarantineMs = authenticationQuarantineMs;
  }

  contain(adapter) {
    const sourceId = adapter.sourceId ?? adapter.constructor?.name ?? adapter.routeId;
    const routeId = adapter.routeId;
    const key = `${sourceId}:${routeId}`;
    return Object.freeze({
      ...adapter,
      routeId,
      sourceId,
      ...(typeof adapter.supportsRoute === 'function' ? { supportsRoute: (candidate) => adapter.supportsRoute(candidate) } : {}),
      execute: (input) => this.execute(key, adapter, input),
    });
  }

  async execute(key, adapter, input) {
    const now = this.clock();
    const state = this.#states.get(key) ?? blank();
    if (now < state.quarantineUntil) throw Object.assign(new Error('ai_source_auth_quarantined'), { status: 503 });
    if (now < state.cooldownUntil) throw Object.assign(new Error('ai_source_cooling_down'), { status: 503 });
    state.attempts += 1;
    if (state.attempts > 1) state.retries += 1;
    const started = this.clock();
    let firstEvent = false;
    try {
      const result = await adapter.execute({
        ...input,
        ...(input.onEvent === undefined ? {} : {
          onEvent: (event) => {
            if (!firstEvent) {
              firstEvent = true;
              state.ttftCount += 1;
              state.ttftTotalMs += Math.max(0, this.clock() - started);
            }
            input.onEvent(event);
          },
        }),
      });
      state.successes += 1;
      state.consecutiveFailures = 0;
      state.cooldownUntil = 0;
      state.totalLatencyMs += Math.max(0, this.clock() - started);
      state.lastSuccessfulQualification = new Date(this.clock()).toISOString();
      this.#states.set(key, state);
      return result;
    } catch (error) {
      state.totalLatencyMs += Math.max(0, this.clock() - started);
      state.consecutiveFailures += 1;
      const status = finiteStatus(error);
      const message = error instanceof Error ? error.message : '';
      if (status === 401 || status === 403 || message.includes('credential')) {
        state.authFailures += 1;
        if (state.authFailures >= 2) state.quarantineUntil = now + this.authenticationQuarantineMs;
      } else if (status === 429) {
        state.quotaFailures += 1;
        state.cooldownUntil = now + retryAfterMs(error, 60_000);
      } else {
        if (status !== undefined && status >= 500) state.serverFailures += 1;
        if (message.includes('timeout') || message.includes('deadline') || message.includes('transport')) state.timeouts += 1;
        if (message.includes('schema')) state.schemaFailures += 1;
        if (message.includes('tool')) state.toolFailures += 1;
        if (message.includes('stream')) state.streamFailures += 1;
        if (message.includes('response_invalid') || message.includes('malformed')) state.malformedResponses += 1;
        if (state.consecutiveFailures >= this.transientThreshold) state.cooldownUntil = now + this.cooldownMs;
      }
      this.#states.set(key, state);
      throw error;
    }
  }

  snapshot() {
    const now = this.clock();
    return Object.freeze([...this.#states.entries()].map(([route, state]) => Object.freeze({
      route,
      attempts: state.attempts,
      successes: state.successes,
      successRate: state.attempts === 0 ? null : state.successes / state.attempts,
      averageLatencyMs: state.attempts === 0 ? null : state.totalLatencyMs / state.attempts,
      averageTtftMs: state.ttftCount === 0 ? null : state.ttftTotalMs / state.ttftCount,
      retries: state.retries,
      timeout: state.timeouts,
      unauthorized: state.authFailures,
      rateLimited: state.quotaFailures,
      provider5xx: state.serverFailures,
      schemaFailures: state.schemaFailures,
      toolFailures: state.toolFailures,
      streamFailures: state.streamFailures,
      malformedResponses: state.malformedResponses,
      wrongIdentityFailures: state.wrongIdentityFailures,
      supplierCostAtomic: state.supplierCostAtomic.toString(),
      retryWasteAtomic: state.retryWasteAtomic.toString(),
      costPerSuccessfulJobAtomic: state.successes === 0 ? null : (state.supplierCostAtomic / BigInt(state.successes)).toString(),
      currentHealth: now < state.quarantineUntil ? 'quarantined' : now < state.cooldownUntil ? 'cooldown' : state.consecutiveFailures > 0 ? 'degraded' : 'healthy',
      lastSuccessfulQualification: state.lastSuccessfulQualification,
    })));
  }
}
