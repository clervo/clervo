#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createSentryMonitoringExporter } from '../../apps/api/src/monitoring-exporter.mjs';

const policy = JSON.parse(await readFile(
  new URL('../../infra/production/gcp/deployment.v1.json', import.meta.url),
  'utf8',
));
const action = process.argv[2] ?? 'plan';
const secret = policy.runtime.secretEnvironment.CLERVO_SENTRY_DSN;

function die(message) {
  throw new Error(`production_sentry_refused:${message}`);
}

const plan = {
  action: 'plan',
  project: policy.project,
  secret,
  customerPayloadsIncluded: false,
  deliveryCount: 1,
  paymentEffects: 0,
};

if (action === 'plan') {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else if (action === 'deliver') {
  const release = process.env.CLERVO_RELEASE_ID ?? '';
  const secretVersion = process.env.CLERVO_SENTRY_DSN_SECRET_VERSION ?? '';
  assert.match(release, /^[a-f0-9]{40}$/u, 'invalid release id');
  assert.match(secretVersion, /^[1-9][0-9]*$/u, 'invalid Sentry secret version');
  if (process.env.CLERVO_SENTRY_DELIVERY_CONFIRM !== `deliver:sentry:${release}`) die('owner_confirmation_mismatch');
  const access = spawnSync('gcloud', [
    'secrets', 'versions', 'access', secretVersion,
    '--secret', secret,
    '--project', policy.project,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (access.error || access.status !== 0) die('secret_access_failed');
  let dsn = access.stdout.trim();
  try {
    const exporter = createSentryMonitoringExporter({ dsn, environment: 'production', release });
    await exporter.export({
      generatedAt: new Date().toISOString(),
      service: 'search.api',
      summary: {
        requestsObserved: 1,
        successfulExecutions: 0,
        failedExecutions: 1,
        quotaRejections: 0,
        paymentChallenges: 0,
        paidCompletions: 0,
        availabilityRatio: 0,
        latencySeconds: { count: 1, total: 0, maximum: 0, average: 0 },
      },
      alerts: [{ code: 'search.execution_failure' }],
    });
  } finally {
    dsn = '';
  }
  process.stdout.write(`${JSON.stringify({
    action: 'delivery-acknowledged',
    driver: 'sentry',
    release,
    secretVersion: Number(secretVersion),
    customerPayloadsIncluded: false,
    secretPrinted: false,
    paymentEffects: 0,
  }, null, 2)}\n`);
} else {
  die('usage_plan_deliver');
}
