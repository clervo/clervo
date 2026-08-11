import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { clervoPaths } from './paths.js';
import { unreconciledOperations } from './store.js';

interface LockRecord {
  readonly token: string;
  readonly pid: number;
  readonly host: string;
  readonly createdAt: string;
}

export interface CommerceLockStatus {
  readonly exists: boolean;
  readonly ownerAlive: boolean | null;
  readonly createdAt: string | null;
}

function readLock(env: NodeJS.ProcessEnv): LockRecord | undefined {
  try {
    const value = JSON.parse(readFileSync(clervoPaths(env).commerceLock, 'utf8')) as Partial<LockRecord>;
    if (typeof value.token !== 'string' || !Number.isSafeInteger(value.pid) || typeof value.host !== 'string' || typeof value.createdAt !== 'string') return undefined;
    return value as LockRecord;
  } catch { return undefined; }
}

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function commerceLockStatus(env: NodeJS.ProcessEnv = process.env): CommerceLockStatus {
  const path = clervoPaths(env).commerceLock;
  if (!existsSync(path)) return Object.freeze({ exists: false, ownerAlive: null, createdAt: null });
  const record = readLock(env);
  return Object.freeze({ exists: true, ownerAlive: record === undefined || record.host !== hostname() ? null : processAlive(record.pid), createdAt: record?.createdAt ?? null });
}

export function acquireCommerceLock(env: NodeJS.ProcessEnv = process.env): () => void {
  const paths = clervoPaths(env);
  mkdirSync(paths.home, { recursive: true, mode: 0o700 });
  const record: LockRecord = { token: randomUUID(), pid: process.pid, host: hostname(), createdAt: new Date().toISOString() };
  let descriptor: number;
  try { descriptor = openSync(paths.commerceLock, 'wx', 0o600); }
  catch { throw Object.assign(new Error('another Clervo surface is reserving a payment; retry after it completes or run `clervo reconcile` if the process stopped'), { name: 'CommerceLockError', code: 'commerce_lock_busy' }); }
  try { writeFileSync(descriptor, `${JSON.stringify(record)}\n`, { encoding: 'utf8' }); }
  finally { closeSync(descriptor); }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (readLock(env)?.token !== record.token) return;
    try { unlinkSync(paths.commerceLock); } catch { /* A missing lock is already released. */ }
  };
}

export function clearCommerceLockAfterReconciliation(env: NodeJS.ProcessEnv = process.env): boolean {
  if (unreconciledOperations(env).length > 0) return false;
  const status = commerceLockStatus(env);
  if (!status.exists) return true;
  if (status.ownerAlive !== false) return false;
  try { unlinkSync(clervoPaths(env).commerceLock); return true; } catch { return false; }
}
