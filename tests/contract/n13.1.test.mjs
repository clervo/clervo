import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CLERVO_CONTRACT_VERSION,
  ClervoClient,
  ClervoPaymentRequiredError,
  ClervoProblemError,
  ClervoProtocolError,
  recoveryActionFor,
} from '../../dist/packages/sdk-typescript/src/index.js';

const transcript = JSON.parse(await readFile('packages/distribution/fixtures/search-client-transcript.v1.json', 'utf8'));
const onboarding = JSON.parse(await readFile('packages/distribution/onboarding.v1.json', 'utf8'));

function result(productId, fundingMode = 'free') {
  return {
    contractVersion: CLERVO_CONTRACT_VERSION,
    operationId: 'op_fixture',
    operation: 'search.query',
    productId,
    state: 'RECEIPTED',
    replayed: false,
    fundingMode,
    requestHash: `sha256:${'a'.repeat(64)}`,
    output: { searchResponse: {} },
  };
}

test('TypeScript web and answer methods force distinct product selection', async () => {
  const observed = [];
  const client = new ClervoClient({
    baseUrl: 'http://127.0.0.1:8080/',
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      observed.push({ url, init, body });
      return Response.json(result(body.synthesize ? 'search.answer' : 'search.web'));
    },
  });
  assert.equal((await client.search.web({ query: 'evidence' }, { idempotencyKey: 'idem_web' })).productId, 'search.web');
  assert.equal((await client.search.answer({ query: 'evidence' }, { idempotencyKey: 'idem_answer' })).productId, 'search.answer');
  assert.deepEqual(observed.map(({ body }) => body.synthesize), [false, true]);
  assert.ok(observed.every(({ url }) => url === 'http://127.0.0.1:8080/v1/search/free'));
  assert.deepEqual(observed.map(({ init }) => init.headers['idempotency-key']), ['idem_web', 'idem_answer']);
});

test('TypeScript wire behavior matches the shared cross-client transcript', async () => {
  for (const fixture of transcript.cases.slice(0, 2)) {
    let observed;
    const client = new ClervoClient({
      baseUrl: 'http://127.0.0.1:8080',
      fetch: async (url, init) => {
        observed = {
          method: init.method,
          path: new URL(url).pathname,
          idempotencyKey: init.headers['idempotency-key'],
          body: JSON.parse(init.body),
        };
        return Response.json(fixture.response);
      },
    });
    const [namespace, method] = fixture.method.split('.');
    assert.equal(namespace, 'search');
    const value = await client.search[method](fixture.input, fixture.options);
    assert.equal(value.productId, fixture.response.productId);
    assert.deepEqual(observed, {
      method: fixture.wire.method,
      path: fixture.wire.path,
      idempotencyKey: fixture.options.idempotencyKey,
      body: fixture.wire.body,
    });
  }
});

test('TypeScript 402 is typed, non-automatic, and preserves the challenge', async () => {
  const client = new ClervoClient({
    baseUrl: 'https://preview.clervo.invalid',
    fetch: async () => Response.json(
      { code: 'mock_payment_required', payable: false },
      { status: 402, headers: { 'payment-required': 'fixture-header' } },
    ),
  });
  await assert.rejects(
    client.search.web({ query: 'evidence' }, { mode: 'challenge' }),
    (error) => {
      assert.ok(error instanceof ClervoPaymentRequiredError);
      assert.equal(error.paymentRequired, 'fixture-header');
      assert.equal(error.problem.payable, false);
      return true;
    },
  );
});

test('TypeScript client fails closed on problems, contract mismatch, unsafe origins, and oversized bodies', async () => {
  const problem = new ClervoClient({
    baseUrl: 'https://preview.clervo.invalid',
    fetch: async () => Response.json({ code: 'free_quota_exceeded' }, { status: 429 }),
  });
  await assert.rejects(problem.search.web({ query: 'evidence' }), (error) => error instanceof ClervoProblemError && error.status === 429);

  const mismatch = new ClervoClient({
    baseUrl: 'https://preview.clervo.invalid',
    fetch: async () => Response.json(result('search.answer')),
  });
  await assert.rejects(mismatch.search.web({ query: 'evidence' }), (error) => error instanceof ClervoProtocolError);

  assert.throws(() => new ClervoClient({ baseUrl: 'http://metadata.google.internal' }), /unsafe_clervo_base_url/u);

  const oversized = new ClervoClient({
    baseUrl: 'https://preview.clervo.invalid',
    maxResponseBytes: 1_024,
    fetch: async () => new Response('x'.repeat(1_025)),
  });
  await assert.rejects(oversized.search.web({ query: 'evidence' }), /clervo_response_too_large/u);
});

test('TypeScript recovery actions preserve retry and reconciliation safety', () => {
  for (const expected of onboarding.recovery) {
    for (const problemCode of expected.problemCodes) {
      assert.deepEqual(
        recoveryActionFor(new ClervoProblemError(402, { code: problemCode })),
        { code: expected.code, action: expected.action, retry: expected.retry },
      );
    }
  }
  assert.equal(recoveryActionFor('unrelated_failure'), undefined);
});

test('TypeScript client lists the authoritative AI catalog and executes free AI without payment', async () => {
  const observed = [];
  const modelList = { object: 'list', data: [{ id: 'clervo/gpt-oss-20b', object: 'model', owned_by: 'clervo', clervo: { identityKind: 'canonical', productIds: ['ai.chat'], capabilities: ['text_input', 'text_output'], availability: 'available', health: 'healthy', publicSellable: true, billingMode: 'free', customerPricing: {}, commerce: {} } }], clervo: { catalogRevision: 'b7:test', sourceValidUntil: '2026-09-01T00:00:00.000Z', inventory: { canonicalModels: 1, aliases: 0, callableIds: 1 } } };
  const aiResult = { contractVersion: CLERVO_CONTRACT_VERSION, operationId: 'op_ai_fixture', operation: 'ai.execute', productId: 'ai.chat', model: 'clervo/gpt-oss-20b', exactModelId: 'clervo/gpt-oss-20b', state: 'COMPLETED', replayed: false, fundingMode: 'free', requestHash: `sha256:${'b'.repeat(64)}`, result: { output: { kind: 'chat', content: 'ready' } } };
  const client = new ClervoClient({ baseUrl: 'https://api.clervo.dev', fetch: async (url, init) => { observed.push({ url, init }); return Response.json(init.method === 'GET' ? modelList : aiResult); } });
  assert.equal((await client.models.list()).clervo.inventory.callableIds, 1);
  const result = await client.ai.execute({ model: 'clervo/gpt-oss-20b', input: { kind: 'chat', messages: [{ role: 'user', content: 'ready' }], responseFormat: 'text', stream: false } }, { idempotencyKey: 'idem_ai_sdk' });
  assert.equal(result.fundingMode, 'free');
  assert.equal(result.exactModelId, 'clervo/gpt-oss-20b');
  assert.deepEqual(observed.map(({ url }) => new URL(url).pathname), ['/v1/models', '/v1/ai/execute']);
  assert.equal(observed[1].init.headers['idempotency-key'], 'idem_ai_sdk');
});
