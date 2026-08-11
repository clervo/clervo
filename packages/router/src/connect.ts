import { callAiFree, callFree, callPaid, newIdempotencyKey, reconcileOperation, requestQuote, type PaidOutcome, type Quote } from './client.js';
import { diagnose, type Diagnosis } from './doctor.js';
import { loadLimits, saveLimits, type SpendLimits } from './limits.js';
import { loadAiModelCatalog, loadRegistry, type AiModelCatalog, type Registry } from './registry.js';
import { listOperations, unreconciledOperations, type ConnectSurface } from './store.js';
import { localUsage, type LocalUsage } from './usage.js';
import { readWalletBalance } from './chain.js';
import { createWallet, loadWalletFile, replaceWallet, walletExists, type CreatedWallet, type WalletView, walletView } from './wallet.js';
import { clearCommerceLockAfterReconciliation, commerceLockStatus, type CommerceLockStatus } from './lock.js';

export interface ConnectOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly surface: ConnectSurface;
  readonly autoPay?: boolean;
  readonly fetch?: typeof fetch;
}

export interface ConnectStatus {
  readonly surface: ConnectSurface;
  readonly autoPay: boolean;
  readonly wallet: WalletView | null;
  readonly limits: SpendLimits;
  readonly unreconciled: number;
  readonly operations: number;
  readonly usage: LocalUsage;
  readonly commerceLock: CommerceLockStatus;
}

export interface ConnectExecuteOptions { readonly paid?: boolean }

export type ConnectExecution =
  | Readonly<{ status: 'completed'; funding: 'free' | 'paid'; idempotencyKey: string; outcome: Awaited<ReturnType<typeof callFree>> | PaidOutcome }>
  | Readonly<{ status: 'payment_required'; funding: 'paid'; idempotencyKey: string; quote: Quote }>;

function assertExactModel(requested: string, outcome: Record<string, unknown>, catalog: AiModelCatalog): void {
  const selected = catalog.models.find(({ id }) => id === requested);
  if (selected === undefined || !selected.publicSellable) throw new Error('model_unavailable');
  if (selected.identityKind !== 'canonical') return;
  if (outcome.exactModelId !== requested || outcome.model !== requested) throw new Error('canonical_model_substituted');
}

export class ClervoConnect {
  readonly env: NodeJS.ProcessEnv;
  readonly surface: ConnectSurface;
  readonly autoPay: boolean;
  readonly fetchImpl: typeof fetch;

  constructor(options: ConnectOptions) {
    this.env = options.env ?? process.env;
    this.surface = options.surface;
    this.autoPay = options.autoPay === true;
    this.fetchImpl = options.fetch ?? fetch;
  }

  registry(): Promise<Registry> {
    return loadRegistry({ env: this.env, fetchImpl: this.fetchImpl });
  }

  models(): Promise<AiModelCatalog> {
    return loadAiModelCatalog({ env: this.env, fetchImpl: this.fetchImpl });
  }

  async quote(productId: string, body: Record<string, unknown>, idempotencyKey = newIdempotencyKey()): Promise<Quote> {
    return requestQuote({ registry: await this.registry(), productId, body, idempotencyKey, fetchImpl: this.fetchImpl });
  }

  async execute(productId: string, body: Record<string, unknown>, idempotencyKey = newIdempotencyKey(), options: ConnectExecuteOptions = {}): Promise<ConnectExecution> {
    const registry = await this.registry();
    if (productId === 'search.web' && options.paid !== true) {
      const outcome = await callFree({ registry, productId, body, idempotencyKey, env: this.env, fetchImpl: this.fetchImpl, surface: this.surface });
      return Object.freeze({ status: 'completed', funding: 'free', idempotencyKey, outcome });
    }
    let models: AiModelCatalog | undefined;
    if (productId.startsWith('ai.')) {
      const requested = typeof body.model === 'string' ? body.model : '';
      models = await this.models();
      const selected = models.models.find(({ id }) => id === requested);
      if (selected === undefined || !selected.publicSellable || !selected.productIds.includes(productId)) throw new Error('model_unavailable');
      if (selected.billingMode === 'free') {
        const outcome = await callAiFree({ registry, body, idempotencyKey, env: this.env, fetchImpl: this.fetchImpl, surface: this.surface });
        assertExactModel(requested, outcome.result, models);
        return Object.freeze({ status: 'completed', funding: 'free', idempotencyKey, outcome });
      }
    }
    if (!this.autoPay) {
      return Object.freeze({ status: 'payment_required', funding: 'paid', idempotencyKey, quote: await requestQuote({ registry, productId, body, idempotencyKey, fetchImpl: this.fetchImpl }) });
    }
    const outcome = await callPaid({ registry, productId, body, idempotencyKey, env: this.env, fetchImpl: this.fetchImpl, surface: this.surface, approve: () => true });
    if (models !== undefined && typeof body.model === 'string') assertExactModel(body.model, outcome.result, models);
    return Object.freeze({ status: 'completed', funding: 'paid', idempotencyKey, outcome });
  }

  limits(): SpendLimits { return loadLimits(this.env); }

  setLimits(values: { readonly perOperationAtomic?: string; readonly dailyAtomic?: string }): SpendLimits {
    return saveLimits(values, this.env);
  }

  usage(): LocalUsage { return localUsage(this.env); }

  wallet(): WalletView | null {
    if (!walletExists(this.env)) return null;
    const loaded = loadWalletFile(this.env);
    return walletView(loaded.file, loaded.path);
  }

  createWallet(): CreatedWallet { return createWallet({}, this.env); }

  backupWallet(confirmSecretExposure: boolean): Readonly<{ wallet: WalletView; recoveryPhrase: string }> {
    if (confirmSecretExposure !== true) throw new Error('wallet_backup_confirmation_required');
    const loaded = loadWalletFile(this.env);
    return Object.freeze({ wallet: walletView(loaded.file, loaded.path), recoveryPhrase: loaded.file.mnemonic });
  }

  async restoreWallet(mnemonic: string): Promise<WalletView> {
    let outgoingIsEmpty = true;
    if (walletExists(this.env)) {
      const loaded = loadWalletFile(this.env);
      const balance = await readWalletBalance({ address: loaded.file.address, env: this.env });
      outgoingIsEmpty = BigInt(balance.amountAtomic) === 0n && BigInt(balance.nativeWei) === 0n;
    }
    return replaceWallet({ mnemonic, outgoingIsEmpty }, this.env);
  }

  status(): ConnectStatus {
    return Object.freeze({
      surface: this.surface,
      autoPay: this.autoPay,
      wallet: this.wallet(),
      limits: this.limits(),
      unreconciled: unreconciledOperations(this.env).length,
      operations: listOperations(this.env).length,
      usage: this.usage(),
      commerceLock: commerceLockStatus(this.env),
    });
  }

  doctor(): Promise<Diagnosis> { return diagnose({ env: this.env, fetchImpl: this.fetchImpl }); }

  async reconcile(): Promise<readonly Awaited<ReturnType<typeof reconcileOperation>>[]> {
    const registry = await this.registry();
    const results = [];
    for (const record of unreconciledOperations(this.env)) {
      results.push(await reconcileOperation({ registry, record, env: this.env, fetchImpl: this.fetchImpl }));
    }
    clearCommerceLockAfterReconciliation(this.env);
    return Object.freeze(results);
  }
}
