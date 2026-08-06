#!/usr/bin/env node

import { createRecordedSearchExecutor } from '../../../dist/services/search/src/recorded-pipeline.js';
import { createLiveExternalSearchExecutor } from '../../../dist/services/search/src/live-external-pipeline.js';
import { createSearchMonitor } from '../../../dist/services/search/src/monitoring.js';
import { createSearchServer } from './search-server.mjs';
import {
  InMemorySearchStateStore,
  createPostgresSearchStateStoreFromEnvironment,
} from './search-state-store.mjs';
import { createHttpMonitoringExporter, createSentryMonitoringExporter } from './monitoring-exporter.mjs';
import { createTrafficControl } from './traffic-control.mjs';
import { createX402ChallengeService } from './x402-resource.mjs';
import { createPostgresX402OperationStoreFromEnvironment } from './x402-operation-store.mjs';
import { createSandboxPrivateGateway } from './sandbox-private-gateway.mjs';
import { createPostgresSandboxOperationStoreFromEnvironment } from './sandbox-operation-store.mjs';
import { createAiProductionRuntime } from './ai-production-runtime.mjs';
import { createAiArtifactRuntime } from './ai-artifact-runtime.mjs';

const environment = process.env.CLERVO_ENV ?? 'staging';
const releaseId = process.env.CLERVO_RELEASE_ID;
const host = process.env.CLERVO_HTTP_HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? process.env.CLERVO_HTTP_PORT ?? '8080');
const publicOrigin = process.env.CLERVO_PUBLIC_ORIGIN ?? 'https://unverified.invalid';
const privateMockCommerceEnabled = process.env.CLERVO_STAGE4_PRIVATE_MOCK_COMMERCE === 'enabled';
const stateBackend = process.env.CLERVO_STATE_BACKEND ?? 'memory';
const maxConcurrentExecutions = Number(process.env.CLERVO_MAX_CONCURRENT_EXECUTIONS ?? '16');
const monitoringEndpoint = process.env.CLERVO_MONITORING_ENDPOINT;
const sentryDsn = process.env.CLERVO_SENTRY_DSN;
const monitoringDriver = process.env.CLERVO_MONITORING_DRIVER ?? 'http';
const trafficControl = createTrafficControl(process.env.CLERVO_TRAFFIC_MODE ?? 'open');
const x402Mode = process.env.CLERVO_X402_MODE ?? 'disabled';
const sandboxMode = process.env.CLERVO_SANDBOX_MODE ?? 'disabled';
const searchMode = process.env.CLERVO_SEARCH_MODE ?? 'recorded';
const edgeAuthorization = process.env.CLERVO_EDGE_AUTHORIZATION;
const aiMode = process.env.CLERVO_AI_MODE ?? 'disabled';
const sandboxPublicMode = process.env.CLERVO_SANDBOX_PUBLIC_MODE ?? 'disabled';
const aiArtifactMode = process.env.CLERVO_AI_ARTIFACT_MODE ?? 'disabled';

if (!releaseId) throw new Error('CLERVO_RELEASE_ID is required');
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('invalid HTTP port');
if (!['memory', 'postgres'].includes(stateBackend)) throw new Error('invalid CLERVO_STATE_BACKEND');
if (environment === 'production' && stateBackend !== 'postgres') throw new Error('production requires CLERVO_STATE_BACKEND=postgres');
if (environment === 'production' && monitoringDriver !== 'sentry') throw new Error('production requires CLERVO_MONITORING_DRIVER=sentry');
if (environment === 'production' && !sentryDsn) throw new Error('production requires CLERVO_SENTRY_DSN');
if (!['disabled', 'challenge_only', 'settlement_enabled'].includes(x402Mode)) throw new Error('invalid CLERVO_X402_MODE');
if (!['disabled', 'private'].includes(sandboxMode)) throw new Error('invalid CLERVO_SANDBOX_MODE');
if (!['recorded', 'live_external'].includes(searchMode)) throw new Error('invalid CLERVO_SEARCH_MODE');
if (!['disabled', 'paid'].includes(aiMode)) throw new Error('invalid CLERVO_AI_MODE');
if (!['disabled', 'paid'].includes(sandboxPublicMode)) throw new Error('invalid CLERVO_SANDBOX_PUBLIC_MODE');
if (!['disabled', 'r2'].includes(aiArtifactMode)) throw new Error('invalid CLERVO_AI_ARTIFACT_MODE');
if (environment === 'production' && searchMode === 'live_external' && (typeof edgeAuthorization !== 'string' || edgeAuthorization.length < 32 || edgeAuthorization.length > 512)) throw new Error('production live search requires edge authorization');
if (x402Mode !== 'disabled' && stateBackend !== 'postgres') throw new Error('x402 requires PostgreSQL state');
if (x402Mode !== 'disabled' && (typeof process.env.CLERVO_MPP_SECRET_KEY !== 'string' || Buffer.byteLength(process.env.CLERVO_MPP_SECRET_KEY) < 32)) throw new Error('x402 commerce requires MPP secret key');
if (sandboxMode !== 'disabled' && stateBackend !== 'postgres') throw new Error('sandbox requires PostgreSQL state');
if (aiMode === 'paid' && (x402Mode !== 'settlement_enabled' || stateBackend !== 'postgres')) throw new Error('public AI requires production x402 and PostgreSQL state');
if (sandboxPublicMode === 'paid' && (sandboxMode !== 'private' || x402Mode !== 'settlement_enabled' || stateBackend !== 'postgres' || !/^sha256:[a-f0-9]{64}$/u.test(process.env.CLERVO_SANDBOX_RUNNER_DIGEST ?? ''))) throw new Error('public Sandbox requires qualified private execution, production x402, PostgreSQL state, and an exact runner digest');
if (privateMockCommerceEnabled && (environment !== 'stage4-private-qualification' || !['127.0.0.1', 'localhost'].includes(new URL(publicOrigin).hostname))) {
  throw new Error('private_mock_commerce_boundary_invalid');
}
const stateStore = stateBackend === 'postgres'
  ? await createPostgresSearchStateStoreFromEnvironment()
  : new InMemorySearchStateStore({ environmentNamespace: 'local' });
const x402StateStore = x402Mode === 'disabled' ? undefined : createPostgresX402OperationStoreFromEnvironment();
const x402Service = x402Mode === 'disabled' ? undefined : await createX402ChallengeService({
  facilitatorUrl: process.env.CLERVO_X402_FACILITATOR_URL,
  keyId: process.env.CLERVO_X402_FACILITATOR_KEY_ID,
  keySecret: process.env.CLERVO_X402_FACILITATOR_KEY_SECRET,
  network: process.env.CLERVO_X402_NETWORK,
  asset: process.env.CLERVO_X402_ASSET,
  payTo: process.env.CLERVO_X402_PAY_TO,
  publicOrigin,
  paymentMode: x402Mode,
  mppSecretKey: process.env.CLERVO_MPP_SECRET_KEY,
});
const sandboxStateStore = sandboxMode === 'disabled' ? undefined : await createPostgresSandboxOperationStoreFromEnvironment();
const sandboxGateway = sandboxMode === 'disabled' ? undefined : createSandboxPrivateGateway({
  controlOrigin: process.env.CLERVO_SANDBOX_CONTROL_ORIGIN,
  controlToken: process.env.CLERVO_SANDBOX_CONTROL_TOKEN,
  stateStore: sandboxStateStore,
  environment,
});
const executor = searchMode === 'live_external'
  ? createLiveExternalSearchExecutor({
    primaryCredential: process.env.CLERVO_SEARCH_PRIMARY_KEY ?? '',
    fallbackCredential: process.env.CLERVO_SEARCH_FALLBACK_KEY ?? '',
    primaryCallCeiling: Number(process.env.CLERVO_SEARCH_PRIMARY_CALL_CEILING ?? '1000'),
    fallbackCallCeiling: Number(process.env.CLERVO_SEARCH_FALLBACK_CALL_CEILING ?? '2500'),
  })
  : createRecordedSearchExecutor();
const aiArtifactRuntime = aiArtifactMode === 'r2' ? createAiArtifactRuntime() : undefined;
const aiRuntime = aiMode === 'paid' ? await createAiProductionRuntime({ artifactStoreFactory: aiArtifactRuntime?.forAuthorization }) : undefined;

const monitoringExporter = monitoringDriver === 'sentry'
  ? createSentryMonitoringExporter({ dsn: sentryDsn, environment, release: releaseId })
  : monitoringEndpoint
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
  executor,
  monitor,
  environment,
  releaseId,
  publicOrigin,
  allowMockPaidExecution: privateMockCommerceEnabled,
  stateStore,
  maxConcurrentExecutions,
  trafficControl,
  x402Service,
  x402StateStore,
  sandboxGateway,
  sandboxApiToken: sandboxMode === 'disabled' ? undefined : process.env.CLERVO_SANDBOX_API_TOKEN,
  synthesisEnabled: searchMode !== 'live_external',
  retrievalMode: searchMode,
  edgeAuthorization,
  aiPublicPricing: aiRuntime?.publicPricing,
  aiAdapters: aiRuntime?.adapters,
  aiAdapterFactory: aiRuntime?.adapterFactory,
  aiArtifactAccess: aiArtifactRuntime,
  sandboxPublicRunnerDigest: sandboxPublicMode === 'paid' ? process.env.CLERVO_SANDBOX_RUNNER_DIGEST : undefined,
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
        await x402StateStore?.close();
        await sandboxGateway?.close();
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
    paidExecutionEnabled: privateMockCommerceEnabled || x402Mode === 'settlement_enabled',
    stateBackend: stateStore.kind,
    durableState: stateStore.durable,
    maxConcurrentExecutions,
    monitoringDelivery: monitoringDriver === 'sentry' ? 'sentry' : monitoringEndpoint ? 'https' : 'stdout',
    trafficMode: trafficControl.snapshot().mode,
    retrievalMode: searchMode,
    sandboxPrivateEnabled: sandboxMode === 'private',
    aiPaidEnabled: aiMode === 'paid',
    aiRouteFamilies: aiRuntime?.families ?? [],
    sandboxPaidEnabled: sandboxPublicMode === 'paid',
  }));
});
