import {
  createAiExecutionRequest,
  createAiFreeHttpResult,
} from '../../../dist/packages/contracts/src/index.js';
import { executeAiOperation } from '../../../dist/services/ai/src/execution.js';

function problem(code, status = 503) {
  throw Object.assign(new Error(code), { status });
}

export function createFreeAiOperationProcessor({ stateStore, quotaStore, policy, publicPricing, adapters, runtimeBindings, acquireExecution, monitor } = {}) {
  if (!stateStore || typeof stateStore.begin !== 'function' || typeof stateStore.complete !== 'function' || typeof stateStore.abandon !== 'function') throw new TypeError('invalid_ai_free_state_store');
  if (!quotaStore || typeof quotaStore.consume !== 'function') throw new TypeError('invalid_ai_free_quota_store');
  if (!policy || policy.enabled !== true || policy.zeroUpstreamCostRequired !== true || policy.automaticPaidOverageAllowed !== false) throw new TypeError('invalid_ai_free_policy');
  if (!publicPricing || typeof publicPricing.quote !== 'function' || !Array.isArray(adapters) || adapters.some((adapter) => typeof adapter?.routeId !== 'string' || typeof adapter?.execute !== 'function')) throw new TypeError('invalid_ai_free_runtime');

  return Object.freeze({
    async process({ idempotencyKey, requestHash, operationId, normalized, subject, now }) {
      const validUntil = Date.parse(policy.validUntil);
      if (!Number.isFinite(validUntil) || validUntil <= Date.parse(now)) problem('ai_free_policy_expired');
      const stateKey = `ai-free:${idempotencyKey}`;
      const quote = publicPricing.quote({ normalized, operationId, now });
      if (quote.pricing.billingMode !== 'free' || quote.pricing.maximumCharge.amountAtomic !== '0' || quote.decision.maximumSupplierCost?.amountAtomic !== '0') problem('ai_free_model_not_eligible', 400);
      const claim = await stateStore.begin({ idempotencyKey: stateKey, requestHash, operationId, now });
      if (claim.kind === 'conflict') problem('idempotency_conflict', 409);
      if (claim.kind === 'replay') return Object.freeze({ status: 200, body: Object.freeze({ ...claim.response, replayed: true }), headers: Object.freeze({ 'idempotency-replayed': 'true' }) });
      if (claim.kind === 'in_progress') problem('idempotency_in_progress', 409);
      if (claim.kind !== 'claimed') problem('ai_free_state_unavailable');

      const quota = await quotaStore.consume({ subject, now, subjectLimit: policy.perWalletDailyRequests, globalLimit: policy.globalDailyRequests });
      const quotaHeaders = Object.freeze({
        'ratelimit-limit': String(policy.perWalletDailyRequests),
        'ratelimit-remaining': String(quota.subjectRemaining),
        'ratelimit-reset': quota.resetAt,
      });
      if (!quota.allowed) {
        await stateStore.abandon({ idempotencyKey: stateKey, requestHash, operationId, leaseId: claim.leaseId });
        return Object.freeze({ status: 429, body: Object.freeze({ code: 'ai_free_quota_exceeded', status: 429, resetAt: quota.resetAt, automaticPaidOverageAllowed: false }), headers: Object.freeze({ ...quotaHeaders, 'retry-after': String(Math.max(1, Math.ceil((Date.parse(quota.resetAt) - Date.parse(now)) / 1_000))) }) });
      }

      const release = acquireExecution?.();
      if (release === undefined) {
        await stateStore.abandon({ idempotencyKey: stateKey, requestHash, operationId, leaseId: claim.leaseId });
        problem('ai_overloaded');
      }
      try {
        const request = createAiExecutionRequest({ normalized, operationId, maximumSupplierCost: quote.decision.maximumSupplierCost, deadlineAt: new Date(Date.parse(now) + 120_000).toISOString() });
        const outcome = await executeAiOperation({ request, catalog: quote.catalog, routes: quote.routes, adapters, runtimeBindings: quote.runtimeBindings ?? runtimeBindings, aliasTargets: quote.aliasTargets, startedAt: now, clock: () => Date.parse(now), monitor });
        if (outcome.outcome !== 'completed') problem(`ai_execution_${outcome.failureCode}`);
        const response = createAiFreeHttpResult({ request, requestHash, result: outcome.result });
        await stateStore.complete({ idempotencyKey: stateKey, requestHash, operationId, leaseId: claim.leaseId, response, now });
        return Object.freeze({ status: 200, body: response, headers: quotaHeaders });
      } catch (error) {
        await stateStore.abandon({ idempotencyKey: stateKey, requestHash, operationId, leaseId: claim.leaseId }).catch(() => {});
        throw error;
      } finally {
        release();
      }
    },
  });
}
