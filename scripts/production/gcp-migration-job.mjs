#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const policy = JSON.parse(await readFile(new URL('../../infra/production/gcp/migration-job.v1.json', import.meta.url), 'utf8'));
const action = process.argv[2] ?? 'plan';
const digestPattern = new RegExp(`^${policy.imageRepository.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}@sha256:[a-f0-9]{64}$`, 'u');

function fail(code) { throw new Error(`managed_migration_job_refused:${code}`); }

function gcloud(args, { allowFailure = false } = {}) {
  const result = spawnSync('gcloud', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    if (allowFailure) return { ok: false, stdout: result.stdout?.trim() ?? '', stderr: result.stderr?.trim() ?? '' };
    fail(`gcloud_${String(args[0] ?? 'command').replaceAll(/[^a-z0-9]+/giu, '_').toLowerCase()}_failed`);
  }
  return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function image() {
  const value = process.env.CLERVO_MIGRATION_IMAGE ?? '';
  if (!digestPattern.test(value)) fail('exact_migration_image_required');
  return value;
}

function verifyImage(exactImage) {
  const metadata = JSON.parse(gcloud([
    'artifacts', 'docker', 'images', 'describe', exactImage, '--project', policy.project,
    '--show-provenance', '--show-package-vulnerability', '--format=json',
  ]).stdout);
  if (metadata.image_summary?.fully_qualified_digest !== exactImage || metadata.image_summary?.slsa_build_level < 3) fail('image_provenance_invalid');
  const discovery = metadata.discovery_summary?.discovery ?? [];
  const complete = discovery.some(({ resourceUri, discovery: value }) => resourceUri === `https://${exactImage}`
    && value?.analysisStatus === 'FINISHED_SUCCESS'
    && ['OS', 'NPM', 'SECRET'].every((type) => value.analysisCompleted?.analysisType?.includes(type)));
  if (!complete) fail('image_analysis_incomplete');
  const vulnerabilities = metadata.package_vulnerability_summary?.vulnerabilities ?? {};
  const critical = vulnerabilities.CRITICAL?.length ?? 0;
  const high = vulnerabilities.HIGH?.length ?? 0;
  if (critical !== 0 || high !== 0) fail('image_vulnerability_gate_failed');
  return { slsaBuildLevel: metadata.image_summary.slsa_build_level, effectiveCritical: critical, effectiveHigh: high };
}

function deploy(exactImage) {
  gcloud([
    'run', 'jobs', 'deploy', policy.job, '--project', policy.project, '--region', policy.region,
    '--image', exactImage, '--service-account', policy.serviceAccount,
    '--set-cloudsql-instances', policy.cloudSqlConnection,
    '--set-secrets', `CLERVO_DATABASE_URL=${policy.databaseSecret}:${policy.databaseSecretVersion}`,
    '--set-env-vars', `CLERVO_ENV=production,CLERVO_DATABASE_MIGRATION_CONFIRM=apply:clervo-production-postgres,CLERVO_DATABASE_MIGRATION_TARGET=${policy.targetMigration},CLERVO_CLOUD_SQL_CONNECTION=${policy.cloudSqlConnection}`,
    '--tasks', String(policy.taskCount), '--max-retries', String(policy.maximumRetries),
    '--task-timeout', `${policy.taskTimeoutSeconds}s`, '--cpu', '1', '--memory', '512Mi', '--quiet',
  ]);
}

function execute() {
  const raw = gcloud(['run', 'jobs', 'execute', policy.job, '--project', policy.project, '--region', policy.region, '--wait', '--format=json']).stdout;
  const execution = JSON.parse(raw);
  const name = execution.metadata?.name;
  if (!/^clervo-production-migration-[a-z0-9]{5}$/u.test(name ?? '')) fail('execution_identity_missing');
  const completed = execution.status?.conditions?.find(({ type }) => type === 'Completed');
  if (completed?.status !== 'True' || execution.status?.succeededCount !== 1 || execution.status?.failedCount) fail('execution_failed');
  return { name, completedAt: completed.lastTransitionTime, succeededCount: execution.status.succeededCount };
}

function removeJob() {
  gcloud(['run', 'jobs', 'delete', policy.job, '--project', policy.project, '--region', policy.region, '--quiet'], { allowFailure: true });
  const remaining = gcloud(['run', 'jobs', 'describe', policy.job, '--project', policy.project, '--region', policy.region, '--format=value(metadata.name)'], { allowFailure: true });
  if (remaining.ok) fail('job_cleanup_failed');
  return true;
}

let result;
if (action === 'plan') {
  result = { action: 'plan', ...policy, mutation: false };
} else if (action === 'apply') {
  assert.equal(process.env.CLERVO_MANAGED_MIGRATION_CONFIRM, `apply:${policy.targetMigration}:${policy.project}`, 'owner confirmation mismatch');
  const exactImage = image();
  const artifact = verifyImage(exactImage);
  let execution;
  try {
    deploy(exactImage);
    execution = execute();
  } finally {
    removeJob();
  }
  result = {
    action: 'managed-migrations-applied', targetMigration: policy.targetMigration, image: exactImage,
    artifact, execution, jobRemoved: true, credentialReadByVm: false, credentialPrinted: false,
    publicEndpoint: false, paymentEnabled: false,
  };
} else fail('usage_plan_apply');

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
