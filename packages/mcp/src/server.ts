import {
  ClervoClient,
  ClervoPaymentRequiredError,
  ClervoProblemError,
  recoveryActionFor,
  type ClervoAiRequest,
  type ClervoSearchRequest,
} from '@clervo/sdk';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ClervoConnect, RouterError, type Registry } from '@clervo/router';

export type ClervoMcpProfile = 'full' | 'research' | 'ai' | 'prediction' | 'crypto' | 'sandbox';

const PROFILE_FAMILIES: Readonly<Record<ClervoMcpProfile, readonly string[]>> = Object.freeze({
  full: Object.freeze(['search', 'ai', 'prediction', 'crypto_intelligence', 'sandbox']),
  research: Object.freeze(['search']),
  ai: Object.freeze(['ai']),
  prediction: Object.freeze(['prediction']),
  crypto: Object.freeze(['crypto_intelligence']),
  sandbox: Object.freeze(['sandbox']),
});

function profileName(value: string | undefined): ClervoMcpProfile {
  if (value === undefined || value === '') return 'full';
  if (Object.hasOwn(PROFILE_FAMILIES, value)) return value as ClervoMcpProfile;
  throw new TypeError(`unknown_clervo_mcp_profile:${value}`);
}

export const CLERVO_MCP_TOOLS = Object.freeze([
  Object.freeze({ name: 'search_web', operationId: 'search.web' }),
  Object.freeze({ name: 'models_list', operationId: 'ai.catalog' }),
  Object.freeze({ name: 'ai_execute', operationId: 'ai.execute' }),
  Object.freeze({ name: 'clervo_execute', operationId: 'connect.execute' }),
  Object.freeze({ name: 'connect_status', operationId: 'connect.status' }),
  Object.freeze({ name: 'spend_limits', operationId: 'connect.limits' }),
  Object.freeze({ name: 'local_usage', operationId: 'connect.usage' }),
  Object.freeze({ name: 'reconcile', operationId: 'connect.reconcile' }),
  Object.freeze({ name: 'doctor', operationId: 'connect.doctor' }),
] as const);

export interface ClervoMcpClient {
  search: {
    web(request: ClervoSearchRequest, options?: { idempotencyKey?: string; mode?: 'preview' | 'challenge' }): Promise<unknown>;
    answer(request: ClervoSearchRequest, options?: { idempotencyKey?: string; mode?: 'preview' | 'challenge' }): Promise<unknown>;
  };
  models: { list(): Promise<unknown> };
  ai: { execute(request: ClervoAiRequest, options?: { idempotencyKey?: string }): Promise<unknown> };
}

export interface ToolInput {
  query: string;
  maxResults?: number | undefined;
  language?: string | undefined;
  region?: string | undefined;
  idempotencyKey?: string | undefined;
  mode?: 'preview' | 'challenge' | undefined;
}

export interface AiToolInput {
  model: string;
  input: Record<string, unknown>;
  maximumOutputTokens?: number | undefined;
  maximumReasoningTokens?: number | undefined;
  idempotencyKey?: string | undefined;
}

export interface ExecuteToolInput {
  productId: string;
  body: Record<string, unknown>;
  idempotencyKey?: string | undefined;
  paid?: boolean | undefined;
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function text(value: unknown): ToolResult {
  const customerValue = value !== null
    && typeof value === 'object'
    && (value as { status?: unknown }).status === 'payment_required'
    ? {
        ...(value as Record<string, unknown>),
        nextAction: 'Review the quoted maximum, asset, network, recipient, and expiry. To approve it, explicitly enable payment in a Clervo client after setting local spend limits; otherwise stop here. No payment has been sent.',
      }
    : value;
  return { content: [{ type: 'text', text: JSON.stringify(customerValue) }] };
}

function failure(error: unknown): ToolResult {
  const recovery = recoveryActionFor(error);
  const localCode = error instanceof RouterError || error instanceof Error && typeof (error as Error & { code?: unknown }).code === 'string'
    ? (error as Error & { code: string }).code
    : undefined;
  if (localCode !== undefined) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: localCode, detail: error instanceof Error ? error.message : localCode, ...(recovery === undefined ? {} : { recovery }) }) }],
      isError: true,
    };
  }
  if (error instanceof ClervoPaymentRequiredError) {
    const payable = error.problem.payable === true || Array.isArray(error.problem.accepts);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'payment_required',
          status: 402,
          payable,
          problem: error.problem,
          ...(recovery === undefined ? {} : { recovery }),
        }),
      }],
      isError: true,
    };
  }
  if (error instanceof ClervoProblemError) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'clervo_problem',
          status: error.status,
          problem: error.problem,
          ...(recovery === undefined ? {} : { recovery }),
        }),
      }],
      isError: true,
    };
  }
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: 'clervo_call_failed' }) }],
    isError: true,
  };
}

export function createToolHandlers(client: ClervoMcpClient): {
  search_web(input: ToolInput): Promise<ToolResult>;
  search_answer(input: ToolInput): Promise<ToolResult>;
  models_list(): Promise<ToolResult>;
  ai_execute(input: AiToolInput): Promise<ToolResult>;
  clervo_execute(input: ExecuteToolInput): Promise<ToolResult>;
  connect_status(): Promise<ToolResult>;
  spend_limits(): Promise<ToolResult>;
  local_usage(): Promise<ToolResult>;
  reconcile(): Promise<ToolResult>;
  doctor(): Promise<ToolResult>;
} {
  const connect = new ClervoConnect({ surface: 'mcp', autoPay: false });
  return createConnectToolHandlers(client, connect, 'full', true);
}

function familyFor(productId: string): string {
  const family = productId.split('.', 1)[0] ?? '';
  return family === 'crypto' ? 'crypto_intelligence' : family;
}

export function createConnectToolHandlers(client: ClervoMcpClient, connect: ClervoConnect, profile: ClervoMcpProfile, legacyClient = false): ReturnType<typeof createToolHandlers> {
  const execute = async (productId: 'search.web' | 'search.answer', input: ToolInput): Promise<ToolResult> => {
    try {
      const request = {
        query: input.query,
        synthesize: productId === 'search.answer',
        ...(input.maxResults === undefined ? {} : { maxResults: input.maxResults }),
        ...(input.language === undefined ? {} : { language: input.language }),
        ...(input.region === undefined ? {} : { region: input.region }),
      };
      const options = {
        ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
        ...(input.mode === undefined ? {} : { mode: input.mode }),
      };
      const value = productId === 'search.web'
        ? legacyClient ? await client.search.web(request, options) : await connect.execute('search.web', request, input.idempotencyKey, { paid: input.mode === 'challenge' })
        : await client.search.answer(request, options);
      return text(value);
    } catch (error) {
      return failure(error);
    }
  };
  return Object.freeze({
    search_web: (input) => execute('search.web', input),
    search_answer: (input) => execute('search.answer', input),
    models_list: async () => {
      try { return text(await client.models.list()); } catch (error) { return failure(error); }
    },
    ai_execute: async (input) => {
      try {
        const body = {
          model: input.model,
          input: input.input,
          ...(input.maximumOutputTokens === undefined ? {} : { maximumOutputTokens: input.maximumOutputTokens }),
          ...(input.maximumReasoningTokens === undefined ? {} : { maximumReasoningTokens: input.maximumReasoningTokens }),
        };
        const productId = input.input.kind === 'embedding' ? 'ai.embed' : input.input.kind === 'image' ? 'ai.image' : input.input.kind === 'speech' ? 'ai.speech' : input.input.kind === 'video' ? 'ai.video' : input.input.kind === 'music' ? 'ai.music' : input.input.kind === 'virtual_try_on' ? 'ai.virtual_try_on' : 'ai.chat';
        return text(legacyClient
          ? await client.ai.execute(body, input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey })
          : await connect.execute(productId, body, input.idempotencyKey));
      } catch (error) { return failure(error); }
    },
    clervo_execute: async (input) => {
      try {
        const registry = await connect.registry();
        const allowedFamilies = PROFILE_FAMILIES[profile];
        const family = familyFor(input.productId);
        const capability = registry.capabilities.find(({ productId }) => productId === input.productId);
        if (!allowedFamilies.includes(family) || capability === undefined || !capability.paidCallable) throw new RouterError('operation_not_served_in_profile', `${input.productId} is not currently served in the ${profile} profile`);
        return text(await connect.execute(input.productId, input.body, input.idempotencyKey, { paid: input.paid === true }));
      } catch (error) { return failure(error); }
    },
    connect_status: async () => text(connect.status()),
    spend_limits: async () => text(connect.limits()),
    local_usage: async () => text(connect.usage()),
    reconcile: async () => { try { return text(await connect.reconcile()); } catch (error) { return failure(error); } },
    doctor: async () => { try { return text(await connect.doctor()); } catch (error) { return failure(error); } },
  });
}

const inputSchema = {
  query: z.string().trim().min(1).max(2_000).describe('The evidence query.'),
  maxResults: z.number().int().min(1).max(10).optional(),
  language: z.string().regex(/^[a-z]{2,3}$/u).optional(),
  region: z.string().regex(/^[A-Z]{2}$/u).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  mode: z.enum(['preview', 'challenge']).default('preview').describe('Preview calls the live free route. Challenge obtains the exact paid 402 but never signs or pays.'),
};
const aiInputSchema = {
  model: z.string().trim().min(1).max(160).describe('Stable canonical Clervo model ID or a published alias.'),
  input: z.record(z.string(), z.unknown()).describe('Normalized AI input object; its kind must match the selected model capability.'),
  maximumOutputTokens: z.number().int().min(1).max(65_536).optional(),
  maximumReasoningTokens: z.number().int().min(0).max(65_536).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
};

export function createClervoMcpServer(options: {
  client?: ClervoMcpClient;
  baseUrl?: string;
  profile?: string;
  autoPay?: boolean;
  env?: NodeJS.ProcessEnv;
  registry?: Registry;
} = {}): McpServer {
  const profile = profileName(options.profile ?? process.env.CLERVO_MCP_PROFILE);
  const baseUrl = options.baseUrl ?? process.env.CLERVO_BASE_URL ?? 'https://api.clervo.dev';
  const client = options.client ?? new ClervoClient({ baseUrl });
  const connectEnv = options.env ?? { ...process.env, CLERVO_API_ORIGIN: baseUrl };
  const connect = new ClervoConnect({ surface: 'mcp', autoPay: options.autoPay === true, env: connectEnv });
  const server = new McpServer({ name: `clervo-${profile}`, version: '0.5.2' });
  const handlers = createConnectToolHandlers(client, connect, profile);

  if (PROFILE_FAMILIES[profile].includes('search')) server.registerTool(
    'search_web',
    {
      title: 'Search the web with Clervo',
      description: 'Runs the live bounded free Search route or obtains its exact paid challenge without signing.',
      inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => handlers.search_web(input),
  );
  if (PROFILE_FAMILIES[profile].includes('ai')) server.registerTool(
    'models_list',
    {
      title: 'List the live Clervo AI catalog',
      description: 'Returns stable provider-neutral model IDs, capabilities, health, availability, free/paid state, pricing, and commerce metadata.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => handlers.models_list(),
  );
  if (PROFILE_FAMILIES[profile].includes('ai')) server.registerTool(
    'ai_execute',
    {
      title: 'Execute a normalized Clervo AI request',
      description: 'Executes a free model or returns the exact paid challenge without signing or paying. The tool never creates a wallet or authorizes payment.',
      inputSchema: aiInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => handlers.ai_execute(input),
  );
  server.registerTool(
    'clervo_execute',
    {
      title: `Execute a currently served Clervo ${profile} operation`,
      description: `Generic execution for the ${profile} profile. Runtime registry truth is checked on every call. Automatic payment is ${connect.autoPay ? 'enabled within local limits' : 'disabled; payable calls return a quote'}.`,
      inputSchema: {
        productId: z.string().trim().min(3).max(160),
        body: z.record(z.string(), z.unknown()),
        idempotencyKey: z.string().regex(/^[A-Za-z0-9_.-]{8,128}$/u).optional(),
        paid: z.boolean().default(false).describe('For a product with a free path, explicitly request its paid path. Signing still requires local --auto-pay opt-in.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => handlers.clervo_execute(input),
  );
  for (const [name, title, handler] of [
    ['connect_status', 'Clervo wallet and shared Connect status', handlers.connect_status],
    ['spend_limits', 'Clervo buyer-side spend limits', handlers.spend_limits],
    ['local_usage', 'Clervo durable local usage', handlers.local_usage],
    ['reconcile', 'Reconcile unresolved Clervo operations without a new payment', handlers.reconcile],
    ['doctor', 'Diagnose the local Clervo Connect installation', handlers.doctor],
  ] as const) {
    server.registerTool(name, { title, description: title, inputSchema: {}, annotations: { readOnlyHint: name !== 'reconcile', destructiveHint: false, idempotentHint: true, openWorldHint: name === 'doctor' } }, async () => handler());
  }
  return server;
}
