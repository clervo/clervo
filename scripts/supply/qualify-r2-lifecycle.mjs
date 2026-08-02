import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { R2ObjectStore, createBoundedObjectStorageTransport } from '../../dist/adapters/storage/src/r2-object-store.js';

const endpoint = process.env.R2_S3_ENDPOINT;
const bucket = process.env.R2_BUCKET_NAME;
const accessIdentifier = process.env.R2_ACCESS_KEY_ID;
const secretCredential = process.env.R2_SECRET_ACCESS_KEY;
if (!endpoint || !bucket || !accessIdentifier || !secretCredential) throw new Error('R2 lifecycle credentials, endpoint, and bucket are required');

const tenantId = 'tenant_R2QUALIFICATION2026';
const payload = new TextEncoder().encode('Clervo synthetic R2 lifecycle qualification artifact v1');
const digest = createHash('sha256').update(payload).digest('hex');
const observations = [];
const boundedTransport = createBoundedObjectStorageTransport();
const transport = async (request) => {
  const started = performance.now();
  try {
    const response = await boundedTransport(request);
    observations.push({ operation: request.method === 'PUT' ? 'write' : request.method === 'DELETE' ? 'delete' : 'read', method: request.method, status: response.status, latencyMs: Math.round(performance.now() - started), requestBytes: request.body?.byteLength ?? 0, responseBytes: response.body.byteLength });
    return response;
  } catch (error) {
    observations.push({ operation: request.method === 'PUT' ? 'write' : request.method === 'DELETE' ? 'delete' : 'read', method: request.method, status: null, latencyMs: Math.round(performance.now() - started), requestBytes: request.body?.byteLength ?? 0, responseBytes: null, failureCode: error instanceof Error && /^object_storage_[a-z0-9_]+$/u.test(error.message) ? error.message : 'object_storage_transport_failed' });
    throw error;
  }
};

const config = {
  endpoint,
  bucket,
  accessKeyId: accessIdentifier,
  secretAccessKey: secretCredential,
  maximumObjectBytes: 1024,
  maximumStoredBytesPerProcess: 1024,
  maximumWritesPerProcess: 1,
  maximumReadsPerProcess: 2,
  maximumDeletesPerProcess: 1,
};
const store = new R2ObjectStore(config, transport);
let writePassed = false;
let integrityPassed = false;
let deletePassed = false;
let absentAfterDelete = false;
let cleanupRequired = false;
let cleanupPassed = false;

try {
  const stored = await store.put(tenantId, payload, 'text/plain');
  writePassed = stored.sha256 === `sha256:${digest}` && !stored.artifactUri.includes('cloudflare');
  const fetched = await store.get(tenantId, digest);
  integrityPassed = Buffer.from(fetched).equals(Buffer.from(payload));
  await store.delete(tenantId, digest);
  deletePassed = true;
  try {
    await store.get(tenantId, digest);
  } catch (error) {
    absentAfterDelete = error instanceof Error && error.message === 'object_storage_integrity_failed' && observations.at(-1)?.status === 404;
  }
} finally {
  if (writePassed && !deletePassed) {
    cleanupRequired = true;
    const cleanupStore = new R2ObjectStore({ ...config, maximumReadsPerProcess: 0 }, transport);
    try {
      await cleanupStore.delete(tenantId, digest);
      cleanupPassed = true;
    } catch {
      cleanupPassed = false;
    }
  }
}

const passed = writePassed && integrityPassed && deletePassed && absentAfterDelete && (!cleanupRequired || cleanupPassed);
const latencies = observations.map(({ latencyMs }) => latencyMs).sort((a, b) => a - b);
const report = {
  schemaVersion: 'clervo.r2-lifecycle-qualification.v1',
  evaluatedAt: new Date().toISOString(),
  serviceId: 'supply.cloudflare_r2',
  endpointClass: 'account_scoped_r2_https',
  bucketClass: 'dedicated_clervo_bucket',
  ownerCashSpentUsd: 0,
  externalCalls: observations.length,
  objectWriteCalls: observations.filter(({ operation }) => operation === 'write').length,
  objectReadCalls: observations.filter(({ operation }) => operation === 'read').length,
  deleteCalls: observations.filter(({ operation }) => operation === 'delete').length,
  credentialSlotsUsed: 1,
  credentialScope: 'object_read_write_single_bucket',
  inputPolicy: { customerObjectDataUsed: false, deterministicSyntheticPayloadUsed: true, objectKeyRecorded: false, responsePayloadValuesRecorded: false },
  objectPolicy: { syntheticObjectBytes: payload.byteLength, objectRetained: !deletePassed || !absentAfterDelete, publicAccessEnabled: false },
  operationBudget: { maximumObjectBytes: 1024, maximumStoredBytesPerProcess: 1024, maximumWritesPerProcess: 1, maximumReadsPerProcess: 2, maximumDeletesPerProcess: 1, observed: store.usage },
  summary: {
    writePassed,
    integrityPassed,
    deletePassed,
    absentAfterDelete,
    cleanupRequired,
    cleanupPassed,
    latencyMsP50: latencies[Math.floor((latencies.length - 1) * 0.5)],
    latencyMsP95: latencies[Math.ceil((latencies.length - 1) * 0.95)],
    technicalStatus: passed ? 'passed' : 'failed',
    productionStatus: passed ? 'qualified_bounded_adapter' : 'blocked_lifecycle_failed',
  },
  observations,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!passed) process.exitCode = 1;
