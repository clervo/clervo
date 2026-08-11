export {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  DEFAULT_BASE_RPC_URL,
  USDC_DECIMALS,
  baseRpcUrl,
  formatUsdc,
  fundingGuidance,
  readWalletBalance,
  type FundingGuidance,
  type WalletBalance,
} from './chain.js';
export {
  RouterError,
  callFree,
  callPaid,
  newIdempotencyKey,
  reconcileOperation,
  replayPaid,
  requestQuote,
  type FreeOutcome,
  type PaidCallOptions,
  type PaidOutcome,
  type Quote,
  type ReconcileResult,
} from './client.js';
export { diagnose, type Check, type CheckStatus, type Diagnosis } from './doctor.js';
export { acquireCommerceLock, clearCommerceLockAfterReconciliation, commerceLockStatus, type CommerceLockStatus } from './lock.js';
export {
  DEFAULT_DAILY_ATOMIC,
  DEFAULT_PER_OPERATION_ATOMIC,
  LimitError,
  assertWithinLimits,
  defaultLimits,
  loadLimits,
  saveLimits,
  usdcToAtomic,
  type SpendLimits,
} from './limits.js';
export { clervoHome, clervoPaths, type ClervoPaths } from './paths.js';
export {
  DEFAULT_API_ORIGIN,
  DISCOVERY_PATH,
  RegistryError,
  apiOrigin,
  capabilityFor,
  loadAiModelCatalog,
  loadRegistry,
  type AiCatalogModel,
  type AiModelCatalog,
  type Registry,
  type RegistryCapability,
} from './registry.js';
export {
  OPERATION_SCHEMA_VERSION,
  StoreError,
  assertIdempotencyKey,
  assertNothingUnreconciled,
  listOperations,
  readOperation,
  readReceipt,
  requestBodyHash,
  saveReceipt,
  spentTodayAtomic,
  unreconciledOperations,
  writeOperation,
  type OperationRecord,
  type OperationState,
  type ConnectSurface,
} from './store.js';
export { localUsage, type LocalUsage, type UsageBucket } from './usage.js';
export { ClervoConnect, type ConnectExecuteOptions, type ConnectExecution, type ConnectOptions, type ConnectStatus } from './connect.js';
export { startOpenAiProxy, type ProxyOptions, type RunningProxy } from './proxy.js';
export { CLERVO_CONTRACT_VERSION, CLERVO_ROUTER_USER_AGENT, CLERVO_ROUTER_VERSION } from './version.js';
export {
  WALLET_DERIVATION_PATH,
  WALLET_NETWORK,
  WALLET_SCHEMA_VERSION,
  WalletError,
  addressForMnemonic,
  createWallet,
  loadWalletAccount,
  loadWalletFile,
  replaceWallet,
  walletExists,
  walletPermissionsSecure,
  walletView,
  type CreatedWallet,
  type WalletFile,
  type WalletView,
} from './wallet.js';
