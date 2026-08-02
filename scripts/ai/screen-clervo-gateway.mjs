#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exactModels = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'];
const aliases = ['clervo/fast', 'clervo/smart', 'clervo/code', 'clervo/deep'];

async function configuration() {
  const file = await readFile(path.join(root, '.env'), 'utf8');
  const local = Object.fromEntries(file.split(/\r?\n/u).filter((line) => line !== '' && !line.startsWith('#')).map((line) => {
    const separator = line.indexOf('=');
    return separator < 1 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
  }));
  const baseUrl = process.env.CLERVO_AI_BASE_URL ?? local.CLERVO_AI_BASE_URL;
  const opaqueCredential = process.env.CLERVO_AI_API_KEY ?? local.CLERVO_AI_API_KEY;
  if (typeof baseUrl !== 'string' || typeof opaqueCredential !== 'string' || opaqueCredential.length < 8 || /[\r\n]/u.test(opaqueCredential)) throw new TypeError('clervo_gateway_configuration_invalid');
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.hostname !== 'ai.clervo.dev' || base.username !== '' || base.password !== '' || base.search !== '' || base.hash !== '') throw new TypeError('clervo_gateway_base_url_invalid');
  return { endpoint: new URL(`${base.pathname.replace(/\/$/u, '')}/chat/completions`, base.origin), opaqueCredential };
}

async function boundedBody(response, maximumBytes = 1_000_000) {
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) > maximumBytes) throw new TypeError('clervo_gateway_response_too_large');
  if (response.body === null) throw new TypeError('clervo_gateway_response_empty');
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new TypeError('clervo_gateway_response_too_large');
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

function usage(value) {
  const source = value !== null && typeof value === 'object' ? value : {};
  const details = source.prompt_tokens_details !== null && typeof source.prompt_tokens_details === 'object' ? source.prompt_tokens_details : {};
  return {
    inputTokens: Number.isSafeInteger(source.prompt_tokens) ? source.prompt_tokens : null,
    cachedInputTokens: Number.isSafeInteger(details.cached_tokens) ? details.cached_tokens : 0,
    outputTokens: Number.isSafeInteger(source.completion_tokens) ? source.completion_tokens : null,
  };
}

function parseStream(bytes) {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let modelIdentity = null;
  let outputText = '';
  let terminalUsage = null;
  let finishReason = null;
  for (const line of source.split(/\r?\n/u)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '' || data === '[DONE]') continue;
    const event = JSON.parse(data);
    if (typeof event.model === 'string') modelIdentity = event.model;
    if (event.usage !== undefined) terminalUsage = usage(event.usage);
    if (Array.isArray(event.choices) && event.choices.length > 0) {
      const choice = event.choices[0];
      if (typeof choice?.delta?.content === 'string') outputText += choice.delta.content;
      if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason;
    }
  }
  return { modelIdentity, outputText, usage: terminalUsage, finishReason };
}

async function completion(config, { model, prompt, stream = false, json = false }) {
  const started = performance.now();
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.opaqueCredential}`, 'content-type': 'application/json', accept: stream ? 'text/event-stream' : 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(45_000),
  });
  const bytes = await boundedBody(response);
  const latencyMs = Math.round((performance.now() - started) * 100) / 100;
  const remaining = response.headers.get('x-ratelimit-remaining-requests');
  if (!response.ok) return { ok: false, status: response.status, latencyMs, remaining };
  if (stream) {
    const parsed = parseStream(bytes);
    return { ok: true, status: response.status, latencyMs, remaining, ...parsed };
  }
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const choice = Array.isArray(body.choices) ? body.choices[0] : undefined;
  return {
    ok: true,
    status: response.status,
    latencyMs,
    remaining,
    modelIdentity: typeof body.model === 'string' ? body.model : null,
    outputText: typeof choice?.message?.content === 'string' ? choice.message.content : '',
    usage: usage(body.usage),
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
  };
}

function safeObservation(result) {
  return {
    ok: result.ok,
    status: result.status,
    latencyMs: result.latencyMs,
    remaining: result.remaining,
    modelIdentity: result.modelIdentity ?? null,
    usage: result.usage ?? null,
    finishReason: result.finishReason ?? null,
  };
}

const config = await configuration();
const report = {
  schemaVersion: 'clervo.gateway-screen.v1',
  checkedAt: new Date().toISOString(),
  endpointOrigin: config.endpoint.origin,
  ownerCashSpentUsd: 0,
  supplierBalanceDebitKnown: false,
  externalCalls: 0,
  exactModels: [],
  aliases: [],
  invalidModel: null,
};

for (const model of exactModels) {
  const first = await completion(config, { model, prompt: 'Return exactly CLERVO-QUAL-A' }); report.externalCalls += 1;
  const second = await completion(config, { model, prompt: 'Return exactly CLERVO-QUAL-B' }); report.externalCalls += 1;
  const structured = await completion(config, { model, prompt: 'Return only JSON with the exact object {"nonce":"CLERVO-JSON"}.', json: true }); report.externalCalls += 1;
  const streamed = await completion(config, { model, prompt: 'Return exactly CLERVO-STREAM', stream: true }); report.externalCalls += 1;
  let structuredValid = false;
  try { structuredValid = JSON.parse(structured.outputText).nonce === 'CLERVO-JSON'; } catch { structuredValid = false; }
  report.exactModels.push({
    model,
    checks: {
      authentication: [first, second, structured, streamed].every(({ ok }) => ok),
      exactIdentity: [first, second, structured, streamed].every(({ modelIdentity }) => modelIdentity === model),
      inputDependence: first.outputText.trim() === 'CLERVO-QUAL-A' && second.outputText.trim() === 'CLERVO-QUAL-B',
      usageReporting: [first, second, structured, streamed].every(({ usage: observed }) => observed?.inputTokens > 0 && observed?.outputTokens > 0),
      structuredOutput: structuredValid,
      streaming: streamed.outputText.trim() === 'CLERVO-STREAM' && streamed.usage?.outputTokens > 0 && streamed.finishReason !== null,
    },
    observations: {
      first: safeObservation(first),
      second: safeObservation(second),
      structured: safeObservation(structured),
      streamed: safeObservation(streamed),
    },
  });
}

for (const model of aliases) {
  const result = await completion(config, { model, prompt: 'Return exactly CLERVO-ALIAS' }); report.externalCalls += 1;
  report.aliases.push({ requestedModel: model, observedModel: result.modelIdentity ?? null, outputValid: result.outputText.trim() === 'CLERVO-ALIAS', observation: safeObservation(result) });
}

const invalid = await completion(config, { model: 'clervo-invalid-model-screen', prompt: 'This request must fail.' }); report.externalCalls += 1;
report.invalidModel = { rejectedSafely: !invalid.ok && [400, 404, 422].includes(invalid.status), status: invalid.status, latencyMs: invalid.latencyMs, remaining: invalid.remaining };

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
