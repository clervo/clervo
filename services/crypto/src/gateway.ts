import {
  mergeCryptoTokenEvidence,
  mergeCryptoWalletEvidence,
  type CryptoChainId,
  type NormalizedCryptoTransaction,
  type NormalizedCryptoToken,
  type NormalizedCryptoWallet,
} from './normalization.js';
import { buildCryptoReport } from './report.js';

export type CryptoTransaction = NormalizedCryptoTransaction;

export type CryptoTransactionBatch = Readonly<{
  transactions: readonly CryptoTransaction[];
  coverage: readonly ('transactions' | 'token_transfers')[];
  missing: readonly ('transactions' | 'token_transfers')[];
  truncated: boolean;
}>;

export type CryptoProtocolPosition = Readonly<{
  chainId: CryptoChainId;
  positionRef: string;
  category: string;
  netValueMicrousd: number | null;
  freshness: Readonly<{ status: 'fresh' | 'stale' }>;
  evidence: readonly Readonly<{ evidenceRef: string }>[];
}>;

export interface CryptoIntelligenceSource {
  sourceRef: string;
  chains: readonly CryptoChainId[];
  capabilities: readonly ('wallet' | 'token' | 'transaction' | 'protocol')[];
  wallet?(chainId: CryptoChainId, address: string, signal?: AbortSignal): Promise<Readonly<NormalizedCryptoWallet>>;
  token?(chainId: CryptoChainId, assetAddress: string, signal?: AbortSignal): Promise<Readonly<NormalizedCryptoToken>>;
  transactions?(chainId: CryptoChainId, address: string, limit: number, signal?: AbortSignal): Promise<CryptoTransactionBatch>;
  protocols?(chainId: CryptoChainId, address: string, signal?: AbortSignal): Promise<readonly CryptoProtocolPosition[]>;
}

interface CryptoSourceState {
  sourceRef: string;
  state: 'available' | 'unavailable';
  failureCode: string | null;
}

function chain(value: string): asserts value is CryptoChainId {
  if (!/^(?:eip155:[1-9][0-9]{0,9}|solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp)$/u.test(value)) throw new TypeError('crypto_chain_invalid');
}

function address(value: string): void {
  if (!/^(?:0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/u.test(value)) throw new TypeError('crypto_address_invalid');
}

export class CryptoIntelligenceGateway {
  readonly #sources: readonly CryptoIntelligenceSource[];

  constructor(sources: readonly CryptoIntelligenceSource[]) {
    if (sources.length < 1 || sources.length > 32 || new Set(sources.map(({ sourceRef }) => sourceRef)).size !== sources.length
      || sources.some((source) => !/^crypto_source_[a-f0-9]{16}$/u.test(source.sourceRef)
        || source.chains.length < 1 || new Set(source.chains).size !== source.chains.length
        || source.capabilities.length < 1 || new Set(source.capabilities).size !== source.capabilities.length)) throw new TypeError('crypto_gateway_config_invalid');
    this.#sources = Object.freeze([...sources]);
  }

  #eligible(chainId: CryptoChainId, capability: CryptoIntelligenceSource['capabilities'][number]): readonly CryptoIntelligenceSource[] {
    return this.#sources.filter((source) => source.chains.includes(chainId) && source.capabilities.includes(capability));
  }

  async #collect<T>(sources: readonly CryptoIntelligenceSource[], execute: (source: CryptoIntelligenceSource) => Promise<T>, signal?: AbortSignal): Promise<Readonly<{ values: readonly T[]; sources: readonly Readonly<CryptoSourceState>[] }>> {
    if (signal?.aborted) throw new Error('crypto_request_cancelled');
    const settled = await Promise.allSettled(sources.map(execute));
    const values: T[] = [];
    const states = settled.map((result, index) => {
      const sourceRef = sources[index]!.sourceRef;
      if (result.status === 'rejected') return Object.freeze({ sourceRef, state: 'unavailable' as const, failureCode: signal?.aborted ? 'source_cancelled' : 'source_failed' });
      values.push(result.value);
      return Object.freeze({ sourceRef, state: 'available' as const, failureCode: null });
    });
    return Object.freeze({ values: Object.freeze(values), sources: Object.freeze(states) });
  }

  async wallet(chainId: string, walletAddress: string, signal?: AbortSignal): Promise<Readonly<{ state: 'available' | 'degraded'; wallet: Readonly<NormalizedCryptoWallet>; sources: readonly Readonly<CryptoSourceState>[] }>> {
    chain(chainId);
    address(walletAddress);
    const sources = this.#eligible(chainId, 'wallet').filter((source) => source.wallet !== undefined);
    const collected = await this.#collect(sources, (source) => source.wallet!(chainId, walletAddress, signal), signal);
    if (collected.values.length < 1) throw new Error('crypto_wallet_unavailable');
    if (collected.values.some((wallet) => wallet.chainId !== chainId)) throw new Error('crypto_source_contract_invalid');
    return Object.freeze({ state: collected.values.length === sources.length ? 'available' : 'degraded', wallet: mergeCryptoWalletEvidence(collected.values), sources: collected.sources });
  }

  async token(chainId: string, assetAddress: string, signal?: AbortSignal): Promise<Readonly<{ state: 'available' | 'degraded'; token: Readonly<NormalizedCryptoToken>; sources: readonly Readonly<CryptoSourceState>[] }>> {
    chain(chainId);
    address(assetAddress);
    const sources = this.#eligible(chainId, 'token').filter((source) => source.token !== undefined);
    const collected = await this.#collect(sources, (source) => source.token!(chainId, assetAddress, signal), signal);
    if (collected.values.length < 1) throw new Error('crypto_token_unavailable');
    if (collected.values.some((token) => token.chainId !== chainId)) throw new Error('crypto_source_contract_invalid');
    return Object.freeze({ state: collected.values.length === sources.length ? 'available' : 'degraded', token: mergeCryptoTokenEvidence(collected.values), sources: collected.sources });
  }

  async transactions(chainId: string, walletAddress: string, limit: number, signal?: AbortSignal): Promise<Readonly<{
    state: 'available' | 'degraded';
    transactions: readonly CryptoTransaction[];
    conflicts: readonly Readonly<{ transactionId: string; state: 'unresolved'; evidenceRefs: readonly string[] }>[];
    coverage: readonly ('transactions' | 'token_transfers')[];
    missing: readonly ('transactions' | 'token_transfers')[];
    truncated: boolean;
    sources: readonly Readonly<CryptoSourceState>[];
  }>> {
    chain(chainId);
    address(walletAddress);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('crypto_transaction_limit_invalid');
    const sources = this.#eligible(chainId, 'transaction').filter((source) => source.transactions !== undefined);
    const collected = await this.#collect(sources, (source) => source.transactions!(chainId, walletAddress, limit, signal), signal);
    if (collected.values.length < 1) throw new Error('crypto_transactions_unavailable');
    const byId = new Map<string, CryptoTransaction>();
    const conflicts: { transactionId: string; state: 'unresolved'; evidenceRefs: readonly string[] }[] = [];
    for (const transaction of collected.values.flatMap(({ transactions }) => transactions)) {
      if (transaction.chainId !== chainId) throw new Error('crypto_source_contract_invalid');
      const previous = byId.get(transaction.transactionId);
      if (previous !== undefined && JSON.stringify({ status: previous.status, type: previous.deterministicType, timestamp: previous.timestamp }) !== JSON.stringify({ status: transaction.status, type: transaction.deterministicType, timestamp: transaction.timestamp })) {
        conflicts.push(Object.freeze({ transactionId: transaction.transactionId, state: 'unresolved', evidenceRefs: Object.freeze([...new Set([...previous.evidence, ...transaction.evidence].map(({ evidenceRef }) => evidenceRef))]) }));
      }
      if (previous === undefined) byId.set(transaction.transactionId, transaction);
    }
    const coverage = Object.freeze([...new Set(collected.values.flatMap((batch) => batch.coverage))] as ('transactions' | 'token_transfers')[]);
    const missing = Object.freeze([...new Set(collected.values.flatMap((batch) => batch.missing))] as ('transactions' | 'token_transfers')[]);
    return Object.freeze({
      state: collected.values.length === sources.length && missing.length === 0 ? 'available' : 'degraded',
      transactions: Object.freeze([...byId.values()].sort((left, right) => (right.timestamp ?? '').localeCompare(left.timestamp ?? '')).slice(0, limit)),
      conflicts: Object.freeze(conflicts),
      coverage,
      missing,
      truncated: collected.values.some(({ truncated }) => truncated) || byId.size > limit,
      sources: collected.sources,
    });
  }

  async protocols(chainId: string, walletAddress: string, signal?: AbortSignal): Promise<Readonly<{ state: 'available' | 'degraded'; positions: readonly CryptoProtocolPosition[]; sources: readonly Readonly<CryptoSourceState>[] }>> {
    chain(chainId);
    address(walletAddress);
    const sources = this.#eligible(chainId, 'protocol').filter((source) => source.protocols !== undefined);
    const collected = await this.#collect(sources, (source) => source.protocols!(chainId, walletAddress, signal), signal);
    if (collected.values.length < 1) throw new Error('crypto_protocols_unavailable');
    const positions = collected.values.flat();
    if (positions.some((position) => position.chainId !== chainId)) throw new Error('crypto_source_contract_invalid');
    return Object.freeze({ state: collected.values.length === sources.length ? 'available' : 'degraded', positions: Object.freeze(positions), sources: collected.sources });
  }

  async report(chainId: string, walletAddress: string, generatedAt: string, options: Readonly<{ lookbackDays?: number; limit?: number }> = {}, signal?: AbortSignal): Promise<ReturnType<typeof buildCryptoReport>> {
    const walletResult = await this.wallet(chainId, walletAddress, signal);
    const transactions = await this.transactions(chainId, walletAddress, options.limit ?? 50, signal).catch(() => null);
    return buildCryptoReport({
      wallet: walletResult.wallet,
      transactions: transactions?.transactions ?? Object.freeze([]),
      transactionCoverage: transactions?.coverage ?? Object.freeze([]),
      transactionMissing: transactions?.missing ?? Object.freeze(['transactions', 'token_transfers']),
      transactionTruncated: transactions?.truncated ?? false,
      sourceStates: Object.freeze([...walletResult.sources, ...(transactions?.sources ?? [])]),
      generatedAt,
      ...(options.lookbackDays === undefined ? {} : { lookbackDays: options.lookbackDays }),
    });
  }
}
