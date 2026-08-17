import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ClervoConnect,
  OPERATION_SCHEMA_VERSION,
  callPaid,
  createWallet,
  diagnose,
  listOperations,
  loadRegistry,
  localUsage,
  readOperation,
  replaceWallet,
  saveLimits,
  saveReceipt,
  startOpenAiProxy,
  unreconciledOperations,
  writeOperation,
} from '../../packages/router/dist/index.js';
import { createConnectToolHandlers } from '../../packages/mcp/dist/server.js';
import { ClervoClient, ClervoProblemError } from '../../packages/sdk-typescript/dist/index.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PAY_TO = '0xBd11d82d8Dbd01Ba3eed279d3bACf74659fFca28';

function freshEnv() {
  return { CLERVO_HOME: join(mkdtempSync(join(tmpdir(), 'clervo-b11-')), 'home'), CLERVO_API_ORIGIN: 'https://api.clervo.dev' };
}

function discovery() {
  return {
    contractVersion: '2026-07-29.1',
    discoveryVersion: 'b11-test',
    products: [
      { productId: 'search.web', publicAvailable: true, pricing: { model: 'x402_exact', displayPrice: { amountAtomic: '6000' } }, routes: { freeSample: '/v1/search/free', paidChallenge: '/v1/search/paid' }, payment: { payable: true } },
      { productId: 'ai', operationIds: ['ai.chat', 'ai.embed', 'ai.image', 'ai.speech', 'ai.video', 'ai.music', 'ai.virtual_try_on'], publicAvailable: true, pricing: { model: 'authoritative_per_model_usage_pricing' }, routes: { execute: '/v1/ai/execute' }, payment: { payable: true } },
      { productId: 'prediction.markets', publicAvailable: true, pricing: { model: 'fixed_by_operation', displayPrice: { amountAtomic: '2000' } }, routes: { paidChallenge: '/v1/prediction/execute' }, payment: { payable: true } },
      { productId: 'rpc.call', publicAvailable: false, pricing: { model: 'unavailable' }, routes: {}, payment: { payable: false } },
    ],
    observedTruth: {
      provenance: { observedAt: '2026-08-11T00:00:00.000Z', releaseId: 'b11-test' },
      products: [
        { id: 'search', lifecycleState: 'live', publiclyReachable: true, proofLevel: 'paid_outcome_verified' },
        { id: 'ai', lifecycleState: 'live', publiclyReachable: true, proofLevel: 'paid_outcome_verified' },
        { id: 'prediction', lifecycleState: 'live', publiclyReachable: true, proofLevel: 'paid_outcome_verified' },
        { id: 'rpc', lifecycleState: 'unavailable', publiclyReachable: false, proofLevel: 'none', reason: 'commercial_rights_blocked' },
      ],
    },
  };
}

function modelList({ substituted = false, alias = false, billingMode = 'free' } = {}) {
  return {
    object: 'list',
    data: [{
      id: alias ? 'clervo/route' : 'clervo/exact',
      object: 'model',
      owned_by: 'clervo',
      clervo: {
        identityKind: alias ? 'alias' : 'canonical',
        ...(alias ? { aliasFor: 'clervo/exact' } : {}),
        productIds: ['ai.chat'],
        capabilities: ['text_input', 'text_output'],
        availability: 'available',
        health: 'healthy',
        publicSellable: true,
        billingMode,
        customerPricing: billingMode === 'free' ? null : { amountAtomic: '2000' },
        commerce: {},
      },
    }],
    clervo: { catalogRevision: 'test', sourceValidUntil: '2099-01-01T00:00:00.000Z', inventory: { canonicalModels: alias ? 0 : 1, aliases: alias ? 1 : 0, callableIds: 1 } },
    substituted,
  };
}

function challenge(amount = '6000') {
  return {
    x402Version: 2,
    accepts: [{ scheme: 'exact', network: 'eip155:8453', amount, asset: USDC, payTo: PAY_TO, maxTimeoutSeconds: 60, extra: { name: 'USD Coin', version: '2', clervo: { quoteId: 'q_b11', requestHash: `sha256:${'a'.repeat(64)}`, operationId: 'op_b11', priceVersion: 'b11', quoteExpiresAt: '2099-01-01T00:00:00.000Z' } } }],
    quote: { amountAtomic: amount, expiresAt: '2099-01-01T00:00:00.000Z' },
  };
}

function response(status, value, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
}

test('B11 registry projection exposes every served AI operation and fails RPC closed', async () => {
  const registry = await loadRegistry({ fetchImpl: async () => response(200, discovery()) });
  assert.deepEqual(registry.capabilities.filter(({ family }) => family === 'ai').map(({ productId }) => productId), ['ai.chat', 'ai.embed', 'ai.image', 'ai.speech', 'ai.video', 'ai.music', 'ai.virtual_try_on']);
  assert.ok(registry.capabilities.filter(({ family }) => family === 'ai').every(({ paidRoute }) => paidRoute === '/v1/ai/execute'));
  assert.equal(registry.capabilities.find(({ productId }) => productId === 'rpc.call')?.paidCallable, false);
});

test('B11 all customer surfaces observe one non-destructive permission-safe wallet', () => {
  const env = freshEnv();
  const surfaces = ['cli', 'mcp', 'typescript', 'python', 'openai'];
  const clients = surfaces.map((surface) => new ClervoConnect({ surface, env }));
  const created = clients[0].createWallet();
  assert.equal(statSync(env.CLERVO_HOME).mode & 0o777, 0o700);
  assert.equal(statSync(created.view.path).mode & 0o777, 0o600);
  assert.deepEqual(clients.map((client) => client.status().wallet?.address), Array(5).fill(created.view.address));
  assert.throws(() => clients[1].createWallet(), (error) => error.code === 'wallet_already_exists');
  assert.equal(clients[2].backupWallet(true).recoveryPhrase, created.mnemonic);
  const status = JSON.stringify(clients[3].status());
  assert.equal(status.includes(created.mnemonic), false);
  assert.doesNotMatch(status, /mnemonic|privateKey|recoveryPhrase/iu);
});

test('B11 recovery restores the identical address and diagnostics never disclose its phrase', async () => {
  const env = freshEnv();
  const created = createWallet({}, env);
  const other = createWallet({}, freshEnv());
  assert.notEqual(other.view.address, created.view.address);
  replaceWallet({ mnemonic: other.mnemonic, outgoingIsEmpty: true }, env);
  const restored = replaceWallet({ mnemonic: created.mnemonic, outgoingIsEmpty: true }, env);
  assert.equal(restored.address, created.view.address);
  const diagnosis = await diagnose({ env, checkBalance: false, fetchImpl: async (url) => String(url).endsWith('/.well-known/clervo.json') ? response(200, discovery()) : response(503, {}) });
  const rendered = JSON.stringify(diagnosis);
  assert.equal(rendered.includes(created.mnemonic), false);
  assert.equal(rendered.includes(created.mnemonic.split(' ').slice(0, 3).join(' ')), false);
  assert.doesNotMatch(rendered, /mnemonic|privateKey|recoveryPhrase/iu);
});

test('B11 the same global buyer ceiling refuses every paid surface before signing', async () => {
  const env = freshEnv();
  createWallet({}, env);
  saveLimits({ perOperationAtomic: '1000', dailyAtomic: '1000' }, env);
  let signatures = 0;
  const fetchImpl = async (url, init = {}) => {
    if (String(url).endsWith('/.well-known/clervo.json')) return response(200, discovery());
    if (String(url).endsWith('/v1/prediction/execute')) {
      if (Object.keys(init.headers ?? {}).some((name) => name.toLowerCase() === 'payment-signature')) signatures += 1;
      return response(402, challenge('2000'));
    }
    throw new Error(`unexpected ${url}`);
  };
  for (const surface of ['cli', 'mcp', 'typescript', 'python', 'openai']) {
    const connect = new ClervoConnect({ surface, env, autoPay: true, fetch: fetchImpl });
    await assert.rejects(connect.execute('prediction.markets', { operation: 'prediction.markets', query: surface }, `limit_${surface}_0001`), (error) => error.code === 'spend_limit_per_operation_exceeded');
  }
  assert.equal(signatures, 0);
  assert.equal(listOperations(env).length, 0);
});

test('B11 TypeScript and OpenAI paid entry points reach the shared limit before signing', async () => {
  const env = freshEnv();
  saveLimits({ perOperationAtomic: '1000', dailyAtomic: '1000' }, env);
  let signatures = 0;
  const fetchImpl = async (url, init = {}) => {
    if (String(url).endsWith('/.well-known/clervo.json')) return response(200, discovery());
    if (String(url).endsWith('/v1/models')) return response(200, modelList({ billingMode: 'metered' }));
    if (String(url).endsWith('/v1/prediction/execute') || String(url).endsWith('/v1/ai/execute')) {
      if (Object.keys(init.headers ?? {}).some((name) => name.toLowerCase() === 'payment-signature')) signatures += 1;
      return response(402, challenge('2000'));
    }
    throw new Error(`unexpected ${url}`);
  };
  const sdk = new ClervoClient({ fetch: fetchImpl, connect: { autoPay: true, env } });
  await assert.rejects(sdk.commerce.execute('prediction.markets', { operation: 'prediction.markets' }, 'typescript_entry_01'), (error) => error.code === 'spend_limit_per_operation_exceeded');
  await assert.rejects(sdk.ai.execute({ model: 'clervo/exact', input: { kind: 'chat', messages: [{ role: 'user', content: 'ready' }] } }, { idempotencyKey: 'typescript_ai_entry_01' }), (error) => error instanceof ClervoProblemError && error.problem.code === 'spend_limit_per_operation_exceeded');

  const mcpHandlers = createConnectToolHandlers({ search: { web: async () => ({}), answer: async () => ({}) }, models: { list: async () => modelList({ billingMode: 'metered' }) }, ai: { execute: async () => ({}) } }, new ClervoConnect({ surface: 'mcp', autoPay: true, env, fetch: fetchImpl }), 'prediction');
  const mcpLimit = await mcpHandlers.clervo_execute({ productId: 'prediction.markets', body: { operation: 'prediction.markets' }, idempotencyKey: 'mcp_limit_entry_01' });
  assert.equal(mcpLimit.isError, true);
  assert.equal(JSON.parse(mcpLimit.content[0].text).error, 'spend_limit_per_operation_exceeded');

  const proxy = await startOpenAiProxy({ port: 0, autoPay: true, env, fetch: fetchImpl });
  try {
    const proxyResponse = await fetch(`${proxy.baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer placeholder' }, body: JSON.stringify({ model: 'clervo/exact', messages: [{ role: 'user', content: 'ready' }] }) });
    const proxyBody = await proxyResponse.json();
    assert.equal(proxyResponse.status, 400, JSON.stringify(proxyBody));
    assert.equal(proxyBody.error.code, 'spend_limit_per_operation_exceeded');
  } finally {
    await proxy.close();
  }
  assert.equal(signatures, 0);
  assert.equal(listOperations(env).length, 0);
});

test('B11 cross-process payment reservation prevents concurrent surfaces bypassing daily limits', async () => {
  const env = freshEnv();
  createWallet({}, env);
  saveLimits({ perOperationAtomic: '2000', dailyAtomic: '2000' }, env);
  const registry = await loadRegistry({ fetchImpl: async () => response(200, discovery()) });
  let allowApproval;
  const approvalGate = new Promise((resolve) => { allowApproval = resolve; });
  let quoteObserved;
  const quoteGate = new Promise((resolve) => { quoteObserved = resolve; });
  const fetchImpl = async () => { quoteObserved(); return response(402, challenge('2000')); };
  const first = callPaid({ registry, productId: 'prediction.markets', body: { query: 'first' }, idempotencyKey: 'concurrent_mcp_01', env, fetchImpl, surface: 'mcp', approve: async () => { await approvalGate; return false; } });
  await quoteGate;
  await assert.rejects(callPaid({ registry, productId: 'prediction.markets', body: { query: 'second' }, idempotencyKey: 'concurrent_openai_01', env, fetchImpl, surface: 'openai', approve: () => true }), (error) => error.code === 'commerce_lock_busy');
  allowApproval();
  await assert.rejects(first, (error) => error.code === 'payment_not_approved');
  assert.equal(listOperations(env).length, 0);
});

test('B11 one ambiguous MCP settlement freezes every surface and retrieval-only reconciliation unfreezes it', async () => {
  const env = freshEnv();
  createWallet({}, env);
  saveLimits({ perOperationAtomic: '20000', dailyAtomic: '100000' }, env);
  let authorizedSends = 0;
  let reconcileMode = false;
  const fetchImpl = async (url, init = {}) => {
    if (String(url).endsWith('/.well-known/clervo.json')) return response(200, discovery());
    if (String(url).endsWith('/v1/prediction/execute')) {
      const signed = Object.keys(init.headers ?? {}).some((name) => name.toLowerCase() === 'payment-signature');
      if (signed) { authorizedSends += 1; throw new Error('socket closed after authorization'); }
      return response(402, challenge('2000'));
    }
    throw new Error(`unexpected ${url}`);
  };
  const mcp = new ClervoConnect({ surface: 'mcp', env, autoPay: true, fetch: fetchImpl });
  await assert.rejects(mcp.execute('prediction.markets', { operation: 'prediction.markets', query: 'markets' }, 'ambiguous_mcp_0001'), (error) => error.code === 'settlement_unknown');
  assert.equal(authorizedSends, 1);
  assert.equal(readOperation('ambiguous_mcp_0001', env).authorizationCreated, true);
  assert.equal(unreconciledOperations(env).length, 1);
  for (const surface of ['cli', 'typescript', 'python', 'openai']) {
    const other = new ClervoConnect({ surface, env, autoPay: true, fetch: fetchImpl });
    await assert.rejects(other.execute('prediction.markets', { operation: 'prediction.markets', query: surface }, `blocked_${surface}_01`), (error) => error.code === 'unreconciled_operation_blocks_spend');
  }
  reconcileMode = true;
  assert.equal(reconcileMode, true);
  const resolution = await mcp.reconcile();
  assert.equal(resolution[0].resolved, 'not_settled');
  assert.equal(authorizedSends, 1, 'reconciliation must carry no fresh authorization');
  assert.equal(unreconciledOperations(env).length, 0);
  const quoteOnly = new ClervoConnect({ surface: 'typescript', env, autoPay: false, fetch: fetchImpl });
  assert.equal((await quoteOnly.execute('prediction.markets', { operation: 'prediction.markets', query: 'after' }, 'after_reconcile_01')).status, 'payment_required');
  const usage = localUsage(env);
  assert.equal(usage.amountAuthorizedAtomic, '2000');
  assert.equal(usage.amountSettledAtomic, '0');
  assert.equal(usage.bySurface.mcp.calls, 1);
});

test('B11 local usage is derived from durable operations and authoritative receipts', () => {
  const env = freshEnv();
  const receipt = { receiptId: 'rcpt_b11_usage', customerCharge: { amountAtomic: '3000' }, settlement: { status: 'settled', referenceHash: `0x${'e'.repeat(64)}` }, route: 'route.actual' };
  saveReceipt(receipt, env);
  writeOperation({ schemaVersion: OPERATION_SCHEMA_VERSION, idempotencyKey: 'usage_paid_0001', productId: 'crypto.wallet.transactions', resource: '/v1/crypto/execute', requestBodyHash: `sha256:${'a'.repeat(64)}`, requestBody: { operation: 'crypto.wallet.transactions' }, state: 'settled', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), quotedAtomic: '3000', chargedAtomic: '3000', operationId: 'op_usage', receiptId: receipt.receiptId, settlementReferenceHash: receipt.settlement.referenceHash, replayed: false, reason: null, surface: 'python', authorizationCreated: true }, env);
  writeOperation({ schemaVersion: OPERATION_SCHEMA_VERSION, idempotencyKey: 'usage_free_00001', productId: 'search.web', resource: '/v1/search/free', requestBodyHash: `sha256:${'b'.repeat(64)}`, requestBody: { query: 'free' }, state: 'free', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), quotedAtomic: '0', chargedAtomic: '0', operationId: 'op_free', receiptId: null, settlementReferenceHash: null, replayed: true, reason: null, surface: 'mcp', authorizationCreated: false }, env);
  const usage = localUsage(env);
  assert.equal(usage.calls, 2);
  assert.equal(usage.free, 1);
  assert.equal(usage.paid, 1);
  assert.equal(usage.amountSettledAtomic, '3000');
  assert.equal(usage.bySurface.python.settledAtomic, '3000');
  assert.equal(usage.byModelOrRoute['route.actual'].calls, 1);
  assert.equal(usage.bySurface.mcp.replayed, 1);
});

test('B11 canonical AI identity fails on substitution while an explicit alias exposes the actual model', async () => {
  const env = freshEnv();
  const fetchImpl = async (url) => {
    if (String(url).endsWith('/.well-known/clervo.json')) return response(200, discovery());
    if (String(url).endsWith('/v1/models')) return response(200, modelList());
    if (String(url).endsWith('/v1/ai/execute')) return response(200, { contractVersion: '2026-07-29.1', operationId: 'op_ai', operation: 'ai.execute', productId: 'ai.chat', model: 'clervo/other', exactModelId: 'clervo/other', state: 'COMPLETED', replayed: false, fundingMode: 'free', requestHash: `sha256:${'c'.repeat(64)}`, result: { output: { kind: 'chat', content: 'wrong' } } });
    throw new Error(`unexpected ${url}`);
  };
  const connect = new ClervoConnect({ surface: 'typescript', env, fetch: fetchImpl });
  await assert.rejects(connect.execute('ai.chat', { model: 'clervo/exact', input: { kind: 'chat', messages: [], responseFormat: 'text', stream: false } }, 'exact_model_0001'), /canonical_model_substituted/u);

  const aliasFetch = async (url) => {
    if (String(url).endsWith('/.well-known/clervo.json')) return response(200, discovery());
    if (String(url).endsWith('/v1/models')) return response(200, modelList({ alias: true }));
    if (String(url).endsWith('/v1/ai/execute')) return response(200, { contractVersion: '2026-07-29.1', operationId: 'op_alias', operation: 'ai.execute', productId: 'ai.chat', model: 'clervo/route', exactModelId: 'clervo/exact', state: 'COMPLETED', replayed: false, fundingMode: 'free', requestHash: `sha256:${'d'.repeat(64)}`, result: { output: { kind: 'chat', content: 'routed' }, route: { routeId: 'route.actual' } } });
    throw new Error(`unexpected ${url}`);
  };
  const routed = await new ClervoConnect({ surface: 'openai', env: freshEnv(), fetch: aliasFetch }).execute('ai.chat', { model: 'clervo/route', input: { kind: 'chat', messages: [], responseFormat: 'text', stream: false } }, 'alias_model_0001');
  assert.equal(routed.outcome.result.exactModelId, 'clervo/exact');
  assert.equal(routed.outcome.result.result.route.routeId, 'route.actual');
});

test('B11 local OpenAI compatibility provides models, non-streaming chat and SSE without creating a wallet', async () => {
  const env = freshEnv();
  let aiCalls = 0;
  const fetchImpl = async (url) => {
    if (String(url).endsWith('/.well-known/clervo.json')) return response(200, discovery());
    if (String(url).endsWith('/v1/models')) return response(200, modelList());
    if (String(url).endsWith('/v1/ai/execute')) {
      aiCalls += 1;
      return response(200, { contractVersion: '2026-07-29.1', operationId: `op_proxy_${aiCalls}`, operation: 'ai.execute', productId: 'ai.chat', model: 'clervo/exact', exactModelId: 'clervo/exact', state: 'COMPLETED', replayed: false, fundingMode: 'free', requestHash: `sha256:${'f'.repeat(64)}`, result: { output: { kind: 'chat', content: 'ready' }, route: { routeId: 'route.exact' } } });
    }
    throw new Error(`unexpected ${url}`);
  };
  const proxy = await startOpenAiProxy({ port: 0, env, fetch: fetchImpl });
  try {
    const models = await fetch(`${proxy.baseUrl}/models`).then((value) => value.json());
    assert.equal(models.object, 'list');
    const ordinary = await fetch(`${proxy.baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer placeholder' }, body: JSON.stringify({ model: 'clervo/exact', messages: [{ role: 'user', content: 'ready' }], stream: false }) });
    const completion = await ordinary.json();
    assert.equal(completion.object, 'chat.completion');
    assert.equal(completion.model, 'clervo/exact');
    assert.equal(completion.choices[0].message.content, 'ready');
    assert.equal(ordinary.headers.get('x-clervo-model'), 'clervo/exact');
    const streamed = await fetch(`${proxy.baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'clervo/exact', messages: [{ role: 'user', content: 'ready' }], stream: true }) });
    const transcript = await streamed.text();
    assert.match(streamed.headers.get('content-type'), /^text\/event-stream/u);
    assert.match(transcript, /chat\.completion\.chunk/u);
    assert.match(transcript, /data: \[DONE\]/u);
    assert.equal(existsSync(join(env.CLERVO_HOME, 'wallet.json')), false);
  } finally { await proxy.close(); }
});

test('B11 MCP profiles execute only currently served families through the shared Connect core', async () => {
  const calls = [];
  const connect = {
    autoPay: true,
    async registry() { return { capabilities: [{ productId: 'prediction.markets', family: 'prediction', paidCallable: true }] }; },
    async execute(...args) { calls.push(args); return { status: 'completed', outcome: { operationId: 'op_mcp' } }; },
    status() { return { wallet: { address: '0x' + '1'.repeat(40) } }; }, limits() { return {}; }, usage() { return {}; }, async reconcile() { return []; }, async doctor() { return { healthy: true }; },
  };
  const client = { search: { web: async () => ({}), answer: async () => ({}) }, models: { list: async () => ({}) }, ai: { execute: async () => ({}) } };
  const handlers = createConnectToolHandlers(client, connect, 'prediction');
  const result = await handlers.clervo_execute({ productId: 'prediction.markets', body: { operation: 'prediction.markets' }, idempotencyKey: 'mcp_paid_0001', paid: true });
  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][3].paid, true);
  const rpc = await handlers.clervo_execute({ productId: 'rpc.call', body: {}, idempotencyKey: 'mcp_rpc_000001', paid: true });
  assert.equal(rpc.isError, true);
  assert.match(rpc.content[0].text, /operation_not_served_in_profile/u);
});
