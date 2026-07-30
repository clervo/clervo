import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createQueryRewritePlan,
  createRetrievalQualificationSnapshot,
  createRetrievalQueryPlan,
  hashQueryRewritePlan,
  runRetrievalFederation,
} from '../../dist/packages/contracts/src/index.js';

const ids = {
  rewrite: 'rewrite_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  operation: 'op_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  plan: 'plan_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  qualification: 'rqual_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  federation: 'fed_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
};
const createdAt = '2026-07-30T23:58:00.000Z';

function qualification() {
  const checkedAt = '2026-07-30T23:57:59.000Z';
  const expiresAt = '2026-07-30T23:59:00.000Z';
  const checks = ['terms', 'authentication', 'quota', 'response_contract', 'content_use', 'failure_isolation'].map((name) => ({ name, status: 'passed', evidence: [{ url: `https://evidence.example/${name}`, observedAt: checkedAt, sha256: `sha256:${'a'.repeat(64)}` }] }));
  return createRetrievalQualificationSnapshot(ids.qualification, createdAt, [
    { pathId: 'retrieval_primary', providerId: 'provider_primary', failureDomain: 'operator_primary', role: 'primary', mechanism: 'provider_api', selected: true, checkedAt, expiresAt, termsStatus: 'approved', allowedContentUse: ['search_metadata'], restrictionsAcknowledged: true, checks },
    { pathId: 'retrieval_fallback', providerId: 'provider_fallback', failureDomain: 'operator_fallback', role: 'fallback', mechanism: 'public_archive', selected: true, checkedAt, expiresAt, termsStatus: 'approved', allowedContentUse: ['search_metadata'], restrictionsAcknowledged: true, checks },
  ]);
}

function rewrite(query = '  Clervo   exact evidence  ') {
  return createQueryRewritePlan({ rewriteId: ids.rewrite, operationId: ids.operation, query, createdAt });
}

test('bounded rewriting is deterministic, normalized, token-preserving, and deeply frozen', () => {
  const first = rewrite();
  const second = rewrite();
  assert.deepEqual(first, second);
  assert.equal(hashQueryRewritePlan(first), hashQueryRewritePlan(second));
  assert.equal(first.normalizedQuery, 'Clervo exact evidence');
  assert.deepEqual(first.variants.map((variant) => variant.query), ['Clervo exact evidence', '"Clervo exact evidence"']);
  assert.deepEqual(first.variants.map((variant) => variant.tokenCount), [3, 3]);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.variants), true);
  assert.equal(Object.isFrozen(first.variants[1]), true);
});

test('rewriting rejects control text, excessive tokens, excessive characters, and expansion-shaped mutation', () => {
  assert.throws(() => rewrite('unsafe\nquery'), /invalid_query_rewrite_query/u);
  assert.throws(() => rewrite(Array.from({ length: 65 }, (_, index) => `t${index}`).join(' ')), /query_rewrite_token_limit_exceeded/u);
  assert.throws(() => rewrite('x'.repeat(2_001)), /invalid_query_rewrite_query/u);
  const valid = rewrite('bounded evidence');
  const mutated = { ...valid, variants: [valid.variants[0], { ...valid.variants[1], query: '"bounded evidence" unrelated inferred terms' }] };
  assert.notEqual(hashQueryRewritePlan(valid), hashQueryRewritePlan(mutated));
});

test('federation receives exact role-bound variants while preserving the original normalized response query', async () => {
  const qualificationValue = qualification();
  const plan = createRetrievalQueryPlan({ planId: ids.plan, operationId: ids.operation, rewrite: rewrite(), createdAt, deadlineAt: '2026-07-30T23:58:05.000Z', qualification: qualificationValue });
  const requests = [];
  const adapter = { async execute(request) { requests.push(request.path); return { rawResponse: { query: request.path.query }, candidates: [] }; } };
  const report = await runRetrievalFederation({ federationId: ids.federation, plan, qualification: qualificationValue, adapters: { retrieval_primary: adapter, retrieval_fallback: adapter }, now: () => createdAt });
  assert.equal(report.query, 'Clervo exact evidence');
  assert.deepEqual(requests.map((path) => [path.role, path.rewriteVariantId, path.query]), [
    ['primary', 'identity', 'Clervo exact evidence'],
    ['fallback', 'exact_phrase', '"Clervo exact evidence"'],
  ]);
  assert.equal(report.rewriteId, ids.rewrite);
  assert.equal(report.rewriteSha256, plan.rewriteSha256);
});

test('a substituted rewrite artifact or execution query fails before adapters run', async () => {
  const qualificationValue = qualification();
  const plan = createRetrievalQueryPlan({ planId: ids.plan, operationId: ids.operation, rewrite: rewrite(), createdAt, deadlineAt: '2026-07-30T23:58:05.000Z', qualification: qualificationValue });
  let calls = 0;
  const adapter = { async execute() { calls += 1; return { rawResponse: {}, candidates: [] }; } };
  const forgedRewrite = { ...plan, rewrite: { ...plan.rewrite, normalizedQuery: 'substituted query' } };
  await assert.rejects(() => runRetrievalFederation({ federationId: ids.federation, plan: forgedRewrite, qualification: qualificationValue, adapters: { retrieval_primary: adapter, retrieval_fallback: adapter }, now: () => createdAt }), /invalid_query_rewrite_plan/u);
  const forgedExecution = { ...plan, executions: [plan.executions[0], { ...plan.executions[1], query: 'unbounded expansion' }] };
  await assert.rejects(() => runRetrievalFederation({ federationId: ids.federation, plan: forgedExecution, qualification: qualificationValue, adapters: { retrieval_primary: adapter, retrieval_fallback: adapter }, now: () => createdAt }), /invalid_federation_plan/u);
  assert.equal(calls, 0);
});