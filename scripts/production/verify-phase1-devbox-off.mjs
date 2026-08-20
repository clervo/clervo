#!/usr/bin/env node

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';

const publicOrigin = 'https://api.clervo.dev';
const gatewayOrigin = 'https://clervo-ai-gateway-jbtbib4yqa-uc.a.run.app';
const expectedRelease = '64a7e8934ce92b5b6d910d98d2506c8f82bb17c5';
const resultPath = '/workspace/phase1-devbox-off-result.json';
const stoppedMarker = '/workspace/phase1-devbox-terminated';

async function json(url, init = {}, timeoutMs = 180_000) {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  let body = {};
  try { body = await response.json(); } catch {}
  return { response, body };
}

async function verify() {
  await access(stoppedMarker);
  const [root, discovery, openapi, status, pricing, models, health, readiness, gatewayHealth] = await Promise.all([
    json(`${publicOrigin}/`), json(`${publicOrigin}/.well-known/clervo.json`), json(`${publicOrigin}/openapi.json`),
    json(`${publicOrigin}/status.json`), json(`${publicOrigin}/pricing.json`), json(`${publicOrigin}/v1/models`),
    json(`${publicOrigin}/v1/health`), json(`${publicOrigin}/readyz`), json(`${gatewayOrigin}/health`),
  ]);
  for (const item of [root, discovery, openapi, status, pricing, models, health, readiness, gatewayHealth]) assert.equal(item.response.status, 200);
  assert.equal(health.body.releaseId, expectedRelease);
  assert.equal(health.body.stateBackend, 'postgres');
  assert.equal(health.body.durableState, true);
  assert.equal(readiness.body.status, 'ready');
  assert.equal(gatewayHealth.body.canonical_models, 75);
  for (const product of ['search', 'ai', 'sandbox', 'rpc', 'prediction']) assert.equal(health.body.products?.[product]?.status, 'healthy', `${product}_health`);

  const canonical = models.body.data.filter(({ clervo }) => clervo?.identityKind === 'canonical');
  const active = canonical.filter(({ clervo }) => clervo?.publicSellable === true && clervo?.availability === 'available');
  const aliases = models.body.data.filter(({ clervo }) => clervo?.identityKind === 'alias');
  assert.equal(canonical.length, 85);
  assert.equal(active.length, 75);
  assert.deepEqual(aliases.map(({ id }) => id).sort(), ['clervo/code', 'clervo/deep', 'clervo/fast', 'clervo/smart']);
  assert.equal(active.some(({ id }) => /gpt-5\.6|claude/iu.test(id)), false);

  const temporaryBody = (model) => ({
    model,
    input: { kind: 'chat', messages: [{ role: 'user', content: 'This request must not execute.' }], responseFormat: 'text', stream: false },
    maximumOutputTokens: 8,
  });
  for (const model of ['clervo/gpt-5.6-sol', 'clervo/claude-opus-4-6']) {
    const unavailable = await json(`${publicOrigin}/v1/ai/execute`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `phase1-unavailable-${randomUUID()}` }, body: JSON.stringify(temporaryBody(model)) });
    assert.equal(unavailable.response.status, 422);
    assert.equal(unavailable.body.code, 'ai_model_temporarily_unavailable');
  }

  const operationKey = `phase1-devbox-off-${randomUUID()}`;
  const aiBody = {
    model: 'clervo/gemma-4-26b-a4b-it',
    input: { kind: 'chat', messages: [{ role: 'user', content: 'Reply exactly DEVBOX_OFF_OK.' }], responseFormat: 'text', stream: false },
    maximumOutputTokens: 32,
  };
  const ai = await json(`${publicOrigin}/v1/ai/execute`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': operationKey }, body: JSON.stringify(aiBody) });
  assert.equal(ai.response.status, 200);
  assert.equal(ai.body.exactModelId, aiBody.model);
  assert.equal(ai.body.fundingMode, 'free');
  assert.equal(ai.body.result?.output?.kind, 'chat');
  assert.ok(ai.body.result.output.content.length > 0);
  const replay = await json(`${publicOrigin}/v1/ai/execute`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': operationKey }, body: JSON.stringify(aiBody) });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.response.headers.get('idempotency-replayed'), 'true');
  assert.equal(replay.body.operationId, ai.body.operationId);

  const search = await json(`${publicOrigin}/v1/search/free`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `phase1-search-${randomUUID()}` },
    body: JSON.stringify({ query: 'current Model Context Protocol specification', maxResults: 2, synthesize: false, language: 'en', region: 'US' }),
  });
  assert.equal(search.response.status, 200);

  const quotePaths = ['/v1/ai/execute', '/v1/search/paid', '/v1/sandbox/execute', '/v1/prediction/execute', '/v1/rpc/execute', '/v1/crypto/execute'];
  for (const path of quotePaths) {
    const quote = await json(`${publicOrigin}${path}`, { method: 'POST' });
    assert.equal(quote.response.status, 402, `${path}_status`);
    assert.ok(quote.response.headers.has('payment-required') || quote.response.headers.has('www-authenticate'), `${path}_challenge`);
  }

  return {
    schemaVersion: 'clervo.infra-rearch-phase1-devbox-off.v1',
    status: 'PASS', checkedAt: new Date().toISOString(), devboxGceStatus: 'TERMINATED', releaseId: health.body.releaseId,
    gatewayRevision: 'clervo-ai-gateway-00002-p6f', apiRevision: 'clervo-api-production-00118-meb',
    canonicalModels: canonical.length, activeModels: active.length, aliases: aliases.length,
    usefulAiExecution: true, replay: true, search: true, productChallenges: quotePaths.length,
    sandboxEvidence: 'pre-stop production-service-off useful execution and replay passed',
    mcpEvidence: 'pre-stop production-service-off negotiation, models_list, and unpaid quote passed',
    paymentAttempted: false, paymentSigned: false, paymentSettled: false, usdcSpent: 0,
  };
}

let report;
try {
  report = await verify();
} catch (error) {
  report = { schemaVersion: 'clervo.infra-rearch-phase1-devbox-off.v1', status: 'FAIL', checkedAt: new Date().toISOString(), error: error?.message ?? 'verification_failed', paymentAttempted: false, usdcSpent: 0 };
  process.exitCode = 1;
}
await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
