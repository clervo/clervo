import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { CANONICAL_ROUTES, PUBLIC_ROUTES, ROUTES_BY_ID, SERVICE_ALIAS_TARGETS } from './provider-catalog.mjs';
import { createGateway } from './server-v2.mjs';

test('production catalog contains exactly the H4-active routes and aliases', () => {
  assert.equal(CANONICAL_ROUTES.length, 75);
  assert.equal(PUBLIC_ROUTES.length, 79);
  assert.deepEqual(SERVICE_ALIAS_TARGETS, {
    'clervo/fast': 'clervo/gpt-oss-20b',
    'clervo/smart': 'clervo/gpt-oss-120b',
    'clervo/code': 'clervo/kimi-k2.7-code',
    'clervo/deep': 'clervo/gpt-oss-120b',
  });
  assert.equal(CANONICAL_ROUTES.some(({ id, provider }) => id.includes('gpt-5.6') || id.includes('claude') || provider === 'codex' || provider === 'mwapi'), false);
  for (const [alias, target] of Object.entries(SERVICE_ALIAS_TARGETS)) {
    assert.equal(ROUTES_BY_ID[alias].aliasTarget, target);
    assert.equal(ROUTES_BY_ID[alias].upstream, ROUTES_BY_ID[target].upstream);
    assert.equal(ROUTES_BY_ID[alias].provider, ROUTES_BY_ID[target].provider);
  }
});

test('gateway authenticates model discovery and preserves alias identity', async (t) => {
  const calls = [];
  const opaque = (prefix) => `${prefix}-${'x'.repeat(40)}`;
  const gateway = createGateway({
    builderKey: opaque('builder'),
    nvidiaKey: opaque('nvidia'),
    hcnsecPool: { async request() { throw new Error('unexpected_hcnsec_call'); } },
    vertexClient: { async request() { throw new Error('unexpected_vertex_call'); } },
    openAIProviders: { groq: { apiKey: opaque('groq'), baseUrl: 'https://example.invalid' } },
    async openAICompatibleRequest(input) {
      calls.push(input);
      return { ok: true, status: 200, body: { id: 'completion_1', object: 'chat.completion', model: input.route.id, choices: [], usage: {} } };
    },
  });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  t.after(() => gateway.close());
  const origin = `http://127.0.0.1:${gateway.address().port}`;

  assert.equal((await fetch(`${origin}/v1/models`)).status, 401);
  const models = await fetch(`${origin}/v1/models`, { headers: { authorization: `Bearer ${opaque('builder')}` } });
  assert.equal(models.status, 200);
  assert.equal((await models.json()).data.length, 79);

  const completion = await fetch(`${origin}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${opaque('builder')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'clervo/fast', messages: [{ role: 'user', content: 'Hello' }], max_tokens: 16 }),
  });
  assert.equal(completion.status, 200);
  assert.equal((await completion.json()).model, 'clervo/fast');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].route.provider, 'groq');
  assert.equal(calls[0].route.upstream, 'openai/gpt-oss-20b');
});
