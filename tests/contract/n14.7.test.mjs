import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createHttpMonitoringExporter } from '../../apps/api/src/monitoring-exporter.mjs';
import { createSearchMonitor } from '../../dist/services/search/src/monitoring.js';

const now = '2026-08-02T11:00:00.000Z';

async function receiver(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test('bounded monitoring delivery is acknowledged and idempotent without customer payloads', async () => {
  const deliveries = [];
  const target = await receiver(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    deliveries.push({
      idempotencyKey: request.headers['idempotency-key'],
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    });
    response.writeHead(204);
    response.end();
  });
  const authorization = `Bearer ${Buffer.from('monitoring-fixture').toString('base64url')}`;
  try {
    const exporter = createHttpMonitoringExporter({
      endpoint: `${target.origin}/ingest`,
      authorization,
      allowInsecureLoopback: true,
    });
    const monitor = createSearchMonitor(exporter);
    monitor.record({
      timestamp: now,
      productId: 'search.web',
      outcome: 'execution_failure',
      durationSeconds: 0.25,
      operationId: 'op_0123456789abcdef0123456789abcdef',
    });
    const snapshot = monitor.snapshot(now);
    await exporter.export(snapshot);
    await exporter.export(snapshot);
    assert.equal(deliveries.length, 2);
    assert.equal(deliveries[0].idempotencyKey, deliveries[1].idempotencyKey);
    assert.equal(deliveries[0].authorization, authorization);
    assert.match(deliveries[0].idempotencyKey, /^monitor_[a-f0-9]{64}$/u);
    assert.equal(deliveries[0].body.snapshot.alerts[0].code, 'search.execution_failure');
    const serialized = JSON.stringify(deliveries[0].body);
    for (const forbidden of ['query', 'requestHash', 'wallet', 'credential', 'monitoring-fixture']) {
      assert.equal(serialized.includes(forbidden), false);
    }
  } finally {
    await target.close();
  }
});

test('redirects, failed receivers, unsafe endpoints, and oversized configuration fail closed', async () => {
  const redirect = await receiver((_request, response) => {
    response.writeHead(302, { location: 'https://example.com/redirected' });
    response.end();
  });
  try {
    const exporter = createHttpMonitoringExporter({
      endpoint: redirect.origin,
      allowInsecureLoopback: true,
    });
    await assert.rejects(exporter.export({ schemaVersion: 1 }), /monitoring_delivery_failed/u);
  } finally {
    await redirect.close();
  }
  assert.throws(() => createHttpMonitoringExporter({ endpoint: 'http://example.com/ingest' }), /invalid monitoring endpoint/u);
  assert.throws(() => createHttpMonitoringExporter({ endpoint: 'https://user:pass@example.com/ingest' }), /invalid monitoring endpoint/u);
  assert.throws(() => createHttpMonitoringExporter({ endpoint: 'https://example.com/ingest?token=value' }), /invalid monitoring endpoint/u);
  assert.throws(() => createHttpMonitoringExporter({ endpoint: 'https://example.com/ingest', authorization: 'bad\nheader' }), /invalid monitoring authorization/u);
});

test('production entrypoint and runbook preserve monitoring as a readiness boundary', async () => {
  const entrypoint = await readFile('apps/api/src/staging-search-main.mjs', 'utf8');
  const runbook = await readFile('docs/operations/PRODUCTION-INCIDENTS.md', 'utf8');
  assert.match(entrypoint, /production requires CLERVO_MONITORING_ENDPOINT/u);
  assert.match(entrypoint, /CLERVO_MONITORING_AUTHORIZATION/u);
  assert.match(runbook, /unknown settlement/u);
  assert.match(runbook, /do not fall back to memory state/u);
  assert.match(runbook, /preceding verified immutable image/u);
  assert.doesNotMatch(runbook, /token=|password=|Bearer /u);
});
