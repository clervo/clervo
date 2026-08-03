#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createCdpFacilitatorAuth } from '../../apps/api/src/x402-resource.mjs';

const policy = JSON.parse(await readFile(
  new URL('../../infra/production/gcp/x402-preflight.v1.json', import.meta.url),
  'utf8',
));
const action = process.argv[2] ?? 'plan';

function die(message) {
  throw new Error(`production_x402_bootstrap_refused:${message}`);
}

function gcloud(args, { capture = false, input } = {}) {
  const result = spawnSync('gcloud', args, {
    encoding: 'utf8',
    input,
    stdio: capture ? ['pipe', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) die('gcloud_unavailable');
  if (result.status !== 0) die(`gcloud_failed_${args.slice(0, 3).join('_').replaceAll(/[^a-z0-9]+/giu, '_').toLowerCase()}`);
  return capture ? result.stdout.trim() : '';
}

function parseEnvironment(contents) {
  const values = new Map();
  for (const line of contents.split(/\r?\n/u)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*=/u.test(line)) continue;
    const separator = line.indexOf('=');
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values.set(line.slice(0, separator), value.replaceAll('\\n', '\n'));
  }
  return values;
}

function sourceValues(values) {
  const selected = Object.fromEntries(Object.entries(policy.sourceEnvironment).map(([name, environmentName]) => [name, values.get(environmentName) ?? '']));
  assert.equal(selected.facilitatorUrl.replace(/\/+$/u, ''), policy.facilitatorUrl, 'facilitator URL mismatch');
  assert.equal(selected.network, policy.network, 'x402 network mismatch');
  assert.equal(selected.asset.toLowerCase(), policy.asset.toLowerCase(), 'x402 asset mismatch');
  assert.match(selected.payTo, /^0x[a-fA-F0-9]{40}$/u, 'invalid receiver address');
  assert.notEqual(selected.payTo.toLowerCase(), selected.asset.toLowerCase(), 'receiver cannot equal asset');
  createCdpFacilitatorAuth({ keyId: selected.keyId, keySecret: selected.keySecret, url: selected.facilitatorUrl });
  return selected;
}

function secretExists(name) {
  const result = spawnSync('gcloud', ['secrets', 'describe', name, '--project', policy.project, '--format=value(name)'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) die('gcloud_unavailable');
  if (result.status === 0) return true;
  if (/not found|cannot find|could not find/iu.test(result.stderr)) return false;
  die('secret_reconcile_failed');
}

function enabledVersion(name) {
  const output = gcloud([
    'secrets', 'versions', 'list', name,
    '--project', policy.project,
    '--filter=state:ENABLED',
    '--sort-by=~createTime',
    '--limit=1',
    '--format=value(name.basename())',
  ], { capture: true });
  return output || undefined;
}

function ensureSecret(name, value) {
  if (!secretExists(name)) gcloud(['secrets', 'create', name, '--project', policy.project, '--replication-policy=automatic', '--quiet']);
  let version = enabledVersion(name);
  if (!version) {
    version = gcloud(['secrets', 'versions', 'add', name, '--project', policy.project, '--data-file=-', '--format=value(name.basename())'], { capture: true, input: value });
  }
  return version;
}

const plan = {
  action: 'plan',
  project: policy.project,
  service: policy.service,
  paymentMode: policy.paymentMode,
  secretNames: Object.values(policy.secrets),
  settlementEnabled: false,
  payerSignerRequired: false,
  paymentEffects: 0,
};

if (action === 'plan') {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else if (action === 'apply') {
  if (process.env.CLERVO_X402_BOOTSTRAP_CONFIRM !== `apply:x402-preflight-secrets:${policy.project}`) die('owner_confirmation_mismatch');
  const sourceFile = path.resolve(process.env.CLERVO_X402_SOURCE_ENV_FILE ?? '');
  if (!sourceFile.startsWith('/workspace/import/') || !sourceFile.endsWith('.env')) die('invalid_source_environment_file');
  const selected = sourceValues(parseEnvironment(await readFile(sourceFile, 'utf8')));
  const versions = {
    keyId: ensureSecret(policy.secrets.keyId, selected.keyId),
    keySecret: ensureSecret(policy.secrets.keySecret, selected.keySecret),
    payTo: ensureSecret(policy.secrets.payTo, selected.payTo),
  };
  process.stdout.write(`${JSON.stringify({
    action: 'applied',
    secretVersions: versions,
    configurationMatched: true,
    settlementEnabled: false,
    payerSignerRead: false,
    secretValuesPrinted: false,
    paymentEffects: 0,
  }, null, 2)}\n`);
} else {
  die('usage_plan_apply');
}
