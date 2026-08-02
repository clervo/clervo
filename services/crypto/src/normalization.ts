import { createHash } from 'node:crypto';

export type CryptoChainId = `eip155:${number}` | 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export type CryptoProtocol = 'evm' | 'solana';
export type CryptoRiskLevel = 'none_observed' | 'unverified' | 'suspicious' | 'known_malicious';

export interface CryptoEvidence {
  evidenceRef: string;
  sourceUrl: string;
  observedAt: string;
  fieldGroups: readonly string[];
}

export interface CryptoAssetInput {
  assetAddress: string | null;
  symbol: string | null;
  name: string | null;
  decimals: number;
  balanceAtomic: string;
  risk?: Readonly<{
    level: CryptoRiskLevel;
    classifications: readonly string[];
    evidenceRefs: readonly string[];
  }>;
}

export interface CryptoWalletSnapshotInput {
  chainId: CryptoChainId;
  address: string;
  nativeSymbol: string;
  nativeDecimals: number;
  nativeBalanceAtomic: string | null;
  assets: readonly Readonly<CryptoAssetInput>[];
  observedAt: string;
  staleAfterMs: number;
  evidence: readonly Readonly<CryptoEvidence>[];
  coverage: readonly ('native_balance' | 'token_balances' | 'transactions' | 'protocol_positions' | 'prices')[];
}

export interface NormalizedCryptoAsset {
  assetId: string;
  assetAddress: string | null;
  symbol: string | null;
  name: string | null;
  decimals: number;
  balanceAtomic: string;
  risk: Readonly<{ level: CryptoRiskLevel; classifications: readonly string[]; evidenceRefs: readonly string[]; language: string }>;
}

export interface NormalizedCryptoWallet {
  walletRef: string;
  chainId: CryptoChainId;
  protocol: CryptoProtocol;
  address: string;
  nativeBalance: Readonly<{ assetId: string; symbol: string; decimals: number; amountAtomic: string }> | null;
  assets: readonly Readonly<NormalizedCryptoAsset>[];
  observedAt: string;
  freshness: Readonly<{ staleAfterMs: number; ageMs: number; status: 'fresh' | 'stale' }>;
  coverage: readonly string[];
  evidence: readonly Readonly<CryptoEvidence>[];
  conflicts: readonly Readonly<{ field: string; values: readonly string[]; evidenceRefs: readonly string[]; state: 'unresolved' }>[];
}

function protocol(chainId: string): CryptoProtocol {
  if (/^eip155:[1-9][0-9]{0,9}$/u.test(chainId)) return 'evm';
  if (chainId === 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp') return 'solana';
  throw new TypeError('crypto_chain_invalid');
}

function canonicalAddress(value: string, kind: CryptoProtocol): string {
  if (kind === 'evm') {
    const normalized = value.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/u.test(normalized)) throw new TypeError('crypto_address_invalid');
    return normalized;
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(value)) throw new TypeError('crypto_address_invalid');
  return value;
}

function unsigned(value: string, code: string): string {
  if (!/^(?:0|[1-9][0-9]{0,99})$/u.test(value)) throw new TypeError(code);
  return value;
}

function timestamp(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError(code);
  return parsed;
}

function publicUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new TypeError('crypto_evidence_invalid'); }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== ''
    || /^(?:localhost|127(?:\.|$)|10(?:\.|$)|169\.254(?:\.|$)|192\.168(?:\.|$)|172\.(?:1[6-9]|2[0-9]|3[01])(?:\.|$)|0\.0\.0\.0$|\[?::1\]?$)/u.test(url.hostname)) throw new TypeError('crypto_evidence_invalid');
  return url.href;
}

function boundedText(value: string | null, maximum: number): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximum || /[\u0000-\u001F\u007F]/u.test(normalized)) throw new TypeError('crypto_metadata_invalid');
  return normalized;
}

function evidence(input: readonly Readonly<CryptoEvidence>[], observedAt: string): readonly Readonly<CryptoEvidence>[] {
  if (input.length < 1 || input.length > 32) throw new TypeError('crypto_evidence_invalid');
  const refs = new Set<string>();
  return Object.freeze(input.map((item) => {
    if (!/^evidence_[a-f0-9]{32}$/u.test(item.evidenceRef) || refs.has(item.evidenceRef)
      || timestamp(item.observedAt, 'crypto_evidence_invalid') > timestamp(observedAt, 'crypto_observed_at_invalid')
      || item.fieldGroups.length < 1 || item.fieldGroups.length > 32 || new Set(item.fieldGroups).size !== item.fieldGroups.length
      || item.fieldGroups.some((field) => !/^[a-z][a-z0-9_]{2,63}$/u.test(field))) throw new TypeError('crypto_evidence_invalid');
    refs.add(item.evidenceRef);
    return Object.freeze({ evidenceRef: item.evidenceRef, sourceUrl: publicUrl(item.sourceUrl), observedAt: item.observedAt, fieldGroups: Object.freeze([...item.fieldGroups]) });
  }));
}

function riskLanguage(level: CryptoRiskLevel, classifications: readonly string[], attributable: boolean): string {
  if (level === 'known_malicious') {
    if (!attributable) throw new TypeError('crypto_risk_evidence_required');
    return `An identified source classifies this asset as malicious (${classifications.join(', ')}); verify independently and do not treat this as investment advice.`;
  }
  if (level === 'suspicious') return `Observed signals warrant caution (${classifications.join(', ')}); they do not prove malicious intent.`;
  if (level === 'unverified') return 'Asset metadata or behavior is not sufficiently verified; absence of verification is not proof of harm.';
  return 'No risk signal was observed in the covered evidence; this is not a guarantee of safety.';
}

function normalizeRisk(input: CryptoAssetInput['risk'], validEvidenceRefs: ReadonlySet<string>): NormalizedCryptoAsset['risk'] {
  const level = input?.level ?? 'unverified';
  const classifications = input?.classifications ?? [];
  const evidenceRefs = input?.evidenceRefs ?? [];
  if (!['none_observed', 'unverified', 'suspicious', 'known_malicious'].includes(level)
    || classifications.length > 16 || new Set(classifications).size !== classifications.length
    || classifications.some((value) => !/^[a-z][a-z0-9_]{2,63}$/u.test(value))
    || evidenceRefs.length > 16 || new Set(evidenceRefs).size !== evidenceRefs.length
    || evidenceRefs.some((value) => !validEvidenceRefs.has(value))
    || level === 'known_malicious' && (classifications.length < 1 || evidenceRefs.length < 1)
    || level === 'suspicious' && classifications.length < 1) throw new TypeError('crypto_risk_invalid');
  return Object.freeze({ level, classifications: Object.freeze([...classifications]), evidenceRefs: Object.freeze([...evidenceRefs]), language: riskLanguage(level, classifications, evidenceRefs.length > 0) });
}

function assetId(chainId: CryptoChainId, address: string | null): string {
  return address === null ? `${chainId}/native` : `${chainId}/token:${address}`;
}

export function normalizeCryptoWallet(input: Readonly<CryptoWalletSnapshotInput>, nowMs: number): Readonly<NormalizedCryptoWallet> {
  const chainProtocol = protocol(input.chainId);
  const address = canonicalAddress(input.address, chainProtocol);
  const observedMs = timestamp(input.observedAt, 'crypto_observed_at_invalid');
  if (!Number.isSafeInteger(nowMs) || nowMs < observedMs || !Number.isSafeInteger(input.staleAfterMs) || input.staleAfterMs < 1_000 || input.staleAfterMs > 86_400_000
    || !Number.isSafeInteger(input.nativeDecimals) || input.nativeDecimals < 0 || input.nativeDecimals > 255) throw new TypeError('crypto_freshness_invalid');
  const normalizedEvidence = evidence(input.evidence, input.observedAt);
  const evidenceRefs = new Set(normalizedEvidence.map(({ evidenceRef }) => evidenceRef));
  const nativeSymbol = boundedText(input.nativeSymbol, 32);
  const nativeBalance = input.nativeBalanceAtomic === null ? null : Object.freeze({ assetId: assetId(input.chainId, null), symbol: nativeSymbol!, decimals: input.nativeDecimals, amountAtomic: unsigned(input.nativeBalanceAtomic, 'crypto_balance_invalid') });
  if (input.assets.length > 10_000) throw new TypeError('crypto_assets_invalid');
  const ids = new Set<string>();
  const assets = input.assets.map((item) => {
    const assetAddress = item.assetAddress === null ? null : canonicalAddress(item.assetAddress, chainProtocol);
    if (assetAddress === null || !Number.isSafeInteger(item.decimals) || item.decimals < 0 || item.decimals > 255) throw new TypeError('crypto_asset_invalid');
    const id = assetId(input.chainId, assetAddress);
    if (ids.has(id)) throw new TypeError('crypto_assets_invalid');
    ids.add(id);
    return Object.freeze({
      assetId: id,
      assetAddress,
      symbol: boundedText(item.symbol, 64),
      name: boundedText(item.name, 200),
      decimals: item.decimals,
      balanceAtomic: unsigned(item.balanceAtomic, 'crypto_balance_invalid'),
      risk: normalizeRisk(item.risk, evidenceRefs),
    });
  });
  if (input.coverage.length < 1 || new Set(input.coverage).size !== input.coverage.length) throw new TypeError('crypto_coverage_invalid');
  const ageMs = nowMs - observedMs;
  return Object.freeze({
    walletRef: `wallet_${createHash('sha256').update(`${input.chainId}\0${address}`).digest('hex').slice(0, 32)}`,
    chainId: input.chainId,
    protocol: chainProtocol,
    address,
    nativeBalance,
    assets: Object.freeze(assets),
    observedAt: input.observedAt,
    freshness: Object.freeze({ staleAfterMs: input.staleAfterMs, ageMs, status: ageMs <= input.staleAfterMs ? 'fresh' : 'stale' }),
    coverage: Object.freeze([...input.coverage]),
    evidence: normalizedEvidence,
    conflicts: Object.freeze([]),
  });
}

export function mergeCryptoWalletEvidence(snapshots: readonly Readonly<NormalizedCryptoWallet>[]): Readonly<NormalizedCryptoWallet> {
  if (snapshots.length < 1 || snapshots.length > 16) throw new TypeError('crypto_merge_invalid');
  const latest = [...snapshots].sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0]!;
  if (snapshots.some((item) => item.walletRef !== latest.walletRef || item.chainId !== latest.chainId || item.address !== latest.address)) throw new TypeError('crypto_merge_identity_mismatch');
  const conflicts: { field: string; values: readonly string[]; evidenceRefs: readonly string[]; state: 'unresolved' }[] = [];
  const conflict = (field: string, values: readonly string[]): void => {
    const unique = [...new Set(values)];
    if (unique.length > 1) conflicts.push(Object.freeze({ field, values: Object.freeze(unique), evidenceRefs: Object.freeze([...new Set(snapshots.flatMap(({ evidence: values }) => values.map(({ evidenceRef }) => evidenceRef)))]), state: 'unresolved' }));
  };
  conflict('native_balance', snapshots.map(({ nativeBalance }) => nativeBalance?.amountAtomic ?? 'missing'));
  const allAssetIds = new Set(snapshots.flatMap(({ assets }) => assets.map(({ assetId: id }) => id)));
  for (const id of allAssetIds) conflict(`asset_balance:${id}`, snapshots.map(({ assets }) => assets.find(({ assetId: candidate }) => candidate === id)?.balanceAtomic ?? 'missing'));
  return Object.freeze({
    ...latest,
    coverage: Object.freeze([...new Set(snapshots.flatMap(({ coverage }) => coverage))]),
    evidence: Object.freeze([...new Map(snapshots.flatMap(({ evidence: values }) => values).map((item) => [item.evidenceRef, item])).values()]),
    freshness: Object.freeze({ ...latest.freshness, status: snapshots.every(({ freshness }) => freshness.status === 'stale') ? 'stale' : latest.freshness.status }),
    conflicts: Object.freeze(conflicts),
  });
}

export interface CryptoTokenSnapshotInput {
  chainId: CryptoChainId;
  assetAddress: string;
  symbol: string | null;
  name: string | null;
  decimals: number;
  totalSupplyAtomic: string | null;
  priceMicrousd: number | null;
  marketCapMicrousd: number | null;
  liquidityMicrousd: number | null;
  observedAt: string;
  staleAfterMs: number;
  confidenceBasisPoints: number;
  confidenceBasis: readonly string[];
  evidence: readonly Readonly<CryptoEvidence>[];
  risk?: CryptoAssetInput['risk'];
}

export interface NormalizedCryptoToken {
  assetId: string;
  chainId: CryptoChainId;
  protocol: CryptoProtocol;
  assetAddress: string;
  symbol: string | null;
  name: string | null;
  decimals: number;
  totalSupplyAtomic: string | null;
  priceMicrousd: number | null;
  marketCapMicrousd: number | null;
  liquidityMicrousd: number | null;
  observedAt: string;
  freshness: Readonly<{ staleAfterMs: number; ageMs: number; status: 'fresh' | 'stale' }>;
  confidence: Readonly<{ scoreBasisPoints: number; basis: readonly string[] }>;
  evidence: readonly Readonly<CryptoEvidence>[];
  risk: NormalizedCryptoAsset['risk'];
  conflicts: readonly Readonly<{ field: string; values: readonly string[]; evidenceRefs: readonly string[]; state: 'unresolved' }>[];
}

function nullableMicrousd(value: number | null, code: string): number | null {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new TypeError(code);
  return value;
}

export function normalizeCryptoToken(input: Readonly<CryptoTokenSnapshotInput>, nowMs: number): Readonly<NormalizedCryptoToken> {
  const chainProtocol = protocol(input.chainId);
  const address = canonicalAddress(input.assetAddress, chainProtocol);
  const observedMs = timestamp(input.observedAt, 'crypto_observed_at_invalid');
  if (!Number.isSafeInteger(input.decimals) || input.decimals < 0 || input.decimals > 255
    || !Number.isSafeInteger(nowMs) || nowMs < observedMs
    || !Number.isSafeInteger(input.staleAfterMs) || input.staleAfterMs < 1_000 || input.staleAfterMs > 86_400_000
    || !Number.isSafeInteger(input.confidenceBasisPoints) || input.confidenceBasisPoints < 0 || input.confidenceBasisPoints > 10_000
    || input.confidenceBasis.length < 1 || input.confidenceBasis.length > 16 || new Set(input.confidenceBasis).size !== input.confidenceBasis.length
    || input.confidenceBasis.some((value) => !/^[a-z][a-z0-9_]{2,63}$/u.test(value))) throw new TypeError('crypto_token_invalid');
  const normalizedEvidence = evidence(input.evidence, input.observedAt);
  const validEvidenceRefs = new Set(normalizedEvidence.map(({ evidenceRef }) => evidenceRef));
  const ageMs = nowMs - observedMs;
  return Object.freeze({
    assetId: assetId(input.chainId, address),
    chainId: input.chainId,
    protocol: chainProtocol,
    assetAddress: address,
    symbol: boundedText(input.symbol, 64),
    name: boundedText(input.name, 200),
    decimals: input.decimals,
    totalSupplyAtomic: input.totalSupplyAtomic === null ? null : unsigned(input.totalSupplyAtomic, 'crypto_token_invalid'),
    priceMicrousd: nullableMicrousd(input.priceMicrousd, 'crypto_token_invalid'),
    marketCapMicrousd: nullableMicrousd(input.marketCapMicrousd, 'crypto_token_invalid'),
    liquidityMicrousd: nullableMicrousd(input.liquidityMicrousd, 'crypto_token_invalid'),
    observedAt: input.observedAt,
    freshness: Object.freeze({ staleAfterMs: input.staleAfterMs, ageMs, status: ageMs <= input.staleAfterMs ? 'fresh' : 'stale' }),
    confidence: Object.freeze({ scoreBasisPoints: input.confidenceBasisPoints, basis: Object.freeze([...input.confidenceBasis]) }),
    evidence: normalizedEvidence,
    risk: normalizeRisk(input.risk, validEvidenceRefs),
    conflicts: Object.freeze([]),
  });
}

export function mergeCryptoTokenEvidence(tokens: readonly Readonly<NormalizedCryptoToken>[]): Readonly<NormalizedCryptoToken> {
  if (tokens.length < 1 || tokens.length > 16) throw new TypeError('crypto_token_merge_invalid');
  const latest = [...tokens].sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0]!;
  if (tokens.some((token) => token.assetId !== latest.assetId)) throw new TypeError('crypto_token_merge_identity_mismatch');
  const conflicts: { field: string; values: readonly string[]; evidenceRefs: readonly string[]; state: 'unresolved' }[] = [];
  for (const field of ['symbol', 'name', 'decimals', 'totalSupplyAtomic', 'priceMicrousd', 'marketCapMicrousd', 'liquidityMicrousd'] as const) {
    const values = [...new Set(tokens.map((token) => String(token[field] ?? 'missing')))];
    if (values.length > 1) conflicts.push(Object.freeze({ field, values: Object.freeze(values), evidenceRefs: Object.freeze([...new Set(tokens.flatMap(({ evidence: values }) => values.map(({ evidenceRef }) => evidenceRef)))]), state: 'unresolved' }));
  }
  return Object.freeze({
    ...latest,
    confidence: Object.freeze({ scoreBasisPoints: Math.min(...tokens.map(({ confidence }) => confidence.scoreBasisPoints)), basis: Object.freeze([...new Set(tokens.flatMap(({ confidence }) => confidence.basis))]) }),
    evidence: Object.freeze([...new Map(tokens.flatMap(({ evidence: values }) => values).map((item) => [item.evidenceRef, item])).values()]),
    conflicts: Object.freeze(conflicts),
  });
}

export interface CryptoProtocolPositionInput {
  chainId: CryptoChainId;
  walletAddress: string;
  protocolId: string;
  protocolName: string;
  category: 'dex' | 'lending' | 'staking' | 'bridge' | 'yield' | 'other';
  positionId: string;
  suppliedAssets: readonly Readonly<{ assetAddress: string; amountAtomic: string; decimals: number }>[];
  borrowedAssets: readonly Readonly<{ assetAddress: string; amountAtomic: string; decimals: number }>[];
  netValueMicrousd: number | null;
  observedAt: string;
  staleAfterMs: number;
  evidence: readonly Readonly<CryptoEvidence>[];
}

export function normalizeCryptoProtocolPosition(input: Readonly<CryptoProtocolPositionInput>, nowMs: number): Readonly<{
  positionRef: string;
  chainId: CryptoChainId;
  walletAddress: string;
  protocolId: string;
  protocolName: string;
  category: CryptoProtocolPositionInput['category'];
  positionId: string;
  suppliedAssets: readonly Readonly<{ assetId: string; amountAtomic: string; decimals: number }>[];
  borrowedAssets: readonly Readonly<{ assetId: string; amountAtomic: string; decimals: number }>[];
  netValueMicrousd: number | null;
  observedAt: string;
  freshness: Readonly<{ staleAfterMs: number; ageMs: number; status: 'fresh' | 'stale' }>;
  evidence: readonly Readonly<CryptoEvidence>[];
}> {
  const chainProtocol = protocol(input.chainId);
  const walletAddress = canonicalAddress(input.walletAddress, chainProtocol);
  const observedMs = timestamp(input.observedAt, 'crypto_observed_at_invalid');
  if (!/^[a-z][a-z0-9._-]{2,95}$/u.test(input.protocolId) || !/^[A-Za-z0-9][A-Za-z0-9 ._()-]{1,199}$/u.test(input.protocolName)
    || !['dex', 'lending', 'staking', 'bridge', 'yield', 'other'].includes(input.category)
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,199}$/u.test(input.positionId)
    || input.suppliedAssets.length > 1_000 || input.borrowedAssets.length > 1_000
    || !Number.isSafeInteger(nowMs) || nowMs < observedMs
    || !Number.isSafeInteger(input.staleAfterMs) || input.staleAfterMs < 1_000 || input.staleAfterMs > 86_400_000) throw new TypeError('crypto_protocol_position_invalid');
  const normalizePositionAssets = (values: CryptoProtocolPositionInput['suppliedAssets']): readonly Readonly<{ assetId: string; amountAtomic: string; decimals: number }>[] => Object.freeze(values.map((value) => {
    const address = canonicalAddress(value.assetAddress, chainProtocol);
    if (!Number.isSafeInteger(value.decimals) || value.decimals < 0 || value.decimals > 255) throw new TypeError('crypto_protocol_position_invalid');
    return Object.freeze({ assetId: assetId(input.chainId, address), amountAtomic: unsigned(value.amountAtomic, 'crypto_protocol_position_invalid'), decimals: value.decimals });
  }));
  const ageMs = nowMs - observedMs;
  return Object.freeze({
    positionRef: `position_${createHash('sha256').update(`${input.chainId}\0${walletAddress}\0${input.protocolId}\0${input.positionId}`).digest('hex').slice(0, 32)}`,
    chainId: input.chainId,
    walletAddress,
    protocolId: input.protocolId,
    protocolName: input.protocolName,
    category: input.category,
    positionId: input.positionId,
    suppliedAssets: normalizePositionAssets(input.suppliedAssets),
    borrowedAssets: normalizePositionAssets(input.borrowedAssets),
    netValueMicrousd: nullableMicrousd(input.netValueMicrousd, 'crypto_protocol_position_invalid'),
    observedAt: input.observedAt,
    freshness: Object.freeze({ staleAfterMs: input.staleAfterMs, ageMs, status: ageMs <= input.staleAfterMs ? 'fresh' : 'stale' }),
    evidence: evidence(input.evidence, input.observedAt),
  });
}

export interface CryptoTransactionInput {
  chainId: CryptoChainId;
  transactionId: string;
  blockHeight: number;
  timestamp: string | null;
  status: 'confirmed' | 'failed' | 'unknown';
  from: string;
  to: string | null;
  nativeValueAtomic: string | null;
  tokenTransfers: readonly Readonly<{ assetAddress: string; from: string; to: string; amountAtomic: string; decimals: number }>[]; 
  programOrContract: string | null;
  observedAt: string;
  evidence: readonly Readonly<CryptoEvidence>[];
}

export function normalizeCryptoTransaction(input: Readonly<CryptoTransactionInput>): Readonly<{
  chainId: CryptoChainId;
  protocol: CryptoProtocol;
  transactionId: string;
  blockHeight: number;
  timestamp: string | null;
  status: 'confirmed' | 'failed' | 'unknown';
  from: string;
  to: string | null;
  nativeValueAtomic: string | null;
  tokenTransfers: readonly Readonly<{ assetId: string; from: string; to: string; amountAtomic: string; decimals: number }>[];
  deterministicType: 'native_transfer' | 'token_transfer' | 'contract_interaction' | 'program_interaction' | 'unknown';
  observedAt: string;
  evidence: readonly Readonly<CryptoEvidence>[];
}> {
  const chainProtocol = protocol(input.chainId);
  const transactionId = chainProtocol === 'evm'
    ? (/^0x[a-fA-F0-9]{64}$/u.test(input.transactionId) ? input.transactionId.toLowerCase() : null)
    : (/^[1-9A-HJ-NP-Za-km-z]{64,128}$/u.test(input.transactionId) ? input.transactionId : null);
  if (transactionId === null || !Number.isSafeInteger(input.blockHeight) || input.blockHeight < 0
    || input.timestamp !== null && !Number.isFinite(timestamp(input.timestamp, 'crypto_transaction_timestamp_invalid'))
    || !['confirmed', 'failed', 'unknown'].includes(input.status)) throw new TypeError('crypto_transaction_invalid');
  const from = canonicalAddress(input.from, chainProtocol);
  const to = input.to === null ? null : canonicalAddress(input.to, chainProtocol);
  const programOrContract = input.programOrContract === null ? null : canonicalAddress(input.programOrContract, chainProtocol);
  if (input.tokenTransfers.length > 10_000) throw new TypeError('crypto_transaction_invalid');
  const transfers = input.tokenTransfers.map((transfer) => {
    const address = canonicalAddress(transfer.assetAddress, chainProtocol);
    if (!Number.isSafeInteger(transfer.decimals) || transfer.decimals < 0 || transfer.decimals > 255) throw new TypeError('crypto_transaction_invalid');
    return Object.freeze({ assetId: assetId(input.chainId, address), from: canonicalAddress(transfer.from, chainProtocol), to: canonicalAddress(transfer.to, chainProtocol), amountAtomic: unsigned(transfer.amountAtomic, 'crypto_transaction_invalid'), decimals: transfer.decimals });
  });
  const nativeValueAtomic = input.nativeValueAtomic === null ? null : unsigned(input.nativeValueAtomic, 'crypto_transaction_invalid');
  const deterministicType = transfers.length > 0 ? 'token_transfer' : programOrContract !== null ? chainProtocol === 'evm' ? 'contract_interaction' : 'program_interaction' : nativeValueAtomic !== null && to !== null ? 'native_transfer' : 'unknown';
  return Object.freeze({ chainId: input.chainId, protocol: chainProtocol, transactionId, blockHeight: input.blockHeight, timestamp: input.timestamp, status: input.status, from, to, nativeValueAtomic, tokenTransfers: Object.freeze(transfers), deterministicType, observedAt: input.observedAt, evidence: evidence(input.evidence, input.observedAt) });
}
