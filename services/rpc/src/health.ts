import type { JsonRpcCall, JsonRpcOutcome } from '../../../adapters/rpc/src/json-rpc.js';
import type { RpcChainPolicy } from './policy.js';

export interface RpcProbeRoute {
  routeId: string;
  chainId: string;
  execute(calls: readonly Readonly<JsonRpcCall>[], signal?: AbortSignal): Promise<readonly JsonRpcOutcome[]>;
}

export type RpcRouteStatus = 'healthy' | 'stale' | 'forked' | 'wrong_chain' | 'unavailable';

export interface RpcRouteHealth {
  routeId: string;
  chainId: string;
  status: RpcRouteStatus;
  height: number | null;
  finalizedReferenceHeight: number | null;
  finalizedReferenceHash: string | null;
  latencyMs: number | null;
  observedAtMs: number;
  safeFailureCode: string | null;
}

export interface RpcChainHealth {
  chainId: string;
  observedAtMs: number;
  highestHeight: number | null;
  quorumAvailable: boolean;
  routes: readonly Readonly<RpcRouteHealth>[];
}

interface Head {
  route: RpcProbeRoute;
  height: number;
  latencyMs: number;
}

function successful(outcome: JsonRpcOutcome | undefined): unknown {
  if (outcome === undefined || outcome.ok === false) throw new Error('rpc_semantic_probe_failed');
  return outcome.result;
}

function evmQuantity(value: unknown): number {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(value)) throw new Error('rpc_semantic_quantity_invalid');
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('rpc_semantic_quantity_invalid');
  return Number(parsed);
}

function solanaHeight(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('rpc_semantic_height_invalid');
  return value as number;
}

function expectedIdentity(chain: Readonly<RpcChainPolicy>): string {
  return chain.protocol === 'evm' ? `0x${BigInt(chain.chainId.slice('eip155:'.length)).toString(16)}` : chain.chainId.slice('solana:'.length);
}

function headCalls(chain: Readonly<RpcChainPolicy>): readonly Readonly<JsonRpcCall>[] {
  return chain.protocol === 'evm'
    ? Object.freeze([{ method: 'eth_chainId', params: [] }, { method: 'eth_blockNumber', params: [] }])
    : Object.freeze([{ method: 'getGenesisHash', params: [] }, { method: 'getSlot', params: [{ commitment: 'finalized' }] }]);
}

function blockCall(chain: Readonly<RpcChainPolicy>, height: number): Readonly<JsonRpcCall> {
  return chain.protocol === 'evm'
    ? Object.freeze({ method: 'eth_getBlockByNumber', params: [`0x${height.toString(16)}`, false] })
    : Object.freeze({ method: 'getBlock', params: [height, { commitment: 'finalized', transactionDetails: 'none', rewards: false }] });
}

function blockHash(chain: Readonly<RpcChainPolicy>, result: unknown, expectedHeight: number): string {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) throw new Error('rpc_semantic_block_invalid');
  const block = result as Record<string, unknown>;
  if (chain.protocol === 'evm') {
    if (evmQuantity(block.number) !== expectedHeight || typeof block.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/u.test(block.hash)) throw new Error('rpc_semantic_block_invalid');
    return block.hash.toLowerCase();
  }
  if (typeof block.blockhash !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/u.test(block.blockhash)) throw new Error('rpc_semantic_block_invalid');
  return block.blockhash;
}

function state(input: Readonly<Partial<RpcRouteHealth> & Pick<RpcRouteHealth, 'routeId' | 'chainId' | 'status' | 'observedAtMs'>>): Readonly<RpcRouteHealth> {
  return Object.freeze({
    routeId: input.routeId,
    chainId: input.chainId,
    status: input.status,
    height: input.height ?? null,
    finalizedReferenceHeight: input.finalizedReferenceHeight ?? null,
    finalizedReferenceHash: input.finalizedReferenceHash ?? null,
    latencyMs: input.latencyMs ?? null,
    observedAtMs: input.observedAtMs,
    safeFailureCode: input.safeFailureCode ?? null,
  });
}

export class RpcHealthRouter {
  readonly #chains: ReadonlyMap<string, Readonly<RpcChainPolicy>>;
  readonly #routes: readonly RpcProbeRoute[];
  readonly #monotonic: () => number;
  readonly #health = new Map<string, Readonly<RpcChainHealth>>();

  constructor(input: Readonly<{ chains: readonly Readonly<RpcChainPolicy>[]; routes: readonly RpcProbeRoute[]; monotonic?: () => number }>) {
    const chains = new Map(input.chains.map((chain) => [chain.chainId, chain]));
    if (chains.size !== input.chains.length || input.routes.some((route) => !/^rpc\.route\.[a-z0-9][a-z0-9._-]{2,63}$/u.test(route.routeId) || !chains.has(route.chainId))
      || new Set(input.routes.map(({ routeId }) => routeId)).size !== input.routes.length) throw new TypeError('rpc_health_config_invalid');
    this.#chains = chains;
    this.#routes = Object.freeze([...input.routes]);
    this.#monotonic = input.monotonic ?? (() => performance.now());
  }

  async refresh(chainId: string, observedAtMs: number, signal?: AbortSignal): Promise<Readonly<RpcChainHealth>> {
    const chain = this.#chains.get(chainId);
    if (!chain || !Number.isSafeInteger(observedAtMs) || observedAtMs < 0) throw new TypeError('rpc_health_refresh_invalid');
    const routes = this.#routes.filter((route) => route.chainId === chainId);
    const initial = new Map<string, Readonly<RpcRouteHealth>>();
    const heads = (await Promise.all(routes.map(async (route): Promise<Head | null> => {
      const started = this.#monotonic();
      try {
        const response = await route.execute(headCalls(chain), signal);
        const identity = successful(response[0]);
        const height = chain.protocol === 'evm' ? evmQuantity(successful(response[1])) : solanaHeight(successful(response[1]));
        if (identity !== expectedIdentity(chain)) {
          initial.set(route.routeId, state({ routeId: route.routeId, chainId, status: 'wrong_chain', height, latencyMs: Math.max(0, Math.ceil(this.#monotonic() - started)), observedAtMs, safeFailureCode: 'identity_mismatch' }));
          return null;
        }
        return { route, height, latencyMs: Math.max(0, Math.ceil(this.#monotonic() - started)) };
      } catch {
        initial.set(route.routeId, state({ routeId: route.routeId, chainId, status: 'unavailable', observedAtMs, safeFailureCode: 'head_probe_failed' }));
        return null;
      }
    }))).filter((value): value is Head => value !== null);

    const highestHeight = heads.length === 0 ? null : Math.max(...heads.map(({ height }) => height));
    const eligible = highestHeight === null ? [] : heads.filter(({ height, route, latencyMs }) => {
      if (highestHeight - height <= chain.maximumReorgDepth) return true;
      initial.set(route.routeId, state({ routeId: route.routeId, chainId, status: 'stale', height, latencyMs, observedAtMs, safeFailureCode: 'height_lag' }));
      return false;
    });
    const referenceHeight = highestHeight === null ? null : Math.max(0, highestHeight - chain.finalityDepth);
    const hashes = new Map<string, string>();
    if (referenceHeight !== null) await Promise.all(eligible.map(async ({ route, height, latencyMs }) => {
      try {
        const response = await route.execute([blockCall(chain, referenceHeight)], signal);
        hashes.set(route.routeId, blockHash(chain, successful(response[0]), referenceHeight));
      } catch {
        initial.set(route.routeId, state({ routeId: route.routeId, chainId, status: 'unavailable', height, finalizedReferenceHeight: referenceHeight, latencyMs, observedAtMs, safeFailureCode: 'finalized_probe_failed' }));
      }
    }));

    const counts = new Map<string, number>();
    for (const hash of hashes.values()) counts.set(hash, (counts.get(hash) ?? 0) + 1);
    const orderedCounts = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    const winning = orderedCounts[0];
    const tied = winning !== undefined && orderedCounts[1]?.[1] === winning[1];
    const canonicalHash = tied ? undefined : winning?.[0];
    const quorumAvailable = canonicalHash !== undefined && (hashes.size === 1 || winning![1] > hashes.size / 2);
    for (const { route, height, latencyMs } of eligible) {
      if (initial.has(route.routeId)) continue;
      const hash = hashes.get(route.routeId);
      const healthy = hash !== undefined && (hashes.size === 1 || quorumAvailable && hash === canonicalHash);
      initial.set(route.routeId, state({
        routeId: route.routeId, chainId, status: healthy ? 'healthy' : 'forked', height,
        finalizedReferenceHeight: referenceHeight, finalizedReferenceHash: hash ?? null, latencyMs, observedAtMs,
        safeFailureCode: healthy ? null : 'finalized_hash_disagreement',
      }));
    }
    const snapshot = Object.freeze({
      chainId,
      observedAtMs,
      highestHeight,
      quorumAvailable: hashes.size >= 2 && quorumAvailable,
      routes: Object.freeze(routes.map(({ routeId }) => initial.get(routeId) ?? state({ routeId, chainId, status: 'unavailable', observedAtMs, safeFailureCode: 'probe_missing' }))),
    });
    this.#health.set(chainId, snapshot);
    return snapshot;
  }

  select(chainId: string, nowMs: number): Readonly<RpcRouteHealth> {
    return this.selectMany(chainId, nowMs, 1)[0]!;
  }

  selectMany(chainId: string, nowMs: number, count: number): readonly Readonly<RpcRouteHealth>[] {
    const chain = this.#chains.get(chainId);
    const snapshot = this.#health.get(chainId);
    if (!chain || !snapshot || !Number.isSafeInteger(nowMs) || nowMs < snapshot.observedAtMs || nowMs - snapshot.observedAtMs > chain.staleAfterMs || !Number.isSafeInteger(count) || count < 1 || count > 3) throw new Error('rpc_chain_health_unavailable');
    const selected = snapshot.routes.filter(({ status }) => status === 'healthy').sort((left, right) => (right.height ?? -1) - (left.height ?? -1) || (left.latencyMs ?? Number.MAX_SAFE_INTEGER) - (right.latencyMs ?? Number.MAX_SAFE_INTEGER) || left.routeId.localeCompare(right.routeId)).slice(0, count);
    if (selected.length < count) throw new Error('rpc_route_unavailable');
    return Object.freeze(selected);
  }

  status(chainId: string, nowMs: number): Readonly<RpcChainHealth> {
    const chain = this.#chains.get(chainId);
    const snapshot = this.#health.get(chainId);
    if (!chain || !snapshot || !Number.isSafeInteger(nowMs) || nowMs < snapshot.observedAtMs || nowMs - snapshot.observedAtMs > chain.staleAfterMs) throw new Error('rpc_chain_health_unavailable');
    return snapshot;
  }
}
