import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { clervoPaths } from './paths.js';
import { formatUsdc } from './chain.js';

export const LIMITS_SCHEMA_VERSION = 'clervo.router.limits.v1' as const;

/*
 * Conservative on purpose. A wallet that an agent can drain in one loop is the
 * failure this file exists to prevent, so the shipped default is a single
 * cheap call per operation and a small day. Raising it is one command and an
 * explicit number.
 */
export const DEFAULT_PER_OPERATION_ATOMIC = '20000' as const;
export const DEFAULT_DAILY_ATOMIC = '100000' as const;

export interface SpendLimits {
  readonly schemaVersion: typeof LIMITS_SCHEMA_VERSION;
  readonly perOperationAtomic: string;
  readonly dailyAtomic: string;
  readonly asset: 'USDC';
  readonly network: 'eip155:8453';
  readonly updatedAt: string;
}

export class LimitError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'LimitError';
  }
}

function assertAtomic(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,20})$/u.test(value)) throw new LimitError(code);
  return value;
}

export function defaultLimits(now = () => new Date().toISOString()): SpendLimits {
  return Object.freeze({
    schemaVersion: LIMITS_SCHEMA_VERSION,
    perOperationAtomic: DEFAULT_PER_OPERATION_ATOMIC,
    dailyAtomic: DEFAULT_DAILY_ATOMIC,
    asset: 'USDC',
    network: 'eip155:8453',
    updatedAt: now(),
  });
}

export function loadLimits(env: NodeJS.ProcessEnv = process.env): SpendLimits {
  const paths = clervoPaths(env);
  let raw: string;
  try {
    raw = readFileSync(paths.limits, 'utf8');
  } catch {
    return defaultLimits();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LimitError('limits_unreadable', 'the spend-limit file is not valid JSON');
  }
  const value = parsed as Partial<SpendLimits>;
  if (value?.schemaVersion !== LIMITS_SCHEMA_VERSION) throw new LimitError('limits_unsupported', 'the spend-limit file is not a version this router understands');
  return Object.freeze({
    schemaVersion: LIMITS_SCHEMA_VERSION,
    perOperationAtomic: assertAtomic(value.perOperationAtomic, 'limits_per_operation_invalid'),
    dailyAtomic: assertAtomic(value.dailyAtomic, 'limits_daily_invalid'),
    asset: 'USDC',
    network: 'eip155:8453',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(),
  });
}

/* `env` is the last positional argument, matching every other module here, so a
 * caller that passes it in the wrong position is a type error rather than a
 * silent write to the real `~/.clervo`. */
export function saveLimits(
  { now = () => new Date().toISOString(), perOperationAtomic, dailyAtomic }: { now?: () => string; perOperationAtomic?: string; dailyAtomic?: string },
  env: NodeJS.ProcessEnv = process.env,
): SpendLimits {
  const current = loadLimits(env);
  const next: SpendLimits = Object.freeze({
    schemaVersion: LIMITS_SCHEMA_VERSION,
    perOperationAtomic: perOperationAtomic === undefined ? current.perOperationAtomic : assertAtomic(perOperationAtomic, 'limits_per_operation_invalid'),
    dailyAtomic: dailyAtomic === undefined ? current.dailyAtomic : assertAtomic(dailyAtomic, 'limits_daily_invalid'),
    asset: 'USDC',
    network: 'eip155:8453',
    updatedAt: now(),
  });
  if (BigInt(next.perOperationAtomic) > BigInt(next.dailyAtomic)) throw new LimitError('limits_per_operation_exceeds_daily', 'the per-operation limit cannot exceed the daily limit');
  const paths = clervoPaths(env);
  mkdirSync(paths.home, { recursive: true, mode: 0o700 });
  writeFileSync(paths.limits, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(paths.limits, 0o600);
  return next;
}

/*
 * The client-side refusal, taken against the quote before anything is signed.
 *
 * The server enforces its own ceiling — the quote's maximum charge is binding
 * there — but that ceiling is the seller's, not the buyer's. This is the buyer's,
 * and it has to be checked here because after the signature there is nothing
 * left to refuse.
 */
export function assertWithinLimits({
  limits,
  quotedAtomic,
  spentTodayAtomic,
}: { limits: SpendLimits; quotedAtomic: string; spentTodayAtomic: string }): void {
  const quoted = BigInt(assertAtomic(quotedAtomic, 'quote_amount_invalid'));
  const perOperation = BigInt(limits.perOperationAtomic);
  if (quoted > perOperation) {
    throw new LimitError('spend_limit_per_operation_exceeded', `this call is quoted at ${formatUsdc(quoted)} USDC and your per-operation limit is ${formatUsdc(perOperation)} USDC — raise it with \`clervo limits set --per-operation <usdc>\``);
  }
  const spent = BigInt(assertAtomic(spentTodayAtomic, 'spend_total_invalid'));
  const daily = BigInt(limits.dailyAtomic);
  if (spent + quoted > daily) {
    throw new LimitError('spend_limit_daily_exceeded', `this call would take today's spend to ${formatUsdc(spent + quoted)} USDC and your daily limit is ${formatUsdc(daily)} USDC — raise it with \`clervo limits set --daily <usdc>\``);
  }
}

/* USDC decimal string to atomic units, without floating point. */
export function usdcToAtomic(value: string): string {
  if (!/^(?:0|[1-9][0-9]{0,12})(?:\.[0-9]{1,6})?$/u.test(value.trim())) throw new LimitError('usdc_amount_invalid', 'amount must be a USDC value with at most 6 decimal places');
  const [whole = '0', fraction = ''] = value.trim().split('.');
  return `${BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0') || '0')}`;
}
