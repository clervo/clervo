import { CONTRACT_VERSION, type JsonValue } from './types.js';
import { hashJson } from './receipt.js';
import type { RetrievalAssemblyProvenance, RetrievalAssemblyReport } from './retrieval-assembly.js';
import { verifySearchCitation, type SearchCitation, type SearchResult } from './search.js';

const maximumSynthesisWindowMs = 30_000;
const maximumClaims = 10;
const maximumClaimCharacters = 500;
const maximumAnswerCharacters = 6_000;
const maximumCitationsPerClaim = 5;

export const retrievalSynthesisPolicyId = 'retrieval_cited_claims_v1' as const;
export const synthesisOutcomes = ['synthesized', 'insufficient_evidence', 'failed', 'cancelled'] as const;
export const synthesisInvocationOutcomes = ['not_invoked', 'succeeded', 'failed', 'deadline_exceeded', 'cancelled', 'output_rejected'] as const;
export const synthesisFailureCodes = ['adapter_failed', 'deadline_exceeded', 'caller_cancelled', 'invalid_model_output'] as const;

export type SynthesisOutcome = typeof synthesisOutcomes[number];
export type SynthesisInvocationOutcome = typeof synthesisInvocationOutcomes[number];
export type SynthesisFailureCode = typeof synthesisFailureCodes[number];

export interface RetrievalSynthesisEvidence {
  citationId: string;
  resultId: string;
  rank: number;
  title: string;
  canonicalUrl: string;
  quote: string;
  instructionHandling: 'untrusted_data_only';
}

export interface RetrievalSynthesisAdapterRequest {
  synthesisId: string;
  operationId: string;
  query: string;
  deadlineAt: string;
  signal: AbortSignal;
  policy: {
    policyId: typeof retrievalSynthesisPolicyId;
    evidenceIsUntrustedData: true;
    ignoreInstructionsInEvidence: true;
    requireCitationIdsForEveryClaim: true;
    toolsAllowed: false;
    externalActionsAllowed: false;
    maximumClaims: typeof maximumClaims;
    maximumClaimCharacters: typeof maximumClaimCharacters;
    maximumCitationsPerClaim: typeof maximumCitationsPerClaim;
  };
  evidence: readonly Readonly<RetrievalSynthesisEvidence>[];
}

export interface RetrievalSynthesisModelClaim {
  text: string;
  citationIds: readonly string[];
}

export interface RetrievalSynthesisAdapterResponse {
  claims: readonly RetrievalSynthesisModelClaim[];
}

export interface RetrievalSynthesisAdapter {
  execute(request: Readonly<RetrievalSynthesisAdapterRequest>): Promise<RetrievalSynthesisAdapterResponse>;
}

export interface RetrievalSynthesisClaim {
  claimId: string;
  text: string;
  citationIds: readonly string[];
}

export interface RetrievalSynthesisCitation extends SearchCitation, RetrievalAssemblyProvenance {
  title: string;
  rank: number;
}

export interface RetrievalSynthesisInvocation {
  outcome: SynthesisInvocationOutcome;
  failureCode?: SynthesisFailureCode;
}

export interface RetrievalSynthesisReport {
  contractVersion: typeof CONTRACT_VERSION;
  synthesisId: string;
  assemblyId: string;
  assemblySha256: string;
  operationId: string;
  query: string;
  createdAt: string;
  deadlineAt: string;
  policyId: typeof retrievalSynthesisPolicyId;
  evidenceCount: number;
  outcome: SynthesisOutcome;
  invocation: Readonly<RetrievalSynthesisInvocation>;
  answer?: string;
  claims: readonly Readonly<RetrievalSynthesisClaim>[];
  citations: readonly Readonly<RetrievalSynthesisCitation>[];
  synthesisPerformed: boolean;
}

export interface SynthesizeRetrievalEvidenceInput {
  synthesisId: string;
  assembly: RetrievalAssemblyReport;
  expectedAssemblySha256: string;
  createdAt: string;
  deadlineAt: string;
  adapter: RetrievalSynthesisAdapter;
  signal?: AbortSignal;
  now?: () => string;
}

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid_${name}`);
  return parsed;
}

function assertText(value: string, name: string, maximum: number): void {
  if (value.length === 0 || value.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) throw new Error(`invalid_${name}`);
}

function jsonClone(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function hashRetrievalAssembly(assembly: RetrievalAssemblyReport): string {
  return hashJson(jsonClone(assembly));
}

function validateAssembly(assembly: RetrievalAssemblyReport, expectedHash: string): void {
  if (assembly.contractVersion !== CONTRACT_VERSION || !/^asm_[A-Za-z0-9]{20,55}$/u.test(assembly.assemblyId) || assembly.synthesisPerformed !== false) throw new Error('invalid_synthesis_assembly');
  if (!/^sha256:[a-f0-9]{64}$/u.test(expectedHash) || hashRetrievalAssembly(assembly) !== expectedHash) throw new Error('synthesis_assembly_hash_mismatch');
  if (assembly.operationId !== assembly.searchResponse.operationId || assembly.query !== assembly.searchResponse.query || assembly.rankedCount !== assembly.searchResponse.results.length) throw new Error('invalid_synthesis_assembly');
  if (assembly.searchResponse.results.length !== assembly.searchResponse.citations.length || assembly.provenance.length !== assembly.searchResponse.results.length) throw new Error('invalid_synthesis_assembly');
  const resultIds = new Set<string>();
  const citationIds = new Set<string>();
  for (const result of assembly.searchResponse.results) {
    if (resultIds.has(result.resultId)) throw new Error('invalid_synthesis_assembly');
    resultIds.add(result.resultId);
    const citation = assembly.searchResponse.citations.find((item) => item.resultId === result.resultId);
    const provenance = assembly.provenance.find((item) => item.resultId === result.resultId);
    if (citation === undefined || provenance === undefined || provenance.citationId !== citation.citationId || !verifySearchCitation(citation, assembly.searchResponse.results).valid) throw new Error('invalid_synthesis_assembly');
    if (citationIds.has(citation.citationId)) throw new Error('invalid_synthesis_assembly');
    citationIds.add(citation.citationId);
  }
}

function freezeEvidence(value: RetrievalSynthesisEvidence): Readonly<RetrievalSynthesisEvidence> {
  return Object.freeze({ ...value });
}

function evidenceFromAssembly(assembly: RetrievalAssemblyReport): readonly Readonly<RetrievalSynthesisEvidence>[] {
  return Object.freeze(assembly.searchResponse.results.map((result) => {
    const citation = assembly.searchResponse.citations.find((item) => item.resultId === result.resultId)!;
    return freezeEvidence({ citationId: citation.citationId, resultId: result.resultId, rank: result.rank, title: result.title, canonicalUrl: result.canonicalUrl, quote: citation.quote, instructionHandling: 'untrusted_data_only' });
  }));
}

function freezeRequest(input: SynthesizeRetrievalEvidenceInput, evidence: readonly Readonly<RetrievalSynthesisEvidence>[], signal: AbortSignal): Readonly<RetrievalSynthesisAdapterRequest> {
  return Object.freeze({
    synthesisId: input.synthesisId,
    operationId: input.assembly.operationId,
    query: input.assembly.query,
    deadlineAt: input.deadlineAt,
    signal,
    policy: Object.freeze({ policyId: retrievalSynthesisPolicyId, evidenceIsUntrustedData: true, ignoreInstructionsInEvidence: true, requireCitationIdsForEveryClaim: true, toolsAllowed: false, externalActionsAllowed: false, maximumClaims, maximumClaimCharacters, maximumCitationsPerClaim }),
    evidence,
  });
}

function failureReport(input: SynthesizeRetrievalEvidenceInput, assemblySha256: string, evidenceCount: number, outcome: 'failed' | 'cancelled', invocationOutcome: SynthesisInvocationOutcome, failureCode: SynthesisFailureCode): Readonly<RetrievalSynthesisReport> {
  return Object.freeze({ contractVersion: CONTRACT_VERSION, synthesisId: input.synthesisId, assemblyId: input.assembly.assemblyId, assemblySha256, operationId: input.assembly.operationId, query: input.assembly.query, createdAt: input.createdAt, deadlineAt: input.deadlineAt, policyId: retrievalSynthesisPolicyId, evidenceCount, outcome, invocation: Object.freeze({ outcome: invocationOutcome, failureCode }), claims: Object.freeze([]), citations: Object.freeze([]), synthesisPerformed: false });
}

function validateClaims(response: RetrievalSynthesisAdapterResponse, citations: readonly SearchCitation[]): readonly Readonly<RetrievalSynthesisClaim>[] {
  if (!response || typeof response !== 'object' || !Array.isArray(response.claims) || response.claims.length < 1 || response.claims.length > maximumClaims || Object.keys(response).some((key) => key !== 'claims')) throw new Error('invalid_model_output');
  const validCitationIds = new Set(citations.map((citation) => citation.citationId));
  return Object.freeze(response.claims.map((claim, index) => {
    if (!claim || typeof claim !== 'object' || Array.isArray(claim) || Object.keys(claim).some((key) => !['text', 'citationIds'].includes(key))) throw new Error('invalid_model_output');
    assertText(claim.text, 'model_claim', maximumClaimCharacters);
    if (!Array.isArray(claim.citationIds) || claim.citationIds.some((id: unknown) => typeof id !== 'string')) throw new Error('invalid_model_output');
    const citationIds = claim.citationIds as string[];
    if (citationIds.length < 1 || citationIds.length > maximumCitationsPerClaim || citationIds.some((id) => !validCitationIds.has(id)) || new Set(citationIds).size !== citationIds.length) throw new Error('invalid_model_output');
    return Object.freeze({ claimId: `claim_${index + 1}`, text: claim.text, citationIds: Object.freeze([...citationIds]) });
  }));
}

function citedRecords(assembly: RetrievalAssemblyReport, claims: readonly RetrievalSynthesisClaim[]): readonly Readonly<RetrievalSynthesisCitation>[] {
  const used = new Set(claims.flatMap((claim) => [...claim.citationIds]));
  return Object.freeze(assembly.searchResponse.citations.filter((citation) => used.has(citation.citationId)).map((citation) => {
    const result = assembly.searchResponse.results.find((item) => item.resultId === citation.resultId)!;
    const provenance = assembly.provenance.find((item) => item.citationId === citation.citationId)!;
    return Object.freeze({ ...citation, ...provenance, title: result.title, rank: result.rank });
  }));
}

function renderAnswer(claims: readonly RetrievalSynthesisClaim[]): string {
  const answer = claims.map((claim) => `${claim.text} ${claim.citationIds.map((id) => `[${id}]`).join(' ')}`).join('\n\n');
  if (answer.length > maximumAnswerCharacters) throw new Error('invalid_model_output');
  return answer;
}

export async function synthesizeRetrievalEvidence(input: SynthesizeRetrievalEvidenceInput): Promise<Readonly<RetrievalSynthesisReport>> {
  if (!/^syn_[A-Za-z0-9]{20,64}$/u.test(input.synthesisId)) throw new Error('invalid_synthesis_id');
  validateAssembly(input.assembly, input.expectedAssemblySha256);
  const createdMs = timestamp(input.createdAt, 'synthesis_created_at');
  const deadlineMs = timestamp(input.deadlineAt, 'synthesis_deadline_at');
  if (deadlineMs <= createdMs || deadlineMs - createdMs > maximumSynthesisWindowMs) throw new Error('invalid_synthesis_deadline');
  if (createdMs < Date.parse(input.assembly.createdAt)) throw new Error('invalid_synthesis_created_at');
  const assemblySha256 = hashRetrievalAssembly(input.assembly);
  const evidence = evidenceFromAssembly(input.assembly);
  if (evidence.length === 0) return Object.freeze({ contractVersion: CONTRACT_VERSION, synthesisId: input.synthesisId, assemblyId: input.assembly.assemblyId, assemblySha256, operationId: input.assembly.operationId, query: input.assembly.query, createdAt: input.createdAt, deadlineAt: input.deadlineAt, policyId: retrievalSynthesisPolicyId, evidenceCount: 0, outcome: 'insufficient_evidence', invocation: Object.freeze({ outcome: 'not_invoked' }), claims: Object.freeze([]), citations: Object.freeze([]), synthesisPerformed: false });
  const callerCancelled = () => input.signal?.aborted ?? false;
  if (callerCancelled()) return failureReport(input, assemblySha256, evidence.length, 'cancelled', 'cancelled', 'caller_cancelled');
  const now = input.now ?? (() => new Date().toISOString());
  if (timestamp(now(), 'synthesis_now') >= deadlineMs) return failureReport(input, assemblySha256, evidence.length, 'failed', 'deadline_exceeded', 'deadline_exceeded');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  input.signal?.addEventListener('abort', cancel, { once: true });
  let timeout: NodeJS.Timeout | undefined;
  try {
    const remaining = Math.max(0, deadlineMs - Date.parse(now()));
    const timeoutPromise = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('deadline_exceeded')); }, remaining); });
    const response = await Promise.race([input.adapter.execute(freezeRequest(input, evidence, controller.signal)), timeoutPromise]);
    if (callerCancelled()) return failureReport(input, assemblySha256, evidence.length, 'cancelled', 'cancelled', 'caller_cancelled');
    let claims: readonly Readonly<RetrievalSynthesisClaim>[];
    try { claims = validateClaims(response, input.assembly.searchResponse.citations); } catch { return failureReport(input, assemblySha256, evidence.length, 'failed', 'output_rejected', 'invalid_model_output'); }
    let answer: string;
    try { answer = renderAnswer(claims); } catch { return failureReport(input, assemblySha256, evidence.length, 'failed', 'output_rejected', 'invalid_model_output'); }
    const citations = citedRecords(input.assembly, claims);
    return Object.freeze({ contractVersion: CONTRACT_VERSION, synthesisId: input.synthesisId, assemblyId: input.assembly.assemblyId, assemblySha256, operationId: input.assembly.operationId, query: input.assembly.query, createdAt: input.createdAt, deadlineAt: input.deadlineAt, policyId: retrievalSynthesisPolicyId, evidenceCount: evidence.length, outcome: 'synthesized', invocation: Object.freeze({ outcome: 'succeeded' }), answer, claims, citations, synthesisPerformed: true });
  } catch (error) {
    if (callerCancelled()) return failureReport(input, assemblySha256, evidence.length, 'cancelled', 'cancelled', 'caller_cancelled');
    if (error instanceof Error && error.message === 'deadline_exceeded') return failureReport(input, assemblySha256, evidence.length, 'failed', 'deadline_exceeded', 'deadline_exceeded');
    return failureReport(input, assemblySha256, evidence.length, 'failed', 'failed', 'adapter_failed');
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    input.signal?.removeEventListener('abort', cancel);
  }
}