import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile('scripts/production/cloudflare-b7-ai-routes.mjs', 'utf8');

test('B7 protected-host projection is exact, confirmation-guarded, and automatically recoverable', () => {
  for (const route of [
    'ai.clervo.dev/v1/ai/execute',
    'ai.clervo.dev/v1/catalog',
    'ai.clervo.dev/.well-known/clervo.json',
    'ai.clervo.dev/.well-known/x402',
    'ai.clervo.dev/openapi.json',
    'ai.clervo.dev/llms.txt',
  ]) assert.ok(source.includes(`'${route}'`), `missing exact route ${route}`);
  for (const preserved of ["status('/')", "status('/v1/models')", "status('/v1/chat/completions')"]) assert.ok(source.includes(preserved));
  assert.match(source, /CLERVO_B7_AI_ROUTE_CONFIRM/u);
  assert.match(source, /apply:b7-ai-normalized-routes:v1/u);
  assert.match(source, /rollback:b7-ai-normalized-routes:v1/u);
  assert.match(source, /await deployTriggers\(apiRoutes\);\n    await assertGatewayPreserved\(401\);/u);
  assert.doesNotMatch(source, /payment-signature|authorization:\s*[`'"]Payment/iu);
});

test('B7 route verification proves public catalog, free replay, and unpaid challenge without touching gateway catalog', () => {
  assert.match(source, /canonicalModels: 85, aliases: 4, callableIds: 89/u);
  assert.match(source, /publicSellable === true/u);
  assert.match(source, /idempotency-replayed/u);
  assert.match(source, /paid\.status, 402/u);
  assert.match(source, /paidChallengeAtomic: '1000'/u);
  assert.match(source, /paymentEffects: 0/u);
});

test('B7 protected route application refuses before any network mutation without exact owner confirmation', () => {
  const result = spawnSync(process.execPath, ['scripts/production/cloudflare-b7-ai-routes.mjs', 'apply'], {
    encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 10_000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /owner route confirmation mismatch/u);
  assert.doesNotMatch(result.stdout, /action.*applied/u);
});
