import { spawn } from 'node:child_process';
import {
  SCRAPLING_VERSION,
  SCRAPLING_WORKER_ID,
  type RetrievalFetchReceipt,
} from '../../../packages/contracts/src/index.js';

export interface ScraplingExtraction {
  workerId: typeof SCRAPLING_WORKER_ID;
  version: typeof SCRAPLING_VERSION;
  title: string;
  text: string;
  language: string;
  canonicalUrl?: string;
  discoveredLinks: readonly string[];
  configuration: {
    networkAccess: false;
    adaptive: false;
    impersonation: false;
    stealth: false;
    proxy: false;
    captcha: false;
  };
}

export interface ScraplingFocusedWorker {
  readonly workerId: typeof SCRAPLING_WORKER_ID;
  readonly version: typeof SCRAPLING_VERSION;
  extract(receipt: RetrievalFetchReceipt, body: Uint8Array): Promise<Readonly<ScraplingExtraction>>;
}

export interface ScraplingWorkerOptions {
  pythonExecutable: string;
  scriptPath: string;
  timeoutMs: number;
  maximumOutputBytes: number;
}

function validateExtraction(value: ScraplingExtraction): Readonly<ScraplingExtraction> {
  if (value.workerId !== SCRAPLING_WORKER_ID || value.version !== SCRAPLING_VERSION) throw new Error('scrapling_worker_identity_substitution');
  if (value.configuration.networkAccess || value.configuration.adaptive || value.configuration.impersonation
    || value.configuration.stealth || value.configuration.proxy || value.configuration.captcha) throw new Error('scrapling_worker_unsafe_configuration');
  if (value.title.length < 1 || value.title.length > 512 || value.text.length < 1 || value.text.length > 500_000) throw new Error('scrapling_worker_invalid_output');
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/u.test(value.language)) throw new Error('scrapling_worker_invalid_language');
  return Object.freeze({ ...value, discoveredLinks: Object.freeze([...value.discoveredLinks]) });
}

export function createScraplingFocusedWorker(options: ScraplingWorkerOptions): ScraplingFocusedWorker {
  if (options.pythonExecutable.trim() === '' || options.scriptPath.trim() === '') throw new Error('scrapling_worker_command_required');
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 10_000
    || !Number.isSafeInteger(options.maximumOutputBytes) || options.maximumOutputBytes < 1 || options.maximumOutputBytes > 2_000_000) throw new Error('invalid_scrapling_worker_limits');
  const worker: ScraplingFocusedWorker = {
    workerId: SCRAPLING_WORKER_ID,
    version: SCRAPLING_VERSION,
    async extract(receipt, body) {
      if (receipt.outcome !== 'succeeded' || receipt.finalUrl === undefined || receipt.contentType === undefined
        || receipt.contentLengthBytes !== body.byteLength || receipt.bodySha256 === undefined) throw new Error('scrapling_worker_requires_bounded_fetch');
      return await new Promise((resolve, reject) => {
        const child = spawn(options.pythonExecutable, [options.scriptPath], { stdio: ['pipe', 'pipe', 'pipe'], env: { LANG: 'C.UTF-8', PATH: process.env.PATH ?? '' } });
        const chunks: Buffer[] = [];
        let outputBytes = 0;
        let settled = false;
        const finish = (error?: Error, value?: ScraplingExtraction) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error !== undefined) reject(error);
          else resolve(validateExtraction(value!));
        };
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          finish(new Error('scrapling_worker_unavailable'));
        }, options.timeoutMs);
        child.stdout.on('data', (chunk: Buffer) => {
          outputBytes += chunk.byteLength;
          if (outputBytes > options.maximumOutputBytes) {
            child.kill('SIGKILL');
            finish(new Error('scrapling_worker_output_too_large'));
          } else chunks.push(chunk);
        });
        child.once('error', () => finish(new Error('scrapling_worker_unavailable')));
        child.once('close', (code) => {
          if (settled) return;
          if (code !== 0) {
            finish(new Error('scrapling_worker_unavailable'));
            return;
          }
          try {
            finish(undefined, JSON.parse(Buffer.concat(chunks).toString('utf8')) as ScraplingExtraction);
          } catch {
            finish(new Error('scrapling_worker_invalid_output'));
          }
        });
        child.stdin.end(JSON.stringify({
          receipt: { finalUrl: receipt.finalUrl, contentType: receipt.contentType, bodySha256: receipt.bodySha256 },
          bodyBase64: Buffer.from(body).toString('base64'),
        }));
      });
    },
  };
  return Object.freeze(worker);
}
