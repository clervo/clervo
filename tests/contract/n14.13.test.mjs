import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);

test('Sandbox private Cloud Run candidate is zero-traffic, payment-disabled, and Direct VPC only', async () => {
  const connectivity = JSON.parse(await readFile('infra/production/gcp/sandbox-connectivity.v1.json', 'utf8'));
  const release = await readFile('scripts/production/gcp-release.mjs', 'utf8');
  assert.equal(connectivity.cloudRun.directVpcEgress, 'private-ranges-only');
  assert.equal(connectivity.cloudRun.controlOrigin, `http://${connectivity.internalAddress.address}:8080`);
  assert.ok(connectivity.cloudRun.requestTimeoutSeconds > 315);
  assert.match(release, /sandbox-private-deployed-with-zero-traffic/u);
  assert.match(release, /CLERVO_SANDBOX_MODE=\$\{sandboxPrivate \? 'private' : 'disabled'\}/u);
  assert.match(release, /CLERVO_X402_MODE=\$\{x402Mode\}/u);
  assert.match(release, /'--network', sandboxPolicy\.network/u);
  assert.match(release, /'--subnet', sandboxPolicy\.serverlessSubnet\.name/u);
  assert.match(release, /'--vpc-egress', sandboxPolicy\.cloudRun\.directVpcEgress/u);
  assert.match(release, /noTraffic: true/u);
});

test('Sandbox API secret bootstrap creates no readable output and stays exact-project guarded', async () => {
  const { stdout } = await execute(process.execPath, ['scripts/production/gcp-sandbox-secrets.mjs', 'plan'], { env: { PATH: process.env.PATH } });
  const plan = JSON.parse(stdout);
  assert.equal(plan.project, 'bloxsniper-prod');
  assert.deepEqual(plan.secrets, ['clervo-sandbox-control-token', 'clervo-sandbox-api-token']);
  assert.equal(plan.valuesRead, false);
  assert.equal(plan.valuesPrinted, false);
  const source = await readFile('scripts/production/gcp-sandbox-secrets.mjs', 'utf8');
  assert.match(source, /create:sandbox-api-secret/u);
  assert.doesNotMatch(source, /versions', 'access|console\.log\([^)]*token/iu);
});
