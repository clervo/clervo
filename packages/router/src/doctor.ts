import { readdirSync, statSync } from 'node:fs';
import { clervoPaths } from './paths.js';
import { loadLimits } from './limits.js';
import { loadRegistry, apiOrigin, type Registry } from './registry.js';
import { readWalletBalance, baseRpcUrl, formatUsdc } from './chain.js';
import { loadWalletFile, walletExists, walletPermissionsSecure } from './wallet.js';
import { spentTodayAtomic, unreconciledOperations } from './store.js';
import { CLERVO_ROUTER_VERSION } from './version.js';
import { commerceLockStatus } from './lock.js';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  readonly id: string;
  readonly status: CheckStatus;
  readonly detail: string;
  /* Present only when the operator has something to do about it. */
  readonly remedy?: string;
}

export interface Diagnosis {
  readonly routerVersion: string;
  readonly checkedAt: string;
  readonly checks: readonly Check[];
  readonly healthy: boolean;
}

function check(id: string, status: CheckStatus, detail: string, remedy?: string): Check {
  return Object.freeze(remedy === undefined ? { id, status, detail } : { id, status, detail, remedy });
}

/*
 * Everything that has to be true before a paid call can work, checked in the
 * order a customer hits it, so the first failure is the one to fix.
 *
 * Nothing here signs, spends, or mutates state. A broken configuration is
 * reported, never repaired silently — a doctor that fixes things on its own is a
 * doctor that can quietly replace a wallet.
 */
export async function diagnose({
  env = process.env,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
  checkBalance = true,
}: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: () => string; checkBalance?: boolean } = {}): Promise<Diagnosis> {
  const checks: Check[] = [];
  let paths: ReturnType<typeof clervoPaths>;
  try {
    paths = clervoPaths(env);
    checks.push(check('home.path', 'ok', paths.home));
  } catch (error) {
    return Object.freeze({ routerVersion: CLERVO_ROUTER_VERSION, checkedAt: now(), checks: Object.freeze([check('home.path', 'fail', (error as Error).message, 'set CLERVO_HOME to an absolute private directory')]), healthy: false });
  }

  checks.push(check('runtime.node', Number(process.versions.node.split('.')[0]) >= 20 ? 'ok' : 'fail',
    `Node ${process.versions.node}`,
    Number(process.versions.node.split('.')[0]) >= 20 ? undefined : 'install Node 20 or newer'));

  try {
    const mode = statSync(paths.home).mode & 0o777;
    checks.push(process.platform === 'win32' || (mode & 0o077) === 0
      ? check('home.permissions', 'ok', `${paths.home} is private to you`)
      : check('home.permissions', 'warn', `${paths.home} is accessible to other local accounts (mode ${mode.toString(8)})`, `chmod 700 ${paths.home}`));
  } catch {
    checks.push(check('home.permissions', 'warn', `${paths.home} does not exist yet`, 'run `clervo wallet create` when you are ready to pay'));
  }

  for (const [id, path] of [['operations.permissions', paths.operations], ['receipts.permissions', paths.receipts]] as const) {
    try {
      const mode = statSync(path).mode & 0o777;
      checks.push(process.platform === 'win32' || (mode & 0o077) === 0 ? check(id, 'ok', `${path} is private`) : check(id, 'fail', `${path} mode ${mode.toString(8)} is not private`, `chmod 700 ${path}`));
    } catch { checks.push(check(id, 'ok', `${path} has not been created yet`)); }
  }

  let origin: string;
  try {
    origin = apiOrigin(env);
    checks.push(check('api.origin', 'ok', origin));
  } catch (error) {
    origin = '';
    checks.push(check('api.origin', 'fail', `CLERVO_API_ORIGIN is not usable: ${(error as Error).message}`, 'unset CLERVO_API_ORIGIN to use https://api.clervo.dev'));
  }

  let registry: Registry | undefined;
  if (origin !== '') {
    try {
      registry = await loadRegistry({ env, fetchImpl, now });
      const paid = registry.capabilities.filter((entry) => entry.paidCallable).length;
      const free = registry.capabilities.filter((entry) => entry.freeCallable).length;
      checks.push(check('registry.reachable', 'ok', `${registry.capabilities.length} capabilities, ${free} free, ${paid} payable, observed ${registry.observedAt}`));
    } catch (error) {
      checks.push(check('registry.reachable', 'fail', (error as Error).message, 'check network access to the API origin'));
    }
  }

  if (!walletExists(env)) {
    checks.push(check('wallet.present', 'warn', 'no wallet on this machine — the free path works without one', 'run `clervo wallet create` before a paid call'));
  } else {
    checks.push(walletPermissionsSecure(paths.wallet)
      ? check('wallet.permissions', 'ok', 'the wallet file is readable only by you')
      : check('wallet.permissions', 'fail', 'the wallet file is readable by other local accounts', `chmod 600 ${paths.wallet}`));
    try {
      const { file } = loadWalletFile(env);
      checks.push(check('wallet.readable', 'ok', `${file.address} on Base mainnet`));
      if (checkBalance) {
        try {
          const balance = await readWalletBalance({ address: file.address, env, now });
          checks.push(BigInt(balance.amountAtomic) > 0n
            ? check('wallet.funded', 'ok', `${balance.amount} USDC on Base`)
            : check('wallet.funded', 'warn', 'the wallet holds no USDC', `send USDC on Base mainnet to ${file.address}, then run \`clervo wallet balance\``));
        } catch (error) {
          checks.push(check('wallet.funded', 'warn', `could not read the balance from ${baseRpcUrl(env)}: ${(error as Error).message}`, 'set CLERVO_BASE_RPC_URL to a Base RPC endpoint you trust'));
        }
      }
    } catch (error) {
      checks.push(check('wallet.readable', 'fail', (error as Error).message, 'restore the wallet with `clervo wallet restore` if you have the recovery phrase'));
    }
  }

  try {
    const limits = loadLimits(env);
    const spent = spentTodayAtomic(env);
    checks.push(check('limits.configured', 'ok',
      `per operation ${formatUsdc(limits.perOperationAtomic)} USDC, daily ${formatUsdc(limits.dailyAtomic)} USDC, spent today ${formatUsdc(spent)} USDC`));
  } catch (error) {
    checks.push(check('limits.configured', 'fail', (error as Error).message, `delete ${paths.limits} to fall back to the defaults`));
  }

  const open = unreconciledOperations(env);
  checks.push(open.length < 1
    ? check('settlement.reconciled', 'ok', 'no operation is in an unknown settlement state')
    : check('settlement.reconciled', 'fail', `${open.length} operation(s) have an unresolved settlement: ${open.map((record) => record.idempotencyKey).join(', ')}`, 'run `clervo reconcile` — paid calls are blocked until this clears'));

  const commerceLock = commerceLockStatus(env);
  checks.push(!commerceLock.exists
    ? check('commerce.lock', 'ok', 'no payment reservation is held')
    : commerceLock.ownerAlive === true
      ? check('commerce.lock', 'warn', `a live local process holds the payment reservation${commerceLock.createdAt === null ? '' : ` since ${commerceLock.createdAt}`}`, 'wait for the active call to finish')
      : check('commerce.lock', 'fail', `a stale payment reservation blocks spending${commerceLock.createdAt === null ? '' : ` since ${commerceLock.createdAt}`}`, 'run `clervo reconcile`; the lock is removed only after no settlement remains unknown'));

  const operations = (() => { try { return readdirSync(paths.operations).filter((name) => name.endsWith('.json')).length; } catch { return 0; } })();
  const receipts = (() => { try { return readdirSync(paths.receipts).filter((name) => name.endsWith('.json')).length; } catch { return 0; } })();
  checks.push(check('history.state', 'ok', `${operations} operation record(s), ${receipts} receipt(s)`));

  const proxyOrigin = env.CLERVO_PROXY_URL ?? 'http://127.0.0.1:8402';
  try {
    const parsed = new URL(proxyOrigin);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'http:' || !loopback || parsed.username || parsed.password) throw new Error('proxy URL must be loopback HTTP');
    const response = await fetchImpl(`${parsed.origin}/v1/models`, { method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(1_500), redirect: 'error' });
    checks.push(response.ok ? check('proxy.readiness', 'ok', `${parsed.origin}/v1 is ready`) : check('proxy.readiness', 'warn', `${parsed.origin} returned ${response.status}`, 'run `clervo proxy` and retry'));
  } catch (error) {
    checks.push(check('proxy.readiness', 'warn', `${proxyOrigin} is not currently ready: ${(error as Error).message}`, 'run `clervo proxy`; add `--auto-pay` only after reviewing limits'));
  }
  checks.push(check('clients.versions', 'ok', `Router ${CLERVO_ROUTER_VERSION}; expected Connect clients @clervo/sdk 0.5.0, @clervo/mcp 0.5.0, clervo-sdk 0.4.0`));

  return Object.freeze({
    routerVersion: CLERVO_ROUTER_VERSION,
    checkedAt: now(),
    checks: Object.freeze(checks),
    healthy: !checks.some((entry) => entry.status === 'fail'),
  });
}
