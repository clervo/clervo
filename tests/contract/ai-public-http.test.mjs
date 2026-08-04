import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createAiPublicPricing } from '../../apps/api/src/ai-public-pricing.mjs';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const now = '2026-08-04T06:00:00.000Z';

async function pricing() {
  return createAiPublicPricing({
    model: await read('packages/catalog/ai-model-catalog.v1.json'),
    gateway: await read('packages/catalog/ai-launch-pricing.v1.json'),
    credit: await read('packages/catalog/ai-credit-backed-pricing.v1.json'),
    speech: await read('packages/catalog/ai-speech-pricing.v1.json'),
    recurring: await read('packages/catalog/ai-free-tier-pricing.v1.json'),
    edge: await read('packages/catalog/ai-edge-free-pricing.v1.json'),
  });
}

test('public AI HTTP route is edge-protected, x402-bounded, useful, and replay-safe', async (context) => {
  const calls = { challenge: 0, authorize: 0, settle: 0, execute: 0 };
  const service = {
    mode: 'settlement_enabled',
    async challenge({ quote }) { calls.challenge += 1; return { status: 402, headers: { 'PAYMENT-REQUIRED': 'ai-http' }, body: { x402Version: 2, accepts: [{ amount: quote.maximumCharge.amountAtomic }] } }; },
    async authorize() { calls.authorize += 1; return { fingerprint: `sha256:${'7'.repeat(64)}` }; },
    async settle() { calls.settle += 1; return { kind: 'settled', headers: { 'PAYMENT-RESPONSE': 'ai-http-settled' }, settlement: { network: 'eip155:8453', transaction: `0x${'8'.repeat(64)}` } }; },
  };
  const server = createSearchServer({
    executor: { async execute() { throw new Error('search_not_called'); } },
    now: () => now,
    environment: 'test',
    releaseId: 'ai-http-test',
    edgeAuthorization: 'edge-authorization-at-least-32-characters',
    x402Service: service,
    x402StateStore: new InMemoryX402OperationStore({ environmentNamespace: 'ai_http' }),
    aiPublicPricing: await pricing(),
    aiAdapters: [{
      routeId: 'ai.route.gpt_5_6_luna',
      async execute({ exactModelId }) {
        calls.execute += 1;
        return { modelIdentity: exactModelId, completedAt: '2026-08-04T06:00:01.000Z', usage: { inputTokens: 2, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0, images: 0, audioCharacters: 0 }, output: { kind: 'chat', content: 'Useful output.', finishReason: 'stop' } };
      },
    }],
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const body = JSON.stringify({ model: 'clervo/fast', input: { kind: 'chat', messages: [{ role: 'user', content: 'Hello' }], responseFormat: 'text', stream: false }, maximumOutputTokens: 100 });
  const headers = { 'content-type': 'application/json', 'idempotency-key': 'idem_ai_http_001' };

  const denied = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers, body });
  assert.equal(denied.status, 401);
  const authorized = { ...headers, 'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters' };
  const challenge = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers: authorized, body });
  assert.equal(challenge.status, 402);
  assert.equal(calls.execute, 0);
  const quote = await challenge.json();
  assert.equal(quote.quote.productId, 'ai.chat');

  const paid = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers: { ...authorized, 'payment-signature': 'opaque-payment' }, body });
  assert.equal(paid.status, 200);
  const result = await paid.json();
  assert.equal(result.result.output.content, 'Useful output.');
  assert.equal(result.exactModelId, 'gpt-5.6-luna');
  assert.equal(calls.execute, 1);

  const replay = await fetch(`${origin}/v1/ai/execute`, { method: 'POST', headers: authorized, body });
  assert.equal(replay.status, 200);
  const replayed = await replay.json();
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.receipt.receiptId, result.receipt.receiptId);
  assert.deepEqual(calls, { challenge: 1, authorize: 1, settle: 1, execute: 1 });
});
