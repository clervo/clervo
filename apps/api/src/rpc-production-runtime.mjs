import { createRpcOperationResult } from '../../../dist/packages/contracts/src/index.js';
import { createBoundedRpcHttpTransport, JsonRpcAdapter } from '../../../dist/adapters/rpc/src/json-rpc.js';
import { InMemoryRpcCacheStore, RpcGateway } from '../../../dist/services/rpc/src/gateway.js';
import { RpcHealthRouter } from '../../../dist/services/rpc/src/health.js';
import { RpcMethodPolicy } from '../../../dist/services/rpc/src/policy.js';

const ETHEREUM_CHAIN = Object.freeze({
  chainId: 'eip155:1', protocol: 'evm', enabled: true,
  finalityDepth: 64, maximumReorgDepth: 32, staleAfterMs: 15_000,
  maximumBatchSize: 20, maximumResponseBytes: 10_485_760,
  archiveQualified: false, broadcastQualified: false,
});
const QUALIFICATION_ID = 'qual_GoogleRpcEthMainnet20260804';

function endpoint(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new TypeError('rpc_production_endpoint_invalid'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash
    || !(parsed.hostname === 'googleapis.com' || parsed.hostname.endsWith('.googleapis.com'))
    || parsed.pathname === '/') throw new TypeError('rpc_production_endpoint_invalid');
  return Object.freeze({ value: parsed.href, hostname: parsed.hostname });
}

export function createRpcProductionRuntime({ ethereumEndpoint, fetcher = globalThis.fetch, now = () => Date.now() } = {}) {
  const selectedEndpoint = endpoint(ethereumEndpoint);
  if (typeof fetcher !== 'function' || typeof now !== 'function') throw new TypeError('rpc_production_runtime_invalid');
  const adapter = new JsonRpcAdapter({
    config: {
      routeId: 'rpc.route.google_ethereum', chainId: ETHEREUM_CHAIN.chainId,
      allowedHosts: [selectedEndpoint.hostname], maximumRequestBytes: 262_144,
      maximumResponseBytes: ETHEREUM_CHAIN.maximumResponseBytes, timeoutMs: 8_000,
    },
    transport: createBoundedRpcHttpTransport(fetcher),
    async resolveEndpoint() { return selectedEndpoint.value; },
  });
  const routes = Object.freeze([adapter]);
  const health = new RpcHealthRouter({ chains: [ETHEREUM_CHAIN], routes });
  const gateway = new RpcGateway({
    policy: new RpcMethodPolicy([ETHEREUM_CHAIN]), health, routes,
    cache: new InMemoryRpcCacheStore(), maximumConcurrentRequests: 32,
  });
  let healthPromise;
  let lastHealthAt = -1;
  async function refreshHealth(nowMs, signal) {
    if (lastHealthAt >= 0 && nowMs - lastHealthAt < 5_000) return;
    healthPromise ??= health.refresh(ETHEREUM_CHAIN.chainId, nowMs, signal)
      .then(() => { lastHealthAt = nowMs; })
      .finally(() => { healthPromise = undefined; });
    await healthPromise;
  }
  return Object.freeze({
    durable: true,
    qualificationId: QUALIFICATION_ID,
    chains: Object.freeze([ETHEREUM_CHAIN.chainId]),
    async ready() {
      const observedAt = now();
      await refreshHealth(observedAt);
      return true;
    },
    async execute(request) {
      if (!['rpc.call', 'rpc.batch'].includes(request.productId) || request.input.chainId !== ETHEREUM_CHAIN.chainId) throw new Error('rpc_product_unavailable');
      const nowMs = now();
      if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs >= Date.parse(request.deadlineAt)) throw new Error('rpc_operation_deadline_exceeded');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, Date.parse(request.deadlineAt) - nowMs));
      try {
        await refreshHealth(nowMs, controller.signal);
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
            request, completedAt,
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
