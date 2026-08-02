import { createHash } from 'node:crypto';

import type { WalletAddressOverview, WalletTokenBalance, WalletTransactionSummary } from './blockscout-data.js';
import {
  normalizeCryptoTransaction,
  normalizeCryptoWallet,
  type CryptoChainId,
  type CryptoEvidence,
  type NormalizedCryptoWallet,
} from '../../../services/crypto/src/normalization.js';

const SOLANA_MAINNET: CryptoChainId = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

function evidence(sourceUrl: string, observedAt: string, fieldGroups: readonly string[]): Readonly<CryptoEvidence> {
  const parsed = new URL(sourceUrl);
  return Object.freeze({
    evidenceRef: `evidence_${createHash('sha256').update(`${parsed.href}\0${observedAt}\0${fieldGroups.join(',')}`).digest('hex').slice(0, 32)}`,
    sourceUrl: parsed.href,
    observedAt,
    fieldGroups: Object.freeze([...fieldGroups]),
  });
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
}>): Readonly<NormalizedCryptoWallet> {
  const chainId = evmChain(input.chainId);
  const sourceUrl = `https://blockscout.com/address/${input.overview.address}`;
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
    coverage: ['native_balance', 'token_balances'],
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
    evidence: [evidence(`https://blockscout.com/tx/${transaction.transactionHash}`, input.observedAt, ['transaction'])],
  })));
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
  const assets = tokenAccounts.value.map((entry) => {
    const account = record(entry);
    const accountData = record(record(account.account).data);
    if (accountData.program !== 'spl-token' && accountData.program !== 'spl-token-2022') throw new Error('crypto_solana_response_invalid');
    const info = record(record(accountData.parsed).info);
    if (info.owner !== address) throw new Error('crypto_solana_response_invalid');
    const tokenAmount = record(info.tokenAmount);
    const decimals = tokenAmount.decimals;
    if (!Number.isSafeInteger(decimals) || (decimals as number) < 0 || (decimals as number) > 255) throw new Error('crypto_solana_response_invalid');
    return Object.freeze({
      assetAddress: base58(info.mint),
      symbol: null,
      name: null,
      decimals: decimals as number,
      balanceAtomic: unsigned(tokenAmount.amount),
      risk: { level: 'unverified' as const, classifications: Object.freeze(['metadata_unavailable']), evidenceRefs: Object.freeze([]) },
    });
  });
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
