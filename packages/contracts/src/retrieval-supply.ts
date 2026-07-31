import { CONTRACT_VERSION } from './types.js';

export type SupplyQualificationStatus = 'passed' | 'failed' | 'blocked' | 'not_run';

export interface QualifiedSupplySource {
  sourceId: string;
  providerId: string;
  failureDomain: string;
  qualificationId: string;
  qualificationStatus: SupplyQualificationStatus;
  substitutionPolicy: 'exact';
}

export interface MetasearchBrokerAssessment {
  brokerId: string;
  deployment: 'self_hosted' | 'public_shared';
  selected: boolean;
  upstreams: readonly QualifiedSupplySource[];
}

export interface ArchiveSupplyAssessment extends QualifiedSupplySource {
  mechanism: 'public_archive';
  directAccess: boolean;
}

export interface ExtractionWorkerAssessment {
  workerId: string;
  selected: boolean;
  qualificationStatus: SupplyQualificationStatus;
  safetyBoundary: 'bounded_retrieval_adapter';
  deterministicFixturesPassed: boolean;
  timeoutEnforced: boolean;
  resourceLimitsEnforced: boolean;
  failureIsolationPassed: boolean;
  substitutionPolicy: 'exact';
}

export interface DeferredSupplyTool {
  toolId: string;
  disposition: 'deferred';
  coreDependency: false;
}

export interface RetrievalSupplyAssessment {
  decisionId: string;
  evaluatedAt: string;
  broker: MetasearchBrokerAssessment;
  archive: ArchiveSupplyAssessment;
  optionalAdapters: readonly QualifiedSupplySource[];
  extractionWorkers: readonly ExtractionWorkerAssessment[];
  deferredTools: readonly DeferredSupplyTool[];
}

export interface RetrievalSupplyDecision extends RetrievalSupplyAssessment {
  contractVersion: typeof CONTRACT_VERSION;
  brokerReady: boolean;
  archiveIndependent: boolean;
  selectedExtractionWorkerId?: string;
  readySearchSupply: boolean;
  failureCodes: readonly string[];
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function freezeSource(source: QualifiedSupplySource): Readonly<QualifiedSupplySource> {
  if (source.substitutionPolicy !== 'exact') throw new Error('supply_source_substitution_must_be_exact');
  return Object.freeze({ ...source });
}

export function createRetrievalSupplyDecision(assessment: RetrievalSupplyAssessment): Readonly<RetrievalSupplyDecision> {
  if (!/^rsupply_[A-Za-z0-9]{20,64}$/u.test(assessment.decisionId)) throw new Error('invalid_retrieval_supply_decision_id');
  if (!Number.isFinite(Date.parse(assessment.evaluatedAt)) || new Date(Date.parse(assessment.evaluatedAt)).toISOString() !== assessment.evaluatedAt) throw new Error('invalid_retrieval_supply_evaluated_at');
  if (assessment.extractionWorkers.length !== 1) throw new Error('retrieval_supply_requires_exactly_one_extraction_worker');
  if (!unique(assessment.broker.upstreams.map((source) => source.sourceId))) throw new Error('duplicate_metasearch_upstream_source');
  if (!unique(assessment.broker.upstreams.map((source) => source.providerId))) throw new Error('duplicate_metasearch_upstream_provider');
  if (!unique(assessment.optionalAdapters.map((source) => source.sourceId))) throw new Error('duplicate_optional_adapter_source');
  if (!unique(assessment.deferredTools.map((tool) => tool.toolId))) throw new Error('duplicate_deferred_tool');
  if (assessment.deferredTools.some((tool) => tool.disposition !== 'deferred' || tool.coreDependency !== false)) throw new Error('deferred_tool_cannot_be_core_dependency');

  const upstreams = Object.freeze(assessment.broker.upstreams.map(freezeSource));
  const optionalAdapters = Object.freeze(assessment.optionalAdapters.map(freezeSource));
  const archive = Object.freeze({ ...freezeSource(assessment.archive), mechanism: assessment.archive.mechanism, directAccess: assessment.archive.directAccess });
  const workers = Object.freeze(assessment.extractionWorkers.map((worker) => {
    if (worker.substitutionPolicy !== 'exact') throw new Error('extraction_worker_substitution_must_be_exact');
    return Object.freeze({ ...worker });
  }));
  const qualifiedUpstreams = upstreams.filter((source) => source.qualificationStatus === 'passed');
  const independentUpstreams = new Set(qualifiedUpstreams.map((source) => source.failureDomain)).size === qualifiedUpstreams.length;
  const brokerReady = assessment.broker.selected
    && assessment.broker.deployment === 'self_hosted'
    && qualifiedUpstreams.length >= 2
    && independentUpstreams;
  const brokerDomains = new Set(qualifiedUpstreams.map((source) => source.failureDomain));
  const archiveIndependent = archive.directAccess
    && archive.qualificationStatus === 'passed'
    && !brokerDomains.has(archive.failureDomain);
  const selectedWorkers = workers.filter((worker) => worker.selected);
  const selectedWorker = selectedWorkers[0];
  const workerReady = selectedWorker === undefined || (
    selectedWorker.qualificationStatus === 'passed'
    && selectedWorker.safetyBoundary === 'bounded_retrieval_adapter'
    && selectedWorker.deterministicFixturesPassed
    && selectedWorker.timeoutEnforced
    && selectedWorker.resourceLimitsEnforced
    && selectedWorker.failureIsolationPassed
  );
  const failureCodes: string[] = [];
  if (assessment.broker.deployment === 'public_shared') failureCodes.push('public_metasearch_not_production_supply');
  if (qualifiedUpstreams.length < 2) failureCodes.push('metasearch_requires_two_qualified_upstreams');
  if (!independentUpstreams) failureCodes.push('metasearch_upstreams_not_independent');
  if (!archive.directAccess) failureCodes.push('archive_must_remain_direct');
  if (!archiveIndependent) failureCodes.push('archive_not_independent');
  if (!workerReady) failureCodes.push('selected_extraction_worker_not_qualified');
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    ...assessment,
    broker: Object.freeze({ ...assessment.broker, upstreams }),
    archive,
    optionalAdapters,
    extractionWorkers: workers,
    deferredTools: Object.freeze(assessment.deferredTools.map((tool) => Object.freeze({ ...tool }))),
    brokerReady,
    archiveIndependent,
    ...(selectedWorker === undefined ? {} : { selectedExtractionWorkerId: selectedWorker.workerId }),
    readySearchSupply: brokerReady && archiveIndependent && workerReady,
    failureCodes: Object.freeze(failureCodes),
  });
}