import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { mnemonicToAccount } from 'viem/accounts';
import { clervoPaths } from './paths.js';

export const WALLET_SCHEMA_VERSION = 'clervo.router.wallet.v1' as const;
export const WALLET_NETWORK = 'eip155:8453' as const;
export const WALLET_DERIVATION_PATH = "m/44'/60'/0'/0/0" as const;

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

export interface WalletFile {
  readonly schemaVersion: typeof WALLET_SCHEMA_VERSION;
  readonly network: typeof WALLET_NETWORK;
  readonly address: string;
  readonly derivationPath: typeof WALLET_DERIVATION_PATH;
  readonly createdAt: string;
  /* The recovery phrase. Never printed, logged, or included in an error. */
  readonly mnemonic: string;
}

/* What may be shown to a human or written to a log. No secret reaches here. */
export interface WalletView {
  readonly address: string;
  readonly network: typeof WALLET_NETWORK;
  readonly derivationPath: typeof WALLET_DERIVATION_PATH;
  readonly createdAt: string;
  readonly path: string;
}

export class WalletError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'WalletError';
  }
}

function assertMnemonic(value: unknown): string {
  if (typeof value !== 'string') throw new WalletError('wallet_mnemonic_invalid');
  const normalized = value.normalize('NFKD').trim().replace(/\s+/gu, ' ').toLowerCase();
  if (!validateMnemonic(normalized, wordlist)) throw new WalletError('wallet_mnemonic_invalid');
  return normalized;
}

export function addressForMnemonic(mnemonic: string): string {
  return mnemonicToAccount(assertMnemonic(mnemonic), { path: WALLET_DERIVATION_PATH }).address;
}

export function walletExists(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    return statSync(clervoPaths(env).wallet).isFile();
  } catch {
    return false;
  }
}

/*
 * Whether the key file is readable by anyone but its owner.
 *
 * Checked on every load, not only by `doctor`: a wallet whose phrase another
 * local account can read is not a wallet we may sign a payment with, and the
 * moment to refuse is before the money moves, not at the next audit.
 */
export function walletPermissionsSecure(path: string): boolean {
  if (process.platform === 'win32') return true;
  try {
    return (statSync(path).mode & 0o077) === 0;
  } catch {
    return false;
  }
}

function writeWalletFile(path: string, file: WalletFile, flag: 'wx' | 'w'): void {
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', mode: FILE_MODE, flag });
  /* `mode` above is masked by the process umask; this is not. */
  if (process.platform !== 'win32') chmodSync(path, FILE_MODE);
}

export function walletView(file: WalletFile, path: string): WalletView {
  return Object.freeze({
    address: file.address,
    network: file.network,
    derivationPath: file.derivationPath,
    createdAt: file.createdAt,
    path,
  });
}

export interface CreatedWallet {
  readonly view: WalletView;
  /* Returned exactly once, for the operator to write down. Never persisted
   * anywhere but the key file, and never logged by this package. */
  readonly mnemonic: string;
}

/*
 * Create the dedicated wallet, or refuse.
 *
 * `wx` is the whole guarantee: the create is atomic against an existing file, so
 * two concurrent invocations cannot both believe they made the wallet, and an
 * existing wallet — funded or not — is never overwritten by a create. Replacing
 * one is a separate, explicit operation with its own balance check.
 *
 * `env` is the last positional argument, matching every other module here. That
 * uniformity is a safety property, not a style choice: a caller that passes an
 * environment where options are expected is then a type error rather than a
 * silent fall back to the real `~/.clervo`.
 */
export function createWallet(
  { now = () => new Date().toISOString(), mnemonic }: { now?: () => string; mnemonic?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
): CreatedWallet {
  const paths = clervoPaths(env);
  mkdirSync(paths.home, { recursive: true, mode: DIRECTORY_MODE });
  if (process.platform !== 'win32') chmodSync(paths.home, DIRECTORY_MODE);
  const phrase = mnemonic === undefined ? generateMnemonic(wordlist, 128) : assertMnemonic(mnemonic);
  const file: WalletFile = Object.freeze({
    schemaVersion: WALLET_SCHEMA_VERSION,
    network: WALLET_NETWORK,
    address: addressForMnemonic(phrase),
    derivationPath: WALLET_DERIVATION_PATH,
    createdAt: now(),
    mnemonic: phrase,
  });
  try {
    writeWalletFile(paths.wallet, file, 'wx');
  } catch (error) {
    if ((error as { code?: string }).code === 'EEXIST') throw new WalletError('wallet_already_exists', 'a wallet already exists at this path and was not replaced');
    throw error;
  }
  return Object.freeze({ view: walletView(file, paths.wallet), mnemonic: phrase });
}

/*
 * Replace an existing wallet with a supplied phrase.
 *
 * The caller must have proved the outgoing wallet is empty. This function does
 * not check a balance itself — it cannot, without a network — so it demands the
 * proof as an argument, which is what stops a refactor from quietly dropping the
 * check.
 */
export function replaceWallet(
  { now = () => new Date().toISOString(), mnemonic, outgoingIsEmpty }: { now?: () => string; mnemonic: string; outgoingIsEmpty: boolean },
  env: NodeJS.ProcessEnv = process.env,
): WalletView {
  if (outgoingIsEmpty !== true) throw new WalletError('wallet_replace_refused_funded', 'the existing wallet holds a balance; move the funds out before replacing it');
  const paths = clervoPaths(env);
  const phrase = assertMnemonic(mnemonic);
  mkdirSync(paths.home, { recursive: true, mode: DIRECTORY_MODE });
  const file: WalletFile = Object.freeze({
    schemaVersion: WALLET_SCHEMA_VERSION,
    network: WALLET_NETWORK,
    address: addressForMnemonic(phrase),
    derivationPath: WALLET_DERIVATION_PATH,
    createdAt: now(),
    mnemonic: phrase,
  });
  writeWalletFile(paths.wallet, file, 'w');
  return walletView(file, paths.wallet);
}

export function loadWalletFile(env: NodeJS.ProcessEnv = process.env): { readonly file: WalletFile; readonly path: string } {
  const paths = clervoPaths(env);
  let raw: string;
  try {
    raw = readFileSync(paths.wallet, 'utf8');
  } catch {
    throw new WalletError('wallet_missing', 'no wallet on this machine — run `clervo wallet create`');
  }
  if (!walletPermissionsSecure(paths.wallet)) {
    throw new WalletError('wallet_permissions_insecure', `the wallet file is readable by other local accounts — run \`chmod 600 ${paths.wallet}\``);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new WalletError('wallet_unreadable', 'the wallet file is not valid JSON');
  }
  const value = parsed as Partial<WalletFile>;
  if (value?.schemaVersion !== WALLET_SCHEMA_VERSION || value?.network !== WALLET_NETWORK || value?.derivationPath !== WALLET_DERIVATION_PATH) {
    throw new WalletError('wallet_unsupported', 'the wallet file is not a wallet this version understands');
  }
  const mnemonic = assertMnemonic(value.mnemonic);
  const address = addressForMnemonic(mnemonic);
  if (typeof value.address !== 'string' || value.address.toLowerCase() !== address.toLowerCase()) {
    throw new WalletError('wallet_address_mismatch', 'the recorded address does not derive from the stored phrase');
  }
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) throw new WalletError('wallet_unreadable', 'the wallet file has no valid creation time');
  return Object.freeze({
    file: Object.freeze({
      schemaVersion: WALLET_SCHEMA_VERSION,
      network: WALLET_NETWORK,
      address,
      derivationPath: WALLET_DERIVATION_PATH,
      createdAt: value.createdAt,
      mnemonic,
    }),
    path: paths.wallet,
  });
}

/* The signer. Held in memory only, and only for the call that needs it. */
export function loadWalletAccount(env: NodeJS.ProcessEnv = process.env): ReturnType<typeof mnemonicToAccount> {
  const { file } = loadWalletFile(env);
  return mnemonicToAccount(file.mnemonic, { path: WALLET_DERIVATION_PATH });
}
