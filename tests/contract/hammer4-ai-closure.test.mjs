import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createDynamicAiProductionRuntime } from '../../apps/api/src/ai-dynamic-production-runtime.mjs';
import { AiSupplierHealthRegistry } from '../../apps/api/src/ai-supplier-health.mjs';
import { normalizeAnthropicMessagesRequest } from '../../apps/api/src/anthropic-messages-compat.mjs';
import { normalizeOpenAiChatCompletionRequest } from '../../apps/api/src/openai-chat-compat.mjs';
import { normalizeOpenAiResponsesRequest } from '../../apps/api/src/openai-responses-compat.mjs';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import { InMemoryX402OperationStore } from '../../apps/api/src/x402-operation-store.mjs';
import { InMemoryAiFreeTierQuotaStore } from '../../dist/services/ai/src/free-tier.js';
import { assertSupportedStrictJsonSchema, validateStrictJsonSchema } from '../../dist/services/ai/src/json-schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async (name) => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const observedAt = '2026-08-20T06:30:00.000Z';

test('H4 product policy preserves the full catalog while removing GPT-5.6 and Claude from active supply', async () => {
  const [models, policy, supply, identity] = await Promise.all([
    read('generated/b7-ai/public/models.json'),
    read('packages/catalog/ai-h4-product-policy.v1.json'),
    read('packages/catalog/ai-b7-qualified-supply.v1.json'),
    read('packages/catalog/ai-b7-customer-identity-registry.v1.json'),
  ]);
  const canonical = models.data.filter(({ clervo }) => clervo.identityKind === 'canonical');
  const active = canonical.filter(({ clervo }) => clervo.publicSellable && clervo.availability === 'available');
  const temporary = canonical.filter(({ id }) => policy.temporarilyUnavailableModelIds.includes(id));
  assert.equal(canonical.length, supply.models.length);
  assert.equal(active.length, canonical.length - policy.temporarilyUnavailableModelIds.length);
  assert.equal(temporary.length, policy.temporarilyUnavailableModelIds.length);
  assert.ok(active.length >= 75);
  for (const model of temporary) {
    assert.equal(model.clervo.publicSellable, false);
    assert.equal(model.clervo.availability, 'unavailable');
    assert.deepEqual(model.clervo.aliases, []);
  }
  assert.deepEqual(policy.aliases, {
    'clervo/fast': 'clervo/gpt-oss-20b',
    'clervo/smart': 'clervo/gpt-oss-120b',
    'clervo/code': 'clervo/kimi-k2.7-code',
    'clervo/deep': 'clervo/gpt-oss-120b',
  });
  for (const [alias, exact] of Object.entries(policy.aliases)) {
    const target = active.find(({ id }) => id === exact);
    assert.ok(target, `${alias} must target an active exact model`);
    assert.ok(target.clervo.aliases.includes(alias));
  }

  // Bounded synthetic qualification: every active customer identity retains a
  // qualified technical supply record; additional H4 claims are explicit,
  // model-scoped overrides backed by the live free-route qualification.
  const supplyById = new Map(supply.models.map((entry) => [entry.gatewaySupplyId, entry]));
  for (const model of active) {
    const registry = identity.entries.find(({ customerModelId }) => customerModelId === model.id);
    const technical = supplyById.get(registry?.gatewaySupplyId);
    assert.equal(technical?.qualification.state, 'qualified', `${model.id} qualification`);
    assert.ok(Array.isArray(model.clervo.capabilities) && model.clervo.capabilities.length > 0);
    assert.ok(model.clervo.inputTypes.length > 0 && model.clervo.outputTypes.length > 0);
    assert.ok(model.clervo.capabilities.every((capability) => technical.capabilities.includes(capability) || policy.capabilityOverrides[model.id]?.includes(capability)), `${model.id} capability truth`);
  }
});

test('exact compatibility identities never cross models and modern agent inputs normalize canonically', () => {
  assert.equal(normalizeOpenAiChatCompletionRequest({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hello' }] }).model, 'gpt-4o');
  assert.equal(normalizeAnthropicMessagesRequest({ model: 'claude-3-5-sonnet-20241022', max_tokens: 10, messages: [{ role: 'user', content: 'hello' }] }).model, 'claude-3-5-sonnet-20241022');
  assert.equal(normalizeOpenAiResponsesRequest({ model: 'gpt-4o', input: 'hello' }).model, 'gpt-4o');

  const schema = { type: 'object', required: ['status', 'items'], properties: { status: { type: 'string', enum: ['ok', 'error'] }, items: { type: 'array', items: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } }, additionalProperties: false } } }, additionalProperties: false };
  assert.doesNotThrow(() => assertSupportedStrictJsonSchema(schema));
  assert.equal(validateStrictJsonSchema(schema, { status: 'ok', items: [{ id: 1 }] }), true);
  assert.equal(validateStrictJsonSchema(schema, { status: 'maybe', items: [] }), false);
  assert.throws(() => assertSupportedStrictJsonSchema({ type: 'object', patternProperties: { '.*': {} } }), /schema/u);

  const tools = [{ type: 'function', function: { name: 'weather', parameters: { type: 'object', required: ['city'], properties: { city: { type: 'string' } }, additionalProperties: false }, strict: true } }];
  const first = normalizeOpenAiChatCompletionRequest({ model: 'clervo/fast', messages: [{ role: 'system', content: 'Use tools.' }, { role: 'user', content: 'Weather in Paris?' }], tools, tool_choice: { type: 'function', function: { name: 'weather' } } });
  assert.equal(first.input.tools[0].function.name, 'weather');
  assert.deepEqual(first.input.toolChoice, { type: 'function', function: { name: 'weather' } });
  const continued = normalizeOpenAiChatCompletionRequest({ model: 'clervo/fast', messages: [{ role: 'user', content: 'Weather?' }, { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'weather', arguments: '{"city":"Paris"}' } }] }, { role: 'tool', tool_call_id: 'call_1', content: '18 C' }], tools });
  assert.equal(continued.input.messages.at(-1).toolCallId, 'call_1');
  assert.throws(() => normalizeOpenAiChatCompletionRequest({ model: 'clervo/fast', messages: [{ role: 'tool', tool_call_id: 'unknown', content: 'x' }], tools }), /tool/u);
});

test('supplier health isolates healthy sources, quarantines persistent auth failures, and cools quota failures', async () => {
  let now = 1_000;
  const health = new AiSupplierHealthRegistry({ clock: () => now, authenticationQuarantineMs: 500, cooldownMs: 100 });
  let badCalls = 0;
  const bad = health.contain({ routeId: 'same-model', sourceId: 'bad-account', async execute() { badCalls += 1; if (badCalls <= 2) throw Object.assign(new Error('credential_invalid'), { supplierStatus: 401 }); return { recovered: true }; } });
  const healthy = health.contain({ routeId: 'same-model', sourceId: 'healthy-account', async execute() { return { ok: true }; } });
  await assert.rejects(bad.execute({}), /credential/u);
  await assert.rejects(bad.execute({}), /credential/u);
  await assert.rejects(bad.execute({}), /quarantined/u);
  assert.equal(badCalls, 2);
  assert.deepEqual(await healthy.execute({}), { ok: true });
  now += 501;
  assert.deepEqual(await bad.execute({}), { recovered: true });

  let quotaCalls = 0;
  const quota = health.contain({ routeId: 'quota-model', sourceId: 'quota-account', async execute() { quotaCalls += 1; if (quotaCalls === 1) throw Object.assign(new Error('rate_limit'), { supplierStatus: 429, retryAfter: 1 }); return { recovered: true }; } });
  await assert.rejects(quota.execute({}), /rate_limit/u);
  await assert.rejects(quota.execute({}), /cooling/u);
  now += 1_001;
  assert.deepEqual(await quota.execute({}), { recovered: true });
  const snapshot = health.snapshot();
  assert.equal(snapshot.find(({ route }) => route.startsWith('bad-account:')).currentHealth, 'healthy');
  assert.equal(snapshot.find(({ route }) => route.startsWith('healthy-account:')).successes, 1);
  assert.equal(snapshot.find(({ route }) => route.startsWith('quota-account:')).rateLimited, 1);
});

test('stream:true delivers provider events before generation completes', async (context) => {
  let providerFinished = false;
  const liveClock = () => new Date().toISOString();
  const encoder = new TextEncoder();
  const fetcher = async (url, init) => {
    const host = new URL(url).hostname;
    assert.ok(['api.groq.com', 'ai.clervo.dev'].includes(host));
    const request = JSON.parse(typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body));
    assert.equal(request.model, host === 'api.groq.com' ? 'openai/gpt-oss-20b' : 'clervo/gpt-oss-20b');
    assert.equal(request.stream, true);
    const body = new ReadableStream({
      start(controller) {
        setTimeout(() => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: request.model, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })}\n\n`)), 5);
        setTimeout(() => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: request.model, choices: [{ index: 0, delta: { content: 'Progressive output.' }, finish_reason: null }] })}\n\n`)), 20);
        setTimeout(() => {
          providerFinished = true;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: request.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2 } })}\n\ndata: [DONE]\n\n`));
          controller.close();
        }, 150);
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  const runtime = await createDynamicAiProductionRuntime({
    env: { CLERVO_AI_BASE_URL: 'https://ai.clervo.dev/v1/', CLERVO_AI_GATEWAY_TOKEN: 'gateway-test-token', GROQ_API_KEY: 'groq-test-token' },
    fetcher,
    clock: liveClock,
    artifactStore: { async put() { throw new Error('artifact_not_expected'); } },
  });
  const server = createSearchServer({
    executor: { async execute() { throw new Error('search_not_expected'); } },
    now: liveClock,
    environment: 'test', releaseId: 'h4-stream-test', edgeAuthorization: 'edge-authorization-at-least-32-characters',
    x402Service: { mode: 'settlement_enabled', async challenge() { throw new Error('payment_not_expected'); }, async authorize() { throw new Error('payment_not_expected'); }, async settle() { throw new Error('payment_not_expected'); } },
    x402StateStore: new InMemoryX402OperationStore({ environmentNamespace: 'h4_stream' }),
    aiPublicPricing: runtime.publicPricing, aiAdapters: runtime.adapters, aiRuntimeBindings: runtime.runtimeBindings,
    aiFreeTier: { policy: { ...runtime.freeTierPolicy, perWalletDailyRequests: 10, globalDailyRequests: 10 }, store: new InMemoryAiFreeTierQuotaStore() },
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters', 'x-clervo-quota-subject': `sha256:${'4'.repeat(64)}` }, body: JSON.stringify({ model: 'clervo/fast', messages: [{ role: 'user', content: 'Stream now.' }], stream: true, stream_options: { include_usage: true } }) });
  if (response.status !== 200) assert.fail(await response.text());
  assert.match(response.headers.get('content-type'), /^text\/event-stream/u);
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.equal(first.done, false);
  assert.equal(providerFinished, false, 'first event must arrive while the provider is still generating');
  let text = new TextDecoder().decode(first.value);
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    text += new TextDecoder().decode(next.value);
  }
  assert.equal(providerFinished, true);
  assert.match(text, /Progressive output\./u);
  assert.match(text, /"usage"/u);
  assert.match(text, /\[DONE\]/u);
});

test('Chat, Responses, and Anthropic execute tools, continuations, parallel calls, and strict output truthfully', async (context) => {
  const liveClock = () => new Date().toISOString();
  let executions = 0;
  let authorizations = 0;
  let settlements = 0;
  const decode = (body) => JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body));
  const fetcher = async (url, init) => {
    executions += 1;
    const host = new URL(url).hostname;
    const request = decode(init.body);
    const last = request.messages.at(-1);
    let content = 'Normal useful output.';
    let toolCalls;
    let finishReason = 'stop';
    if (last?.role === 'tool') content = 'Tool result incorporated.';
    else if (request.response_format?.type === 'json_object') content = '{"status":"ok"}';
    else if (request.response_format?.type === 'json_schema') content = last?.content?.includes?.('invalid schema') ? '{"status":"wrong"}' : '{"status":"ok"}';
    else if (Array.isArray(request.tools) && request.tools.length > 0) {
      const definitions = request.tools.map((tool) => tool.function);
      const selected = host === 'ai.clervo.dev' ? definitions.slice(0, 2) : definitions.slice(0, 1);
      toolCalls = selected.map((definition, index) => ({ id: `call_${index + 1}`, type: 'function', function: { name: definition.name, arguments: JSON.stringify(definition.name === 'weather' ? { city: 'Paris' } : { zone: 'UTC' }) } }));
      content = null;
      finishReason = 'tool_calls';
    }
    return new Response(JSON.stringify({ model: request.model, choices: [{ index: 0, message: { role: 'assistant', content, ...(toolCalls === undefined ? {} : { tool_calls: toolCalls }) }, finish_reason: finishReason }], usage: { prompt_tokens: 8, completion_tokens: 4 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const runtime = await createDynamicAiProductionRuntime({ env: { CLERVO_AI_BASE_URL: 'https://ai.clervo.dev/v1/', CLERVO_AI_GATEWAY_TOKEN: 'gateway-test-token', GROQ_API_KEY: 'groq-test-token' }, fetcher, clock: liveClock, artifactStore: { async put() { throw new Error('artifact_not_expected'); } } });
  const server = createSearchServer({
    executor: { async execute() { throw new Error('search_not_expected'); } }, now: liveClock, environment: 'test', releaseId: 'h4-agent-test', edgeAuthorization: 'edge-authorization-at-least-32-characters',
    x402Service: {
      mode: 'settlement_enabled',
      async challenge({ quote, resourcePath }) { return { status: 402, headers: { 'payment-required': 'synthetic' }, body: { accepts: [{ amount: quote.maximumCharge.amountAtomic }], resource: { url: `https://api.clervo.dev${resourcePath}` } } }; },
      async authorize() { authorizations += 1; return { fingerprint: `sha256:${authorizations.toString(16).padStart(64, '0')}` }; },
      async settle() { settlements += 1; return { kind: 'settled', headers: { 'payment-response': 'synthetic-settled' }, settlement: { network: 'eip155:8453', transaction: `0x${settlements.toString(16).padStart(64, '0')}` } }; },
    },
    x402StateStore: new InMemoryX402OperationStore({ environmentNamespace: 'h4_agents' }),
    aiPublicPricing: runtime.publicPricing, aiAdapters: runtime.adapters, aiRuntimeBindings: runtime.runtimeBindings,
    aiFreeTier: { policy: { ...runtime.freeTierPolicy, perWalletDailyRequests: 50, globalDailyRequests: 50 }, store: new InMemoryAiFreeTierQuotaStore() },
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const edge = { 'content-type': 'application/json', 'x-clervo-edge-authorization': 'Bearer edge-authorization-at-least-32-characters', 'x-clervo-quota-subject': `sha256:${'5'.repeat(64)}` };
  const toolDefinitions = [
    { type: 'function', function: { name: 'weather', description: 'Weather lookup', parameters: { type: 'object', required: ['city'], properties: { city: { type: 'string' } }, additionalProperties: false }, strict: true } },
    { type: 'function', function: { name: 'clock', description: 'Time lookup', parameters: { type: 'object', required: ['zone'], properties: { zone: { type: 'string' } }, additionalProperties: false }, strict: true } },
  ];

  const chatCall = await fetch(`${origin}/v1/chat/completions`, { method: 'POST', headers: edge, body: JSON.stringify({ model: 'clervo/fast', messages: [{ role: 'user', content: 'Use weather.' }], tools: toolDefinitions, tool_choice: { type: 'function', function: { name: 'weather' } } }) });
  assert.equal(chatCall.status, 200, await chatCall.clone().text());
  const chatTool = await chatCall.json();
  assert.equal(chatTool.choices[0].finish_reason, 'tool_calls');
  assert.equal(chatTool.choices[0].message.tool_calls[0].function.name, 'weather');
  const chatContinuation = await fetch(`${origin}/v1/chat/completions`, { method: 'POST', headers: edge, body: JSON.stringify({ model: 'clervo/fast', messages: [{ role: 'user', content: 'Use weather.' }, chatTool.choices[0].message, { role: 'tool', tool_call_id: chatTool.choices[0].message.tool_calls[0].id, content: '18 C' }], tools: toolDefinitions }) });
  assert.equal(chatContinuation.status, 200, await chatContinuation.clone().text());
  assert.equal((await chatContinuation.json()).choices[0].message.content, 'Tool result incorporated.');

  const anthropicTools = toolDefinitions.map(({ function: definition }) => ({ name: definition.name, description: definition.description, input_schema: definition.parameters }));
  const anthropicCall = await fetch(`${origin}/v1/messages`, { method: 'POST', headers: edge, body: JSON.stringify({ model: 'clervo/fast', max_tokens: 64, messages: [{ role: 'user', content: 'Use weather.' }], tools: anthropicTools, tool_choice: { type: 'tool', name: 'weather' } }) });
  assert.equal(anthropicCall.status, 200, await anthropicCall.clone().text());
  const anthropicTool = await anthropicCall.json();
  assert.equal(anthropicTool.stop_reason, 'tool_use');
  assert.equal(anthropicTool.content[0].type, 'tool_use');
  const anthropicContinuation = await fetch(`${origin}/v1/messages`, { method: 'POST', headers: edge, body: JSON.stringify({ model: 'clervo/fast', max_tokens: 64, messages: [{ role: 'user', content: 'Use weather.' }, { role: 'assistant', content: anthropicTool.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: anthropicTool.content[0].id, content: '18 C' }] }], tools: anthropicTools }) });
  assert.equal(anthropicContinuation.status, 200, await anthropicContinuation.clone().text());
  assert.equal((await anthropicContinuation.json()).content[0].text, 'Tool result incorporated.');

  const responseTools = toolDefinitions.map(({ function: definition }) => ({ type: 'function', name: definition.name, description: definition.description, parameters: definition.parameters, strict: true }));
  const responsesCall = await fetch(`${origin}/v1/responses`, { method: 'POST', headers: { ...edge, 'idempotency-key': 'idem_h4_responses_parallel_1', 'payment-signature': 'synthetic' }, body: JSON.stringify({ model: 'clervo/code', input: 'Use weather and clock.', tools: responseTools, tool_choice: 'required', parallel_tool_calls: true, store: false }) });
  assert.equal(responsesCall.status, 200, await responsesCall.clone().text());
  const parallel = await responsesCall.json();
  const calls = parallel.output.filter(({ type }) => type === 'function_call');
  assert.equal(calls.length, 2);
  const responseContinuation = await fetch(`${origin}/v1/responses`, { method: 'POST', headers: { ...edge, 'idempotency-key': 'idem_h4_responses_parallel_2', 'payment-signature': 'synthetic' }, body: JSON.stringify({ model: 'clervo/code', input: [...calls, ...calls.map((call) => ({ type: 'function_call_output', call_id: call.call_id, output: call.name === 'weather' ? '18 C' : '12:00' }))], tools: responseTools, parallel_tool_calls: true, store: false }) });
  assert.equal(responseContinuation.status, 200, await responseContinuation.clone().text());
  assert.match((await responseContinuation.json()).output[0].content[0].text, /incorporated/u);

  const jsonObject = await fetch(`${origin}/v1/chat/completions`, { method: 'POST', headers: edge, body: JSON.stringify({ model: 'clervo/fast', messages: [{ role: 'user', content: 'Return JSON.' }], response_format: { type: 'json_object' } }) });
  assert.equal(jsonObject.status, 200, await jsonObject.clone().text());
  assert.equal(JSON.parse((await jsonObject.json()).choices[0].message.content).status, 'ok');
  const strictFormat = { type: 'json_schema', json_schema: { name: 'status', strict: true, schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } }, additionalProperties: false } } };
  const strict = await fetch(`${origin}/v1/chat/completions`, { method: 'POST', headers: edge, body: JSON.stringify({ model: 'clervo/fast', messages: [{ role: 'user', content: 'Return schema.' }], response_format: strictFormat }) });
  assert.equal(strict.status, 200, await strict.clone().text());
  assert.equal(JSON.parse((await strict.json()).choices[0].message.content).status, 'ok');
  const beforeInvalid = executions;
  const unsupported = await fetch(`${origin}/v1/chat/completions`, { method: 'POST', headers: { ...edge, 'idempotency-key': 'idem_h4_schema_unsupported', 'payment-signature': 'synthetic' }, body: JSON.stringify({ model: 'clervo/code', messages: [{ role: 'user', content: 'Return schema.' }], response_format: strictFormat }) });
  assert.equal(unsupported.status, 422, await unsupported.clone().text());
  assert.equal(executions, beforeInvalid, 'unsupported strict schema must fail before supplier execution');
  assert.equal(authorizations, 2, 'only the two supported paid Responses calls authorize payment');
  assert.equal(settlements, 2);
});
