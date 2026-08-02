import type { JsonRpcOutcome } from '../../../adapters/rpc/src/json-rpc.js';
import { RpcHealthRouter, type RpcProbeRoute } from './health.js';
import { RpcMethodPolicy, type RpcCall } from './policy.js';

export type RpcBroadcastState = 'reserved' | 'submitting' | 'submitted' | 'confirmed' | 'rejected' | 'unknown';

export interface RpcBroadcastRecord {
  idempotencyKey: string;
  requestHash: string;
  chainId: string;
  state: RpcBroadcastState;
  routeId: string | null;
  transactionId: string | null;
  updatedAtMs: number;
}

export interface RpcBroadcastStore {
  reserve(record: Readonly<RpcBroadcastRecord>): Promise<Readonly<{ created: boolean; record: Readonly<RpcBroadcastRecord> }>>;
  transition(input: Readonly<{ idempotencyKey: string; requestHash: string; expected: readonly RpcBroadcastState[]; next: RpcBroadcastState; routeId: string | null; transactionId: string | null; updatedAtMs: number }>): Promise<Readonly<RpcBroadcastRecord>>;
}

export class InMemoryRpcBroadcastStore implements RpcBroadcastStore {
  readonly #records = new Map<string, Readonly<RpcBroadcastRecord>>();

  async reserve(record: Readonly<RpcBroadcastRecord>): Promise<Readonly<{ created: boolean; record: Readonly<RpcBroadcastRecord> }>> {
    const existing = this.#records.get(record.idempotencyKey);
    if (existing) return Object.freeze({ created: false, record: existing });
    const stored = Object.freeze({ ...record });
    this.#records.set(record.idempotencyKey, stored);
    return Object.freeze({ created: true, record: stored });
  }

  async transition(input: Readonly<{ idempotencyKey: string; requestHash: string; expected: readonly RpcBroadcastState[]; next: RpcBroadcastState; routeId: string | null; transactionId: string | null; updatedAtMs: number }>): Promise<Readonly<RpcBroadcastRecord>> {
    const current = this.#records.get(input.idempotencyKey);
    if (!current || current.requestHash !== input.requestHash || !input.expected.includes(current.state) || input.updatedAtMs < current.updatedAtMs) throw new Error('rpc_broadcast_transition_conflict');
    const next = Object.freeze({ ...current, state: input.next, routeId: input.routeId, transactionId: input.transactionId, updatedAtMs: input.updatedAtMs });
    this.#records.set(input.idempotencyKey, next);
    return next;
  }
}

export interface RpcBroadcastReconciler {
  reconcile(input: Readonly<{ chainId: string; requestHash: string; calls: readonly RpcCall[]; routeId: string | null }>): Promise<Readonly<{ state: 'submitted' | 'confirmed' | 'rejected' | 'not_found' | 'unavailable'; transactionId?: string }>>;
}

export interface RpcBroadcastResult {
  requestHash: string;
  chainId: string;
  state: 'submitted' | 'confirmed' | 'rejected' | 'unknown';
  routeId: string | null;
  transactionId: string | null;
  replayed: boolean;
}

function transactionId(chainId: string, outcome: JsonRpcOutcome | undefined): string {
  if (!outcome || outcome.ok === false || typeof outcome.result !== 'string') throw new Error('rpc_broadcast_result_invalid');
  if (chainId.startsWith('eip155:') ? !/^0x[0-9a-fA-F]{64}$/u.test(outcome.result) : !/^[1-9A-HJ-NP-Za-km-z]{32,128}$/u.test(outcome.result)) throw new Error('rpc_broadcast_result_invalid');
  return outcome.result;
}

function terminal(record: Readonly<RpcBroadcastRecord>, replayed: boolean): Readonly<RpcBroadcastResult> {
  if (!['submitted', 'confirmed', 'rejected', 'unknown'].includes(record.state)) throw new Error('rpc_broadcast_not_terminal');
  return Object.freeze({ requestHash: record.requestHash, chainId: record.chainId, state: record.state as RpcBroadcastResult['state'], routeId: record.routeId, transactionId: record.transactionId, replayed });
}

export class RpcBroadcastCoordinator {
  readonly #policy: RpcMethodPolicy;
  readonly #health: RpcHealthRouter;
  readonly #routes: ReadonlyMap<string, RpcProbeRoute>;
  readonly #store: RpcBroadcastStore;
  readonly #reconciler: RpcBroadcastReconciler;

  constructor(input: Readonly<{ policy: RpcMethodPolicy; health: RpcHealthRouter; routes: readonly RpcProbeRoute[]; store: RpcBroadcastStore; reconciler: RpcBroadcastReconciler }>) {
    const routes = new Map(input.routes.map((route) => [route.routeId, route]));
    if (routes.size !== input.routes.length) throw new TypeError('rpc_broadcast_config_invalid');
    this.#policy = input.policy;
    this.#health = input.health;
    this.#routes = routes;
    this.#store = input.store;
    this.#reconciler = input.reconciler;
  }

  async broadcast(input: Readonly<{ chainId: string; call: RpcCall; idempotencyKey: string; nowMs: number; signal?: AbortSignal }>): Promise<Readonly<RpcBroadcastResult>> {
    if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0) throw new TypeError('rpc_broadcast_time_invalid');
    const decision = this.#policy.authorize({ productId: 'rpc.broadcast', chainId: input.chainId, calls: input.call, idempotencyKey: input.idempotencyKey });
    const reserved = await this.#store.reserve(Object.freeze({ idempotencyKey: input.idempotencyKey, requestHash: decision.requestHash, chainId: input.chainId, state: 'reserved', routeId: null, transactionId: null, updatedAtMs: input.nowMs }));
    if (reserved.record.requestHash !== decision.requestHash || reserved.record.chainId !== input.chainId) throw new Error('rpc_broadcast_idempotency_conflict');
    if (['submitted', 'confirmed', 'rejected'].includes(reserved.record.state)) return terminal(reserved.record, true);
    if (reserved.record.state === 'submitting' || reserved.record.state === 'unknown') return this.#reconcile(reserved.record, decision.calls, input.nowMs);
    const selected = this.#health.select(input.chainId, input.nowMs);
    const route = this.#routes.get(selected.routeId);
    if (!route || route.chainId !== input.chainId) throw new Error('rpc_route_binding_failed');
    await this.#store.transition({ idempotencyKey: input.idempotencyKey, requestHash: decision.requestHash, expected: ['reserved'], next: 'submitting', routeId: selected.routeId, transactionId: null, updatedAtMs: input.nowMs });
    let outcomes: readonly JsonRpcOutcome[];
    try {
      outcomes = await route.execute(decision.calls, input.signal);
    } catch {
      const unknown = await this.#store.transition({ idempotencyKey: input.idempotencyKey, requestHash: decision.requestHash, expected: ['submitting'], next: 'unknown', routeId: selected.routeId, transactionId: null, updatedAtMs: input.nowMs });
      return terminal(unknown, false);
    }
    if (outcomes.length !== 1) {
      const unknown = await this.#store.transition({ idempotencyKey: input.idempotencyKey, requestHash: decision.requestHash, expected: ['submitting'], next: 'unknown', routeId: selected.routeId, transactionId: null, updatedAtMs: input.nowMs });
      return terminal(unknown, false);
    }
    if (outcomes[0]?.ok === false) {
      const rejected = await this.#store.transition({ idempotencyKey: input.idempotencyKey, requestHash: decision.requestHash, expected: ['submitting'], next: 'rejected', routeId: selected.routeId, transactionId: null, updatedAtMs: input.nowMs });
      return terminal(rejected, false);
    }
    let observedTransactionId: string;
    try { observedTransactionId = transactionId(input.chainId, outcomes[0]); }
    catch {
      const unknown = await this.#store.transition({ idempotencyKey: input.idempotencyKey, requestHash: decision.requestHash, expected: ['submitting'], next: 'unknown', routeId: selected.routeId, transactionId: null, updatedAtMs: input.nowMs });
      return terminal(unknown, false);
    }
    const submitted = await this.#store.transition({ idempotencyKey: input.idempotencyKey, requestHash: decision.requestHash, expected: ['submitting'], next: 'submitted', routeId: selected.routeId, transactionId: observedTransactionId, updatedAtMs: input.nowMs });
    return terminal(submitted, false);
  }

  async #reconcile(record: Readonly<RpcBroadcastRecord>, calls: readonly RpcCall[], nowMs: number): Promise<Readonly<RpcBroadcastResult>> {
    let result: Awaited<ReturnType<RpcBroadcastReconciler['reconcile']>>;
    try { result = await this.#reconciler.reconcile({ chainId: record.chainId, requestHash: record.requestHash, calls, routeId: record.routeId }); }
    catch { result = { state: 'unavailable' }; }
    if (result.state === 'not_found' || result.state === 'unavailable') {
      const unknown = record.state === 'unknown' ? record : await this.#store.transition({ idempotencyKey: record.idempotencyKey, requestHash: record.requestHash, expected: ['submitting'], next: 'unknown', routeId: record.routeId, transactionId: null, updatedAtMs: nowMs });
      return terminal(unknown, true);
    }
    const observedTransactionId = result.transactionId;
    if ((result.state === 'submitted' || result.state === 'confirmed') && (observedTransactionId === undefined || !/^0x[0-9a-fA-F]{64}$/u.test(observedTransactionId) && !/^[1-9A-HJ-NP-Za-km-z]{32,128}$/u.test(observedTransactionId))) throw new Error('rpc_broadcast_reconciliation_invalid');
    const next = await this.#store.transition({
      idempotencyKey: record.idempotencyKey, requestHash: record.requestHash, expected: ['submitting', 'unknown'], next: result.state,
      routeId: record.routeId, transactionId: observedTransactionId ?? null, updatedAtMs: nowMs,
    });
    return terminal(next, true);
  }
}
