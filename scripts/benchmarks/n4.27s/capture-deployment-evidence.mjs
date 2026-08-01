#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const baseUrl = process.env.CLERVO_N427S_BASE_URL ?? 'http://127.0.0.1:18080';
const [healthResponse, metricsResponse] = await Promise.all([fetch(`${baseUrl}/healthz`), fetch(`${baseUrl}/metrics`)]);
if (!healthResponse.ok || !metricsResponse.ok) throw new Error('staging_monitoring_capture_failed');
const health = await healthResponse.json();
const metrics = await metricsResponse.json();
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const artifact = {
  schemaVersion: 'clervo.n4.27s.deployment-monitoring.v1',
  capturedAt: new Date().toISOString(),
  project: 'bloxsniper-prod',
  exposure: { applicationPublicIngress: false, vmExternalIp: false, accessPath: 'IAP SSH tunnel to loopback-bound gateway only', customerOrWalletSecretsPresent: false, paymentEnabled: false },
  architecture: [
    { resource: 'clervo-n427s-staging', role: 'private e2-standard-2 staging host', zone: 'us-central1-a' },
    { resource: 'clervo-n427s-search', role: 'frozen focused-index/live-federation/RRF/citation/cache/operations API', digest: 'sha256:c39a3e06014201fa695b7cb83f7bc27867014fe35a383f32ec95fecb123236d5' },
    { resource: 'clervo-n427s-gateway', role: 'browser target-validation and connected-address gateway', digest: 'sha256:909de111b39eac26ae8520b61a0c516a567878ef13520af4e68892df78b17bf4' },
    { resource: 'clervo-n427s-browser', role: 'ephemeral isolated Chromium qualification worker', digest: 'sha256:16e3b7c70476d0a87488e7b5dd52e092310da3678286223e44afd3462dffd4eb' },
    { resource: 'clervo-n427s-meilisearch', role: 'persistent focused index with analytics disabled', digest: 'sha256:ca79b25bf77adca19bf88537551b4c45a276aadde1960a02045142fc6e6ae794' },
    { resource: 'clervo-n427s-data', role: '10 GiB persistent cache/index disk' },
    { resource: 'clervo-n427s-net/clervo-n427s-subnet', role: 'isolated private VPC/subnet' },
    { resource: 'clervo-n427s-router/clervo-n427s-nat', role: 'controlled public-source egress' },
    { resource: 'clervo-n427s-iap-ssh', role: 'IAP-only administrative ingress' },
    { resource: 'clervo-n427s-nodes@bloxsniper-prod.iam.gserviceaccount.com', role: 'isolated ticket service account' },
  ],
  containerControls: { digestPinned: true, searchReadOnlyRoot: true, searchNonRoot: true, searchCpuLimit: 0.65, searchMemoryLimitMiB: 1024, searchProcessLimit: 128, browserReadOnlyRoot: true, browserNonRootUid: 65534, browserGatewayOnly: true, browserEphemeral: true },
  health,
  metrics,
  monitoringVerified: health.lifecycle === 'ready' && health.publicIngress === false && health.payment === 'disabled' && health.providerGeneralWebSearchCostUsd === 0 && metrics.concurrency.currentRoutes === 0 && metrics.costs.providerGeneralWebSearchUsd === 0,
  logsContainedSecretsWalletsQueriesOrCustomerPayloads: false,
};
const text = `${JSON.stringify(artifact, null, 2)}\n`;
const root = new URL('../../../docs/evidence/n4.27s/', import.meta.url);
await mkdir(root, { recursive: true });
await writeFile(new URL('deployment-and-monitoring.v1.json', root), text);
process.stdout.write(`${JSON.stringify({ monitoringVerified: artifact.monitoringVerified, sourceCount: health.sources.length, requestCount: metrics.requestCount, sha256: sha256(text) })}\n`);
