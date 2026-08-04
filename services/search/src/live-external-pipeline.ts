import { createHash } from 'node:crypto';
import {
  createSearchResponse,
  type SearchCitation,
  type SearchEvidence,
  type SearchExecutionOutput,
  type SearchExecutor,
  type SearchExecutorInput,
} from '../../../packages/contracts/src/index.js';
import {
  createBraveExternalIndexAdapter,
  createSerperExternalIndexAdapter,
  ExternalIndexRouter,
  type ExternalIndexTransport,
} from './external-index-router.js';

const MAXIMUM_UPSTREAM_BYTES = 1_000_000;

function identifier(prefix: 'sr' | 'cite', value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

function boundedCeiling(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 100_000) throw new Error(`invalid_${name}`);
  return value;
}

export function createExternalIndexTransport(): ExternalIndexTransport {
  return async (request) => {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      redirect: 'error',
      signal: request.signal,
    });
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAXIMUM_UPSTREAM_BYTES) throw new Error('external_index_response_too_large');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAXIMUM_UPSTREAM_BYTES) throw new Error('external_index_response_too_large');
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('external_index_invalid_json'); }
    return Object.freeze({ status: response.status, body });
  };
}

export interface LiveExternalSearchExecutor extends SearchExecutor {
  readonly remaining: Readonly<{ primary: number; fallback: number }>;
}

export function createLiveExternalSearchExecutor(options: Readonly<{
  primaryCredential: string;
  fallbackCredential: string;
  primaryCallCeiling: number;
  fallbackCallCeiling: number;
  transport?: ExternalIndexTransport;
}>): LiveExternalSearchExecutor {
  const transport = options.transport ?? createExternalIndexTransport();
  const router = new ExternalIndexRouter({
    primary: createBraveExternalIndexAdapter({ credential: options.primaryCredential, transport }),
    fallback: createSerperExternalIndexAdapter({ credential: options.fallbackCredential, transport }),
    primaryCallCeiling: boundedCeiling(options.primaryCallCeiling, 'primary_call_ceiling'),
    fallbackCallCeiling: boundedCeiling(options.fallbackCallCeiling, 'fallback_call_ceiling'),
  });
  return Object.freeze({
    get remaining() { return router.remaining; },
    async execute(input: Readonly<SearchExecutorInput>): Promise<SearchExecutionOutput> {
      if (input.synthesize) throw new Error('search_synthesis_unavailable');
      const observedAt = new Date().toISOString();
      const upstream = await router.search({
        query: input.query,
        maximumResults: input.maxResults,
        language: input.language,
        region: input.region,
      });
      if (upstream.results.length === 0) throw new Error('external_index_no_results');
      const evidence: readonly SearchEvidence[] = Object.freeze(upstream.results.map((result, index) => Object.freeze({
        resultId: identifier('sr', `${input.operationId}\n${result.url}`),
        sourceId: 'adapter_external_index_v1',
        url: result.url,
        title: result.title,
        snippet: result.snippet,
        evidenceText: result.snippet,
        retrievedAt: observedAt,
        authorityScore: 80,
        relevanceScore: Math.max(50, 100 - index * 5),
      })));
      const ranked = createSearchResponse({
        operationId: input.operationId,
        query: input.query,
        language: input.language,
        region: input.region,
        now: observedAt,
        evidence,
        maxResults: input.maxResults,
      });
      const citations: readonly SearchCitation[] = Object.freeze(ranked.results.map((result) => {
        const endOffset = Math.min(result.evidenceText.length, 280);
        return Object.freeze({
          citationId: identifier('cite', `${input.operationId}\n${result.resultId}`),
          resultId: result.resultId,
          canonicalUrl: result.canonicalUrl,
          quote: result.evidenceText.slice(0, endOffset),
          startOffset: 0,
          endOffset,
        });
      }));
      return Object.freeze({
        searchResponse: createSearchResponse({
          operationId: input.operationId,
          query: input.query,
          language: input.language,
          region: input.region,
          now: observedAt,
          evidence,
          maxResults: input.maxResults,
          citations,
        }),
      });
    },
  });
}
