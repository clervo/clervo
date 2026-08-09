import { createHash } from 'node:crypto';

import type { TokenOverview, WalletAddressOverview, WalletTokenBalance, WalletTokenTransferSummary, WalletTransactionSummary } from './blockscout-data.js';
import {
  normalizeCryptoTransaction,
  normalizeCryptoToken,
  normalizeCryptoWallet,
  type CryptoChainId,
  type CryptoEvidence,
  type NormalizedCryptoWallet,
} from '../../../services/crypto/src/normalization.js';

const SOLANA_MAINNET: CryptoChainId = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

function blockscoutExplorer(chainId: number): string {
  if (chainId === 1) return 'https://eth.blockscout.com';
  if (chainId === 8453) return 'https://base.blockscout.com';
  throw new TypeError('crypto_evm_chain_invalid');
}

function evidence(sourceUrl: string, observedAt: string, fieldGroups: readonly string[]): Readonly<CryptoEvidence> {
  const parsed = new URL(sourceUrl);
  return Object.freeze({
    evidenceRef: `evidence_${createHash('sha256').update(`${parsed.href}\0${observedAt}\0${fieldGroups.join(',')}`).digest('hex').slice(0, 32)}`,
    sourceUrl: parsed.href,
    observedAt,
    fieldGroups: Object.freeze([...fieldGroups]),
  });
}

export function normalizeBlockscoutToken(input: Readonly<{
  chainId: number;
  token: Readonly<TokenOverview>;
  observedAt: string;
  staleAfterMs: number;
  nowMs: number;
}>) {
  const chainId = evmChain(input.chainId);
  return normalizeCryptoToken({
    chainId,
    assetAddress: input.token.contractAddress,
    symbol: input.token.symbol,
    name: input.token.name,
    decimals: input.token.decimals,
    totalSupplyAtomic: input.token.totalSupplyAtomic,
    priceMicrousd: null,
    marketCapMicrousd: null,
    liquidityMicrousd: null,
    observedAt: input.observedAt,
    staleAfterMs: input.staleAfterMs,
    confidenceBasisPoints: 7_000,
    confidenceBasis: ['indexed_contract_metadata', 'single_source'],
    evidence: [evidence(`${blockscoutExplorer(input.chainId)}/token/${input.token.contractAddress}`, input.observedAt, ['token_metadata'])],
    risk: { level: 'unverified', classifications: Object.freeze([]), evidenceRefs: Object.freeze([]) },
  }, input.nowMs);
}

function evmChain(chainId: number): CryptoChainId {
  if (!Number.isSafeInteger(chainId) || chainId < 1 || chainId > 9_999_999_999) throw new TypeError('crypto_evm_chain_invalid');
  return `eip155:${chainId}`;
}

export function normalizeBlockscoutWallet(input: Readonly<{
  chainId: number;
  overview: Readonly<WalletAddressOverview>;
  tokens: readonly Readonly<WalletTokenBalance>[];
  nativeSymbol: string;
  nativeDecimals: number;
  observedAt: string;
  staleAfterMs: number;
  nowMs: number;
  coverage?: readonly ('native_balance' | 'token_balances')[];
}>): Readonly<NormalizedCryptoWallet> {
  const chainId = evmChain(input.chainId);
  const sourceUrl = `${blockscoutExplorer(input.chainId)}/address/${input.overview.address}`;
  return normalizeCryptoWallet({
    chainId,
    address: input.overview.address,
    nativeSymbol: input.nativeSymbol,
    nativeDecimals: input.nativeDecimals,
    nativeBalanceAtomic: input.overview.nativeBalanceAtomic,
    assets: input.tokens.map((token) => ({
      assetAddress: token.contractAddress,
      symbol: token.symbol,
      name: null,
      decimals: token.decimals,
      balanceAtomic: token.balanceAtomic,
      risk: { level: 'unverified', classifications: Object.freeze([]), evidenceRefs: Object.freeze([]) },
    })),
    observedAt: input.observedAt,
    staleAfterMs: input.staleAfterMs,
    evidence: [evidence(sourceUrl, input.observedAt, ['native_balance', 'token_balances'])],
    coverage: input.coverage ?? ['native_balance', 'token_balances'],
  }, input.nowMs);
}

export function normalizeBlockscoutTransactions(input: Readonly<{
  chainId: number;
  transactions: readonly Readonly<WalletTransactionSummary>[];
  observedAt: string;
}>): readonly ReturnType<typeof normalizeCryptoTransaction>[] {
  const chainId = evmChain(input.chainId);
  return Object.freeze(input.transactions.map((transaction) => normalizeCryptoTransaction({
    chainId,
    transactionId: transaction.transactionHash,
    blockHeight: transaction.blockNumber,
    timestamp: transaction.timestamp,
    status: transaction.status,
    from: transaction.from,
    to: transaction.to,
    nativeValueAtomic: transaction.valueAtomic,
    tokenTransfers: Object.freeze([]),
    programOrContract: null,
    observedAt: input.observedAt,
    evidence: [evidence(`${blockscoutExplorer(input.chainId)}/tx/${transaction.transactionHash}`, input.observedAt, ['transaction'])],
  })));
}

export function normalizeBlockscoutActivity(input: Readonly<{
  chainId: number;
  transactions: readonly Readonly<WalletTransactionSummary>[];
  tokenTransfers: readonly Readonly<WalletTokenTransferSummary>[];
  observedAt: string;
}>) {
  const chainId = evmChain(input.chainId);
  const explorer = blockscoutExplorer(input.chainId);
  const transfersByTransaction = new Map<string, WalletTokenTransferSummary[]>();
  for (const transfer of input.tokenTransfers) {
    const values = transfersByTransaction.get(transfer.transactionHash) ?? [];
    if (values.some(({ logIndex }) => logIndex === transfer.logIndex)) continue;
    values.push(transfer);
    transfersByTransaction.set(transfer.transactionHash, values);
  }
  const transactionByHash = new Map(input.transactions.map((transaction) => [transaction.transactionHash, transaction]));
  const hashes = [...new Set([...input.transactions.map(({ transactionHash }) => transactionHash), ...input.tokenTransfers.map(({ transactionHash }) => transactionHash)])];
  return Object.freeze(hashes.map((hash) => {
    const transaction = transactionByHash.get(hash);
    const transfers = transfersByTransaction.get(hash) ?? [];
    const firstTransfer = transfers[0];
    if (transaction === undefined && firstTransfer === undefined) throw new TypeError('crypto_blockscout_activity_invalid');
    const observed = transaction ?? {
      transactionHash: hash,
      blockNumber: firstTransfer!.blockNumber,
      timestamp: firstTransfer!.timestamp,
      status: 'unknown' as const,
      from: firstTransfer!.from,
      to: firstTransfer!.to,
      valueAtomic: '0',
    };
    return normalizeCryptoTransaction({
      chainId,
      transactionId: hash,
      blockHeight: observed.blockNumber,
      timestamp: observed.timestamp,
      status: observed.status,
      from: observed.from,
      to: observed.to,
      nativeValueAtomic: observed.valueAtomic,
      tokenTransfers: Object.freeze(transfers.map((transfer) => Object.freeze({
        assetAddress: transfer.contractAddress,
        from: transfer.from,
        to: transfer.to,
        amountAtomic: transfer.amountAtomic,
        decimals: transfer.decimals,
      }))),
      programOrContract: transfers[0]?.contractAddress ?? null,
      observedAt: input.observedAt,
      evidence: [evidence(`${explorer}/tx/${hash}`, input.observedAt, transfers.length > 0 ? ['transaction', 'token_transfers'] : ['transaction'])],
    });
  }).sort((left, right) => (right.timestamp ?? '').localeCompare(left.timestamp ?? '')));
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('crypto_solana_response_invalid');
  return value as Record<string, unknown>;
}

function base58(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(value)) throw new Error('crypto_solana_response_invalid');
  return value;
}

function unsigned(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,99})$/u.test(value)) throw new Error('crypto_solana_response_invalid');
  return value;
}

export function normalizeSolanaRpcWallet(input: Readonly<{
  address: string;
  balanceResult: unknown;
  tokenAccountsResult: unknown;
  observedAt: string;
  staleAfterMs: number;
  nowMs: number;
}>): Readonly<NormalizedCryptoWallet> {
  const address = base58(input.address);
  const balance = record(input.balanceResult);
  const balanceValue = balance.value;
  if (!Number.isSafeInteger(balanceValue) || (balanceValue as number) < 0) throw new Error('crypto_solana_response_invalid');
  const tokenAccounts = record(input.tokenAccountsResult);
  if (!Array.isArray(tokenAccounts.value) || tokenAccounts.value.length > 10_000) throw new Error('crypto_solana_response_invalid');
  const byMint = new Map<string, { assetAddress: string; symbol: null; name: null; decimals: number; balanceAtomic: string; risk: { level: 'unverified'; classifications: readonly string[]; evidenceRefs: readonly string[] } }>();
  for (const entry of tokenAccounts.value) {
    const account = record(entry);
    const accountData = record(record(account.account).data);
    if (accountData.program !== 'spl-token' && accountData.program !== 'spl-token-2022') throw new Error('crypto_solana_response_invalid');
    const info = record(record(accountData.parsed).info);
    if (info.owner !== address) throw new Error('crypto_solana_response_invalid');
    const tokenAmount = record(info.tokenAmount);
    const decimals = tokenAmount.decimals;
    if (!Number.isSafeInteger(decimals) || (decimals as number) < 0 || (decimals as number) > 255) throw new Error('crypto_solana_response_invalid');
    const mint = base58(info.mint);
    const amount = unsigned(tokenAmount.amount);
    const previous = byMint.get(mint);
    if (previous !== undefined && previous.decimals !== decimals) throw new Error('crypto_solana_response_invalid');
    byMint.set(mint, {
      assetAddress: mint,
      symbol: null,
      name: null,
      decimals: decimals as number,
      balanceAtomic: String(BigInt(previous?.balanceAtomic ?? '0') + BigInt(amount)),
      risk: { level: 'unverified' as const, classifications: Object.freeze(['metadata_unavailable']), evidenceRefs: Object.freeze([]) },
    });
  }
  const assets = [...byMint.values()].map((value) => Object.freeze(value));
  return normalizeCryptoWallet({
    chainId: SOLANA_MAINNET,
    address,
    nativeSymbol: 'SOL',
    nativeDecimals: 9,
    nativeBalanceAtomic: String(balanceValue),
    assets,
    observedAt: input.observedAt,
    staleAfterMs: input.staleAfterMs,
    evidence: [evidence(`https://explorer.solana.com/address/${address}`, input.observedAt, ['native_balance', 'token_balances'])],
    coverage: ['native_balance', 'token_balances'],
  }, input.nowMs);
}

export function normalizeSolanaRpcToken(input: Readonly<{
  assetAddress: string;
  supplyResult: unknown;
  observedAt: string;
  staleAfterMs: number;
  nowMs: number;
}>) {
  const assetAddress = base58(input.assetAddress);
  const supply = record(input.supplyResult);
  const value = record(supply.value);
  const decimals = value.decimals;
  if (!Number.isSafeInteger(decimals) || (decimals as number) < 0 || (decimals as number) > 255) throw new Error('crypto_solana_response_invalid');
  return normalizeCryptoToken({
    chainId: SOLANA_MAINNET,
    assetAddress,
    symbol: null,
    name: null,
    decimals: decimals as number,
    totalSupplyAtomic: unsigned(value.amount),
    priceMicrousd: null,
    marketCapMicrousd: null,
    liquidityMicrousd: null,
    observedAt: input.observedAt,
    staleAfterMs: input.staleAfterMs,
    confidenceBasisPoints: 8_000,
    confidenceBasis: ['onchain_token_supply', 'metadata_unavailable'],
    evidence: [evidence(`https://explorer.solana.com/address/${assetAddress}`, input.observedAt, ['token_metadata'])],
    risk: { level: 'unverified', classifications: ['metadata_unavailable'], evidenceRefs: [] },
  }, input.nowMs);
}

export function normalizeSolanaRpcTransactions(input: Readonly<{
  address: string;
  signaturesResult: unknown;
  observedAt: string;
}>): readonly ReturnType<typeof normalizeCryptoTransaction>[] {
  const address = base58(input.address);
  if (!Array.isArray(input.signaturesResult) || input.signaturesResult.length > 100) throw new Error('crypto_solana_response_invalid');
  return Object.freeze(input.signaturesResult.map((entry) => {
    const row = record(entry);
    const signature = typeof row.signature === 'string' && /^[1-9A-HJ-NP-Za-km-z]{64,128}$/u.test(row.signature) ? row.signature : null;
    if (signature === null || !Number.isSafeInteger(row.slot) || (row.slot as number) < 0 || row.blockTime !== null && (!Number.isSafeInteger(row.blockTime) || (row.blockTime as number) < 0)) throw new Error('crypto_solana_response_invalid');
    const timestamp = row.blockTime === null ? null : new Date((row.blockTime as number) * 1_000).toISOString();
    return normalizeCryptoTransaction({
      chainId: SOLANA_MAINNET,
      transactionId: signature,
      blockHeight: row.slot as number,
      timestamp,
      status: row.err === null ? 'confirmed' : 'failed',
      from: address,
      to: null,
      nativeValueAtomic: null,
      tokenTransfers: Object.freeze([]),
      programOrContract: null,
      observedAt: input.observedAt,
      evidence: [evidence(`https://explorer.solana.com/tx/${signature}`, input.observedAt, ['transaction'])],
    });
  }));
}
