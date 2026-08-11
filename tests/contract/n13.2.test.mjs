import assert from 'node:assert/strict';
import test from 'node:test';

import { ClervoPaymentRequiredError, ClervoProblemError } from '@clervo/sdk';
import {
  CLERVO_MCP_TOOLS,
  createToolHandlers,
} from '../../dist/packages/mcp/src/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('MCP projects Search plus provider-neutral AI discovery and execution', () => {
  assert.deepEqual(CLERVO_MCP_TOOLS.map(({ operationId }) => operationId), [
    'search.web', 'ai.catalog', 'ai.execute', 'connect.execute', 'connect.status',
    'connect.limits', 'connect.usage', 'connect.reconcile', 'connect.doctor',
  ]);
  assert.deepEqual(CLERVO_MCP_TOOLS.map(({ name }) => name), [
    'search_web', 'models_list', 'ai_execute', 'clervo_execute', 'connect_status',
    'spend_limits', 'local_usage', 'reconcile', 'doctor',
  ]);
});

function fixtureClient(search) {
  return {
    search,
    models: { list: async () => ({ object: 'list', data: [] }) },
    ai: { execute: async (request) => ({ productId: 'ai.chat', model: request.model }) },
  };
}

test('MCP handlers force the exact product method and preserve idempotency', async () => {
  const calls = [];
  const handlers = createToolHandlers(fixtureClient({
    web: async (request, options) => {
      calls.push({ productId: 'search.web', request, options });
      return { productId: 'search.web' };
    },
    answer: async (request, options) => {
      calls.push({ productId: 'search.answer', request, options });
      return { productId: 'search.answer' };
    },
  }));
  const input = {
    query: 'evidence',
    maxResults: 4,
    language: 'en',
    region: 'US',
    idempotencyKey: 'idem_mcp_fixture',
    mode: 'preview',
  };
  assert.equal(JSON.parse((await handlers.search_web(input)).content[0].text).productId, 'search.web');
  assert.equal(JSON.parse((await handlers.search_answer(input)).content[0].text).productId, 'search.answer');
  assert.deepEqual(calls.map(({ productId }) => productId), ['search.web', 'search.answer']);
  assert.ok(calls.every(({ options }) => options.idempotencyKey === 'idem_mcp_fixture' && options.mode === 'preview'));
  assert.ok(calls.every(({ request }) => request.query === 'evidence' && request.maxResults === 4));
});

test('MCP never converts a non-payable challenge into success', async () => {
  const handlers = createToolHandlers(fixtureClient({
      web: async () => {
        throw new ClervoPaymentRequiredError({ code: 'mock_payment_required', payable: false }, 'fixture-header');
      },
      answer: async () => {
        throw new Error('not_called');
      },
  }));
  const response = await handlers.search_web({ query: 'evidence', mode: 'challenge' });
  assert.equal(response.isError, true);
  assert.deepEqual(JSON.parse(response.content[0].text), {
    error: 'payment_required',
    status: 402,
    payable: false,
    problem: { code: 'mock_payment_required', payable: false },
  });
});

test('MCP preserves the one-action recovery contract for known failures', async () => {
  const handlers = createToolHandlers(fixtureClient({
      web: async () => {
        throw new ClervoProblemError(402, { code: 'wrong_network' });
      },
      answer: async () => {
        throw new Error('not_called');
      },
  }));
  const response = await handlers.search_web({ query: 'evidence' });
  assert.equal(response.isError, true);
  assert.deepEqual(JSON.parse(response.content[0].text).recovery, {
    code: 'wrong_network_or_asset',
    action: "Switch to the quote's exact network and asset, then request a fresh quote.",
    retry: 'after_action',
  });
});

test('MCP AI handlers list the live authority and never auto-pay a paid request', async () => {
  const calls = [];
  const handlers = createToolHandlers({
    search: { web: async () => ({}), answer: async () => ({}) },
    models: { list: async () => ({ object: 'list', data: [{ id: 'clervo/gemma-4-26b-a4b-it' }] }) },
    ai: { execute: async (request, options) => { calls.push({ request, options }); throw new ClervoPaymentRequiredError({ accepts: [{}], quote: { maximumCharge: { amountAtomic: '1000' } } }, 'fixture-header'); } },
  });
  assert.equal(JSON.parse((await handlers.models_list()).content[0].text).data[0].id, 'clervo/gemma-4-26b-a4b-it');
  const result = await handlers.ai_execute({ model: 'clervo/gpt-5.6-luna', input: { kind: 'chat', messages: [{ role: 'user', content: 'ready' }] }, idempotencyKey: 'idem_mcp_ai_fixture' });
  assert.equal(result.isError, true);
  assert.equal(JSON.parse(result.content[0].text).payable, true);
  assert.deepEqual(calls[0].options, { idempotencyKey: 'idem_mcp_ai_fixture' });
  assert.equal(calls[0].request.model, 'clervo/gpt-5.6-luna');
});

test('stdio server negotiates MCP and lists only the bounded tools', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['packages/mcp/dist/run.js'],
    cwd: process.cwd(),
    stderr: 'pipe',
  });
  const client = new Client({ name: 'clervo-conformance', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(({ name }) => name).sort(), [
      'ai_execute', 'clervo_execute', 'connect_status', 'doctor', 'local_usage',
      'models_list', 'reconcile', 'search_web', 'spend_limits',
    ]);
  } finally {
    await client.close();
  }
});
