import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTRACT_VERSION,
  acquireCircuitPermit,
  failoverDisposition,
  finalizeBudgetReservation,
  recordCircuitOutcome,
  reserveBudget,
  routeProvider,
} from '../../dist/packages/contracts/src/index.js';

const now = '2026-07-30T18:00:00.000Z';
const operationId = 'op_01JZ8Q5Y4QFD48Q24H6M5F4K9P';
const policy = { failureThreshold: 2, rollingWindowMs: 60_000, cooldownMs: 30_000 };

function budget(overrides = {}) {
  return {
    account: {
      budgetId: 'budget_local_daily',
      asset: 'USD',
      limitAtomic: '10',
      spentAtomic: '0',
      reservedAtomic: '0',
      requestLimit: 2,
      requestsSpent: 0,
      requestsReserved: 0,
      resetAt: '2026-07-31T00:00:00.000Z',
      ...overrides,
    },
    reservations: [],
  };
}

function candidate(adapterId, overrides = {}) {
  return {
    adapterId,
    productIds: ['search.web'],
    priority: 10,
    qualification: {
      contractVersion: CONTRACT_VERSION,
      qualificationId: `qual_${adapterId.replace(/[^a-z0-9]/g, '').padEnd(20, 'x')}`,
      adapterId,
      productId: 'search.web',
      status: 'passed',
      checkedAt: '2026-07-30T17:00:00.000Z',
      expiresAt: '2026-07-31T18:00:00.000Z',
      termsStatus: 'approved',
      checks: [{ name: 'fixture_conformance', status: 'passed' }],
      observed: {},
    },
    health: { adapterId, status: 'healthy', checkedAt: '2026-07-30T17:59:59.000Z' },
    circuit: { adapterId, state: 'closed', failureTimestamps: [], probeInFlight: false },
    estimate: { adapterId, maximumSupplierCost: { asset: 'USD', amountAtomic: '4', decimals: 6 }, basis: 'qualified_ceiling', expiresAt: '2026-07-30T18:05:00.000Z' },
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    operationId,
    productId: 'search.web',
    reservationId: 'res_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
    now,
    deadlineAt: '2026-07-30T18:00:05.000Z',
    healthMaxAgeMs: 5_000,
    minimumExecutionMs: 1_000,
    circuitPolicy: policy,
    dependencies: [
      { dependency: 'database', status: 'healthy', checkedAt: now },
      { dependency: 'network', status: 'healthy', checkedAt: now },
    ],
    requiredDependencies: ['database', 'network'],
    candidates: [candidate('adapter_mock.primary')],
    budget: budget(),
    ...overrides,
  };
}

test('routing is deterministic and reserves cost plus request capacity before selection', () => {
  const secondary = candidate('adapter_mock.secondary', { priority: 20, estimate: { ...candidate('adapter_mock.secondary').estimate, maximumSupplierCost: { asset: 'USD', amountAtomic: '2', decimals: 6 } } });
  const first = routeProvider(request({ candidates: [secondary, candidate('adapter_mock.primary')] }));
  const second = routeProvider(request({ candidates: [candidate('adapter_mock.primary'), secondary] }));
  assert.deepEqual(first.decision, second.decision);
  assert.equal(first.decision.adapterId, 'adapter_mock.primary');
  assert.equal(first.budget.account.reservedAtomic, '4');
  assert.equal(first.budget.account.requestsReserved, 1);
});

test('stale and unavailable providers are skipped for a qualified healthy fallback', () => {
  const stale = candidate('adapter_mock.stale', { priority: 1, health: { adapterId: 'adapter_mock.stale', status: 'healthy', checkedAt: '2026-07-30T17:00:00.000Z' } });
  const unavailable = candidate('adapter_mock.down', { priority: 2, health: { adapterId: 'adapter_mock.down', status: 'unavailable', checkedAt: now } });
  const fallback = candidate('adapter_mock.fallback', { priority: 3 });
  const result = routeProvider(request({ candidates: [unavailable, fallback, stale] }));
  assert.equal(result.decision.adapterId, 'adapter_mock.fallback');
  assert.deepEqual(result.decision.rejections, [
    { adapterId: 'adapter_mock.stale', code: 'health_stale' },
    { adapterId: 'adapter_mock.down', code: 'health_not_routable' },
  ]);
});

test('database or network loss rejects routing before any budget reservation', () => {
  for (const dependency of ['database', 'network']) {
    const result = routeProvider(request({ dependencies: [{ dependency, status: 'unavailable', checkedAt: now }], requiredDependencies: [dependency] }));
    assert.equal(result.decision.outcome, 'rejected');
    assert.deepEqual(result.decision.rejections, [{ code: 'dependency_unavailable' }]);
    assert.equal(result.budget.account.reservedAtomic, '0');
  }
});

test('hard cost and request ceilings stop provider traffic', () => {
  const costStopped = routeProvider(request({ budget: budget({ limitAtomic: '3' }) }));
  assert.equal(costStopped.decision.outcome, 'rejected');
  assert.deepEqual(costStopped.decision.rejections, [{ adapterId: 'adapter_mock.primary', code: 'cost_limit_exceeded' }]);
  const quotaStopped = routeProvider(request({ budget: budget({ requestLimit: 1, requestsSpent: 1 }) }));
  assert.equal(quotaStopped.decision.outcome, 'rejected');
  assert.deepEqual(quotaStopped.decision.rejections, [{ adapterId: 'adapter_mock.primary', code: 'request_limit_exceeded' }]);
});

test('budget reservations settle or release exactly once', () => {
  const held = reserveBudget(budget(), { reservationId: 'res_01JZ8Q5Y4QFD48Q24H6M5F4K9P', operationId, adapterId: 'adapter_mock.primary', amount: { asset: 'USD', amountAtomic: '4', decimals: 6 }, now });
  assert.equal(held.granted, true);
  const settled = finalizeBudgetReservation(held.state, held.reservation.reservationId, 'settled');
  assert.equal(settled.account.spentAtomic, '4');
  assert.equal(settled.account.reservedAtomic, '0');
  assert.throws(() => finalizeBudgetReservation(settled, held.reservation.reservationId, 'released'), /reservation_not_held/);
});

test('circuit opens on rolling failures, cools down, and allows one half-open probe', () => {
  const initial = { adapterId: 'adapter_mock.primary', state: 'closed', failureTimestamps: [], probeInFlight: false };
  const oneFailure = recordCircuitOutcome(initial, 'failure', '2026-07-30T17:59:40.000Z', policy);
  assert.equal(oneFailure.state, 'closed');
  const open = recordCircuitOutcome(oneFailure, 'failure', '2026-07-30T17:59:50.000Z', policy);
  assert.equal(open.state, 'open');
  assert.equal(acquireCircuitPermit(open, now, policy).allowed, false);
  const probe = acquireCircuitPermit(open, '2026-07-30T18:00:21.000Z', policy);
  assert.equal(probe.kind, 'probe');
  assert.equal(acquireCircuitPermit(probe.snapshot, '2026-07-30T18:00:22.000Z', policy).reason, 'probe_in_flight');
  assert.equal(recordCircuitOutcome(probe.snapshot, 'success', '2026-07-30T18:00:23.000Z', policy).state, 'closed');
});

test('open circuits fail over and a failed half-open probe reopens immediately', () => {
  const openCircuit = { adapterId: 'adapter_mock.primary', state: 'open', failureTimestamps: ['2026-07-30T17:59:50.000Z'], openedAt: '2026-07-30T17:59:50.000Z', probeInFlight: false };
  const fallback = candidate('adapter_mock.fallback', { priority: 20 });
  const routed = routeProvider(request({ candidates: [candidate('adapter_mock.primary', { priority: 1, circuit: openCircuit }), fallback] }));
  assert.equal(routed.decision.adapterId, 'adapter_mock.fallback');
  const probe = acquireCircuitPermit(openCircuit, '2026-07-30T18:00:21.000Z', policy);
  const reopened = recordCircuitOutcome(probe.snapshot, 'failure', '2026-07-30T18:00:22.000Z', policy);
  assert.equal(reopened.state, 'open');
  assert.equal(reopened.openedAt, '2026-07-30T18:00:22.000Z');
});

test('failover is allowed only for definitive pre-consumption failures', () => {
  assert.equal(failoverDisposition({ code: 'connect_refused', retryability: 'safe_before_consumption', providerMayHaveConsumed: false, safeDetail: 'not sent' }, 'failed'), 'failover_allowed');
  assert.equal(failoverDisposition({ code: 'timeout', retryability: 'reconcile', providerMayHaveConsumed: true, safeDetail: 'unknown' }, 'unknown'), 'quarantine');
  assert.equal(failoverDisposition({ code: 'provider_rejected', retryability: 'never', providerMayHaveConsumed: false, safeDetail: 'rejected' }, 'failed'), 'stop');
});