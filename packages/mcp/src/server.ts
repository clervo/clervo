import {
  ClervoClient,
  ClervoPaymentRequiredError,
  ClervoProblemError,
  recoveryActionFor,
  type ClervoSearchRequest,
} from '@clervo/sdk';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const CLERVO_MCP_TOOLS = Object.freeze([
  Object.freeze({ name: 'search_web', operationId: 'search.web' }),
  Object.freeze({ name: 'search_answer', operationId: 'search.answer' }),
] as const);

export interface ClervoSearchClient {
  search: {
    web(request: ClervoSearchRequest, options?: { idempotencyKey?: string; mode?: 'preview' | 'challenge' }): Promise<unknown>;
    answer(request: ClervoSearchRequest, options?: { idempotencyKey?: string; mode?: 'preview' | 'challenge' }): Promise<unknown>;
  };
}

export interface ToolInput {
  query: string;
  maxResults?: number | undefined;
  language?: string | undefined;
  region?: string | undefined;
  idempotencyKey?: string | undefined;
  mode?: 'preview' | 'challenge' | undefined;
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
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'payment_required',
          status: 402,
          payable: false,
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

export function createToolHandlers(client: ClervoSearchClient): {
  search_web(input: ToolInput): Promise<ToolResult>;
  search_answer(input: ToolInput): Promise<ToolResult>;
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
  });
}

const inputSchema = {
  query: z.string().trim().min(1).max(2_000).describe('The evidence query.'),
  maxResults: z.number().int().min(1).max(10).optional(),
  language: z.string().regex(/^[a-z]{2,3}$/u).optional(),
  region: z.string().regex(/^[A-Z]{2}$/u).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  mode: z.enum(['preview', 'challenge']).default('preview').describe('Preview executes the local sample route. Challenge returns a non-payable 402 and never pays.'),
};

export function createClervoMcpServer(options: {
  client?: ClervoSearchClient;
  baseUrl?: string;
} = {}): McpServer {
  const baseUrl = options.baseUrl ?? process.env.CLERVO_BASE_URL;
  const client = options.client ?? (baseUrl === undefined ? undefined : new ClervoClient({ baseUrl }));
  const server = new McpServer({ name: 'clervo', version: '0.3.0' });
  const handlers = client === undefined ? undefined : createToolHandlers(client);

  server.registerTool(
    'search_web',
    {
      title: 'Clervo web evidence preview',
      description: 'Runs the repository-local search.web preview. Public availability and payment are not claimed.',
      inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => handlers === undefined
      ? { content: [{ type: 'text', text: JSON.stringify({ error: 'clervo_base_url_required' }) }], isError: true }
      : handlers.search_web(input),
  );
  server.registerTool(
    'search_answer',
    {
      title: 'Clervo cited answer preview',
      description: 'Runs the repository-local search.answer preview with synthesis forced on. Public availability and payment are not claimed.',
      inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => handlers === undefined
      ? { content: [{ type: 'text', text: JSON.stringify({ error: 'clervo_base_url_required' }) }], isError: true }
      : handlers.search_answer(input),
  );
  return server;
}
