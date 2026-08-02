import { createHash, createHmac } from 'node:crypto';
import type { AiArtifactStore } from '../../ai/src/openai-compatible.js';

export interface ObjectStorageTransportRequest {
  method: 'GET' | 'PUT' | 'DELETE';
  url: URL;
  headers: Readonly<Record<string, string>>;
  body?: Uint8Array;
  maximumResponseBytes: number;
  signal: AbortSignal;
}

export interface ObjectStorageTransportResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
}

export type ObjectStorageTransport = (request: Readonly<ObjectStorageTransportRequest>) => Promise<Readonly<ObjectStorageTransportResponse>>;

export interface R2ObjectStoreConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  maximumObjectBytes: number;
  maximumStoredBytesPerProcess: number;
  maximumWritesPerProcess: number;
  maximumReadsPerProcess: number;
  maximumDeletesPerProcess: number;
}

export function createBoundedObjectStorageTransport(fetchImplementation: typeof fetch = fetch): ObjectStorageTransport {
  return async (request) => {
    const response = await fetchImplementation(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: Buffer.from(request.body) }),
      redirect: 'error',
      signal: request.signal,
    });
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > request.maximumResponseBytes) throw new Error('object_storage_response_too_large');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > request.maximumResponseBytes) throw new Error('object_storage_response_too_large');
    return Object.freeze({ status: response.status, headers: Object.freeze(Object.fromEntries(response.headers)), body: bytes });
  };
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(secret: string | Buffer, value: string): Buffer {
  return createHmac('sha256', secret).update(value).digest();
}

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

class OperationBudget {
  private storedBytes = 0;
  private writes = 0;
  private reads = 0;
  private deletes = 0;

  constructor(readonly limits: Readonly<{ storedBytes: number; writes: number; reads: number; deletes: number }>) {}

  acquire(kind: 'write' | 'read' | 'delete', bytes = 0): void {
    if (kind === 'write') {
      if (this.writes >= this.limits.writes || this.storedBytes + bytes > this.limits.storedBytes) throw new Error('object_storage_write_budget_exhausted');
      this.writes += 1;
      this.storedBytes += bytes;
    } else if (kind === 'read') {
      if (this.reads >= this.limits.reads) throw new Error('object_storage_read_budget_exhausted');
      this.reads += 1;
    } else {
      if (this.deletes >= this.limits.deletes) throw new Error('object_storage_delete_budget_exhausted');
      this.deletes += 1;
    }
  }

  snapshot(): Readonly<{ storedBytes: number; writes: number; reads: number; deletes: number }> {
    return Object.freeze({ storedBytes: this.storedBytes, writes: this.writes, reads: this.reads, deletes: this.deletes });
  }
}

function validate(config: R2ObjectStoreConfig): URL {
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username !== '' || endpoint.password !== '' || endpoint.search !== '' || endpoint.hash !== '' || endpoint.pathname !== '/' || !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/u.test(endpoint.hostname)) throw new Error('object_storage_endpoint_invalid');
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/u.test(config.bucket)) throw new Error('object_storage_bucket_invalid');
  if (config.accessKeyId.trim() === '' || config.secretAccessKey.length < 16) throw new Error('object_storage_credential_invalid');
  for (const [name, value] of Object.entries({ maximumObjectBytes: config.maximumObjectBytes, maximumStoredBytesPerProcess: config.maximumStoredBytesPerProcess, maximumWritesPerProcess: config.maximumWritesPerProcess, maximumReadsPerProcess: config.maximumReadsPerProcess, maximumDeletesPerProcess: config.maximumDeletesPerProcess })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`object_storage_${name}_invalid`);
  }
  if (config.maximumObjectBytes < 1 || config.maximumStoredBytesPerProcess < config.maximumObjectBytes) throw new Error('object_storage_byte_budget_invalid');
  return endpoint;
}

export class R2ObjectStore {
  private readonly endpoint: URL;
  private readonly budget: OperationBudget;

  constructor(readonly config: Readonly<R2ObjectStoreConfig>, readonly transport: ObjectStorageTransport, readonly clock: () => Date = () => new Date()) {
    this.endpoint = validate(config);
    this.budget = new OperationBudget({ storedBytes: config.maximumStoredBytesPerProcess, writes: config.maximumWritesPerProcess, reads: config.maximumReadsPerProcess, deletes: config.maximumDeletesPerProcess });
  }

  get usage(): Readonly<{ storedBytes: number; writes: number; reads: number; deletes: number }> { return this.budget.snapshot(); }

  private key(tenantId: string, digest: string): string {
    if (!/^tenant_[A-Za-z0-9]{12,64}$/u.test(tenantId) || !/^[a-f0-9]{64}$/u.test(digest)) throw new Error('object_storage_identity_invalid');
    return `tenants/${tenantId}/artifacts/sha256/${digest}`;
  }

  private async request(method: 'GET' | 'PUT' | 'DELETE', key: string, input: Readonly<{ body?: Uint8Array; contentType?: string; maximumResponseBytes: number; signal?: AbortSignal }>): Promise<Readonly<ObjectStorageTransportResponse>> {
    const body = input.body ?? new Uint8Array();
    const payloadHash = sha256(body);
    const now = this.clock();
    const dateTime = now.toISOString().replace(/[:-]|\.\d{3}/gu, '');
    const date = dateTime.slice(0, 8);
    const path = `/${encodePath(this.config.bucket)}/${encodePath(key)}`;
    const url = new URL(path, this.endpoint);
    const contentHeaders = input.contentType === undefined ? '' : `content-type:${input.contentType}\n`;
    const canonicalHeaders = `${contentHeaders}host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${dateTime}\n`;
    const signedHeaders = `${input.contentType === undefined ? '' : 'content-type;'}host;x-amz-content-sha256;x-amz-date`;
    const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const scope = `${date}/auto/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${dateTime}\n${scope}\n${sha256(canonicalRequest)}`;
    const dateKey = hmac(`AWS4${this.config.secretAccessKey}`, date);
    const regionKey = hmac(dateKey, 'auto');
    const serviceKey = hmac(regionKey, 's3');
    const signingKey = hmac(serviceKey, 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const headers = Object.freeze({
      ...(input.contentType === undefined ? {} : { 'content-type': input.contentType }),
      authorization: `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': dateTime,
    });
    const controller = new AbortController();
    const cancel = (): void => controller.abort();
    input.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      return await this.transport({ method, url, headers, ...(method === 'PUT' ? { body } : {}), maximumResponseBytes: input.maximumResponseBytes, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('object_storage_')) throw error;
      throw new Error('object_storage_transport_failed');
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', cancel);
    }
  }

  async put(tenantId: string, bytes: Uint8Array, mimeType: string, signal?: AbortSignal): Promise<Readonly<{ artifactUri: string; sha256: string }>> {
    if (bytes.byteLength < 1 || bytes.byteLength > this.config.maximumObjectBytes || !/^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,63}$/u.test(mimeType)) throw new Error('object_storage_put_invalid');
    const digest = sha256(bytes);
    const key = this.key(tenantId, digest);
    this.budget.acquire('write', bytes.byteLength);
    const response = await this.request('PUT', key, { body: bytes, contentType: mimeType, maximumResponseBytes: 64 * 1024, ...(signal === undefined ? {} : { signal }) });
    if (response.status !== 200) throw new Error('object_storage_put_failed');
    return Object.freeze({ artifactUri: `artifact://generated/${tenantId}/${digest}`, sha256: `sha256:${digest}` });
  }

  async get(tenantId: string, digest: string, signal?: AbortSignal): Promise<Uint8Array> {
    const key = this.key(tenantId, digest);
    this.budget.acquire('read');
    const response = await this.request('GET', key, { maximumResponseBytes: this.config.maximumObjectBytes, ...(signal === undefined ? {} : { signal }) });
    if (response.status !== 200 || sha256(response.body) !== digest) throw new Error('object_storage_integrity_failed');
    return response.body;
  }

  async delete(tenantId: string, digest: string, signal?: AbortSignal): Promise<void> {
    const key = this.key(tenantId, digest);
    this.budget.acquire('delete');
    const response = await this.request('DELETE', key, { maximumResponseBytes: 64 * 1024, ...(signal === undefined ? {} : { signal }) });
    if (response.status !== 204 && response.status !== 200) throw new Error('object_storage_delete_failed');
  }

  forAiTenant(tenantId: string): AiArtifactStore {
    return Object.freeze({ put: ({ bytes, mimeType }: Readonly<{ bytes: Uint8Array; mimeType: string }>) => this.put(tenantId, bytes, mimeType) });
  }
}
