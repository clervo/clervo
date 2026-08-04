import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { aiHttpRequestHash, normalizeAiHttpRequest } from '../../dist/packages/contracts/src/index.js';
import { createAiPublicPricing } from '../../apps/api/src/ai-public-pricing.mjs';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';
import { createX402PaidAiProcessor } from '../../apps/api/src/x402-paid-ai.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const operationId = `op_${'a'.repeat(32)}`;
const now = '2026-08-04T05:30:00.000Z';

async function publicPricing() {
  return createAiPublicPricing({
    model: await read('packages/catalog/ai-model-catalog.v1.json'),
    gateway: await read('packages/catalog/ai-launch-pricing.v1.json'),
    credit: await read('packages/catalog/ai-credit-backed-pricing.v1.json'),
    speech: await read('packages/catalog/ai-speech-pricing.v1.json'),
    recurring: await read('packages/catalog/ai-free-tier-pricing.v1.json'),
    edge: await read('packages/catalog/ai-edge-free-pricing.v1.json'),
  });
}

function settlementService() {
  const calls = { challenge: 0, authorize: 0, settle: 0 };
  return {
    calls,
    mode: 'settlement_enabled',
    async challenge({ quote }) {
      calls.challenge += 1;
      return { status: 402, headers: { 'PAYMENT-REQUIRED': 'bounded-ai' }, body: { x402Version: 2, accepts: [{ amount: quote.maximumCharge.amountAtomic }] } };
    },
    async authorize() { calls.authorize += 1; return { fingerprint: `sha256:${'5'.repeat(64)}` }; },
    async settle() { calls.settle += 1; return { kind: 'settled', headers: { 'PAYMENT-RESPONSE': 'settled-ai' }, settlement: { network: 'eip155:8453', transaction: `0x${'6'.repeat(64)}` } }; },
  };
}

test('paid AI challenges before execution, returns exact-model proof, and replays after qualification expiry without another charge', async () => {
  const service = settlementService();
  let executions = 0;
  const adapter = {
    routeId: 'ai.route.gpt_5_6_luna',
    async execute({ exactModelId }) {
      executions += 1;
      return {
        modelIdentity: exactModelId,
        completedAt: '2026-08-04T05:30:01.000Z',
        usage: { inputTokens: 2, cachedInputTokens: 0, outputTokens: 2, reasoningTokens: 0, images: 0, audioCharacters: 0 },
        output: { kind: 'chat', content: 'Hello from the exact model.', finishReason: 'stop' },
      };
    },
  };
  const processor = createX402PaidAiProcessor({
    service,
    stateStore: new InMemoryX402OperationStore({ environmentNamespace: 'ai_paid' }),
    publicPricing: await publicPricing(),
    adapters: [adapter],
  });
  const normalized = normalizeAiHttpRequest({ model: 'clervo/fast', input: { kind: 'chat', messages: [{ role: 'user', content: 'Hello' }], responseFormat: 'text', stream: false }, maximumOutputTokens: 100 });
  const input = { idempotencyKey: 'idem_ai_paid_001', requestHash: aiHttpRequestHash(normalized), operationId, normalized, now };

  const challenge = await processor.process(input);
  assert.equal(challenge.status, 402);
  assert.equal(executions, 0);
  assert.equal(challenge.body.quote.productId, 'ai.chat');
  assert.ok(BigInt(challenge.body.quote.maximumCharge.amountAtomic) > 0n);

  const paid = await processor.process({ ...input, paymentHeader: 'opaque-authorization' });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.exactModelId, 'gpt-5.6-luna');
  assert.equal(paid.body.result.output.content, 'Hello from the exact model.');
  assert.equal(JSON.stringify(paid.body).includes('provider.clervo_ai_gateway'), false);
  assert.equal(executions, 1);
  assert.deepEqual(service.calls, { challenge: 1, authorize: 1, settle: 1 });

  const replay = await processor.process({ ...input, now: '2026-08-20T00:00:00.000Z' });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.receipt.receiptId, paid.body.receipt.receiptId);
  assert.equal(executions, 1);
  assert.deepEqual(service.calls, { challenge: 1, authorize: 1, settle: 1 });
});
