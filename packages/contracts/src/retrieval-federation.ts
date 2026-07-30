import type { JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';
import type { RetrievalPathAssessment, RetrievalPathDecision, RetrievalQualificationSnapshot } from './retrieval.js';
import { createRetrievalQualificationSnapshot } from './retrieval.js';
import { hashJson } from './receipt.js';
import { hashQueryRewritePlan, validateQueryRewritePlan, type QueryRewritePlan } from './query-rewrite.js';
import { normalizeSearchLocaleOptions } from './search-locale.js';

export const federationAttemptOutcomes = ['succeeded', 'failed', 'deadline_exceeded', 'cancelled'] as const;
export const federationFailureCodes = ['adapter_failed', 'invalid_adapter_response', 'deadline_exceeded', 'caller_cancelled'] as const;

export type FederationAttemptOutcome = typeof federationAttemptOutcomes[number];
export type FederationFailureCode = typeof federationFailureCodes[number];

export interface RetrievalQueryExecution {
  pathId: string;
  providerId: string;
  failureDomain: string;
  role: 'primary' | 'fallback';
  mechanism: 'provider_api' | 'public_archive';
  rewriteVariantId: 'identity' | 'exact_phrase';
  query: string;
  language: string;
  region: string;
}

export interface RetrievalQueryPlan {
  contractVersion: typeof CONTRACT_VERSION;
  planId: string;
  operationId: string;
  query: string;
  language: string;
  region: string;
  createdAt: string;
  deadlineAt: string;
  qualificationId: string;
  qualificationSha256: string;
  rewriteId: string;
  rewriteSha256: string;
  rewrite: Readonly<QueryRewritePlan>;
  executions: readonly Readonly<RetrievalQueryExecution>[];
}

export interface CreateRetrievalQueryPlanInput {
  planId: string;
  operationId: string;
  rewrite: QueryRewritePlan;
  createdAt: string;
  deadlineAt: string;
  qualification: RetrievalQualificationSnapshot;
  language?: string;
  region?: string;
}

export interface RetrievalFederationCandidateInput {
  url: string;
  title: string;
  snippet: string;
  retrievedAt: string;
}

export interface RetrievalFederationAdapterResponse {
  rawResponse: JsonValue;
  candidates: readonly RetrievalFederationCandidateInput[];
}

export interface RetrievalFederationAdapterRequest {
  planId: string;
  operationId: string;
  path: Readonly<RetrievalQueryExecution>;
  deadlineAt: string;
  signal: AbortSignal;
}

export interface RetrievalFederationAdapter {
  execute(request: RetrievalFederationAdapterRequest): Promise<RetrievalFederationAdapterResponse>;
}

export interface RetrievalFederationCandidate extends RetrievalFederationCandidateInput {
  observationId: string;
  pathId: string;
  providerId: string;
  sourceOrdinal: number;
  rawResponseSha256: string;
}

export interface RetrievalFederationAttempt {
  pathId: string;
  providerId: string;
  role: 'primary' | 'fallback';
  startedAt: string;
  completedAt: string;
  outcome: FederationAttemptOutcome;
  failureCode?: FederationFailureCode;
  candidateCount: number;
  rawResponseSha256?: string;
}

export interface RetrievalFederationReport {
  contractVersion: typeof CONTRACT_VERSION;
  federationId: string;
  planId: string;
  operationId: string;
  query: string;
  language: string;
  region: string;
  deadlineAt: string;
  qualificationId: string;
  qualificationSha256: string;
  rewriteId: string;
  rewriteSha256: string;
  outcome: 'complete' | 'partial' | 'failed' | 'cancelled';
  attempts: readonly Readonly<RetrievalFederationAttempt>[];
  candidates: readonly Readonly<RetrievalFederationCandidate>[];
}

export interface RunRetrievalFederationInput {
  federationId: string;
  plan: RetrievalQueryPlan;
  qualification: RetrievalQualificationSnapshot;
  adapters: Readonly<Record<string, RetrievalFederationAdapter>>;
  signal?: AbortSignal;
  now?: () => string;
}

interface AttemptResult {
  attempt: Readonly<RetrievalFederationAttempt>;
  candidates: readonly Readonly<RetrievalFederationCandidate>[];
}

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid_${name}`);
  return parsed;
}

function text(value: string, name: string, maximum: number): string {
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (normalized.length === 0 || normalized.length > maximum || /[\u0000-\u001F\u007F]/u.test(normalized)) throw new Error(`invalid_${name}`);
  return normalized;
}

function assessment(path: RetrievalPathDecision): RetrievalPathAssessment {
  return {
    pathId: path.pathId,
    providerId: path.providerId,
    failureDomain: path.failureDomain,
    role: path.role,
    mechanism: path.mechanism,
    selected: path.selected,
    checkedAt: path.checkedAt,
    expiresAt: path.expiresAt,
    termsStatus: path.termsStatus,
    allowedContentUse: path.allowedContentUse,
    restrictionsAcknowledged: path.restrictionsAcknowledged,
    checks: path.checks,
  };
}

function validateQualification(snapshot: RetrievalQualificationSnapshot, at: string): Readonly<RetrievalQualificationSnapshot> {
  if (snapshot.contractVersion !== CONTRACT_VERSION) throw new Error('invalid_federation_qualification_version');
  const atMs = timestamp(at, 'federation_qualification_at');
  const rebuilt = createRetrievalQualificationSnapshot(snapshot.qualificationId, snapshot.evaluatedAt, snapshot.paths.map(assessment));
  if (!rebuilt.twoPathGatePassed) throw new Error('federation_qualification_gate_closed');
  if (rebuilt.paths.some((path) => Date.parse(path.expiresAt) <= atMs)) throw new Error('federation_qualification_gate_closed');
  return rebuilt;
}

function qualificationHash(snapshot: RetrievalQualificationSnapshot): string {
  return hashJson(snapshot as unknown as JsonValue);
}

export function createRetrievalQueryPlan(input: CreateRetrievalQueryPlanInput): Readonly<RetrievalQueryPlan> {
  if (!/^plan_[A-Za-z0-9]{20,64}$/u.test(input.planId)) throw new Error('invalid_federation_plan_id');
  if (!/^op_[A-Za-z0-9]{20,64}$/u.test(input.operationId)) throw new Error('invalid_federation_operation_id');
  const rewrite = validateQueryRewritePlan(input.rewrite);
  if (rewrite.operationId !== input.operationId || rewrite.createdAt !== input.createdAt) throw new Error('federation_rewrite_binding_invalid');
  const query = text(rewrite.normalizedQuery, 'federation_query', 2_000);
  const locale = normalizeSearchLocaleOptions(input);
  const createdAt = timestamp(input.createdAt, 'federation_created_at');
  const deadlineAt = timestamp(input.deadlineAt, 'federation_deadline_at');
  if (deadlineAt <= createdAt || deadlineAt - createdAt > 30_000) throw new Error('invalid_federation_deadline_window');
  const qualification = validateQualification(input.qualification, input.createdAt);
  const paths = [...qualification.paths].sort((left, right) => (left.role === right.role ? left.pathId.localeCompare(right.pathId) : left.role === 'primary' ? -1 : 1));
  const executions = paths.map((path) => {
    const variant = rewrite.variants[path.role === 'primary' ? 0 : 1];
    if (variant === undefined) throw new Error('invalid_federation_rewrite');
    return Object.freeze({
      pathId: path.pathId,
      providerId: path.providerId,
      failureDomain: path.failureDomain,
      role: path.role,
      mechanism: path.mechanism,
      rewriteVariantId: variant.variantId,
      query: variant.query,
      ...locale,
    });
  });
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    planId: input.planId,
    operationId: input.operationId,
    query,
    ...locale,
    createdAt: input.createdAt,
    deadlineAt: input.deadlineAt,
    qualificationId: qualification.qualificationId,
    qualificationSha256: qualificationHash(qualification),
    rewriteId: rewrite.rewriteId,
    rewriteSha256: hashQueryRewritePlan(rewrite),
    rewrite,
    executions: Object.freeze(executions),
  });
}

function validatePlan(plan: RetrievalQueryPlan): void {
  if (plan.contractVersion !== CONTRACT_VERSION) throw new Error('invalid_federation_plan_version');
  if (!/^plan_[A-Za-z0-9]{20,64}$/u.test(plan.planId) || !/^op_[A-Za-z0-9]{20,64}$/u.test(plan.operationId)) throw new Error('invalid_federation_plan');
  if (!/^rqual_[A-Za-z0-9]{20,64}$/u.test(plan.qualificationId) || !/^sha256:[a-f0-9]{64}$/u.test(plan.qualificationSha256)) throw new Error('invalid_federation_qualification_hash');
  if (!/^rewrite_[A-Za-z0-9]{20,64}$/u.test(plan.rewriteId) || !/^sha256:[a-f0-9]{64}$/u.test(plan.rewriteSha256)) throw new Error('invalid_federation_rewrite_hash');
  const rewrite = validateQueryRewritePlan(plan.rewrite);
  if (rewrite.rewriteId !== plan.rewriteId || rewrite.operationId !== plan.operationId || rewrite.createdAt !== plan.createdAt
    || rewrite.normalizedQuery !== plan.query || hashQueryRewritePlan(rewrite) !== plan.rewriteSha256) throw new Error('invalid_federation_rewrite_hash');
  const locale = normalizeSearchLocaleOptions(plan);
  if (locale.language !== plan.language || locale.region !== plan.region) throw new Error('invalid_federation_locale');
  if (text(plan.query, 'federation_query', 2_000) !== plan.query) throw new Error('invalid_federation_plan');
  const createdAt = timestamp(plan.createdAt, 'federation_created_at');
  const deadlineAt = timestamp(plan.deadlineAt, 'federation_deadline_at');
  if (deadlineAt <= createdAt || deadlineAt - createdAt > 30_000 || plan.executions.length !== 2) throw new Error('invalid_federation_plan');
  if (new Set(plan.executions.map((execution) => execution.pathId)).size !== 2 || new Set(plan.executions.map((execution) => execution.failureDomain)).size !== 2) throw new Error('invalid_federation_plan');
  if (plan.executions[0]?.role !== 'primary' || plan.executions[0]?.rewriteVariantId !== 'identity' || plan.executions[0]?.query !== rewrite.variants[0]?.query
    || plan.executions[1]?.role !== 'fallback' || plan.executions[1]?.rewriteVariantId !== 'exact_phrase' || plan.executions[1]?.query !== rewrite.variants[1]?.query) throw new Error('invalid_federation_plan');
  for (const execution of plan.executions) {
    if (!/^retrieval_[a-z0-9][a-z0-9._-]{2,63}$/u.test(execution.pathId)
      || !/^provider_[a-z0-9][a-z0-9._-]{2,63}$/u.test(execution.providerId)
      || !/^[a-z0-9][a-z0-9._-]{2,63}$/u.test(execution.failureDomain)
      || !['provider_api', 'public_archive'].includes(execution.mechanism)
      || text(execution.query, 'federation_execution_query', 2_000) !== execution.query
      || execution.language !== plan.language || execution.region !== plan.region) throw new Error('invalid_federation_plan');
  }
}

function validCandidate(candidate: RetrievalFederationCandidateInput, deadlineAt: number): RetrievalFederationCandidateInput {
  let url: URL;
  try { url = new URL(candidate.url); } catch { throw new Error('invalid_adapter_response'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') throw new Error('invalid_adapter_response');
  const title = text(candidate.title, 'federation_candidate_title', 500);
  const snippet = text(candidate.snippet, 'federation_candidate_snippet', 5_000);
  if (timestamp(candidate.retrievedAt, 'federation_candidate_retrieved_at') > deadlineAt) throw new Error('invalid_adapter_response');
  return { url: candidate.url, title, snippet, retrievedAt: candidate.retrievedAt };
}

function completedAt(now: () => string, deadlineAt: string): string {
  const value = now();
  return timestamp(value, 'federation_now') > Date.parse(deadlineAt) ? deadlineAt : value;
}

async function runAttempt(
  execution: Readonly<RetrievalQueryExecution>,
  input: RunRetrievalFederationInput,
  startedAt: string,
  now: () => string,
): Promise<AttemptResult> {
  const controller = new AbortController();
  const adapter = input.adapters[execution.pathId];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbort: (() => void) | undefined;
  const terminal = new Promise<'deadline_exceeded' | 'cancelled'>((resolve) => {
    const remaining = Math.max(0, Date.parse(input.plan.deadlineAt) - Date.parse(now()));
    timer = setTimeout(() => { controller.abort(); resolve('deadline_exceeded'); }, remaining);
    const cancel = (): void => { controller.abort(); resolve('cancelled'); };
    input.signal?.addEventListener('abort', cancel, { once: true });
    removeAbort = (): void => input.signal?.removeEventListener('abort', cancel);
  });
  const executionPromise = adapter === undefined
    ? Promise.resolve({ kind: 'failed' as const, code: 'adapter_failed' as const })
    : Promise.resolve().then(() => adapter.execute({ planId: input.plan.planId, operationId: input.plan.operationId, path: execution, deadlineAt: input.plan.deadlineAt, signal: controller.signal }))
      .then((response) => ({ kind: 'response' as const, response }), () => ({ kind: 'failed' as const, code: 'adapter_failed' as const }));
  const settled = await Promise.race([
    executionPromise,
    terminal.then((kind) => kind === 'cancelled' ? ({ kind: 'cancelled' as const }) : ({ kind: 'deadline_exceeded' as const })),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  removeAbort?.();
  const end = completedAt(now, input.plan.deadlineAt);
  if (settled.kind === 'deadline_exceeded' || settled.kind === 'cancelled') {
    return {
      attempt: Object.freeze({ pathId: execution.pathId, providerId: execution.providerId, role: execution.role, startedAt, completedAt: end, outcome: settled.kind, failureCode: settled.kind === 'cancelled' ? 'caller_cancelled' : 'deadline_exceeded', candidateCount: 0 }),
      candidates: Object.freeze([]),
    };
  }
  if (settled.kind === 'failed') {
    return { attempt: Object.freeze({ pathId: execution.pathId, providerId: execution.providerId, role: execution.role, startedAt, completedAt: end, outcome: 'failed', failureCode: settled.code, candidateCount: 0 }), candidates: Object.freeze([]) };
  }
  try {
    if (!Array.isArray(settled.response.candidates) || settled.response.candidates.length > 100) throw new Error('invalid_adapter_response');
    const rawResponseSha256 = hashJson(settled.response.rawResponse);
    const candidates = settled.response.candidates.map((candidate, index) => Object.freeze({
      ...validCandidate(candidate, Date.parse(input.plan.deadlineAt)),
      observationId: `obs_${input.federationId.slice(4)}_${String(index + 1).padStart(3, '0')}_${execution.role}`,
      pathId: execution.pathId,
      providerId: execution.providerId,
      sourceOrdinal: index + 1,
      rawResponseSha256,
    }));
    return {
      attempt: Object.freeze({ pathId: execution.pathId, providerId: execution.providerId, role: execution.role, startedAt, completedAt: end, outcome: 'succeeded', candidateCount: candidates.length, rawResponseSha256 }),
      candidates: Object.freeze(candidates),
    };
  } catch {
    return { attempt: Object.freeze({ pathId: execution.pathId, providerId: execution.providerId, role: execution.role, startedAt, completedAt: end, outcome: 'failed', failureCode: 'invalid_adapter_response', candidateCount: 0 }), candidates: Object.freeze([]) };
  }
}

export async function runRetrievalFederation(input: RunRetrievalFederationInput): Promise<Readonly<RetrievalFederationReport>> {
  if (!/^fed_[A-Za-z0-9]{20,64}$/u.test(input.federationId)) throw new Error('invalid_federation_id');
  validatePlan(input.plan);
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const startMs = timestamp(startedAt, 'federation_now');
  const qualification = validateQualification(input.qualification, startedAt);
  if (qualification.qualificationId !== input.plan.qualificationId || qualificationHash(qualification) !== input.plan.qualificationSha256) throw new Error('federation_qualification_mismatch');
  const deadlineElapsed = startMs >= Date.parse(input.plan.deadlineAt);
  const preCancelled = input.signal?.aborted === true;
  const results: readonly AttemptResult[] = deadlineElapsed
    ? input.plan.executions.map((execution): AttemptResult => ({ attempt: Object.freeze({ pathId: execution.pathId, providerId: execution.providerId, role: execution.role, startedAt: input.plan.deadlineAt, completedAt: input.plan.deadlineAt, outcome: 'deadline_exceeded', failureCode: 'deadline_exceeded', candidateCount: 0 }), candidates: Object.freeze([]) }))
    : preCancelled
    ? input.plan.executions.map((execution): AttemptResult => ({ attempt: Object.freeze({ pathId: execution.pathId, providerId: execution.providerId, role: execution.role, startedAt, completedAt: startedAt, outcome: 'cancelled', failureCode: 'caller_cancelled', candidateCount: 0 }), candidates: Object.freeze([]) }))
    : await Promise.all(input.plan.executions.map((execution) => runAttempt(execution, input, startedAt, now)));
  const attempts = Object.freeze(results.map((result) => result.attempt));
  const candidates = Object.freeze(results.flatMap((result) => result.candidates));
  const succeeded = attempts.filter((attempt) => attempt.outcome === 'succeeded').length;
  const outcome = succeeded === 2 ? 'complete' : succeeded === 1 ? 'partial' : attempts.some((attempt) => attempt.outcome === 'cancelled') ? 'cancelled' : 'failed';
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    federationId: input.federationId,
    planId: input.plan.planId,
    operationId: input.plan.operationId,
    query: input.plan.query,
    language: input.plan.language,
    region: input.plan.region,
    deadlineAt: input.plan.deadlineAt,
    qualificationId: input.plan.qualificationId,
    qualificationSha256: input.plan.qualificationSha256,
    rewriteId: input.plan.rewriteId,
    rewriteSha256: input.plan.rewriteSha256,
    outcome,
    attempts,
    candidates,
  });
}