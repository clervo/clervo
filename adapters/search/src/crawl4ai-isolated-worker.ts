import { createHash } from 'node:crypto';
import {
  CRAWL4AI_VERSION,
  CRAWL4AI_WORKER_ID,
  PLAYWRIGHT_VERSION,
  assertCrawl4AiRuntimeAttestation,
  crawl4AiIsolationPolicy,
  crawl4AiWorkerHealth,
  type Crawl4AiRuntimeAttestation,
  type Crawl4AiWorkerHealth,
  validateRetrievalUrl,
} from '../../../packages/contracts/src/index.js';
import { assertCrawl4AiRenderResult, type Crawl4AiRenderer, type Crawl4AiRenderResult } from './crawl4ai-js-fallback.js';

export interface IsolatedCrawl4AiJob {
  jobId: string;
  url: string;
  deadlineAt: string;
  policyId: typeof crawl4AiIsolationPolicy.policyId;
  network: Readonly<{
    directEgress: false;
    authorizationGatewayOnly: true;
    validateEveryRequest: true;
  }>;
  capabilities: Readonly<{
    arbitraryJavascript: false;
    hooks: false;
    downloads: false;
    persistentSessions: false;
    llmIntegrations: false;
    fileUrls: false;
    login: false;
    cookies: false;
    captchaSolving: false;
    proxyRotation: false;
    stealth: false;
  }>;
  limits: typeof crawl4AiIsolationPolicy.limits;
  signal: AbortSignal;
}

export interface IsolatedCrawl4AiJobResult extends Crawl4AiRenderResult {
  jobId: string;
  exit: 'clean';
  processCount: number;
  browserPageCount: number;
  networkBytes: number;
  outputCharacters: number;
  peakMemoryBytes: number;
  diskBytes: number;
  stateCreated: true;
  stateRemoved: true;
  cookiesCreated: 0;
  downloadsCreated: 0;
  orphanCountAfterTeardown: 0;
}

export interface IsolatedCrawl4AiTransport {
  execute(job: Readonly<IsolatedCrawl4AiJob>): Promise<Readonly<IsolatedCrawl4AiJobResult>>;
  terminate(jobId: string): Promise<void>;
  listOrphans(): Promise<readonly string[]>;
  reapOrphans(jobIds: readonly string[]): Promise<void>;
}

export class IsolatedCrawl4AiWorker implements Crawl4AiRenderer {
  private activeJobId: string | undefined;
  private killed = false;
  private failed = false;
  private orphanCount = 0;
  private initialized = false;

  constructor(
    private readonly transport: IsolatedCrawl4AiTransport,
    private readonly attestation?: Crawl4AiRuntimeAttestation,
    private readonly now: () => number = Date.now,
  ) {}

  health(): Readonly<Crawl4AiWorkerHealth> {
    if (this.attestation !== undefined && !this.initialized && !this.killed) {
      try {
        assertCrawl4AiRuntimeAttestation(this.attestation);
        return Object.freeze({ lifecycle: 'unavailable', isolationProven: true, killSwitchEngaged: false, activeJobs: 0, orphanCount: this.orphanCount, reason: 'startup_cleanup_pending' });
      } catch { /* use the common invalid-attestation result below */ }
    }
    return crawl4AiWorkerHealth({
      ...(this.attestation === undefined ? {} : { attestation: this.attestation }),
      killSwitchEngaged: this.killed,
      activeJobs: this.activeJobId === undefined ? 0 : 1,
      orphanCount: this.orphanCount,
      workerFailed: this.failed,
    });
  }

  async initialize(): Promise<void> {
    if (this.killed) throw new Error('crawl4ai_kill_switch_engaged');
    if (this.attestation === undefined) throw new Error('crawl4ai_runtime_attestation_missing');
    assertCrawl4AiRuntimeAttestation(this.attestation);
    await this.cleanupOrphans();
    this.initialized = true;
  }

  private async control<T>(operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('crawl4ai_control_timeout')), 1_000); }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async cleanupOrphans(): Promise<number> {
    const orphans = Object.freeze([...(await this.control(this.transport.listOrphans()))].sort());
    if (orphans.length > 0) await this.control(this.transport.reapOrphans(orphans));
    const remaining = await this.control(this.transport.listOrphans());
    this.orphanCount = remaining.length;
    if (remaining.length > 0) throw new Error('crawl4ai_orphan_cleanup_failed');
    return orphans.length;
  }

  async engageKillSwitch(): Promise<void> {
    this.killed = true;
    if (this.activeJobId !== undefined) await this.control(this.transport.terminate(this.activeJobId)).catch(() => undefined);
    await this.cleanupOrphans();
  }

  async render(input: Readonly<{ url: string; deadlineAt: string; signal: AbortSignal }>): Promise<Readonly<Crawl4AiRenderResult>> {
    if (this.killed) throw new Error('crawl4ai_kill_switch_engaged');
    if (this.attestation === undefined) throw new Error('crawl4ai_runtime_attestation_missing');
    assertCrawl4AiRuntimeAttestation(this.attestation);
    if (!this.initialized) throw new Error('crawl4ai_worker_not_initialized');
    if (this.activeJobId !== undefined) throw new Error('crawl4ai_page_limit_reached');
    const deadlineMs = Date.parse(input.deadlineAt);
    const remaining = deadlineMs - this.now();
    if (!Number.isFinite(deadlineMs) || remaining <= 0 || remaining > crawl4AiIsolationPolicy.limits.executionMs) throw new Error('crawl4ai_invalid_deadline');
    if (input.signal.aborted) throw new Error('crawl4ai_cancelled');
    const parsed = validateRetrievalUrl(input.url);
    if (parsed === undefined) throw new Error('crawl4ai_unsupported_target');
    const jobId = `crawl4ai_${createHash('sha256').update(`${parsed.href}\n${input.deadlineAt}`).digest('hex').slice(0, 32)}`;
    this.activeJobId = jobId;
    let timer: NodeJS.Timeout | undefined;
    let removeAbort: (() => void) | undefined;
    try {
      const job: Readonly<IsolatedCrawl4AiJob> = Object.freeze({
        jobId,
        url: parsed.href,
        deadlineAt: input.deadlineAt,
        policyId: crawl4AiIsolationPolicy.policyId,
        network: Object.freeze({ directEgress: false as const, authorizationGatewayOnly: true as const, validateEveryRequest: true as const }),
        capabilities: Object.freeze({ arbitraryJavascript: false as const, hooks: false as const, downloads: false as const, persistentSessions: false as const, llmIntegrations: false as const, fileUrls: false as const, login: false as const, cookies: false as const, captchaSolving: false as const, proxyRotation: false as const, stealth: false as const }),
        limits: crawl4AiIsolationPolicy.limits,
        signal: input.signal,
      });
      const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('crawl4ai_deadline_exceeded')), remaining); });
      const cancelled = new Promise<never>((_resolve, reject) => {
        const abort = () => reject(new Error('crawl4ai_cancelled'));
        removeAbort = () => input.signal.removeEventListener('abort', abort);
        input.signal.addEventListener('abort', abort, { once: true });
      });
      const result = await Promise.race([this.transport.execute(job), timeout, cancelled]);
      this.validateJobResult(job, result);
      this.failed = false;
      return Object.freeze({
        workerId: result.workerId,
        crawl4aiVersion: result.crawl4aiVersion,
        playwrightVersion: result.playwrightVersion,
        title: result.title,
        text: result.text,
        normalizedTextSha256: result.normalizedTextSha256,
        sourceBodySha256: result.sourceBodySha256,
        isolation: Object.freeze({ ...result.isolation }),
      });
    } catch (error) {
      this.failed = true;
      await this.control(this.transport.terminate(jobId)).catch(() => undefined);
      throw error instanceof Error && ['crawl4ai_deadline_exceeded', 'crawl4ai_cancelled'].includes(error.message) ? error : new Error('crawl4ai_worker_failed');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      removeAbort?.();
      this.activeJobId = undefined;
      const orphans = await this.control(this.transport.listOrphans()).catch(() => [jobId]);
      this.orphanCount = orphans.length;
      if (orphans.length > 0) {
        await this.control(this.transport.reapOrphans(orphans)).catch(() => undefined);
        this.orphanCount = (await this.control(this.transport.listOrphans()).catch(() => orphans)).length;
      }
      if (this.orphanCount > 0) throw new Error('crawl4ai_orphan_cleanup_failed');
    }
  }

  private validateJobResult(job: IsolatedCrawl4AiJob, result: IsolatedCrawl4AiJobResult): void {
    assertCrawl4AiRenderResult(result);
    const limits = crawl4AiIsolationPolicy.limits;
    if (result.jobId !== job.jobId || result.exit !== 'clean' || result.processCount < 1 || result.processCount > limits.processes
      || result.browserPageCount !== 1 || result.networkBytes < 1 || result.networkBytes > limits.networkBytes
      || result.outputCharacters !== result.text.length || result.outputCharacters > limits.outputCharacters
      || result.peakMemoryBytes < 1 || result.peakMemoryBytes > limits.memoryBytes || result.diskBytes < 0 || result.diskBytes > limits.ephemeralDiskBytes
      || result.stateCreated !== true || result.stateRemoved !== true || result.cookiesCreated !== 0 || result.downloadsCreated !== 0
      || result.orphanCountAfterTeardown !== 0 || result.workerId !== CRAWL4AI_WORKER_ID || result.crawl4aiVersion !== CRAWL4AI_VERSION
      || result.playwrightVersion !== PLAYWRIGHT_VERSION) throw new Error('crawl4ai_worker_limit_or_teardown_violation');
  }
}
