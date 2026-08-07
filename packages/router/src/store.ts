import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { clervoPaths } from './paths.js';

export const OPERATION_SCHEMA_VERSION = 'clervo.router.operation.v1' as const;

/*
 * `authorizing` is written before a signature leaves this machine and is the
 * only state that can become `unknown`. `unknown` means a payment may have
 * settled and we cannot prove it either way — the one state that blocks all
 * further spending until it is reconciled.
 */
export type OperationState = 'authorizing' | 'settled' | 'free' | 'unknown' | 'refused';

export interface OperationRecord {
  readonly schemaVersion: typeof OPERATION_SCHEMA_VERSION;
  readonly idempotencyKey: string;
  readonly productId: string;
  readonly resource: string;
  readonly requestBodyHash: string;
  /*
   * The exact request body, kept because reconciliation is impossible without
   * it: resolving an unknown settlement means replaying the same key with the
   * same bytes, and a hash cannot be replayed. It is the customer's own request
   * on the customer's own machine, written 0600 with the rest of the store.
   */
  readonly requestBody: Record<string, unknown>;
  readonly state: OperationState;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly quotedAtomic: string | null;
  readonly chargedAtomic: string | null;
  readonly operationId: string | null;
  readonly receiptId: string | null;
  readonly settlementReferenceHash: string | null;
  readonly replayed: boolean;
  readonly reason: string | null;
}

export class StoreError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'StoreError';
  }
}

/* An idempotency key must survive being a filename. Anything outside this set
 * could escape the operations directory. */
const KEY_PATTERN = /^[A-Za-z0-9_.-]{8,128}$/u;

export function assertIdempotencyKey(value: string): string {
  if (!KEY_PATTERN.test(value)) throw new StoreError('idempotency_key_invalid', 'an idempotency key must be 8-128 characters of letters, digits, dot, dash, or underscore');
  return value;
}

export function requestBodyHash(body: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
}

function operationPath(env: NodeJS.ProcessEnv, idempotencyKey: string): string {
  return join(clervoPaths(env).operations, `${assertIdempotencyKey(idempotencyKey)}.json`);
}

function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(path, 0o600);
}

function ensureDirectories(env: NodeJS.ProcessEnv): void {
  const paths = clervoPaths(env);
  mkdirSync(paths.operations, { recursive: true, mode: 0o700 });
  mkdirSync(paths.receipts, { recursive: true, mode: 0o700 });
}

export function readOperation(idempotencyKey: string, env: NodeJS.ProcessEnv = process.env): OperationRecord | undefined {
  let raw: string;
  try {
    raw = readFileSync(operationPath(env, idempotencyKey), 'utf8');
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as OperationRecord;
    return parsed?.schemaVersion === OPERATION_SCHEMA_VERSION ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeOperation(record: OperationRecord, env: NodeJS.ProcessEnv = process.env): OperationRecord {
  ensureDirectories(env);
  writeJsonFile(operationPath(env, record.idempotencyKey), record);
  return record;
}

export function listOperations(env: NodeJS.ProcessEnv = process.env): readonly OperationRecord[] {
  const paths = clervoPaths(env);
  let names: string[];
  try {
    names = readdirSync(paths.operations);
  } catch {
    return Object.freeze([]);
  }
  const records: OperationRecord[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const record = readOperation(name.slice(0, -'.json'.length), env);
    if (record !== undefined) records.push(record);
  }
  return Object.freeze(records.sort((left, right) => left.startedAt.localeCompare(right.startedAt)));
}

export function saveReceipt(receipt: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env): string | null {
  const receiptId = typeof receipt?.receiptId === 'string' && /^[A-Za-z0-9_.-]{4,128}$/u.test(receipt.receiptId) ? receipt.receiptId : null;
  if (receiptId === null) return null;
  ensureDirectories(env);
  writeJsonFile(join(clervoPaths(env).receipts, `${receiptId}.json`), receipt);
  return receiptId;
}

export function readReceipt(receiptId: string, env: NodeJS.ProcessEnv = process.env): Record<string, unknown> | undefined {
  if (!/^[A-Za-z0-9_.-]{4,128}$/u.test(receiptId)) throw new StoreError('receipt_id_invalid');
  try {
    return JSON.parse(readFileSync(join(clervoPaths(env).receipts, `${receiptId}.json`), 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/*
 * Everything that must be reconciled before this machine may spend again.
 *
 * `authorizing` counts, not only `unknown`: a record still in `authorizing` is a
 * process that died between signing and hearing back, which is the same
 * ambiguity under a different name.
 */
export function unreconciledOperations(env: NodeJS.ProcessEnv = process.env): readonly OperationRecord[] {
  return Object.freeze(listOperations(env).filter((record) => record.state === 'unknown' || record.state === 'authorizing'));
}

export function assertNothingUnreconciled(env: NodeJS.ProcessEnv = process.env): void {
  const open = unreconciledOperations(env);
  if (open.length < 1) return;
  const keys = open.map((record) => record.idempotencyKey).join(', ');
  throw new StoreError(
    'unreconciled_operation_blocks_spend',
    `settlement state is unknown for ${open.length} operation(s): ${keys}. Run \`clervo reconcile\` before authorizing anything else.`,
  );
}

/* Today's settled spend, in atomic USDC, on the UTC day boundary the receipts
 * are timestamped in. */
/*
 * What this machine has actually been charged today.
 *
 * There is exactly one record per idempotency key, and a key is charged at most
 * once, so every settled record contributes its charge once no matter how many
 * times its result was fetched again. `replayed` is provenance — whether this
 * machine created the charge or found it — and deliberately does not affect the
 * total: excluding replayed records would let a replay erase a real charge from
 * the day's spend, which is a limit that fails open.
 */
export function spentTodayAtomic(env: NodeJS.ProcessEnv = process.env, today = new Date().toISOString().slice(0, 10)): string {
  let total = 0n;
  for (const record of listOperations(env)) {
    if (record.state !== 'settled') continue;
    if ((record.completedAt ?? '').slice(0, 10) !== today) continue;
    if (record.chargedAtomic === null) continue;
    total += BigInt(record.chargedAtomic);
  }
  return total.toString();
}
