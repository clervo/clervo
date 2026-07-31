import { createHash } from 'node:crypto';
import { CONTRACT_VERSION } from './types.js';

export const developmentSupplyEvidenceNames = ['identity', 'capability', 'health', 'bounded_use', 'terms'] as const;

export type DevelopmentSupplyEvidenceName = typeof developmentSupplyEvidenceNames[number];
export type DevelopmentSupplyQualificationStatus = 'passed' | 'provisional' | 'blocked';
export type DevelopmentSupplyResult = 'verified' | 'provisional' | 'degraded' | 'blocked';

export interface DevelopmentSupplyEvidence {
  name: DevelopmentSupplyEvidenceName;
  url: string;
  observedAt: string;
  summary: string;
  sha256: string;
}

export interface DevelopmentSupplySourceAssessment {
  sourceId: string;
  providerId: string;
  observedProviderId: string;
  failureDomain: string;
  role: 'broker_upstream' | 'direct_archive';
  mechanism: 'searxng_engine' | 'common_crawl_direct';
  qualificationStatus: DevelopmentSupplyQualificationStatus;
  checkedAt: string;
  expiresAt: string;
  capabilities: readonly string[];
  healthStatus: 'healthy' | 'unavailable' | 'not_run';
  quotaStatus: 'known' | 'bounded' | 'unknown';
  requestCeiling?: number;
  costCeilingUsdMicros?: number;
  termsStatus: 'permitted' | 'restricted' | 'prohibited' | 'unknown';
  restrictionsAcknowledged: boolean;
  resaleStatus: 'permitted' | 'permitted_with_attribution' | 'prohibited' | 'legal_review_required' | 'unknown';
  safeFailure: 'fail_closed';
  substitutionPolicy: 'exact';
  evidence: readonly DevelopmentSupplyEvidence[];
}

export interface DevelopmentSupplySourceDecision extends DevelopmentSupplySourceAssessment {
  developmentEligible: boolean;
  productionEligible: boolean;
  failureCodes: readonly string[];
}

export interface DevelopmentMetasearchBrokerAssessment {
  brokerId: string;
  softwareId: 'searxng';
  observedVersion: string;
  deployment: 'self_hosted' | 'public_shared';
  endpointScope: 'loopback_only' | 'remote_public';
  qualificationStatus: DevelopmentSupplyQualificationStatus;
  healthStatus: 'healthy' | 'unavailable' | 'not_run';
  checkedAt: string;
  expiresAt: string;
  evidence: readonly DevelopmentSupplyEvidence[];
  upstreams: readonly DevelopmentSupplySourceAssessment[];
}

export interface DevelopmentRetrievalSupplyAssessment {
  qualificationId: string;
  n419DecisionId: string;
  evaluatedAt: string;
  environment: 'development';
  productionAuthorization: false;
  broker: DevelopmentMetasearchBrokerAssessment;
  archive: DevelopmentSupplySourceAssessment;
}

export interface DevelopmentRetrievalSupplyDecision extends Omit<DevelopmentRetrievalSupplyAssessment, 'broker' | 'archive'> {
  contractVersion: typeof CONTRACT_VERSION;
  broker: Omit<DevelopmentMetasearchBrokerAssessment, 'upstreams'> & {
    upstreams: readonly Readonly<DevelopmentSupplySourceDecision>[];
    failureCodes: readonly string[];
  };
  archive: Readonly<DevelopmentSupplySourceDecision>;
  brokerReady: boolean;
  archiveReady: boolean;
  developmentReady: boolean;
  productionReady: false;
  result: DevelopmentSupplyResult;
  failureCodes: readonly string[];
  productionBlockers: readonly string[];
}

function parseTimestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid_${name}`);
  return parsed;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function validateEvidence(
  evidence: readonly DevelopmentSupplyEvidence[],
  checkedAt: number,
): readonly Readonly<DevelopmentSupplyEvidence>[] {
  if (!unique(evidence.map((item) => item.name))) throw new Error('duplicate_development_supply_evidence');
  const frozen = evidence.map((item) => {
    let url: URL;
    try {
      url = new URL(item.url);
    } catch {
      throw new Error('invalid_development_supply_evidence_url');
    }
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') throw new Error('invalid_development_supply_evidence_url');
    if (parseTimestamp(item.observedAt, 'development_supply_evidence_observed_at') > checkedAt) throw new Error('development_supply_evidence_from_future');
    if (item.summary.length < 5 || item.summary.length > 500) throw new Error('invalid_development_supply_evidence_summary');
    const expected = `sha256:${createHash('sha256').update(item.summary).digest('hex')}`;
    if (item.sha256 !== expected) throw new Error('development_supply_evidence_hash_mismatch');
    return Object.freeze({ ...item });
  });
  return Object.freeze(frozen);
}

function evaluateSource(
  source: DevelopmentSupplySourceAssessment,
  evaluatedAt: number,
): Readonly<DevelopmentSupplySourceDecision> {
  if (!/^source_[a-z0-9][a-z0-9._-]{2,63}$/u.test(source.sourceId)) throw new Error('invalid_development_supply_source_id');
  if (!/^provider_[a-z0-9][a-z0-9._-]{2,63}$/u.test(source.providerId)) throw new Error('invalid_development_supply_provider_id');
  if (!/^provider_[a-z0-9][a-z0-9._-]{2,63}$/u.test(source.observedProviderId)) throw new Error('invalid_observed_development_supply_provider_id');
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/u.test(source.failureDomain)) throw new Error('invalid_development_supply_failure_domain');
  const checkedAt = parseTimestamp(source.checkedAt, 'development_supply_checked_at');
  const expiresAt = parseTimestamp(source.expiresAt, 'development_supply_expires_at');
  if (checkedAt > evaluatedAt || expiresAt <= checkedAt) throw new Error('invalid_development_supply_qualification_window');
  if (!unique(source.capabilities)) throw new Error('duplicate_development_supply_capability');
  const evidence = validateEvidence(source.evidence, checkedAt);
  const evidenceNames = new Set(evidence.map((item) => item.name));
  const failures: string[] = [];
  if (source.observedProviderId !== source.providerId) failures.push('provider_identity_substitution');
  if (expiresAt <= evaluatedAt) failures.push('qualification_stale');
  if (source.qualificationStatus === 'provisional') failures.push('qualification_provisional');
  if (source.qualificationStatus === 'blocked') failures.push('qualification_blocked');
  if (source.capabilities.length === 0) failures.push('capability_missing');
  if (source.healthStatus === 'unavailable') failures.push('health_unavailable');
  if (source.healthStatus === 'not_run') failures.push('health_not_run');
  if (source.quotaStatus === 'unknown') failures.push('quota_unknown');
  if (!Number.isSafeInteger(source.requestCeiling) || (source.requestCeiling ?? 0) < 1) failures.push('request_ceiling_missing');
  if (!Number.isSafeInteger(source.costCeilingUsdMicros) || (source.costCeilingUsdMicros ?? -1) < 0) failures.push('cost_ceiling_missing');
  if (source.termsStatus === 'unknown') failures.push('terms_unknown');
  if (source.termsStatus === 'prohibited') failures.push('terms_prohibited');
  if (source.termsStatus === 'restricted' && !source.restrictionsAcknowledged) failures.push('terms_restrictions_unacknowledged');
  if (source.resaleStatus === 'unknown') failures.push('resale_status_unknown');
  if (source.safeFailure !== 'fail_closed') failures.push('safe_failure_not_fail_closed');
  if (source.substitutionPolicy !== 'exact') failures.push('substitution_policy_not_exact');
  for (const name of developmentSupplyEvidenceNames) {
    if (!evidenceNames.has(name)) failures.push(`evidence_missing_${name}`);
  }
  const developmentEligible = failures.length === 0;
  const productionEligible = developmentEligible
    && (source.resaleStatus === 'permitted' || source.resaleStatus === 'permitted_with_attribution');
  return Object.freeze({
    ...source,
    capabilities: Object.freeze([...source.capabilities]),
    evidence,
    developmentEligible,
    productionEligible,
    failureCodes: Object.freeze(failures),
  });
}

export function createDevelopmentRetrievalSupplyDecision(
  assessment: DevelopmentRetrievalSupplyAssessment,
): Readonly<DevelopmentRetrievalSupplyDecision> {
  if (!/^dsqual_[A-Za-z0-9]{20,64}$/u.test(assessment.qualificationId)) throw new Error('invalid_development_supply_qualification_id');
  if (!/^rsupply_[A-Za-z0-9]{20,64}$/u.test(assessment.n419DecisionId)) throw new Error('invalid_n419_supply_decision_id');
  const evaluatedAt = parseTimestamp(assessment.evaluatedAt, 'development_supply_evaluated_at');
  if (!/^broker_[a-z0-9][a-z0-9._-]{2,63}$/u.test(assessment.broker.brokerId)) throw new Error('invalid_development_supply_broker_id');
  const brokerCheckedAt = parseTimestamp(assessment.broker.checkedAt, 'development_supply_broker_checked_at');
  const brokerExpiresAt = parseTimestamp(assessment.broker.expiresAt, 'development_supply_broker_expires_at');
  if (brokerCheckedAt > evaluatedAt || brokerExpiresAt <= brokerCheckedAt) throw new Error('invalid_development_supply_broker_window');
  const brokerEvidence = validateEvidence(assessment.broker.evidence, brokerCheckedAt);
  const upstreams = Object.freeze(assessment.broker.upstreams.map((source) => evaluateSource(source, evaluatedAt)));
  const archive = evaluateSource(assessment.archive, evaluatedAt);
  const brokerFailures: string[] = [];
  if (assessment.broker.deployment === 'public_shared' || assessment.broker.endpointScope === 'remote_public') brokerFailures.push('public_shared_searxng_ineligible');
  if (assessment.broker.qualificationStatus !== 'passed') brokerFailures.push('broker_qualification_not_passed');
  if (assessment.broker.healthStatus === 'unavailable') brokerFailures.push('broker_health_unavailable');
  if (assessment.broker.healthStatus === 'not_run') brokerFailures.push('broker_health_not_run');
  if (brokerExpiresAt <= evaluatedAt) brokerFailures.push('broker_qualification_stale');
  if (upstreams.length < 2) brokerFailures.push('metasearch_requires_two_upstreams');
  if (!unique(upstreams.map((source) => source.providerId))) brokerFailures.push('duplicate_metasearch_upstream_provider');
  if (!unique(upstreams.map((source) => source.failureDomain))) brokerFailures.push('duplicate_metasearch_failure_domain');
  if (upstreams.some((source) => source.role !== 'broker_upstream' || source.mechanism !== 'searxng_engine')) brokerFailures.push('common_crawl_counted_as_broker_upstream');
  if (upstreams.some((source) => !source.developmentEligible)) brokerFailures.push('metasearch_upstream_not_eligible');
  if (brokerEvidence.length === 0) brokerFailures.push('broker_evidence_missing');
  const brokerReady = brokerFailures.length === 0;
  const archiveFailures: string[] = [];
  if (archive.role !== 'direct_archive' || archive.mechanism !== 'common_crawl_direct') archiveFailures.push('archive_must_remain_direct');
  if (upstreams.some((source) => source.sourceId === archive.sourceId || source.providerId === archive.providerId)) archiveFailures.push('common_crawl_counted_as_broker_upstream');
  if (upstreams.some((source) => source.failureDomain === archive.failureDomain)) archiveFailures.push('archive_failure_domain_not_independent');
  if (!archive.developmentEligible) archiveFailures.push('archive_not_eligible');
  const archiveReady = archiveFailures.length === 0;
  const failureCodes = Object.freeze([...new Set([...brokerFailures, ...archiveFailures])]);
  const developmentReady = brokerReady && archiveReady;
  const sourceFailures = [...upstreams, archive].flatMap((source) => source.failureCodes);
  const hardBlocked = brokerFailures.includes('public_shared_searxng_ineligible')
    || sourceFailures.some((code) => ['terms_unknown', 'terms_prohibited', 'terms_restrictions_unacknowledged', 'resale_status_unknown'].includes(code));
  const degraded = sourceFailures.includes('health_unavailable') || brokerFailures.includes('broker_health_unavailable');
  const result: DevelopmentSupplyResult = developmentReady ? 'verified' : hardBlocked ? 'blocked' : degraded ? 'degraded' : 'provisional';
  const productionBlockers = new Set<string>(['development_only_environment', 'production_authorization_absent']);
  for (const source of [...upstreams, archive]) {
    if (!source.productionEligible) productionBlockers.add(`production_ineligible_${source.sourceId}`);
  }
  if (!brokerReady) productionBlockers.add('broker_not_development_ready');
  if (!archiveReady) productionBlockers.add('archive_not_development_ready');
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    ...assessment,
    broker: Object.freeze({
      ...assessment.broker,
      evidence: brokerEvidence,
      upstreams,
      failureCodes: Object.freeze(brokerFailures),
    }),
    archive: Object.freeze({ ...archive, failureCodes: Object.freeze([...archive.failureCodes, ...archiveFailures]) }),
    brokerReady,
    archiveReady,
    developmentReady,
    productionReady: false,
    result,
    failureCodes,
    productionBlockers: Object.freeze([...productionBlockers]),
  });
}

export function assertDevelopmentRetrievalSupplyClaim(
  decision: Pick<DevelopmentRetrievalSupplyDecision, 'developmentReady'>,
  claimedReady: boolean,
): void {
  if (claimedReady !== decision.developmentReady) throw new Error('dishonest_development_supply_ready_status');
}
