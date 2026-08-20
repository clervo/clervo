import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policy = JSON.parse(await readFile('infra/sandbox/control-service.v1.json', 'utf8'));
const bootstrap = await readFile('scripts/sandbox/gcp-control-service.mjs', 'utf8');
const server = await readFile('apps/api/src/sandbox-control-main.mjs', 'utf8');
const dockerfile = await readFile('infra/sandbox/control/Dockerfile', 'utf8');
const supply = JSON.parse(await readFile('docs/evidence/sandbox/control-supply-chain.v5.json', 'utf8'));
const live = JSON.parse(await readFile('docs/evidence/sandbox/control-service-live-smoke.v1.json', 'utf8'));
const interruption = JSON.parse(await readFile('docs/evidence/sandbox/control-interruption-recovery.v1.json', 'utf8'));
const sha256 = async (path) => `sha256:${createHash('sha256').update(await readFile(path)).digest('hex')}`;

test('private Sandbox control is digest pinned, authenticated, non-public, and separated from execution nodes', () => {
  assert.match(policy.imageDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(policy.runnerDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(policy.network.serviceType, 'ClusterIP');
  assert.equal(policy.network.public, false);
  assert.equal(policy.boundaries.systemNodePool, 'sandbox-system');
  assert.equal(policy.boundaries.executionNodePool, 'sandbox-execution');
  assert.equal(policy.boundaries.publicEndpoint, false);
  assert.equal(policy.boundaries.publicRoute, false);
  assert.equal(policy.boundaries.paymentEnabled, false);
  assert.equal(policy.state, 'private_control_qualified');
  assert.equal(policy.observed.inMemoryReplayOnly, true);
  assert.equal(policy.observed.publicCapacityQualified, false);
  assert.match(bootstrap, /type: 'ClusterIP'/u);
  assert.match(bootstrap, /'cloud\.google\.com\/gke-nodepool': policy\.boundaries\.systemNodePool/u);
  assert.doesNotMatch(bootstrap, /type: 'LoadBalancer'|type: 'NodePort'/u);
  assert.match(server, /timingSafeEqual/u);
  assert.match(server, /\/internal\/v1\/sandbox\/run/u);
  assert.match(server, /active >= 2/u);
  assert.match(server, /await plane\.reap\(\)/u);
  assert.match(server, /!cleanupHealthy \|\| plane\.cleanupUncertain\(\)/u);
});

test('control identity receives only namespaced Agent Sandbox lifecycle and runner access', () => {
  assert.deepEqual(policy.rbac.agentResources, ['sandboxclaims', 'sandboxtemplates']);
  assert.deepEqual(policy.rbac.agentVerbs, ['create', 'get', 'list', 'delete']);
  assert.deepEqual(policy.rbac.coreResources, ['pods']);
  assert.deepEqual(policy.rbac.coreVerbs, ['get', 'list']);
  assert.deepEqual(policy.rbac.execResources, ['pods/exec']);
  assert.deepEqual(policy.rbac.execVerbs, ['create', 'get']);
  assert.ok(policy.rbac.forbiddenResources.includes('secrets'));
  assert.ok(policy.rbac.forbiddenResources.includes('nodes'));
  assert.ok(policy.rbac.forbiddenResources.includes('namespaces'));
  assert.doesNotMatch(JSON.stringify(policy.rbac), /\*/u);
  assert.match(bootstrap, /executionNamespaceSecretCount/u);
  assert.match(bootstrap, /!canI\('get', 'secrets'\)/u);
  assert.match(bootstrap, /!canI\('create', 'pods'\)/u);
  assert.match(bootstrap, /!canI\('get', 'nodes'\)/u);
});

test('control image is non-root and shell-free at runtime', () => {
  assert.match(dockerfile, /distroless\/nodejs24-debian13:nonroot@sha256:/u);
  assert.match(dockerfile, /USER 65532:65532/u);
  assert.doesNotMatch(dockerfile.split('FROM gcr.io/')[1], /RUN |apt-get|apk |\/bin\/sh/u);
});

test('control image is bound to signed provenance, fresh offline malware scan, and its SBOM', async () => {
  assert.equal(supply.component, 'control');
  assert.equal(supply.digest, policy.imageDigest);
  assert.equal(supply.build.status, 'passed');
  assert.equal(supply.build.slsaBuildLevel, 3);
  assert.equal(supply.artifactAnalysis.effectiveCritical, 0);
  assert.equal(supply.artifactAnalysis.effectiveHigh, 0);
  assert.equal(supply.artifactAnalysis.secretAnalysisComplete, true);
  assert.equal(supply.malwareScan.databaseDownloadedBeforeIsolation, true);
  assert.equal(supply.malwareScan.scanNetwork, 'none');
  assert.equal(supply.malwareScan.infectedFiles, 0);
  assert.equal(supply.sbom.sha256, await sha256('docs/evidence/sandbox/control-sbom.spdx.json'));
  assert.equal(policy.observed.sbomSha256, supply.sbom.sha256);
  assert.equal(policy.observed.supplyChainReportSha256, await sha256('docs/evidence/sandbox/control-supply-chain.v5.json'));
});

test('live private control returns useful output once, replays without execution, and cleans every runtime', async () => {
  assert.equal(live.status, 'passed');
  assert.equal(live.controlImageDigest, policy.imageDigest);
  assert.equal(live.runnerImageDigest, policy.runnerDigest);
  assert.equal(live.privateService, true);
  assert.equal(live.publicEndpoint, false);
  assert.equal(live.authenticated, true);
  assert.equal(live.usefulResult, true);
  assert.equal(live.replayWithoutExecution, true);
  assert.equal(live.cleanupVerified, true);
  assert.equal(live.chargedMicrousd, 0);
  assert.deepEqual(live.capacity, { maximumConcurrent: 2, queueBehavior: 'immediate_bounded_rejection', overloadStatus: 503, retryAfterSeconds: 2, recoveryVerified: true, crossTenantContamination: false, publicApiHealthDuringOverload: true });
  assert.equal(policy.observed.boundedConcurrencyQualified, true);
  assert.equal(policy.observed.liveSmokeReportSha256, await sha256('docs/evidence/sandbox/control-service-live-smoke.v1.json'));
  assert.equal(interruption.status, 'passed'); assert.equal(interruption.controlImageDigest, policy.imageDigest); assert.equal(interruption.runnerImageDigest, policy.runnerDigest);
  assert.equal(interruption.activeExecutionObserved, true); assert.equal(interruption.controlRestarted, true); assert.equal(interruption.customerResultExposed, false);
  assert.equal(interruption.startupReaperVerified, true); assert.equal(interruption.cleanupVerified, true); assert.deepEqual(interruption.residual, { claims: 0, templates: 0, pods: 0 });
  assert.equal(policy.observed.interruptionRecoveryReportSha256, await sha256('docs/evidence/sandbox/control-interruption-recovery.v1.json'));
});
