import { CONTRACT_VERSION } from './types.js';

export type RetrievalExecutionStatus = 'verified' | 'degraded' | 'blocked';

export interface RetrievalExecutionUpstreamAssessment {
  engineName: 'wikipedia' | 'openstreetmap';
  providerId: 'provider_wikimedia.wikipedia' | 'provider_openstreetmap.nominatim';
  observedProviderId: string;
  failureDomain: string;
  upstreamHost: string;
  observedAt: string;
  status: 'succeeded' | 'unavailable';
  brokerHttpStatus: number;
  responseByteLimit: number;
  responseBytes: number;
  responseSha256: string;
  resultCount: number;
  resaleStatus: 'permitted_with_attribution' | 'prohibited';
  developmentOnly: boolean;
  safeFailure: 'fail_closed';
}

export interface RetrievalExecutionBrokerAssessment {
  brokerId: string;
  softwareId: 'searxng';
  expectedSourceCommit: string;
  observedSourceCommit: string;
  observedVersion: string;
  isolationMode: 'python_venv_process' | 'container';
  settingsSha256: string;
  bindHost: '127.0.0.1';
  bindPort: number;
  endpointOrigin: string;
  checkedAt: string;
  healthStatus: 'healthy' | 'unavailable';
  safeFailure: 'fail_closed';
  upstreams: readonly RetrievalExecutionUpstreamAssessment[];
}

export interface CommonCrawlIndexAssessment {
  host: 'index.commoncrawl.org';
  requestedAt: string;
  httpStatus: number;
  responseByteLimit: number;
  responseBytes: number;
  responseSha256: string;
  collection: string;
  targetUrl: string;
  matchStatus: 'hit' | 'miss';
  filename: string;
  offset: number;
  length: number;
  payloadDigest: string;
}

export interface CommonCrawlRangeAssessment {
  host: 'data.commoncrawl.org';
  requestedAt: string;
  status: 'retrieved' | 'failed' | 'not_attempted';
  httpStatus: number;
  rangeStart: number;
  rangeEnd: number;
  maximumRangeBytes: number;
  responseBytes: number;
  contentRange: string;
  expectedCompressedSha256: string;
  observedCompressedSha256: string;
  decodedBytes: number;
  decodedSha256: string;
  warcTargetUri: string;
  warcPayloadDigest: string;
  safeFailure: 'fail_closed';
}

export interface CommonCrawlExecutionAssessment {
  providerId: 'provider_commoncrawl';
  observedProviderId: string;
  failureDomain: string;
  directAccess: true;
  termsStatus: 'legal_review_required';
  productionEligible: false;
  index: CommonCrawlIndexAssessment;
  range: CommonCrawlRangeAssessment;
}

export interface RetrievalExecutionProofAssessment {
  proofId: string;
  n420QualificationId: string;
  evaluatedAt: string;
  evidenceExpiresAt: string;
  environment: 'development';
  productionAuthorization: false;
  broker: RetrievalExecutionBrokerAssessment;
  archive: CommonCrawlExecutionAssessment;
}

export interface RetrievalExecutionProofDecision extends RetrievalExecutionProofAssessment {
  contractVersion: typeof CONTRACT_VERSION;
  brokerReady: boolean;
  archiveReady: boolean;
  developmentReady: boolean;
  productionReady: false;
  status: RetrievalExecutionStatus;
  failureCodes: readonly string[];
  productionBlockers: readonly string[];
}

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SELECTED_SEARXNG_COMMIT = '057a77168d3175ce2e42e5b10f46a8df073886d5';
const SELECTED_SETTINGS_SHA256 = 'sha256:3ba83f2ccefd07351b4be52d1ee5bc9f35aa7ec2d2acae6b95ef35894c7a088b';
const EXPECTED_UPSTREAMS = Object.freeze({
  wikipedia: Object.freeze({
    providerId: 'provider_wikimedia.wikipedia',
    host: 'en.wikipedia.org',
  }),
  openstreetmap: Object.freeze({
    providerId: 'provider_openstreetmap.nominatim',
    host: 'nominatim.openstreetmap.org',
  }),
} as const);

function parseTimestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid_${name}`);
  return parsed;
}

function safePositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validBoundedResponse(bytes: number, limit: number): boolean {
  return safePositiveInteger(bytes) && safePositiveInteger(limit) && bytes <= limit;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function validHttpsUrlForHost(value: string, host: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

export function createRetrievalExecutionProofDecision(
  assessment: RetrievalExecutionProofAssessment,
): Readonly<RetrievalExecutionProofDecision> {
  if (!/^rexec_[A-Za-z0-9]{20,64}$/u.test(assessment.proofId)) throw new Error('invalid_retrieval_execution_proof_id');
  if (!/^dsqual_[A-Za-z0-9]{20,64}$/u.test(assessment.n420QualificationId)) throw new Error('invalid_n420_qualification_id');
  const evaluatedAt = parseTimestamp(assessment.evaluatedAt, 'retrieval_execution_evaluated_at');
  const evidenceExpiresAt = parseTimestamp(assessment.evidenceExpiresAt, 'retrieval_execution_evidence_expires_at');
  const brokerCheckedAt = parseTimestamp(assessment.broker.checkedAt, 'retrieval_execution_broker_checked_at');
  const failures: string[] = [];

  if (evidenceExpiresAt <= evaluatedAt || brokerCheckedAt > evaluatedAt) failures.push('evidence_stale');
  if (assessment.broker.brokerId !== 'broker_searxng.self_hosted.dev'
    || assessment.broker.softwareId !== 'searxng'
    || !COMMIT.test(assessment.broker.expectedSourceCommit)
    || assessment.broker.expectedSourceCommit !== SELECTED_SEARXNG_COMMIT
    || assessment.broker.observedSourceCommit !== assessment.broker.expectedSourceCommit) {
    failures.push('broker_identity_substitution');
  }
  if (!SHA256.test(assessment.broker.settingsSha256)
    || assessment.broker.settingsSha256 !== SELECTED_SETTINGS_SHA256) failures.push('settings_hash_invalid');
  if (assessment.broker.bindHost !== '127.0.0.1'
    || !Number.isInteger(assessment.broker.bindPort)
    || assessment.broker.bindPort < 1024
    || assessment.broker.bindPort > 65535
    || assessment.broker.endpointOrigin !== `http://127.0.0.1:${assessment.broker.bindPort}`) {
    failures.push('broker_not_loopback_only');
  }
  if (assessment.broker.healthStatus !== 'healthy') failures.push('broker_unavailable');
  if (assessment.broker.safeFailure !== 'fail_closed') failures.push('broker_failure_not_safe');
  if (assessment.broker.upstreams.length !== 2) failures.push('broker_requires_exactly_two_upstreams');
  if (!unique(assessment.broker.upstreams.map((item) => item.engineName))) failures.push('duplicate_upstream_engine');
  if (!unique(assessment.broker.upstreams.map((item) => item.providerId))) failures.push('duplicate_upstream_provider');
  if (!unique(assessment.broker.upstreams.map((item) => item.failureDomain))) failures.push('duplicate_failure_domain');

  for (const upstream of assessment.broker.upstreams) {
    const expected = EXPECTED_UPSTREAMS[upstream.engineName];
    const observedAt = parseTimestamp(upstream.observedAt, 'retrieval_execution_upstream_observed_at');
    if (observedAt > evaluatedAt) failures.push('upstream_evidence_from_future');
    if (upstream.providerId !== expected.providerId
      || upstream.observedProviderId !== expected.providerId
      || upstream.upstreamHost !== expected.host) {
      failures.push('upstream_identity_substitution');
    }
    if (upstream.status !== 'succeeded' || upstream.brokerHttpStatus !== 200 || upstream.resultCount < 1) {
      failures.push(`upstream_unavailable_${upstream.engineName}`);
    }
    if (!validBoundedResponse(upstream.responseBytes, upstream.responseByteLimit)) failures.push('upstream_response_unbounded');
    if (!SHA256.test(upstream.responseSha256)) failures.push('upstream_response_hash_invalid');
    if (upstream.safeFailure !== 'fail_closed') failures.push('upstream_failure_not_safe');
    if (upstream.engineName === 'openstreetmap'
      && (upstream.resaleStatus !== 'prohibited' || upstream.developmentOnly !== true)) {
      failures.push('nominatim_non_resale_restriction_missing');
    }
  }

  const brokerFailureCodes = new Set([
    'evidence_stale', 'broker_identity_substitution', 'settings_hash_invalid', 'broker_not_loopback_only',
    'broker_unavailable', 'broker_failure_not_safe', 'broker_requires_exactly_two_upstreams',
    'duplicate_upstream_engine', 'duplicate_upstream_provider', 'duplicate_failure_domain',
    'upstream_evidence_from_future', 'upstream_identity_substitution', 'upstream_response_unbounded',
    'upstream_response_hash_invalid', 'upstream_failure_not_safe', 'nominatim_non_resale_restriction_missing',
    'upstream_unavailable_wikipedia', 'upstream_unavailable_openstreetmap',
  ]);
  const brokerReady = !failures.some((code) => brokerFailureCodes.has(code));

  const { archive } = assessment;
  const indexRequestedAt = parseTimestamp(archive.index.requestedAt, 'common_crawl_index_requested_at');
  const rangeRequestedAt = parseTimestamp(archive.range.requestedAt, 'common_crawl_range_requested_at');
  if (indexRequestedAt > evaluatedAt || rangeRequestedAt > evaluatedAt || rangeRequestedAt < indexRequestedAt) {
    failures.push('archive_evidence_time_invalid');
  }
  if (archive.observedProviderId !== archive.providerId) failures.push('archive_identity_substitution');
  if (archive.index.host !== 'index.commoncrawl.org' || archive.range.host !== 'data.commoncrawl.org') {
    failures.push('archive_identity_substitution');
  }
  if (assessment.broker.upstreams.some((item) => item.failureDomain === archive.failureDomain)) failures.push('duplicate_failure_domain');
  if (!archive.directAccess) failures.push('archive_not_direct');
  if (archive.termsStatus !== 'legal_review_required' || archive.productionEligible !== false) {
    failures.push('common_crawl_legal_gate_missing');
  }
  if (archive.index.httpStatus !== 200 || archive.index.matchStatus !== 'hit') failures.push('common_crawl_index_miss');
  if (!validBoundedResponse(archive.index.responseBytes, archive.index.responseByteLimit)) failures.push('common_crawl_index_response_unbounded');
  if (!SHA256.test(archive.index.responseSha256)) failures.push('common_crawl_index_hash_invalid');
  if (!validHttpsUrlForHost(archive.index.targetUrl, 'example.com')) failures.push('common_crawl_target_invalid');
  if (!archive.index.collection.startsWith('CC-MAIN-')
    || !archive.index.filename.startsWith(`crawl-data/${archive.index.collection}/`)
    || !safePositiveInteger(archive.index.offset)
    || !safePositiveInteger(archive.index.length)) {
    failures.push('common_crawl_index_record_invalid');
  }

  const rangeLength = archive.range.rangeEnd - archive.range.rangeStart + 1;
  const rangeShapeValid = safePositiveInteger(archive.range.rangeStart)
    && safePositiveInteger(archive.range.rangeEnd)
    && safePositiveInteger(archive.range.maximumRangeBytes)
    && archive.range.maximumRangeBytes <= 1_048_576
    && archive.range.rangeStart === archive.index.offset
    && rangeLength === archive.index.length
    && rangeLength <= archive.range.maximumRangeBytes;
  if (!rangeShapeValid) failures.push('common_crawl_range_invalid_or_excessive');
  if (archive.range.status !== 'retrieved'
    || archive.range.httpStatus !== 206
    || archive.range.responseBytes !== archive.index.length
    || archive.range.contentRange !== `bytes ${archive.range.rangeStart}-${archive.range.rangeEnd}/945804766`) {
    failures.push('common_crawl_range_retrieval_failed');
  }
  if (!SHA256.test(archive.range.expectedCompressedSha256)
    || archive.range.observedCompressedSha256 !== archive.range.expectedCompressedSha256) {
    failures.push('common_crawl_content_hash_mismatch');
  }
  if (!safePositiveInteger(archive.range.decodedBytes)
    || !SHA256.test(archive.range.decodedSha256)
    || archive.range.warcTargetUri !== archive.index.targetUrl
    || archive.range.warcPayloadDigest !== archive.index.payloadDigest) {
    failures.push('common_crawl_warc_identity_mismatch');
  }
  if (archive.range.safeFailure !== 'fail_closed') failures.push('common_crawl_failure_not_safe');

  const failureCodes = Object.freeze([...new Set(failures)]);
  const archiveFailureCodes = new Set([
    'evidence_stale', 'archive_evidence_time_invalid', 'archive_identity_substitution', 'duplicate_failure_domain',
    'archive_not_direct', 'common_crawl_legal_gate_missing', 'common_crawl_index_miss',
    'common_crawl_index_response_unbounded', 'common_crawl_index_hash_invalid', 'common_crawl_target_invalid',
    'common_crawl_index_record_invalid', 'common_crawl_range_invalid_or_excessive',
    'common_crawl_range_retrieval_failed', 'common_crawl_content_hash_mismatch',
    'common_crawl_warc_identity_mismatch', 'common_crawl_failure_not_safe',
  ]);
  const archiveReady = !failureCodes.some((code) => archiveFailureCodes.has(code));
  const developmentReady = brokerReady && archiveReady;
  const degraded = failureCodes.some((code) => code === 'broker_unavailable'
    || code.startsWith('upstream_unavailable_')
    || code === 'common_crawl_range_retrieval_failed');

  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    ...assessment,
    broker: Object.freeze({
      ...assessment.broker,
      upstreams: Object.freeze(assessment.broker.upstreams.map((item) => Object.freeze({ ...item }))),
    }),
    archive: Object.freeze({
      ...archive,
      index: Object.freeze({ ...archive.index }),
      range: Object.freeze({ ...archive.range }),
    }),
    brokerReady,
    archiveReady,
    developmentReady,
    productionReady: false,
    status: developmentReady ? 'verified' : degraded ? 'degraded' : 'blocked',
    failureCodes,
    productionBlockers: Object.freeze([
      'development_only_environment',
      'production_authorization_absent',
      'public_nominatim_resale_prohibited',
      'common_crawl_content_legal_review_required',
      'general_web_quality_unproven',
    ]),
  });
}

export function assertRetrievalExecutionProofClaim(
  decision: Pick<RetrievalExecutionProofDecision, 'developmentReady'>,
  claimedReady: boolean,
): void {
  if (claimedReady !== decision.developmentReady) throw new Error('dishonest_retrieval_execution_ready_status');
}
