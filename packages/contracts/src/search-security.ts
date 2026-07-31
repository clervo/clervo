import { hashJson } from './receipt.js';
import type { JsonValue } from './types.js';
import type { ConnectedExtractionProvenance, RetrievalRouteId } from './live-federation.js';

export const searchRetrievalPolicyId = 'clervo.search.retrieval-security.v1' as const;
export const crawl4AiIsolationPolicyId = 'clervo.search.crawl4ai-isolation.v1' as const;
export const promptInjectionBoundaryId = 'clervo.search.untrusted-evidence.v1' as const;

export const searchRetrievalSecurityPolicy = Object.freeze({
  policyId: searchRetrievalPolicyId,
  protocols: Object.freeze(['http:', 'https:'] as const),
  robots: 'enforced_fail_closed' as const,
  redirects: 'validate_every_hop' as const,
  dns: 'resolve_then_pin_and_verify_connected_address' as const,
  maximumRedirects: 5,
  maximumCompressedBytes: 1_048_576,
  maximumDecompressedBytes: 4_194_304,
  maximumOutputCharacters: 100_000,
  maximumExecutionMs: 30_000,
  maximumConcurrencyPerDomain: 2,
  minimumCrawlDelayMs: 1_000,
  maximumCrawlDelayMs: 60_000,
  forbiddenCapabilities: Object.freeze([
    'login', 'cookies', 'captcha_solving', 'proxy_rotation', 'stealth', 'access_control_bypass',
    'file_urls', 'arbitrary_javascript', 'hooks', 'downloads', 'persistent_sessions', 'llm_integrations',
  ] as const),
});

export const crawl4AiIsolationPolicy = Object.freeze({
  policyId: crawl4AiIsolationPolicyId,
  workerId: 'worker_crawl4ai_0_9_2_playwright_1_61_0' as const,
  crawl4aiVersion: '0.9.2' as const,
  playwrightVersion: '1.61.0' as const,
  internalOnly: true as const,
  publicRawApi: false as const,
  networkMode: 'default_deny_gateway_only' as const,
  filesystem: 'read_only_with_bounded_memory_tmpfs' as const,
  browserState: 'ephemeral_per_job' as const,
  teardown: 'deterministic_and_orphan_reaped' as const,
  runAsNonRoot: true as const,
  hostNamespaces: false as const,
  hostMounts: false as const,
  hostSockets: false as const,
  serviceAccountToken: false as const,
  controlPlaneAccess: false as const,
  metadataAccess: false as const,
  commerceSecrets: false as const,
  databaseAccess: false as const,
  capabilitiesDropped: Object.freeze(['ALL'] as const),
  seccompProfile: 'RuntimeDefault' as const,
  limits: Object.freeze({
    cpuMillis: 1_000,
    memoryBytes: 805_306_368,
    processes: 64,
    browserPages: 1,
    networkBytes: 16_777_216,
    renderedBytes: 2_097_152,
    outputCharacters: 100_000,
    ephemeralDiskBytes: 67_108_864,
    executionMs: 30_000,
  }),
  forbiddenCapabilities: searchRetrievalSecurityPolicy.forbiddenCapabilities,
});

export interface Crawl4AiRuntimeAttestation {
  policyId: typeof crawl4AiIsolationPolicyId;
  workerId: typeof crawl4AiIsolationPolicy.workerId;
  crawl4aiVersion: typeof crawl4AiIsolationPolicy.crawl4aiVersion;
  playwrightVersion: typeof crawl4AiIsolationPolicy.playwrightVersion;
  manifestSha256: string;
  runtimeIdentity: string;
  internalOnly: true;
  publicRawApi: false;
  networkMode: typeof crawl4AiIsolationPolicy.networkMode;
  filesystem: typeof crawl4AiIsolationPolicy.filesystem;
  browserState: typeof crawl4AiIsolationPolicy.browserState;
  runAsNonRoot: true;
  hostNamespaces: false;
  hostMounts: false;
  hostSockets: false;
  serviceAccountToken: false;
  controlPlaneAccess: false;
  metadataAccess: false;
  commerceSecrets: false;
  databaseAccess: false;
  capabilitiesDropped: readonly ['ALL'];
  seccompProfile: 'RuntimeDefault';
  limits: typeof crawl4AiIsolationPolicy.limits;
  observedAt: string;
}

export interface Crawl4AiWorkerHealth {
  lifecycle: 'ready' | 'degraded' | 'unavailable';
  isolationProven: boolean;
  killSwitchEngaged: boolean;
  activeJobs: number;
  orphanCount: number;
  reason: 'runtime_attested' | 'runtime_attestation_missing' | 'runtime_attestation_invalid' | 'startup_cleanup_pending' | 'kill_switch_engaged' | 'orphan_cleanup_required' | 'worker_failure';
}

function validTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export function assertCrawl4AiRuntimeAttestation(value: Crawl4AiRuntimeAttestation): void {
  const expected = crawl4AiIsolationPolicy;
  if (value.policyId !== expected.policyId || value.workerId !== expected.workerId || value.crawl4aiVersion !== expected.crawl4aiVersion
    || value.playwrightVersion !== expected.playwrightVersion || !/^sha256:[a-f0-9]{64}$/u.test(value.manifestSha256)
    || !/^[a-z0-9][a-z0-9._-]{2,127}$/u.test(value.runtimeIdentity) || !validTimestamp(value.observedAt)
    || value.internalOnly !== true || value.publicRawApi !== false || value.networkMode !== expected.networkMode
    || value.filesystem !== expected.filesystem || value.browserState !== expected.browserState || value.runAsNonRoot !== true
    || value.hostNamespaces !== false || value.hostMounts !== false || value.hostSockets !== false || value.serviceAccountToken !== false
    || value.controlPlaneAccess !== false || value.metadataAccess !== false || value.commerceSecrets !== false || value.databaseAccess !== false
    || value.capabilitiesDropped.length !== 1 || value.capabilitiesDropped[0] !== 'ALL' || value.seccompProfile !== expected.seccompProfile
    || hashJson(value.limits as unknown as JsonValue) !== hashJson(expected.limits as unknown as JsonValue)) throw new Error('crawl4ai_runtime_isolation_unproven');
}

export function crawl4AiWorkerHealth(input: Readonly<{
  attestation?: Crawl4AiRuntimeAttestation;
  killSwitchEngaged: boolean;
  activeJobs: number;
  orphanCount: number;
  workerFailed?: boolean;
}>): Readonly<Crawl4AiWorkerHealth> {
  if (!Number.isInteger(input.activeJobs) || input.activeJobs < 0 || input.activeJobs > crawl4AiIsolationPolicy.limits.browserPages
    || !Number.isInteger(input.orphanCount) || input.orphanCount < 0) throw new Error('invalid_crawl4ai_worker_health');
  if (input.killSwitchEngaged) return Object.freeze({ lifecycle: 'unavailable', isolationProven: false, killSwitchEngaged: true, activeJobs: input.activeJobs, orphanCount: input.orphanCount, reason: 'kill_switch_engaged' });
  if (input.attestation === undefined) return Object.freeze({ lifecycle: 'unavailable', isolationProven: false, killSwitchEngaged: false, activeJobs: input.activeJobs, orphanCount: input.orphanCount, reason: 'runtime_attestation_missing' });
  try { assertCrawl4AiRuntimeAttestation(input.attestation); } catch { return Object.freeze({ lifecycle: 'unavailable', isolationProven: false, killSwitchEngaged: false, activeJobs: input.activeJobs, orphanCount: input.orphanCount, reason: 'runtime_attestation_invalid' }); }
  if (input.orphanCount > 0) return Object.freeze({ lifecycle: 'degraded', isolationProven: true, killSwitchEngaged: false, activeJobs: input.activeJobs, orphanCount: input.orphanCount, reason: 'orphan_cleanup_required' });
  if (input.workerFailed === true) return Object.freeze({ lifecycle: 'degraded', isolationProven: true, killSwitchEngaged: false, activeJobs: input.activeJobs, orphanCount: 0, reason: 'worker_failure' });
  return Object.freeze({ lifecycle: 'ready', isolationProven: true, killSwitchEngaged: false, activeJobs: input.activeJobs, orphanCount: 0, reason: 'runtime_attested' });
}

export interface UntrustedEvidenceBoundary {
  policyId: typeof promptInjectionBoundaryId;
  routeId: RetrievalRouteId;
  exactEvidence: string;
  exactEvidenceSha256: string;
  provenance: Readonly<ConnectedExtractionProvenance>;
  provenanceSha256: string;
  pageEffects: Readonly<{
    route: false;
    tools: false;
    payment: false;
    systemPolicy: false;
    citations: false;
    execution: false;
  }>;
}

export function createUntrustedEvidenceBoundary(routeId: RetrievalRouteId, exactEvidence: string, provenance: ConnectedExtractionProvenance): Readonly<UntrustedEvidenceBoundary> {
  if (exactEvidence.length < 1 || exactEvidence.length > searchRetrievalSecurityPolicy.maximumOutputCharacters || provenance.instructionHandling !== 'untrusted_data_only') throw new Error('invalid_untrusted_evidence');
  const frozenProvenance = Object.freeze({ ...provenance });
  return Object.freeze({
    policyId: promptInjectionBoundaryId,
    routeId,
    exactEvidence,
    exactEvidenceSha256: hashJson({ policyId: promptInjectionBoundaryId, routeId, exactEvidence }),
    provenance: frozenProvenance,
    provenanceSha256: hashJson(frozenProvenance as unknown as JsonValue),
    pageEffects: Object.freeze({ route: false, tools: false, payment: false, systemPolicy: false, citations: false, execution: false }),
  });
}

export function verifyUntrustedEvidenceBoundary(value: UntrustedEvidenceBoundary): boolean {
  try {
    const expected = createUntrustedEvidenceBoundary(value.routeId, value.exactEvidence, value.provenance);
    return hashJson(value as unknown as JsonValue) === hashJson(expected as unknown as JsonValue);
  } catch {
    return false;
  }
}
