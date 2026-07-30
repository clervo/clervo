import type { AdapterErrorClassification, AdapterHealth, CostEstimate, QualificationResult } from './adapter.js';
import type { AssetAmount } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitPolicy {
  failureThreshold: number;
  rollingWindowMs: number;
  cooldownMs: number;
}

export interface CircuitSnapshot {
  adapterId: string;
  state: CircuitState;
  failureTimestamps: readonly string[];
  openedAt?: string;
  probeInFlight: boolean;
}

export interface CircuitPermit {
  allowed: boolean;
  kind: 'normal' | 'probe' | 'denied';
  snapshot: Readonly<CircuitSnapshot>;
  reason?: 'circuit_open' | 'probe_in_flight';
}

export interface BudgetAccount {
  budgetId: string;
  asset: string;
  limitAtomic: string;
  spentAtomic: string;
  reservedAtomic: string;
  requestLimit: number;
  requestsSpent: number;
  requestsReserved: number;
  resetAt: string;
}

export interface BudgetReservation {
  reservationId: string;
  operationId: string;
  adapterId: string;
  amount: AssetAmount;
  status: 'held' | 'settled' | 'released';
  createdAt: string;
}

export interface BudgetState {
  account: BudgetAccount;
  reservations: readonly BudgetReservation[];
}

export interface BudgetReservationResult {
  granted: boolean;
  state: Readonly<BudgetState>;
  reservation?: Readonly<BudgetReservation>;
  reason?: 'budget_expired' | 'asset_mismatch' | 'cost_limit_exceeded' | 'request_limit_exceeded' | 'reservation_conflict';
}

export interface DependencyHealth {
  dependency: 'database' | 'facilitator' | 'network';
  status: 'healthy' | 'degraded' | 'unavailable' | 'unknown';
  checkedAt: string;
}

export interface RouteCandidate {
  adapterId: string;
  productIds: readonly string[];
  priority: number;
  qualification: QualificationResult;
  health: AdapterHealth;
  circuit: CircuitSnapshot;
  estimate: CostEstimate;
}

export interface RouteRequest {
  operationId: string;
  productId: string;
  reservationId: string;
  now: string;
  deadlineAt: string;
  healthMaxAgeMs: number;
  minimumExecutionMs: number;
  circuitPolicy: CircuitPolicy;
  dependencies: readonly DependencyHealth[];
  requiredDependencies: readonly DependencyHealth['dependency'][];
  candidates: readonly RouteCandidate[];
  excludedAdapterIds?: readonly string[];
  budget: BudgetState;
}

export type RouteRejectionCode =
  | 'adapter_excluded'
  | 'budget_expired'
  | 'circuit_open'
  | 'cost_estimate_expired'
  | 'cost_limit_exceeded'
  | 'deadline_insufficient'
  | 'dependency_unavailable'
  | 'health_not_routable'
  | 'health_stale'
  | 'no_exact_product_match'
  | 'qualification_expired'
  | 'qualification_not_passed'
  | 'request_limit_exceeded';

export interface RouteRejection {
  adapterId?: string;
  code: RouteRejectionCode;
}

export interface RouteDecision {
  contractVersion: typeof CONTRACT_VERSION;
  operationId: string;
  productId: string;
  decidedAt: string;
  outcome: 'selected' | 'rejected';
  adapterId?: string;
  circuitPermit?: 'normal' | 'probe';
  reservationId?: string;
  maximumSupplierCost?: AssetAmount;
  rejections: readonly RouteRejection[];
}

export interface RouteResult {
  decision: Readonly<RouteDecision>;
  budget: Readonly<BudgetState>;
  circuit?: Readonly<CircuitSnapshot>;
}

function milliseconds(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${name}_must_be_rfc3339`);
  return parsed;
}

function atomic(value: string, name: string): bigint {
  if (!/^(?:0|[1-9][0-9]{0,77})$/.test(value)) throw new TypeError(`${name}_must_be_atomic_amount`);
  return BigInt(value);
}

function assertCircuitPolicy(policy: CircuitPolicy): void {
  if (!Number.isInteger(policy.failureThreshold) || policy.failureThreshold < 1) throw new TypeError('invalid_failure_threshold');
  if (!Number.isInteger(policy.rollingWindowMs) || policy.rollingWindowMs < 1) throw new TypeError('invalid_rolling_window');
  if (!Number.isInteger(policy.cooldownMs) || policy.cooldownMs < 1) throw new TypeError('invalid_circuit_cooldown');
}

function recentFailures(snapshot: CircuitSnapshot, nowMs: number, policy: CircuitPolicy): readonly string[] {
  return snapshot.failureTimestamps.filter((timestamp) => {
    const failureMs = milliseconds(timestamp, 'failure_timestamp');
    return failureMs <= nowMs && nowMs - failureMs <= policy.rollingWindowMs;
  });
}

export function acquireCircuitPermit(snapshot: CircuitSnapshot, now: string, policy: CircuitPolicy): Readonly<CircuitPermit> {
  assertCircuitPolicy(policy);
  const nowMs = milliseconds(now, 'now');
  const failures = recentFailures(snapshot, nowMs, policy);
  if (snapshot.state === 'closed') return Object.freeze({ allowed: true, kind: 'normal', snapshot: Object.freeze({ ...snapshot, failureTimestamps: failures }) });
  if (snapshot.state === 'half_open') {
    if (snapshot.probeInFlight) return Object.freeze({ allowed: false, kind: 'denied', reason: 'probe_in_flight', snapshot: Object.freeze({ ...snapshot, failureTimestamps: failures }) });
    return Object.freeze({ allowed: true, kind: 'probe', snapshot: Object.freeze({ ...snapshot, failureTimestamps: failures, probeInFlight: true }) });
  }
  const openedMs = snapshot.openedAt ? milliseconds(snapshot.openedAt, 'opened_at') : nowMs;
  if (nowMs - openedMs < policy.cooldownMs) return Object.freeze({ allowed: false, kind: 'denied', reason: 'circuit_open', snapshot: Object.freeze({ ...snapshot, failureTimestamps: failures }) });
  return Object.freeze({ allowed: true, kind: 'probe', snapshot: Object.freeze({ ...snapshot, state: 'half_open', failureTimestamps: failures, probeInFlight: true }) });
}

export function recordCircuitOutcome(snapshot: CircuitSnapshot, outcome: 'success' | 'failure', now: string, policy: CircuitPolicy): Readonly<CircuitSnapshot> {
  assertCircuitPolicy(policy);
  const nowMs = milliseconds(now, 'now');
  if (outcome === 'success') return Object.freeze({ adapterId: snapshot.adapterId, state: 'closed', failureTimestamps: [], probeInFlight: false });
  const failures = [...recentFailures(snapshot, nowMs, policy), now];
  if (snapshot.state === 'half_open' || failures.length >= policy.failureThreshold) {
    return Object.freeze({ adapterId: snapshot.adapterId, state: 'open', failureTimestamps: Object.freeze(failures), openedAt: now, probeInFlight: false });
  }
  return Object.freeze({ adapterId: snapshot.adapterId, state: 'closed', failureTimestamps: Object.freeze(failures), probeInFlight: false });
}

export function reserveBudget(state: BudgetState, input: { reservationId: string; operationId: string; adapterId: string; amount: AssetAmount; now: string }): Readonly<BudgetReservationResult> {
  const nowMs = milliseconds(input.now, 'now');
  if (state.reservations.some((reservation) => reservation.reservationId === input.reservationId)) return Object.freeze({ granted: false, state, reason: 'reservation_conflict' });
  if (nowMs >= milliseconds(state.account.resetAt, 'budget_reset_at')) return Object.freeze({ granted: false, state, reason: 'budget_expired' });
  if (input.amount.asset !== state.account.asset) return Object.freeze({ granted: false, state, reason: 'asset_mismatch' });
  const requested = atomic(input.amount.amountAtomic, 'requested_amount');
  const spent = atomic(state.account.spentAtomic, 'spent_amount');
  const reserved = atomic(state.account.reservedAtomic, 'reserved_amount');
  const limit = atomic(state.account.limitAtomic, 'budget_limit');
  if (spent + reserved + requested > limit) return Object.freeze({ granted: false, state, reason: 'cost_limit_exceeded' });
  if (state.account.requestsSpent + state.account.requestsReserved + 1 > state.account.requestLimit) return Object.freeze({ granted: false, state, reason: 'request_limit_exceeded' });
  const reservation: BudgetReservation = { reservationId: input.reservationId, operationId: input.operationId, adapterId: input.adapterId, amount: input.amount, status: 'held', createdAt: input.now };
  return Object.freeze({
    granted: true,
    reservation: Object.freeze(reservation),
    state: Object.freeze({
      account: Object.freeze({ ...state.account, reservedAtomic: (reserved + requested).toString(), requestsReserved: state.account.requestsReserved + 1 }),
      reservations: Object.freeze([...state.reservations, Object.freeze(reservation)]),
    }),
  });
}

export function finalizeBudgetReservation(state: BudgetState, reservationId: string, outcome: 'settled' | 'released'): Readonly<BudgetState> {
  const reservation = state.reservations.find((item) => item.reservationId === reservationId);
  if (!reservation) throw new TypeError('reservation_not_found');
  if (reservation.status !== 'held') throw new TypeError('reservation_not_held');
  const amount = atomic(reservation.amount.amountAtomic, 'reservation_amount');
  const reserved = atomic(state.account.reservedAtomic, 'reserved_amount');
  if (reserved < amount || state.account.requestsReserved < 1) throw new TypeError('budget_reservation_invariant_broken');
  return Object.freeze({
    account: Object.freeze({
      ...state.account,
      reservedAtomic: (reserved - amount).toString(),
      requestsReserved: state.account.requestsReserved - 1,
      ...(outcome === 'settled' ? {
        spentAtomic: (atomic(state.account.spentAtomic, 'spent_amount') + amount).toString(),
        requestsSpent: state.account.requestsSpent + 1,
      } : {}),
    }),
    reservations: Object.freeze(state.reservations.map((item) => item.reservationId === reservationId ? Object.freeze({ ...item, status: outcome }) : item)),
  });
}

function dependencyRejection(request: RouteRequest, nowMs: number): RouteRejection | undefined {
  for (const dependency of request.requiredDependencies) {
    const evidence = request.dependencies.find((item) => item.dependency === dependency);
    if (!evidence || evidence.status === 'unavailable' || evidence.status === 'unknown' || nowMs - milliseconds(evidence.checkedAt, 'dependency_checked_at') > request.healthMaxAgeMs) {
      return { code: 'dependency_unavailable' };
    }
  }
  return undefined;
}

function budgetReason(reason: BudgetReservationResult['reason']): RouteRejectionCode {
  if (reason === 'budget_expired') return 'budget_expired';
  if (reason === 'request_limit_exceeded') return 'request_limit_exceeded';
  return 'cost_limit_exceeded';
}

export function routeProvider(request: RouteRequest): Readonly<RouteResult> {
  const nowMs = milliseconds(request.now, 'now');
  const deadlineMs = milliseconds(request.deadlineAt, 'deadline_at');
  if (!Number.isInteger(request.healthMaxAgeMs) || request.healthMaxAgeMs < 1) throw new TypeError('invalid_health_max_age');
  if (!Number.isInteger(request.minimumExecutionMs) || request.minimumExecutionMs < 0) throw new TypeError('invalid_minimum_execution_time');
  const rejections: RouteRejection[] = [];
  const dependencyFailure = dependencyRejection(request, nowMs);
  if (dependencyFailure) rejections.push(dependencyFailure);
  if (deadlineMs - nowMs < request.minimumExecutionMs) rejections.push({ code: 'deadline_insufficient' });
  if (rejections.length > 0) return rejected(request, rejections);

  const excluded = new Set(request.excludedAdapterIds ?? []);
  const candidates = [...request.candidates].sort((left, right) => left.priority - right.priority || healthRank(left.health.status) - healthRank(right.health.status) || compareAmount(left.estimate.maximumSupplierCost, right.estimate.maximumSupplierCost) || left.adapterId.localeCompare(right.adapterId));
  let budget = request.budget;
  for (const candidate of candidates) {
    if (excluded.has(candidate.adapterId)) { rejections.push({ adapterId: candidate.adapterId, code: 'adapter_excluded' }); continue; }
    if (!candidate.productIds.includes(request.productId) || candidate.qualification.productId !== request.productId) { rejections.push({ adapterId: candidate.adapterId, code: 'no_exact_product_match' }); continue; }
    if (candidate.qualification.status !== 'passed' || !['approved', 'restricted'].includes(candidate.qualification.termsStatus) || candidate.qualification.checks.some((check) => check.status !== 'passed')) { rejections.push({ adapterId: candidate.adapterId, code: 'qualification_not_passed' }); continue; }
    if (milliseconds(candidate.qualification.expiresAt, 'qualification_expires_at') <= nowMs) { rejections.push({ adapterId: candidate.adapterId, code: 'qualification_expired' }); continue; }
    const healthAge = nowMs - milliseconds(candidate.health.checkedAt, 'health_checked_at');
    if (healthAge < 0 || healthAge > request.healthMaxAgeMs) { rejections.push({ adapterId: candidate.adapterId, code: 'health_stale' }); continue; }
    if (candidate.health.status === 'unavailable' || candidate.health.status === 'unknown') { rejections.push({ adapterId: candidate.adapterId, code: 'health_not_routable' }); continue; }
    if (milliseconds(candidate.estimate.expiresAt, 'estimate_expires_at') <= nowMs) { rejections.push({ adapterId: candidate.adapterId, code: 'cost_estimate_expired' }); continue; }
    const permit = acquireCircuitPermit(candidate.circuit, request.now, request.circuitPolicy);
    if (!permit.allowed) { rejections.push({ adapterId: candidate.adapterId, code: 'circuit_open' }); continue; }
    const reservation = reserveBudget(budget, { reservationId: request.reservationId, operationId: request.operationId, adapterId: candidate.adapterId, amount: candidate.estimate.maximumSupplierCost, now: request.now });
    if (!reservation.granted) { rejections.push({ adapterId: candidate.adapterId, code: budgetReason(reservation.reason) }); continue; }
    budget = reservation.state;
    return Object.freeze({
      budget,
      circuit: permit.snapshot,
      decision: Object.freeze({ contractVersion: CONTRACT_VERSION, operationId: request.operationId, productId: request.productId, decidedAt: request.now, outcome: 'selected', adapterId: candidate.adapterId, circuitPermit: permit.kind as 'normal' | 'probe', reservationId: request.reservationId, maximumSupplierCost: candidate.estimate.maximumSupplierCost, rejections: Object.freeze(rejections) }),
    });
  }
  return rejected(request, rejections, budget);
}

function rejected(request: RouteRequest, rejections: readonly RouteRejection[], budget: BudgetState = request.budget): Readonly<RouteResult> {
  return Object.freeze({ budget, decision: Object.freeze({ contractVersion: CONTRACT_VERSION, operationId: request.operationId, productId: request.productId, decidedAt: request.now, outcome: 'rejected', rejections: Object.freeze([...rejections]) }) });
}

function healthRank(status: AdapterHealth['status']): number {
  return status === 'healthy' ? 0 : status === 'degraded' ? 1 : status === 'unavailable' ? 2 : 3;
}

function compareAmount(left: AssetAmount, right: AssetAmount): number {
  if (left.asset !== right.asset || left.decimals !== right.decimals) return `${left.asset}:${left.decimals}`.localeCompare(`${right.asset}:${right.decimals}`);
  const leftAmount = atomic(left.amountAtomic, 'left_amount');
  const rightAmount = atomic(right.amountAtomic, 'right_amount');
  return leftAmount < rightAmount ? -1 : leftAmount > rightAmount ? 1 : 0;
}

export function failoverDisposition(classification: AdapterErrorClassification, executionOutcome: 'failed' | 'unknown'): 'failover_allowed' | 'quarantine' | 'stop' {
  if (executionOutcome === 'unknown' || classification.providerMayHaveConsumed || classification.retryability === 'reconcile') return 'quarantine';
  if (classification.retryability === 'safe_before_consumption') return 'failover_allowed';
  return 'stop';
}