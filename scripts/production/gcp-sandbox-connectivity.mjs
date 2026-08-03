#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const policy = JSON.parse(await readFile(new URL('../../infra/production/gcp/sandbox-connectivity.v1.json', import.meta.url), 'utf8'));
const controlPolicy = JSON.parse(await readFile(new URL('../../infra/sandbox/control-service.v1.json', import.meta.url), 'utf8'));
const action = process.argv[2] ?? 'plan';

function fail(code) { throw new Error(`sandbox_private_connectivity_refused:${code}`); }

function run(command, args, { allowFailure = false, input } = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    if (allowFailure) return { ok: false, stdout: result.stdout?.trim() ?? '', stderr: result.stderr?.trim() ?? '' };
    fail(`${command}_${String(args[0] ?? 'command').replaceAll(/[^a-z0-9]+/giu, '_').toLowerCase()}_failed`);
  }
  return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function gcloud(args, options) { return run('gcloud', args, options); }
function kubectl(args, options) { return run('kubectl', args, options); }

function internalService() {
  return {
    apiVersion: 'v1', kind: 'Service',
    metadata: { name: policy.service.name, namespace: policy.systemNamespace, labels: { 'app.kubernetes.io/name': policy.controller, 'clervo.dev/exposure': 'private-vpc-only' } },
    spec: {
      type: 'LoadBalancer', loadBalancerClass: policy.service.loadBalancerClass, loadBalancerIP: policy.internalAddress.address,
      externalTrafficPolicy: policy.service.externalTrafficPolicy, trafficDistribution: policy.service.trafficDistribution,
      loadBalancerSourceRanges: policy.service.sourceRanges,
      selector: { 'app.kubernetes.io/name': policy.controller, 'clervo.dev/plane': 'sandbox-control' },
      ports: [{ name: 'http', port: policy.service.port, targetPort: 'http', protocol: 'TCP' }],
    },
  };
}

function controllerNetworkPolicy() {
  const appLabels = { 'app.kubernetes.io/name': policy.controller, 'clervo.dev/plane': 'sandbox-control' };
  return {
    apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy',
    metadata: { name: `${policy.controller}-boundary`, namespace: policy.systemNamespace },
    spec: {
      podSelector: { matchLabels: appLabels }, policyTypes: ['Ingress', 'Egress'],
      ingress: [{
        from: [
          { podSelector: { matchLabels: { 'clervo.dev/sandbox-api': 'true' } } },
          { ipBlock: { cidr: policy.serverlessSubnet.cidr } },
          ...policy.healthCheckSourceRanges.map((cidr) => ({ ipBlock: { cidr } })),
        ],
        ports: [{ protocol: 'TCP', port: policy.service.port }],
      }],
      egress: [{
        to: [
          { ipBlock: { cidr: controlPolicy.network.apiServiceIp } },
          { ipBlock: { cidr: controlPolicy.network.privateControlPlaneIp } },
        ],
        ports: [{ protocol: 'TCP', port: 443 }],
      }],
    },
  };
}

function ensureCredentials() {
  gcloud(['container', 'clusters', 'get-credentials', policy.cluster, '--project', policy.project, '--zone', policy.zone, '--internal-ip']);
}

function ensureSubnet() {
  const existing = gcloud(['compute', 'networks', 'subnets', 'describe', policy.serverlessSubnet.name, '--project', policy.project, '--region', policy.region, '--format=json'], { allowFailure: true });
  if (!existing.ok) {
    gcloud(['compute', 'networks', 'subnets', 'create', policy.serverlessSubnet.name, '--project', policy.project, '--region', policy.region, '--network', policy.network, '--range', policy.serverlessSubnet.cidr, '--enable-private-ip-google-access', '--quiet']);
    return true;
  }
  const subnet = JSON.parse(existing.stdout);
  assert.equal(subnet.ipCidrRange, policy.serverlessSubnet.cidr); assert.equal(subnet.privateIpGoogleAccess, true);
  assert.equal(subnet.network.endsWith(`/networks/${policy.network}`), true);
  return false;
}

function ensureAddress() {
  const existing = gcloud(['compute', 'addresses', 'describe', policy.internalAddress.name, '--project', policy.project, '--region', policy.region, '--format=json'], { allowFailure: true });
  if (!existing.ok) {
    gcloud(['compute', 'addresses', 'create', policy.internalAddress.name, '--project', policy.project, '--region', policy.region, '--subnet', policy.internalAddress.subnetwork, '--addresses', policy.internalAddress.address, '--purpose', policy.internalAddress.purpose, '--quiet']);
    return true;
  }
  const address = JSON.parse(existing.stdout);
  assert.equal(address.address, policy.internalAddress.address); assert.equal(address.purpose, policy.internalAddress.purpose);
  assert.equal(address.subnetwork.endsWith(`/subnetworks/${policy.internalAddress.subnetwork}`), true);
  return false;
}

function observe() {
  ensureCredentials();
  const subnet = JSON.parse(gcloud(['compute', 'networks', 'subnets', 'describe', policy.serverlessSubnet.name, '--project', policy.project, '--region', policy.region, '--format=json']).stdout);
  const address = JSON.parse(gcloud(['compute', 'addresses', 'describe', policy.internalAddress.name, '--project', policy.project, '--region', policy.region, '--format=json']).stdout);
  const service = JSON.parse(kubectl(['get', 'service', policy.service.name, '-n', policy.systemNamespace, '-o', 'json']).stdout);
  const networkPolicy = JSON.parse(kubectl(['get', 'networkpolicy', `${policy.controller}-boundary`, '-n', policy.systemNamespace, '-o', 'json']).stdout);
  const forwarding = JSON.parse(gcloud(['compute', 'forwarding-rules', 'list', '--project', policy.project, `--filter=region:(${policy.region}) AND IPAddress=${policy.internalAddress.address}`, '--format=json']).stdout);
  const ingressCidrs = (networkPolicy.spec?.ingress ?? []).flatMap(({ from = [] }) => from.map(({ ipBlock }) => ipBlock?.cidr).filter(Boolean));
  const result = {
    serverlessSubnet: subnet.name, serverlessCidr: subnet.ipCidrRange, privateGoogleAccess: subnet.privateIpGoogleAccess,
    address: address.address, addressPurpose: address.purpose, serviceType: service.spec?.type,
    loadBalancerClass: service.spec?.loadBalancerClass, loadBalancerIp: service.status?.loadBalancer?.ingress?.[0]?.ip ?? null,
    sourceRanges: service.spec?.loadBalancerSourceRanges ?? [], externalTrafficPolicy: service.spec?.externalTrafficPolicy,
    forwardingRules: forwarding.map(({ name, loadBalancingScheme, IPAddress, allowGlobalAccess }) => ({ name, loadBalancingScheme, IPAddress, allowGlobalAccess: allowGlobalAccess === true })),
    networkPolicyIngressCidrs: ingressCidrs, publicEndpoint: false, globalAccess: false,
  };
  assert.equal(result.serverlessCidr, policy.serverlessSubnet.cidr); assert.equal(result.privateGoogleAccess, true);
  assert.equal(result.address, policy.internalAddress.address); assert.equal(result.addressPurpose, policy.internalAddress.purpose);
  assert.equal(result.serviceType, 'LoadBalancer'); assert.equal(result.loadBalancerClass, policy.service.loadBalancerClass);
  assert.equal(result.loadBalancerIp, policy.internalAddress.address); assert.deepEqual(result.sourceRanges, policy.service.sourceRanges);
  assert.equal(result.externalTrafficPolicy, policy.service.externalTrafficPolicy);
  assert.ok(policy.service.sourceRanges.every((cidr) => ingressCidrs.includes(cidr)));
  assert.ok(policy.healthCheckSourceRanges.every((cidr) => ingressCidrs.includes(cidr)));
  assert.ok(result.forwardingRules.length >= 1 && result.forwardingRules.every(({ loadBalancingScheme, IPAddress, allowGlobalAccess }) => loadBalancingScheme === 'INTERNAL' && IPAddress === policy.internalAddress.address && allowGlobalAccess === false));
  return result;
}

let result;
if (action === 'plan') result = { action: 'plan', ...policy, mutation: false };
else if (action === 'apply') {
  assert.equal(process.env.CLERVO_SANDBOX_CONNECTIVITY_CONFIRM, `provision:private-sandbox-connectivity:${policy.project}`, 'owner confirmation mismatch');
  const subnetCreated = ensureSubnet(); const addressCreated = ensureAddress(); ensureCredentials();
  kubectl(['apply', '--server-side=true', '--field-manager=clervo-sandbox-bootstrap', '--force-conflicts=false', '-f', '-'], { input: JSON.stringify(controllerNetworkPolicy()) });
  kubectl(['apply', '--server-side=true', '--field-manager=clervo-sandbox-connectivity', '--force-conflicts=false', '-f', '-'], { input: JSON.stringify(internalService()) });
  kubectl(['wait', '--for=jsonpath={.status.loadBalancer.ingress[0].ip}', `service/${policy.service.name}`, '-n', policy.systemNamespace, '--timeout=300s']);
  result = { action: 'private-connectivity-provisioned', subnetCreated, addressCreated, ...observe() };
} else if (action === 'observe') result = { action: 'observed', ...observe() };
else fail('usage_plan_apply_observe');

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
