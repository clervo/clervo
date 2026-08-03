import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policy = JSON.parse(await readFile('infra/production/gcp/sandbox-connectivity.v1.json', 'utf8'));
const control = JSON.parse(await readFile('infra/sandbox/control-service.v1.json', 'utf8'));
const bootstrap = await readFile('scripts/production/gcp-sandbox-connectivity.mjs', 'utf8');
const controlBootstrap = await readFile('scripts/sandbox/gcp-control-service.mjs', 'utf8');

test('Sandbox connectivity uses a dedicated Cloud Run subnet and regional internal load balancer only', () => {
  assert.equal(policy.serverlessSubnet.cidr, '10.128.41.0/26');
  assert.equal(policy.service.loadBalancerClass, 'networking.gke.io/l4-regional-internal');
  assert.equal(policy.service.externalTrafficPolicy, 'Local');
  assert.deepEqual(policy.service.sourceRanges, [policy.serverlessSubnet.cidr]);
  assert.match(policy.internalAddress.address, /^10\./u);
  assert.equal(policy.internalAddress.purpose, 'SHARED_LOADBALANCER_VIP');
  assert.equal(policy.boundaries.publicEndpoint, false);
  assert.equal(policy.boundaries.globalAccess, false);
  assert.equal(policy.boundaries.publicInvoker, false);
  assert.equal(policy.boundaries.paidExecution, false);
  assert.match(bootstrap, /loadBalancerClass: policy\.service\.loadBalancerClass/u);
  assert.match(bootstrap, /loadBalancerSourceRanges: policy\.service\.sourceRanges/u);
  assert.match(bootstrap, /field-manager=clervo-sandbox-bootstrap/u);
  assert.match(bootstrap, /policy\.healthCheckSourceRanges/u);
  assert.match(bootstrap, /loadBalancingScheme === 'INTERNAL'/u);
  assert.doesNotMatch(bootstrap, /allowGlobalAccess:\s*true|--allow-global-access/u);
});

test('controller NetworkPolicy admits only labelled in-cluster API, dedicated serverless CIDR, and Google health checks', () => {
  assert.equal(control.network.serverlessSubnetCidr, policy.serverlessSubnet.cidr);
  assert.deepEqual(control.network.healthCheckSourceRanges, policy.healthCheckSourceRanges);
  assert.match(controlBootstrap, /policy\.network\.serverlessSubnetCidr/u);
  assert.match(controlBootstrap, /policy\.network\.healthCheckSourceRanges/u);
  assert.match(controlBootstrap, /'clervo\.dev\/sandbox-api': 'true'/u);
  assert.doesNotMatch(JSON.stringify(control.network), /0\.0\.0\.0\/0/u);
});

test('connectivity apply is exact-project confirmation guarded and never targets the protected model gateway', () => {
  assert.match(bootstrap, /CLERVO_SANDBOX_CONNECTIVITY_CONFIRM/u);
  assert.match(bootstrap, /provision:private-sandbox-connectivity/u);
  assert.doesNotMatch(bootstrap, /ai\.clervo\.dev|run services delete|instances delete/u);
  assert.ok(policy.protectedResources.includes('ai.clervo.dev'));
});
