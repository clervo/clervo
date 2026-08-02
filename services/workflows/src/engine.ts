import { hashJson, verifyReceipt, type OperationReceipt } from '../../../packages/contracts/src/receipt.js';
import { verifyQuote, type Quote } from '../../../packages/contracts/src/commerce.js';
import type { JsonValue } from '../../../packages/contracts/src/types.js';

export type WorkflowPillar = 'search' | 'ai' | 'sandbox' | 'rpc' | 'prediction' | 'crypto';
export type WorkflowRole = 'find' | 'understand' | 'act';

export type WorkflowBoundary =
  | Readonly<{ pillar: 'search'; citationIds: readonly string[]; resultIds: readonly string[]; degraded: boolean }>
  | Readonly<{ pillar: 'ai'; requestedModel: string; exactModelId: string; providerId: string; routeDecisionHash: string; groundedCitationIds: readonly string[]; groundedEvidenceRefs: readonly string[]; degraded: boolean }>
  | Readonly<{ pillar: 'sandbox'; imageDigest: string; isolationQualified: boolean; networkDefaultDenied: boolean; cleanedUp: boolean; degraded: boolean }>
  | Readonly<{ pillar: 'rpc'; chainId: string; policyHash: string; sideEffecting: boolean; quorum: number; degraded: boolean }>
  | Readonly<{ pillar: 'prediction'; evidenceRefs: readonly string[]; resolutionSourceUrls: readonly string[]; freshness: 'fresh' | 'stale' | 'mixed'; degraded: boolean }>
  | Readonly<{ pillar: 'crypto'; evidenceRefs: readonly string[]; coverage: readonly string[]; conflictCount: number; freshness: 'fresh' | 'stale' | 'mixed'; degraded: boolean }>;

export interface WorkflowStepDefinition {
  stepId: string;
  role: WorkflowRole;
  pillar: WorkflowPillar;
  productId: string;
  maximumSupplierCostMicrousd: number;
}

export interface WorkflowDefinition {
  workflowId: string;
  version: string;
  steps: readonly Readonly<WorkflowStepDefinition>[];
}

export interface WorkflowStepExecution {
  quote: Readonly<Quote>;
  receipt: Readonly<OperationReceipt>;
  boundary: WorkflowBoundary;
}

export interface WorkflowExecutor {
  execute(input: Readonly<{
    workflowId: string;
    workflowOperationId: string;
    step: Readonly<WorkflowStepDefinition>;
    stepOperationId: string;
    stepRequestHash: string;
    priorBoundaries: readonly WorkflowBoundary[];
    signal?: AbortSignal;
  }>): Promise<Readonly<WorkflowStepExecution>>;
}

export interface WorkflowResult {
  workflowId: string;
  version: string;
  workflowOperationId: string;
  requestHash: string;
  state: 'completed' | 'degraded';
  replayed: boolean;
  totalSupplierCostMicrousd: number;
  steps: readonly Readonly<{ stepId: string; operationId: string; resultHash: string; receiptHash: string; boundary: WorkflowBoundary }>[];
  resultHash: string;
}

function validateDefinition(value: Readonly<WorkflowDefinition>): void {
  if (!/^workflow\.[a-z0-9][a-z0-9._-]{2,95}$/u.test(value.workflowId) || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[1-9][0-9]*$/u.test(value.version)
    || value.steps.length < 3 || value.steps.length > 16 || new Set(value.steps.map(({ stepId }) => stepId)).size !== value.steps.length) throw new TypeError('workflow_definition_invalid');
  const roles = value.steps.map(({ role }) => role);
  if (roles[0] !== 'find' || !roles.includes('understand') || roles.at(-1) !== 'act') throw new TypeError('workflow_role_order_invalid');
  let rank = 0;
  for (const step of value.steps) {
    const next = ['find', 'understand', 'act'].indexOf(step.role);
    if (next < rank) throw new TypeError('workflow_role_order_invalid');
    rank = next;
    if (!/^[a-z][a-z0-9_]{2,63}$/u.test(step.stepId) || !['search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto'].includes(step.pillar)
      || !step.productId.startsWith(`${step.pillar === 'crypto' ? 'crypto' : step.pillar}.`)
      || !Number.isSafeInteger(step.maximumSupplierCostMicrousd) || step.maximumSupplierCostMicrousd < 0 || step.maximumSupplierCostMicrousd > 1_000_000_000) throw new TypeError('workflow_step_invalid');
  }
}

function amount(value: Readonly<{ asset: string; amountAtomic: string; decimals: number }>): bigint {
  if (value.asset !== 'USD' || value.decimals !== 6 || !/^(?:0|[1-9][0-9]{0,15})$/u.test(value.amountAtomic)) throw new TypeError('workflow_amount_invalid');
  return BigInt(value.amountAtomic);
}

function nonemptyUnique(values: readonly string[], pattern: RegExp, code: string): void {
  if (values.length < 1 || values.length > 10_000 || new Set(values).size !== values.length || values.some((value) => !pattern.test(value))) throw new TypeError(code);
}

function validateBoundary(step: Readonly<WorkflowStepDefinition>, boundary: WorkflowBoundary, knownCitationIds: ReadonlySet<string>, knownEvidenceRefs: ReadonlySet<string>): void {
  if (boundary.pillar !== step.pillar) throw new Error('workflow_boundary_pillar_mismatch');
  if (boundary.pillar === 'search') {
    nonemptyUnique(boundary.citationIds, /^cite_[A-Za-z0-9]{20,64}$/u, 'workflow_search_citations_invalid');
    nonemptyUnique(boundary.resultIds, /^sr_[A-Za-z0-9]{20,64}$/u, 'workflow_search_results_invalid');
  } else if (boundary.pillar === 'ai') {
    if (boundary.requestedModel.length < 1 || boundary.requestedModel.length > 160 || boundary.exactModelId.length < 1 || boundary.exactModelId.length > 160
      || !/^provider\.[a-z0-9_]+$/u.test(boundary.providerId) || !/^sha256:[a-f0-9]{64}$/u.test(boundary.routeDecisionHash)
      || knownCitationIds.size > 0 && (boundary.groundedCitationIds.length < 1 || boundary.groundedCitationIds.some((id) => !knownCitationIds.has(id)))
      || knownEvidenceRefs.size > 0 && (boundary.groundedEvidenceRefs.length < 1 || boundary.groundedEvidenceRefs.some((id) => !knownEvidenceRefs.has(id)))
      || new Set(boundary.groundedCitationIds).size !== boundary.groundedCitationIds.length
      || new Set(boundary.groundedEvidenceRefs).size !== boundary.groundedEvidenceRefs.length) throw new Error('workflow_ai_identity_or_grounding_invalid');
  } else if (boundary.pillar === 'sandbox') {
    if (!/^sha256:[a-f0-9]{64}$/u.test(boundary.imageDigest) || !boundary.isolationQualified || !boundary.networkDefaultDenied || !boundary.cleanedUp) throw new Error('workflow_sandbox_boundary_invalid');
  } else if (boundary.pillar === 'rpc') {
    if (!/^(?:eip155:[1-9][0-9]{0,9}|solana:[A-Za-z0-9]{8,64})$/u.test(boundary.chainId) || !/^sha256:[a-f0-9]{64}$/u.test(boundary.policyHash)
      || boundary.sideEffecting || ![1, 2, 3].includes(boundary.quorum)) throw new Error('workflow_rpc_boundary_invalid');
  } else if (boundary.pillar === 'prediction') {
    nonemptyUnique(boundary.evidenceRefs, /^evidence_[a-f0-9]{32}$/u, 'workflow_prediction_evidence_invalid');
    nonemptyUnique(boundary.resolutionSourceUrls, /^https:\/\//u, 'workflow_prediction_resolution_invalid');
    if (!['fresh', 'stale', 'mixed'].includes(boundary.freshness)) throw new Error('workflow_prediction_freshness_invalid');
  } else {
    nonemptyUnique(boundary.evidenceRefs, /^evidence_[a-f0-9]{32}$/u, 'workflow_crypto_evidence_invalid');
    nonemptyUnique(boundary.coverage, /^[a-z][a-z0-9_]{2,63}$/u, 'workflow_crypto_coverage_invalid');
    if (!Number.isSafeInteger(boundary.conflictCount) || boundary.conflictCount < 0 || boundary.conflictCount > 10_000 || !['fresh', 'stale', 'mixed'].includes(boundary.freshness)) throw new Error('workflow_crypto_state_invalid');
  }
}

export class InMemoryWorkflowEngine {
  readonly #definitions: ReadonlyMap<string, Readonly<WorkflowDefinition>>;
  readonly #executor: WorkflowExecutor;
  readonly #results = new Map<string, Readonly<WorkflowResult>>();

  constructor(definitions: readonly Readonly<WorkflowDefinition>[], executor: WorkflowExecutor) {
    if (definitions.length < 1 || definitions.length > 100 || new Set(definitions.map(({ workflowId }) => workflowId)).size !== definitions.length) throw new TypeError('workflow_engine_config_invalid');
    for (const definition of definitions) validateDefinition(definition);
    this.#definitions = new Map(definitions.map((definition) => [definition.workflowId, Object.freeze({ ...definition, steps: Object.freeze([...definition.steps]) })]));
    this.#executor = executor;
  }

  async execute(input: Readonly<{
    workflowId: string;
    workflowOperationId: string;
    idempotencyKey: string;
    request: JsonValue;
    deadlineAt: string;
    maximumTotalSupplierCostMicrousd: number;
    signal?: AbortSignal;
  }>): Promise<Readonly<WorkflowResult>> {
    const definition = this.#definitions.get(input.workflowId);
    if (definition === undefined || !/^op_[A-Za-z0-9]{20,64}$/u.test(input.workflowOperationId) || !/^idem_[A-Za-z0-9]{20,64}$/u.test(input.idempotencyKey)
      || !Number.isFinite(Date.parse(input.deadlineAt)) || !Number.isSafeInteger(input.maximumTotalSupplierCostMicrousd) || input.maximumTotalSupplierCostMicrousd < 0) throw new TypeError('workflow_request_invalid');
    const requestHash = hashJson({ workflowId: input.workflowId, version: definition.version, request: input.request } as JsonValue);
    const stored = this.#results.get(input.idempotencyKey);
    if (stored !== undefined) {
      if (stored.requestHash !== requestHash || stored.workflowOperationId !== input.workflowOperationId) throw new Error('workflow_idempotency_conflict');
      return Object.freeze({ ...stored, replayed: true });
    }
    if (input.signal?.aborted) throw new Error('workflow_cancelled');
    if (Date.now() >= Date.parse(input.deadlineAt)) throw new Error('workflow_deadline_exceeded');
    const boundaries: WorkflowBoundary[] = [];
    const steps: WorkflowResult['steps'][number][] = [];
    const citationIds = new Set<string>();
    const evidenceRefs = new Set<string>();
    let totalSupplierCost = 0n;
    let degraded = false;
    for (const step of definition.steps) {
      if (input.signal?.aborted) throw new Error('workflow_cancelled');
      const stepOperationId = `op_${hashJson({ workflowOperationId: input.workflowOperationId, stepId: step.stepId } as JsonValue).slice(7)}`;
      const stepRequestHash = hashJson({ workflowRequestHash: requestHash, stepId: step.stepId, priorResultHashes: steps.map(({ resultHash }) => resultHash) } as JsonValue);
      const execution = await this.#executor.execute({ workflowId: definition.workflowId, workflowOperationId: input.workflowOperationId, step, stepOperationId, stepRequestHash, priorBoundaries: Object.freeze([...boundaries]), ...(input.signal === undefined ? {} : { signal: input.signal }) });
      if (!verifyQuote(execution.quote) || execution.quote.operationId !== stepOperationId || execution.quote.productId !== step.productId || execution.quote.requestHash !== stepRequestHash) throw new Error('workflow_quote_binding_invalid');
      if (!verifyReceipt(execution.receipt) || execution.receipt.operationId !== stepOperationId || execution.receipt.productId !== step.productId || execution.receipt.requestHash !== stepRequestHash
        || execution.receipt.quoteId !== execution.quote.quoteId || execution.receipt.quoteHash !== execution.quote.quoteHash
        || execution.receipt.settlement.status !== 'not_required') throw new Error('workflow_receipt_binding_invalid');
      const customerCharge = amount(execution.receipt.customerCharge);
      const quoteCeiling = amount(execution.quote.maximumCharge);
      const supplierCost = amount(execution.receipt.supplierCost);
      if (customerCharge > quoteCeiling || supplierCost > BigInt(step.maximumSupplierCostMicrousd)) throw new Error('workflow_cost_ceiling_exceeded');
      totalSupplierCost += supplierCost;
      if (totalSupplierCost > BigInt(input.maximumTotalSupplierCostMicrousd)) throw new Error('workflow_total_cost_ceiling_exceeded');
      validateBoundary(step, execution.boundary, citationIds, evidenceRefs);
      if (execution.boundary.pillar === 'search') for (const id of execution.boundary.citationIds) citationIds.add(id);
      if (execution.boundary.pillar === 'prediction' || execution.boundary.pillar === 'crypto') for (const id of execution.boundary.evidenceRefs) evidenceRefs.add(id);
      if (execution.boundary.degraded) degraded = true;
      boundaries.push(execution.boundary);
      steps.push(Object.freeze({ stepId: step.stepId, operationId: stepOperationId, resultHash: execution.receipt.resultHash, receiptHash: execution.receipt.receiptHash, boundary: execution.boundary }));
    }
    const unsigned = {
      workflowId: definition.workflowId,
      version: definition.version,
      workflowOperationId: input.workflowOperationId,
      requestHash,
      state: degraded ? 'degraded' as const : 'completed' as const,
      replayed: false,
      totalSupplierCostMicrousd: Number(totalSupplierCost),
      steps: Object.freeze(steps),
    };
    const result = Object.freeze({ ...unsigned, resultHash: hashJson(unsigned as unknown as JsonValue) });
    this.#results.set(input.idempotencyKey, result);
    return result;
  }
}

export const PRIVATE_WORKFLOW_DEFINITIONS: readonly Readonly<WorkflowDefinition>[] = Object.freeze([
  Object.freeze({
    workflowId: 'workflow.web_research_execute',
    version: '2026-08-02.1',
    steps: Object.freeze([
      Object.freeze({ stepId: 'find_web_evidence', role: 'find', pillar: 'search', productId: 'search.web', maximumSupplierCostMicrousd: 5_000 }),
      Object.freeze({ stepId: 'understand_with_exact_model', role: 'understand', pillar: 'ai', productId: 'ai.chat', maximumSupplierCostMicrousd: 100_000 }),
      Object.freeze({ stepId: 'act_in_isolated_sandbox', role: 'act', pillar: 'sandbox', productId: 'sandbox.run', maximumSupplierCostMicrousd: 100_000 }),
    ]),
  }),
  Object.freeze({
    workflowId: 'workflow.prediction_investigate',
    version: '2026-08-02.1',
    steps: Object.freeze([
      Object.freeze({ stepId: 'find_market_evidence', role: 'find', pillar: 'prediction', productId: 'prediction.compare', maximumSupplierCostMicrousd: 5_000 }),
      Object.freeze({ stepId: 'understand_market_evidence', role: 'understand', pillar: 'ai', productId: 'ai.chat', maximumSupplierCostMicrousd: 100_000 }),
      Object.freeze({ stepId: 'act_in_isolated_sandbox', role: 'act', pillar: 'sandbox', productId: 'sandbox.run', maximumSupplierCostMicrousd: 100_000 }),
    ]),
  }),
  Object.freeze({
    workflowId: 'workflow.wallet_explain_verify',
    version: '2026-08-02.1',
    steps: Object.freeze([
      Object.freeze({ stepId: 'find_wallet_evidence', role: 'find', pillar: 'crypto', productId: 'crypto.wallet', maximumSupplierCostMicrousd: 5_000 }),
      Object.freeze({ stepId: 'understand_wallet_evidence', role: 'understand', pillar: 'ai', productId: 'ai.chat', maximumSupplierCostMicrousd: 100_000 }),
      Object.freeze({ stepId: 'act_with_read_only_rpc', role: 'act', pillar: 'rpc', productId: 'rpc.call', maximumSupplierCostMicrousd: 5_000 }),
    ]),
  }),
]);
