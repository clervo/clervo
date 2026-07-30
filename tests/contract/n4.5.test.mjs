import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRetrievalQualificationSnapshot,
  createRetrievalQueryPlan,
  createQueryRewritePlan,
  runRetrievalFederation,
} from '../../dist/packages/contracts/src/index.js';

const ids = {
  qualification: 'rqual_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  plan: 'plan_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  operation: 'op_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  federation: 'fed_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  rewrite: 'rewrite_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
};

function iso(offsetMs = 0) { return new Date(Date.now() + offsetMs).toISOString(); }

function qualification(evaluatedAt = iso()) {
  const checkedAt = new Date(Date.parse(evaluatedAt) - 1_000).toISOString();
  const expiresAt = new Date(Date.parse(evaluatedAt) + 60_000).toISOString();
  const checks = ['terms', 'authentication', 'quota', 'response_contract', 'content_use', 'failure_isolation'].map((name) => ({
    name,
    status: 'passed',
    evidence: [{ url: `https://evidence.example/${name}`, observedAt: checkedAt, sha256: `sha256:${'a'.repeat(64)}` }],
  }));
  return createRetrievalQualificationSnapshot(ids.qualification, evaluatedAt, [
    { pathId: 'retrieval_primary', providerId: 'provider_primary', failureDomain: 'operator_primary', role: 'primary', mechanism: 'provider_api', selected: true, checkedAt, expiresAt, termsStatus: 'approved', allowedContentUse: ['search_metadata'], restrictionsAcknowledged: true, checks },
    { pathId: 'retrieval_fallback', providerId: 'provider_fallback', failureDomain: 'operator_fallback', role: 'fallback', mechanism: 'public_archive', selected: true, checkedAt, expiresAt, termsStatus: 'approved', allowedContentUse: ['search_metadata'], restrictionsAcknowledged: true, checks },
  ]);
}

function plan(deadlineMs = 1_000) {
  const createdAt = iso();
  const rewrite = createQueryRewritePlan({ rewriteId: ids.rewrite, operationId: ids.operation, query: '  Clervo   search  ', createdAt });
  return createRetrievalQueryPlan({ planId: ids.plan, operationId: ids.operation, rewrite, createdAt, deadlineAt: new Date(Date.parse(createdAt) + deadlineMs).toISOString(), qualification: qualification(createdAt) });
}

function runInput(planValue = plan(), overrides = {}) {
  return { federationId: ids.federation, plan: planValue, qualification: qualification(planValue.createdAt), ...overrides };
}

function adapter(pathId, delayMs = 0) {
  return {
    async execute(request) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { rawResponse: { pathId, count: 1 }, candidates: [{ url: `https://${pathId}.example/article`, title: `${pathId} title`, snippet: 'Bounded search metadata.', retrievedAt: new Date(Math.min(Date.now(), Date.parse(request.deadlineAt))).toISOString() }] };
    },
  };
}

test('query planning binds deterministic rewrite variants, revalidates qualification, and orders primary then fallback', () => {
  const result = plan();
  assert.equal(result.query, 'Clervo search');
  assert.deepEqual(result.executions.map((item) => item.role), ['primary', 'fallback']);
  assert.deepEqual(result.executions.map((item) => item.query), ['Clervo search', '"Clervo search"']);
  assert.deepEqual(result.executions.map((item) => item.rewriteVariantId), ['identity', 'exact_phrase']);
  assert.match(result.qualificationSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.match(result.rewriteSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(result.executions[0]), true);
});

test('planning fails closed for a closed two-path gate, stale qualification, and unsafe deadline window', () => {
  const createdAt = iso();
  const good = qualification(createdAt);
  const rewrite = createQueryRewritePlan({ rewriteId: ids.rewrite, operationId: ids.operation, query: 'query', createdAt });
  const closed = { ...good, paths: good.paths.map((path, index) => index === 1 ? { ...path, failureDomain: good.paths[0].failureDomain } : path) };
  assert.throws(() => createRetrievalQueryPlan({ planId: ids.plan, operationId: ids.operation, rewrite, createdAt, deadlineAt: new Date(Date.parse(createdAt) + 1_000).toISOString(), qualification: closed }), /federation_qualification_gate_closed/u);
  const staleCreatedAt = new Date(Date.parse(createdAt) + 61_000).toISOString();
  const staleRewrite = createQueryRewritePlan({ rewriteId: ids.rewrite, operationId: ids.operation, query: 'query', createdAt: staleCreatedAt });
  assert.throws(() => createRetrievalQueryPlan({ planId: ids.plan, operationId: ids.operation, rewrite: staleRewrite, createdAt: staleCreatedAt, deadlineAt: new Date(Date.parse(createdAt) + 62_000).toISOString(), qualification: good }), /federation_qualification_gate_closed/u);
  assert.throws(() => createRetrievalQueryPlan({ planId: ids.plan, operationId: ids.operation, rewrite, createdAt, deadlineAt: new Date(Date.parse(createdAt) + 30_001).toISOString(), qualification: good }), /invalid_federation_deadline_window/u);
});

test('federation starts both paths without sequential fallback and preserves plan-order provenance', async () => {
  const calls = [];
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const adapters = Object.fromEntries(['retrieval_primary', 'retrieval_fallback'].map((pathId) => [pathId, { async execute(request) { calls.push(pathId); if (calls.length === 2) release(); await barrier; return adapter(pathId).execute(request); } }]));
  const planValue = plan();
  const report = await runRetrievalFederation(runInput(planValue, { adapters }));
  assert.deepEqual(calls.sort(), ['retrieval_fallback', 'retrieval_primary']);
  assert.equal(report.outcome, 'complete');
  assert.deepEqual(report.attempts.map((item) => item.role), ['primary', 'fallback']);
  assert.deepEqual(report.candidates.map((item) => item.pathId), ['retrieval_primary', 'retrieval_fallback']);
});

test('one adapter failure produces explicit partial accounting without cancelling the successful path', async () => {
  const report = await runRetrievalFederation(runInput(plan(), { adapters: { retrieval_primary: adapter('retrieval_primary'), retrieval_fallback: { async execute() { throw new Error('secret provider detail'); } } } }));
  assert.equal(report.outcome, 'partial');
  assert.deepEqual(report.attempts.map((item) => item.outcome), ['succeeded', 'failed']);
  assert.equal(report.attempts[1].failureCode, 'adapter_failed');
  assert.equal(JSON.stringify(report).includes('secret provider detail'), false);
});

test('malformed candidates fail only their path and raw response hashes bind successful provenance', async () => {
  const report = await runRetrievalFederation(runInput(plan(), { adapters: { retrieval_primary: adapter('retrieval_primary'), retrieval_fallback: { async execute() { return { rawResponse: { forged: true }, candidates: [{ url: 'file:///etc/passwd', title: 'bad', snippet: 'bad', retrievedAt: iso() }] }; } } } }));
  assert.equal(report.outcome, 'partial');
  assert.equal(report.attempts[1].failureCode, 'invalid_adapter_response');
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].rawResponseSha256, report.attempts[0].rawResponseSha256);
});

test('a hanging path reaches the shared absolute deadline while a completed path remains partial success', async () => {
  const report = await runRetrievalFederation(runInput(plan(40), { adapters: { retrieval_primary: adapter('retrieval_primary'), retrieval_fallback: { async execute() { return new Promise(() => {}); } } } }));
  assert.equal(report.outcome, 'partial');
  assert.equal(report.attempts[1].outcome, 'deadline_exceeded');
  assert.equal(report.attempts[1].failureCode, 'deadline_exceeded');
});

test('pre-cancellation invokes no adapters and returns exactly two cancelled attempts', async () => {
  const controller = new AbortController();
  controller.abort(new Error('do not serialize me'));
  let calls = 0;
  const counting = { async execute() { calls += 1; return { rawResponse: null, candidates: [] }; } };
  const report = await runRetrievalFederation(runInput(plan(), { adapters: { retrieval_primary: counting, retrieval_fallback: counting }, signal: controller.signal }));
  assert.equal(calls, 0);
  assert.equal(report.outcome, 'cancelled');
  assert.deepEqual(report.attempts.map((item) => item.failureCode), ['caller_cancelled', 'caller_cancelled']);
  assert.equal(JSON.stringify(report).includes('do not serialize me'), false);
});

test('in-flight caller cancellation aborts linked path signals and late settlements cannot mutate the report', async () => {
  const controller = new AbortController();
  const observed = [];
  const hanging = { async execute(request) { observed.push(request.signal); return new Promise((resolve) => setTimeout(() => resolve({ rawResponse: { late: true }, candidates: [] }), 100)); } };
  const promise = runRetrievalFederation(runInput(plan(500), { adapters: { retrieval_primary: hanging, retrieval_fallback: hanging }, signal: controller.signal }));
  setTimeout(() => controller.abort(), 10);
  const report = await promise;
  assert.equal(report.outcome, 'cancelled');
  assert.equal(observed.every((signal) => signal.aborted), true);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual(report.attempts.map((item) => item.outcome), ['cancelled', 'cancelled']);
  assert.equal(report.candidates.length, 0);
});

test('reports and all nested provenance records are deeply immutable', async () => {
  const report = await runRetrievalFederation(runInput(plan(), { adapters: { retrieval_primary: adapter('retrieval_primary'), retrieval_fallback: adapter('retrieval_fallback') } }));
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.attempts), true);
  assert.equal(Object.isFrozen(report.attempts[0]), true);
  assert.equal(Object.isFrozen(report.candidates), true);
  assert.equal(Object.isFrozen(report.candidates[0]), true);
});

test('runner rejects qualification substitution and forged plan metadata before invoking adapters', async () => {
  const planValue = plan();
  let calls = 0;
  const counting = { async execute() { calls += 1; return { rawResponse: null, candidates: [] }; } };
  const substituted = structuredClone(qualification(planValue.createdAt));
  substituted.paths[0].checks[0].evidence[0].sha256 = `sha256:${'b'.repeat(64)}`;
  await assert.rejects(() => runRetrievalFederation({ federationId: ids.federation, plan: planValue, qualification: substituted, adapters: { retrieval_primary: counting, retrieval_fallback: counting } }), /federation_qualification_mismatch/u);
  await assert.rejects(() => runRetrievalFederation(runInput({ ...planValue, executions: [{ ...planValue.executions[0], providerId: 'forged' }, planValue.executions[1]] }, { adapters: { retrieval_primary: counting, retrieval_fallback: counting } })), /invalid_federation_plan/u);
  assert.equal(calls, 0);
});

test('an elapsed absolute deadline invokes no adapters and still accounts for both paths', async () => {
  const planValue = plan(20);
  let calls = 0;
  const counting = { async execute() { calls += 1; return { rawResponse: null, candidates: [] }; } };
  const report = await runRetrievalFederation(runInput(planValue, { adapters: { retrieval_primary: counting, retrieval_fallback: counting }, now: () => new Date(Date.parse(planValue.deadlineAt) + 1).toISOString() }));
  assert.equal(calls, 0);
  assert.equal(report.outcome, 'failed');
  assert.deepEqual(report.attempts.map((item) => item.outcome), ['deadline_exceeded', 'deadline_exceeded']);
});