import assert from 'node:assert/strict';
import test from 'node:test';

import { sealQuote } from '../../dist/packages/contracts/src/commerce.js';
import { hashJson, sealReceipt } from '../../dist/packages/contracts/src/receipt.js';
import { CONTRACT_VERSION } from '../../dist/packages/contracts/src/types.js';
import { InMemoryWorkflowEngine, PRIVATE_WORKFLOW_DEFINITIONS } from '../../dist/services/workflows/src/engine.js';

const citationId = `cite_${'A'.repeat(20)}`;
const resultId = `sr_${'B'.repeat(20)}`;
const evidenceRef = `evidence_${'a'.repeat(32)}`;
const digest = `sha256:${'b'.repeat(64)}`;
const routeHash = `sha256:${'c'.repeat(64)}`;
const policyHash = `sha256:${'d'.repeat(64)}`;

function boundary(step, prior, overrides = {}) {
  const found = prior.find((value) => value.pillar === 'search' || value.pillar === 'prediction' || value.pillar === 'crypto');
  if (step.pillar === 'search') return { pillar: 'search', citationIds: [citationId], resultIds: [resultId], degraded: false, ...overrides };
  if (step.pillar === 'prediction') return { pillar: 'prediction', evidenceRefs: [evidenceRef], resolutionSourceUrls: ['https://official.example/rules'], freshness: 'fresh', degraded: false, ...overrides };
  if (step.pillar === 'crypto') return { pillar: 'crypto', evidenceRefs: [evidenceRef], coverage: ['native_balance'], conflictCount: 0, freshness: 'fresh', degraded: false, ...overrides };
  if (step.pillar === 'ai') return {
    pillar: 'ai',
    requestedModel: 'clervo/smart',
    exactModelId: 'exact-model-1',
    providerId: 'provider.recorded',
    routeDecisionHash: routeHash,
    groundedCitationIds: found?.pillar === 'search' ? found.citationIds : [],
    groundedEvidenceRefs: found?.pillar === 'prediction' || found?.pillar === 'crypto' ? found.evidenceRefs : [],
    degraded: false,
    ...overrides,
  };
  if (step.pillar === 'sandbox') return { pillar: 'sandbox', imageDigest: digest, isolationQualified: true, networkDefaultDenied: true, cleanedUp: true, degraded: false, ...overrides };
  return { pillar: 'rpc', chainId: 'eip155:1', policyHash, sideEffecting: false, quorum: 2, degraded: false, ...overrides };
}

function recordedExecutor(options = {}) {
  const calls = [];
  return {
    calls,
    async execute(input) {
      calls.push(input);
      if (options.failStepId === input.step.stepId) throw new Error('recorded provider outage');
      const now = new Date();
      const issuedAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + 60_000).toISOString();
      const quote = sealQuote({
        contractVersion: CONTRACT_VERSION,
        quoteId: `quote_${'Q'.repeat(20)}`,
        operationId: input.stepOperationId,
        productId: input.step.productId,
        requestHash: input.stepRequestHash,
        priceVersion: 'workflow-private-1',
        maximumCharge: { asset: 'USD', amountAtomic: '100', decimals: 6 },
        issuedAt,
        expiresAt,
      });
      const supplierCost = options.supplierCostByStep?.[input.step.stepId] ?? options.supplierCostMicrousd ?? 10;
      const resultHash = hashJson({ stepId: input.step.stepId });
      const receipt = sealReceipt({
        contractVersion: CONTRACT_VERSION,
        receiptId: `receipt_${'R'.repeat(20)}`,
        operationId: input.stepOperationId,
        productId: input.step.productId,
        requestHash: input.stepRequestHash,
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash,
        fundingMode: 'sponsored',
        customerCharge: { asset: 'USD', amountAtomic: '0', decimals: 6 },
        supplierCost: { asset: 'USD', amountAtomic: String(supplierCost), decimals: 6 },
        settlement: { status: 'not_required' },
        resultHash,
        provenance: [],
        completedAt: issuedAt,
      });
      let value = boundary(input.step, input.priorBoundaries);
      if (options.corruptStepId === input.step.stepId) value = boundary(input.step, input.priorBoundaries, options.boundaryOverride);
      return { quote, receipt, boundary: value };
    },
  };
}

function request(workflowId, overrides = {}) {
  return {
    workflowId,
    workflowOperationId: `op_${'W'.repeat(20)}`,
    idempotencyKey: `idem_${'I'.repeat(20)}`,
    request: { topic: 'recorded workflow' },
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    maximumTotalSupplierCostMicrousd: 1_000_000,
    ...overrides,
  };
}

test('representative workflows compose all six pillars while preserving every underlying boundary', async () => {
  for (const definition of PRIVATE_WORKFLOW_DEFINITIONS) {
    const executor = recordedExecutor();
    const engine = new InMemoryWorkflowEngine(PRIVATE_WORKFLOW_DEFINITIONS, executor);
    const result = await engine.execute(request(definition.workflowId));
    assert.equal(result.state, 'completed');
    assert.equal(result.steps.length, 3);
    assert.deepEqual(result.steps.map(({ boundary: value }) => value.pillar), definition.steps.map(({ pillar }) => pillar));
    assert.equal(result.totalSupplierCostMicrousd, 30);
  }
  assert.deepEqual(new Set(PRIVATE_WORKFLOW_DEFINITIONS.flatMap(({ steps }) => steps.map(({ pillar }) => pillar))), new Set(['search', 'ai', 'sandbox', 'prediction', 'crypto', 'rpc']));
});

test('workflow replay returns the exact stored result without repeating a pillar and conflicts fail closed', async () => {
  const executor = recordedExecutor();
  const engine = new InMemoryWorkflowEngine(PRIVATE_WORKFLOW_DEFINITIONS, executor);
  const input = request('workflow.web_research_execute');
  const first = await engine.execute(input);
  const replay = await engine.execute(input);
  assert.equal(replay.replayed, true);
  assert.equal(replay.resultHash, first.resultHash);
  assert.equal(executor.calls.length, 3);
  await assert.rejects(engine.execute({ ...input, request: { topic: 'different' } }), /idempotency_conflict/u);
  assert.equal(executor.calls.length, 3);
});

test('citations, AI identity/grounding, sandbox isolation, RPC read-only policy, prediction provenance, and crypto coverage fail closed', async () => {
  const cases = [
    ['workflow.web_research_execute', 'find_web_evidence', { citationIds: [] }, /search_citations_invalid/u],
    ['workflow.web_research_execute', 'understand_with_exact_model', { exactModelId: '' }, /ai_identity_or_grounding_invalid/u],
    ['workflow.web_research_execute', 'act_in_isolated_sandbox', { networkDefaultDenied: false }, /sandbox_boundary_invalid/u],
    ['workflow.wallet_explain_verify', 'act_with_read_only_rpc', { sideEffecting: true }, /rpc_boundary_invalid/u],
    ['workflow.prediction_investigate', 'find_market_evidence', { resolutionSourceUrls: [] }, /prediction_resolution_invalid/u],
    ['workflow.wallet_explain_verify', 'find_wallet_evidence', { coverage: [] }, /crypto_coverage_invalid/u],
  ];
  for (const [workflowId, corruptStepId, boundaryOverride, expected] of cases) {
    const engine = new InMemoryWorkflowEngine(PRIVATE_WORKFLOW_DEFINITIONS, recordedExecutor({ corruptStepId, boundaryOverride }));
    await assert.rejects(engine.execute(request(workflowId)), expected);
  }
});

test('supplier and total cost ceilings stop downstream execution and provider outage never creates partial success', async () => {
  const expensive = recordedExecutor({ supplierCostByStep: { find_web_evidence: 5_000, understand_with_exact_model: 100_000 } });
  const engine = new InMemoryWorkflowEngine(PRIVATE_WORKFLOW_DEFINITIONS, expensive);
  await assert.rejects(engine.execute(request('workflow.web_research_execute', { maximumTotalSupplierCostMicrousd: 104_999 })), /total_cost_ceiling/u);
  assert.equal(expensive.calls.length, 2);

  const outage = recordedExecutor({ failStepId: 'understand_with_exact_model' });
  const failed = new InMemoryWorkflowEngine(PRIVATE_WORKFLOW_DEFINITIONS, outage);
  await assert.rejects(failed.execute(request('workflow.web_research_execute')), /recorded provider outage/u);
  assert.equal(outage.calls.length, 2);
});

test('degradation remains visible through composition instead of being promoted to success', async () => {
  const executor = recordedExecutor({ corruptStepId: 'find_wallet_evidence', boundaryOverride: { degraded: true, freshness: 'stale', conflictCount: 2 } });
  const engine = new InMemoryWorkflowEngine(PRIVATE_WORKFLOW_DEFINITIONS, executor);
  const result = await engine.execute(request('workflow.wallet_explain_verify'));
  assert.equal(result.state, 'degraded');
  assert.equal(result.steps[0].boundary.freshness, 'stale');
  assert.equal(result.steps[0].boundary.conflictCount, 2);
});
