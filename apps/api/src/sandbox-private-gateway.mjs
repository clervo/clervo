import { isIP } from 'node:net';

import { assertSandboxOperationRequest, verifySandboxOperationResult } from '../../../dist/packages/contracts/src/sandbox.js';
import { hashJson } from '../../../dist/packages/contracts/src/receipt.js';

function privateHost(hostname) {
  if (['127.0.0.1', '::1', 'localhost'].includes(hostname)) return true;
  if (isIP(hostname) !== 4) return false;
  const parts = hostname.split('.').map(Number);
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

function endpoint(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || !privateHost(url.hostname)) throw new TypeError('sandbox_control_url_invalid');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && privateHost(url.hostname))) throw new TypeError('sandbox_control_url_invalid');
  if (url.pathname !== '/' && url.pathname !== '') throw new TypeError('sandbox_control_url_invalid');
  return new URL('/internal/v1/sandbox/run', url);
}

function refuse(code, status) {
  throw Object.assign(new Error(code), { status });
}

export function createSandboxPrivateGateway({ controlOrigin, controlToken, stateStore, environment = 'development', fetchImpl = fetch, now = () => new Date().toISOString() }) {
  const controlEndpoint = endpoint(controlOrigin);
  if (typeof controlToken !== 'string' || controlToken.length < 32 || controlToken.length > 512) throw new TypeError('sandbox_control_token_invalid');
  if (!stateStore || typeof stateStore.begin !== 'function' || typeof stateStore.complete !== 'function' || typeof stateStore.markUnknown !== 'function') throw new TypeError('sandbox_operation_store_invalid');
  if (environment === 'production' && stateStore.durable !== true) throw new TypeError('production sandbox requires durable state');

  return Object.freeze({
    durable: stateStore.durable === true,
    async ready() { return await stateStore.ready(); },
    async run({ tenantId, request, signal }) {
      assertSandboxOperationRequest(request);
      if (!/^tenant_[A-Za-z0-9]{20,64}$/u.test(tenantId)) throw new TypeError('sandbox_tenant_invalid');
      const requestHash = hashJson(request);
      const startedAt = now();
      const claim = await stateStore.begin({ operationId: request.operationId, tenantId, requestHash, now: startedAt });
      if (claim.kind === 'conflict') refuse('sandbox_idempotency_conflict', 409);
      if (claim.kind === 'replay') return Object.freeze({ result: claim.result, replayed: true });
      if (claim.kind === 'in_progress') refuse('sandbox_operation_in_progress', 409);
      if (claim.kind === 'unknown') refuse('sandbox_execution_unknown', 503);
      let response;
      try {
        const timeout = AbortSignal.timeout(Math.min(315_000, Math.max(5_000, Date.parse(request.deadlineAt) - Date.now())));
        response = await fetchImpl(controlEndpoint, {
          method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          headers: { authorization: `Bearer ${controlToken}`, 'x-clervo-tenant-id': tenantId, 'content-type': 'application/json' },
          body: JSON.stringify(request),
        });
        if (response.status !== 200) refuse('sandbox_control_rejected', 503);
        const result = await response.json();
        if (!verifySandboxOperationResult(result, request)) refuse('sandbox_control_result_invalid', 503);
        await stateStore.complete({ operationId: request.operationId, tenantId, requestHash, leaseId: claim.leaseId, result, now: now() });
        return Object.freeze({ result, replayed: false });
      } catch (error) {
        try { await stateStore.markUnknown({ operationId: request.operationId, tenantId, requestHash, leaseId: claim.leaseId, now: now() }); }
        catch { refuse('sandbox_execution_unknown', 503); }
        if (error?.message === 'sandbox_control_result_invalid') refuse('sandbox_control_result_invalid', 503);
        refuse('sandbox_execution_unknown', 503);
      }
    },
    async close() { await stateStore.close?.(); },
  });
}
