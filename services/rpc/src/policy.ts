import { createHash } from 'node:crypto';

export type RpcProtocol = 'evm' | 'solana';
export type RpcProductId = 'rpc.call' | 'rpc.batch' | 'rpc.health' | 'rpc.archive' | 'rpc.broadcast';

export interface RpcChainPolicy {
  chainId: string;
  protocol: RpcProtocol;
  enabled: boolean;
  finalityDepth: number;
  maximumReorgDepth: number;
  staleAfterMs: number;
  maximumBatchSize: number;
  maximumResponseBytes: number;
  archiveQualified: boolean;
  broadcastQualified: boolean;
}

export interface RpcCall { method: string; params: unknown }

const evmReads = new Set(['eth_blockNumber', 'eth_call', 'eth_chainId', 'eth_estimateGas', 'eth_feeHistory', 'eth_gasPrice', 'eth_getBalance', 'eth_getBlockByHash', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getLogs', 'eth_getStorageAt', 'eth_getTransactionByHash', 'eth_getTransactionCount', 'eth_getTransactionReceipt', 'eth_maxPriorityFeePerGas', 'net_version']);
const evmBroadcast = 'eth_sendRawTransaction';
const solanaReads = new Set(['getAccountInfo', 'getBalance', 'getBlock', 'getBlockHeight', 'getBlockTime', 'getEpochInfo', 'getFeeForMessage', 'getGenesisHash', 'getLatestBlockhash', 'getMultipleAccounts', 'getProgramAccounts', 'getSignatureStatuses', 'getSignaturesForAddress', 'getSlot', 'getTokenAccountBalance', 'getTokenAccountsByOwner', 'getTransaction', 'getVersion']);
const solanaBroadcast = 'sendTransaction';

function jsonSize(value: unknown): number {
  let encoded: string | undefined; try { encoded = JSON.stringify(value); } catch { throw new TypeError('rpc_params_invalid'); }
  if (encoded === undefined || encoded.length > 65_536 || /(?:__proto__|constructor|prototype)/u.test(encoded)) throw new TypeError('rpc_params_invalid'); return Buffer.byteLength(encoded);
}

function rawTransaction(call: RpcCall, protocol: RpcProtocol): string {
  if (!Array.isArray(call.params) || typeof call.params[0] !== 'string' || call.params.length < 1 || call.params.length > 2) throw new TypeError('rpc_broadcast_payload_invalid');
  const value = call.params[0];
  if (protocol === 'evm' ? !/^0x[0-9a-fA-F]{2,262144}$/u.test(value) : !/^[1-9A-HJ-NP-Za-km-z]{32,500000}$/u.test(value)) throw new TypeError('rpc_broadcast_payload_invalid');
  return value;
}

function calls(value: RpcCall | readonly RpcCall[]): readonly RpcCall[] {
  return Array.isArray(value) ? value : [value as RpcCall];
}

export class RpcMethodPolicy {
  private readonly chains: ReadonlyMap<string, Readonly<RpcChainPolicy>>;

  constructor(chains: readonly Readonly<RpcChainPolicy>[]) {
    const map = new Map<string, Readonly<RpcChainPolicy>>();
    for (const chain of chains) {
      if (!/^(?:eip155:[1-9][0-9]{0,9}|solana:[A-Za-z0-9]{8,64})$/u.test(chain.chainId) || map.has(chain.chainId) || !['evm', 'solana'].includes(chain.protocol) || !Number.isSafeInteger(chain.finalityDepth) || chain.finalityDepth < 1 || chain.finalityDepth > 10_000 || !Number.isSafeInteger(chain.maximumReorgDepth) || chain.maximumReorgDepth < 1 || chain.maximumReorgDepth > chain.finalityDepth || !Number.isSafeInteger(chain.staleAfterMs) || chain.staleAfterMs < 100 || chain.staleAfterMs > 300_000 || !Number.isSafeInteger(chain.maximumBatchSize) || chain.maximumBatchSize < 1 || chain.maximumBatchSize > 100 || !Number.isSafeInteger(chain.maximumResponseBytes) || chain.maximumResponseBytes < 1_024 || chain.maximumResponseBytes > 52_428_800) throw new TypeError('rpc_chain_policy_invalid');
      map.set(chain.chainId, Object.freeze({ ...chain }));
    }
    this.chains = map;
  }

  authorize(input: Readonly<{ productId: RpcProductId; chainId: string; calls: RpcCall | readonly RpcCall[]; idempotencyKey?: string }>): Readonly<{ chain: Readonly<RpcChainPolicy>; calls: readonly RpcCall[]; sideEffecting: boolean; requestHash: string; cachePolicy: 'never' | 'short' | 'finalized_immutable' }> {
    const chain = this.chains.get(input.chainId); if (!chain?.enabled) throw new Error('rpc_chain_unavailable');
    const requested = calls(input.calls); if (requested.length < 1 || requested.length > chain.maximumBatchSize || (input.productId !== 'rpc.batch' && requested.length !== 1)) throw new TypeError('rpc_batch_invalid');
    const readMethods = chain.protocol === 'evm' ? evmReads : solanaReads; const broadcastMethod = chain.protocol === 'evm' ? evmBroadcast : solanaBroadcast;
    let rawTx: string | undefined;
    for (const call of requested) {
      if (!/^[A-Za-z][A-Za-z0-9_]{1,63}$/u.test(call.method)) throw new TypeError('rpc_method_invalid'); jsonSize(call.params);
      if (input.productId === 'rpc.broadcast') {
        if (!chain.broadcastQualified || requested.length !== 1 || call.method !== broadcastMethod) throw new Error('rpc_broadcast_unavailable'); rawTx = rawTransaction(call, chain.protocol);
      } else if (!readMethods.has(call.method) || call.method === broadcastMethod) throw new Error('rpc_method_denied');
    }
    if (input.productId === 'rpc.archive' && !chain.archiveQualified) throw new Error('rpc_archive_unavailable');
    if (input.productId === 'rpc.broadcast' && (input.idempotencyKey === undefined || !/^idem_[A-Za-z0-9]{20,64}$/u.test(input.idempotencyKey))) throw new TypeError('rpc_broadcast_idempotency_required');
    const canonical = JSON.stringify({ chainId: input.chainId, calls: requested, ...(rawTx === undefined ? {} : { rawTransactionSha256: createHash('sha256').update(rawTx).digest('hex') }) });
    const requestHash = `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
    const immutable = requested.every(({ method }) => ['eth_chainId', 'net_version', 'getGenesisHash'].includes(method));
    return Object.freeze({ chain, calls: Object.freeze(requested.map((call) => Object.freeze({ ...call }))), sideEffecting: input.productId === 'rpc.broadcast', requestHash, cachePolicy: input.productId === 'rpc.broadcast' ? 'never' : immutable ? 'finalized_immutable' : 'short' });
  }
}
