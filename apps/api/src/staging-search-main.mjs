#!/usr/bin/env node

import { createRecordedSearchExecutor } from '../../../dist/services/search/src/recorded-pipeline.js';
import { createSearchMonitor } from '../../../dist/services/search/src/monitoring.js';
import { createSearchServer } from './search-server.mjs';
import {
  InMemorySearchStateStore,
  createPostgresSearchStateStoreFromEnvironment,
} from './search-state-store.mjs';
import { createHttpMonitoringExporter } from './monitoring-exporter.mjs';
import { createTrafficControl } from './traffic-control.mjs';

const environment = process.env.CLERVO_ENV ?? 'staging';
const releaseId = process.env.CLERVO_RELEASE_ID;
const host = process.env.CLERVO_HTTP_HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? process.env.CLERVO_HTTP_PORT ?? '8080');
const publicOrigin = process.env.CLERVO_PUBLIC_ORIGIN ?? 'https://unverified.invalid';
const privateMockCommerceEnabled = process.env.CLERVO_STAGE4_PRIVATE_MOCK_COMMERCE === 'enabled';
const stateBackend = process.env.CLERVO_STATE_BACKEND ?? 'memory';
const maxConcurrentExecutions = Number(process.env.CLERVO_MAX_CONCURRENT_EXECUTIONS ?? '16');
const monitoringEndpoint = process.env.CLERVO_MONITORING_ENDPOINT;
const trafficControl = createTrafficControl(process.env.CLERVO_TRAFFIC_MODE ?? 'open');

if (!releaseId) throw new Error('CLERVO_RELEASE_ID is required');
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('invalid HTTP port');
if (!['memory', 'postgres'].includes(stateBackend)) throw new Error('invalid CLERVO_STATE_BACKEND');
if (environment === 'production' && stateBackend !== 'postgres') throw new Error('production requires CLERVO_STATE_BACKEND=postgres');
if (environment === 'production' && !monitoringEndpoint) throw new Error('production requires CLERVO_MONITORING_ENDPOINT');
if (privateMockCommerceEnabled && (environment !== 'stage4-private-qualification' || !['127.0.0.1', 'localhost'].includes(new URL(publicOrigin).hostname))) {
  throw new Error('private_mock_commerce_boundary_invalid');
}
const stateStore = stateBackend === 'postgres'
  ? await createPostgresSearchStateStoreFromEnvironment()
  : new InMemorySearchStateStore({ environmentNamespace: 'local' });

const monitoringExporter = monitoringEndpoint
  ? createHttpMonitoringExporter({
      endpoint: monitoringEndpoint,
      authorization: process.env.CLERVO_MONITORING_AUTHORIZATION,
    })
  : {
      export(snapshot) {
        console.log(JSON.stringify({ event: 'clervo.search.monitoring_snapshot', snapshot }));
      },
    };
const monitor = createSearchMonitor(monitoringExporter);
const server = createSearchServer({
  executor: createRecordedSearchExecutor(),
  monitor,
  environment,
  releaseId,
  publicOrigin,
  allowMockPaidExecution: privateMockCommerceEnabled,
  stateStore,
  maxConcurrentExecutions,
  trafficControl,
});

const exportTimer = setInterval(() => {
  void monitor.exportSnapshot(new Date().toISOString());
}, 60_000);
exportTimer.unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    clearInterval(exportTimer);
    server.close(async (error) => {
      if (error) {
        console.error(JSON.stringify({ event: 'clervo.search.shutdown_failed', message: error.message }));
        process.exitCode = 1;
      }
      try {
        await stateStore.close();
      } catch {
        console.error(JSON.stringify({ event: 'clervo.search.state_shutdown_failed' }));
        process.exitCode = 1;
      }
    });
  });
}

server.listen(port, host, () => {
  console.log(JSON.stringify({
    event: 'clervo.search.started',
    environment,
    releaseId,
    host,
    port,
    paidExecutionEnabled: privateMockCommerceEnabled,
    stateBackend: stateStore.kind,
    durableState: stateStore.durable,
    maxConcurrentExecutions,
    monitoringDelivery: monitoringEndpoint ? 'https' : 'stdout',
    trafficMode: trafficControl.snapshot().mode,
    retrievalMode: 'recorded',
  }));
});
