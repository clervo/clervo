#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { getAddress, isAddress } from 'viem';

const policy = JSON.parse(await readFile(
  new URL('../../infra/production/gcp/x402-preflight.v1.json', import.meta.url),
  'utf8',
));
const action = process.argv[2] ?? 'plan';

function refuse(code) {
  throw new Error(`production_x402_receiver_rotation_refused:${code}`);
}

function gcloud(args, { input } = {}) {
  const result = spawnSync('gcloud', args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) refuse('gcloud_failed');
  return result.stdout.trim();
}

function normalizeAddress(value, code) {
  const trimmed = String(value ?? '').trim();
  if (!isAddress(trimmed, { strict: true })) refuse(code);
  return getAddress(trimmed);
}

function fingerprint(address) {
  return `sha256:${createHash('sha256').update(address.toLowerCase()).digest('hex')}`;
}

function enabledVersion() {
  const value = gcloud([
    'secrets', 'versions', 'list', policy.secrets.payTo,
    '--project', policy.project,
    '--filter=state:ENABLED',
    '--sort-by=~createTime',
    '--limit=1',
    '--format=value(name.basename())',
  ]);
  if (!/^[1-9][0-9]*$/u.test(value)) refuse('enabled_receiver_version_missing');
  return Number(value);
}

const plan = {
  action: 'plan',
  project: policy.project,
  service: policy.service,
  secretName: policy.secrets.payTo,
  network: policy.network,
  asset: policy.asset,
  mutation: false,
  oldVersionRetained: true,
  deploymentChanged: false,
  settlementEnabled: false,
  paymentEffects: 0,
};

if (action === 'plan') {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else if (action === 'apply') {
  const next = normalizeAddress(process.env.CLERVO_X402_NEW_PAY_TO, 'new_receiver_invalid');
  const nextFingerprint = fingerprint(next);
  assert.equal(
    process.env.CLERVO_X402_RECEIVER_ROTATION_CONFIRM,
    `rotate:x402-pay-to:${policy.project}:${nextFingerprint}`,
    'owner confirmation mismatch',
  );
  assert.notEqual(next.toLowerCase(), policy.asset.toLowerCase(), 'receiver cannot equal asset');

  const previousVersion = enabledVersion();
  const previous = normalizeAddress(gcloud([
    'secrets', 'versions', 'access', String(previousVersion),
    '--secret', policy.secrets.payTo,
    '--project', policy.project,
  ]), 'current_receiver_invalid');
  assert.notEqual(next.toLowerCase(), previous.toLowerCase(), 'new receiver must differ from current receiver');

  const nextVersionValue = gcloud([
    'secrets', 'versions', 'add', policy.secrets.payTo,
    '--project', policy.project,
    '--data-file=-',
    '--format=value(name.basename())',
  ], { input: next });
  if (!/^[1-9][0-9]*$/u.test(nextVersionValue)) refuse('new_receiver_version_invalid');
  const nextVersion = Number(nextVersionValue);
  const observed = normalizeAddress(gcloud([
    'secrets', 'versions', 'access', String(nextVersion),
    '--secret', policy.secrets.payTo,
    '--project', policy.project,
  ]), 'stored_receiver_invalid');
  assert.equal(observed, next, 'stored receiver mismatch');

  process.stdout.write(`${JSON.stringify({
    action: 'receiver-version-added',
    secretName: policy.secrets.payTo,
    previousVersion,
    nextVersion,
    receiverFingerprint: nextFingerprint,
    oldVersionRetained: true,
    deploymentChanged: false,
    settlementEnabled: false,
    paymentEffects: 0,
    secretValuesPrinted: false,
  }, null, 2)}\n`);
} else {
  refuse('usage_plan_apply');
}
