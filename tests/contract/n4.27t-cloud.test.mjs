import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildValidationPlan } from '../../infra/n4.27t/qualify-validation.mjs';

const text = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const fixture = (id, hostile = false) => ({ id, path: `/synthetic/${id}`, marker: `SYNTHETIC_${id.toUpperCase()}`, ...(hostile ? { authority: 'untrusted_evidence_only' } : { requiresJavaScript: true }) });
const corpus = {
  schemaVersion: 'clervo.n4.27t.corpus.v1', split: 'validation', status: 'frozen_not_executed', executionLimit: 1,
  tasks: Array.from({ length: 10 }, (_, index) => ({ id: `synthetic-task-${index}`, query: `npm package synthetic-${index} current version`, maximumResults: 5 })),
  browserFixtures: { javascript: Array.from({ length: 12 }, (_, index) => fixture(`js-${index}`)), hostile: Array.from({ length: 8 }, (_, index) => fixture(`hostile-${index}`, true)) },
};
const labels = { schemaVersion: 'clervo.n4.27t.labels.v1', split: 'validation', postFreezeEditingAllowed: false, labels: corpus.tasks.map(({ id }) => ({ id, answerable: true, expectedCanonicalUrls: [`https://www.npmjs.com/package/${id}`] })) };

test('cloud plan is exact, finite, private and cleanup-bound', async () => {
  const plan = JSON.parse(await text('infra/n4.27t/cloud-execution-plan.v1.json'));
  assert.equal(plan.project, 'bloxsniper-prod'); assert.equal(plan.resources.cluster, 'clervo-n427t-qualification');
  assert.equal(plan.resources.nodeCount, 1); assert.equal(plan.resources.autoscaling, false); assert.equal(plan.resources.publicIngress, false);
  assert.ok(plan.cost.estimatedCandidateExposureUsdPerDay <= plan.cost.maximumConfiguredExposureUsdPerDay);
  assert.equal(plan.execution.validationMaximumExecutions, 1); assert.equal(plan.execution.kubernetesBackoffLimit, 0);
  for (const forbidden of ['iam_change', 'billing_change', 'validation_retry', 'public_ingress']) assert.ok(plan.forbiddenOperations.includes(forbidden));
});

test('generic evaluator validates shape without reading frozen validation files', () => {
  const plan = buildValidationPlan(corpus, labels);
  assert.equal(plan.developerTasks.length, 10); assert.equal(plan.browser.length, 20);
  assert.equal(plan.browser.filter(({ markerMode }) => markerMode === 'hostile_evidence').length, 8);
  assert.throws(() => buildValidationPlan({ ...corpus, executionLimit: 2 }, labels), /frozen_validation/u);
  assert.throws(() => buildValidationPlan(corpus, { ...labels, postFreezeEditingAllowed: true }), /frozen_validation/u);
});

test('qualification image and job require one frozen digest and no retry', async () => {
  const dockerfile = await text('infra/n4.27t/qualification.Dockerfile'); const job = await text('infra/n4.27t/qualification-job.yaml'); const worker = await text('infra/n4.27t/validation-browser-worker.mjs');
  assert.match(dockerfile, /validation-corpus\.v1\.json/u); assert.match(dockerfile, /USER 65534:65534/u); assert.match(dockerfile, /tini/u);
  assert.match(job, /backoffLimit: 0/u); assert.match(job, /automountServiceAccountToken: false/u); assert.match(job, /readOnlyRootFilesystem: true/u); assert.match(job, /type: RuntimeDefault/u);
  assert.match(worker, /ignore-certificate-errors-spki-list/u); assert.match(worker, /pinnedpubkey/u); assert.doesNotMatch(worker, /--no-sandbox|--disable-dev-shm-usage/u);
});
