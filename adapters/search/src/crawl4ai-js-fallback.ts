import {
  CRAWL4AI_VERSION,
  CRAWL4AI_WORKER_ID,
  PLAYWRIGHT_VERSION,
  type RetrievalFetchReceipt,
  type Crawl4AiWorkerHealth,
} from '../../../packages/contracts/src/index.js';

export interface Crawl4AiRenderResult {
  workerId: typeof CRAWL4AI_WORKER_ID;
  crawl4aiVersion: typeof CRAWL4AI_VERSION;
  playwrightVersion: typeof PLAYWRIGHT_VERSION;
  title: string;
  text: string;
  normalizedTextSha256: string;
  sourceBodySha256: string;
  isolation: {
    internalOnly: true;
    disposableProcess: true;
    persistentState: false;
    arbitraryJavascript: false;
    hooks: false;
    llmIntegrations: false;
    downloads: false;
    stealth: false;
    proxy: false;
  };
}

export interface Crawl4AiRenderer {
  render(input: Readonly<{ url: string; deadlineAt: string; signal: AbortSignal }>): Promise<Readonly<Crawl4AiRenderResult>>;
  health?: () => Readonly<Crawl4AiWorkerHealth>;
}

export function javascriptRequiredDeterministically(receipt: RetrievalFetchReceipt, body: Uint8Array): boolean {
  if (receipt.outcome !== 'succeeded' || receipt.contentType?.split(';', 1)[0]?.toLowerCase() !== 'text/html') return false;
  const html = new TextDecoder('utf-8', { fatal: false }).decode(body).slice(0, 250_000);
  const hasScript = /<script\b/iu.test(html);
  const explicitRequirement = /<(?:noscript|meta)\b[^>]*>[^<]*(?:requires?|enable) javascript/iu.test(html)
    || /data-(?:requires-js|render-mode)\s*=\s*["'](?:true|javascript)["']/iu.test(html);
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, '').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
  return hasScript && (explicitRequirement || visible.length < 40);
}

export function assertCrawl4AiRenderResult(result: Crawl4AiRenderResult): void {
  if (result.workerId !== CRAWL4AI_WORKER_ID || result.crawl4aiVersion !== CRAWL4AI_VERSION || result.playwrightVersion !== PLAYWRIGHT_VERSION) throw new Error('crawl4ai_identity_substitution');
  if (!result.isolation.internalOnly || !result.isolation.disposableProcess || result.isolation.persistentState || result.isolation.arbitraryJavascript
    || result.isolation.hooks || result.isolation.llmIntegrations || result.isolation.downloads || result.isolation.stealth || result.isolation.proxy) throw new Error('crawl4ai_unsafe_configuration');
  if (result.title.trim() === '' || result.text.trim() === '' || !/^sha256:[a-f0-9]{64}$/u.test(result.normalizedTextSha256) || !/^sha256:[a-f0-9]{64}$/u.test(result.sourceBodySha256)) throw new Error('crawl4ai_invalid_output');
}
