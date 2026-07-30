import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTRACT_VERSION,
  allowedTransitions,
  canonicalRequestHash,
  canonicalize,
  canTransition,
  decideIdempotency,
  operationStates,
  retryAction,
  validateIdempotencyKey,
} from '../../dist/packages/contracts/src/index.js';

const base = {
  contractVersion: CONTRACT_VERSION,
  operation: 'search.web',
  method: 'post',
  target: '/v1/operations/search.web',
  contentType: 'Application/JSON',
};

test('RFC 8785 canonicalization is stable for object member order', () => {
  assert.equal(canonicalize({ z: 1, a: { y: true, x: 'ok' } }), '{"a":{"x":"ok","y":true},"z":1}');
  assert.equal(
    canonicalRequestHash({ ...base, body: { query: 'clervo', limit: 5 } }),
    canonicalRequestHash({ ...base, body: { limit: 5, query: 'clervo' } }),
  );
});

test('canonical fingerprint changes for semantically different requests', () => {
  assert.notEqual(
    canonicalRequestHash({ ...base, body: { query: 'clervo', limit: 5 } }),
    canonicalRequestHash({ ...base, body: { query: 'clervo', limit: 6 } }),
  );
  assert.notEqual(
    canonicalRequestHash({ ...base, body: { query: 'clervo' } }),
    canonicalRequestHash({ ...base, target: '/v1/operations/ai.chat', body: { query: 'clervo' } }),
  );
});

test('canonicalization rejects non-JSON numeric and Unicode inputs', () => {
  assert.throws(() => canonicalize(Number.NaN), /finite/);
  assert.throws(() => canonicalize('\ud800'), /unpaired/);
});

test('idempotency keys are bounded tokens', () => {
  assert.doesNotThrow(() => validateIdempotencyKey('idem_01JZ8Q5Y4QFD48Q24H6M5F4K9P'));
  assert.throws(() => validateIdempotencyKey('short'), /8-128/);
  assert.throws(() => validateIdempotencyKey('contains a space'), /visible ASCII token/);
});

test('idempotency distinguishes new, replay, in-progress, and conflict', () => {
  assert.deepEqual(decideIdempotency('sha256:a'), { kind: 'new' });
  assert.deepEqual(decideIdempotency('sha256:a', { operationId: 'op_1', requestHash: 'sha256:a', terminal: true }), { kind: 'replay', operationId: 'op_1' });
  assert.deepEqual(decideIdempotency('sha256:a', { operationId: 'op_1', requestHash: 'sha256:a', terminal: false }), { kind: 'in_progress', operationId: 'op_1' });
  assert.deepEqual(decideIdempotency('sha256:b', { operationId: 'op_1', requestHash: 'sha256:a', terminal: true }), { kind: 'conflict', operationId: 'op_1' });
});

test('every state is represented and terminal states have no exits', () => {
  assert.equal(operationStates.length, 17);
  for (const state of operationStates) assert.ok(Array.isArray(allowedTransitions(state)));
  assert.deepEqual(allowedTransitions('RECEIPTED'), []);
  assert.deepEqual(allowedTransitions('FAILED'), []);
});

test('the happy path cannot skip gates', () => {
  assert.equal(canTransition('RECEIVED', 'EXECUTING'), false);
  assert.equal(canTransition('QUOTED', 'EXECUTING'), false);
  assert.equal(canTransition('EXECUTED', 'SETTLING'), false);
  assert.equal(canTransition('VERIFIED', 'RECEIPTED'), false);
  assert.equal(canTransition('SETTLED', 'RECEIPTED'), true);
});

test('unknown execution and settlement outcomes force reconciliation', () => {
  assert.deepEqual(allowedTransitions('EXECUTION_UNKNOWN'), ['RECONCILING']);
  assert.deepEqual(allowedTransitions('SETTLEMENT_UNKNOWN'), ['RECONCILING']);
  assert.equal(retryAction('EXECUTION_UNKNOWN'), 'RECONCILE');
  assert.equal(retryAction('SETTLEMENT_UNKNOWN'), 'RECONCILE');
  assert.equal(retryAction('RECEIPTED'), 'REPLAY_STORED_RESPONSE');
  assert.equal(retryAction('FAILED'), 'REJECT');
});