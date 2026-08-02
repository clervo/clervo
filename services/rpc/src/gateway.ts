import { createHash } from 'node:crypto';

import type { JsonRpcOutcome } from '../../../adapters/rpc/src/json-rpc.js';
import { canonicalize } from '../../../packages/contracts/src/canonical-request.js';
import type { JsonValue } from '../../../packages/contracts/src/types.js';
import { RpcHealthRouter, type RpcProbeRoute } from './health.js';
import { RpcMethodPolicy, type RpcCall, type RpcProductId } from './policy.js';

export interface RpcCacheRecord {
  requestHash: string;
  storedAtMs: number;
  expiresAtMs: number;
  outcomes: readonly JsonRpcOutcome[];
  outcomesSha256: string;
}

export interface RpcCacheStore {
  get(requestHash: string): Promise<Readonly<RpcCacheRecord> | undefined>;
  put(record: Readonly<RpcCacheRecord>): Promise<void>;
  delete(requestHash: string): Promise<void>;
}

export class InMemoryRpcCacheStore implements RpcCacheStore {
  readonly #records = new Map<string, Readonly<RpcCacheRecord>>();
  async get(requestHash: string): Promise<Readonly<RpcCacheRecord> | undefined> { return this.#records.get(requestHash); }
  async put(record: Readonly<RpcCacheRecord>): Promise<void> { this.#records.set(record.requestHash, record); }
  async delete(requestHash: string): Promise<void> { this.#records.delete(requestHash); }
}

export interface RpcGatewayResult {
  requestHash: string;
  chainId: string;
  routeIds: readonly string[];
  outcomes: readonly JsonRpcOutcome[];
  cache: 'hit' | 'miss' | 'bypass';
  quorum: number;
  observedAtMs: number;
}

function stable(value: unknown): string {
  return canonicalize(value as JsonValue);
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function verifyCache(record: Readonly<RpcCacheRecord>, requestHash: string, nowMs: number): readonly JsonRpcOutcome[] | undefined {
  try {
    if (record.requestHash !== requestHash || !Number.isSafeInteger(record.storedAtMs) || !Number.isSafeInteger(record.expiresAtMs)
      || record.storedAtMs < 0 || record.expiresAtMs <= record.storedAtMs || nowMs < record.storedAtMs || nowMs >= record.expiresAtMs
      || !/^sha256:[a-f0-9]{64}$/u.test(record.outcomesSha256) || sha256(stable(record.outcomes)) !== record.outcomesSha256) return undefined;
    return Object.freeze(record.outcomes.map((outcome) => Object.freeze(structuredClone(outcome))));
  } catch { return undefined; }
}

function equivalent(left: readonly JsonRpcOutcome[], right: readonly JsonRpcOutcome[]): boolean {
  try { return stable(left) === stable(right); } catch { return false; }
}

export class RpcGateway {
  readonly #policy: RpcMethodPolicy;
  readonly #health: RpcHealthRouter;
  readonly #routes: ReadonlyMap<string, RpcProbeRoute>;
  readonly #cache: RpcCacheStore;

  constructor(input: Readonly<{ policy: RpcMethodPolicy; health: RpcHealthRouter; routes: readonly RpcProbeRoute[]; cache: RpcCacheStore }>) {
    const routes = new Map(input.routes.map((route) => [route.routeId, route]));
    if (routes.size !== input.routes.length) throw new TypeError('rpc_gateway_config_invalid');
    this.#policy = input.policy;
    this.#health = input.health;
    this.#routes = routes;
    this.#cache = input.cache;
  }

  health(chainId: string, nowMs: number): ReturnType<RpcHealthRouter['status']> {
    return this.#health.status(chainId, nowMs);
  }

  async execute(input: Readonly<{ productId: RpcProductId; chainId: string; calls: RpcCall | readonly RpcCall[]; idempotencyKey?: string; quorum?: 1 | 2 | 3; nowMs: number; signal?: AbortSignal }>): Promise<Readonly<RpcGatewayResult>> {
    const decision = this.#policy.authorize(input);
    if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0) throw new TypeError('rpc_gateway_time_invalid');
    if (decision.sideEffecting) throw new Error('rpc_broadcast_requires_coordinator');
    const quorum = input.quorum ?? 1;
    const cached = decision.cachePolicy === 'never' ? undefined : await this.#cache.get(decision.requestHash);
    if (cached !== undefined) {
      const outcomes = verifyCache(cached, decision.requestHash, input.nowMs);
      if (outcomes !== undefined) return Object.freeze({ requestHash: decision.requestHash, chainId: input.chainId, routeIds: Object.freeze([]), outcomes, cache: 'hit', quorum, observedAtMs: input.nowMs });
      await this.#cache.delete(decision.requestHash);
    }
    const selected = this.#health.selectMany(input.chainId, input.nowMs, quorum);
    const executions = await Promise.all(selected.map(async ({ routeId }) => {
      const route = this.#routes.get(routeId);
      if (!route || route.chainId !== input.chainId) throw new Error('rpc_route_binding_failed');
      return route.execute(decision.calls, input.signal);
    }));
    if (executions.some((outcomes) => outcomes.length !== decision.calls.length) || executions.slice(1).some((outcomes) => !equivalent(executions[0]!, outcomes))) throw new Error('rpc_quorum_disagreement');
    const outcomes = Object.freeze(executions[0]!.map((outcome) => Object.freeze(structuredClone(outcome))));
    if (decision.cachePolicy !== 'never') {
      const ttlMs = decision.cachePolicy === 'finalized_immutable' ? 86_400_000 : Math.max(100, Math.min(5_000, Math.floor(decision.chain.staleAfterMs / 2)));
      const record = Object.freeze({ requestHash: decision.requestHash, storedAtMs: input.nowMs, expiresAtMs: input.nowMs + ttlMs, outcomes, outcomesSha256: sha256(stable(outcomes)) });
      await this.#cache.put(record);
    }
    return Object.freeze({ requestHash: decision.requestHash, chainId: input.chainId, routeIds: Object.freeze(selected.map(({ routeId }) => routeId)), outcomes, cache: 'miss', quorum, observedAtMs: input.nowMs });
  }
}
