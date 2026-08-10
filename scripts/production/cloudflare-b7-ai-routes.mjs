#!/usr/bin/env node

// Exact, owner-confirmed B7 projection onto the protected AI hostname. The
// authenticated VM gateway keeps every existing path; only the six normalized
// customer paths below are attached to the already-deployed API Worker.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const action = process.argv[2] ?? 'plan';
const workerName = 'clervo-api-edge-production';
const zoneName = 'clervo.dev';
const apiRoutes = ['api.clervo.dev/', 'api.clervo.dev/*'];
const aiRoutes = [
  'ai.clervo.dev/v1/ai/execute',
  'ai.clervo.dev/v1/catalog',
  'ai.clervo.dev/.well-known/clervo.json',
  'ai.clervo.dev/.well-known/x402',
  'ai.clervo.dev/openapi.json',
  'ai.clervo.dev/llms.txt',
];
const confirmation = 'apply:b7-ai-normalized-routes:v1';
const rollbackConfirmation = 'rollback:b7-ai-normalized-routes:v1';

function refuse(code) { throw new Error(`b7_ai_route_control_refused:${code}`); }

async function status(pathname) {
  const response = await fetch(`https://ai.clervo.dev${pathname}`, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  return response.status;
}

async function assertGatewayPreserved(expectedTargetStatus) {
  assert.equal(await status('/'), 401, 'protected AI gateway root changed');
  assert.equal(await status('/v1/models'), 401, 'protected AI gateway model catalog changed');
  assert.equal(await status('/v1/chat/completions'), 401, 'protected AI gateway chat path changed');
  if (expectedTargetStatus !== undefined) assert.equal(await status('/v1/catalog'), expectedTargetStatus, 'normalized catalog route state mismatch');
}

async function deployTriggers(routes) {
  const directory = await mkdtemp(path.join(tmpdir(), 'clervo-b7-ai-routes-'));
  const config = path.join(directory, 'wrangler.json');
  try {
    await writeFile(config, `${JSON.stringify({
      name: workerName,
      compatibility_date: '2026-08-04',
      routes: routes.map((pattern) => ({ pattern, zone_name: zoneName })),
    }, null, 2)}\n`, 'utf8');
    const result = spawnSync('npx', ['wrangler', 'triggers', 'deploy', '--config', config], {
      cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) refuse('wrangler_trigger_deploy_failed');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function verifyProjection() {
  await assertGatewayPreserved(200);
  for (const pathname of ['/.well-known/clervo.json', '/.well-known/x402', '/openapi.json', '/llms.txt']) {
    assert.equal(await status(pathname), 200, `${pathname} not projected`);
  }
  assert.equal(await status('/v1/ai/execute'), 405, 'normalized execute path not projected');
  const catalog = await (await fetch('https://ai.clervo.dev/v1/catalog', { signal: AbortSignal.timeout(30_000) })).json();
  assert.deepEqual(catalog.clervo.inventory, { canonicalModels: 85, aliases: 4, callableIds: 89 });
  assert.equal(catalog.data.filter(({ clervo }) => clervo.publicSellable === true).length, 88);

  const freeRequest = {
    model: 'clervo/gemma-4-26b-a4b-it',
    input: { kind: 'chat', messages: [{ role: 'user', content: 'Reply with the single word ready.' }], responseFormat: 'text', stream: false },
    maximumOutputTokens: 16,
  };
  const free = await fetch('https://ai.clervo.dev/v1/ai/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'idem_b7_final_free_20260810a' }, body: JSON.stringify(freeRequest), signal: AbortSignal.timeout(120_000),
  });
  assert.equal(free.status, 200, 'free replay through AI hostname failed');
  assert.equal(free.headers.get('idempotency-replayed'), 'true', 'AI-host free result was not replayed');
  const freeBody = await free.json();
  assert.equal(freeBody.exactModelId, freeRequest.model);
  assert.equal(freeBody.fundingMode, 'free');

  const paidRequest = {
    model: 'clervo/gpt-5.6-luna',
    input: { kind: 'chat', messages: [{ role: 'user', content: 'Reply with the single word ready.' }], responseFormat: 'text', stream: false },
    maximumOutputTokens: 16,
  };
  const paid = await fetch('https://ai.clervo.dev/v1/ai/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `idem_b7_ai_host_quote_${Date.now()}` }, body: JSON.stringify(paidRequest), signal: AbortSignal.timeout(120_000),
  });
  assert.equal(paid.status, 402, 'paid AI-host challenge failed');
  const paidBody = await paid.json();
  assert.equal(paidBody.quote.maximumCharge.amountAtomic, '1000');
  assert.equal(paidBody.accepts[0].amount, '1000');
  return { catalogIds: catalog.data.length, sellableIds: 88, freeReplay: true, paidChallengeAtomic: '1000' };
}

if (action === 'plan') {
  process.stdout.write(`${JSON.stringify({
    action: 'plan', workerName, existingRoutes: apiRoutes, protectedHostnameRoutesToAdd: aiRoutes,
    preservedProtectedPaths: ['ai.clervo.dev/', 'ai.clervo.dev/v1/models', 'ai.clervo.dev/v1/chat/completions'],
    automaticRollbackOnVerificationFailure: true, confirmation, mutation: false, paymentAuthorized: false, paymentEffects: 0,
  }, null, 2)}\n`);
} else if (action === 'apply') {
  assert.equal(process.env.CLERVO_B7_AI_ROUTE_CONFIRM, confirmation, 'owner route confirmation mismatch');
  await assertGatewayPreserved(401);
  await deployTriggers([...apiRoutes, ...aiRoutes]);
  try {
    const proof = await verifyProjection();
    process.stdout.write(`${JSON.stringify({ action: 'applied', workerName, routesAdded: aiRoutes, protectedGatewayPreserved: true, proof, paymentEffects: 0 }, null, 2)}\n`);
  } catch (error) {
    await deployTriggers(apiRoutes);
    await assertGatewayPreserved(401);
    throw error;
  }
} else if (action === 'rollback') {
  assert.equal(process.env.CLERVO_B7_AI_ROUTE_CONFIRM, rollbackConfirmation, 'owner rollback confirmation mismatch');
  await deployTriggers(apiRoutes);
  await assertGatewayPreserved(401);
  process.stdout.write(`${JSON.stringify({ action: 'rolled_back', routesRemoved: aiRoutes, protectedGatewayPreserved: true, paymentEffects: 0 }, null, 2)}\n`);
} else refuse('usage_plan_apply_rollback');
