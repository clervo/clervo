import type { NormalizedCryptoTransaction, NormalizedCryptoWallet } from './normalization.js';

type TransactionCoverage = 'transactions' | 'token_transfers';

export interface CryptoReportInput {
  wallet: Readonly<NormalizedCryptoWallet>;
  transactions: readonly Readonly<NormalizedCryptoTransaction>[];
  transactionCoverage: readonly TransactionCoverage[];
  transactionMissing: readonly TransactionCoverage[];
  transactionTruncated: boolean;
  sourceStates: readonly Readonly<{ sourceRef: string; state: 'available' | 'unavailable'; failureCode: string | null }>[];
  generatedAt: string;
  lookbackDays?: number;
}

type Flow = {
  assetId: string;
  decimals: number;
  inboundAtomic: bigint;
  outboundAtomic: bigint;
  inboundCount: number;
  outboundCount: number;
};

function iso(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError(code);
  return parsed;
}

function flowOf(flows: Map<string, Flow>, assetId: string, decimals: number): Flow {
  const previous = flows.get(assetId);
  if (previous !== undefined) {
    if (previous.decimals !== decimals) throw new TypeError('crypto_report_asset_decimals_conflict');
    return previous;
  }
  const created = { assetId, decimals, inboundAtomic: 0n, outboundAtomic: 0n, inboundCount: 0, outboundCount: 0 };
  flows.set(assetId, created);
  return created;
}

function signal(signalId: string, reason: string, observations: readonly string[], lookbackDays: number, coverage: readonly string[]) {
  return Object.freeze({
    signalId,
    reason,
    inputs: Object.freeze({ lookbackDays }),
    observations: Object.freeze([...observations]),
    coverage: Object.freeze([...coverage]),
    quality: Object.freeze({ method: 'deterministic', confidence: 'bounded_observation' }),
  });
}

export function buildCryptoReport(input: Readonly<CryptoReportInput>) {
  const generatedMs = iso(input.generatedAt, 'crypto_report_invalid');
  const lookbackDays = input.lookbackDays ?? 30;
  if (!Number.isSafeInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 90
    || input.transactions.length > 100
    || input.transactions.some((transaction) => transaction.chainId !== input.wallet.chainId)
    || new Set(input.transactionCoverage).size !== input.transactionCoverage.length
    || new Set(input.transactionMissing).size !== input.transactionMissing.length) throw new TypeError('crypto_report_invalid');

  const lookbackStartMs = generatedMs - lookbackDays * 86_400_000;
  const transactions = input.transactions.filter(({ timestamp }) => timestamp === null || Date.parse(timestamp) >= lookbackStartMs);
  const confirmed = transactions.filter(({ status }) => status === 'confirmed');
  const walletAddress = input.wallet.address;
  const flows = new Map<string, Flow>();
  const counterparties = new Map<string, { transactionIds: Set<string>; inbound: number; outbound: number }>();
  const observeCounterparty = (address: string | null, transactionId: string, direction: 'inbound' | 'outbound'): void => {
    if (address === null || address === walletAddress) return;
    const current = counterparties.get(address) ?? { transactionIds: new Set<string>(), inbound: 0, outbound: 0 };
    if (!current.transactionIds.has(transactionId)) {
      current.transactionIds.add(transactionId);
      current[direction] += 1;
    }
    counterparties.set(address, current);
  };

  for (const transaction of confirmed) {
    if (transaction.nativeValueAtomic !== null && transaction.nativeValueAtomic !== '0') {
      const native = flowOf(flows, `${input.wallet.chainId}/native`, input.wallet.nativeBalance?.decimals ?? 18);
      if (transaction.to === walletAddress && transaction.from !== walletAddress) {
        native.inboundAtomic += BigInt(transaction.nativeValueAtomic); native.inboundCount += 1;
        observeCounterparty(transaction.from, transaction.transactionId, 'inbound');
      } else if (transaction.from === walletAddress && transaction.to !== walletAddress) {
        native.outboundAtomic += BigInt(transaction.nativeValueAtomic); native.outboundCount += 1;
        observeCounterparty(transaction.to, transaction.transactionId, 'outbound');
      }
    } else {
      if (transaction.to === walletAddress && transaction.from !== walletAddress) observeCounterparty(transaction.from, transaction.transactionId, 'inbound');
      if (transaction.from === walletAddress && transaction.to !== walletAddress) observeCounterparty(transaction.to, transaction.transactionId, 'outbound');
    }
    for (const transfer of transaction.tokenTransfers) {
      const current = flowOf(flows, transfer.assetId, transfer.decimals);
      if (transfer.to === walletAddress && transfer.from !== walletAddress) {
        current.inboundAtomic += BigInt(transfer.amountAtomic); current.inboundCount += 1;
        observeCounterparty(transfer.from, transaction.transactionId, 'inbound');
      } else if (transfer.from === walletAddress && transfer.to !== walletAddress) {
        current.outboundAtomic += BigInt(transfer.amountAtomic); current.outboundCount += 1;
        observeCounterparty(transfer.to, transaction.transactionId, 'outbound');
      }
    }
  }

  const flowByAsset = Object.freeze([...flows.values()].map((value) => Object.freeze({
    assetId: value.assetId,
    decimals: value.decimals,
    inboundAtomic: value.inboundAtomic.toString(),
    outboundAtomic: value.outboundAtomic.toString(),
    netAtomic: (value.inboundAtomic - value.outboundAtomic).toString(),
    inboundCount: value.inboundCount,
    outboundCount: value.outboundCount,
  })).sort((left, right) => left.assetId.localeCompare(right.assetId)));
  const topCounterparties = Object.freeze([...counterparties.entries()].map(([address, value]) => Object.freeze({
    address,
    direction: value.inbound > 0 && value.outbound > 0 ? 'bidirectional' : value.inbound > 0 ? 'inbound' : 'outbound',
    interactionCount: value.transactionIds.size,
    inboundInteractionCount: value.inbound,
    outboundInteractionCount: value.outbound,
  })).sort((left, right) => right.interactionCount - left.interactionCount || left.address.localeCompare(right.address)).slice(0, 10));

  const timestamps = transactions.flatMap(({ timestamp }) => timestamp === null ? [] : [timestamp]).sort();
  const covered = new Set<string>(input.wallet.coverage);
  for (const item of input.transactionCoverage) covered.add(item);
  const missing = new Set<string>(input.transactionMissing);
  for (const item of ['native_balance', 'token_balances', 'transactions', 'token_transfers', 'prices'] as const) if (!covered.has(item)) missing.add(item);
  const sourceByRef = new Map<string, { sourceRef: string; state: 'available' | 'unavailable'; failureCode: string | null }>();
  for (const state of input.sourceStates) {
    const previous = sourceByRef.get(state.sourceRef);
    sourceByRef.set(state.sourceRef, previous?.state === 'unavailable' ? previous : { ...state });
  }
  const sourceStates = Object.freeze([...sourceByRef.values()].map((value) => Object.freeze(value)));
  const degraded = missing.size > 0 || input.transactionTruncated || sourceStates.some(({ state }) => state === 'unavailable') || input.wallet.freshness.status === 'stale';
  const evidence = Object.freeze([...new Map([...input.wallet.evidence, ...transactions.flatMap(({ evidence }) => evidence)].map((item) => [item.evidenceRef, item])).values()]);
  const signals = [];
  if (confirmed.length >= 20) signals.push(signal('high_recent_activity', `${confirmed.length} confirmed transactions were observed in the bounded lookback.`, [`confirmedTransactions=${confirmed.length}`], lookbackDays, [...covered]));
  const repeated = topCounterparties.filter(({ interactionCount }) => interactionCount >= 3);
  if (repeated.length > 0) signals.push(signal('repeat_counterparty_activity', `${repeated.length} counterparties appeared in at least three observed transactions.`, repeated.map(({ address, interactionCount }) => `${address}:${interactionCount}`), lookbackDays, [...covered]));

  return Object.freeze({
    schemaVersion: 'clervo.crypto-wallet-report.v1',
    wallet: Object.freeze({ walletRef: input.wallet.walletRef, address: walletAddress, chainId: input.wallet.chainId }),
    observedAt: input.wallet.observedAt,
    derivedAt: input.generatedAt,
    lookback: Object.freeze({ days: lookbackDays, startsAt: new Date(lookbackStartMs).toISOString(), endsAt: input.generatedAt }),
    state: degraded ? 'degraded' : 'available',
    portfolio: Object.freeze({
      nativeBalance: input.wallet.nativeBalance,
      tokenHoldings: input.wallet.assets,
      tokenHoldingCount: input.wallet.assets.length,
      valuation: Object.freeze({ status: 'unavailable', reason: 'No commercially qualified price source is used; amounts remain exact in asset-native units.' }),
      concentration: Object.freeze({ status: 'unavailable', reason: 'Asset concentration is not derived without a common commercially qualified valuation basis.' }),
    }),
    activity: Object.freeze({
      observedTransactionCount: transactions.length,
      confirmedTransactionCount: confirmed.length,
      failedTransactionCount: transactions.filter(({ status }) => status === 'failed').length,
      unknownStatusCount: transactions.filter(({ status }) => status === 'unknown').length,
      firstObservedActivityAt: timestamps[0] ?? null,
      latestObservedActivityAt: timestamps.at(-1) ?? null,
      averageObservedTransactionsPerDay: Number((transactions.length / lookbackDays).toFixed(4)),
      transactions: Object.freeze(transactions),
    }),
    flows: Object.freeze({ byAsset: flowByAsset, comparisonAcrossAssetsAvailable: false }),
    counterparties: Object.freeze({ top: topCounterparties, methodology: 'Distinct observed transactions, using explicit native and token transfer endpoints only; no identity labels are inferred.' }),
    signals: Object.freeze(signals),
    freshness: Object.freeze({ status: input.wallet.freshness.status, ageMs: input.wallet.freshness.ageMs, staleAfterMs: input.wallet.freshness.staleAfterMs }),
    coverage: Object.freeze({
      covered: Object.freeze([...covered]),
      missing: Object.freeze([...missing]),
      transactionLimitReached: input.transactionTruncated,
      sourceStates,
      quality: degraded ? 'partial' : 'complete_for_declared_scope',
    }),
    evidence,
    evidenceRefs: Object.freeze(evidence.map(({ evidenceRef }) => evidenceRef)),
    provenance: Object.freeze({ sourceClass: 'qualified_indexed_onchain_data', derivation: 'deterministic_clervo_wallet_intelligence', thirdPartyLabelsUsed: false }),
    warnings: Object.freeze([
      ...(missing.size > 0 ? [`Coverage is incomplete: ${[...missing].join(', ')}.`] : []),
      ...(input.transactionTruncated ? ['Activity reached the bounded result limit; counts and flows are lower bounds within the requested lookback.'] : []),
      ...(input.wallet.conflicts.length > 0 ? ['Conflicting source values remain unresolved.'] : []),
    ]),
    disclaimer: 'This deterministic report describes bounded observed on-chain evidence only; it does not identify wallet owners, score risk, give advice, custody assets, sign, or trade.',
  });
}
