import { isIP } from 'node:net';
import { CONTRACT_VERSION } from './types.js';

export const retrievalCheckNames = [
  'terms',
  'authentication',
  'quota',
  'response_contract',
  'content_use',
  'failure_isolation',
] as const;

export const retrievalContentUseModes = ['search_metadata', 'transient_extraction', 'retained_evidence', 'archive_replay'] as const;

export type RetrievalCheckName = typeof retrievalCheckNames[number];
export type RetrievalContentUseMode = typeof retrievalContentUseModes[number];

export interface RetrievalEvidenceReference {
  url: string;
  observedAt: string;
  sha256: string;
}

export interface RetrievalCheck {
  name: RetrievalCheckName;
  status: 'passed' | 'failed' | 'not_run';
  evidence: readonly RetrievalEvidenceReference[];
  code?: string;
}

export interface RetrievalPathAssessment {
  pathId: string;
  providerId: string;
  failureDomain: string;
  role: 'primary' | 'fallback';
  mechanism: 'provider_api' | 'public_archive';
  selected: boolean;
  checkedAt: string;
  expiresAt: string;
  termsStatus: 'approved' | 'restricted' | 'blocked' | 'unreviewed';
  allowedContentUse: readonly RetrievalContentUseMode[];
  restrictionsAcknowledged: boolean;
  checks: readonly RetrievalCheck[];
}

export interface RetrievalPathDecision extends RetrievalPathAssessment {
  routeEligible: boolean;
  failureCodes: readonly string[];
}

export interface RetrievalQualificationSnapshot {
  contractVersion: typeof CONTRACT_VERSION;
  qualificationId: string;
  evaluatedAt: string;
  paths: readonly Readonly<RetrievalPathDecision>[];
  independentFailureDomains: boolean;
  twoPathGatePassed: boolean;
}

export interface RetrievalTargetHop {
  url: string;
  resolvedAddresses: readonly string[];
}

export interface RetrievalTargetInput {
  mode: RetrievalContentUseMode;
  providerAllowedContentUse: readonly RetrievalContentUseMode[];
  hops: readonly RetrievalTargetHop[];
  robotsStatus: 'allowed' | 'disallowed' | 'unavailable' | 'not_applicable';
  contentType: string;
  contentLengthBytes: number;
  maximumBytes: number;
}

export interface RetrievalTargetDecision {
  allowed: boolean;
  finalUrl?: string;
  failureCodes: readonly string[];
}

function parseTimestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid_${name}`);
  return parsed;
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function deepFreezeEvidence(evidence: RetrievalEvidenceReference): Readonly<RetrievalEvidenceReference> {
  return Object.freeze({ ...evidence });
}

function validateEvidence(evidence: RetrievalEvidenceReference, checkedAt: number): Readonly<RetrievalEvidenceReference> {
  let url: URL;
  try {
    url = new URL(evidence.url);
  } catch {
    throw new Error('invalid_retrieval_evidence_url');
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') throw new Error('invalid_retrieval_evidence_url');
  if (!/^sha256:[a-f0-9]{64}$/u.test(evidence.sha256)) throw new Error('invalid_retrieval_evidence_hash');
  if (parseTimestamp(evidence.observedAt, 'retrieval_evidence_observed_at') > checkedAt) throw new Error('retrieval_evidence_from_future');
  return deepFreezeEvidence(evidence);
}

function decidePath(path: RetrievalPathAssessment, evaluatedAt: number): Readonly<RetrievalPathDecision> {
  if (!/^retrieval_[a-z0-9][a-z0-9._-]{2,63}$/u.test(path.pathId)) throw new Error('invalid_retrieval_path_id');
  if (!/^provider_[a-z0-9][a-z0-9._-]{2,63}$/u.test(path.providerId)) throw new Error('invalid_retrieval_provider_id');
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/u.test(path.failureDomain)) throw new Error('invalid_retrieval_failure_domain');
  const checkedAt = parseTimestamp(path.checkedAt, 'retrieval_checked_at');
  const expiresAt = parseTimestamp(path.expiresAt, 'retrieval_expires_at');
  if (checkedAt > evaluatedAt || expiresAt <= checkedAt) throw new Error('invalid_retrieval_qualification_window');
  if (!hasUniqueValues(path.allowedContentUse)) throw new Error('duplicate_retrieval_content_use');
  if (!hasUniqueValues(path.checks.map((check) => check.name))) throw new Error('duplicate_retrieval_check');

  const checks = path.checks.map((check) => Object.freeze({
    ...check,
    evidence: Object.freeze(check.evidence.map((item) => validateEvidence(item, checkedAt))),
  }));
  const byName = new Map(checks.map((check) => [check.name, check]));
  const failureCodes: string[] = [];
  if (!path.selected) failureCodes.push('path_not_selected');
  if (expiresAt <= evaluatedAt) failureCodes.push('qualification_expired');
  if (path.termsStatus === 'blocked') failureCodes.push('terms_blocked');
  if (path.termsStatus === 'unreviewed') failureCodes.push('terms_unreviewed');
  if (path.termsStatus === 'restricted' && !path.restrictionsAcknowledged) failureCodes.push('terms_restrictions_unacknowledged');
  if (path.allowedContentUse.length === 0) failureCodes.push('no_allowed_content_use');
  for (const name of retrievalCheckNames) {
    const check = byName.get(name);
    if (check === undefined) failureCodes.push(`check_missing_${name}`);
    else if (check.status !== 'passed') failureCodes.push(`check_${check.status}_${name}`);
    else if (check.evidence.length === 0) failureCodes.push(`check_evidence_missing_${name}`);
  }
  return Object.freeze({
    ...path,
    allowedContentUse: Object.freeze([...path.allowedContentUse]),
    checks: Object.freeze(checks),
    routeEligible: failureCodes.length === 0,
    failureCodes: Object.freeze(failureCodes),
  });
}

export function createRetrievalQualificationSnapshot(
  qualificationId: string,
  evaluatedAtValue: string,
  assessments: readonly RetrievalPathAssessment[],
): Readonly<RetrievalQualificationSnapshot> {
  if (!/^rqual_[A-Za-z0-9]{20,64}$/u.test(qualificationId)) throw new Error('invalid_retrieval_qualification_id');
  const evaluatedAt = parseTimestamp(evaluatedAtValue, 'retrieval_evaluated_at');
  if (assessments.length !== 2) throw new Error('retrieval_requires_exactly_two_paths');
  if (!hasUniqueValues(assessments.map((path) => path.pathId))) throw new Error('duplicate_retrieval_path_id');
  const paths = Object.freeze(assessments.map((path) => decidePath(path, evaluatedAt)));
  const selected = paths.filter((path) => path.selected);
  const independentFailureDomains = selected.length === 2 && new Set(selected.map((path) => path.failureDomain)).size === 2;
  const rolesComplete = selected.some((path) => path.role === 'primary') && selected.some((path) => path.role === 'fallback');
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    qualificationId,
    evaluatedAt: evaluatedAtValue,
    paths,
    independentFailureDomains,
    twoPathGatePassed: independentFailureDomains && rolesComplete && paths.every((path) => path.routeEligible),
  });
}

function isForbiddenIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  const [a = -1, b = -1] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0)
    || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0) || a >= 224;
}

export function isForbiddenRetrievalAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 0) return true;
  if (kind === 4) return isForbiddenIpv4(address);
  const normalized = address.toLowerCase();
  if (!/^[23]/u.test(normalized)) return true;
  if (normalized.startsWith('2001:') || normalized.startsWith('2002:') || normalized.startsWith('3fff:')) return true;
  return false;
}

export function validateRetrievalUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') return undefined;
    if ((url.protocol === 'http:' && url.port !== '' && url.port !== '80') || (url.protocol === 'https:' && url.port !== '' && url.port !== '443')) return undefined;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '').replace(/\.$/u, '');
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname === 'metadata.google.internal' || isIP(hostname) !== 0) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export function evaluateRetrievalTarget(input: RetrievalTargetInput): Readonly<RetrievalTargetDecision> {
  const failures: string[] = [];
  if (!input.providerAllowedContentUse.includes(input.mode)) failures.push('content_use_not_allowed');
  if (input.hops.length === 0) failures.push('target_missing');
  if (input.hops.length > 6) failures.push('redirect_limit_exceeded');
  for (const [index, hop] of input.hops.entries()) {
    if (validateRetrievalUrl(hop.url) === undefined) failures.push(`unsafe_url_hop_${index}`);
    if (hop.resolvedAddresses.length === 0) failures.push(`dns_resolution_missing_hop_${index}`);
    else if (hop.resolvedAddresses.some(isForbiddenRetrievalAddress)) failures.push(`unsafe_address_hop_${index}`);
  }
  if (input.robotsStatus === 'disallowed') failures.push('robots_disallowed');
  if (input.robotsStatus === 'unavailable') failures.push('robots_unavailable');
  if (!Number.isSafeInteger(input.maximumBytes) || input.maximumBytes < 1) throw new Error('invalid_retrieval_maximum_bytes');
  if (!Number.isSafeInteger(input.contentLengthBytes) || input.contentLengthBytes < 0) throw new Error('invalid_retrieval_content_length');
  if (input.contentLengthBytes > input.maximumBytes) failures.push('response_too_large');
  const mime = input.contentType.split(';', 1)[0]?.trim().toLowerCase();
  if (mime === undefined || !['text/html', 'text/plain', 'application/xhtml+xml', 'application/json', 'application/pdf'].includes(mime)) failures.push('content_type_not_allowed');
  const finalUrl = input.hops.at(-1)?.url;
  return Object.freeze({
    allowed: failures.length === 0,
    ...(finalUrl === undefined ? {} : { finalUrl }),
    failureCodes: Object.freeze(failures),
  });
}