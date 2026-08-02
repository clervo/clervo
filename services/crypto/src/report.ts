import type { NormalizedCryptoToken, NormalizedCryptoWallet } from './normalization.js';

export interface CryptoReportInput {
  wallet: Readonly<NormalizedCryptoWallet>;
  tokens: readonly Readonly<NormalizedCryptoToken>[];
  transactions: readonly Readonly<{ status: 'confirmed' | 'failed' | 'unknown'; deterministicType: string; timestamp: string | null }>[];
  protocols: readonly Readonly<{ category: string; netValueMicrousd: number | null; freshness: Readonly<{ status: 'fresh' | 'stale' }> }>[];
  generatedAt: string;
}

export function buildCryptoReport(input: Readonly<CryptoReportInput>): Readonly<{
  walletRef: string;
  chainId: string;
  generatedAt: string;
  coverage: Readonly<{ covered: readonly string[]; missing: readonly string[] }>;
  summary: Readonly<{ tokenCount: number; transactionCount: number; protocolPositionCount: number; unresolvedConflictCount: number; suspiciousOrMaliciousAssetCount: number }>;
  warnings: readonly string[];
  evidenceRefs: readonly string[];
  disclaimer: string;
}> {
  const generatedMs = Date.parse(input.generatedAt);
  if (!Number.isFinite(generatedMs) || new Date(generatedMs).toISOString() !== input.generatedAt
    || input.tokens.some((token) => token.chainId !== input.wallet.chainId)
    || input.transactions.length > 10_000 || input.protocols.length > 10_000) throw new TypeError('crypto_report_invalid');
  const covered = new Set(input.wallet.coverage);
  if (input.tokens.length > 0) covered.add('token_metadata');
  if (input.transactions.length > 0) covered.add('transactions');
  if (input.protocols.length > 0) covered.add('protocol_positions');
  if (input.tokens.some(({ priceMicrousd }) => priceMicrousd !== null)) covered.add('prices');
  const all = ['native_balance', 'token_balances', 'token_metadata', 'transactions', 'protocol_positions', 'prices'];
  const missing = all.filter((value) => !covered.has(value));
  const warnings: string[] = [];
  if (input.wallet.freshness.status === 'stale' || input.tokens.some(({ freshness }) => freshness.status === 'stale') || input.protocols.some(({ freshness }) => freshness.status === 'stale')) warnings.push('Some covered data is stale.');
  if (input.wallet.conflicts.length > 0 || input.tokens.some(({ conflicts }) => conflicts.length > 0)) warnings.push('Conflicting source values remain unresolved.');
  if (missing.length > 0) warnings.push(`Coverage is incomplete: ${missing.join(', ')}.`);
  if (input.tokens.some(({ risk }) => risk.level === 'suspicious' || risk.level === 'known_malicious')) warnings.push('One or more assets have attributable or cautionary risk signals; verify independently.');
  return Object.freeze({
    walletRef: input.wallet.walletRef,
    chainId: input.wallet.chainId,
    generatedAt: input.generatedAt,
    coverage: Object.freeze({ covered: Object.freeze([...covered]), missing: Object.freeze(missing) }),
    summary: Object.freeze({
      tokenCount: input.tokens.length,
      transactionCount: input.transactions.length,
      protocolPositionCount: input.protocols.length,
      unresolvedConflictCount: input.wallet.conflicts.length + input.tokens.reduce((sum, token) => sum + token.conflicts.length, 0),
      suspiciousOrMaliciousAssetCount: input.tokens.filter(({ risk }) => risk.level === 'suspicious' || risk.level === 'known_malicious').length,
    }),
    warnings: Object.freeze(warnings),
    evidenceRefs: Object.freeze([...new Set([...[...input.wallet.evidence].map(({ evidenceRef }) => evidenceRef), ...input.tokens.flatMap(({ evidence }) => evidence.map(({ evidenceRef }) => evidenceRef))])]),
    disclaimer: 'This deterministic intelligence report describes covered on-chain evidence only; it is not investment, legal, compliance, or safety advice and performs no custody, signing, or trading.',
  });
}
