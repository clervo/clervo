import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import { AgentSandboxExecutor } from '../../../dist/adapters/sandbox/src/agent-sandbox.js';
import { KubernetesAgentSandboxTransport } from '../../../dist/adapters/sandbox/src/kubernetes-client-transport.js';
import { createSandboxOperationResult, assertSandboxOperationRequest } from '../../../dist/packages/contracts/src/sandbox.js';
import { SandboxControlPlane } from '../../../dist/services/sandbox/src/control-plane.js';
import { SandboxImageRegistry } from '../../../dist/services/sandbox/src/image-registry.js';

const JSON_TYPE = 'application/json; charset=utf-8';
const PROBLEM_TYPE = 'application/problem+json; charset=utf-8';
const maximumBodyBytes = 1_500_000;

function problem(status, code, title, detail) {
  return { type: `https://api.clervo.dev/problems/${code}`, status, code, title, detail };
}

function send(response, status, body, contentType = JSON_TYPE, headers = {}) {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, { 'content-type': contentType, 'content-length': String(bytes.byteLength), 'cache-control': 'no-store', ...headers });
  response.end(bytes);
}

function authorized(value, expected) {
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(value.slice(7)); const required = Buffer.from(expected);
  return supplied.byteLength === required.byteLength && timingSafeEqual(supplied, required);
}

async function body(request) {
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.byteLength;
    if (bytes > maximumBodyBytes) throw new Error('sandbox_control_body_too_large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('sandbox_control_json_invalid'); }
}

function identity(prefix, value) {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

function requestHash(tenantId, value) {
  return createHash('sha256').update(tenantId).update('\0').update(JSON.stringify(value)).digest('hex');
}

function safeFailure(error) {
  const message = error instanceof Error ? error.message : '';
  if (/deadline/u.test(message)) return [408, 'sandbox_deadline_exceeded', 'Sandbox deadline exceeded'];
  if (/image_unavailable/u.test(message)) return [409, 'sandbox_image_unavailable', 'Sandbox image unavailable'];
  if (/idempotency_conflict/u.test(message)) return [409, 'sandbox_idempotency_conflict', 'Sandbox idempotency conflict'];
  if (/body_too_large/u.test(message)) return [413, 'sandbox_request_too_large', 'Sandbox request too large'];
  if (/request_|json_invalid|identity_invalid|limit_invalid|create_invalid/u.test(message)) return [400, 'sandbox_request_invalid', 'Sandbox request invalid'];
  if (/cleanup_unknown|quarantined/u.test(message)) return [503, 'sandbox_cleanup_unknown', 'Sandbox cleanup state is unknown'];
  return [503, 'sandbox_execution_unavailable', 'Sandbox execution unavailable'];
}

export function createSandboxControlServer(input) {
  if (typeof input?.token !== 'string' || input.token.length < 32 || input.token.length > 512) throw new TypeError('sandbox_control_token_invalid');
  if (!input.plane || typeof input.ready !== 'function') throw new TypeError('sandbox_control_dependencies_invalid');
  const completed = new Map(); const inFlight = new Map(); let active = 0; let draining = false;

  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://sandbox-control.invalid').pathname;
    if (request.method === 'GET' && path === '/healthz') { send(response, 200, { status: 'ok' }); return; }
    if (request.method === 'GET' && path === '/readyz') {
      if (draining) { send(response, 503, problem(503, 'sandbox_control_draining', 'Sandbox control is draining', 'New execution is disabled.'), PROBLEM_TYPE); return; }
      try { await input.ready(); send(response, 200, { status: 'ready', public: false }); }
      catch { send(response, 503, problem(503, 'sandbox_control_unready', 'Sandbox control is unavailable', 'The private execution plane is not ready.'), PROBLEM_TYPE); }
      return;
    }
    if (request.method !== 'POST' || path !== '/internal/v1/sandbox/run') { send(response, 404, problem(404, 'not_found', 'Not found', 'No matching private control route.'), PROBLEM_TYPE); return; }
    if (!authorized(request.headers.authorization, input.token)) { send(response, 401, problem(401, 'sandbox_control_unauthorized', 'Unauthorized', 'Private control authentication is required.'), PROBLEM_TYPE); return; }
    const tenantId = request.headers['x-clervo-tenant-id'];
    if (typeof tenantId !== 'string' || !/^tenant_[A-Za-z0-9]{20,64}$/u.test(tenantId)) { send(response, 400, problem(400, 'sandbox_tenant_invalid', 'Sandbox tenant invalid', 'A canonical tenant identity is required.'), PROBLEM_TYPE); return; }
    if (draining || active >= 2) { send(response, 503, problem(503, 'sandbox_control_overloaded', 'Sandbox control overloaded', 'Retry this exact request after the private plane recovers.'), PROBLEM_TYPE, { 'retry-after': '2' }); return; }
    let value;
    try { value = await body(request); assertSandboxOperationRequest(value); }
    catch (error) { const [status, code, title] = safeFailure(error); send(response, status, problem(status, code, title, 'The request failed closed before execution.'), PROBLEM_TYPE); return; }
    if (value.productId !== 'sandbox.run' || value.input.kind !== 'run') { send(response, 409, problem(409, 'sandbox_operation_unavailable', 'Sandbox operation unavailable', 'Only private one-shot execution is enabled on this control candidate.'), PROBLEM_TYPE); return; }
    const now = Date.now();
    if (Date.parse(value.deadlineAt) <= now + value.input.limits.wallTimeMs + 1_000) { send(response, 408, problem(408, 'sandbox_deadline_exceeded', 'Sandbox deadline exceeded', 'The remaining deadline cannot contain the bounded execution.'), PROBLEM_TYPE); return; }
    const hash = requestHash(tenantId, value); const prior = completed.get(value.operationId);
    if (prior) {
      if (prior.hash !== hash) { send(response, 409, problem(409, 'sandbox_idempotency_conflict', 'Sandbox idempotency conflict', 'The operation identity is bound to another request.'), PROBLEM_TYPE); return; }
      send(response, 200, prior.result, JSON_TYPE, { 'x-clervo-replay': 'true' }); return;
    }
    const activeHash = inFlight.get(value.operationId);
    if (activeHash !== undefined) {
      if (activeHash !== hash) { send(response, 409, problem(409, 'sandbox_idempotency_conflict', 'Sandbox idempotency conflict', 'The operation identity is bound to another request.'), PROBLEM_TYPE); return; }
      send(response, 409, problem(409, 'sandbox_operation_in_progress', 'Sandbox operation in progress', 'Reconcile this operation before retrying.'), PROBLEM_TYPE, { 'retry-after': '2' }); return;
    }
    inFlight.set(value.operationId, hash); active += 1;
    const sessionId = identity('sbx', `${tenantId}:${value.operationId}`);
    const limits = { ...value.input.limits, maximumChargeMicrousd: Number(value.maximumCharge.amountAtomic) };
    let created = false;
    try {
      await input.plane.create({ sessionId, tenantId, imageDigest: value.input.imageDigest, limits, ttlMs: Math.min(900_000, Math.max(1_000, limits.wallTimeMs + 60_000)) }); created = true;
      const observed = await input.plane.execute({ sessionId, executionId: value.input.executionId, tenantId, command: value.input.command, stdin: value.input.stdinBase64 ? Buffer.from(value.input.stdinBase64, 'base64') : new Uint8Array(), files: value.input.files, artifactPaths: value.input.artifactPaths });
      await input.plane.destroy(sessionId, tenantId); created = false;
      const result = createSandboxOperationResult({
        request: value, completedAt: new Date().toISOString(), meteredCharge: { asset: 'USD', amountAtomic: '0', decimals: 6 },
        output: { kind: 'execution', sessionId, executionId: observed.executionId, sessionState: 'destroyed', exitCode: observed.exitCode, stdoutBase64: Buffer.from(observed.stdout).toString('base64'), stderrBase64: Buffer.from(observed.stderr).toString('base64'), cpuMillis: observed.cpuMillis, durationMs: observed.durationMs, artifacts: (observed.artifacts ?? []).map((artifact) => ({ artifactId: `art_${artifact.sha256.slice('sha256:'.length, 'sha256:'.length + 32)}`, filename: artifact.filename, mimeType: artifact.mimeType, bytes: artifact.bytes, sha256: artifact.sha256, artifactUri: `artifact://generated/${tenantId}/${artifact.sha256.slice('sha256:'.length)}`, scan: { verdict: 'not_scanned', scannerVersion: null }, contentBase64: artifact.contentBase64 })) },
      });
      completed.set(value.operationId, { hash, result });
      while (completed.size > 256) completed.delete(completed.keys().next().value);
      send(response, 200, result, JSON_TYPE, { 'x-clervo-replay': 'false' });
    } catch (error) {
      let failure = error;
      if (created) { try { await input.plane.destroy(sessionId, tenantId); } catch { failure = new Error('sandbox_cleanup_unknown'); } }
      const [status, code, title] = safeFailure(failure); send(response, status, problem(status, code, title, 'Execution did not produce a customer result or charge.'), PROBLEM_TYPE);
    } finally { inFlight.delete(value.operationId); active -= 1; }
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  server.on('close', () => { draining = true; });
  server.headersTimeout = 5_000; server.requestTimeout = 20_000; server.keepAliveTimeout = 5_000; server.maxRequestsPerSocket = 100;
  return server;
}

async function main() {
  const token = process.env.CLERVO_SANDBOX_CONTROL_TOKEN;
  const repository = process.env.CLERVO_SANDBOX_RUNNER_REPOSITORY;
  const digest = process.env.CLERVO_SANDBOX_RUNNER_DIGEST;
  if (!token || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\/[a-z0-9][a-z0-9._/-]{2,255}$/u.test(repository ?? '') || !/^sha256:[a-f0-9]{64}$/u.test(digest ?? '')) throw new Error('sandbox_control_environment_invalid');
  const transport = KubernetesAgentSandboxTransport.fromCluster();
  const executor = new AgentSandboxExecutor({ transport, config: { imageRepository: repository, readinessTimeoutMs: 120_000 } });
  const images = new SandboxImageRegistry([{ imageId: 'sandbox.nodejs-24-python3-12', digest, lifecycle: 'qualified', signatureVerified: true, provenanceVerified: true, vulnerabilityScan: 'passed', malwareScan: 'passed', sbomSha256: process.env.CLERVO_SANDBOX_RUNNER_SBOM_SHA256 ?? '' }]);
  const plane = new SandboxControlPlane(executor, Date.now, images);
  let cleanupHealthy = false; let reaping = false;
  const reap = async () => {
    if (reaping) return;
    reaping = true;
    try {
      const result = await plane.reap(); cleanupHealthy = result.quarantined === 0 && result.foreignOrphans === 0;
    } catch { cleanupHealthy = false; }
    finally { reaping = false; }
  };
  await reap();
  const server = createSandboxControlServer({ token, plane, ready: async () => {
    if (!cleanupHealthy || plane.cleanupUncertain()) throw new Error('sandbox_control_cleanup_unhealthy');
    return transport.listSessionIds('clervo-sandbox-execution');
  } });
  const port = Number(process.env.PORT ?? 8080);
  server.listen(port, '0.0.0.0');
  const reaper = setInterval(reap, 30_000); reaper.unref();
  const stop = () => { clearInterval(reaper); server.close(() => process.exit(0)); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
