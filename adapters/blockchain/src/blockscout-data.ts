export interface BlockchainDataTransportRequest {
  url: URL;
  signal: AbortSignal;
  maximumResponseBytes: number;
}

export interface BlockchainDataTransportResponse {
  status: number;
  body: unknown;
}

export type BlockchainDataTransport = (request: Readonly<BlockchainDataTransportRequest>) => Promise<Readonly<BlockchainDataTransportResponse>>;

export interface WalletAddressOverview {
  address: string;
  nativeBalanceAtomic: string;
  isContract: boolean;
  transactionActivityPresent: boolean;
  tokenActivityPresent: boolean;
}

export interface WalletTokenBalance {
  contractAddress: string;
  symbol: string;
  decimals: number;
  balanceAtomic: string;
  tokenType: string;
}

export interface WalletTransactionSummary {
  transactionHash: string;
  blockNumber: number;
  timestamp: string;
  status: 'confirmed' | 'failed' | 'unknown';
  from: string;
  to: string | null;
  valueAtomic: string;
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function text(value: unknown, code: string, maximum = 512): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) throw new Error(code);
  return value;
}

function address(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  const normalized = text(value, 'blockchain_data_address_invalid', 42).toLowerCase();
  if (!/^0x[a-f0-9]{40}$/u.test(normalized)) throw new Error('blockchain_data_address_invalid');
  return normalized;
}

function unsigned(value: unknown, code: string): string {
  const normalized = text(value, code, 100);
  if (!/^\d+$/u.test(normalized)) throw new Error(code);
  return normalized;
}

export class BlockscoutDataAdapter {
  private calls = 0;

  constructor(readonly config: Readonly<{ apiKey: string; allowedChainIds: readonly number[]; hardDailyCallCeiling: number }>, readonly transport: BlockchainDataTransport) {
    if (config.apiKey.trim() === '' || config.allowedChainIds.length < 1 || new Set(config.allowedChainIds).size !== config.allowedChainIds.length || config.allowedChainIds.some((chainId) => !Number.isSafeInteger(chainId) || chainId < 1) || !Number.isSafeInteger(config.hardDailyCallCeiling) || config.hardDailyCallCeiling < 1 || config.hardDailyCallCeiling > 100_000) throw new Error('blockchain_data_configuration_invalid');
  }

  get remainingCalls(): number { return this.config.hardDailyCallCeiling - this.calls; }

  private async get(chainId: number, path: string, signal?: AbortSignal): Promise<unknown> {
    if (!this.config.allowedChainIds.includes(chainId)) throw new Error('blockchain_data_chain_not_allowed');
    if (this.calls >= this.config.hardDailyCallCeiling) throw new Error('blockchain_data_call_ceiling_reached');
    this.calls += 1;
    const url = new URL(`https://api.blockscout.com/${chainId}${path}`);
    url.searchParams.set('apikey', this.config.apiKey);
    const controller = new AbortController();
    const cancel = (): void => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await this.transport({ url, signal: controller.signal, maximumResponseBytes: 2_000_000 });
      if (response.status !== 200) throw new Error(`blockchain_data_http_${response.status}`);
      return response.body;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('blockchain_data_')) throw error;
      throw new Error('blockchain_data_transport_failed');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }

  async addressOverview(chainId: number, walletAddress: string, signal?: AbortSignal): Promise<Readonly<WalletAddressOverview>> {
    const normalized = address(walletAddress)!;
    const body = record(await this.get(chainId, `/api/v2/addresses/${normalized}`, signal), 'blockchain_data_address_response_invalid');
    if (address(body.hash)! !== normalized || typeof body.is_contract !== 'boolean') throw new Error('blockchain_data_address_response_invalid');
    return Object.freeze({ address: normalized, nativeBalanceAtomic: unsigned(body.coin_balance ?? '0', 'blockchain_data_balance_invalid'), isContract: body.is_contract, transactionActivityPresent: body.has_logs === true || body.has_validated_blocks === true, tokenActivityPresent: body.has_tokens === true || body.has_token_transfers === true });
  }

  async tokenBalances(chainId: number, walletAddress: string, signal?: AbortSignal): Promise<readonly Readonly<WalletTokenBalance>[]> {
    const normalized = address(walletAddress)!;
    const body = await this.get(chainId, `/api/v2/addresses/${normalized}/token-balances`, signal);
    if (!Array.isArray(body) || body.length > 1_000) throw new Error('blockchain_data_token_response_invalid');
    return Object.freeze(body.map((value) => {
      const row = record(value, 'blockchain_data_token_response_invalid');
      const token = record(row.token, 'blockchain_data_token_response_invalid');
      const decimals = Number(token.decimals);
      if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('blockchain_data_token_response_invalid');
      return Object.freeze({ contractAddress: address(token.address_hash)!, symbol: text(token.symbol, 'blockchain_data_token_response_invalid', 64), decimals, balanceAtomic: unsigned(row.value, 'blockchain_data_token_response_invalid'), tokenType: text(token.type, 'blockchain_data_token_response_invalid', 32) });
    }));
  }

  async transactions(chainId: number, walletAddress: string, signal?: AbortSignal): Promise<readonly Readonly<WalletTransactionSummary>[]> {
    const normalized = address(walletAddress)!;
    const body = record(await this.get(chainId, `/api/v2/addresses/${normalized}/transactions`, signal), 'blockchain_data_transaction_response_invalid');
    if (!Array.isArray(body.items) || body.items.length > 100) throw new Error('blockchain_data_transaction_response_invalid');
    return Object.freeze(body.items.map((value) => {
      const row = record(value, 'blockchain_data_transaction_response_invalid');
      const from = record(row.from, 'blockchain_data_transaction_response_invalid');
      const to = row.to === null ? null : record(row.to, 'blockchain_data_transaction_response_invalid');
      const blockNumber = row.block_number;
      if (!Number.isSafeInteger(blockNumber) || (blockNumber as number) < 0) throw new Error('blockchain_data_transaction_response_invalid');
      const status = row.status === 'ok' ? 'confirmed' as const : row.status === 'error' ? 'failed' as const : 'unknown' as const;
      return Object.freeze({ transactionHash: text(row.hash, 'blockchain_data_transaction_response_invalid', 66).toLowerCase(), blockNumber: blockNumber as number, timestamp: text(row.timestamp, 'blockchain_data_transaction_response_invalid', 40), status, from: address(from.hash)!, to: to === null ? null : address(to.hash), valueAtomic: unsigned(row.value ?? '0', 'blockchain_data_transaction_response_invalid') });
    }));
  }
}
