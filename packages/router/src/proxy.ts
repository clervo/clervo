import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { ClervoConnect, type ConnectExecution } from './connect.js';
import { formatUsdc } from './chain.js';
import { RouterError } from './client.js';
import type { ConnectSurface } from './store.js';

const MAXIMUM_BODY_BYTES = 4_194_304;

export interface ProxyOptions {
  readonly host?: string;
  readonly port?: number;
  readonly autoPay?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetch?: typeof fetch;
}

export interface RunningProxy {
  readonly host: string;
  readonly port: number;
  readonly baseUrl: string;
  readonly autoPay: boolean;
  readonly server: Server;
  close(): Promise<void>;
}

function json(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(Buffer.byteLength(body)), 'cache-control': 'no-store', ...headers });
  response.end(body);
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.byteLength;
    if (size > MAXIMUM_BODY_BYTES) throw new Error('request_too_large');
    chunks.push(value);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_request');
  return parsed as Record<string, unknown>;
}

function outputOf(execution: ConnectExecution): { content: string; raw: Record<string, unknown> } {
  if (execution.status !== 'completed') throw new Error('payment_required');
  const raw = execution.outcome.result;
  const normalized = (raw.result as Record<string, unknown> | undefined) ?? raw;
  const output = (normalized.output as Record<string, unknown> | undefined) ?? normalized;
  const content = typeof output.content === 'string' ? output.content : typeof output.text === 'string' ? output.text : JSON.stringify(output);
  return { content, raw };
}

function metadata(execution: ConnectExecution): Record<string, unknown> {
  if (execution.status !== 'completed') return { idempotencyKey: execution.idempotencyKey, quote: execution.quote };
  const result = execution.outcome.result;
  const receipt = result.receipt as Record<string, unknown> | undefined;
  return {
    idempotencyKey: execution.idempotencyKey,
    operationId: execution.outcome.operationId,
    funding: execution.funding,
    model: result.model,
    exactModelId: result.exactModelId,
    route: result.route ?? (result.result as Record<string, unknown> | undefined)?.route,
    receiptId: receipt?.receiptId,
    settlement: receipt?.settlement,
    replayed: execution.outcome.replayed,
  };
}

function responseHeaders(execution: ConnectExecution): Record<string, string> {
  const details = metadata(execution);
  const headers: Record<string, string> = { 'x-clervo-idempotency-key': execution.idempotencyKey };
  for (const [field, header] of [['operationId', 'x-clervo-operation-id'], ['exactModelId', 'x-clervo-model'], ['receiptId', 'x-clervo-receipt-id']] as const) {
    if (typeof details[field] === 'string') headers[header] = details[field] as string;
  }
  return headers;
}

function openAiError(response: ServerResponse, status: number, code: string, message: string, extra: Record<string, unknown> = {}): void {
  json(response, status, { error: { message, type: code, code, ...extra } });
}

export async function startOpenAiProxy(options: ProxyOptions = {}): Promise<RunningProxy> {
  const host = options.host ?? '127.0.0.1';
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('proxy_host_must_be_loopback');
  const connect = new ClervoConnect({ surface: 'openai', autoPay: options.autoPay === true, ...(options.env === undefined ? {} : { env: options.env }), ...(options.fetch === undefined ? {} : { fetch: options.fetch }) });
  const connectFor = (request: IncomingMessage): ClervoConnect => {
    const requested = request.headers['x-clervo-surface'];
    const surface: ConnectSurface = requested === 'python' ? 'python' : 'openai';
    return surface === 'openai' ? connect : new ClervoConnect({ surface, autoPay: options.autoPay === true, ...(options.env === undefined ? {} : { env: options.env }), ...(options.fetch === undefined ? {} : { fetch: options.fetch }) });
  };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${host}`);
      const localConnect = connectFor(request);
      if (request.method === 'GET' && url.pathname === '/v1/models') {
        const models = await connect.models();
        json(response, 200, { object: 'list', data: models.models.map((model) => ({ id: model.id, object: 'model', created: 0, owned_by: 'clervo', clervo: model })), clervo: { catalogRevision: models.revision, inventory: models.inventory } });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/clervo/status') { json(response, 200, localConnect.status()); return; }
      if (request.method === 'GET' && url.pathname === '/clervo/usage') { json(response, 200, localConnect.usage()); return; }
      if (request.method === 'GET' && url.pathname === '/clervo/limits') { json(response, 200, localConnect.limits()); return; }
      if (request.method === 'GET' && url.pathname === '/clervo/doctor') { json(response, 200, await localConnect.doctor()); return; }
      if (request.method === 'GET' && url.pathname === '/clervo/catalog') { json(response, 200, await localConnect.registry()); return; }
      if (request.method === 'POST' && url.pathname === '/clervo/limits') {
        const value = await body(request);
        json(response, 200, localConnect.setLimits({ ...(typeof value.perOperationAtomic === 'string' ? { perOperationAtomic: value.perOperationAtomic } : {}), ...(typeof value.dailyAtomic === 'string' ? { dailyAtomic: value.dailyAtomic } : {}) }));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/clervo/reconcile') { json(response, 200, { results: await localConnect.reconcile() }); return; }
      if (request.method === 'POST' && url.pathname === '/clervo/wallet/create') {
        const created = localConnect.createWallet();
        json(response, 200, { wallet: created.view, recoveryPhrase: created.mnemonic });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/clervo/wallet/backup') {
        const value = await body(request);
        json(response, 200, localConnect.backupWallet(value.confirm === true));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/clervo/wallet/restore') {
        const value = await body(request);
        if (typeof value.recoveryPhrase !== 'string') throw new Error('wallet_recovery_phrase_required');
        json(response, 200, { wallet: await localConnect.restoreWallet(value.recoveryPhrase) });
        return;
      }
      if (request.method === 'POST' && (url.pathname === '/clervo/quote' || url.pathname === '/clervo/execute')) {
        const value = await body(request);
        if (typeof value.productId !== 'string' || value.body === null || typeof value.body !== 'object' || Array.isArray(value.body)) throw new Error('invalid_connect_request');
        const key = typeof value.idempotencyKey === 'string' ? value.idempotencyKey : undefined;
        const result = url.pathname.endsWith('/quote')
          ? await localConnect.quote(value.productId, value.body as Record<string, unknown>, key)
          : await localConnect.execute(value.productId, value.body as Record<string, unknown>, key, { paid: value.paid === true });
        json(response, 200, result);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/embeddings') {
        const value = await body(request);
        if (typeof value.model !== 'string' || !(typeof value.input === 'string' || Array.isArray(value.input) && value.input.every((entry) => typeof entry === 'string'))) throw new Error('invalid_embedding_request');
        const inputs = typeof value.input === 'string' ? [value.input] : value.input as string[];
        const idempotencyKey = String(request.headers['idempotency-key'] ?? request.headers['x-idempotency-key'] ?? `openai_${crypto.randomUUID().replaceAll('-', '')}`);
        const execution = await connect.execute('ai.embed', { model: value.model, input: { kind: 'embedding', inputs, ...(typeof value.dimensions === 'number' ? { dimensions: value.dimensions } : {}) } }, idempotencyKey);
        if (execution.status === 'payment_required') {
          openAiError(response, 402, 'payment_required', `Clervo auto-pay is disabled. Quote: ${formatUsdc(execution.quote.amountAtomic)} USDC. Restart with --auto-pay after reviewing local limits.`, { clervo: metadata(execution) });
          return;
        }
        const raw = execution.outcome.result;
        const normalized = (raw.result as Record<string, unknown> | undefined) ?? raw;
        const output = (normalized.output as Record<string, unknown> | undefined) ?? normalized;
        const vectors = Array.isArray(output.embeddings) ? output.embeddings : [];
        if (!vectors.every((vector) => Array.isArray(vector) && vector.every((item) => typeof item === 'number'))) throw new Error('embedding_result_contract_mismatch');
        json(response, 200, { object: 'list', data: vectors.map((embedding, index) => ({ object: 'embedding', embedding, index })), model: typeof raw.exactModelId === 'string' ? raw.exactModelId : value.model, usage: normalized.usage ?? null, clervo: metadata(execution) }, responseHeaders(execution));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
        const value = await body(request);
        if (typeof value.model !== 'string' || !Array.isArray(value.messages)) throw new Error('invalid_chat_request');
        const idempotencyKey = String(request.headers['idempotency-key'] ?? request.headers['x-idempotency-key'] ?? `openai_${crypto.randomUUID().replaceAll('-', '')}`);
        const execution = await connect.execute('ai.chat', {
          model: value.model,
          input: { kind: 'chat', messages: value.messages, responseFormat: 'text', stream: false, ...(value.temperature === undefined ? {} : { temperature: value.temperature }) },
          ...(typeof value.max_tokens === 'number' ? { maximumOutputTokens: value.max_tokens } : {}),
        }, idempotencyKey);
        if (execution.status === 'payment_required') {
          openAiError(response, 402, 'payment_required', `Clervo auto-pay is disabled. Quote: ${formatUsdc(execution.quote.amountAtomic)} USDC. Restart with --auto-pay after reviewing local limits.`, { clervo: metadata(execution) });
          return;
        }
        const { content, raw } = outputOf(execution);
        const actualModel = typeof raw.exactModelId === 'string' ? raw.exactModelId : value.model;
        const created = Math.floor(Date.now() / 1000);
        const id = `chatcmpl_${execution.outcome.operationId}`;
        const details = metadata(execution);
        if (value.stream === true) {
          response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-store', connection: 'keep-alive', ...responseHeaders(execution) });
          response.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: actualModel, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }], clervo: details })}\n\n`);
          response.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: actualModel, choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`);
          response.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: actualModel, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
          response.end('data: [DONE]\n\n');
          return;
        }
        json(response, 200, { id, object: 'chat.completion', created, model: actualModel, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: (raw.result as Record<string, unknown> | undefined)?.usage ?? null, clervo: details }, responseHeaders(execution));
        return;
      }
      openAiError(response, 404, 'not_found', 'The local Clervo proxy does not implement this endpoint.');
    } catch (error) {
      const localCode = error instanceof RouterError || error instanceof Error && typeof (error as Error & { code?: unknown }).code === 'string'
        ? (error as Error & { code: string }).code
        : undefined;
      if (localCode !== undefined) {
        const status = localCode === 'payment_approval_required' ? 402 : localCode === 'settlement_unknown' || localCode === 'unreconciled_operation_blocks_spend' ? 409 : 400;
        openAiError(response, status, localCode, error instanceof Error ? error.message : localCode);
        return;
      }
      const message = error instanceof Error ? error.message : 'proxy request failed';
      const clientError = new Set(['invalid_request', 'invalid_chat_request', 'invalid_embedding_request', 'invalid_connect_request', 'request_too_large', 'wallet_recovery_phrase_required']).has(message);
      openAiError(response, clientError ? 400 : 500, clientError ? message : 'clervo_proxy_error', message);
    }
  });
  const port = options.port ?? 8402;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); });
  const address = server.address();
  const boundPort = address !== null && typeof address === 'object' ? address.port : port;
  return Object.freeze({ host, port: boundPort, baseUrl: `http://${host}:${boundPort}/v1`, autoPay: connect.autoPay, server, close: () => new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))) });
}
