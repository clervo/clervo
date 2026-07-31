#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateStage4Exit, loadStage4ExitInputs, REQUIRED_STAGE4_CHECK_IDS } from './verify-stage4-exit.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUEUE_STATUSES = new Set(['complete', 'pending', 'blocked_external']);
const BOUNDARIES = new Set(['local', 'staging', 'owner']);
const REQUIRED_EXTERNAL_REASONS = Object.freeze([
  'staging_credentials_unavailable',
  'lawful_production_supply_decision_missing',
  'common_crawl_legal_approval_missing',
  'payable_route_authorization_unavailable',
  'alert_delivery_channel_unavailable',
]);
const CURRENT_EXTERNAL_REASONS = Object.freeze(['payable_route_authorization_unavailable']);

export function validateStage4Campaign(matrix, stageResult, packageJson, tsconfig) {
  assert.equal(matrix.schemaVersion, 1, 'campaign schema version drift');
  assert.equal(matrix.ticket, 'N4.22', 'campaign ticket must remain N4.22');
  assert.equal(matrix.snapshotStatus, 'historical_n4.22_preflight_preserved', 'N4.22 snapshot must remain explicitly historical');
  assert.match(matrix.evaluatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  assert.match(matrix.startingCommit, /^[a-f0-9]{7,40}$/u);

  assert.equal(matrix.typescript.workspaceVersion, packageJson.devDependencies.typescript, 'workspace TypeScript version drift');
  assert.equal(matrix.typescript.target, tsconfig.compilerOptions.target, 'TypeScript target drift');
  assert.equal(matrix.typescript.target, 'ES2023', 'campaign assessed target must remain ES2023');
  assert.equal(matrix.typescript.normalTypecheckPassed, true, 'normal repository typecheck must pass');
  assert.equal(matrix.typescript.repositoryChangeRequired, false, 'passing workspace compiler does not justify a tsconfig downgrade');

  assert.equal(matrix.stagingAccess.project, 'bloxsniper-prod');
  assert.equal(matrix.stagingAccess.region, 'us-central1');
  assert.equal(matrix.stagingAccess.service, 'clervo-stage4-slice-staging');
  assert.equal(matrix.stagingAccess.authenticatedInvocationRequired, true);
  assert.equal(matrix.stagingAccess.activeGcloudAccount, false);
  assert.equal(matrix.stagingAccess.applicationDefaultCredentialsPresent, false);
  assert.equal(matrix.stagingAccess.accessTokenAvailable, false);
  assert.deepEqual(matrix.stagingAccess.credentialEnvironmentNamesPresent, []);
  assert.deepEqual(matrix.stagingAccess.supportedCredentialEnvironmentNames, [
    'GOOGLE_APPLICATION_CREDENTIALS',
    'CLERVO_STAGING_IDENTITY_TOKEN',
  ]);
  assert.equal(matrix.stagingAccess.unauthenticatedHealth.httpStatus, 403);
  assert.match(matrix.stagingAccess.unauthenticatedHealth.responseSha256, /^sha256:[a-f0-9]{64}$/u);

  assert.equal(matrix.blockerCount, 21, 'N4.22 starting blocker count drift');
  assert.equal(matrix.blockers.length, matrix.blockerCount, 'campaign must describe every blocker exactly once');
  const blockerIds = matrix.blockers.map((blocker) => blocker.id);
  assert.equal(new Set(blockerIds).size, blockerIds.length, 'campaign blocker IDs must be unique');
  assert.deepEqual(blockerIds, REQUIRED_STAGE4_CHECK_IDS.filter((id) => id !== 'deployed_free_sample'), 'historical N4.22 blockers must preserve exact Stage 4 order and identity');

  for (const blocker of matrix.blockers) {
    assert.ok(blocker.requiredEvidence.length >= 80, `${blocker.id}: required evidence is not explicit`);
    assert.ok(blocker.missingEvidence.length >= 60, `${blocker.id}: missing evidence is not explicit`);
    assert.match(blocker.dependencyGroup, /^N4\.[0-9]{2}$/u, `${blocker.id}: invalid dependency group`);
    assert.ok(Array.isArray(blocker.resolutionBoundary) && blocker.resolutionBoundary.length >= 1, `${blocker.id}: resolution boundary missing`);
    assert.equal(new Set(blocker.resolutionBoundary).size, blocker.resolutionBoundary.length, `${blocker.id}: duplicate resolution boundary`);
    for (const boundary of blocker.resolutionBoundary) assert.ok(BOUNDARIES.has(boundary), `${blocker.id}: invalid resolution boundary`);
    assert.ok(blocker.resolutionBoundary.includes('staging'), `${blocker.id}: local evidence cannot close a staging blocker`);
  }

  assert.ok(Array.isArray(matrix.campaignQueue) && matrix.campaignQueue.length >= 2, 'campaign queue missing');
  const seenTickets = new Set();
  for (const item of matrix.campaignQueue) {
    assert.match(item.ticket, /^N4\.[0-9]{2}$/u, 'invalid campaign ticket');
    assert.ok(!seenTickets.has(item.ticket), 'duplicate campaign ticket');
    assert.ok(QUEUE_STATUSES.has(item.status), `${item.ticket}: invalid queue status`);
    assert.ok(item.goal.length >= 60, `${item.ticket}: campaign goal is not explicit`);
    for (const dependency of item.dependsOn) assert.ok(seenTickets.has(dependency), `${item.ticket}: dependency must precede ticket`);
    seenTickets.add(item.ticket);
  }
  for (const blocker of matrix.blockers) assert.ok(seenTickets.has(blocker.dependencyGroup), `${blocker.id}: dependency group is absent from queue`);
  assert.equal(matrix.campaignQueue[0].ticket, 'N4.22');
  assert.equal(matrix.campaignQueue[0].status, 'complete');
  assert.equal(matrix.campaignQueue.find((item) => item.ticket === 'N4.23')?.status, 'blocked_external');
  assert.equal(matrix.campaignQueue.find((item) => item.ticket === 'N4.27')?.status, 'blocked_external');

  assert.equal(matrix.externalBlocker.status, 'blocked_external');
  assert.deepEqual(matrix.externalBlocker.reasons, REQUIRED_EXTERNAL_REASONS);
  assert.ok(matrix.externalBlocker.ownerIntervention.length >= 5, 'owner intervention must cover every external gate');
  assert.equal(matrix.stage5Started, false);
  assert.equal(matrix.usdcSpent, 0);

  const current = matrix.currentCampaignState;
  assert.match(current.evaluatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  assert.equal(current.sourceBinding, 'docs/evidence/n4.26/stage4-binding.v1.json');
  assert.equal(current.startingBlockerCount, matrix.blockerCount, 'current campaign must preserve the starting count');
  assert.deepEqual(current.closedCheckIds, stageResult.sourceBinding.binding.closedCheckIds, 'current closed IDs must match the hash-bound N4.26 source');
  assert.equal(current.blockerCount, stageResult.blockingCheckIds.length, 'current blocker count must match Stage 4 evidence');
  assert.equal(current.blockerCount, 10, 'N4.26 current blocker count drift');
  assert.deepEqual(current.blockerIds, [...stageResult.blockingCheckIds], 'current blockers must match Stage 4 order and identity');
  assert.equal(current.closedCheckIds.length + current.blockerCount, current.startingBlockerCount, 'current campaign must account for all starting blockers');
  assert.equal(current.authenticatedStaging.authenticatedControlPlaneAccess, true, 'current authenticated staging access must be recorded');
  assert.equal(current.authenticatedStaging.clusterState, 'deleted_after_evidence_capture', 'ticket cluster must not retain active burn');
  assert.equal(current.authenticatedStaging.dataDiskState, 'deleted_after_evidence_capture', 'ticket data disk must not retain active burn');
  assert.equal(current.authenticatedStaging.legacyResourcesReadOrMutated, false, 'legacy resources remain out of scope');
  assert.deepEqual(current.campaignQueue.map((item) => [item.ticket, item.status]), [
    ['N4.23A', 'complete'],
    ['N4.23B', 'complete'],
    ['N4.24', 'complete'],
    ['N4.25', 'complete'],
    ['N4.26', 'complete'],
    ['N4.27', 'blocked_external'],
    ['N4.28', 'pending'],
  ]);
  assert.equal(current.campaignQueue.find((item) => item.ticket === 'N4.27')?.reason, 'separate_payment_authority_required');
  assert.equal(current.externalBlocker.status, 'blocked_external');
  assert.deepEqual(current.externalBlocker.reasons, CURRENT_EXTERNAL_REASONS);
  assert.equal(current.externalBlocker.ownerIntervention.length, 1);
  assert.equal(current.referencePatternAuthorized, false);
  assert.equal(current.stage5Authorized, false);
  assert.equal(current.usdcSpent, 0);

  return Object.freeze({
    startingBlockerCount: matrix.blockerCount,
    blockerCount: current.blockerCount,
    closedCheckIds: Object.freeze([...current.closedCheckIds]),
    nextTicket: 'N4.27',
    nextTicketStatus: 'blocked_external',
    externalReasons: Object.freeze([...current.externalBlocker.reasons]),
  });
}

export async function loadStage4CampaignInputs(root = repositoryRoot) {
  const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
  const [{ evidence, actualSourceState, sourceBinding }, matrix, packageJson, tsconfig] = await Promise.all([
    loadStage4ExitInputs(root),
    readJson('infra/staging/stage4-remediation-campaign.json'),
    readJson('package.json'),
    readJson('tsconfig.json'),
  ]);
  const stageResult = Object.freeze({ ...evaluateStage4Exit(evidence, actualSourceState), sourceBinding });
  return { matrix, stageResult, packageJson, tsconfig };
}

async function main() {
  const inputs = await loadStage4CampaignInputs();
  const result = validateStage4Campaign(inputs.matrix, inputs.stageResult, inputs.packageJson, inputs.tsconfig);
  console.log('stage4 remediation campaign: PASS');
  console.log(`starting blockers: ${result.startingBlockerCount}`);
  console.log(`closed by N4.26: ${result.closedCheckIds.length}`);
  console.log(`blocking checks: ${result.blockerCount}`);
  console.log(`next ticket: ${result.nextTicket}`);
  console.log(`next ticket status: ${result.nextTicketStatus}`);
  console.log(`external blockers: ${result.externalReasons.join(', ')}`);
  console.log('Stage 5 started: false');
  console.log('USDC spent: 0');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`stage4 remediation campaign: FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
