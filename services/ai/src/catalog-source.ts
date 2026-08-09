import {
  parseQualifiedAiSupplyCatalog,
  type QualifiedAiSupplyCatalog,
} from '../../../packages/contracts/src/index.js';

export interface QualifiedAiSupplyCatalogSource {
  load(input?: Readonly<{ signal?: AbortSignal }>): Promise<Readonly<QualifiedAiSupplyCatalog>>;
}

export interface QualifiedAiSupplyRevisionStateStore {
  load(): Promise<Readonly<{ catalogRevision: string; generatedAt: string; fingerprint: string }> | null>;
  save(value: Readonly<{ catalogRevision: string; generatedAt: string; fingerprint: string }>): Promise<void>;
}

export class InMemoryQualifiedAiSupplyRevisionStateStore implements QualifiedAiSupplyRevisionStateStore {
  #value: Readonly<{ catalogRevision: string; generatedAt: string; fingerprint: string }> | null = null;
  async load() { return this.#value; }
  async save(value: Readonly<{ catalogRevision: string; generatedAt: string; fingerprint: string }>) { this.#value = Object.freeze({ ...value }); }
}

export class RevisionGuardedQualifiedAiSupplyCatalogSource implements QualifiedAiSupplyCatalogSource {
  readonly #source: QualifiedAiSupplyCatalogSource;
  readonly #state: QualifiedAiSupplyRevisionStateStore;

  constructor(source: QualifiedAiSupplyCatalogSource, state: QualifiedAiSupplyRevisionStateStore) {
    if (typeof source?.load !== 'function' || typeof state?.load !== 'function' || typeof state?.save !== 'function') throw new TypeError('qualified_ai_supply_revision_guard_invalid');
    this.#source = source;
    this.#state = state;
  }

  async load(input: Readonly<{ signal?: AbortSignal }> = {}): Promise<Readonly<QualifiedAiSupplyCatalog>> {
    const catalog = await this.#source.load(input);
    const fingerprint = JSON.stringify(catalog);
    const previous = await this.#state.load();
    if (previous !== null) {
      if (catalog.catalogRevision === previous.catalogRevision && fingerprint !== previous.fingerprint) throw new TypeError('qualified_ai_supply_revision_equivocation');
      if (catalog.catalogRevision !== previous.catalogRevision && Date.parse(catalog.generatedAt) <= Date.parse(previous.generatedAt)) throw new TypeError('qualified_ai_supply_revision_rollback');
    }
    await this.#state.save({ catalogRevision: catalog.catalogRevision, generatedAt: catalog.generatedAt, fingerprint });
    return catalog;
  }
}

export class StaticQualifiedAiSupplyCatalogSource implements QualifiedAiSupplyCatalogSource {
  readonly #catalog: Readonly<QualifiedAiSupplyCatalog>;

  constructor(catalog: unknown) {
    this.#catalog = parseQualifiedAiSupplyCatalog(catalog);
  }

  async load(input: Readonly<{ signal?: AbortSignal }> = {}): Promise<Readonly<QualifiedAiSupplyCatalog>> {
    if (input.signal?.aborted) throw new TypeError('qualified_ai_supply_source_aborted');
    return this.#catalog;
  }
}

export interface AuthenticatedQualifiedAiSupplyCatalogSourceConfig {
  endpoint: string;
  allowedHosts: readonly string[];
  credential(): Promise<string>;
  maximumResponseBytes?: number;
  timeoutMs?: number;
  fetcher?: typeof globalThis.fetch;
}

function catalogEndpoint(value: string, allowedHosts: readonly string[]): URL {
  const endpoint = new URL(value);
  if (
    endpoint.protocol !== 'https:'
    || endpoint.username !== ''
    || endpoint.password !== ''
    || endpoint.hash !== ''
    || endpoint.search !== ''
    || !allowedHosts.includes(endpoint.hostname)
    || /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1\]?$)/u.test(endpoint.hostname)
  ) throw new TypeError('qualified_ai_supply_source_endpoint_invalid');
  return endpoint;
}

async function boundedBody(response: Response, maximumResponseBytes: number): Promise<Uint8Array> {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^(?:0|[1-9][0-9]{0,15})$/u.test(declared) || Number(declared) > maximumResponseBytes)) throw new TypeError('qualified_ai_supply_source_response_too_large');
  if (response.body === null) throw new TypeError('qualified_ai_supply_source_response_empty');
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumResponseBytes) {
        await reader.cancel();
        throw new TypeError('qualified_ai_supply_source_response_too_large');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new TypeError('qualified_ai_supply_source_response_empty');
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export class AuthenticatedQualifiedAiSupplyCatalogSource implements QualifiedAiSupplyCatalogSource {
  readonly #endpoint: URL;
  readonly #credential: () => Promise<string>;
  readonly #maximumResponseBytes: number;
  readonly #timeoutMs: number;
  readonly #fetcher: typeof globalThis.fetch;

  constructor(config: Readonly<AuthenticatedQualifiedAiSupplyCatalogSourceConfig>) {
    if (config.allowedHosts.length === 0 || new Set(config.allowedHosts).size !== config.allowedHosts.length) throw new TypeError('qualified_ai_supply_source_hosts_invalid');
    this.#endpoint = catalogEndpoint(config.endpoint, config.allowedHosts);
    this.#credential = config.credential;
    this.#maximumResponseBytes = config.maximumResponseBytes ?? 5_000_000;
    this.#timeoutMs = config.timeoutMs ?? 10_000;
    this.#fetcher = config.fetcher ?? globalThis.fetch;
    if (!Number.isSafeInteger(this.#maximumResponseBytes) || this.#maximumResponseBytes < 1 || this.#maximumResponseBytes > 20_000_000) throw new TypeError('qualified_ai_supply_source_size_invalid');
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs < 100 || this.#timeoutMs > 60_000) throw new TypeError('qualified_ai_supply_source_timeout_invalid');
  }

  async load(input: Readonly<{ signal?: AbortSignal }> = {}): Promise<Readonly<QualifiedAiSupplyCatalog>> {
    if (input.signal?.aborted) throw new TypeError('qualified_ai_supply_source_aborted');
    let credential: string;
    try {
      credential = await this.#credential();
    } catch {
      throw new TypeError('qualified_ai_supply_source_credential_unavailable');
    }
    if (credential.length < 8 || credential.length > 8_192 || /[\r\n]/u.test(credential)) throw new TypeError('qualified_ai_supply_source_credential_invalid');

    const controller = new AbortController();
    const abort = () => controller.abort();
    input.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, this.#timeoutMs);
    try {
      const response = await this.#fetcher(this.#endpoint, {
        method: 'GET',
        headers: Object.freeze({ authorization: `Bearer ${credential}`, accept: 'application/json' }),
        redirect: 'error',
        signal: controller.signal,
      });
      if (response.status < 200 || response.status >= 300) throw new TypeError('qualified_ai_supply_source_http_failed');
      if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new TypeError('qualified_ai_supply_source_content_type_invalid');
      const body = await boundedBody(response, this.#maximumResponseBytes);
      let decoded: unknown;
      try {
        decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
      } catch {
        throw new TypeError('qualified_ai_supply_source_json_invalid');
      }
      return parseQualifiedAiSupplyCatalog(decoded);
    } catch (error) {
      if (error instanceof TypeError && error.message.startsWith('qualified_ai_supply_')) throw error;
      throw new TypeError(controller.signal.aborted ? 'qualified_ai_supply_source_aborted' : 'qualified_ai_supply_source_transport_failed');
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', abort);
    }
  }
}
