import { createRpcOperationResult } from '../../../dist/packages/contracts/src/index.js';
import { createBoundedRpcHttpTransport, JsonRpcAdapter } from '../../../dist/adapters/rpc/src/json-rpc.js';
import { InMemoryRpcCacheStore, RpcGateway } from '../../../dist/services/rpc/src/gateway.js';
import { RpcHealthRouter } from '../../../dist/services/rpc/src/health.js';
import { RpcMethodPolicy } from '../../../dist/services/rpc/src/policy.js';

const CHAINS = Object.freeze([
  { chainId: 'eip155:1', name: 'Ethereum', protocol: 'evm', network: 'ethereum', finalityDepth: 64, maximumReorgDepth: 32, staleAfterMs: 30_000 },
  { chainId: 'eip155:10', name: 'Optimism', protocol: 'evm', network: 'optimism', finalityDepth: 100, maximumReorgDepth: 50, staleAfterMs: 30_000 },
  { chainId: 'eip155:56', name: 'BNB Smart Chain', protocol: 'evm', network: 'bsc', finalityDepth: 30, maximumReorgDepth: 15, staleAfterMs: 30_000 },
  { chainId: 'eip155:137', name: 'Polygon', protocol: 'evm', network: 'polygon', finalityDepth: 256, maximumReorgDepth: 128, staleAfterMs: 30_000 },
  { chainId: 'eip155:8453', name: 'Base', protocol: 'evm', network: 'base', finalityDepth: 100, maximumReorgDepth: 50, staleAfterMs: 30_000 },
  { chainId: 'eip155:42161', name: 'Arbitrum One', protocol: 'evm', network: 'arbitrum', finalityDepth: 100, maximumReorgDepth: 50, staleAfterMs: 30_000 },
  { chainId: 'eip155:43114', name: 'Avalanche C-Chain', protocol: 'evm', network: 'avalanche', finalityDepth: 20, maximumReorgDepth: 10, staleAfterMs: 30_000 },
  { chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', name: 'Solana', protocol: 'solana', network: 'solana-mainnet', finalityDepth: 32, maximumReorgDepth: 16, staleAfterMs: 30_000 },
].map((chain) => Object.freeze({
  ...chain,
  enabled: true,
  maximumBatchSize: 20,
  maximumResponseBytes: 10_485_760,
  archiveQualified: false,
  broadcastQualified: false,
})));

const PUBLIC_FALLBACKS = Object.freeze({
  'eip155:1': Object.freeze(['https://ethereum.publicnode.com', 'https://eth.llamarpc.com']),
  'eip155:10': Object.freeze(['https://optimism.publicnode.com', 'https://optimism.llamarpc.com']),
  'eip155:56': Object.freeze(['https://bsc.publicnode.com', 'https://bsc.llamarpc.com']),
  'eip155:137': Object.freeze(['https://polygon.publicnode.com', 'https://polygon-rpc.com']),
  'eip155:8453': Object.freeze(['https://base-rpc.publicnode.com', 'https://base.llamarpc.com']),
  'eip155:42161': Object.freeze(['https://arbitrum.publicnode.com', 'https://arbitrum.llamarpc.com']),
  'eip155:43114': Object.freeze(['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche.llamarpc.com']),
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': Object.freeze(['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com']),
});

const ALLOWED_HOSTS = new Set(Object.values(PUBLIC_FALLBACKS).flat().map((value) => new URL(value).hostname));
ALLOWED_HOSTS.add('lb.drpc.org');
ALLOWED_HOSTS.add('mainnet.helius-rpc.com');

const QUALIFICATION_ID = 'qual_ClervoRpcEightNetworks20260815';

function credential(value, code) {
  if (typeof value !== 'string' || value.length < 16 || value.length > 512 || /[\u0000-\u0020\u007F]/u.test(value)) throw new TypeError(code);
  return value;
}

function endpoint(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new TypeError('rpc_production_endpoint_invalid'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash
    || !ALLOWED_HOSTS.has(parsed.hostname)) throw new TypeError('rpc_production_endpoint_invalid');
  return Object.freeze({ value: parsed.href, hostname: parsed.hostname });
}

function routeName(chainId) {
  return chainId.replace(':', '_').replaceAll(/[^a-z0-9_]/giu, '_').toLowerCase();
}

function authenticatedFetcher(fetcher, headers) {
  return (url, init = {}) => fetcher(url, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers).entries()), ...headers } });
}

function utcDay(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function createRpcProductionRuntime({
  drpcApiKey,
  heliusApiKey,
  fetcher = globalThis.fetch,
  now = () => Date.now(),
  dailyCallCeiling = 100_000,
} = {}) {
  const drpcKey = credential(drpcApiKey, 'rpc_drpc_credential_invalid');
  const heliusKey = credential(heliusApiKey, 'rpc_helius_credential_invalid');
  if (typeof fetcher !== 'function' || typeof now !== 'function' || !Number.isSafeInteger(dailyCallCeiling) || dailyCallCeiling < 1 || dailyCallCeiling > 1_000_000) throw new TypeError('rpc_production_runtime_invalid');

  let countedDay = null;
  let upstreamCalls = 0;
  const limitedFetcher = async (url, init) => {
    const nowMs = now();
    const day = utcDay(nowMs);
    if (day !== countedDay) { countedDay = day; upstreamCalls = 0; }
    if (upstreamCalls >= dailyCallCeiling) throw new Error('rpc_daily_call_ceiling');
    upstreamCalls += 1;
    return fetcher(url, init);
  };

  const routes = [];
  for (const chain of CHAINS) {
    const primary = chain.protocol === 'evm'
      ? endpoint(`https://lb.drpc.org/ogrpc?network=${chain.network}`)
      : endpoint(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}`);
    const primaryFetcher = chain.protocol === 'evm'
      ? authenticatedFetcher(limitedFetcher, { 'drpc-key': drpcKey })
      : limitedFetcher;
    const candidates = [
      { id: 'primary', selected: primary, fetcher: primaryFetcher },
      ...PUBLIC_FALLBACKS[chain.chainId].map((value, index) => ({ id: `fallback_${index + 1}`, selected: endpoint(value), fetcher: limitedFetcher })),
    ];
    for (const candidate of candidates) {
      routes.push(new JsonRpcAdapter({
        config: {
          routeId: `rpc.route.${routeName(chain.chainId)}_${candidate.id}`,
          chainId: chain.chainId,
          allowedHosts: [candidate.selected.hostname],
          maximumRequestBytes: 262_144,
          maximumResponseBytes: chain.maximumResponseBytes,
          timeoutMs: 8_000,
        },
        transport: createBoundedRpcHttpTransport(candidate.fetcher),
        async resolveEndpoint() { return candidate.selected.value; },
      }));
    }
  }

  const frozenRoutes = Object.freeze(routes);
  const health = new RpcHealthRouter({ chains: CHAINS, routes: frozenRoutes });
  const gateway = new RpcGateway({
    policy: new RpcMethodPolicy(CHAINS), health, routes: frozenRoutes,
    cache: new InMemoryRpcCacheStore(), maximumConcurrentRequests: 32,
  });
  const healthPromises = new Map();
  const lastHealthAt = new Map();
  async function refreshHealth(chainId, nowMs, signal) {
    const last = lastHealthAt.get(chainId);
    if (last !== undefined && nowMs - last < 15_000) return;
    let promise = healthPromises.get(chainId);
    if (promise === undefined) {
      promise = health.refresh(chainId, nowMs, signal)
        .then(() => { lastHealthAt.set(chainId, nowMs); })
        .finally(() => { healthPromises.delete(chainId); });
      healthPromises.set(chainId, promise);
    }
    await promise;
  }

  return Object.freeze({
    durable: true,
    qualificationId: QUALIFICATION_ID,
    chains: Object.freeze(CHAINS.map(({ chainId, name, protocol }) => Object.freeze({ chainId, name, protocol }))),
    limits: Object.freeze({ maximumBatchSize: 20, maximumConcurrentRequests: 32, timeoutMs: 30_000, dailyCallCeiling }),
    async ready() {
      const observedAt = now();
      await Promise.all(CHAINS.map(({ chainId }) => refreshHealth(chainId, observedAt)));
      return CHAINS.every(({ chainId }) => {
        try { return health.healthy(chainId, observedAt).length >= 1; } catch { return false; }
      });
    },
    async health() {
      const observedAt = now();
      await Promise.all(CHAINS.map(({ chainId }) => refreshHealth(chainId, observedAt)));
      return Object.freeze(CHAINS.map(({ chainId, name, protocol }) => {
        try {
          const snapshot = health.status(chainId, observedAt);
          return Object.freeze({ chainId, name, protocol, status: snapshot.routes.some(({ status }) => status === 'healthy') ? 'healthy' : 'unavailable', healthyRoutes: snapshot.routes.filter(({ status }) => status === 'healthy').length, highestHeight: snapshot.highestHeight, observedAt: new Date(snapshot.observedAtMs).toISOString() });
        } catch {
          return Object.freeze({ chainId, name, protocol, status: 'unavailable', healthyRoutes: 0, highestHeight: null, observedAt: new Date(observedAt).toISOString() });
        }
      }));
    },
    async execute(request) {
      if (!['rpc.call', 'rpc.batch'].includes(request.productId) || !CHAINS.some(({ chainId }) => request.input.chainId === chainId)) throw new Error('rpc_product_unavailable');
      const nowMs = now();
      if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs >= Date.parse(request.deadlineAt)) throw new Error('rpc_operation_deadline_exceeded');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, Date.parse(request.deadlineAt) - nowMs));
      try {
        await refreshHealth(request.input.chainId, nowMs, controller.signal);
        const input = request.input;
        const completed = await gateway.execute({
          productId: request.productId,
          chainId: input.chainId,
          calls: input.kind === 'batch' ? input.calls : input.call,
          quorum: input.quorum,
          nowMs,
          signal: controller.signal,
        });
        const completedAt = new Date(now()).toISOString();
        return Object.freeze({
          qualificationId: QUALIFICATION_ID,
          result: createRpcOperationResult({
            request,
            completedAt,
            meteredCharge: { asset: 'USD', amountAtomic: '0', decimals: 6 },
            output: Object.freeze({
              kind: 'rpc', chainId: completed.chainId, outcomes: completed.outcomes,
              cache: completed.cache, quorum: completed.quorum,
              observedAt: new Date(completed.observedAtMs).toISOString(),
              requestHash: completed.requestHash,
            }),
          }),
        });
      } finally { clearTimeout(timer); }
    },
  });
}
