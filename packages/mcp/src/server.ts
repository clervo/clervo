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

export const CLERVO_MCP_TOOLS = Object.freeze([
  Object.freeze({ name: 'search_web', operationId: 'search.web' }),
  Object.freeze({ name: 'search_answer', operationId: 'search.answer' }),
  Object.freeze({ name: 'models_list', operationId: 'ai.catalog' }),
  Object.freeze({ name: 'ai_execute', operationId: 'ai.execute' }),
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

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function text(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function failure(error: unknown): ToolResult {
  const recovery = recoveryActionFor(error);
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
} {
  const execute = async (productId: 'search.web' | 'search.answer', input: ToolInput): Promise<ToolResult> => {
    try {
      const request = {
        query: input.query,
        ...(input.maxResults === undefined ? {} : { maxResults: input.maxResults }),
        ...(input.language === undefined ? {} : { language: input.language }),
        ...(input.region === undefined ? {} : { region: input.region }),
      };
      const options = {
        ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
        ...(input.mode === undefined ? {} : { mode: input.mode }),
      };
      const value = productId === 'search.web'
        ? await client.search.web(request, options)
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
        return text(await client.ai.execute({
          model: input.model,
          input: input.input,
          ...(input.maximumOutputTokens === undefined ? {} : { maximumOutputTokens: input.maximumOutputTokens }),
          ...(input.maximumReasoningTokens === undefined ? {} : { maximumReasoningTokens: input.maximumReasoningTokens }),
        }, input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }));
      } catch (error) { return failure(error); }
    },
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
} = {}): McpServer {
  const baseUrl = options.baseUrl ?? process.env.CLERVO_BASE_URL ?? 'https://api.clervo.dev';
  const client = options.client ?? new ClervoClient({ baseUrl });
  const server = new McpServer({ name: 'clervo', version: '0.4.0' });
  const handlers = createToolHandlers(client);

  server.registerTool(
    'search_web',
    {
      title: 'Clervo web evidence preview',
      description: 'Runs the live bounded free Search route or obtains its exact paid challenge without signing.',
      inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => handlers.search_web(input),
  );
  server.registerTool(
    'search_answer',
    {
      title: 'Clervo cited answer preview',
      description: 'Runs cited synthesis with the product identity fixed by the tool contract; the MCP server never signs or pays.',
      inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => handlers.search_answer(input),
  );
  server.registerTool(
    'models_list',
    {
      title: 'List the live Clervo AI catalog',
      description: 'Returns stable provider-neutral model IDs, capabilities, health, availability, free/paid state, pricing, and commerce metadata.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => handlers.models_list(),
  );
  server.registerTool(
    'ai_execute',
    {
      title: 'Execute a normalized Clervo AI request',
      description: 'Executes a free model or returns the exact paid challenge without signing or paying. The tool never creates a wallet or authorizes payment.',
      inputSchema: aiInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => handlers.ai_execute(input),
  );
  return server;
}
