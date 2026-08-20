#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const policy = JSON.parse(await readFile(new URL('../../infra/production/gcp/ai-gateway-phase1.v1.json', import.meta.url), 'utf8'));
const action = process.argv[2] ?? 'plan';
const confirm = `apply:ai-gateway-phase1:${policy.project}`;
const serviceAccountId = policy.greenService.serviceAccount.split('@')[0];
const image = process.env.CLERVO_AI_GATEWAY_IMAGE;

function refuse(code) { throw new Error(`production_ai_gateway_phase1_refused:${code}`); }
function gcloud(args, { capture = false, input, allowMissing = false } = {}) {
  const result = spawnSync('gcloud', args, {
    encoding: 'utf8', input,
    stdio: capture ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) refuse('gcloud_unavailable');
  if (result.status !== 0 && !allowMissing) {
    if (capture && result.stderr) process.stderr.write(result.stderr.replaceAll(/[A-Za-z0-9_+/=-]{40,}/gu, '[REDACTED]'));
    refuse(`gcloud_${args.slice(0, 3).join('_').replaceAll(/[^a-z0-9]+/giu, '_').toLowerCase()}`);
  }
  return { found: result.status === 0, stdout: capture ? result.stdout.trim() : '' };
}
function exists(args) { return gcloud(args, { capture: true, allowMissing: true }).found; }
function enabledVersion(name) {
  return gcloud(['secrets', 'versions', 'list', name, '--project', policy.project, '--filter=state:ENABLED', '--sort-by=~createTime', '--limit=1', '--format=value(name.basename())'], { capture: true }).stdout;
}
async function privateValue(source) {
  const metadata = await stat(source);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0 || metadata.size < 16 || metadata.size > 4096) refuse('unsafe_secret_source');
  const value = (await readFile(source, 'utf8')).trim();
  if (value.length < 16 || value.length > 2048) refuse('invalid_secret_value');
  return value;
}
async function sourceValues() {
  const values = new Map();
  for (const [secret, source] of Object.entries(policy.secretSources)) {
    if (!source.includes('*')) { values.set(secret, await privateValue(source)); continue; }
    const directory = path.dirname(source);
    const prefix = path.basename(source).split('*')[0];
    const names = (await readdir(directory)).filter((name) => name.startsWith(prefix) && name.endsWith('.key')).sort();
    if (names.length !== 20) refuse('hcnsec_key_count');
    values.set(secret, JSON.stringify(await Promise.all(names.map((name) => privateValue(path.join(directory, name))))));
  }
  return values;
}
function ensureSecret(name, value) {
  if (!exists(['secrets', 'describe', name, '--project', policy.project, '--format=value(name)'])) {
    gcloud(['secrets', 'create', name, '--project', policy.project, '--replication-policy=automatic', '--quiet']);
  }
  let version = enabledVersion(name);
  if (!version) version = gcloud(['secrets', 'versions', 'add', name, '--project', policy.project, '--data-file=-', '--format=value(name.basename())'], { capture: true, input: value }).stdout;
  if (!/^[1-9][0-9]*$/u.test(version)) refuse('invalid_secret_version');
  return version;
}
function ensureServiceAccount() {
  if (exists(['iam', 'service-accounts', 'describe', policy.greenService.serviceAccount, '--project', policy.project, '--format=value(email)'])) return false;
  gcloud(['iam', 'service-accounts', 'create', serviceAccountId, '--project', policy.project, '--display-name', 'Clervo production AI gateway', '--description', 'Dedicated keyless identity for the production Clervo AI gateway.', '--quiet']);
  return true;
}
function bindRuntimeAccess() {
  const member = `serviceAccount:${policy.greenService.serviceAccount}`;
  gcloud(['projects', 'add-iam-policy-binding', policy.project, '--member', member, '--role', 'roles/aiplatform.user', '--condition=None', '--format=none', '--quiet']);
  for (const secret of policy.secretBindings) {
    gcloud(['secrets', 'add-iam-policy-binding', secret, '--project', policy.project, '--member', member, '--role', 'roles/secretmanager.secretAccessor', '--condition=None', '--format=none', '--quiet']);
  }
}
function deploy(versions) {
  if (!/^us-central1-docker\.pkg\.dev\/bloxsniper-prod\/clervo-production\/clervo-ai-gateway@sha256:[a-f0-9]{64}$/u.test(image ?? '')) refuse('invalid_image');
  const mounts = [
    `/secrets/builder/key=clervo-production-ai-api-key:${versions['clervo-production-ai-api-key']}`,
    `/secrets/groq/key=clervo-production-groq-api-key:${versions['clervo-production-groq-api-key']}`,
    `/secrets/nvidia/key=clervo-production-ai-gateway-nvidia-api-key:${versions['clervo-production-ai-gateway-nvidia-api-key']}`,
    `/secrets/siliconflow/key=clervo-production-ai-gateway-siliconflow-api-key:${versions['clervo-production-ai-gateway-siliconflow-api-key']}`,
    `/secrets/mistral/key=clervo-production-ai-gateway-mistral-api-key:${versions['clervo-production-ai-gateway-mistral-api-key']}`,
    `/secrets/sambanova/key=clervo-production-ai-gateway-sambanova-api-key:${versions['clervo-production-ai-gateway-sambanova-api-key']}`,
    `/secrets/openrouter/key=clervo-production-ai-gateway-openrouter-api-key:${versions['clervo-production-ai-gateway-openrouter-api-key']}`,
    `/secrets/hcnsec/keys.json=clervo-production-ai-gateway-hcnsec-api-keys:${versions['clervo-production-ai-gateway-hcnsec-api-keys']}`,
  ];
  const environment = [
    `VERTEX_PROJECT_ID=${policy.project}`, 'PUBLIC_PROVIDER_NAMES=true', 'REQUESTS_PER_MINUTE=120',
    'BUILDER_API_KEY_FILE=/secrets/builder/key', 'GROQ_API_KEY_FILE=/secrets/groq/key', 'NVIDIA_API_KEY_FILE=/secrets/nvidia/key',
    'SILICONFLOW_API_KEY_FILE=/secrets/siliconflow/key', 'MISTRAL_API_KEY_FILE=/secrets/mistral/key',
    'SAMBANOVA_API_KEY_FILE=/secrets/sambanova/key', 'OPENROUTER_API_KEY_FILE=/secrets/openrouter/key',
    'HCNSEC_ACCOUNT_KEYS_FILE=/secrets/hcnsec/keys.json',
    'MAX_CONCURRENCY=8', 'MAX_BODY_BYTES=10485760', 'MAX_OUTPUT_TOKENS=32768', 'UPSTREAM_TIMEOUT_MS=600000',
  ];
  gcloud([
    'run', 'deploy', policy.greenService.name, '--project', policy.project, '--region', policy.region, '--image', image,
    '--service-account', policy.greenService.serviceAccount, '--execution-environment', 'gen2', '--ingress', 'all', '--no-allow-unauthenticated',
    '--cpu', policy.greenService.cpu, '--memory', policy.greenService.memory, '--concurrency', String(policy.greenService.concurrency),
    '--min-instances', String(policy.greenService.minimumInstances), '--max-instances', String(policy.greenService.maximumInstances),
    '--timeout', `${policy.greenService.timeoutSeconds}s`, '--cpu-throttling', '--no-session-affinity', '--port', '8080',
    '--set-env-vars', environment.join(','), '--set-secrets', mounts.join(','),
    '--startup-probe', 'httpGet.path=/health,httpGet.port=8080,periodSeconds=2,timeoutSeconds=1,failureThreshold=30',
    '--liveness-probe', 'httpGet.path=/health,httpGet.port=8080,periodSeconds=30,timeoutSeconds=2,failureThreshold=3',
    '--labels', 'clervo-component=ai-gateway,clervo-phase=infra-rearch-1', '--quiet',
  ]);
  // Cloud Run's platform IAM layer cannot carry the gateway's existing bearer
  // credential because it owns Authorization. Disable only that redundant
  // platform check; every application route except /health fails closed on the
  // shared production gateway token.
  gcloud(['run', 'services', 'update', policy.greenService.name, '--project', policy.project, '--region', policy.region, '--no-invoker-iam-check', '--quiet']);
}

const plan = {
  action: 'plan', project: policy.project, region: policy.region, service: policy.greenService.name,
  serviceAccount: policy.greenService.serviceAccount, imageRequired: true, minimumInstances: policy.greenService.minimumInstances,
  secretNames: policy.secretBindings, newSecretCount: Object.keys(policy.secretSources).length,
  blueMutation: false, paymentEffects: 0,
};

if (action === 'plan') process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
else if (action === 'apply') {
  if (process.env.CLERVO_AI_GATEWAY_PHASE1_CONFIRM !== confirm) refuse('owner_confirmation_mismatch');
  const values = await sourceValues();
  const versions = {};
  for (const secret of policy.secretBindings) {
    versions[secret] = values.has(secret) ? ensureSecret(secret, values.get(secret)) : enabledVersion(secret);
    if (!/^[1-9][0-9]*$/u.test(versions[secret] ?? '')) refuse('required_secret_missing');
  }
  const serviceAccountCreated = ensureServiceAccount();
  bindRuntimeAccess();
  deploy(versions);
  const service = JSON.parse(gcloud(['run', 'services', 'describe', policy.greenService.name, '--project', policy.project, '--region', policy.region, '--format=json'], { capture: true }).stdout);
  process.stdout.write(`${JSON.stringify({
    action: 'green-deployed', service: policy.greenService.name, revision: service.status?.latestReadyRevisionName,
    url: service.status?.url, serviceAccountCreated, secretVersionsConfigured: Object.keys(versions).length,
    secretValuesPrinted: false, blueMutation: false, paymentEffects: 0,
  }, null, 2)}\n`);
} else refuse('usage_plan_apply');
