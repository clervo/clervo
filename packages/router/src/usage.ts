import { formatUsdc } from './chain.js';
import { listOperations, readReceipt, spentTodayAtomic, unreconciledOperations, type ConnectSurface, type OperationRecord } from './store.js';

export interface UsageBucket {
  readonly calls: number;
  readonly free: number;
  readonly paid: number;
  readonly authorizedAtomic: string;
  readonly settledAtomic: string;
  readonly successful: number;
  readonly failed: number;
  readonly refused: number;
  readonly replayed: number;
}

export interface LocalUsage {
  readonly generatedAt: string;
  readonly calls: number;
  readonly free: number;
  readonly paid: number;
  readonly amountAuthorizedAtomic: string;
  readonly amountAuthorized: string;
  readonly amountSettledAtomic: string;
  readonly amountSettled: string;
  readonly currentDaySpendAtomic: string;
  readonly currentDaySpend: string;
  readonly unreconciledCount: number;
  readonly bySurface: Readonly<Record<string, UsageBucket>>;
  readonly byFamily: Readonly<Record<string, UsageBucket>>;
  readonly byProduct: Readonly<Record<string, UsageBucket>>;
  readonly byModelOrRoute: Readonly<Record<string, UsageBucket>>;
}

interface MutableBucket {
  calls: number;
  free: number;
  paid: number;
  authorized: bigint;
  settled: bigint;
  successful: number;
  failed: number;
  refused: number;
  replayed: number;
}

function empty(): MutableBucket {
  return { calls: 0, free: 0, paid: 0, authorized: 0n, settled: 0n, successful: 0, failed: 0, refused: 0, replayed: 0 };
}

function familyFor(productId: string): string {
  const family = productId.split('.', 1)[0] ?? 'unknown';
  return family === 'crypto' ? 'crypto_intelligence' : family;
}

function modelOrRouteFor(record: OperationRecord, env: NodeJS.ProcessEnv): string {
  const model = record.requestBody.model;
  if (typeof model === 'string' && model.length > 0) return model;
  if (record.receiptId !== null) {
    const receipt = readReceipt(record.receiptId, env);
    const route = receipt?.route ?? receipt?.model ?? receipt?.exactModelId;
    if (typeof route === 'string' && route.length > 0) return route;
    const provenance = Array.isArray(receipt?.provenance) ? receipt.provenance as Array<Record<string, unknown>> : [];
    const routeId = provenance.find((entry) => typeof entry.routeId === 'string')?.routeId;
    if (typeof routeId === 'string') return routeId;
  }
  return 'not_applicable';
}

function add(bucket: MutableBucket, record: OperationRecord): void {
  bucket.calls += 1;
  if (record.state === 'free') bucket.free += 1;
  else bucket.paid += 1;
  if (record.authorizationCreated === true || record.authorizationCreated === undefined && (record.state === 'authorizing' || record.state === 'unknown' || record.state === 'settled')) {
    bucket.authorized += BigInt(record.quotedAtomic ?? '0');
  }
  if (record.state === 'settled') bucket.settled += BigInt(record.chargedAtomic ?? '0');
  if (record.state === 'settled' || record.state === 'free') bucket.successful += 1;
  else bucket.failed += 1;
  if (record.state === 'refused') bucket.refused += 1;
  if (record.replayed) bucket.replayed += 1;
}

function frozen(bucket: MutableBucket): UsageBucket {
  return Object.freeze({
    calls: bucket.calls,
    free: bucket.free,
    paid: bucket.paid,
    authorizedAtomic: bucket.authorized.toString(),
    settledAtomic: bucket.settled.toString(),
    successful: bucket.successful,
    failed: bucket.failed,
    refused: bucket.refused,
    replayed: bucket.replayed,
  });
}

function project(map: Map<string, MutableBucket>): Readonly<Record<string, UsageBucket>> {
  return Object.freeze(Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, frozen(value)])));
}

export function localUsage(env: NodeJS.ProcessEnv = process.env, now = () => new Date().toISOString()): LocalUsage {
  const records = listOperations(env);
  const total = empty();
  const surface = new Map<string, MutableBucket>();
  const family = new Map<string, MutableBucket>();
  const product = new Map<string, MutableBucket>();
  const modelOrRoute = new Map<string, MutableBucket>();
  for (const record of records) {
    const surfaceName: ConnectSurface = record.surface ?? 'unknown';
    const familyName = familyFor(record.productId);
    const routeName = modelOrRouteFor(record, env);
    for (const [map, key] of [[surface, surfaceName], [family, familyName], [product, record.productId], [modelOrRoute, routeName]] as const) {
      const bucket = map.get(key) ?? empty();
      add(bucket, record);
      map.set(key, bucket);
    }
    add(total, record);
  }
  const day = spentTodayAtomic(env);
  return Object.freeze({
    generatedAt: now(),
    calls: total.calls,
    free: total.free,
    paid: total.paid,
    amountAuthorizedAtomic: total.authorized.toString(),
    amountAuthorized: formatUsdc(total.authorized.toString()),
    amountSettledAtomic: total.settled.toString(),
    amountSettled: formatUsdc(total.settled.toString()),
    currentDaySpendAtomic: day,
    currentDaySpend: formatUsdc(day),
    unreconciledCount: unreconciledOperations(env).length,
    bySurface: project(surface),
    byFamily: project(family),
    byProduct: project(product),
    byModelOrRoute: project(modelOrRoute),
  });
}
