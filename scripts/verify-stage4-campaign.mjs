#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateStage4Exit, loadStage4ExitInputs } from './verify-stage4-exit.mjs';

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

export function validateStage4Campaign(matrix, stageResult, packageJson, tsconfig) {
  assert.equal(matrix.schemaVersion, 1, 'campaign schema version drift');
  assert.equal(matrix.ticket, 'N4.22', 'campaign ticket must remain N4.22');
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

  assert.equal(matrix.blockerCount, stageResult.blockingCheckIds.length, 'campaign blocker count must match Stage 4 verifier');
  assert.equal(matrix.blockerCount, 21, 'N4.22 starting blocker count drift');
  assert.equal(matrix.blockers.length, matrix.blockerCount, 'campaign must describe every blocker exactly once');
  const blockerIds = matrix.blockers.map((blocker) => blocker.id);
  assert.equal(new Set(blockerIds).size, blockerIds.length, 'campaign blocker IDs must be unique');
  assert.deepEqual(blockerIds, [...stageResult.blockingCheckIds], 'campaign blockers must match exact Stage 4 order and identity');

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

  return Object.freeze({
    blockerCount: matrix.blockerCount,
    nextTicket: 'N4.23',
    nextTicketStatus: 'blocked_external',
    externalReasons: Object.freeze([...matrix.externalBlocker.reasons]),
  });
}

export async function loadStage4CampaignInputs(root = repositoryRoot) {
  const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
  const [{ evidence, actualSourceState }, matrix, packageJson, tsconfig] = await Promise.all([
    loadStage4ExitInputs(root),
    readJson('infra/staging/stage4-remediation-campaign.json'),
    readJson('package.json'),
    readJson('tsconfig.json'),
  ]);
  const stageResult = evaluateStage4Exit(evidence, actualSourceState);
  return { matrix, stageResult, packageJson, tsconfig };
}

async function main() {
  const inputs = await loadStage4CampaignInputs();
  const result = validateStage4Campaign(inputs.matrix, inputs.stageResult, inputs.packageJson, inputs.tsconfig);
  console.log('stage4 remediation campaign: PASS');
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
