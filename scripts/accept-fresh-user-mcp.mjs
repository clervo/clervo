#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const siteOrigin = 'https://clervo.dev';
const apiOrigin = 'https://api.clervo.dev';
const expectedTools = ['ai_execute', 'clervo_execute', 'connect_status', 'doctor', 'local_usage', 'models_list', 'reconcile', 'search_web', 'spend_limits'];
const claudeCommand = 'claude mcp add clervo -s user -- npx -y @clervo/mcp';
const runId = `${Date.now()}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
const clervoHome = await mkdtemp(path.join(os.tmpdir(), 'clervo-fresh-user-'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function publicJson(url) {
  const response = await fetch(url);
  assert(response.ok, `public_fetch_failed:${url}:${response.status}`);
  return response.json();
}

let child;
try {
  const startResponse = await fetch(`${siteOrigin}/start/`);
  assert(startResponse.ok, `public_start_failed:${startResponse.status}`);
  const startHtml = await startResponse.text();
  assert(/Claude Code|Generic MCP|Model Context Protocol/iu.test(startHtml), 'public_start_does_not_offer_mcp_path');
  const mcpGuideResponse = await fetch(`${siteOrigin}/docs/mcp/`);
  assert(mcpGuideResponse.ok, `public_mcp_guide_failed:${mcpGuideResponse.status}`);
  const mcpGuideHtml = await mcpGuideResponse.text();
  assert(mcpGuideHtml.includes('@clervo/mcp'), 'public_mcp_guide_does_not_name_package');
  const customerLanguageClean = !/(release candidate|commercially unproven|owner[- ]funded|quote observed unpaid|proof taxonomy|design fixture)/iu.test(`${startHtml}\n${mcpGuideHtml}`);

  const mcpDiscovery = await publicJson(`${siteOrigin}/.well-known/mcp.json`);
  assert(mcpDiscovery.publicApiBaseUrl === apiOrigin, 'public_mcp_origin_mismatch');
  const registry = await publicJson('https://registry.npmjs.org/@clervo%2fmcp');
  assert(typeof registry.readme === 'string' && registry.readme.includes(claudeCommand), 'public_package_readme_missing_claude_command');
  assert(registry.versions?.[mcpDiscovery.version] !== undefined, 'public_mcp_version_missing');

  const models = await publicJson(`${apiOrigin}/v1/models`);
  const freeModel = models.data.find(({ clervo }) => clervo.publicSellable === true && clervo.billingMode === 'free');
  const paidModel = models.data.find(({ clervo }) => clervo.publicSellable === true && clervo.billingMode === 'metered' && clervo.productIds.includes('ai.chat'));
  assert(freeModel !== undefined, 'public_free_model_missing');
  assert(paidModel !== undefined, 'public_paid_chat_model_missing');

  child = spawn('npx', ['-y', `@clervo/mcp@${mcpDiscovery.version}`], {
    cwd: os.tmpdir(),
    env: {
      ...process.env,
      CLERVO_BASE_URL: apiOrigin,
      CLERVO_HOME: clervoHome,
      CLERVO_AUTO_PAY: 'false',
      CLERVO_MCP_PROFILE: 'full',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pending = new Map();
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });

  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const request = (id, method, params = {}) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`mcp_timeout:${method}:${stderr.slice(-500)}`));
    }, 45_000);
    pending.set(id, (response) => {
      clearTimeout(timeout);
      if (response.error !== undefined) reject(new Error(`mcp_error:${method}:${JSON.stringify(response.error)}`));
      else resolve(response.result);
    });
    send({ jsonrpc: '2.0', id, method, params });
  });

  const initialized = await request(1, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'clervo-fresh-user-acceptance', version: '1.0.0' },
  });
  assert(initialized.serverInfo?.name?.startsWith('clervo-'), 'mcp_server_identity_missing');
  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

  const tools = await request(2, 'tools/list');
  const toolNames = tools.tools.map(({ name }) => name).sort();
  assert(JSON.stringify(toolNames) === JSON.stringify(expectedTools), `mcp_tool_inventory_mismatch:${toolNames.join(',')}`);

  const freeResult = await request(3, 'tools/call', {
    name: 'ai_execute',
    arguments: {
      model: freeModel.id,
      input: { kind: 'chat', messages: [{ role: 'user', content: 'Reply only with ready.' }], responseFormat: 'text', stream: false },
      maximumOutputTokens: 12,
      idempotencyKey: `fresh_free_${runId}`,
    },
  });
  assert(freeResult.isError !== true, `free_ai_request_failed:${freeResult.content?.[0]?.text ?? 'unknown'}`);
  const freePayload = JSON.parse(freeResult.content[0].text);

  const paidResult = await request(4, 'tools/call', {
    name: 'ai_execute',
    arguments: {
      model: paidModel.id,
      input: { kind: 'chat', messages: [{ role: 'user', content: 'Reply only with ready.' }], responseFormat: 'text', stream: false },
      maximumOutputTokens: 12,
      idempotencyKey: `fresh_paid_${runId}`,
    },
  });
  const paidPayload = JSON.parse(paidResult.content[0].text);
  assert(paidPayload.status === 'payment_required' && paidPayload.funding === 'paid', `paid_request_did_not_stop_before_execution:${JSON.stringify(paidPayload)}`);
  assert(Array.isArray(paidPayload.quote?.challenge?.accepts) && paidPayload.quote.challenge.accepts.length > 0, 'paid_request_missing_x402_challenge');
  const nextActionClear = /Automatic payment is off by default/iu.test(registry.readme) && /--auto-pay/iu.test(registry.readme);
  assert(nextActionClear, 'public_package_readme_missing_payment_next_action');

  console.log(JSON.stringify({
    status: customerLanguageClean ? 'PASS' : 'BLOCKED_PUBLIC_COPY',
    startingUrl: `${siteOrigin}/start/`,
    claudeCommand,
    package: `@clervo/mcp@${mcpDiscovery.version}`,
    negotiatedProtocol: initialized.protocolVersion,
    server: initialized.serverInfo,
    tools: toolNames,
    freeRequest: { model: freeModel.id, resultState: freePayload.state ?? freePayload.status ?? 'completed', isError: false },
    paidRequest: { model: paidModel.id, httpStatus: 402, status: paidPayload.status, quotedMaximumAtomic: paidPayload.quote.amountAtomic, x402Accepts: paidPayload.quote.challenge.accepts.length, executed: false },
    nextActionClear,
    customerLanguageClean,
    paymentSent: false,
    usdcSpent: 0,
  }, null, 2));
  if (!customerLanguageClean) process.exitCode = 2;
} finally {
  if (child !== undefined && child.exitCode === null) child.kill('SIGTERM');
  await rm(clervoHome, { recursive: true, force: true });
}
